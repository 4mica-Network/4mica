import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

/** Full-screen application shell: fixed left sidebar + scrollable content. */
export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-deep text-ink-body">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
