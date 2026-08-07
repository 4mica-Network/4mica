import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/auth/RequireAuth";
import { SignInPage } from "@/auth/SignInPage";
import { SsoCallbackPage } from "@/auth/SsoCallbackPage";
import { AppShell } from "@/components/AppShell";
import { SettingsLayout } from "@/components/SettingsLayout";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PageHeader } from "@/components/ui";
import { APP_PAGES, type PageMeta, SETTINGS_PAGES } from "@/pages";
import { AccountSettings } from "@/settings/AccountSettings";
import { BusinessSettings } from "@/settings/BusinessSettings";
import { DeveloperSettings } from "@/settings/DeveloperSettings";
import { NotificationSettings } from "@/settings/NotificationSettings";
import { ProfileSettings } from "@/settings/ProfileSettings";

function Page({ titleKey, descriptionKey }: PageMeta) {
  return <PageHeader titleKey={titleKey} descriptionKey={descriptionKey} />;
}

const SETTINGS_ROUTES: Record<string, () => ReactNode> = {
  account: AccountSettings,
  profile: ProfileSettings,
  business: BusinessSettings,
  notifications: NotificationSettings,
  developer: DeveloperSettings,
};

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sso-callback" element={<SsoCallbackPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {APP_PAGES.map((page) =>
            page.index ? (
              <Route key="index" index element={<Page {...page} />} />
            ) : (
              <Route
                key={page.path}
                path={page.path}
                element={<Page {...page} />}
              />
            ),
          )}

          <Route path="settings" element={<SettingsLayout />}>
            <Route
              index
              element={<Navigate to={SETTINGS_PAGES[0].path} replace />}
            />
            {SETTINGS_PAGES.map((page) => {
              const Implemented = SETTINGS_ROUTES[page.path];
              return (
                <Route
                  key={page.path}
                  path={page.path}
                  element={
                    Implemented ? <Implemented /> : <SettingsPanel {...page} />
                  }
                />
              );
            })}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
