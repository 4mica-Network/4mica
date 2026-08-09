import { Button } from "@4mica/ui";
import { dismissRevealedSecret } from "@stores/developer/actions";
import { selectRevealedSecret } from "@stores/developer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/form";

/**
 * The plaintext exists only in this response, so the banner stays until the
 * user dismisses it rather than disappearing on the next render.
 */
export function RevealedSecretBanner() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const revealed = useAppSelector(selectRevealedSecret);
  const [copied, setCopied] = useState(false);

  if (!revealed) {
    return null;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(revealed.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the value stays selectable on screen.
    }
  };

  return (
    <Card className="border-warning/40 bg-warning/5">
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="font-semibold text-ink-strong text-sm">
            {revealed.kind === "apiKey"
              ? t("developer.reveal.keyTitle")
              : t("developer.reveal.secretTitle")}
          </h4>
          <p className="mt-0.5 text-ink-muted text-xs">
            {t("developer.reveal.description")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-overlay/15 bg-surface-deep px-3 py-2 font-mono text-ink-body text-xs">
            {revealed.plaintext}
          </code>
          <Button
            type="button"
            size="sm"
            intent="invert"
            className="btn-no-lift shrink-0"
            onClick={() => void copy()}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">
              {copied ? t("developer.copied") : t("developer.copy")}
            </span>
          </Button>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            intent="ghost"
            onClick={() => dispatch(dismissRevealedSecret())}
          >
            {t("developer.reveal.dismiss")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
