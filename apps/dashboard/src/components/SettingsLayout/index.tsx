import { Outlet } from "react-router-dom";

export function SettingsLayout() {
  return (
    <div className="h-full w-full">
      <Outlet />
    </div>
  );
}
