import { messages } from "@/i18n";
import { milestones } from "../data";

type Status = "Shipped" | "In progress" | "Planned";
type Milestone = (typeof milestones)[number];

function StatusChip({ status }: { status: Status }) {
  const styles =
    status === "Shipped"
      ? "border-overlay/10 bg-overlay/5 text-ink-body"
      : status === "In progress"
        ? "border-overlay/20 bg-overlay/10 text-ink-strong"
        : "border-overlay/10 text-ink-muted";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-md ${styles}`}
    >
      {status === "In progress" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-strong" />
      )}
      {status === "Shipped" && <i className="ri-check-line" />}
      {status}
    </span>
  );
}

function MilestoneNode({
  milestone,
  index,
  status,
}: {
  milestone: Milestone;
  index: number;
  status: Status;
}) {
  return (
    <div
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-[0_0_0_6px_rgba(8,8,10,0.92)] transition-transform duration-300 group-hover:scale-110 ${
        milestone.done
          ? "bg-ink-strong text-surface-deep"
          : status === "In progress"
            ? "border-2 border-overlay bg-surface text-ink-strong"
            : "border border-overlay/25 bg-surface text-ink-muted"
      }`}
    >
      {milestone.done ? (
        <i className="ri-check-line text-xl" />
      ) : (
        <span className="font-semibold text-md">{index + 1}</span>
      )}
    </div>
  );
}

function MilestoneLabel({
  milestone,
  status,
  align,
}: {
  milestone: Milestone;
  status: Status;
  align: "start" | "center";
}) {
  return (
    <>
      <span className="text-ink-muted text-md">{milestone.quarter}</span>
      <h3 className="mt-1 font-semibold text-ink-strong text-lg leading-tight">
        {milestone.title}
      </h3>
      <div className={`mt-2 ${align === "start" ? "self-start" : ""}`}>
        <StatusChip status={status} />
      </div>
    </>
  );
}

const PER_ROW = 2;
const X_LEFT = 12;
const X_RIGHT = 88;
const NODE_LEFT = 32;
const NODE_RIGHT = 68;
const BULGE = 11;
const NODE_TOP = 70;
const ROW_GAP = 210;
const BOTTOM = 170;

export default function TimelineSection() {
  const currentIndex = milestones.findIndex((m) => !m.done);
  const count = milestones.length;
  const rows = Math.ceil(count / PER_ROW);

  const height = NODE_TOP + (rows - 1) * ROW_GAP + BOTTOM;
  const yPct = (r: number) => ((NODE_TOP + r * ROW_GAP) / height) * 100;

  const statusOf = (milestone: Milestone, index: number): Status =>
    milestone.done
      ? "Shipped"
      : index === currentIndex
        ? "In progress"
        : "Planned";

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
        <div className="mb-14 text-center">
          <p className="section-kicker">{messages.about.roadmap.kicker}</p>
          <h2 className="section-title font-normal">
            {messages.about.roadmap.title}
          </h2>
          <p className="section-lead mx-auto max-w-2xl">
            {messages.about.roadmap.lead}
          </p>
        </div>

        <ol className="md:hidden">
          {milestones.map((milestone, index) => (
            <li
              key={milestone.quarter}
              className="group flex gap-4 border-overlay/10 border-l pb-8 pl-6 last:border-transparent last:pb-0"
            >
              <MilestoneNode
                milestone={milestone}
                index={index}
                status={statusOf(milestone, index)}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <MilestoneLabel
                  milestone={milestone}
                  status={statusOf(milestone, index)}
                  align="start"
                />
                <p className="mt-2 text-ink-muted text-md leading-relaxed">
                  {milestone.description}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div
          className="relative mx-auto hidden md:block"
          style={{ height: `${height}px` }}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <title>{messages.about.roadmap.pathTitle}</title>
            <path
              d={path}
              stroke="rgb(var(--overlay) / 0.10)"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={path}
              stroke="rgb(var(--overlay) / 0.35)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="0.5 7"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {nodes.map(({ milestone, index, x, y }) => {
            const status = statusOf(milestone, index);

            return (
              <div
                key={milestone.quarter}
                className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 hover:z-40"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <MilestoneNode
                  milestone={milestone}
                  index={index}
                  status={status}
                />

                <div className="absolute top-full left-1/2 mt-3 flex w-52 -translate-x-1/2 flex-col items-center text-center">
                  <MilestoneLabel
                    milestone={milestone}
                    status={status}
                    align="center"
                  />

                  <div className="pointer-events-none absolute top-full left-1/2 z-50 mt-3 w-60 max-w-[80vw] -translate-x-1/2 translate-y-1 rounded-lg border border-overlay/10 bg-surface/95 px-4 py-3 text-ink-muted text-md leading-relaxed opacity-0 shadow-2xl backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
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
