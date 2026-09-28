/**
 * The link an alert mail puts on an item's name: the light page that opens its market in game (`open.html`,
 * src/open.ts), with the item's ID and the name the mail knew it by in one parameter, `2185~Hammerhead II`. One
 * parameter, so the mail's link carries no `&` for the client's mail markup to mistake. Pure: the mail builder (in
 * the app and the cloud) and the page share it.
 */
export function openLink(appUrl: string, typeId: number, name?: string | null): string {
  return `${appUrl}open.html?market=${typeId}${name ? `~${encodeURIComponent(name)}` : ''}`;
}

/** What an `open.html` link asks for: the type ID and, when the mail knew it, the name. */
export function parseMarket(raw: string | null): { typeId: number; name: string | null } | null {
  const m = /^(\d+)(?:~([\s\S]*))?$/.exec((raw ?? '').trim());
  if (!m) return null;
  const typeId = Number(m[1]);
  return Number.isSafeInteger(typeId) && typeId > 0 ? { typeId, name: m[2]?.trim() || null } : null;
}
