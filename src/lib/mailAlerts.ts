import { getAuth, hasScope } from './auth';
import { alertMail, isStaleAlertMail, type Finding } from './alerts';
import { SCOPE } from './config';
import { esi, EsiError } from './esi';
import { getData, update } from './store';

/**
 * Alerts as EVE mail to yourself.
 *
 * A browser notification can be held back while a full-screen game is in front, and a web page can't
 * put anything inside the client. A mail can: it arrives in game with the client's own new-mail blink.
 * It only ever goes to the logged-in character, and old ones are deleted on the schedule set in
 * Settings, so the inbox doesn't fill with them.
 */

type MailHeader = { mail_id: number; from?: number; subject?: string; timestamp?: string };

const appUrl = () => location.origin + location.pathname;

export const canMail = () => !!getAuth() && hasScope(SCOPE.mailSend);

/** Send one mail holding every finding given. Returns the mail's ID. */
export async function sendAlertMail(findings: Finding[], test = false): Promise<number> {
  const auth = getAuth();
  if (!auth) throw new Error('Log in to send alert mail.');
  if (!hasScope(SCOPE.mailSend)) throw new Error('Sending EVE mail needs a permission this login doesn’t have. Log out and in again to grant it.');
  const { subject, body } = alertMail(findings, { appUrl: appUrl(), keepMin: getData().alerts.mailKeepMin, test });
  const { data: id } = await esi<number>(`/characters/${auth.characterId}/mail/`, {
    auth: true, method: 'POST',
    body: { approved_cost: 0, body, subject, recipients: [{ recipient_id: auth.characterId, recipient_type: 'character' }] },
  });
  update((d) => ({ meta: { ...d.meta, alertMails: [...(d.meta.alertMails ?? []), { id, at: new Date().toISOString(), char: auth.characterId }].slice(-500) } }));
  return id;
}

/** How many headers to look back through for old alert mails: 50 a page. */
const LOOK_BACK_PAGES = 6;

/**
 * Delete alert mails older than the setting, read or not. Returns how many went.
 *
 * With the read-mail scope it finds them by sender (you) and subject (starting "Jita Ledger:"), which
 * catches mails another browser sent. Without it, only the mails this browser recorded sending.
 */
export async function cleanupAlertMails(now = Date.now()): Promise<number> {
  const auth = getAuth();
  const keep = getData().alerts.mailKeepMin;
  if (!auth || keep == null || !hasScope(SCOPE.mailOrganize)) return 0;
  const me = auth.characterId;
  const stale = new Set<number>();
  // Only this character's: another's mail can't be deleted from here, and waits until they log in.
  for (const m of getData().meta.alertMails ?? []) if (m.char === me && now - Date.parse(m.at) > keep * 60_000) stale.add(m.id);
  const gone = new Set<number>();
  try {
    if (hasScope(SCOPE.mailRead)) {
      let last: number | undefined;
      for (let page = 0; page < LOOK_BACK_PAGES; page++) {
        const { data } = await esi<MailHeader[]>(`/characters/${me}/mail/`, { auth: true, query: { last_mail_id: last } });
        for (const m of data) if (isStaleAlertMail(m, me, keep, now)) stale.add(m.mail_id);
        if (data.length < 50) break;
        last = Math.min(...data.map((m) => m.mail_id));
      }
    }
    for (const id of stale) {
      try {
        await esi<void>(`/characters/${me}/mail/${id}/`, { auth: true, method: 'DELETE' });
        gone.add(id);
      } catch (e) {
        // Already deleted in game: nothing left to do, and nothing to keep trying.
        if (e instanceof EsiError && e.status === 404) gone.add(id);
        else throw e;
      }
    }
  } finally {
    // Stamped even on failure, so a lasting error is retried hourly rather than every few seconds; and
    // whatever did go is forgotten, so it isn't asked for again.
    update((d) => ({ meta: { ...d.meta, mailCleanAt: new Date(now).toISOString(), alertMails: (d.meta.alertMails ?? []).filter((m) => !gone.has(m.id)) } }));
  }
  return gone.size;
}
