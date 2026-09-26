import { getAuth, hasScope } from './auth';
import { ALERTS_LOCK, isAlertLeader } from './alertsRunner';
import { SCOPE } from './config';
import { openMarketWindow, resolveNames } from './market';
import { getData, update } from './store';
import { toast } from './toast';

/**
 * The link an alert mail puts beside each item: `#orders?market=ID`.
 *
 * EVE mail can't open a market window itself, but it can link to a web page, and the app can ask ESI to
 * open one. So the client hands the link to the browser, the app loads, and this opens the market. It
 * only ever acts on a link someone clicked.
 */

/** The type ID a market link asks for, or null. */
export function marketParam(query: URLSearchParams): number | null {
  const id = Number(query.get('market'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The page's address with the market request taken off, so a reload doesn't open it again. */
export function withoutMarket(path: string[], query: URLSearchParams): string {
  const q = new URLSearchParams(query);
  q.delete('market');
  const rest = q.toString();
  return `#/${path.join('/')}${rest ? `?${rest}` : ''}`;
}

async function nameOf(typeId: number): Promise<string> {
  const known = getData().names[typeId];
  if (known) return known;
  const got = await resolveNames([typeId]).catch(() => ({} as Record<number, string>));
  if (got[typeId]) update((d) => ({ names: { ...d.names, [typeId]: got[typeId] } }));
  return got[typeId] ?? `Item #${typeId}`;
}

/** Open the item's market in the client, and say what happened. */
export async function openFromLink(typeId: number): Promise<void> {
  const auth = getAuth();
  const name = await nameOf(typeId);
  if (!auth) { toast(`This browser isn’t logged in to Jita Ledger, so it can’t open the ${name} market in game. Log in, then click the link again.`, 'warn'); return; }
  if (!hasScope(SCOPE.ui)) { toast(`Opening a market in game needs the “Open a window in your client” permission. Log out and in again to grant it.`, 'warn'); return; }
  try {
    await openMarketWindow(typeId);
  } catch (e) {
    toast(`Couldn’t open the ${name} market: ${e instanceof Error ? e.message : String(e)}`, 'err');
    return;
  }
  // ESI answers the same whether or not the game is running, so this can't promise the window is there.
  toast(`Asked your client to open the ${name} market. It appears if the game is running as ${auth.characterName}.`);
  await closeIfSpare();
}

/**
 * Every click on a mail link opens a new tab. When another Jita Ledger tab is already open, this one has
 * done its job, so it closes itself rather than piling up. A browser only lets a page close a tab it
 * opened, or one with nothing to go back to, which is what a link opened from the game is; if it
 * refuses, say the tab can go.
 */
async function closeIfSpare(): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return;
  // Give this tab's own claim a moment to register, so "held by someone" means another tab.
  await new Promise((r) => setTimeout(r, 300));
  const q = await locks.query().catch(() => null);
  const elsewhere = !!q?.held?.some((l) => l.name === ALERTS_LOCK) && !isAlertLeader();
  if (!elsewhere) return;
  toast('Your other Jita Ledger tab is still open and watching, so this one closes in a few seconds.', 'info');
  await new Promise((r) => setTimeout(r, 4000));
  window.close();
  // Still here: the browser said no.
  setTimeout(() => toast('This tab couldn’t close itself. You can close it: your other Jita Ledger tab is still watching.', 'info'), 400);
}
