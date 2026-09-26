import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Package, Search } from 'lucide-react';
import { navigate } from '../../lib/hooks';
import { useData } from '../../lib/store';
import { ALL_PAGES } from './nav';

type Entry = { key: string; label: string; sub: string; Icon: typeof Package; run: () => void };

/**
 * Ctrl K: jump to a page, or open an item you have dealt with in the calculator. Anything typed that
 * is not on the list can still be looked up by its exact name.
 */
export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Items you have actually traded, ordered, tracked or watched: the ones worth a shortcut.
  const items = useMemo(() => {
    const ids = new Set<number>();
    Object.values(d.txs).forEach((t) => ids.add(t.typeId));
    Object.values(d.orders).forEach((o) => ids.add(o.typeId));
    d.positions.forEach((p) => ids.add(p.typeId));
    d.watchlist.forEach((w) => ids.add(w.typeId));
    return [...ids].filter((id) => d.names[id]).map((id) => ({ id, name: d.names[id] })).sort((a, b) => a.name.localeCompare(b.name));
  }, [d.txs, d.orders, d.positions, d.watchlist, d.names]);

  const list = useMemo<Entry[]>(() => {
    const term = q.trim().toLowerCase();
    const pages: Entry[] = ALL_PAGES.map((p) => ({ key: 'p' + p.key, label: p.label, sub: 'Go to · ' + p.group, Icon: p.icon, run: () => navigate(p.key) }));
    const its: Entry[] = items.map((i) => ({ key: 'i' + i.id, label: i.name, sub: 'Open in calculator', Icon: Package, run: () => navigate(`calculator?type=${i.id}`) }));
    if (!term) return [...pages, ...its.slice(0, 4)].slice(0, 10);
    const hits = [...pages, ...its].filter((x) => x.label.toLowerCase().includes(term)).slice(0, 10);
    if (!its.some((x) => x.label.toLowerCase() === term)) {
      hits.push({ key: 'lookup', label: `Look up “${q.trim()}”`, sub: 'Exact name · calculator', Icon: Search, run: () => navigate(`calculator?name=${encodeURIComponent(q.trim())}`) });
    }
    return hits;
  }, [q, items]);

  if (!open) return null;
  const at = Math.min(sel, Math.max(0, list.length - 1));
  const run = (e: Entry) => { onClose(); e.run(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(list.length - 1, at + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(0, at - 1)); }
    else if (e.key === 'Enter' && list[at]) { e.preventDefault(); run(list[at]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="palette-veil" onClick={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Find an item or jump to a page" onClick={(e) => e.stopPropagation()}>
        <div className="palette-in">
          <Search aria-hidden="true" />
          <input
            ref={input} value={q} placeholder="Item name, or a page…" aria-label="Search"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={list[at] ? `pal-${list[at].key}` : undefined}
            onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list" id="palette-list" role="listbox">
          {list.map((x, i) => (
            <button
              key={x.key} id={`pal-${x.key}`} type="button" role="option" aria-selected={i === at} className="palette-row"
              onMouseEnter={() => setSel(i)} onClick={() => run(x)}
            >
              <x.Icon aria-hidden="true" />
              <span className="pl">{x.label}</span>
              <span className="ps">{x.sub}</span>
            </button>
          ))}
          {!list.length && <div className="palette-none">Nothing matches. Use the exact name from the game.</div>}
        </div>
      </div>
    </div>
  );
}
