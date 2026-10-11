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

type SnapshotFile = 'meta' | 'contracts' | 'items' | null;
const SNAPSHOT_FILES: Record<string, SnapshotFile> = { 'meta.json': 'meta', 'contracts.csv': 'contracts', 'contract_items.csv': 'items' };
const fileOf = (name: string): SnapshotFile => SNAPSHOT_FILES[name.slice(name.lastIndexOf('/') + 1)] ?? null;
const ITEM_EXCHANGE = new TextEncoder().encode('item_exchange'), TRUE = new TextEncoder().encode('true');
const MAX_FIELDS = 40;
const FILE_NAMES = { meta: 'meta.json', contracts: 'contracts.csv', items: 'contract_items.csv' } as const;
/**
 * Every column ContractSink reads, by file. A header without one, or with one past MAX_FIELDS, is refused: read anyway, the
 * column would read empty on every line and the snapshot would look like one with no contracts (the review of Task 14A: an
 * empty read counted every kept copy as sold).
 */
const NEEDED = {
  contracts: ['contract_id', 'type', 'region_id', 'price', 'date_issued', 'date_expired', 'station_id', 'start_location_id', 'issuer_id', 'title', 'for_corporation'],
  items: ['contract_id', 'type_id', 'is_included', 'is_blueprint_copy', 'item_id', 'material_efficiency', 'time_efficiency', 'runs', 'quantity'],
} as const;

/**
 * The region's blueprint-only contracts, read as the bzip2 decoder writes the tar a byte at a time (stage 3, correction 19): each
 * CSV line is split into fields where it lies, a contract kept only when it is a public item exchange of the region with a price,
 * its items only while every one is a blueprint given, and every copy of the region's item exchanges, a bundle with other items
 * included, noted with its seller (`copyIssuers`: what tells a reprice from a sale, correction 5). Nothing else is held: the
 * whole contracts and items files (39 MB on 11 October 2026) peaked near the Worker's 128 MB with the rest of a round. The same
 * contracts `blueprintContracts` reads from whole files (tested equal). Expiry is judged at `now`, else the snapshot's own time.
 */
