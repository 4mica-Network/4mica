import { Outlet } from "react-router-dom";

/**
 * Settings content area. The section's navigation lives in the sidebar (which
 * swaps to settings mode on /settings routes), so here we just render the
 * active sub-page, constrained for readable forms.
 */
export function SettingsLayout() {
  return (
    <div className="max-w-2xl">
      <Outlet />
    </div>
  );
}
