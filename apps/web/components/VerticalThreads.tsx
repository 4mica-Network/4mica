import type { CSSProperties } from "react";

const THREADS = [
  { left: "0%", side: true, duration: "5.2s", delay: "0.8s" },
  { left: "25%", side: false },
  { left: "50%", side: false },
  { left: "75%", side: false },
  { left: "100%", side: true, duration: "6.4s", delay: "3.4s" },
];

export default function VerticalThreads() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-1 flex justify-center px-4 sm:px-6 lg:px-8"
    >
      <div className="relative h-full w-full max-w-300">
        {THREADS.map((thread) => (
          <div
            key={thread.left}
            className={`absolute inset-y-0 w-px ${
              thread.side ? "bg-overlay/18" : "hidden bg-overlay/10 md:block"
            }`}
            style={{ left: thread.left }}
          >
            {thread.side && (
              <span
                className="thread-pulse absolute top-0 left-0 h-32 w-px"
                style={
                  {
                    "--pulse-duration": thread.duration,
                    "--pulse-delay": thread.delay,
                  } as CSSProperties
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
