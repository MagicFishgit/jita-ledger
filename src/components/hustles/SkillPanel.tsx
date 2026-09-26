import { useEffect, useMemo, useState } from 'react';
import { get, set } from 'idb-keyval';
import { hasScope } from '../../lib/auth';
import { SCOPES } from '../../lib/config';
import { byUrgency, check, readiness, type Checked, type Need } from '../../lib/skills';
import { resolveIds } from '../../lib/market';
import { cacheStore, useData } from '../../lib/store';
import { Explain } from '../common';

const SKILLS_SCOPE = SCOPES[2];
const CACHE = 'skill-ids';

/** Name to skill type ID, resolved once and kept: skills are not renamed often, but they are. */
async function skillIds(names: string[]): Promise<Record<string, number>> {
  const cached = ((await get(CACHE, cacheStore).catch(() => undefined)) ?? {}) as Record<string, number>;
  const missing = names.filter((n) => !(n in cached));
  if (!missing.length) return cached;
  const r = await resolveIds(missing).catch(() => null);
  const next = { ...cached };
  for (const t of r?.inventory_types ?? []) next[t.name] = t.id;
  await set(CACHE, next, cacheStore).catch(() => undefined);
  return next;
}

const DOT: Record<Checked['status'], string> = { met: 'met', partial: 'partial', missing: 'missing', unknown: 'unknown' };
/** EVE writes skill levels in Roman numerals, and so should we. */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** Five boxes, filled to the level trained, so a gap is visible without reading a number. */
function Levels({ have, want }: { have: number; want: number }) {
  return (
    <span className="lvl" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= have ? 'on' : i <= want ? 'want' : ''} />
      ))}
    </span>
  );
}

export function SkillPanel({ title, needs, note }: { title: string; needs: Need[]; note?: string }) {
  const d = useData();
  const [ids, setIds] = useState<Record<string, number>>({});
  const canRead = hasScope(SKILLS_SCOPE);

  useEffect(() => {
    let alive = true;
    skillIds(needs.map((n) => n.name)).then((m) => { if (alive) setIds(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [needs]);

  const checked = useMemo(
    () => needs.map((n) => check(n, ids[n.name] ?? null, d.skills)).sort(byUrgency),
    [needs, ids, d.skills],
  );
  const r = readiness(checked);
  const next = checked.find((c) => c.status !== 'met' && !c.optional);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>
        {title}
        <Explain term={title}>
          Read from your character, not a guess. Levels shown are what is worth having rather than the
          bare minimum to undock — the difference between the two is usually the difference between
          doing this once and doing it repeatedly.
        </Explain>
      </h2>

      {!d.skills ? (
        <p className="small muted" style={{ margin: 0 }}>
          {canRead
            ? 'No skills read yet. Press Sync at the top of the page and this fills in.'
            : 'Log in with the skills permission and this shows what you have trained against what each one needs.'}
        </p>
      ) : (
        <>
          <p className="small muted" style={{ margin: '0 0 12px' }}>
            {r.core
              ? <><strong className="pos">You have what this needs.</strong> {r.met} of {r.of} including the optional ones.</>
              : next
                ? <>Trained {r.met} of {r.of}. The one that would help most next is <strong>{next.name} {ROMAN[next.level]}</strong>{next.have > 0 ? `, at ${ROMAN[next.have]} now` : ', not trained at all'}.</>
                : <>Trained {r.met} of {r.of}.</>}
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Skill</th>
                  <th scope="col">Want</th>
                  <th scope="col">You</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {checked.map((c) => (
                  <tr key={c.name} className={c.status === 'met' ? 'muted' : ''}>
                    <td className="name">
                      {c.name}
                      {c.optional && <small className="sub">optional</small>}
                    </td>
                    <td>{ROMAN[c.level]}</td>
                    <td className={c.status === 'met' ? 'pos' : c.status === 'missing' ? 'neg' : ''}>
                      {c.status === 'unknown' ? <span className="muted">?</span> : c.have > 0 ? ROMAN[c.have] : '–'}
                    </td>
                    <td>
                      <span className={'dot ' + DOT[c.status]} aria-hidden="true" />
                      <Levels have={c.have} want={c.level} />
                      <span className="sr-only">
                        {c.status === 'met' ? 'trained' : c.status === 'partial' ? 'partly trained' : c.status === 'missing' ? 'not trained' : 'unknown'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'normal' }} className="small muted">{c.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {note && <p className="small muted" style={{ margin: '12px 0 0' }}>{note}</p>}
    </div>
  );
}
