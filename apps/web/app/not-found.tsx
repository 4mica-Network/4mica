export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display font-semibold text-6xl text-ink-strong md:text-7xl">
        404
      </h1>
      <h2 className="mt-6 font-semibold text-2xl text-ink-strong md:text-3xl">
        This page has not been generated
      </h2>
      <p className="mt-4 text-ink-muted text-lg md:text-xl">
        Tell me what you would like on this page
      </p>
    </div>
  );
}
