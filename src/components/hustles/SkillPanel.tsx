import { useEffect, useMemo, useState } from 'react';
import { get, set } from 'idb-keyval';
import { hasScope } from '../../lib/auth';
import { SCOPE } from '../../lib/config';
import { byUrgency, check, readiness, skillsOf, trainedOptions, type Checked, type Need } from '../../lib/skills';
import { resolveIds } from '../../lib/market';
import { cacheStore, useData } from '../../lib/store';
import { cssVars, Tip } from '../ui';

const SKILLS_SCOPE = SCOPE.skills;
const CACHE = 'skill-ids';

/** Name to skill type ID, resolved once and kept: skills are not renamed often, but they are. */
export async function skillIds(names: string[]): Promise<Record<string, number>> {
  const cached = ((await get(CACHE, cacheStore).catch(() => undefined)) ?? {}) as Record<string, number>;
  const missing = names.filter((n) => !(n in cached));
  if (!missing.length) return cached;
  const r = await resolveIds(missing).catch(() => null);
  const next = { ...cached };
  for (const t of r?.inventory_types ?? []) next[t.name] = t.id;
  await set(CACHE, next, cacheStore).catch(() => undefined);
  return next;
}

/**
 * Skill name to type ID, resolved once and cached.
 *
 * Shared because the hauling page needs the same lookup for cargo bonuses, and resolving the same
 * names twice would be two round trips for one answer.
 */
export function useSkillIds(names: string[]): Record<string, number> {
  const [ids, setIds] = useState<Record<string, number>>({});
  const key = [...new Set(names)].sort().join(',');
  useEffect(() => {
    let alive = true;
    skillIds(key.split(',').filter(Boolean)).then((m) => { if (alive) setIds(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [key]);
  return ids;
}

/** EVE writes skill levels in Roman numerals, and so should we. */
const ROMAN = ['–', 'I', 'II', 'III', 'IV', 'V'];
const DOT: Record<Checked['status'], string> = { met: 'var(--pos)', partial: 'var(--acc2)', missing: 'var(--neg)', unknown: 'var(--faint)' };

export function SkillPanel({ title, needs, note }: { title: string; needs: Need[]; note?: string }) {
  const d = useData();
  const ids = useSkillIds(needs.flatMap(skillsOf));
  const canRead = hasScope(SKILLS_SCOPE);

  const checked = useMemo(
    () => needs.map((n) => check(n, (name) => ids[name] ?? null, d.skills)).sort(byUrgency),
    [needs, ids, d.skills],
  );
  const r = readiness(checked);
  const next = checked.find((c) => c.status !== 'met' && !c.optional);

  return (
    <div className="inset-box" style={{ padding: '14px 16px', background: 'rgba(2,7,12,.45)' }}>
      <div className="panel-title">
        {title}
        <Tip title={title} text="Read from your character, not a guess. Levels shown are what is worth having rather than the bare minimum to undock — the difference between the two is usually the difference between doing this once and doing it repeatedly." />
      </div>
      {!d.skills ? (
        <p className="note" style={{ margin: '6px 0 0' }}>
          {canRead ? 'No skills read yet. Press Sync at the top of the page and this fills in.' : 'Log in with the skills permission and this shows what you have trained against what each one needs.'}
        </p>
      ) : (
        <>
          <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#9fb3c5' }}>
            {r.core
              ? <><b className="pos">You have what this needs.</b> {r.met} of {r.of} including the optional ones.</>
              : next
                ? <>Trained {r.met} of {r.of}. The one that would help most next is <b style={{ color: 'var(--ink)' }}>{next.best && next.anyOf && next.have > 0 ? next.best.name : next.name} {ROMAN[next.level]}</b>
                  {next.have > 0 ? `, at ${ROMAN[next.have]} now.` : `, not trained at all${next.anyOf ? ' in any race' : ''}.`}</>
                : <>Trained {r.met} of {r.of}.</>}
          </p>
          <div className="tbl-scroll">
            <table className="tbl short" style={{ minWidth: 760, fontFamily: 'var(--f-body)', fontSize: 13 }}>
              <thead><tr><th className="l">Skill</th><th className="l">Want</th><th className="l">You</th><th className="l">Progress</th><th className="l">Why it matters</th></tr></thead>
              <tbody>
                {checked.map((c) => (
                  <tr key={c.name} style={{ opacity: c.status === 'met' ? 0.6 : 1 }}>
                    <td className="l wrap" style={{ paddingTop: 8, paddingBottom: 8 }}>
                      <span style={{ color: 'var(--ink)', display: 'block' }}>{c.name}</span>
                      {c.anyOf && <span className="sub" style={{ whiteSpace: 'normal' }}>{trainedOptions(c).length ? trainedOptions(c).map((o) => `${o.name.split(' ')[0]} ${ROMAN[o.have]}`).join(' · ') : `any of ${c.anyOf.length} races`}</span>}
                      {c.optional && <span className="sub">optional</span>}
                    </td>
                    <td className="l lbl" style={{ color: 'var(--dim)', fontSize: 12.5 }}>{ROMAN[c.level]}</td>
                    <td className="l lbl" style={{ color: DOT[c.status], fontSize: 12.5 }}>{c.status === 'unknown' ? '?' : ROMAN[c.have]}</td>
                    <td className="l">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOT[c.status], boxShadow: `0 0 6px ${DOT[c.status]}` }} aria-hidden="true" />
                        <span className="mini-lvl" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <i key={i} style={cssVars({ width: 14, '--bg2': i <= c.have ? 'var(--acc)' : i <= c.level ? 'color-mix(in oklab,var(--acc2) 30%,transparent)' : 'rgba(2,7,12,.7)', '--bd': i <= c.have ? 'var(--acc)' : i <= c.level ? 'var(--acc2)' : 'rgba(130,185,225,.2)' })} />
                          ))}
                        </span>
                        <span className="sr-only">{c.status === 'met' ? 'trained' : c.status === 'partial' ? 'partly trained' : c.status === 'missing' ? 'not trained' : 'unknown'}</span>
                      </span>
                    </td>
                    <td className="l wrap" style={{ fontSize: 12.5, color: 'var(--sec)', paddingTop: 8, paddingBottom: 8 }}>{c.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {note && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--label)', textWrap: 'pretty' }}>{note}</p>}
    </div>
  );
}
