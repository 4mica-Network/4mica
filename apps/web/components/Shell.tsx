export default function Shell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative z-10 min-h-screen overflow-x-clip">
      <div className="flex min-h-screen w-full px-4 sm:px-6 lg:px-8">
        <main className="mx-auto size-full min-h-screen max-w-300">
          {children}
        </main>
      </div>
    </div>
  );
}
