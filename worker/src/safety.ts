/**
 * Asset safety in the cloud: each wrap of the ledger's items registered once, with when it was first seen, and a
 * mail when one is (alert kind `safety`). The game already says when things go into asset safety and when they're
 * delivered; the user asked for the mail to say instead that Jita Ledger has picked the wrap up. The cloud is the
 * one that can date a wrap, since it reads the assets every hour whether or not a browser is open.
 */
import type { Finding } from '../../src/lib/alerts';
import { safetyTimes, unpackCost } from '../../src/lib/assetSafety';
import type { SafetyWrap } from '../../src/lib/esiRecords';
import { sanitizeAlerts } from '../../src/lib/prefs';
import type { AlertConfig } from '../../src/lib/types';
import { mailFindings } from './alerts';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };

/** A wrap first seen within this long of the last tracked read went in since then, so its start is known. */
const TRACK_GAP_MS = 150 * 60_000;

export type Known = Map<number, Pick<SafetyWrap, 'firstSeen' | 'startKnown' | 'deliveredAt'>>;

/** Registers wraps not seen before, notes deliveries, forgets wraps that are gone, and marks this read. */
export async function registerSafety(db: D1Database, charId: number, wraps: SafetyWrap[], now = Date.now()): Promise<{ known: Known; fresh: SafetyWrap[] }> {
  const rows = (await db.prepare('SELECT wrap_id, first_seen, start_known, delivered_at FROM safety_seen WHERE char_id = ?1').bind(charId)
    .all<{ wrap_id: number; first_seen: number; start_known: number; delivered_at: number | null }>()).results;
  const mark = rows.find((r) => r.wrap_id === 0);
  const tracked = !!mark && now - mark.first_seen <= TRACK_GAP_MS;
  const byId = new Map(rows.filter((r) => r.wrap_id !== 0).map((r) => [r.wrap_id, r]));
  const iso = (t: number) => new Date(t).toISOString();
  const add = db.prepare('INSERT INTO safety_seen (char_id, wrap_id, first_seen, start_known, delivered_at) VALUES (?1, ?2, ?3, ?4, ?5)');
  const delivered = db.prepare('UPDATE safety_seen SET delivered_at = ?3 WHERE char_id = ?1 AND wrap_id = ?2');
  const stmts: D1PreparedStatement[] = [];
  const known: Known = new Map();
  const fresh: SafetyWrap[] = [];
  for (const w of wraps) {
    let r = byId.get(w.id);
    if (!r) {
      r = { wrap_id: w.id, first_seen: now, start_known: tracked ? 1 : 0, delivered_at: w.state === 'delivered' ? now : null };
      stmts.push(add.bind(charId, w.id, now, r.start_known, r.delivered_at));
      fresh.push(w);
    } else if (w.state === 'delivered' && r.delivered_at == null) {
      r.delivered_at = now;
      stmts.push(delivered.bind(charId, w.id, now));
    }
    known.set(w.id, { firstSeen: iso(r.first_seen), startKnown: !!r.start_known, ...(r.delivered_at != null ? { deliveredAt: iso(r.delivered_at) } : {}) });
  }
  // Unpacked (the wrap is gone): forgotten, so the table only holds what's still there.
  const here = new Set(wraps.map((w) => w.id));
  for (const id of byId.keys()) if (!here.has(id)) stmts.push(db.prepare('DELETE FROM safety_seen WHERE char_id = ?1 AND wrap_id = ?2').bind(charId, id));
  stmts.push(db.prepare(`INSERT INTO safety_seen (char_id, wrap_id, first_seen, start_known) VALUES (?1, 0, ?2, 1)
    ON CONFLICT(char_id, wrap_id) DO UPDATE SET first_seen = excluded.first_seen`).bind(charId, now));
  await db.batch(stmts);
  return { known, fresh: fresh.map((w) => ({ ...w, ...known.get(w.id) })) };
}

/** The mail for wraps just registered: what's in each, roughly what it's worth, and whether its countdown is known. */
export function safetyFindings(fresh: SafetyWrap[], price: (typeId: number) => number | undefined): Finding[] {
  return fresh.map((w) => {
    const cost = unpackCost(w.items, price);
    const t = safetyTimes(w);
    const name = w.name ?? 'A wrap of your items';
    const items = Object.values(w.items).reduce((n, q) => n + q, 0);
    return {
      kind: 'safety', key: `safety:${w.id}`, title: 'Asset safety registered', name,
      text: `${name}: ${items} items registered in asset safety${t.autoAt != null ? `, delivered around ${new Date(t.autoAt).toISOString().slice(0, 16).replace('T', ' ')} EVE` : '; set its countdown in the Wallet'}.`,
      safety: { name, items, kinds: Object.keys(w.items).length, value: cost.value, unpriced: cost.unpriced.length, autoFee: cost.auto, manualFee: cost.manual, autoAt: t.autoAt, manualAt: t.manualAt },
    };
  });
}

/** Mails the ledger about wraps just registered, through the same mail step as every alert. */
export async function mailSafety(env: Env, charId: number, findings: Finding[], now = Date.now()): Promise<number> {
  if (!findings.length) return 0;
  const hasSender = await env.DB.prepare(`SELECT 1 AS y FROM keys WHERE char_id = ?1 AND purpose = 'mailer'`).bind(charId).first();
  if (!hasSender) return 0;
  const row = await env.DB.prepare(`SELECT data FROM docs WHERE char_id = ?1 AND key = 'alerts'`).bind(charId).first<{ data: string }>();
  const cfg = sanitizeAlerts(row ? (JSON.parse(row.data) as Partial<AlertConfig>) : null);
  if (!cfg.on || !cfg.mail) return 0;
  return (await mailFindings(env, charId, findings, cfg, now)).mailed;
}
