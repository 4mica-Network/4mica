import { type ComponentType, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { PageSpinner } from "@/components/PageSpinner";
import { SettingsLayout } from "@/components/SettingsLayout";
import { useAppTheme } from "@/hooks/useAppTheme";
import { SignInPage } from "@/pages/sign-in";
import { SsoCallbackPage } from "@/pages/sso-callback";
import { APP_PAGES, SETTINGS_PAGES } from "@/routes";

const page = (Component: ComponentType) => (
  <Suspense fallback={<PageSpinner />}>
    <Component />
  </Suspense>
);

export function App() {
  useAppTheme();

  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sso-callback" element={<SsoCallbackPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {APP_PAGES.map(({ path, index, component: Component }) =>
            index ? (
              <Route key="index" index element={page(Component)} />
            ) : (
              <Route key={path} path={path} element={page(Component)} />
            ),
          )}

          <Route
            path="transactions"
            element={<Navigate to="/payments" replace />}
          />

          <Route path="settings" element={<SettingsLayout />}>
            <Route
              index
              element={<Navigate to={SETTINGS_PAGES[0].path} replace />}
            />
            {SETTINGS_PAGES.map(({ path, component: Component }) => (
              <Route key={path} path={path} element={page(Component)} />
            ))}
            <Route
              path="account"
              element={<Navigate to="/settings/general" replace />}
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
