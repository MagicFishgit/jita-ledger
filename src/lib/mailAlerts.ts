import { getAuth, getMailer, getMailerToken, hasScope, type Auth } from './auth';
import { alertMail, isStaleAlertMail, type Finding } from './alerts';
import { SCOPE } from './config';
import { esi, EsiError } from './esi';
import { getData, update } from './store';

/**
 * Alerts as EVE mail to your trading character.
 *
 * A browser notification can be held back while a full-screen game is in front, and a web page can't
 * put anything inside the client. A mail can, with one catch found by testing: mail a character sends
 * itself reaches its Inbox on the server at once, but the client isn't told and shows it only after
 * logging in again. So alerts are sent from a second character when one is set up, and arrive like any
 * other mail. Without one they are sent to yourself, and say so in Settings.
 *
 * Old ones are deleted on the schedule set in Settings, so the inbox doesn't fill with them.
 */

type MailHeader = { mail_id: number; from?: number; subject?: string; timestamp?: string };

const appUrl = () => location.origin + location.pathname;

/** The second character, when it can send and isn't the trading character itself. */
export function sender(): Auth | null {
  const m = getMailer();
  const me = getAuth();
  return m && me && m.characterId !== me.characterId && m.scopes.includes(SCOPE.mailSend) ? m : null;
}

export const canMail = () => !!getAuth() && (!!sender() || hasScope(SCOPE.mailSend));

/** Send one mail holding every finding given, to the trading character. Returns the mail's ID. */
export async function sendAlertMail(findings: Finding[], test = false): Promise<number> {
  const auth = getAuth();
  if (!auth) throw new Error('Log in to send alert mail.');
  const from = sender();
  if (!from && !hasScope(SCOPE.mailSend)) throw new Error('Sending EVE mail needs a permission this login doesn’t have. Log out and in again to grant it.');
  const fromId = from?.characterId ?? auth.characterId;
  const { subject, body } = alertMail(findings, { appUrl: appUrl(), keepMin: getData().alerts.mailKeepMin, test });
  // A sending character whose login has lapsed is dropped by the refresh; say what that means.
  const token = from ? async () => {
    try { return await getMailerToken(); } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 400 || status === 401) throw new Error(`${from.characterName}’s login has expired, so it can’t send. Log it in again under Settings → Alerts.`);
      throw e;
    }
  } : undefined;
  const { data: id } = await esi<number>(`/characters/${fromId}/mail/`, {
    auth: true, token, method: 'POST',
    body: { approved_cost: 0, body, subject, recipients: [{ recipient_id: auth.characterId, recipient_type: 'character' }] },
  });
  update((d) => ({ meta: { ...d.meta, alertMails: [...(d.meta.alertMails ?? []), { id, at: new Date().toISOString(), char: auth.characterId, from: fromId }].slice(-500) } }));
  return id;
}

/** How many headers to look back through for old alert mails: 50 a page. */
const LOOK_BACK_PAGES = 6;

/**
 * Delete alert mails older than the setting, read or not. Returns how many went.
 *
 * With the read-mail scope it finds them by sender (you, or your sending character) and subject
 * (starting "Jita Ledger:"), which catches mails another browser sent. Without it, only the mails this
 * browser recorded sending. A mail has one ID for everyone it touches, so the sending character's copy
 * in its Sent folder goes too, when it can: that side never holds up the trading character's inbox.
 */
export async function cleanupAlertMails(now = Date.now()): Promise<number> {
  const auth = getAuth();
  const keep = getData().alerts.mailKeepMin;
  if (!auth || keep == null || !hasScope(SCOPE.mailOrganize)) return 0;
  const me = auth.characterId;
  const alt = getMailer();
  const altId = alt && alt.characterId !== me ? alt.characterId : null;
  const senders = altId ? [me, altId] : [me];
  const stale = new Map<number, number | undefined>(); // mail ID → who sent it, when known
  // Only this character's: another's mail can't be deleted from here, and waits until they log in.
  for (const m of getData().meta.alertMails ?? []) if (m.char === me && now - Date.parse(m.at) > keep * 60_000) stale.set(m.id, m.from);
  const gone = new Set<number>();
  // A failed read still lets the recorded ones go; the failure is reported once they have.
  let readFailed: unknown = null;
  try {
    if (hasScope(SCOPE.mailRead)) {
      try {
        let last: number | undefined;
        for (let page = 0; page < LOOK_BACK_PAGES; page++) {
          const { data } = await esi<MailHeader[]>(`/characters/${me}/mail/`, { auth: true, query: { last_mail_id: last } });
          for (const m of data) if (isStaleAlertMail(m, senders, keep, now) && !stale.has(m.mail_id)) stale.set(m.mail_id, m.from);
          if (data.length < 50) break;
          last = Math.min(...data.map((m) => m.mail_id));
        }
      } catch (e) { readFailed = e; }
    }
    for (const [id, from] of stale) {
      try {
        await esi<void>(`/characters/${me}/mail/${id}/`, { auth: true, method: 'DELETE' });
        gone.add(id);
      } catch (e) {
        // Already deleted in game: nothing left to do, and nothing to keep trying.
        if (e instanceof EsiError && e.status === 404) gone.add(id);
        else throw e;
      }
      if (altId && from === altId && alt?.scopes.includes(SCOPE.mailOrganize)) {
        // The sender's copy. Best effort: a failure here leaves a line in the other character's Sent.
        await esi<void>(`/characters/${altId}/mail/${id}/`, { token: getMailerToken, method: 'DELETE' }).catch(() => undefined);
      }
    }
  } finally {
    // Stamped even on failure, so a lasting error is retried on its cadence rather than every few
    // seconds; and whatever did go is forgotten, so it isn't asked for again.
    update((d) => ({ meta: { ...d.meta, mailCleanAt: new Date(now).toISOString(), alertMails: (d.meta.alertMails ?? []).filter((m) => !gone.has(m.id)) } }));
  }
  if (readFailed) throw readFailed;
  return gone.size;
}
