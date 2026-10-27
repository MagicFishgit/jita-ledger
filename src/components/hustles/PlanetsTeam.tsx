import type { AccountRef } from '../../lib/accounts';
import { units } from '../../lib/format';
import type { PiIndex } from '../../lib/piBundle';
import type { Role, Setup } from '../../lib/piPlan';
import { factoryCounts } from '../../lib/planetBoard';
import { dayCount } from '../../lib/split';
import { Tip } from '../ui';

/**
 * A factory character's own lines under its glance (docs/notes/planets-team.md): what it makes against each character repeating its own
 * fed factory (the feed row's repeat line), each character's part, each factory planet's load, when to convert the next planet (how many
 * P0 → P1 feeder planets fill one here), and what the others hand the factory character. Nothing here works anything out: it says the
 * setup's figures (piTeam.ts' `TeamFigures`).
 */

const aDay = (n: number) => dayCount(n);
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const daysSaid = (d: number) => (d >= 10 ? `${Math.round(d)} days` : `${+d.toFixed(1)} day${+d.toFixed(1) === 1 ? '' : 's'}`);

export function TeamLines({ s, feed, name, pname, who, accountOf, used, ix }: {
  s: Setup; feed: Setup | null; name: (id: number) => string; pname: (id: number) => string; who: (id: number) => string;
  accountOf: (charId: number) => AccountRef | null; used: Role[]; ix: PiIndex;
}) {
  const t = s.team!;
  const g = name(s.made!.id);
  const made = s.made!.perDay;
  // Against each character repeating its own fed factory: the feed row's repeat line, units held to no market, so n times one's. Where
  // there's nothing to set it against, "–" with why (never left out without a word).
  let vs: string;
  const r = feed?.repeat;
  const low = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const nobody = r ? r.chars.filter((c) => c.why).map((c) => `${who(c.charId)}: ${low(c.why!.replace(/\.$/, ''))}`) : [];
  if (!feed) vs = 'Against each of you repeating your own fed factory: – (the fed factory isn’t worked out here yet)';
  else if (feed.why != null) vs = `Against each of you repeating your own fed factory: – (the fed factory can’t run here: ${low(feed.why.replace(/\.$/, ''))})`;
  else if (!feed.made) vs = `Against each of you repeating your own fed factory: – (the fed factory makes no ${g} here)`;
  else if (!r) vs = 'Against each of you repeating your own fed factory: – (the fed factory has no repeat line here)';
  else if (r.n < 1) vs = `Against each of you repeating your own fed factory: – (it suits none of your characters${nobody.length ? `: ${nobody.slice(0, 3).join('; ')}${nobody.length > 3 ? '; …' : ''}` : ''})`;
  else {
    const together = feed.made.perDay * r.n;
    if (r.n === r.chars.length && r.n === s.perChar.length) {
      const d = made - together, pct = together > 0 ? Math.round((Math.abs(d) / together) * 100) : 0;
      vs = d >= 0.005 ? `+${aDay(d)} a day, ${pct}% more than each of you repeating your own fed factory (${aDay(together)} together, as its repeat line counts them)`
        : d <= -0.005 ? `${aDay(-d)} a day under each of you repeating your own fed factory (${aDay(together)} together), ${pct}% less`
          : `The same as each of you repeating your own fed factory (${aDay(together)} together)`;
    } else {
      const d = made - together;
      vs = `${d >= 0 ? '+' : '−'}${aDay(Math.abs(d))} a day against the fed factory repeated on the ${r.n === 1 ? 'one' : r.n} of your ${r.chars.length} characters it suits (${aDay(together)} a day); this counts ${s.perChar.length === 2 ? 'both' : `all ${s.perChar.length}`}, each at its own level and planets`;
    }
  }
  const anyAccount = s.perChar.some((p) => accountOf(p.charId));
  const lacksOf = (charId: number) => [...new Set(used.filter((x) => x.charId === charId && x.fit && !x.fit.fits && x.lacks).map((x) => x.lacks!))];
  // Full: what the factory planets' whole sets could make past what they make is under half of what one more feeder adds.
  const spare = t.factories.reduce((n, f) => n + f.setsHeld * t.setDay - f.perDay, 0);
  const full = spare < (t.fill && t.fill.feeders > 0 ? t.fill.perDay / t.fill.feeders : 1) / 2;
  const counts = (planetId: number, holds: number) => { const r = used.find((x) => x.planetId === planetId && x.does === 'factory'); return r ? factoryCounts(r, ix, null, holds) : null; };
  const factoryN = t.factories.length;
  return (
    <div className="col pl-lines" data-planets="team">
      <span className="pl-line" data-planets="team-vs">{vs}.<Tip title="Against each of you repeating your own" text={'The fed factory’s repeat line: each character doing planetary industry runs the shown character’s fed factory on its own planets (4 feeders and a factory planet, say), and what they make together.\n\n• Here every character’s colonies feed one character’s factory planets instead, so a character with a spare Water line tops up another’s short one.\n• Units held to no market on both sides, as Plan it counts them.'} /></span>
      {s.cut && <span className="pl-line pl-up" data-planets="team-bound">The best of the arrangements tried: no arrangement here makes more than {aDay(t.boundR)} {g} a day (the linear programme’s bound).</span>}
      <span className="lbl">Each character’s part</span>
      {t.parts.map((p) => {
        const acct = anyAccount ? accountOf(p.charId)?.name ?? 'account not set' : null;
        const own = p.charId === t.factoryChar;
        const feeders = own ? p.colonies - factoryN : p.colonies;
        const lacks = lacksOf(p.charId);
        return (
          <span key={p.charId} className="pl-line" data-planets={`team-part:${p.charId}`}>
            <b>{who(p.charId)}</b>{acct ? <span className="pl-type"> ({acct})</span> : null}: {own ? `${factoryN} factory planet${factoryN === 1 ? '' : 's'}${feeders ? ` and ${feeders} feeder${feeders === 1 ? '' : 's'}` : ''}` : `${feeders} feeder${feeders === 1 ? '' : 's'}`}
            {p.sends.length ? `, ${aDay(p.perDay)} ${g} a day’s worth of what ${own ? 'its own feeders send' : 'it hands over'} (${units(p.m3)} m³ a day: ${listSaid(p.sends.map((x) => `${aDay(x.perDay)} ${name(x.id)}`))})` : ''}
            {lacks.length ? `; to fit its planets as planned, train ${listSaid(lacks)}` : ''}.
          </span>
        );
      })}
      <span className="lbl">The factory planets</span>
      {t.factories.map((f) => {
        const c = counts(f.planetId, f.holds);
        const of = f.setsHeld * t.setDay;
        return (
          <span key={f.planetId} className="pl-line" data-planets={`team-load:${f.planetId}`}>
            <b>{pname(f.planetId)}</b>: {f.sets} of the {f.setsHeld} whole set{f.setsHeld === 1 ? '' : 's'} it holds{c ? ` (${c})` : ''}, {aDay(f.perDay)} {g} a day, {of > 0 ? Math.round((f.perDay / of) * 100) : 0}% of what its sets make.
            {f.days != null && ` What comes in a day (${units(f.intakeM3)} m³) fills its launchpad in ${daysSaid(f.days)}.`}
          </span>
        );
      })}
      {t.fill ? (
        <span className="pl-line" data-planets="team-fill">One factory planet here ({t.fill.holds} Advanced, {Math.round(t.fill.runs / t.setSize)} whole set{Math.round(t.fill.runs / t.setSize) === 1 ? '' : 's'} of {t.setSize}) is full at {aDay(t.fill.perDay)} {g} a day, fed by {t.fill.feeders} P0 → P1 feeder planets{t.fill.days != null ? `; its launchpad holds ${daysSaid(t.fill.days)} of what it takes in` : ''}.
          <Tip title="A full factory planet" text={'The factory planet holding the most whole sets here, at the factory character’s level, fed by as few P0 → P1 feeder planets as make what its sets can.\n\n• A set is one factory of the good and the Advanced that make what it takes of each P2, so each factory planet is balanced on its own.\n• Worked out at the level most of your feeding characters are at, on the rates Plan uses.'} /></span>
      ) : <span className="pl-line note" data-planets="team-fill">How many feeder planets fill one factory planet here isn’t worked out.</span>}
      <span className="pl-line" data-planets="team-convert">{t.convertAt != null ? `Convert another planet when these run full: at about ${t.convertAt} more feeder planet${t.convertAt === 1 ? '' : 's'}.`
        : full ? 'These run full: convert another planet when the next feeders come.'
          : 'Convert another planet when these run full: how many more feeder planets that takes isn’t worked out, since how many fill one factory planet here isn’t.'}</span>
      <span className="pl-line" data-planets="team-handed">{t.handedM3 > 0 ? `The others hand ${who(t.factoryChar)} ${units(t.handedM3)} m³ a day, in contracts docked: each exports from its own customs offices and ${who(t.factoryChar)} imports at its factory planets.` : `Nothing is handed between characters: ${who(t.factoryChar)}’s own feeders send all of it.`}</span>
    </div>
  );
}
