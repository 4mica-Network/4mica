import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { SettingsLayout } from "@/components/SettingsLayout";
import { SignInPage } from "@/pages/sign-in";
import { SsoCallbackPage } from "@/pages/sso-callback";
import { APP_PAGES, SETTINGS_PAGES } from "@/routes";

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sso-callback" element={<SsoCallbackPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {APP_PAGES.map(({ path, index, component: Component }) =>
            index ? (
              <Route key="index" index element={<Component />} />
            ) : (
              <Route key={path} path={path} element={<Component />} />
            ),
          )}

          <Route path="settings" element={<SettingsLayout />}>
            <Route
              index
              element={<Navigate to={SETTINGS_PAGES[0].path} replace />}
            />
            {SETTINGS_PAGES.map(({ path, component: Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
