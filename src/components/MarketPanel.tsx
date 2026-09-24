import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistRow, MarketSnap } from '../lib/types';
import { fmtDateTime, fmtShort, isk, iskAxis, timeTicks, units } from '../lib/format';
import { useThemeColors } from '../lib/hooks';
import { ChartTip } from './common';

export function MarketPanel(props: { name: string; snap: MarketSnap | null; hist: HistRow[]; loading: boolean; onRefresh: () => void }) {
  const c = useThemeColors();
  const { snap, hist } = props;
  const data = hist.slice(-90).map((h) => ({ t: Date.parse(h.date), average: h.average, volume: h.volume }));
  return (
    <section className="card" style={{ marginTop: 24 }} aria-label={`Jita market for ${props.name}`}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="section" style={{ margin: 0 }}>{props.name} in Jita 4-4</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {snap ? `Order book from ${fmtDateTime(snap.fetchedAt)}. ESI refreshes it every 5 minutes.` : 'Loading the order book…'}
          </p>
        </div>
        <button className="btn btn-small" onClick={props.onRefresh} disabled={props.loading}>{props.loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {snap && (
        <div className="book">
          <div>
            <h3>Buy orders ({units(snap.buyOrders)})</h3>
            <table><tbody>{snap.topBuys.map((l) => <tr key={l.price}><td>{isk(l.price)}</td><td>{units(l.volume)}</td></tr>)}</tbody></table>
            {!snap.topBuys.length && <p className="small muted">No buy orders in Jita 4-4.</p>}
          </div>
          <div>
            <h3>Sell orders ({units(snap.sellOrders)})</h3>
            <table><tbody>{snap.topSells.map((l) => <tr key={l.price}><td>{isk(l.price)}</td><td>{units(l.volume)}</td></tr>)}</tbody></table>
            {!snap.topSells.length && <p className="small muted">No sell orders in Jita 4-4.</p>}
          </div>
        </div>
      )}
      {data.length > 1 && (
        <div className="chart-block">
          <h3>Last 90 days in The Forge</h3>
          <p className="small muted">Daily average price and units traded. Most of The Forge’s volume is in Jita.</p>
          <div className="chart short">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={data.length ? timeTicks(data[0].t, data[data.length - 1].t, 7) : undefined} tickFormatter={fmtShort} stroke={c['--muted']} fontSize={13} />
                <YAxis yAxisId="price" tickFormatter={iskAxis} stroke={c['--muted']} fontSize={13} width={56} domain={['auto', 'auto']} />
                <YAxis yAxisId="vol" orientation="right" tickFormatter={iskAxis} stroke={c['--muted']} fontSize={13} width={48} />
                <Tooltip content={<ChartTip unitsKeys={['volume']} />} />
                <Bar yAxisId="vol" dataKey="volume" name="Units traded" fill={c['--seg-spread']} isAnimationActive={false} />
                <Line yAxisId="price" dataKey="average" name="Average price" stroke={c['--accent']} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
