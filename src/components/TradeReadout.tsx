import type { Settings, TradeResult } from '../lib/fees';
import { isk, iskBig, iskBigSigned, iskSigned, pct, plainNum, units } from '../lib/format';
import { priceDown, priceUp } from '../lib/tick';

function volNote(share: number) {
  if (share <= 0.1) return 'Rough guide: a modest slice of the market';
  if (share <= 0.25) return 'Rough guide: a big slice, so expect slow fills';
  return 'Rough guide: likely several days to fill, or longer';
}

export function TradeReadout({ c, s, asOmega }: { c: TradeResult; s: Settings; asOmega?: TradeResult | null }) {
  if (!c.ok) {
    return (
      <section aria-label="Result">
        <p className="hl-value">–</p>
        <p className="hl-sub">Enter a buy price, sell price and quantity to see what you’d make.</p>
      </section>
    );
  }
  const q = c.q;
  const per = c.net / q;
  const T = plainNum(s.target);
  const verdict = c.net < 0
    ? { cls: 'bad', text: 'Loses money' }
    : c.roi < s.target / 100
      ? { cls: 'thin', text: `Profitable, but under your ${T}% target` }
      : { cls: 'good', text: `Clears your ${T}% target` };

  const spreadU = c.spread / q, feesU = c.fees / q;
  const segs: [string, number][] = [['bb', c.brokerBuy / q], ['bs', c.brokerSell / q], ['tx', c.tax / q], ['rl', c.relist / q]];
  const max = Math.max(spreadU, feesU, 1e-9);
  const w = (x: number) => `${((Math.max(0, x) / max) * 100).toFixed(3)}%`;
  const profitU = spreadU - feesU;
  const start = Math.max(0, spreadU);

  const rows: [string, string, number, boolean][] = [
    ['spread', 'Spread', c.spread, false],
    ['bb', 'Broker fee, buy order', c.brokerBuy, true],
    ['bs', 'Broker fee, sell order', c.brokerSell, true],
    ['tx', 'Sales tax', c.tax, true],
  ];
  if (c.relist > 0) rows.push(['rl', 'Price change fees', c.relist, true]);

  const figs: [string, string, string?, string?][] = [
    ['Spread', pct(c.spreadPct)],
    ['Return on ISK spent', pct(c.roi), undefined, c.roi >= 0 ? 'pos' : 'neg'],
    ['ISK you put in', iskBig(c.cost + c.brokerBuy), 'Buy order plus its broker fee'],
    // Rounded onto EVE's four-significant-figure price grid, each way round so the rounded price still clears the mark.
    ['Break-even sell price', isk(priceUp(c.beSell)), 'At your buy price, rounded up to a price EVE accepts'],
    [`Sell price for a ${T}% return`, isk(priceUp(c.targetSell)), 'At your buy price, rounded up to a price EVE accepts'],
    [`Highest buy price for a ${T}% return`, isk(priceDown(c.maxBuy)), 'At your sell price, rounded down to a price EVE accepts'],
  ];
  if (Number.isFinite(c.volShare)) figs.push(['Share of daily volume', pct(c.volShare, 1), volNote(c.volShare)]);
  if (asOmega?.ok) {
    const o = asOmega.net / q;
    figs.push(['Profit per unit as Omega', iskSigned(o), `With your skill plan from the Omega page: ${iskSigned(o - per)} per unit`, o >= 0 ? 'pos' : 'neg']);
  }

  return (
    <section aria-label="Result">
      <p className={'hl-value ' + (c.net >= 0 ? 'pos' : 'neg')}>{iskSigned(per)}</p>
      <p className="hl-sub">Net profit per unit, after broker fees and sales tax at your {s.override ? 'exact' : s.clone === 'alpha' ? 'Alpha' : 'Omega'} rates</p>
      {q > 1 && <p className="hl-total">Total for {units(q)} units: {iskBigSigned(c.net)}</p>}
      <p className={'verdict ' + verdict.cls}>{verdict.text}</p>

      <div className="bars" aria-hidden="true">
        <div className="bar-labels"><span>Spread</span><span>Fees and tax</span></div>
        <div className="tracks">
          <div className="track">{spreadU > 0 && <span className="seg seg-spread" style={{ width: w(spreadU) }} />}</div>
          <div className="track">
            {segs.filter(([, v]) => v > 0).map(([k, v]) => <span key={k} className={`seg seg-${k}`} style={{ width: w(v) }} />)}
            {profitU > 0
              ? <span className="seg seg-profit" style={{ width: w(profitU) }} />
              : <span className="overshoot" style={{ left: w(start), width: w(feesU - start) }} />}
          </div>
          <span className="marker" style={{ left: w(start) }} />
        </div>
      </div>
      <p className="bar-note">
        {c.spread <= 0
          ? 'Your sell price isn’t above your buy price, so the fees are all loss.'
          : c.net >= 0
            ? `Fees and tax take ${pct(c.fees / c.spread, 0)} of your spread. The green part is yours.`
            : `Fees and tax are ${isk((c.fees - c.spread) / q)} per unit more than your spread.`}
      </p>

      <div className="table-wrap">
        <table className={'data' + (q === 1 ? ' single' : '')} style={{ marginTop: 18 }}>
          <thead><tr><th scope="col">Per trade</th><th scope="col">Per unit</th><th scope="col" className="tot">For {units(q)} units</th></tr></thead>
          <tbody>
            {rows.map(([k, label, v, cost]) => (
              <tr key={k}>
                <td><span className={`sw seg-${k}`} />{label}</td>
                <td>{cost ? isk(-v / q) : isk(v / q)}</td>
                <td className="tot">{cost ? iskBig(-v) : iskBig(v)}</td>
              </tr>
            ))}
            <tr className="net">
              <td><span className="sw seg-profit" />Net profit</td>
              <td className={c.net >= 0 ? 'pos' : 'neg'}>{iskSigned(c.net / q)}</td>
              <td className={'tot ' + (c.net >= 0 ? 'pos' : 'neg')}>{iskBigSigned(c.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <dl className="figures">
        {figs.map(([label, value, note, cls]) => [
          <dt key={label + 't'}>{label}{note && <span className="fig-note">{note}</span>}</dt>,
          <dd key={label + 'd'} className={cls}>{value}</dd>,
        ])}
      </dl>
    </section>
  );
}
