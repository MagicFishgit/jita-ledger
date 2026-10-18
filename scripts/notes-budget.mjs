// `npm run notes-budget`: how many characters of instructions Claude Code loads, at the start of a session and on reading
// each file, measured the way it loads them:
// - CLAUDE.md, with its `@` imports resolved recursively (relative to the file holding them, up to five hops, never
//   inside a code span or a fenced block, only paths that exist);
// - a `.claude/rules/*.md` without `paths:` is loaded at the start too;
// - reading a file adds every rule whose `paths:` globs match it (braces expanded, `**` any depth), with its imports.
// A file loaded twice counts once. Characters are JavaScript string length.
//
// Why: Claude Code warns past 150,000 characters of instruction files, and these notes only grow (CLAUDE.md, "Notes by
// topic"). It prints the always-loaded total and the heaviest 15 of every tracked file under src/, worker/ and scripts/,
// and exits 1 when any is at or over LIMIT, leaving room under the warning. `npm run notes-budget -- <file>…` prints those
// files' loads note by note instead (exiting 1 the same way).
//
// A rule's frontmatter is read with a strict parser for the one shape used here (`paths:` and a list of quoted globs); any
// other shape stops the script, since a frontmatter Claude Code can't parse loads the rule at the start, like an import.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LIMIT = 140_000;
const MAX_HOPS = 5;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(root, p);
const read = (p) => fs.readFileSync(p, 'utf8');

// The text Claude Code reads imports from: fenced blocks and inline code spans taken out.
function proseOf(text) {
  return text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
}

function load(file, seen, hops = 0) {
  if (seen.has(file)) return;
  seen.add(file);
  if (hops >= MAX_HOPS) return;
  for (const m of proseOf(read(file)).matchAll(/(?:^|\s)@([^\s)]+)/g)) {
    const target = m[1].startsWith('~/') ? path.join(process.env.HOME ?? '', m[1].slice(2)) : path.resolve(path.dirname(file), m[1]);
    if (fs.existsSync(target) && fs.statSync(target).isFile()) load(target, seen, hops + 1);
  }
}

function expand(glob) {
  const m = glob.match(/\{([^{}]*)\}/);
  if (!m) return [glob];
  return m[1].split(',').flatMap((alt) => expand(glob.slice(0, m.index) + alt + glob.slice(m.index + m[0].length)));
}

function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

// The one frontmatter shape the rules use; anything else is an error, never a guess.
function pathsOf(file) {
  const text = read(file);
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) throw new Error(`${rel(file)}: frontmatter never closes`);
  const lines = text.slice(4, end).split('\n');
  if (lines[0] !== 'paths:') throw new Error(`${rel(file)}: frontmatter's first line is "${lines[0]}", not "paths:"`);
  const globs = lines.slice(1).map((line, i) => {
    const m = line.match(/^ {2}- "([^"\\]+)"$/);
    if (!m) throw new Error(`${rel(file)}: frontmatter line ${i + 3} isn't a quoted glob: ${JSON.stringify(line)}`);
    return m[1];
  });
  if (!globs.length) throw new Error(`${rel(file)}: paths: lists no globs`);
  return globs;
}

const rulesDir = path.join(root, '.claude/rules');
const rules = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const file = path.join(rulesDir, f);
  const globs = pathsOf(file);
  return { name: f.replace(/\.md$/, ''), file, res: globs ? globs.flatMap(expand).map(globRe) : null };
});

const always = new Set();
load(path.join(root, 'CLAUDE.md'), always);
for (const r of rules) if (!r.res) load(r.file, always);

const size = (set) => [...set].reduce((a, p) => a + read(p).length, 0);
function measure(target) {
  const seen = new Set(always);
  const hit = rules.filter((r) => r.res && r.res.some((re) => re.test(target)));
  for (const r of hit) load(r.file, seen);
  return { target, total: size(seen), hit: hit.map((r) => r.name), seen };
}
const fmt = (n) => n.toLocaleString('en');
const unconditional = rules.filter((r) => !r.res).map((r) => r.name);

const asked = process.argv.slice(2);
if (asked.length) {
  let over = false;
  for (const a of asked) {
    const m = measure(rel(path.resolve(a)));
    over ||= m.total >= LIMIT;
    console.log(`${m.target}: ${fmt(m.total)}${m.hit.length ? ` (rules: ${m.hit.join(', ')})` : ''}`);
    for (const p of m.seen) console.log(`  ${fmt(read(p).length).padStart(8)}  ${rel(p)}`);
  }
  process.exit(over ? 1 : 0);
}

const tracked = execFileSync('git', ['ls-files', 'src', 'worker', 'scripts'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const all = tracked.map(measure).sort((a, b) => b.total - a.total || a.target.localeCompare(b.target));
const over = all.filter((m) => m.total >= LIMIT);

console.log(`Always loaded: ${fmt(size(always))} characters (${[...always].map(rel).join(', ')})`);
if (unconditional.length) console.log(`Rules loaded at the start (no paths:): ${unconditional.join(', ')}`);
console.log(`\nHeaviest 15 of ${all.length} tracked files under src/, worker/ and scripts/:`);
for (const m of all.slice(0, 15)) console.log(`${fmt(m.total).padStart(9)}  ${m.target}  (${m.hit.join(', ')})`);
if (over.length) {
  console.log(`\n${over.length} at or over ${fmt(LIMIT)}: ${over.map((m) => m.target).join(', ')}`);
  process.exit(1);
}
console.log(`\nEvery one under ${fmt(LIMIT)}.`);
