// `npm run deployed`: after a push, wait for GitHub Actions to finish with this commit and say plainly whether it
// shipped. Fails (exit 1) when a run failed, showing the failing log's tail; a cancelled run passes only when a newer
// run of the same workflow succeeded, since the Pages workflow cancels an older run when a newer push arrives (it
// builds main, so the newer run carries the older commit too); and the live site's version.json must name this commit.
//
// Why: the user saw a cancelled run among the Actions on 28 September 2026 and asked whether failures were reported,
// "so you know and don't assume something worked and keep shipping new stuff". Watching runs by hand had been done
// for most pushes but not every one.
import { execFileSync } from 'node:child_process';

const SITE = 'https://magicfishgit.github.io/jita-ledger/';
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
// A commit to check can be given (`npm run deployed -- 67c6dbc`); HEAD otherwise.
const sha = run('git', ['rev-parse', process.argv[2] ?? 'HEAD']);
const short = sha.slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + 20 * 60_000;

const runsFor = (commit) => JSON.parse(run('gh', ['run', 'list', '--commit', commit, '--json', 'databaseId,name,status,conclusion,headSha,createdAt']));

console.log(`Waiting for the Actions runs of ${sha.slice(0, 7)}…`);
let runs = [];
for (;;) {
  runs = runsFor(sha);
  if (runs.length && runs.every((r) => r.status === 'completed')) break;
  if (Date.now() > deadline) { console.error('Gave up after 20 minutes: runs still going.'); process.exit(1); }
  await sleep(runs.length ? 15_000 : 5_000);
}

let bad = false;
for (const r of runs) {
  if (r.conclusion === 'success') { console.log(`  ok        ${r.name}`); continue; }
  if (r.conclusion === 'cancelled') {
    // Superseded by a newer run of the same workflow? It must have succeeded, on a commit that includes this one.
    const later = JSON.parse(run('gh', ['run', 'list', '--workflow', r.name, '--limit', '5', '--json', 'name,status,conclusion,headSha,createdAt']))
      .filter((x) => x.createdAt > r.createdAt);
    const newest = later[0];
    const includes = newest ? (() => { try { run('git', ['merge-base', '--is-ancestor', sha, newest.headSha]); return true; } catch { return false; } })() : false;
    if (newest && newest.conclusion === 'success' && includes) { console.log(`  ok        ${r.name}: cancelled, and a newer run (${newest.headSha.slice(0, 7)}) shipped it`); continue; }
    console.error(`  CANCELLED ${r.name}, and no newer successful run carries it${newest ? ` (newest: ${newest.conclusion ?? newest.status})` : ''}`);
    bad = true;
    continue;
  }
  bad = true;
  console.error(`  FAILED    ${r.name} (${r.conclusion}): gh run view ${r.databaseId} --log-failed`);
  try { console.error(run('gh', ['run', 'view', String(r.databaseId), '--log-failed']).split('\n').slice(-40).join('\n')); } catch { /* the log may not be ready */ }
}

// The site says which build it serves; a newer push may have replaced this one, which is fine if it includes it.
const live = await fetch(`${SITE}version.json`, { cache: 'no-store' }).then((x) => x.json()).then((j) => j.build).catch(() => null);
if (!live) { console.error('  Couldn’t read the live version.json.'); bad = true; }
else if (live === short) console.log(`  ok        live site is ${short}`);
else {
  let includes = false;
  try { run('git', ['fetch', '-q', 'origin']); run('git', ['merge-base', '--is-ancestor', sha, run('git', ['rev-parse', `${live}`])]); includes = true; } catch { /* unknown or older */ }
  if (includes) console.log(`  ok        live site is ${live}, a newer build that includes this commit`);
  else { console.error(`  NOT LIVE  the site serves ${live}, not ${short}`); bad = true; }
}

if (bad) { console.error('\nNot shipped. Fix this before the next change.'); process.exit(1); }
console.log('\nShipped.');
