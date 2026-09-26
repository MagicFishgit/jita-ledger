import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { dismiss, dismissAll, pauseToasts, resumeToasts, useToasts, type ToastKind } from '../../lib/toast';

const LOOK: Record<ToastKind, { c: string; Icon: typeof Info }> = {
  ok: { c: 'var(--pos)', Icon: CircleCheck },
  info: { c: 'var(--acc)', Icon: Info },
  warn: { c: 'var(--acc2)', Icon: TriangleAlert },
  err: { c: 'var(--neg)', Icon: CircleAlert },
};

/** How many waiting toasts show as cards peeking out behind the front one. */
const GHOSTS = 2;

/**
 * Bottom-right messages, one at a time. The front one is readable; the ones waiting sit behind it as
 * a stack, and the next comes forward when it goes. Size follows the alert size setting.
 */
export function Toasts({ size }: { size: number }) {
  const { list, lifeMs, paused } = useToasts();
  const z = size || 1;
  const style = {
    ['--tw' as string]: `${Math.round(340 * Math.min(z, 1.6))}px`,
    ['--tf' as string]: `${(13 * z).toFixed(1)}px`,
    ['--ti' as string]: `${Math.round(17 * z)}px`,
    ['--tg' as string]: `${Math.round(12 * z)}px`,
    ['--tp' as string]: `${Math.round(12 * z)}px ${Math.round(14 * z)}px ${Math.round(14 * z)}px`,
    ['--tb' as string]: `${Math.max(2, Math.round(2 * z))}px`,
    ['--dur' as string]: lifeMs == null ? '0s' : `${lifeMs / 1000}s`,
  };
  const front = list[0];
  const waiting = list.slice(1);
  return (
    <div className="toasts" aria-live="polite" style={style}>
      {waiting.length > 0 && (
        <div className="toast-more">
          <span>{waiting.length} more waiting</span>
          <button type="button" onClick={dismissAll}>Dismiss all</button>
        </div>
      )}
      {front && (
        <div
          className="toast-stack" onMouseLeave={resumeToasts}
          // Hold the clock only when the pointer actually moves onto it. A new alert appearing under a
          // pointer resting in the corner gets a synthetic hover with no movement, and would otherwise
          // stay paused until the mouse happened to move.
          onPointerMove={(e) => { if (e.movementX || e.movementY) pauseToasts(); }}
        >
          {waiting.slice(0, GHOSTS).map((t, i) => (
            <div key={t.id} className="toast ghost" aria-hidden="true" style={{ ['--c' as string]: LOOK[t.kind].c, ['--i' as string]: i + 1 }} />
          ))}
          {(() => {
            const { c, Icon } = LOOK[front.kind];
            return (
              <div key={front.id} className={'toast front' + (paused ? ' paused' : '')} style={{ ['--c' as string]: c }} role={front.kind === 'err' ? 'alert' : 'status'}>
                <Icon aria-hidden="true" />
                <span className="tmsg">{front.text}</span>
                <button type="button" className="tclose" aria-label={waiting.length ? 'Dismiss and show the next' : 'Dismiss'} onClick={() => dismiss(front.id)}><X /></button>
                {lifeMs != null && <div className="tbar" />}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