export class ContractSink {
  at: string | null = null;
  readonly copyIssuers = new Map<number, number>();
  private opts: { region: number; now?: number; types?: ReadonlySet<number> };
  private header = new Uint8Array(512);
  private hpos = 0;
  private cur: { file: SnapshotFile; size: number; pos: number; left: number } | null = null;
  private done = new Set<SnapshotFile>();
  private meta: number[] = [];
  private line = new Uint8Array(4096);
  private llen = 0;
  private quoted = false;
  private cols: Map<string, number> | null = null;
  private bounds = new Int32Array(MAX_FIELDS * 2);
  /** How many fields the last line split into. */
  private fields = 0;
  private dec = new TextDecoder();
  private kept = new Map<number, BpContract>();
  /** The region's item exchanges dropped as comparables (an item asked for, or not a blueprint): their sellers, by contract. */
  private spoiled = new Map<number, number>();
  constructor(opts: { region: number; now?: number; types?: ReadonlySet<number> }) { this.opts = opts; }

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
      const file = fileOf(name);
      // Items are kept only for contracts already kept, so they must come after them (EVE Ref's order: meta, contracts, items).
      if (file === 'items' && !this.done.has('contracts')) throw new Error('EVE Ref’s snapshot lists its contracts’ items before its contracts');
      this.cur = { file, size, pos: 0, left: Math.ceil(size / 512) * 512 };
      this.cols = null; this.llen = 0; this.quoted = false;
      if (this.cur.left === 0) this.finish();
      return;
    }
    if (this.cur.pos < this.cur.size) {
      if (this.cur.file === 'meta') this.meta.push(b);
      else if (this.cur.file) {
        if (b === 0x22) this.quoted = !this.quoted;
        if (b === 0x0a && !this.quoted) this.endLine();
        else if (b !== 0x0d || this.quoted) {
          if (this.llen === this.line.length) { const n = new Uint8Array(this.line.length * 2); n.set(this.line); this.line = n; }
          this.line[this.llen++] = b;
        }
      }
    }
    this.cur.pos++;
    if (--this.cur.left === 0) this.finish();
  }

  /** The line's fields as [start, end) pairs (outer quotes still on), in `bounds`. */
  private split(): void {
    let n = 0, start = 0, q = false;
    for (let i = 0; i <= this.llen; i++) {
      const c = i < this.llen ? this.line[i] : 0x2c;
      if (c === 0x22) q = !q;
      else if (c === 0x2c && !q) { if (n < MAX_FIELDS) { this.bounds[2 * n] = start; this.bounds[2 * n + 1] = i; } n++; start = i + 1; }
    }
    // A field past this line's own reads empty, never what a longer line before it left (a line short of fields).
    const m = Math.min(n, MAX_FIELDS);
    for (let k = m; k < this.fields; k++) { this.bounds[2 * k] = 0; this.bounds[2 * k + 1] = 0; }
    this.fields = m;
  }
  private col(name: string): number { return this.cols?.get(name) ?? -1; }
  private range(k: number): [number, number] {
    let s = this.bounds[2 * k], e = this.bounds[2 * k + 1];
    if (e - s >= 2 && this.line[s] === 0x22 && this.line[e - 1] === 0x22) { s++; e--; }
    return [s, e];
  }
  private is(k: number, lit: Uint8Array): boolean {
    if (k < 0) return false;
    const [s, e] = this.range(k);
    if (e - s !== lit.length) return false;
    for (let i = 0; i < lit.length; i++) if (this.line[s + i] !== lit[i]) return false;
    return true;
  }
  private empty(k: number): boolean { if (k < 0) return true; const [s, e] = this.range(k); return e <= s; }
  /** A whole number read from the field's bytes, no string made; anything else through Number(); NaN when empty. */
  private int(k: number): number {
    if (k < 0) return NaN;
    const [s, e] = this.range(k);
    if (e <= s) return NaN;
    let v = 0, i = s;
    const neg = this.line[i] === 0x2d;
    if (neg) i++;
    for (; i < e; i++) { const c = this.line[i]; if (c < 0x30 || c > 0x39) return Number(this.str(k)); v = v * 10 + (c - 0x30); }
    return neg ? -v : v;
  }
  private str(k: number): string {
    if (k < 0) return '';
    const [s, e] = this.range(k);
    const t = this.dec.decode(this.line.subarray(s, e));
    return t.includes('""') ? t.replace(/""/g, '"') : t;
  }

  private endLine(): void {
    if (!this.llen) return;
    if (!this.cols) {
      this.cols = new Map(csvFields(this.dec.decode(this.line.subarray(0, this.llen))).map((c, i) => [c.trim(), i]));
      const file = this.cur!.file as 'contracts' | 'items';
      for (const name of NEEDED[file]) {
        const at = this.cols.get(name);
        if (at == null) throw new Error(`EVE Ref’s ${FILE_NAMES[file]} has no ${name} column`);
        if (at >= MAX_FIELDS) throw new Error(`EVE Ref’s ${FILE_NAMES[file]} puts ${name} past the ${MAX_FIELDS} columns read`);
      }
      this.llen = 0;
      return;
    }
    this.split();
    if (this.cur!.file === 'contracts') {
      if (this.is(this.col('type'), ITEM_EXCHANGE) && this.int(this.col('region_id')) === this.opts.region && !this.is(this.col('for_corporation'), TRUE)) {
        const price = Number(this.str(this.col('price')));
        if (price > 0) {
          const id = this.int(this.col('contract_id'));
          const station = this.int(this.col('station_id')) || this.int(this.col('start_location_id'));
          this.kept.set(id, { id, price, issued: this.str(this.col('date_issued')), expires: this.str(this.col('date_expired')), stationId: station > 0 ? station : null,
            issuer: this.int(this.col('issuer_id')), title: this.str(this.col('title')), items: [] });
        }
      }
      this.llen = 0;
      return;
    }
    const id = this.int(this.col('contract_id'));
    const c = this.kept.get(id);
    const issuer = c ? c.issuer : this.spoiled.get(id);
    if (issuer != null && this.is(this.col('is_blueprint_copy'), TRUE)) { const it = this.int(this.col('item_id')); if (it > 0) this.copyIssuers.set(it, issuer); }
    if (c) {
      const me = this.col('material_efficiency');
      // A contract asking for an item, or holding anything that isn't a blueprint (no ME), is no comparable: dropped whole.
      if (!this.is(this.col('is_included'), TRUE) || this.empty(me)) { this.kept.delete(id); this.spoiled.set(id, c.issuer); }
      else {
        const runs = this.col('runs'), te = this.col('time_efficiency'), itemId = this.int(this.col('item_id'));
        c.items.push({ typeId: this.int(this.col('type_id')), copy: this.is(this.col('is_blueprint_copy'), TRUE), me: this.int(me), te: this.empty(te) ? 0 : this.int(te),
          runs: this.empty(runs) ? null : this.int(runs), qty: Math.max(1, this.int(this.col('quantity')) || 1), itemId: itemId > 0 ? itemId : null });
      }
    }
    this.llen = 0;
  }

  private finish(): void {
    const file = this.cur!.file;
    if (file === 'contracts' || file === 'items') {
      this.endLine();
      if (!this.cols) throw new Error(`EVE Ref’s ${FILE_NAMES[file]} is empty`);
    }
    if (file === 'meta') { try { this.at = (JSON.parse(this.dec.decode(new Uint8Array(this.meta))) as { scrape_end?: string }).scrape_end ?? null; } catch { this.at = null; } this.meta = []; }
    if (file) this.done.add(file);
    this.cur = null;
    if (this.done.has('meta') && this.done.has('contracts') && this.done.has('items')) throw TAR_DONE;
  }

  /**
   * Throws unless meta, contracts and items were all read: an archive that ended before them, or a stream cut short, is no
   * snapshot, and read as one it would look like a snapshot with no contracts (the review of Task 14A).
   */
  private whole(): void {
    const lacking = (['meta', 'contracts', 'items'] as const).filter((f) => !this.done.has(f)).map((f) => FILE_NAMES[f]);
    if (lacking.length) throw new Error(`EVE Ref’s snapshot lacks ${lacking.length > 1 ? `${lacking.slice(0, -1).join(', ')} and ${lacking[lacking.length - 1]}` : lacking[0]}`);
  }

  /**
   * The contracts kept: blueprints only, not expired at `now` (else the snapshot's own time), holding one of `types` when asked;
   * and every copy's seller. Throws when the three files weren't all read.
   */
  result(): { contracts: BpContract[]; at: string | null; copyIssuers: ReadonlyMap<number, number> } {
    this.whole();
    const now = this.opts.now ?? (this.at ? Date.parse(this.at) : Date.now());
    const types = this.opts.types;
    const contracts = [...this.kept.values()].filter((c) => c.items.length && Date.parse(c.expires) > now && (!types || c.items.some((i) => types.has(i.typeId))));
    return { contracts, at: this.at, copyIssuers: this.copyIssuers };
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
