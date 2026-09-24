/**
 * Thirty days of daily volume as a bar strip.
 *
 * The shape is the whole point. An even row means the item trades every day; one tall bar
 * among stubs means a month's worth went in an afternoon — which a median, a monthly total
 * and a margin figure all hide equally well.
 */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const w = 3, gap = 1, h = 18;
  return (
    <svg
      className="spark" width={values.length * (w + gap) - gap} height={h}
      viewBox={`0 0 ${values.length * (w + gap) - gap} ${h}`}
      role="img" aria-label={label} focusable="false"
    >
      {values.map((v, i) =>
        v > 0 ? (
          <rect key={i} x={i * (w + gap)} y={h - Math.max(2, (v / max) * h)} width={w} height={Math.max(2, (v / max) * h)} />
        ) : (
          <rect key={i} className="gap" x={i * (w + gap)} y={h - 1} width={w} height={1} />
        ),
      )}
    </svg>
  );
}
