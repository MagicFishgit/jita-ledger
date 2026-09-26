import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { dismiss, TOAST_MS, useToasts, type ToastKind } from '../../lib/toast';

const LOOK: Record<ToastKind, { c: string; Icon: typeof Info }> = {
  ok: { c: 'var(--pos)', Icon: CircleCheck },
  info: { c: 'var(--acc)', Icon: Info },
  warn: { c: 'var(--acc2)', Icon: TriangleAlert },
  err: { c: 'var(--neg)', Icon: CircleAlert },
};

/** Bottom-right messages. Their size follows the alert size setting, capped to the viewport. */
export function Toasts({ size }: { size: number }) {
  const list = useToasts();
  const z = size || 1;
  const style = {
    ['--tw' as string]: `${Math.round(340 * Math.min(z, 1.6))}px`,
    ['--tf' as string]: `${(13 * z).toFixed(1)}px`,
    ['--ti' as string]: `${Math.round(17 * z)}px`,
    ['--tg' as string]: `${Math.round(12 * z)}px`,
    ['--tp' as string]: `${Math.round(12 * z)}px ${Math.round(14 * z)}px ${Math.round(14 * z)}px`,
    ['--tb' as string]: `${Math.max(2, Math.round(2 * z))}px`,
    ['--dur' as string]: `${(TOAST_MS - 100) / 1000}s`,
  };
  return (
    <div className="toasts" aria-live="polite" style={style}>
      {list.map((t) => {
        const { c, Icon } = LOOK[t.kind];
        return (
          <div key={t.id} className="toast" style={{ ['--c' as string]: c }} role={t.kind === 'err' ? 'alert' : 'status'}>
            <Icon aria-hidden="true" />
            <span className="tmsg">{t.text}</span>
            <button type="button" className="tclose" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X /></button>
            <div className="tbar" />
          </div>
        );
      })}
    </div>
  );
}
