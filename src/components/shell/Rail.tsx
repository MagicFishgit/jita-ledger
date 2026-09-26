import { useLayoutEffect, useRef, useState } from 'react';
import { Dna, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { navigate } from '../../lib/hooks';
import { effectiveSkills, orderSlots } from '../../lib/fees';
import { useData } from '../../lib/store';
import { NAV, type PageKey } from './nav';

/**
 * The side rail: brand, page groups, the sliding active bar, clone state and the collapse button.
 * Collapsed it keeps the icons, and every icon carries its page name for when the labels are gone.
 */
export function Rail({ page, open, onToggle, badges }: { page: PageKey; open: boolean; onToggle: () => void; badges: Partial<Record<PageKey, number>> }) {
  const d = useData();
  const nav = useRef<HTMLElement>(null);
  const [indY, setIndY] = useState(0);
  const alpha = d.settings.clone === 'alpha';
  const slots = orderSlots(effectiveSkills(d.settings));

  // The bar slides to wherever the active link actually sits, so it follows group headings and scroll.
  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>(`[data-key="${page}"]`);
    if (el) setIndY(el.offsetTop - 10);
  }, [page, open]);

  return (
    <aside className="rail" aria-label="Navigation">
      <div className="rail-brand">
        <div className="hexlogo" aria-hidden="true"><span>JL</span></div>
        <div className="fade-label">
          <div className="brand-name">JITA LEDGER</div>
          <div className="brand-sub">Station trading · 4-4</div>
        </div>
      </div>
      <nav className="rail-nav" aria-label="Main" ref={nav}>
        <div className="rail-ind" style={{ transform: `translateY(${indY}px)` }} aria-hidden="true" />
        {NAV.map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <div className="rail-group"><span className="fade-label">{g.label}</span></div>
            {g.items.map((n) => {
              const n2 = badges[n.key] ?? 0;
              return (
                <a
                  key={n.key} data-key={n.key} href={`#/${n.key}`} className="rail-link" title={n.label}
                  aria-current={page === n.key ? 'page' : undefined}
                  onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigate(n.key); }}
                >
                  <n.icon aria-hidden="true" />
                  <span className="rail-text fade-label">{n.label}</span>
                  {n2 > 0 && <span className="rail-badge" aria-label={`${n2} waiting`}>{n2 > 99 ? '99+' : n2}</span>}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="rail-foot">
        <a className="clone-chip" href="#/omega" onClick={(e) => { e.preventDefault(); navigate('omega'); }} title={`Clone state: ${alpha ? 'Alpha' : 'Omega'}, ${slots} order slots`}>
          <Dna aria-hidden="true" style={{ color: alpha ? 'var(--acc2)' : 'var(--acc)' }} />
          <div className="fade-label">
            <div className="clone-k">Clone state</div>
            <div className="clone-v" style={{ color: alpha ? 'var(--acc2)' : 'var(--acc)' }}>{alpha ? 'Alpha' : 'Omega'} · {slots} slots</div>
          </div>
        </a>
        <button type="button" className="rail-toggle" onClick={onToggle} aria-label={open ? 'Collapse navigation' : 'Expand navigation'} aria-expanded={open}>
          {open ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
          <span className="fade-label">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
