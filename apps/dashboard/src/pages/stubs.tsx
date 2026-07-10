import {
  Blocks,
  ChartColumn,
  CircleHelp,
  CreditCard,
  FilePlus,
  Fingerprint,
  Landmark,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { Placeholder } from "../components/Placeholder";

export function BalancesPage() {
  return (
    <Placeholder
      icon={Landmark}
      title="Balances"
      description="Available and pending funds across your assets and networks."
    />
  );
}

export function PaymentsPage() {
  return (
    <Placeholder
      icon={CreditCard}
      title="Payments"
      description="Every x402 payment your account has sent or received."
    />
  );
}

export function DisputesPage() {
  return (
    <Placeholder
      icon={ShieldAlert}
      title="Disputes"
      description="Payments under dispute and their evidence and resolution status."
    />
  );
}

export function WalletPage() {
  return (
    <Placeholder
      icon={Wallet}
      title="Wallet"
      description="Your on-chain wallet, collateral, and withdrawal controls."
    />
  );
}

export function CustomersPage() {
  return (
    <Placeholder
      icon={Users}
      title="Customers"
      description="Counterparties that pay your agents and the value they drive."
    />
  );
}

export function AppsPage() {
  return (
    <Placeholder
      icon={Blocks}
      title="Apps"
      description="Connected apps and integrations built on the 4Mica SDK."
    />
  );
}

export function ReportsPage() {
  return (
    <Placeholder
      icon={ChartColumn}
      title="Reports"
      description="Revenue, volume, and settlement reports you can export."
    />
  );
}

export function IdentityPage() {
  return (
    <Placeholder
      icon={Fingerprint}
      title="Identity"
      description="ERC-8004 validation identity, validators, and trust registries."
    />
  );
}

export function CreateInvoicePage() {
  return (
    <Placeholder
      icon={FilePlus}
      title="Create invoice"
      description="Bill a customer or agent for a one-off or recurring charge."
    />
  );
}

export function HelpPage() {
  return (
    <Placeholder
      icon={CircleHelp}
      title="Help"
      description="Guides, API docs, and support for building on 4Mica."
    />
  );
}
