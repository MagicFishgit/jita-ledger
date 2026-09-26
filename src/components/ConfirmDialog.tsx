import { useEffect, useRef } from 'react';
import { CircleHelp, TriangleAlert } from 'lucide-react';
import { answer, useConfirmState } from '../lib/confirm';

/**
 * The one dialog the app asks its questions through. Rendered once, near the root.
 *
 * <dialog>.showModal() brings the focus trap, Escape to dismiss, inertness of everything behind it
 * and the backdrop with it, so none of that has to be written or pulled in. A destructive question
 * wears red, says it cannot be undone, and opens with Cancel focused so a stray Enter deletes nothing.
 */
export function ConfirmDialog() {
  const { ask } = useConfirmState();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (ask && !el.open) el.showModal();
    if (!ask && el.open) el.close();
  }, [ask]);

  // Escape, or a click on the backdrop, counts as declining.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => { e.preventDefault(); answer(false); };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  const danger = !!ask?.danger;
  return (
    <dialog
      className="confirm" ref={ref} aria-labelledby="confirm-title"
      onClick={(e) => { if (e.target === ref.current) answer(false); }}
    >
      {ask && (
        <div className={'dlg' + (danger ? ' danger' : '')} role="document">
          <div className="dlg-scan" />
          <div className="dlg-head">
            {danger ? <TriangleAlert aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}
            <span>{danger ? 'Cannot be undone' : 'Confirm'}</span>
          </div>
          <div className="dlg-body">
            <h2 id="confirm-title">{ask.title}</h2>
            {ask.body && <p>{ask.body}</p>}
            <div className="dlg-actions">
              <button type="button" className="no" autoFocus={danger} onClick={() => answer(false)}>Cancel</button>
              <button type="button" className="yes" autoFocus={!danger} onClick={() => answer(true)}>{ask.confirm ?? 'OK'}</button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
