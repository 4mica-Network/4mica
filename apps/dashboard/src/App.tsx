import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { SettingsLayout } from "./components/SettingsLayout";
import { AgentAdvancedPage } from "./pages/AgentAdvancedPage";
import { AgentProfilePage } from "./pages/AgentProfilePage";
import { AgentsPage } from "./pages/AgentsPage";
import { HomePage } from "./pages/HomePage";
import {
  BusinessSettings,
  CommunicationPreferencesSettings,
  ComplianceSettings,
  DeveloperSettings,
  NotificationsSettings,
  PersonalDetailsSettings,
  PlansSettings,
  ProfileSettings,
  TeamSettings,
} from "./pages/settings";
import {
  AppsPage,
  BalancesPage,
  CreateInvoicePage,
  CustomersPage,
  DisputesPage,
  HelpPage,
  IdentityPage,
  PaymentsPage,
  ReportsPage,
  WalletPage,
} from "./pages/stubs";
import { TransactionsPage } from "./pages/TransactionsPage";
import { WhitelistPage } from "./pages/WhitelistPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />

        {/* Money */}
        <Route path="balances" element={<BalancesPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="payments/disputes" element={<DisputesPage />} />
        <Route path="wallet" element={<WalletPage />} />

        {/* Business */}
        <Route path="customers" element={<CustomersPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="agents/:id" element={<AgentProfilePage />} />
        <Route path="agents/:id/advanced" element={<AgentAdvancedPage />} />
        <Route path="whitelist" element={<WhitelistPage />} />
        <Route path="apps" element={<AppsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="identity" element={<IdentityPage />} />
        <Route path="create-invoice" element={<CreateInvoicePage />} />

        {/* Settings (nested) */}
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="personal-details" replace />} />
          <Route
            path="personal-details"
            element={<PersonalDetailsSettings />}
          />
          <Route
            path="communication-preferences"
            element={<CommunicationPreferencesSettings />}
          />
          <Route path="business" element={<BusinessSettings />} />
          <Route path="team" element={<TeamSettings />} />
          <Route path="notifications" element={<NotificationsSettings />} />
          <Route path="plans" element={<PlansSettings />} />
          <Route path="4mica-profile" element={<ProfileSettings />} />
          <Route path="compliance" element={<ComplianceSettings />} />
          <Route path="developer" element={<DeveloperSettings />} />
        </Route>

        <Route path="help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
