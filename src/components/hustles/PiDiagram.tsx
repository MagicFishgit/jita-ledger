/**
 * Diagrams for the planetary interaction guide.
 *
 * Drawn as inline SVG rather than fetched as pictures. A hosted image would mean a request to
 * someone else's server on every page load, a licence to honour, and a broken box the day it moves;
 * these instead inherit the app's own colours, stay sharp at any size, and cost nothing to load.
 */

/** A colony as it is actually laid out: extractor, optional factory, launchpad, joined by links. */
export function ColonyDiagram({ raw, product, refine }: { raw: string; product: string; refine: boolean }) {
  const box = (x: number, y: number, w: number, h: number, cls: string) => (
    <rect x={x} y={y} width={w} height={h} rx={6} className={cls} />
  );
  return (
    <svg viewBox="0 0 660 200" className="pi-svg" role="img"
      aria-label={refine
        ? `Colony layout: command centre, extractor pulling ${raw}, a basic industry facility making ${product}, and a launchpad, joined by links`
        : `Colony layout: command centre, extractor pulling ${raw}, and a launchpad, joined by a link`}>
      {/* links first, so the boxes sit on top of them */}
      <g className="pi-link">
        <line x1={118} y1={100} x2={205} y2={100} />
        {refine && <line x1={318} y1={100} x2={405} y2={100} />}
        {!refine && <line x1={318} y1={100} x2={520} y2={100} />}
        {refine && <line x1={518} y1={100} x2={560} y2={100} />}
      </g>

      <g className="pi-node">
        {box(20, 70, 98, 60, 'pi-cc')}
        <text x={69} y={95} className="pi-label">Command</text>
        <text x={69} y={112} className="pi-label">centre</text>

        {box(205, 60, 113, 80, 'pi-ex')}
        <text x={261} y={86} className="pi-label">Extractor</text>
        <text x={261} y={104} className="pi-sub">{raw}</text>
        <text x={261} y={122} className="pi-sub">heads on hot ground</text>

        {refine && (
          <>
            {box(405, 60, 113, 80, 'pi-fac')}
            <text x={461} y={86} className="pi-label">Factory</text>
            <text x={461} y={104} className="pi-sub">makes {product}</text>
            <text x={461} y={122} className="pi-sub">3,000 in → 20 out</text>
          </>
        )}

        {box(560, 70, 80, 60, 'pi-pad')}
        <text x={600} y={95} className="pi-label">Launch</text>
        <text x={600} y={112} className="pi-label">pad</text>
      </g>

      <g className="pi-flow">
        <text x={162} y={92} className="pi-sub">powers</text>
        {refine
          ? <><text x={361} y={92} className="pi-sub">{raw}</text><text x={539} y={92} className="pi-sub">{product}</text></>
          : <text x={419} y={92} className="pi-sub">{raw}, straight out</text>}
      </g>
    </svg>
  );
}
