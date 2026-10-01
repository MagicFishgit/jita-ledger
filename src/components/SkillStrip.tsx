import { useEffect, useMemo, useState } from 'react';
import { SKILL_FALLBACK_IDS, type SkillKey } from '../lib/config';
import { fmtShort, iskBig, pct, units } from '../lib/format';
import { tradeSkillsComing, type Effect } from '../lib/skillQueue';
import { useSkillPayback } from './payback';
import { navigate, useNow } from '../lib/hooks';
import { skillDogma } from '../lib/market';
import { queueSaid, ROMAN, skillStatus, trainSaid, type SkillStatus, type Train } from '../lib/skillStatus';
import { useData } from '../lib/store';
import { trainingDays } from '../lib/training';
import { useSkillIds } from './hustles/SkillPanel';
import { useEnsureNames, useTypeName } from './common';
import { usePilot } from './pilot';
import { cssVars, Tip } from './ui';

/**
 * Your skills where a page uses them: each one's level as five pips (the level in training filling as it goes), what the
 * next level does on that page, and where it stands in your queue. The user asked for skills "under anything that can
 * use skills" once the app read the queue (29 September 2026). Levels come from the last sync; the queue moves them on
 * as it finishes, so a level done since reads as done.
 */

export { ROMAN, queueSaid };

/** Five pips: trained filled, the level training now filling, queued ones dashed, a page's wanted level tinted. */
export function SkillPips({ s, want }: { s: SkillStatus; want?: number }) {
  return (
    <span className="skill-pips" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => {
        const cls = n <= s.have ? 'on' : s.training?.level === n ? 'run' : s.queued.some((q) => q.level === n) ? 'q' : want && n <= want ? 'want' : '';
        return <i key={n} className={cls} style={cssVars({ '--n': n - 1, '--p': s.training?.level === n ? s.training.progress ?? 0 : 0 })} />;
      })}
    </span>
  );
}

const TONE: Record<ReturnType<typeof queueSaid>['tone'], string> = { run: 'var(--acc)', queued: 'var(--sec)', idle: 'var(--faint)', max: 'var(--pos)' };

/**
 * Training time for each skill, to `to` (a page's wanted level) or else its next level, with what stands in the way.
 * Prerequisites are read only for a skill not yet injected: injecting it needed them.
 */
