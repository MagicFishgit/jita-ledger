import { useEffect, useState } from 'react';
import { PLEX_TYPE } from '../lib/config';
import { jitaBook } from '../lib/market';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { monthOfOmega, plexPriceOf } from '../lib/iskPeriods';

/** The Global PLEX Market's lowest sell, kept in `meta.plex`. Read on mount when over 30 minutes old; `refresh` reads it now. */
export function usePlexPrice() {
  const d = useData();
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      const b = await jitaBook(PLEX_TYPE, true);
      update((x) => ({ meta: { ...x.meta, plex: { price: b.bestSell, buy: b.bestBuy, at: new Date().toISOString() } } }));
    } catch (e) {
      toast(`Couldn’t load the PLEX price: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const at = d.meta.plex?.at ? Date.parse(d.meta.plex.at) : 0;
    if (Date.now() - at > 30 * 60_000) refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const price = plexPriceOf(d.settings.plexPrice, d.meta.plex?.price);
  return { loading, refresh, price, monthCost: monthOfOmega(d.settings.plexPerMonth, price), read: d.meta.plex ?? null };
}
