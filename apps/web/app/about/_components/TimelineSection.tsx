import { milestones } from "../data";

type Status = "Shipped" | "In progress" | "Planned";

function StatusChip({ status }: { status: Status }) {
  const styles =
    status === "Shipped"
      ? "border-white/10 bg-white/5 text-ink-body"
      : status === "In progress"
        ? "border-white/20 bg-white/10 text-ink-strong"
        : "border-white/10 text-ink-muted";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-md ${styles}`}
    >
      {status === "In progress" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      )}
      {status === "Shipped" && <i className="ri-check-line" />}
      {status}
    </span>
  );
}

type TimelineSectionProps = {
  showHeader?: boolean;
};

// Road geometry. X in percent (responsive); Y in pixels (so labels fit).
const PER_ROW = 2;
const X_LEFT = 12;
const X_RIGHT = 88;
const NODE_LEFT = 32;
const NODE_RIGHT = 68;
const BULGE = 11;
const NODE_TOP = 70; // first row center, px
const ROW_GAP = 210; // distance between rows, px
const BOTTOM = 170; // reserved space for the last row's labels, px

export default function TimelineSection({
  showHeader = true,
}: TimelineSectionProps) {
  const currentIndex = milestones.findIndex((m) => !m.done);
  const count = milestones.length;
  const rows = Math.ceil(count / PER_ROW);

  const height = NODE_TOP + (rows - 1) * ROW_GAP + BOTTOM;
  const yPct = (r: number) => ((NODE_TOP + r * ROW_GAP) / height) * 100;

  // Node positions: flow left→right, then right→left, down the page.
  const nodes = milestones.map((milestone, i) => {
    const row = Math.floor(i / PER_ROW);
    const posInRow = i % PER_ROW;
    const ltr = row % 2 === 0;
    const x = ltr
      ? posInRow === 0
        ? NODE_LEFT
        : NODE_RIGHT
      : posInRow === 0
        ? NODE_RIGHT
        : NODE_LEFT;
    return { milestone, index: i, x, y: yPct(row) };
  });

  // Switchback road: flat rows joined by smooth U-turns at alternating sides.
  let path = `M ${X_LEFT} ${yPct(0).toFixed(2)}`;
  for (let r = 0; r < rows; r++) {
    const ltr = r % 2 === 0;
    const y = yPct(r).toFixed(2);
    path += ` L ${ltr ? X_RIGHT : X_LEFT} ${y}`;
    if (r < rows - 1) {
      const yn = yPct(r + 1).toFixed(2);
      const cx = ltr ? X_RIGHT + BULGE : X_LEFT - BULGE;
      const edge = ltr ? X_RIGHT : X_LEFT;
      path += ` C ${cx} ${y}, ${cx} ${yn}, ${edge} ${yn}`;
    }
  }

  return (
    <section id="roadmap" className="section-gloss mt-24 scroll-mt-24">
      <div className="mx-auto w-full max-w-3xl">
        {showHeader && (
          <div className="mb-14 text-center">
            <p className="section-kicker">Roadmap</p>
            <h2 className="section-title font-normal">Product roadmap</h2>
            <p className="section-lead mx-auto max-w-2xl">
              Our journey to revolutionize web3 commerce.
            </p>
          </div>
        )}

        <div className="relative mx-auto" style={{ height: `${height}px` }}>
          {/* The road */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <title>Roadmap path</title>
            <path
              d={path}
              stroke="rgba(255,255,255,0.10)"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={path}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="0.5 7"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Stops */}
          {nodes.map(({ milestone, index, x, y }) => {
            const status: Status = milestone.done
              ? "Shipped"
              : index === currentIndex
                ? "In progress"
                : "Planned";

            return (
              <div
                key={milestone.quarter}
                className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 hover:z-40"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {/* Node */}
                <div
                  className={`relative flex h-12 w-12 items-center justify-center rounded-full shadow-[0_0_0_6px_rgba(8,8,10,0.92)] transition-transform duration-300 group-hover:scale-110 ${
                    milestone.done
                      ? "bg-white text-black"
                      : index === currentIndex
                        ? "border-2 border-white bg-[#0a0a0a] text-white"
                        : "border border-white/25 bg-[#0a0a0a] text-ink-muted"
                  }`}
                >
                  {milestone.done ? (
                    <i className="ri-check-line text-xl" />
                  ) : (
                    <span className="font-semibold text-md">{index + 1}</span>
                  )}
                </div>

                {/* Label */}
                <div className="absolute top-full left-1/2 mt-3 flex w-44 -translate-x-1/2 flex-col items-center text-center sm:w-52">
                  <span className="text-ink-muted text-md">
                    {milestone.quarter}
                  </span>
                  <h3 className="mt-1 font-semibold text-ink-strong text-lg leading-tight">
                    {milestone.title}
                  </h3>
                  <div className="mt-2">
                    <StatusChip status={status} />
                  </div>

                  {/* Description popover (floats, doesn't shift layout) */}
                  <div className="pointer-events-none absolute top-full left-1/2 z-50 mt-3 w-60 max-w-[80vw] -translate-x-1/2 translate-y-1 rounded-lg border border-white/10 bg-[#0a0a0a]/95 px-4 py-3 text-ink-muted text-md leading-relaxed opacity-0 shadow-2xl backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    {milestone.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
