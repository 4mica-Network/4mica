import { Avatar, cn, initials } from "@4mica/ui";
import { useUser } from "@clerk/clerk-react";
import { useAppSelector } from "@stores/hooks";
import type { OrganizationSummary } from "@stores/organization/type";
import { selectUser } from "@stores/user/selector";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const firstNonBlank = (
  ...values: (string | null | undefined)[]
): string | undefined => values.find((value) => value?.trim())?.trim();

export function useDisplayName(): string {
  const { t } = useTranslation();
  const { user } = useUser();
  const currentUser = useAppSelector(selectUser);

  return (
    firstNonBlank(
      currentUser?.name,
      user?.fullName,
      currentUser?.email,
      user?.primaryEmailAddress?.emailAddress,
    ) ?? t("sidebar.newUser")
  );
}

export function UserAvatar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const imageUrl = user?.imageUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <Avatar
      src={imageUrl && imageUrl !== failedUrl ? imageUrl : null}
      onError={() => setFailedUrl(imageUrl ?? null)}
      name={t("monogram")}
      alt=""
      size="xs"
      className={cn("border-0 bg-overlay/15 text-ink-strong", className)}
    />
  );
}

const ORGANIZATION_COLORS = [
  "bg-sky-600",
  "bg-violet-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-indigo-600",
  "bg-teal-600",
  "bg-fuchsia-600",
] as const;

const organizationColor = (id: string): string => {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return ORGANIZATION_COLORS[hash % ORGANIZATION_COLORS.length];
};

export function OrganizationAvatar({
  organization,
  className,
}: {
  organization: Pick<OrganizationSummary, "id" | "name" | "avatarUrl">;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { avatarUrl } = organization;

  if (avatarUrl && avatarUrl !== failedUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        onError={() => setFailedUrl(avatarUrl)}
        className={cn("h-8 w-8 shrink-0 rounded-lg object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg font-semibold text-white text-xs",
        organizationColor(organization.id),
        className,
      )}
    >
      {initials(organization.name)}
    </span>
  );
}
