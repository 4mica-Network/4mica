const THREADS = ["0%", "100%"];

export default function VerticalThreads() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] flex justify-center px-4 sm:px-6 lg:px-8"
    >
      <div className="relative h-full w-full max-w-300">
        {THREADS.map((left) => (
          <div
            key={left}
            className="absolute inset-y-0 w-px bg-overlay/[0.06]"
            style={{ left }}
          />
        ))}
      </div>
    </div>
  );
}
