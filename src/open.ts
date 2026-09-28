/**
 * The page an alert mail's item link opens (`open.html?market=ID~Name`): it asks ESI to open that item's market in
 * the game client, says so, and closes itself after a three-second countdown. It carries only the login and the ESI
 * call, not the app: the link used to load the whole app, with its animations, for one request, and close again five
 * seconds later. The user asked for exactly this. Links in older mails (`#orders?market=ID`) still go through the app.
 *
 * A browser lets a page close a tab only if a script opened it or it has nothing to go back to, which is what a
 * link opened from the game is. If it refuses, the page says the tab can be closed. Anything that goes wrong keeps
 * the tab open and says why.
 */
import { getAuth, hasScope } from './lib/auth';
import { isOwner, SCOPE } from './lib/config';
import { esi } from './lib/esi';
import { parseMarket } from './lib/openLink';

const COUNT_FROM = 3;
const el = (id: string) => document.getElementById(id)!;

function show(kind: 'ok' | 'err' | null, title: string, detail = '', note = '') {
  el('box').className = kind ?? '';
  el('title').textContent = title;
  el('detail').textContent = detail;
  el('note').textContent = note;
}

async function nameOf(typeId: number, given: string | null): Promise<string> {
  if (given) return given;
  try { return (await esi<{ name: string }>(`/universe/types/${typeId}/`)).data.name; } catch { return `item #${typeId}`; }
}

function countdown(onDone: () => void) {
  const count = el('count'), keep = el('keep');
  let left = COUNT_FROM;
  count.hidden = false; keep.hidden = false;
  count.textContent = `This tab closes in ${left}`;
  const t = setInterval(() => {
    left--;
    if (left > 0) { count.textContent = `This tab closes in ${left}`; return; }
    clearInterval(t);
    onDone();
  }, 1000);
  keep.addEventListener('click', () => { clearInterval(t); count.textContent = 'Staying open.'; keep.hidden = true; });
}

async function run() {
  const want = parseMarket(new URLSearchParams(location.search).get('market'));
  // Once read, the request comes off the address: a reload shouldn't open the market again.
  history.replaceState(null, '', location.pathname);
  if (!want) { show(null, 'Nothing to open', 'This page opens an item’s market in EVE from a link in Jita Ledger’s alert mail. This link has been used already, or doesn’t name an item.'); return; }
  const auth = getAuth();
  const name = nameOf(want.typeId, want.name);
  if (!auth) { show('err', `Can’t open the ${await name} market`, 'This browser isn’t logged in to Jita Ledger. Open it, log in, then click the link in the mail again.'); return; }
  if (!isOwner(auth.characterId)) { show('err', 'This Jita Ledger is private', 'Only its owner’s character can use it.'); return; }
  if (!hasScope(SCOPE.ui)) { show('err', `Can’t open the ${await name} market`, 'Opening a market in game needs the “Open a window in your client” permission. Log out of Jita Ledger and in again to grant it.'); return; }
  show(null, `Opening the ${await name} market…`);
  try {
    await esi<void>('/ui/openwindow/marketdetails/', { auth: true, method: 'POST', query: { type_id: want.typeId } });
  } catch (e) {
    show('err', `Couldn’t open the ${await name} market`, e instanceof Error ? e.message : String(e));
    return;
  }
  // ESI answers the same whether or not the game is running, so this can't promise the window is there.
  show('ok', `Opened the ${await name} market in EVE`, `It appears in your client if the game is running as ${auth.characterName}.`);
  countdown(() => {
    window.close();
    // Still here a moment later: the browser wouldn't let the page close its own tab.
    setTimeout(() => { el('count').textContent = 'Your browser won’t let this tab close itself, so you can close it.'; el('keep').hidden = true; }, 400);
  });
}

run().catch((e) => show('err', 'Something went wrong', e instanceof Error ? e.message : String(e)));
