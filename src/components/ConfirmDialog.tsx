import { useEffect, useRef } from 'react';
import { answer, useConfirmState } from '../lib/confirm';

/**
 * The one dialog the app asks its questions through. Rendered once, near the root.
 *
 * <dialog>.showModal() brings the focus trap, Escape to dismiss, inertness of everything behind it
 * and the backdrop with it, so none of that has to be written or pulled in.
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

  return (
    <dialog
      className="confirm" ref={ref} aria-labelledby="confirm-title"
      onClick={(e) => { if (e.target === ref.current) answer(false); }}
    >
      {ask && (
        <div className="confirm-inner">
          <h2 id="confirm-title">{ask.title}</h2>
          {ask.body && <p>{ask.body}</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {/* Destructive questions open with Cancel focused, so a stray Enter cannot delete anything. */}
            <button className="btn" autoFocus={ask.danger} onClick={() => answer(false)}>Cancel</button>
            <button
              className={'btn ' + (ask.danger ? 'btn-danger' : 'btn-primary')}
              autoFocus={!ask.danger} onClick={() => answer(true)}
            >{ask.confirm ?? 'OK'}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
