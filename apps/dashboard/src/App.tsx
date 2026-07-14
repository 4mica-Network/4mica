import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { SettingsLayout } from "@/components/SettingsLayout";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PageHeader } from "@/components/ui";
import { APP_PAGES, type PageMeta, SETTINGS_PAGES } from "@/pages";

function Page({ titleKey, descriptionKey }: PageMeta) {
  return <PageHeader titleKey={titleKey} descriptionKey={descriptionKey} />;
}

export function App() {
  return (
    <Routes>
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
          {SETTINGS_PAGES.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={<SettingsPanel {...page} />}
            />
          ))}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
