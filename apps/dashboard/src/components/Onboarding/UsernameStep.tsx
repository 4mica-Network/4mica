import { Spinner } from "@4mica/ui";
import { isGeneratedUsername } from "@4mica/url";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { checkUsername, resetUsernameCheck } from "@stores/user/actions";
import { selectUsernameCheck } from "@stores/user/selector";
import { useDebounceEffect } from "ahooks";
import { Check, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, TextInput } from "@/components/form";
import { links } from "@/lib/links";
import { isUsernameShapeValid } from "./validation";

export function UsernameStep({
  value,
  onChange,
  savedUsername,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The handle currently on the server, generated or chosen. */
  savedUsername: string;
  error?: string;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const check = useAppSelector(selectUsernameCheck);

  const candidate = value.trim().toLowerCase();
  const isGenerated = isGeneratedUsername(savedUsername);

  useEffect(() => {
    return () => {
      dispatch(resetUsernameCheck());
    };
  }, [dispatch]);

  useDebounceEffect(
    () => {
      if (!isUsernameShapeValid(candidate) || candidate === savedUsername) {
        return;
      }
      dispatch(checkUsername(candidate));
    },
    [candidate, savedUsername],
    { wait: 450 },
  );

  const isCurrent = candidate === savedUsername;
  const status = check.value === candidate ? check.status : "idle";

  const statusMessage = (): { text: string; tone: string } | null => {
    if (error) {
      return null;
    }
    if (isCurrent && !isGenerated) {
      return { text: t("onboarding.username.current"), tone: "text-ink-muted" };
    }
    if (candidate.length > 0 && !isUsernameShapeValid(candidate)) {
      return { text: t("onboarding.username.invalid"), tone: "text-danger" };
    }
    switch (status) {
      case "checking":
        return {
          text: t("onboarding.username.checking"),
          tone: "text-ink-muted",
        };
      case "available":
        return {
          text: t("onboarding.username.available", { username: candidate }),
          tone: "text-success",
        };
      case "taken":
        return {
          text: t("onboarding.username.taken", { username: candidate }),
          tone: "text-danger",
        };
      case "reserved":
        return { text: t("onboarding.username.reserved"), tone: "text-danger" };
      case "blacklisted":
        return {
          text: t("onboarding.username.blacklisted"),
          tone: "text-danger",
        };
      default:
        return null;
    }
  };

  const message = statusMessage();

  const trailingIcon = () => {
    if (status === "checking") {
      return <Spinner size="sm" />;
    }
    if (status === "available") {
      return <Check className="h-4 w-4 text-success" />;
    }
    if (
      status === "taken" ||
      status === "reserved" ||
      status === "blacklisted"
    ) {
      return <X className="h-4 w-4 text-danger" />;
    }
    return undefined;
  };

  return (
    <div className="flex flex-col gap-1">
      <p className="text-ink-muted text-sm">
        {isGenerated
          ? t("onboarding.username.hintGenerated")
          : t("onboarding.username.hint")}
      </p>

      <FieldRow
        title={t("onboarding.username.label")}
        htmlFor="onboarding-username"
        description={t("onboarding.username.description", {
          url: links.profile(candidate || savedUsername),
        })}
      >
        <TextInput
          id="onboarding-username"
          value={value}
          onChange={onChange}
          placeholder={t("onboarding.username.placeholder")}
          error={error}
          format="lowercase"
          maxLength={64}
          trailingIcon={trailingIcon()}
        />
      </FieldRow>

      {message && (
        <p className={`text-xs ${message.tone}`} aria-live="polite">
          {message.text}
        </p>
      )}
    </div>
  );
}
