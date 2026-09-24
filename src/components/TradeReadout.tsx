import type { Settings, TradeResult } from '../lib/fees';
import { isk, iskBig, iskBigSigned, iskSigned, pct, plainNum, units } from '../lib/format';
import { priceDown, priceUp } from '../lib/tick';
import { Explain } from './common';

/** Plain-English notes behind the "i" beside each figure. */
const T_FIG: Record<string, string> = {
  'Spread': 'The gap between your sell price and your buy price, as a share of the buy price, before any fees come out. It has to beat the fees to leave you anything \u2014 by more still if you plan to change your prices.',
  'Return on ISK spent': 'Your profit after every fee and tax, divided by what the buy side takes out of your wallet: the items, their broker fee, and any price changes you entered for the buy order. Counting those fees as money spent makes this read a little lower than profit measured against the item cost alone. It\u2019s the number checked against your target return in Settings.',
  'ISK you put in': 'What the buy order takes out of your wallet the moment you place it, before anything has been sold. You don\u2019t see the item money again until the items sell, and the broker fee never comes back at all.',
  'Break-even sell price': 'The sell price where you come out exactly level: it covers what you paid, both broker fees, the sales tax and any price changes you entered. Sell under this and you lose ISK, even though the price is above what you paid.',
  'Sell price': 'The lowest sell price that hits the target return you set in Settings. Change the target there and this moves with it.',
  'Highest buy price': 'The most you can pay per unit and still hit your target return. Pay more than this and the trade comes in under target.',
  'Share of daily volume': 'Your quantity measured against the Daily volume box. That figure is a 7-day average for the whole Forge region rather than Jita 4-4 alone, so treat it as a rough guide to how long you\u2019d wait to fill.',
  'Profit per unit as Omega': 'The same trade run again at the rates your Omega skill plan would give you: a lower broker fee, less sales tax and cheaper price changes. The difference is what Omega would add per unit, before you pay for Omega itself. It always uses that plan, even if you\u2019ve ticked the exact rates box in Settings.',
};

/** Plain-English notes behind the "i" beside each row of the money table. */
const T_ROW: Record<string, string> = {
  spread: 'The gap between your two prices, times the quantity: what the trade is worth before anything is charged for it. Every fee and tax below comes out of this, and what\u2019s left is your net profit.',
  bb: 'What the station charges you for placing the buy order: your broker fee rate applied to the whole order\u2019s value. You pay it up front, before you\u2019ve bought anything, which is why a trade starts out behind. It\u2019s never less than 100 ISK.',
  bs: 'The same charge again when you list the goods for sale, this time on the value of the sell order. You pay a broker fee twice because you place two orders: one to buy and one to sell.',
  tx: 'Taken out of the ISK as your sell order fills. It applies to the sale only \u2014 nothing is taxed when you buy \u2014 and there\u2019s no minimum, so it\u2019s a flat share of what you sell for. The Accounting skill cuts the rate, but only while you\u2019re Omega.',
  rl: 'What it costs to edit the price of an order you\u2019ve already placed, once for each change you entered. It\u2019s a cut-price version of the broker fee: half of it to start with, down to a fifth as you train Advanced Broker Relations, which is Omega only.',
  net: 'Your spread with the fees and tax above taken off \u2014 the ISK you actually keep once both orders have filled. If it\u2019s negative, the charges cost more than the gap between your prices.',
};

function volNote(share: number) {
  if (share <= 0.1) return 'Rough guide: a modest slice of the market';
  if (share <= 0.25) return 'Rough guide: a big slice, so expect slow fills';
  return 'Rough guide: likely several days to fill, or longer';
}

/** The target-return labels carry a live percentage, so match on the part that doesn't change. */
function figTip(label: string): string | undefined {
  return T_FIG[label] ?? T_FIG[Object.keys(T_FIG).find((k) => label.startsWith(k)) ?? ''];
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
      <p className="hl-sub">
        Net profit per unit, after broker fees and sales tax at your {s.override ? 'exact' : s.clone === 'alpha' ? 'Alpha' : 'Omega'} rates
        <Explain term="Net profit per unit">
          What one unit leaves you with after the fees and tax in the table below. It assumes both orders fill in full at the
          prices you typed. To weigh up items that cost very different amounts, look at return on ISK spent instead.
        </Explain>
      </p>
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
                <td><span className={`sw seg-${k}`} />{label}{T_ROW[k] && <Explain term={label}>{T_ROW[k]}</Explain>}</td>
                <td>{cost ? isk(-v / q) : isk(v / q)}</td>
                <td className="tot">{cost ? iskBig(-v) : iskBig(v)}</td>
              </tr>
            ))}
            <tr className="net">
              <td><span className="sw seg-profit" />Net profit<Explain term="Net profit">{T_ROW.net}</Explain></td>
              <td className={c.net >= 0 ? 'pos' : 'neg'}>{iskSigned(c.net / q)}</td>
              <td className={'tot ' + (c.net >= 0 ? 'pos' : 'neg')}>{iskBigSigned(c.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <dl className="figures">
        {figs.map(([label, value, note, cls]) => [
          <dt key={label + 't'}>
            {label}
            {figTip(label) && <Explain term={label}>{figTip(label)}</Explain>}
            {note && <span className="fig-note">{note}</span>}
          </dt>,
          <dd key={label + 'd'} className={cls}>{value}</dd>,
        ])}
      </dl>
    </section>
  );
}
