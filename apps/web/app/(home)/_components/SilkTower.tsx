const WIDTH = 360;
const HEIGHT = 180;
const STRANDS = 30;
const CENTRE = WIDTH / 2;
const SPREAD = 11;

const strands = Array.from({ length: STRANDS }, (_, i) => {
  const offset = (i - (STRANDS - 1) / 2) * SPREAD;
  const x = CENTRE + offset;
  const lean = offset * 0.35;
  const weight = 1 - Math.abs(offset) / ((STRANDS / 2) * SPREAD);
  return {
    d: `M${x} ${HEIGHT} C${x} ${HEIGHT * 0.62}, ${CENTRE + lean} ${HEIGHT * 0.38}, ${CENTRE} 6`,
    opacity: 0.12 + weight * 0.3,
  };
});

export default function SilkTower({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      fill="none"
    >
      <defs>
        <linearGradient id="silk-tower-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.75" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {strands.map((strand) => (
        <path
          key={strand.d}
          d={strand.d}
          stroke="url(#silk-tower-fade)"
          strokeOpacity={strand.opacity}
          strokeWidth="1"
        />
      ))}
      <circle
        cx={CENTRE}
        cy="6"
        r="2.5"
        fill="currentColor"
        fillOpacity="0.9"
      />
      <circle cx={CENTRE} cy="6" r="7" fill="currentColor" fillOpacity="0.12" />
    </svg>
  );
}
