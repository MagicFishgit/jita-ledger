/**
 * The Forge's blueprint contracts, read from EVE Ref's public contract snapshot (docs.everef.net/datasets/
 * public-contracts: every region's public contracts from ESI, with their items' ME, TE and runs, twice an hour). ESI's
 * own contract list doesn't say what's in a contract, so pricing blueprints from it means ~20,000 item calls; the
 * snapshot has them all in one 6 MB file, which the cloud fetches when you press the button (the user wanted this on
 * demand, not a live scanner) and unpacks with bzip2 into a tar of CSVs. Pure: bytes in, contracts out.
 */

export type BpItem = {
  typeId: number;
  copy: boolean;
  me: number;
  te: number;
  /** Runs left on a copy; null for an original (the snapshot, like ESI, leaves it out). */
  runs: number | null;
  qty: number;
  /** Survives a relist, so a contract that vanished and whose item came back in another was repriced, not sold. */
  itemId: number | null;
};

export type BpContract = {
  id: number;
  price: number;
  issued: string;
  expires: string;
  stationId: number | null;
  issuer: number;
  title: string;
  items: BpItem[];
};

/** The files in a tar archive (ustar: 512-byte headers, the size in octal), by name. */
export function untar(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const text = (a: number, b: number) => { let s = ''; for (let i = a; i < b && bytes[i]; i++) s += String.fromCharCode(bytes[i]); return s; };
  let off = 0;
  while (off + 512 <= bytes.length) {
    const name = text(off, off + 100);
    if (!name) break;
    const size = parseInt(text(off + 124, off + 136).trim() || '0', 8);
    const prefix = text(off + 345, off + 500);
    out.set(prefix ? `${prefix}/${name}` : name, bytes.subarray(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** Thrown by `TarSink` once every file wanted is in, to stop the decoder early. */
export const TAR_DONE = new Error('tar: every file wanted is read');

/**
 * A tar archive written one byte at a time, as the bzip2 decoder writes, keeping only the files wanted, each in a
 * buffer of its exact size (known from its header), and throwing TAR_DONE once they're all in. The snapshot's own
 * files come first (meta, contracts 9.7 MB, items 27 MB) and its dogma files after (21 MB), so those are never decoded,
 * and nothing is held twice: growing one buffer for the whole 58 MB peaked near 320 MB, over a Worker's 128 MB.
 */
export class TarSink {
  files = new Map<string, Uint8Array>();
  private header = new Uint8Array(512);
  private hpos = 0;
  private cur: { name: string; buf: Uint8Array | null; size: number; pos: number; left: number } | null = null;
  private wanted: Set<string>;
  constructor(want: string[]) { this.wanted = new Set(want); }
  private done(): boolean { return [...this.wanted].every((w) => [...this.files.keys()].some((n) => n === w || n.endsWith(`/${w}`))); }
  writeByte(b: number): void {
    if (!this.cur) {
      this.header[this.hpos++] = b;
      if (this.hpos < 512) return;
      this.hpos = 0;
      let name = '';
      for (let i = 0; i < 100 && this.header[i]; i++) name += String.fromCharCode(this.header[i]);
      if (!name) throw TAR_DONE;
      let oct = '';
      for (let i = 124; i < 136 && this.header[i]; i++) oct += String.fromCharCode(this.header[i]);
      const size = parseInt(oct.trim() || '0', 8);
      const keep = [...this.wanted].some((w) => name === w || name.endsWith(`/${w}`));
      this.cur = { name, buf: keep ? new Uint8Array(size) : null, size, pos: 0, left: Math.ceil(size / 512) * 512 };
      if (this.cur.left === 0) this.finish();
      return;
    }
    if (this.cur.buf && this.cur.pos < this.cur.size) this.cur.buf[this.cur.pos] = b;
    this.cur.pos++;
    if (--this.cur.left === 0) this.finish();
  }
  private finish(): void {
    if (this.cur?.buf) this.files.set(this.cur.name, this.cur.buf);
    this.cur = null;
    if (this.done()) throw TAR_DONE;
  }
}

/**
 * Contracts in an older snapshot that are gone from the newer one before they'd have expired: the nearest thing to
 * "sold" the data has (the research, 26 to 29 September: those that vanished sat at the cheap end of their kind). One
 * whose items came back in a newer contract by the same issuer was repriced, not sold, and is left out; back by someone
 * else, it was bought and relisted, and counts. A seller cancelling and keeping it can't be told from a sale.
 */
export function vanishedSince(older: BpContract[], newer: BpContract[], now: number): BpContract[] {
  const live = new Set(newer.map((c) => c.id));
  const issuerOfItem = new Map<number, number>();
  for (const c of newer) for (const i of c.items) if (i.itemId != null) issuerOfItem.set(i.itemId, c.issuer);
  return older.filter((c) => !live.has(c.id) && Date.parse(c.expires) > now
    && !c.items.some((i) => i.itemId != null && issuerOfItem.get(i.itemId) === c.issuer));
}

/** A file in the archive by the end of its name ("contracts.csv"), wherever the archive put it. */
export function fileNamed(files: Map<string, Uint8Array>, end: string): Uint8Array | null {
  for (const [name, bytes] of files) if (name === end || name.endsWith(`/${end}`)) return bytes;
  return null;
}

/** One CSV line's fields: commas outside quotes split, a doubled quote inside quotes is one. */
export function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Each row of a CSV after its header, as a lookup by column name. Lines split on newlines outside quotes, working on
 * the bytes so a 27 MB file never becomes one string.
 */
export function eachCsvRow(bytes: Uint8Array, fn: (get: (col: string) => string) => void): void {
  const dec = new TextDecoder();
  let start = 0, quoted = false, cols: Map<string, number> | null = null;
  const line = (a: number, b: number) => {
    if (b <= a) return;
    const f = csvFields(dec.decode(bytes.subarray(a, b)));
    if (!cols) { cols = new Map(f.map((c, i) => [c.trim(), i])); return; }
    const c = cols;
    fn((col) => { const i = c.get(col); return i == null ? '' : f[i] ?? ''; });
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x22) quoted = !quoted;
    else if (b === 0x0a && !quoted) { line(start, i); start = i + 1; }
  }
  line(start, bytes.length);
}

/**
 * The region's contracts selling blueprints and nothing else: public item exchanges with a price, not yet expired, whose
 * items are all blueprints (an item with an ME is one) and all given (a contract asking for items in return is a trade,
 * and the classic scam shape, not a comparable). `types`, when given, keeps only contracts holding one of them.
 */
export function blueprintContracts(files: Map<string, Uint8Array>, opts: { region: number; now: number; types?: ReadonlySet<number> }): { contracts: BpContract[]; at: string | null } {
  const contractsCsv = fileNamed(files, 'contracts.csv'), itemsCsv = fileNamed(files, 'contract_items.csv');
  if (!contractsCsv || !itemsCsv) return { contracts: [], at: null };
  const kept = new Map<number, BpContract>();
  eachCsvRow(contractsCsv, (g) => {
    if (g('type') !== 'item_exchange' || Number(g('region_id')) !== opts.region) return;
    const price = Number(g('price')), expires = g('date_expired');
    if (!(price > 0) || !(Date.parse(expires) > opts.now) || g('for_corporation') === 'true') return;
    const id = Number(g('contract_id'));
    const station = Number(g('station_id') || g('start_location_id'));
    kept.set(id, { id, price, issued: g('date_issued'), expires, stationId: station > 0 ? station : null, issuer: Number(g('issuer_id')), title: g('title'), items: [] });
  });
  const spoiled = new Set<number>();
  eachCsvRow(itemsCsv, (g) => {
    const id = Number(g('contract_id'));
    const c = kept.get(id);
    if (!c || spoiled.has(id)) return;
    const me = g('material_efficiency');
    if (g('is_included') !== 'true' || me === '') { spoiled.add(id); return; }
    const runs = g('runs');
    const itemId = Number(g('item_id'));
    c.items.push({ typeId: Number(g('type_id')), copy: g('is_blueprint_copy') === 'true', me: Number(me), te: Number(g('time_efficiency') || 0), runs: runs === '' ? null : Number(runs), qty: Math.max(1, Number(g('quantity')) || 1), itemId: itemId > 0 ? itemId : null });
  });
  const contracts = [...kept.values()].filter((c) => c.items.length && !spoiled.has(c.id) && (!opts.types || c.items.some((i) => opts.types!.has(i.typeId))));
  let at: string | null = null;
  const meta = fileNamed(files, 'meta.json');
  if (meta) { try { at = (JSON.parse(new TextDecoder().decode(meta)) as { scrape_end?: string }).scrape_end ?? null; } catch { /* no time */ } }
  return { contracts, at };
}
