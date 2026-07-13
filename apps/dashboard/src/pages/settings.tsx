import { useTitle } from "ahooks";

const ORG_NAME = "4Mica Workspace";

function SettingsPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  useTitle(`${title} - ${ORG_NAME}`);
  return (
    <section>
      <h2 className="font-semibold text-ink-strong text-lg">{title}</h2>
      <p className="mt-1 text-ink-muted text-sm">{description}</p>
    </section>
  );
}

export function PersonalDetailsSettings() {
  return (
    <SettingsPanel
      title="Personal details"
      description="Your name, email, and how you sign in."
    />
  );
}

export function CommunicationPreferencesSettings() {
  return (
    <SettingsPanel
      title="Communication preferences"
      description="Choose which product and marketing emails you receive."
    />
  );
}

export function BusinessSettings() {
  return (
    <SettingsPanel
      title="Business"
      description="Legal entity, address, and tax details for your account."
    />
  );
}

export function TeamSettings() {
  return (
    <SettingsPanel
      title="Team"
      description="Invite teammates and manage their roles and permissions."
    />
  );
}

export function NotificationsSettings() {
  return (
    <SettingsPanel
      title="Notifications"
      description="Control alerts for payments, disputes, and agent activity."
    />
  );
}

export function PlansSettings() {
  return (
    <SettingsPanel
      title="Plans"
      description="Your current plan, usage, and billing."
    />
  );
}

export function ProfileSettings() {
  return (
    <SettingsPanel
      title="4Mica profile"
      description="The public profile other agents see when they discover you."
    />
  );
}

export function ComplianceSettings() {
  return (
    <SettingsPanel
      title="Compliance"
      description="KYC/KYB status, verification, and regulatory documents."
    />
  );
}

export function DeveloperSettings() {
  return (
    <SettingsPanel
      title="Developer"
      description="API keys, webhooks, and the sandbox → live switch."
    />
  );
}
