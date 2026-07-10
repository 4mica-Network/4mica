import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AgentProfilePage } from "./pages/AgentProfilePage";
import { AgentsPage } from "./pages/AgentsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { WhitelistPage } from "./pages/WhitelistPage";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/agents" replace />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:id" element={<AgentProfilePage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/whitelist" element={<WhitelistPage />} />
        <Route path="*" element={<Navigate to="/agents" replace />} />
      </Routes>
    </Layout>
  );
}
