"use client";

import { Mail, Phone } from "lucide-react";
import {
  ActionGroup,
  copyText,
  type GroupAction,
} from "@/components/ActionGroup";
import { messages } from "@/i18n";

export interface ProfileContactProps {
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
}

export function ProfileContact({
  email,
  emailVerified,
  phoneNumber,
}: ProfileContactProps) {
  const actions: GroupAction[] = [];

  if (email) {
    actions.push({
      id: "email",
      label: messages.profile.email,
      ariaLabel: emailVerified
        ? messages.profile.copyVerifiedEmail
        : messages.profile.copyEmail,
      icon: Mail,
      run: () => copyText(email, messages.profile.emailCopied),
    });
  }

  if (phoneNumber) {
    actions.push({
      id: "phone",
      label: messages.profile.phone,
      ariaLabel: messages.profile.copyPhone,
      icon: Phone,
      run: () => copyText(phoneNumber, messages.profile.phoneCopied),
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <ActionGroup
      className="-ml-1.5 self-start border-0 p-0"
      iconOnly
      label={messages.profile.contact}
      actions={actions}
    />
  );
}
