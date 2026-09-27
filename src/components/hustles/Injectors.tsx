import { useCallback, useState } from 'react';
import { Syringe } from 'lucide-react';
import { rates } from '../../lib/fees';
import { iskBig, isk, pct, units } from '../../lib/format';
import { jitaBook, marketHistory, recentAverages, resolveIds } from '../../lib/market';
import { marketBest } from '../../lib/relist';
import { tickDown, tickUp } from '../../lib/tick';
import { useData } from '../../lib/store';
import { toast } from '../../lib/toast';
import { OpenInGame } from '../common';
import { cssVars, ItemIcon, NumChip, Th, Tip } from '../ui';
import { SkillPanel } from './SkillPanel';
import { INJECTOR_YIELD, SP_FLOOR, TRADE_SKILLS } from '../../lib/skills';

/**
 * Extractor to injector: the trade a station trader can do without leaving the station.
 *
 * Five hundred thousand skill points go into an extractor and come out as an injector, so the two
 * prices are tied together and the gap between them is a real, repeatable spread.
 */
const PAIR = ['Skill Extractor', 'Large Skill Injector'];
const SP_PER = 500_000;

type Side = { typeId: number; name: string; buy: number | null; sell: number | null; perDay: number | null };

export function Injectors() {
  const d = useData();
  const r = rates(d.settings);
  const [sides, setSides] = useState<Side[] | null>(null);
  const [qty, setQty] = useState<number | null>(10);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const found = (await resolveIds(PAIR)).inventory_types ?? [];
      const out = await Promise.all(PAIR.map(async (name) => {
        const typeId = found.find((x) => x.name === name)?.id;
        if (!typeId) return null;
        const [book, hist] = await Promise.all([jitaBook(typeId), marketHistory(typeId).catch(() => [])]);
        return { typeId, name, buy: marketBest(book.topBuys, true), sell: marketBest(book.topSells, false), perDay: recentAverages(hist, 7).avgVol } satisfies Side;
      }));
      setSides(out.filter((x): x is Side => !!x));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(false);
    }
  }, []);

  const ext = sides?.find((s) => s.name === 'Skill Extractor');
  const inj = sides?.find((s) => s.name === 'Large Skill Injector');
  const n = qty ?? 0;
  // Buying patiently means a buy order a tick above the best bid; selling patiently means listing a
  // tick under the best ask. Both carry a broker fee; only the sale is taxed.
  const buyAt = ext?.buy != null ? tickUp(ext.buy) : null;
  const sellAt = inj?.sell != null ? tickDown(inj.sell) : null;
  const perUnit = buyAt != null && sellAt != null ? sellAt * (1 - r.f - r.t) - buyAt * (1 + r.f) : null;
  // Taking both sides immediately: hit the ask to buy, hit the bid to sell. No broker fee either way.
  const nowUnit = ext?.sell != null && inj?.buy != null ? inj.buy * (1 - r.t) - ext.sell : null;
  const capital = buyAt != null ? buyAt * (1 + r.f) * n : null;
  // ESI reports total skill points directly; summing levels cannot, since a level's cost depends on rank.
  const totalSp = d.meta.totalSp ?? null;
  const c = (x: number | null) => ((x ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)');

  const figs = [
    { l: 'Listed both sides', v: perUnit == null ? '–' : isk(perUnit), n: 'Each, net of your fees', c: c(perUnit), tip: 'Buying with a buy order one tick above the best bid, and selling with a sell order one tick under the best ask.\n\n• Both carry a broker fee, and the sale is taxed.\n• The patient version, and it pays most.' },
    { l: 'Taken immediately', v: nowUnit == null ? '–' : isk(nowUnit), n: 'Each, no waiting', c: c(nowUnit), tip: 'Buying the extractor from the cheapest listing and selling the injector into the best standing bid. No broker fee either way, but you give up the spread.' },
    { l: `On ${units(n)}`, v: perUnit == null ? '–' : iskBig(perUnit * n), n: 'Patiently, if every one fills', c: c(perUnit) },
    { l: 'Capital needed', v: capital == null ? '–' : iskBig(capital), n: 'Tied up until the injectors sell' },
    { l: 'Return on it', v: perUnit != null && capital ? pct((perUnit * n) / capital, 1) : '–', n: 'Per round trip, not annualised', c: c(perUnit) },
    { l: 'Per skill point', v: perUnit == null ? '–' : `${(perUnit / SP_PER).toFixed(1)} ISK`, n: '500,000 points come out per extractor', c: c(perUnit), tip: 'What the spare skill points are actually worth: the number to judge this by.\n\n• Skill points are the scarce thing, not the ISK.\n• The extractor is just the container you buy to move them.' },
    { l: 'How busy', v: inj?.perDay ? `${units(Math.round(inj.perDay))}/day` : '–', n: 'Injectors traded at Jita' },
  ];

  return (
    <>
      <div className="intro-row">
        <p>An extractor pulls 500,000 skill points out of a character and becomes a large injector, so the two prices move together and the gap between them is a spread you can work without undocking. It is not free money: every injector you sell costs 500,000 skill points out of a character, so what this really prices is what your spare skill points are worth.</p>
        <button type="button" className="btn primary tall" disabled={busy} onClick={load}><Syringe aria-hidden="true" />{busy ? 'Pricing…' : sides ? 'Check again' : 'Price both'}</button>
      </div>
      {!sides ? (
        <div className="dashed-empty"><p>Nothing priced yet. Press <b style={{ color: 'var(--figure)' }}>Price both</b> to read the live Jita book for extractors and large injectors.</p></div>
      ) : (
        <div className="g-440" style={{ gap: 14, animation: 'rise .4s' }}>
          <div className="col" style={{ gap: 12 }}>
            <div style={{ border: '1px solid var(--line-3)' }}>
              <table className="tbl compact">
                <thead><tr><Th left>Item</Th><Th>Best buy</Th><Th>Best sell</Th><Th>Traded a day</Th><th scope="col" style={{ color: 'var(--faint-2)' }}>Actions</th></tr></thead>
                <tbody>
                  {sides.map((s) => (
                    <tr key={s.typeId} className="hover">
                      <td className="l"><span className="cellrow"><ItemIcon id={s.typeId} /><span className="name" style={{ fontWeight: 400, fontSize: 13 }}>{s.name}</span></span></td>
                      <td style={{ color: 'var(--bid-t)' }}>{s.buy == null ? '–' : isk(s.buy)}</td>
                      <td style={{ color: 'var(--neg-t)' }}>{s.sell == null ? '–' : isk(s.sell)}</td>
                      <td>{s.perDay == null ? '–' : units(Math.round(s.perDay))}</td>
                      <td><OpenInGame typeId={s.typeId} name={s.name} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div><NumChip id="inj-qty" label="How many" width={64} decimals={0} value={qty} onChange={setQty} tip="Each one is 500,000 skill points out of a character" /></div>
            <div className="mini-tiles">
              {figs.map((t) => (
                <div key={t.l} className="mini-tile" style={cssVars({ '--c': t.c })}>
                  <div className="tile-l">{t.l}{t.tip && <Tip text={t.tip} title={t.l} />}</div><div className="tile-v">{t.v}</div><div className="tile-n">{t.n}</div>
                </div>
              ))}
            </div>
            {perUnit != null && perUnit < 0 && <p style={{ fontSize: 12.5, color: 'var(--acc2)' }}>The spread does not cover your fees at the moment, so there is no trade here today. That happens often — it is a spread, not a subsidy.</p>}
          </div>
          <div className="sub-box" style={{ alignSelf: 'start' }}>
            <div className="panel-title">
              What an injector is worth to whoever buys it
              <Tip title="What an injector is worth" text={'An injector gives fewer skill points the more the buyer already has.\n\n• So the price doesn’t simply follow the point count.\n• The people paying most are the ones getting least.'} />
            </div>
            <div style={{ marginTop: 12, border: '1px solid var(--line-3)' }}>
              <table className="tbl compact">
                <thead><tr><Th left>Buyer’s skill points</Th><Th>Points one gives</Th><Th>ISK per point</Th></tr></thead>
                <tbody>
                  {INJECTOR_YIELD.map((t, i) => {
                    const from = i === 0 ? 0 : INJECTOR_YIELD[i - 1].upTo;
                    return (
                      <tr key={t.points}>
                        <td className="l" style={{ color: 'var(--cell)' }}>{Number.isFinite(t.upTo) ? `${units(from)} to ${units(t.upTo)}` : `Over ${units(from)}`}</td>
                        <td>{units(t.points)}</td>
                        <td style={{ color: 'var(--dim)' }}>{inj?.sell ? isk(inj.sell / t.points) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#9fb3c5', textWrap: 'pretty' }}>
              You cannot extract below {units(SP_FLOOR)} skill points, so the first {units(SP_FLOOR)} are not yours to sell.
              {totalSp != null && (totalSp > SP_FLOOR
                ? ` You have about ${units(Math.round(totalSp))} trained, which is ${units(Math.floor((totalSp - SP_FLOOR) / SP_PER))} extractions’ worth above the floor${perUnit != null ? ` — about ${iskBig(Math.floor((totalSp - SP_FLOOR) / SP_PER) * perUnit)} if you sold every one` : ''}. Whether that is a good idea is another matter: those points took time you cannot buy back.`
                : ` You have about ${units(Math.round(totalSp))} trained, which is below the floor, so there is nothing to extract yet.`)}
            </p>
          </div>
        </div>
      )}
      <SkillPanel title="Skills this wants" needs={TRADE_SKILLS}
        note="Nothing is needed to use an extractor or an injector. These are the trading skills that decide what the spread is worth once fees come off, and how many of these you can have working at once." />
    </>
  );
}
