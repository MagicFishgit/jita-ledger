/**
 * How a tooltip's text is laid out. Tips are plain strings (they travel in `data-tip`), so a little
 * structure is read from the text itself rather than from markup:
 *
 * - a blank line starts a new paragraph;
 * - a line starting with "• " is a bullet, and consecutive bullets make a list;
 * - a paragraph starting with "For example" or "Example:" is set apart as an example.
 *
 * A tip written as one sentence still shows as one paragraph, so nothing has to change to keep working.
 */
export type TipBlock = { kind: 'p'; text: string } | { kind: 'list'; items: string[] } | { kind: 'example'; text: string };

const EXAMPLE = /^(for example[:,]?|example:)\s*/i;

export function tipBlocks(text: string): TipBlock[] {
  const out: TipBlock[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    let list: string[] | null = null;
    for (const line of lines) {
      if (line.startsWith('• ')) {
        if (!list) { list = []; out.push({ kind: 'list', items: list }); }
        list.push(line.slice(2).trim());
        continue;
      }
      list = null;
      const ex = line.match(EXAMPLE);
      if (ex) out.push({ kind: 'example', text: line.slice(ex[0].length).replace(/^./, (c) => c.toUpperCase()) });
      else out.push({ kind: 'p', text: line });
    }
  }
  return out;
}

/** Long or structured tips get a wider box, so they read as a short column rather than a tall strip. */
export const isWideTip = (text: string) => text.length > 200 || text.includes('\n');
