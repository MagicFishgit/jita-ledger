import { useMemo } from 'react';
import { FlaskConical, MapPin, ScrollText, Store } from 'lucide-react';
import { iskBig, iskBigSigned, pct, units } from '../../lib/format';
import { navigate } from '../../lib/hooks';
import { MAX_SLOTS, slots, type Indexed } from '../../lib/industry';
import { beforeSaid, ladderOf, needBeyond, omegaSaid, paying, researchedRows, rowsOpened, rungCount, slotsPay, usable, type RungKey } from '../../lib/industryLadder';
import type { Graph } from '../../lib/jumps';
import { Points } from '../Facts';
import { SkillNeeds } from '../SkillStrip';
import { Tiles } from '../ui';
import { skillsWhy, type IndustryChar } from './industryChars';
import { useFinder, type Finder } from './industryFinder';
import { useIndustryDoc } from './industryMarket';

/**
 * Start (docs/notes/industry.md): the lead, where the shown character stands (its slots, its Jita fees, its clone), and,
 * from Task 7, the ladder of rungs from a first job to capitals. Nothing not read reads as a zero: an alt's skills not
 * read say so, and its fee is "–" until they are.
 */
export function IndustryStart({ c, ix, graph }: { c: IndustryChar; ix: Indexed; graph: Graph }) {
  // Not read is not level 0: an alt's skills not read, or a main whose first sync hasn't brought any, give no slots and no fee.
  const sk = c.pilot.skills && Object.keys(c.pilot.skills).length ? c.pilot.skills : undefined;
  const s = sk ? slots(ix, usable(sk, c.clone)) : null;
  const why = skillsWhy(c);
  const feeKnown = c.feeKnown;
  const feeSaid = c.isMain ? `sales tax ${pct(c.tax)}, as Settings has them`
    : c.standingsRead ? `sales tax ${pct(c.tax)}, at ${c.name}’s standings with Caldari State and Caldari Navy`
      : `sales tax ${pct(c.tax)}; standings not read: broker fee at no standing`;
  const [doc] = useIndustryDoc();
  const structure = doc.sites.find((x) => x.kind !== 'npc') ?? null;
  // Skills not read are never level 0: no verdicts, no counts, no prices, and the rungs' skills are listed bare.
  const lad = useMemo(() => ladderOf({ skills: sk ?? null, clone: c.clone, structureSite: !!structure }), [sk, c.clone, structure]);
  const finder = useFinder(c, ix, graph);
  const whose = c.isMain ? 'your' : `${c.name}’s`;
  const hereSaid = !sk ? `${why} Until then the ladder shows what each rung asks, and judges nothing.`
    : lad.here == null ? `Not on the first rung yet, by ${whose} skills: Industry I and Mass Production I start it.`
      : `You’re on rung ${lad.here + 1}, ${lad.rungs[lad.here].rung.title}, by ${whose} skills and the sites you’ve added. ${c.isMain ? 'Your' : `${c.name}’s`} blueprints and jobs aren’t read here yet.`;
  return (
    <section className="col" style={{ gap: 14 }} aria-label="Start" data-industry="start">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Industry turns materials into things that sell. You need a blueprint, a factory slot, and somewhere to build.</p>
        <Points compact items={[
          { kind: 'good', icon: ScrollText, lead: 'A blueprint original', text: 'builds for ever, and can be researched and copied.' },
          { kind: 'info', icon: Store, lead: 'What limits most items', text: 'is what the market takes, not your factory.' },
          { kind: 'info', icon: MapPin, lead: 'Nothing has to move', text: 'to null-sec to start: a high-sec NPC station near Jita will do.' },
        ]} />
      </div>
      <div data-industry="where">
        <Tiles min={200} items={[
          {
            l: 'Factory slots', v: s ? `${s.factory}` : '–', n: s ? `one job each; ${MAX_SLOTS} at most: 1, plus Mass Production and Advanced Mass Production` : why,
            tip: 'How many manufacturing jobs run at once.\n\n• One, plus one a level of Mass Production and of Advanced Mass Production.\n• Eleven at most (EVE University, "Industry skills").',
          },
          {
            l: 'Science slots', v: s ? `${s.science}` : '–', n: s ? `research, copying and invention, one job each; ${MAX_SLOTS} at most: 1, plus Laboratory Operation and Advanced Laboratory Operation` : why,
            tip: 'How many research, copying and invention jobs run at once.\n\n• One, plus one a level of Laboratory Operation and of Advanced Laboratory Operation.\n• Eleven at most.',
          },
          {
            l: 'Jita broker fee', v: feeKnown ? pct(c.broker) : '–', n: feeKnown ? feeSaid : why,
            tip: 'What a listing in Jita 4-4 costs to place, and what each sale pays in tax.\n\n• From Broker Relations and Accounting.\n• And the standings with Jita 4-4’s owners, Caldari State and Caldari Navy: raw, floored at 0, as the sync takes the main’s.\n• An alt’s are the cloud’s hourly read of it; not read yet, it pays as if it had none.',
          },
          {
            l: 'Clone', v: c.clone === 'alpha' ? 'Alpha' : c.clone === 'omega' ? 'Omega' : 'Not read',
            n: c.clone === 'alpha' ? 'Alpha can’t use Metallurgy, Research or Laboratory Operation: researching needs Omega'
              : c.clone === 'omega' ? 'every industry skill is open'
                : 'clone state not read: the 0.25% Alpha job tax is left out where it can’t be told',
          },
        ]} />
      </div>

      <div className="col" style={{ gap: 10 }}>
        <span className="lbl">From a first job to capitals</span>
        <p className="note small" style={{ margin: 0 }} data-industry="here">{hereSaid}</p>
        <ol className="ind-ladder" aria-label="From a first job to capitals" data-industry="ladder">
          {lad.rungs.map((v, i) => {
            const r = v.rung;
            const omega = omegaSaid(r, c.clone);
            const count = sk ? rungCount(ix, r.key, sk, c.clone) : null;
            return (
              <li key={r.key} className={`ind-rung ${v.state}`} data-rung={r.key}>
                <span className="ind-rung-n" aria-hidden="true">{i + 1}</span>
                <div className="col" style={{ gap: 8, minWidth: 0 }}>
                  <div className="ind-rung-head">
                    <b>{r.title}</b>
                    {v.state === 'here' && <span className="ind-rung-tag here">You’re here</span>}
                    {v.state !== 'here' && v.met === true && <span className="ind-rung-tag">{r.key === 'home' ? 'Site added' : 'Your skills cover it'}</span>}
                  </div>
                  <p className="note small" style={{ margin: 0 }}>{r.opens}</p>
                  {omega && <p className="ind-omega" style={{ margin: 0 }}>{omega}</p>}
                  {r.needs.length > 0 && (sk
                    ? <SkillNeeds needs={r.needs.map((n) => ({ skill: n.skill, level: n.level }))} beyond={(skill, level) => needBeyond(c.clone, skill, level)} />
                    : <p className="note small" style={{ margin: 0 }} data-rung-needs="bare">Asks for {r.needs.map((n) => `${n.name} ${ROMAN[n.level]}`).join(', ')}. {c.isMain ? 'Your' : `${c.name}’s`} levels aren’t read, so none is counted as trained.</p>)}
                  {count && <p className="note small" style={{ margin: 0 }}>{COUNT_SAID[r.key]?.(count.n, count.of)}</p>}
                  <RungPays k={r.key} c={c} ix={ix} f={finder} factory={s?.factory ?? null} structure={structure?.name ?? null} />
                  {r.key === 't2' && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('hustles/research')}><FlaskConical aria-hidden="true" />R&amp;D agents make datacores: the Research tab</button>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

/** Each rung's count of what it opens, at the shown character's skills raised to the rung's. */
const COUNT_SAID: Partial<Record<RungKey, (n: number, of: number) => string>> = {
  npc: (n, of) => `Builds ${units(n)} of the ${units(of)} Tech I items the finder ranks, at these skills.`,
  research: (n, of) => `Researches ${units(n)} of the ${units(of)} originals.`,
  copy: (n, of) => `Copies ${units(n)} of the ${units(of)} originals.`,
  t2: (n, of) => `Invents ${units(n)} of the ${units(of)} Tech II items with the sciences and encryption skills ${n ? 'already trained' : 'trained so far'}.`,
  capital: (n, of) => `Builds ${units(n)} of the ${units(of)} capital hulls.`,
};

/** What a rung pays now, from the finder's own rows at its site (useFinder), or why there's nothing to show. */
function RungPays({ k, c, ix, f, factory, structure }: { k: RungKey; c: IndustryChar; ix: Indexed; f: Finder; factory: number | null; structure: string | null }) {
  const name = (t: number) => ix.b.types[t]?.[0] ?? `Item #${t}`;
  const sk = c.pilot.skills && Object.keys(c.pilot.skills).length ? c.pilot.skills : undefined;
  if (k === 'copy') return <p className="note small" style={{ margin: 0 }}>Copies sell on contracts, which this tab doesn’t read yet: the finder prices what you build from them.</p>;
  if (k === 'home') return <p className="note small" style={{ margin: 0 }}>{structure ? `${structure}: its tax, rigs and broker fee are what you typed under Build’s Where you build.` : 'A structure’s tax, rigs and broker fee aren’t known until you dock: add your home under Build’s Where you build, and type them.'}</p>;
  if (k === 'capital') return <p className="note small" style={{ margin: 0 }}>Capitals sell on contracts, not the market, so the finder doesn’t price them.</p>;
  if (k === 't2') return null;
  if (!sk) return null;
  if (f.waiting) return <p className="note small" style={{ margin: 0 }} data-pays="waiting">{f.site ? f.waiting.text : 'Pick where you build first: add a site on the Build tab, under Where you build.'}</p>;
  if (!f.input || !f.rows.length) return <p className="note small" style={{ margin: 0 }} data-pays="working">Working out what pays…</p>;
  const at = f.site?.name ?? 'your build site';
  const opened = rowsOpened(ix, f.rows, k, sk, c.clone);
  // A figure that leaves something out says so, as the Build tab's rows do (an untyped facility tax or hub broker fee, an unread Alpha tax).
  const before = (rows: Parameters<typeof beforeSaid>[0]) => { const b = beforeSaid(rows, f.hub?.short); return b.length ? `, before ${b.join(' and ')}` : ''; };
  if (k === 'npc') {
    const pays = paying(opened);
    if (!pays.length) return <p className="note small" style={{ margin: 0 }} data-pays="none">Nothing it opens makes a profit at {at} today.</p>;
    const top = pays.slice(0, 3);
    return (
      <div className="col ind-pays" data-pays="rows">
        <span className="note small">Pays now at {at}, one slot a day, at ME {f.input.me} / TE {f.input.te}{before(top)}:</span>
        {top.map((r) => <div key={r.bp} className="ind-pay"><span>{name(r.product)}</span><b>{iskBigSigned(r.day!.profit)}</b></div>)}
      </div>
    );
  }
  if (k === 'research') {
    const best = researchedRows(f.input, opened);
    if (!best.length) return <p className="note small" style={{ margin: 0 }} data-pays="none">Nothing it opens makes a profit at ME 10 at {at} today.</p>;
    return (
      <div className="col ind-pays" data-pays="rows">
        <span className="note small">Researched to ME 10 / TE 20, one slot a day at {at}{before(best.map((x) => x.row))}:</span>
        {best.map((x) => <div key={x.row.bp} className="ind-pay"><span>{name(x.row.product)}{x.at0 != null && <span className="sub">{iskBigSigned(x.at10 - x.at0)} a day over ME 0</span>}</span><b>{iskBigSigned(x.at10)}</b></div>)}
      </div>
    );
  }
  // More slots: one item a slot, the best ones first.
  const all = slotsPay(opened, MAX_SLOTS);
  if (!all.items || factory == null) return <p className="note small" style={{ margin: 0 }} data-pays="none">Nothing it opens makes a profit at {at} today.</p>;
  const now = slotsPay(opened, factory);
  const lacks = beforeSaid(paying(opened).slice(0, MAX_SLOTS), f.hub?.short).join(' and ');
  const items = (n: number) => `${units(n)} item${n === 1 ? '' : 's'}`;
  return (
    <p className="note small" style={{ margin: 0 }} data-pays="slots">
      {c.isMain ? 'Your' : `${c.name}’s`} {units(factory)} factory slot{factory === 1 ? '' : 's'}: {now.items < factory
        ? `only ${items(now.items)} ${now.items === 1 ? 'pays' : 'pay'} at ${at} today, making ${iskBig(now.profit)} a day.`
        : `the best ${items(now.items)} at ${at} make ${iskBig(now.profit)} a day.`}
      {all.items > now.items && ` With ${MAX_SLOTS} slots, the best ${items(all.items)} make ${iskBig(all.profit)} a day.`}
      {lacks && ` These figures are before ${lacks}.`}
    </p>
  );
}
