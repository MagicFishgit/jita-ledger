import type { Indexed } from '../../lib/industry';
import type { Graph } from '../../lib/jumps';
import type { IndustryChar } from './industryChars';
import { IndustrySites } from './IndustrySites';

/** Build (docs/notes/industry.md): what pays at your build site (the finder, from Task 5B), and where you build. */
export function IndustryBuild({ c, ix, graph, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; mainName: string }) {
  return (
    <section className="col" style={{ gap: 16 }} aria-label="Build" data-industry="build">
      <IndustrySites c={c} ix={ix} graph={graph} mainName={mainName} />
    </section>
  );
}
