import { type ComponentType, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { PageBoundary } from "@/components/ErrorBoundary/PageBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PageSpinner } from "@/components/PageSpinner";
import { SettingsLayout } from "@/components/SettingsLayout";
import { WorkspaceGuard } from "@/components/WorkspaceGuard";
import { useAppLanguage } from "@/hooks/useAppLanguage";
import { useAppTheme } from "@/hooks/useAppTheme";
import { SignInPage } from "@/pages/sign-in";
import { SsoCallbackPage } from "@/pages/sso-callback";
import { APP_PAGES, SETTINGS_PAGES, STANDALONE_PAGES } from "@/routes";

const page = (Component: ComponentType, path?: string) => {
  const content = (
    <PageBoundary>
      <Suspense fallback={<PageSpinner />}>
        <Component />
      </Suspense>
    </PageBoundary>
  );
  return path === undefined ? (
    content
  ) : (
    <WorkspaceGuard path={path}>{content}</WorkspaceGuard>
  );
};

export function App() {
  useAppTheme();
  useAppLanguage();

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/sign-in" element={page(SignInPage)} />
        <Route path="/sso-callback" element={page(SsoCallbackPage)} />

        <Route element={<RequireAuth />}>
          {STANDALONE_PAGES.map(({ path, component: Component }) => (
            <Route key={path} path={path} element={page(Component)} />
          ))}

          <Route element={<AppShell />}>
            {APP_PAGES.map(({ path, index, component: Component }) =>
              index ? (
                <Route key="index" index element={page(Component, "/")} />
              ) : (
                <Route
                  key={path}
                  path={path}
                  element={page(Component, `/${path}`)}
                />
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
                <Route
                  key={path}
                  path={path}
                  element={page(Component, `/settings/${path}`)}
                />
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
    </>
  );
}
