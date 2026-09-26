/**
 * Pictures for system notifications.
 *
 * The operating system draws a browser notification, so no page can restyle it with CSS. What a page
 * can choose is the icon beside it and, on Chrome for Windows and Android, a large picture inside it.
 * These draw both in the app's own look: the hexagon mark, and the alert as a card in the theme's
 * colours. Other systems (macOS among them) show only the icon, with the text as usual.
 */

const css = (name: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};

const iconCache = new Map<string, string>();

/** The app's hexagon mark, as a PNG the notification can use as its icon. */
export function appIcon(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const acc = css('--acc', '#5cd3f2');
  const hit = iconCache.get(acc);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d');
  if (!g) return undefined;
  const hex = (inset: number) => {
    const s = 192 / 100, pts = [[25, 3], [75, 3], [100, 50], [75, 97], [25, 97], [0, 50]];
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const px = (x + (50 - x) * inset) * s, py = (y + (50 - y) * inset) * s;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    });
    g.closePath();
  };
  hex(0); g.fillStyle = acc; g.fill();
  hex(0.1); g.fillStyle = '#050b12'; g.fill();
  g.fillStyle = acc;
  g.font = '700 70px "Chakra Petch", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('JL', 96, 100);
  const url = c.toDataURL('image/png');
  iconCache.set(acc, url);
  return url;
}

/** Split text into lines that fit a width, at most `max` of them, the last ending in "…" if cut. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width <= width) { line = next; continue; }
    if (line) lines.push(line);
    line = w;
    if (lines.length === max) break;
  }
  if (lines.length < max && line) lines.push(line);
  if (lines.length === max && words.join(' ').length > lines.join(' ').length) {
    let last = lines[max - 1];
    while (last && g.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[max - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

/**
 * The alert as a card in the app's style, 2:1 as Windows and Android lay out a notification's picture.
 * `tone` picks the stripe: a warning in the theme's second colour, an error in red, good news in green.
 */
export function alertCard(title: string, text: string, tone: 'ok' | 'info' | 'warn' | 'err'): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const W = 720, H = 360;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return undefined;
  const acc = css('--acc', '#5cd3f2');
  const stripe = tone === 'warn' ? css('--acc2', '#f2b15c') : tone === 'err' ? '#ff6b7d' : tone === 'ok' ? '#6ee7a8' : acc;

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1826'); bg.addColorStop(1, '#050b12');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // A faint grid, as behind every page.
  g.strokeStyle = 'rgba(130,185,225,.06)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  g.fillStyle = stripe; g.fillRect(0, 0, 10, H);
  g.strokeStyle = 'rgba(130,185,225,.25)'; g.strokeRect(0.5, 0.5, W - 1, H - 1);

  g.textBaseline = 'alphabetic';
  g.fillStyle = acc;
  g.font = '600 22px "Chakra Petch", sans-serif';
  g.fillText('JITA LEDGER', 48, 64);
  g.fillStyle = stripe;
  g.font = '600 34px "Chakra Petch", sans-serif';
  g.fillText(title.toUpperCase(), 48, 118);
  g.fillStyle = '#dfeaf3';
  g.font = '400 30px Barlow, sans-serif';
  wrap(g, text, W - 96, 5).forEach((l, i) => g.fillText(l, 48, 176 + i * 40));
  return c.toDataURL('image/png');
}