export function useTrainTimes(items: { id: number | null; have: number; to?: number }[]): Record<number, Train> {
  const pilot = usePilot();
  const alpha = pilot.alpha;
  const attrs = pilot.attributes;
  const skills = pilot.skills, sp = pilot.skillSp;
  const key = items.map((x) => `${x.id}:${x.have}:${x.to ?? ''}`).join(',');
  const [out, setOut] = useState<Record<number, Train>>({});
  useEffect(() => {
    if (!skills) return;
    let alive = true;
    (async () => {
      const next: Record<number, Train> = {};
      for (const x of items) {
        if (x.id == null || x.have >= 5) continue;
        const to = Math.max(x.have + 1, Math.min(5, x.to ?? 0));
        const injected = skills[x.id] != null;
        const dg = await skillDogma(x.id).catch(() => null);
        next[x.id] = {
          to, injected,
          days: dg && attrs ? trainingDays(dg, attrs, sp?.[x.id] ?? 0, to, alpha) : null,
          needs: !injected && dg ? dg.req.filter(([id, lvl]) => (skills[id] ?? 0) < lvl).map(([id, level]) => ({ id, level })) : [],
        };
      }
      if (alive) setOut(next);
    })();
    return () => { alive = false; };
  }, [key, attrs, sp, skills, alpha]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

/** One skill on a page: its name (resolved to an ID unless given), what it does there, and what its next level would. */
export type SkillLine = { name: string; id?: number; what: string | ((have: number) => string); next?: (level: number) => string | null };

/**
 * A page's skills, one row each. Nothing shows until the skills have been read: a row of zeros would say "untrained"
 * about skills the app simply hasn't seen.
 */
export function SkillStrip({ title = 'Your skills here', lines, note }: { title?: string; lines: SkillLine[]; note?: string }) {
  const pilot = usePilot();
  const now = useNow(60_000);
  const byName = useSkillIds(lines.filter((l) => l.id == null).map((l) => l.name));
  const rows = useMemo(() => lines.map((l) => {
    const id = l.id ?? byName[l.name] ?? null;
    return { l, id, s: skillStatus(id, id != null ? pilot.skills?.[id] ?? 0 : 0, pilot.skillQueue, now) };
  }), [lines, byName, pilot.skills, pilot.skillQueue, now]);
  const train = useTrainTimes(rows.map((r) => ({ id: r.id, have: r.s.have })));
  const reqIds = Object.values(train).flatMap((t) => t.needs.map((n) => n.id));
  useEnsureNames(reqIds);
  const name = useTypeName();
  if (!pilot.skills) return null;
  return (
    <div className="skill-strip">
      <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
        <Tip title={title} text={'Read from your character on each sync, with your skill queue.\n\n• Filled pips are trained; the one filling is training now; dashed ones are queued.\n• “Takes” is the time to the next level from the points already in the skill, at your attributes.'} />
      </div>
      {rows.map(({ l, id, s }) => {
        const q = queueSaid(s, id != null ? train[id] : null, now, name);
        const nextLevel = s.training?.level ?? (s.have < 5 ? s.have + 1 : null);
        const next = nextLevel != null ? l.next?.(nextLevel) ?? null : null;
        return (
          <div key={l.name} className="skill-row">
            <span className="sk-head"><span className="sk-name">{l.name}</span><span className="sk-lvl">{ROMAN[s.have]}</span><SkillPips s={s} /></span>
            <span className="sk-q" style={{ color: TONE[q.tone] }}>{q.text}</span>
            <span className="sk-what">{typeof l.what === 'function' ? l.what(s.have) : l.what}{next ? <> <b>{ROMAN[nextLevel!]}: {next}</b></> : null}</span>
          </div>
        );
      })}
      {note && <p className="note small" style={{ margin: 0 }}>{note}</p>}
    </div>
  );
}

/** The trade skills' queue state, for Settings' level boxes: keyed like the settings (acc, br, trade…). */
export function useTradeQueue(): Partial<Record<SkillKey, { text: string; run: boolean; training: { level: number; progress: number } | null; queued: number[] }>> {
  const d = useData();
  const now = useNow(60_000);
  const s = d.settings;
  const ids = { ...SKILL_FALLBACK_IDS, ...d.meta.skillIds } as Record<SkillKey, number>;
  const keys = Object.keys(ids) as SkillKey[];
  const st = keys.map((k) => ({ k, id: ids[k], s: skillStatus(ids[k], s[k], d.meta.skillQueue, now) }));
  const train = useTrainTimes(st.map((x) => ({ id: x.id, have: x.s.have })));
  useEnsureNames(Object.values(train).flatMap((t) => t.needs.map((n) => n.id)));
  const name = useTypeName();
  if (!d.meta.skillQueue) return {};
  return Object.fromEntries(st.map(({ k, id, s: x }) => {
    const q = queueSaid(x, train[id], now, name);
    return [k, { text: q.tone === 'max' ? '' : q.text, run: q.tone === 'run', training: x.training ? { level: x.training.level, progress: x.training.progress } : null, queued: x.queued.map((z) => z.level) }];
  }));
}

const EFFECT_SAID: Record<Effect['what'], (e: Effect) => string> = {
  tax: (e) => `sales tax ${pct(e.before, 3)} → ${pct(e.after, 3)}`,
  broker: (e) => `broker fee ${pct(e.before, 2)} → ${pct(e.after, 2)}`,
  relist: (e) => `a price change ${pct(e.before, 2)} → ${pct(e.after, 2)}`,
  slots: (e) => `${units(e.before)} → ${units(e.after)} order slots`,
};

/**
 * One line on Orders (and List loot, slots only): the next trade skill your queue finishes and what it changes, or, with
 * none queued, the level worth most a day of training (Settings → Skills & slots works that out from your last 30 days).
 * Nothing when there's nothing to say.
 */
export function TradeSkillsLine({ slotsOnly = false }: { slotsOnly?: boolean }) {
  const d = useData();
  const now = useNow(60_000);
  const { rows, perDay } = useSkillPayback(d);
  const ids = { ...SKILL_FALLBACK_IDS, ...d.meta.skillIds } as Record<SkillKey, number>;
  const coming = tradeSkillsComing(d.meta.skillQueue ?? [], d.meta.skillIds ?? {}, d.settings, now)
    .map((c) => ({ ...c, effects: slotsOnly ? c.effects.filter((e) => e.what === 'slots') : c.effects }))
    .find((c) => c.effects.length);
  if (!d.skills) return null;
  if (coming) {
    const s = skillStatus(ids[coming.key], d.settings[coming.key], d.meta.skillQueue, now);
    const running = s.training?.level === coming.level;
    const when = running ? `in ${trainSaid(s.training!.finish - now)}` : coming.finish ? `done ${fmtShort(Date.parse(coming.finish))}` : 'while the queue is paused';
    return (
      <p className="skill-note" data-rv="">
        <SkillPips s={s} />
        <span><b>{coming.name} {ROMAN[coming.level]}</b> {running ? 'in training' : 'queued'}: {coming.effects.map((e) => EFFECT_SAID[e.what](e)).join(', ')}, {when}.</span>
      </p>
    );
  }
  if (slotsOnly) return null;
  const best = rows.find((x) => perDay(x) > 0);
  if (!best || best.gain == null || best.days == null) return null;
  const s = skillStatus(ids[best.key], best.cur, d.meta.skillQueue, now);
  return (
    <p className="skill-note" data-rv="">
      <SkillPips s={s} />
      <span>Worth training next: <b>{best.name} {ROMAN[best.next]}</b>, about <b>+{iskBig(best.gain)}</b> a month at your last 30 days’ trading, for {trainSaid(best.days * 86400_000)} of training. <button type="button" className="link-btn" onClick={() => navigate('settings/skills')}>Skills & slots</button></span>
    </p>
  );
}

/**
 * Skills a thing needs, each at a level (a ship to fly, a module to fit): your level against it, and where it stands in
 * your queue, or what's missing first. For the mining ladder's rungs.
 */
export function SkillNeeds({ needs }: { needs: { skill: number; level: number }[] }) {
  const pilot = usePilot();
  const now = useNow(60_000);
  const name = useTypeName();
  useEnsureNames(needs.map((n) => n.skill));
  const rows = needs.map((n) => ({ n, s: skillStatus(n.skill, pilot.skills?.[n.skill] ?? 0, pilot.skillQueue, now) }));
  const train = useTrainTimes(rows.map(({ n, s }) => ({ id: n.skill, have: s.have, to: n.level })));
  useEnsureNames(Object.values(train).flatMap((t) => t.needs.map((x) => x.id)));
  if (!pilot.skills) return null;
  return (
    <div className="skill-needs">
      {rows.map(({ n, s }) => {
        const met = s.have >= n.level;
        const q = queueSaid(s, train[n.skill], now, name);
        return (
          <div key={n.skill} className="skill-need">
            <span className="sk-name">{name(n.skill)} {ROMAN[n.level]}</span>
            <SkillPips s={s} want={n.level} />
            <span className="sk-q" style={{ color: met ? 'var(--pos)' : TONE[q.tone] }}>{met ? `Trained (${ROMAN[s.have]})` : q.text}</span>
          </div>
        );
      })}
    </div>
  );
}
