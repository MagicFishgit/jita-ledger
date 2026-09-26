import { useCallback, useState } from 'react';
import { rates } from '../../lib/fees';
import { iskBig, isk, pct, plainNum, units } from '../../lib/format';
import { jitaBook, marketHistory, recentAverages, resolveIds } from '../../lib/market';
import { marketBest } from '../../lib/relist';
import { tickDown, tickUp } from '../../lib/tick';
import { useData } from '../../lib/store';
import { Explain, OpenInGame } from '../common';
import { SkillPanel } from './SkillPanel';
import { INJECTOR_YIELD, SP_FLOOR, TRADE_SKILLS } from '../../lib/skills';

/**
 * Extractor to injector: the trade a station trader can do without leaving the station.
 *
 * Five hundred skill points go into an extractor and come out as an injector, so the two prices are
 * tied together and the gap between them is a real, repeatable spread. Both are among the most
 * heavily traded items in the game, which is what makes it a hustle rather than a gamble.
 */
const PAIR = ['Skill Extractor', 'Large Skill Injector'];

type Side = { typeId: number; name: string; buy: number | null; sell: number | null; perDay: number | null };

export function Injectors() {
  const d = useData();
  const r = rates(d.settings);
  const [sides, setSides] = useState<Side[] | null>(null);
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const ids = await resolveIds(PAIR);
      const found = ids.inventory_types ?? [];
      const out = await Promise.all(PAIR.map(async (name) => {
        const typeId = found.find((x) => x.name === name)?.id;
        if (!typeId) return null;
        const [book, hist] = await Promise.all([jitaBook(typeId), marketHistory(typeId).catch(() => [])]);
        return {
          typeId, name,
          buy: marketBest(book.topBuys, true),
          sell: marketBest(book.topSells, false),
          perDay: recentAverages(hist, 7).avgVol,
        } satisfies Side;
      }));
      setSides(out.filter((x): x is Side => !!x));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const ext = sides?.find((s) => s.name === 'Skill Extractor');
  const inj = sides?.find((s) => s.name === 'Large Skill Injector');

  // Buying patiently means placing a buy order a tick above the best bid; selling patiently means
  // listing a tick under the best ask. Both carry a broker fee; only the sale is taxed.
  const buyAt = ext?.buy != null ? tickUp(ext.buy) : null;
  const sellAt = inj?.sell != null ? tickDown(inj.sell) : null;
  const perUnit = buyAt != null && sellAt != null
    ? sellAt * (1 - r.f - r.t) - buyAt * (1 + r.f)
    : null;
  // Taking both sides immediately: hit the ask to buy, hit the bid to sell. No broker fee either way.
  const nowUnit = ext?.sell != null && inj?.buy != null ? inj.buy * (1 - r.t) - ext.sell : null;
  const capital = buyAt != null ? buyAt * (1 + r.f) * qty : null;
  // ESI reports total skill points directly. Adding up levels would not work: the points a level
  // costs depend on the skill's rank, which the skills endpoint doesn't carry.
  const totalSp = d.meta.totalSp ?? null;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <p className="small muted" style={{ margin: 0, maxWidth: '62ch' }}>
          An extractor pulls 500,000 skill points out of a character and becomes a large injector, so
          the two prices move together and the gap between them is a spread you can work without
          undocking. It is not free money and not an arbitrage: every injector you sell costs 500,000
          skill points out of a character, so what this really prices is what your spare skill points
          are worth. A character you have stopped training is the one to do it with.
        </p>
        <button className="btn btn-primary" disabled={busy} onClick={load}>
          {busy ? 'Pricing…' : sides ? 'Check again' : 'Price both'}
        </button>
      </div>

      {err && <p className="notice err" role="alert">{err}</p>}

      {!sides ? (
        <p className="empty">Nothing priced yet. Press <strong>Price both</strong> to read the live Jita book for extractors and large injectors.</p>
      ) : (
        <>
          <div className="table-wrap" style={{ marginBottom: 20 }}>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Item</th><th scope="col">Best buy</th><th scope="col">Best sell</th>
                  <th scope="col">Traded a day</th><th scope="col"><span className="opt">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sides.map((s) => (
                  <tr key={s.typeId}>
                    <td className="name">{s.name}</td>
                    <td>{s.buy == null ? <span className="muted">–</span> : isk(s.buy)}</td>
                    <td>{s.sell == null ? <span className="muted">–</span> : isk(s.sell)}</td>
                    <td>{s.perDay == null ? <span className="muted">–</span> : plainNum(Math.round(s.perDay))}</td>
                    <td><OpenInGame typeId={s.typeId} name={s.name} label="In game" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="fields">
              <div className="field">
                <label htmlFor="inj-qty">How many</label>
                <input
                  id="inj-qty" type="text" inputMode="numeric" value={plainNum(qty)}
                  onChange={(e) => { const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '')); setQty(Number.isFinite(n) ? n : 0); }}
                />
                <span className="hint">Each one is 500,000 skill points out of a character</span>
              </div>
            </div>
            <dl className="figures" style={{ marginTop: 14 }}>
              <div className="stat">
                <dt>
                  Listed both sides
                  <Explain term="Listed both sides">
                    Buy order one tick above the best bid, sell order one tick under the best ask. Both
                    carry a broker fee and the sale is taxed. This is the patient version and pays most.
                  </Explain>
                </dt>
                <dd className={(perUnit ?? 0) >= 0 ? 'pos' : 'neg'}>
                  {perUnit == null ? '–' : isk(perUnit)}
                  <small>Each, net of your fees</small>
                </dd>
              </div>
              <div className="stat">
                <dt>
                  Taken immediately
                  <Explain term="Taken immediately">
                    Buying the extractor from the cheapest listing and selling the injector into the
                    best standing bid. No broker fee either way, but you give up the spread. This is
                    not an arbitrage you can run on ISK alone — the 500,000 skill points come out of a
                    character, and that is the thing you are really selling.
                  </Explain>
                </dt>
                <dd className={(nowUnit ?? 0) >= 0 ? 'pos' : 'neg'}>
                  {nowUnit == null ? '–' : isk(nowUnit)}
                  <small>Each, no waiting</small>
                </dd>
              </div>
              <div className="stat">
                <dt>On {units(qty)}</dt>
                <dd className={(perUnit ?? 0) >= 0 ? 'pos' : 'neg'}>
                  {perUnit == null ? '–' : iskBig(perUnit * qty)}
                  <small>Patiently, if every one fills</small>
                </dd>
              </div>
              <div className="stat">
                <dt>Capital needed</dt>
                <dd>{capital == null ? '–' : iskBig(capital)}<small>Tied up until the injectors sell</small></dd>
              </div>
              <div className="stat">
                <dt>Return on it</dt>
                <dd className={(perUnit ?? 0) >= 0 ? 'pos' : 'neg'}>
                  {perUnit != null && capital ? pct((perUnit * qty) / capital, 1) : '–'}
                  <small>Per round trip, not annualised</small>
                </dd>
              </div>
              <div className="stat">
                <dt>
                  Per skill point
                  <Explain term="Per skill point">
                    What the spare skill points are actually worth, which is the number to judge this
                    by. Skill points are the scarce input, not the ISK — the extractor is just the
                    container you buy to move them.
                  </Explain>
                </dt>
                <dd className={(perUnit ?? 0) >= 0 ? 'pos' : 'neg'}>
                  {perUnit == null ? '–' : `${(perUnit / 500_000).toFixed(1)} ISK`}
                  <small>500,000 points come out per extractor</small>
                </dd>
              </div>
              <div className="stat">
                <dt>How busy</dt>
                <dd>
                  {inj?.perDay ? `${plainNum(Math.round(inj.perDay))}/day` : '–'}
                  <small>Injectors traded at Jita</small>
                </dd>
              </div>
            </dl>
            {perUnit != null && perUnit < 0 && (
              <p className="small muted" style={{ margin: '12px 0 0' }}>
                The spread does not cover your fees at the moment, so there is no trade here today.
                That happens often — it is a spread, not a subsidy.
              </p>
            )}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>
              What an injector is worth to whoever buys it
              <Explain term="What an injector is worth to whoever buys it">
                An injector gives fewer skill points the more the buyer already has. That is why the
                price does not simply track the point count, and why the market for them is steadier
                than you would expect — the people paying most are the ones getting least.
              </Explain>
            </h2>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th scope="col">Buyer’s skill points</th><th scope="col">Points one injector gives</th><th scope="col">ISK per point they pay</th></tr></thead>
                <tbody>
                  {INJECTOR_YIELD.map((t, i) => {
                    const from = i === 0 ? 0 : INJECTOR_YIELD[i - 1].upTo;
                    return (
                      <tr key={t.points}>
                        <td className="name">
                          {Number.isFinite(t.upTo) ? `${units(from)} to ${units(t.upTo)}` : `Over ${units(from)}`}
                        </td>
                        <td>{units(t.points)}</td>
                        <td>{inj?.sell ? isk(inj.sell / t.points) : <span className="muted">–</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              You cannot extract below {units(SP_FLOOR)} skill points, so the first {units(SP_FLOOR)} are
              not yours to sell.
              {totalSp != null && (
                totalSp > SP_FLOOR
                  ? <> You have about <strong>{units(Math.round(totalSp))}</strong> trained, which is{' '}
                    <strong className="pos">{units(Math.floor((totalSp - SP_FLOOR) / 500_000))}</strong> extractions’
                    worth above the floor{perUnit != null && <> — about {iskBig(Math.floor((totalSp - SP_FLOOR) / 500_000) * perUnit)} if you sold every one</>}.
                    Whether that is a good idea is another matter: those points took time you cannot buy back.</>
                  : <> You have about <strong>{units(Math.round(totalSp))}</strong> trained, which is below the
                    floor, so there is nothing to extract yet.</>
              )}
            </p>
          </div>
        </>
      )}

      <SkillPanel
        title="Skills this wants"
        needs={TRADE_SKILLS}
        note="Nothing is needed to use an extractor or an injector. These are the trading skills that decide what the spread is worth once fees come off, and how many of these you can have working at once."
      />
    </>
  );
}
