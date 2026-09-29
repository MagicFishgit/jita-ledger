import { Briefcase, ChartLine, Globe, Pickaxe, Tornado, Truck } from 'lucide-react';
import { navigate, type Route } from '../lib/hooks';
import { Abyssal } from './hustles/Abyssal';
import { Courier } from './hustles/Courier';
import { Planets } from './hustles/Planets';
import { Mining } from './hustles/Mining';
import { Freelance } from './hustles/Freelance';
import { Guide, PageHead } from './ui';

/**
 * Things to do with the hours between relists.
 *
 * Each one earns in a different currency of effort: abyssals want your attention, hauling wants a
 * safe route and a big hold, planets want nothing at all once they are running, and mining wants your time in a
 * belt and pays in ore.
 */
const TABS = [
  { key: 'abyssal', label: 'Abyssal', blurb: 'Filament costs and what your runs have really paid', icon: Tornado },
  { key: 'courier', label: 'Hauling', blurb: 'Public courier contracts with the traps filtered out', icon: Truck },
  { key: 'planets', label: 'Planets', blurb: 'Where to put PI, and what it would bring in', icon: Globe },
  { key: 'mining', label: 'Mining', blurb: 'What you mined, your ISK an hour, and the next step up', icon: Pickaxe },
  { key: 'freelance', label: 'Freelance', blurb: 'Jobs paying more for an item than Jita sells it for', icon: Briefcase },
] as const;

type Key = (typeof TABS)[number]['key'];

export function SideHustles({ route }: { route: Route }) {
  // Injectors was here until 29 September 2026: an old link lands on Mining, which replaced it.
  const asked = route.path[1] === 'injectors' ? 'mining' : route.path[1];
  const sub = (TABS.find((t) => t.key === asked)?.key ?? 'abyssal') as Key;

  return (
    <div className="page">
      <PageHead
        kicker="08 · Between relists" title="Side hustles" wide
        lede="Ways to earn while your orders sit. Everything is costed the way the rest of the app costs a trade — live Jita prices, your own broker fee and sales tax — so it compares against just buying and selling."
      />
      <nav className="htabs" aria-label="Side hustles" data-rv="">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="htab" aria-current={sub === t.key ? 'page' : undefined} onClick={() => navigate(`hustles/${t.key}`)}>
            <t.icon aria-hidden="true" />
            <span><span className="hl">{t.label}</span><span className="hb">{t.blurb}</span></span>
          </button>
        ))}
      </nav>
      <section className="panel" data-rv="" key={sub} style={{ padding: '18px 20px', gap: 16, animation: 'rise .38s cubic-bezier(.2,.8,.2,1)' }}>
        {sub === 'abyssal' ? <Abyssal /> : sub === 'courier' ? <Courier /> : sub === 'planets' ? <Planets /> : sub === 'freelance' ? <Freelance /> : <Mining />}
      </section>
      <Guide
        title="How to use Side hustles"
        intro="Ways to earn while your orders sit, all costed the same way as a trade so you can compare them fairly."
        steps={[
          { icon: Tornado, title: 'Abyssal', body: 'Filament costs are known; loot is not. The page measures what your own runs have paid from your wallet.' },
          { icon: Truck, title: 'Hauling', body: 'Keep Safe only on. Every hidden contract failed a check for a reason — the notes say which.' },
          { icon: Globe, title: 'Planets', body: 'Work down the steps. Choosing a system adds its tax, trip home and how many colonies fit.' },
          { icon: Pickaxe, title: 'Mining', body: 'Mine, and the cloud times your sessions. The ladder says what the next ship costs and how many hours of mining pay for it.' },
          { icon: Briefcase, title: 'Freelance', body: 'Buy in Jita what a job pays more for, haul it, deliver it. Accept the job in game first.' },
        ]}
        habits={[{ icon: ChartLine, title: 'Compare in Results', body: 'Results shows each hustle’s ISK per hour next to trading.' }]}
      />
    </div>
  );
}
