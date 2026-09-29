/**
 * The freelance jobs you've joined, read from ESI (esi-characters.read_freelance_jobs.v1): the list, each job's
 * participation (what you've delivered, whether you're still in) and its public details (what it takes, what it pays,
 * when it began), with a group job's items looked up. The sync keeps them in `meta.freelance` for the Wallet and
 * Results; the Freelance tab reads them fresh when it opens. I/O; the rules are in freelance.ts.
 */
import { esi } from './esi';
import { readDeliverJob, type JoinedJob, type RawFreelanceJob } from './freelance';
import { pool } from './lootMarket';
import { groupTypes } from './universe';

export async function readJoinedJobs(characterId: number): Promise<JoinedJob[]> {
  const { data } = await esi<{ freelance_jobs: { id: string; name: string; state: string }[] }>(`/characters/${characterId}/freelance-jobs`, { auth: true });
  const out: JoinedJob[] = [];
  await pool(data.freelance_jobs ?? [], 4, async (j) => {
    const [part, detail] = await Promise.all([
      esi<{ contributed: number; state: string }>(`/characters/${characterId}/freelance-jobs/${j.id}/participation`, { auth: true }).then((r) => r.data).catch(() => null),
      esi<RawFreelanceJob>(`/freelance-jobs/${j.id}`).then((r) => r.data).catch(() => null),
    ]);
    // What it takes, whatever its state: a closed job's items still say which of your trades were for it.
    const it = detail?.configuration?.parameters?.corporation_item_delivery?.corporation_item_delivery?.item_type?.values?.[0];
    const ids = (it?.values ?? []).map(Number).filter((n) => n > 0);
    const types = it?.value_type === 'item_group' ? (await Promise.all(ids.map((g) => groupTypes(g).catch(() => [] as number[])))).flat() : ids;
    const open = detail ? readDeliverJob(detail) : null;
    out.push({
      id: j.id, name: j.name, state: j.state, standing: part?.state ?? 'Unspecified',
      perUnit: detail?.contribution?.reward_per_contribution ?? 0, perPlayer: open?.perPlayer ?? detail?.contribution?.contribution_per_participant_limit ?? null,
      types, created: detail?.details?.created ?? null, expires: detail?.details?.expires ?? null, delivered: part?.contributed ?? 0,
    });
  });
  return out.sort((x, y) => (x.state === 'Active' ? 0 : 1) - (y.state === 'Active' ? 0 : 1) || x.name.localeCompare(y.name));
}
