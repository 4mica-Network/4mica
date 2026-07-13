import { Outlet } from "react-router-dom";

export function SettingsLayout() {
  return (
    <div className="max-w-2xl">
      <Outlet />
    </div>
  );
}
