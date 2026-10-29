/**
 * The text of an EVE notification (`/characters/{id}/notifications/`), which is YAML, read as its top-level `key: value`
 * lines: the first line of each key wins, an anchor (`&id001`) before a value is dropped, one pair of quotes round it is
 * taken off, and the value stays a string. Nested and listed lines (indented, or starting `- `) aren't read. Asset safety
 * (assetSafety.ts) and the HyperNet notices (hypernet.ts) read their fields with it; pure, and imported by the Worker.
 */
export function noticeFields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_]\w*):[ \t]*(.*)$/.exec(line);
    if (!m || out.has(m[1])) continue;
    out.set(m[1], m[2].replace(/^&\w+(?:[ \t]+|$)/, '').trim().replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1'));
  }
  return out;
}
