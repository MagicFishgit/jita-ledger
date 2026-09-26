import { navigate, type Route } from '../lib/hooks';
import { Abyssal } from './hustles/Abyssal';
import { Courier } from './hustles/Courier';
import { Planets } from './hustles/Planets';
import { Injectors } from './hustles/Injectors';

/**
 * Things to do with the hours between relists.
 *
 * Each one earns in a different currency of effort: abyssals want your attention, hauling wants a
 * safe route and a big hold, planets want nothing at all once they are running, and injectors want
 * only the capital you already have sitting in Jita.
 */
const TABS = [
  { key: 'abyssal', label: 'Abyssal', blurb: 'Filament costs and what your runs have really paid' },
  { key: 'courier', label: 'Hauling', blurb: 'Public courier contracts with the traps filtered out' },
  { key: 'planets', label: 'Planets', blurb: 'Where to put PI, and what it would bring in' },
  { key: 'injectors', label: 'Injectors', blurb: 'The extractor-to-injector spread, netted' },
] as const;

type Key = (typeof TABS)[number]['key'];

export function SideHustles({ route }: { route: Route }) {
  const sub = (TABS.find((t) => t.key === route.path[1])?.key ?? 'abyssal') as Key;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Side hustles</h1>
          <p>
            Ways to earn while your orders sit. Everything here is costed the same way the rest of the
            app costs a trade — live Jita prices, your own broker fee and sales tax — so the numbers
            can be compared against just buying and selling instead.
          </p>
        </div>
      </div>

      <nav className="subnav" aria-label="Side hustles">
        {TABS.map((t) => (
          <button
            key={t.key} type="button" className={'subtab' + (sub === t.key ? ' on' : '')}
            aria-current={sub === t.key ? 'page' : undefined}
            onClick={() => navigate(`hustles/${t.key}`)}
          >
            {t.label}
            <small>{t.blurb}</small>
          </button>
        ))}
      </nav>

      {sub === 'abyssal' ? <Abyssal />
        : sub === 'courier' ? <Courier />
        : sub === 'planets' ? <Planets />
        : <Injectors />}
    </div>
  );
}
