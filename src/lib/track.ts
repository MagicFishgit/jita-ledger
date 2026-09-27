/**
 * "Clears in", checked: what became of one prediction. Pure, shared with the cloud's `trackRecord`.
 */

/** Days after which a prediction nobody could settle is written off as late. */
export const TRACK_DAYS = 14;

export type Outcome = 'front' | 'void' | 'late';

/**
 * What became of a prediction made at `price`, from this round's judgement of the order (when the watch read its
 * book) and the stored order record:
 * - judged at another price: you moved it, so the prediction is void;
 * - judged and no longer beaten: it reached the front;
 * - not judged, and the record says closed: sold out means it reached the front on the way, anything left means
 *   cancelled or expired, which answers nothing;
 * - not judged while the record still says open: undecided. A sold-out order leaves the book within five
 *   minutes, but its record only says so after the next orders refresh; voiding it then would count every
 *   success as a void.
 * Undecided for longer than TRACK_DAYS is late.
 */
export function predictionOutcome(
  p: { price: number; at: number },
  judged: { price: number; beaten: boolean } | undefined,
  record: { state: string; volumeRemain: number } | undefined,
  now: number,
): Outcome | null {
  if (judged) {
    if (judged.price !== p.price) return 'void';
    if (!judged.beaten) return 'front';
  } else if (record && record.state !== 'open') {
    return record.volumeRemain === 0 ? 'front' : 'void';
  }
  return now - p.at > TRACK_DAYS * 86400_000 ? 'late' : null;
}
