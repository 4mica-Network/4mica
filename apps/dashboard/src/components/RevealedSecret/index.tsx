import { Button, cn } from "@4mica/ui";
import { dismissRevealedSecret } from "@stores/developer/actions";
import { selectRevealedSecret } from "@stores/developer/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SurfaceCard } from "@/components/layout";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

export function SecretRevealCard({
  title,
  plaintext,
  onDismiss,
  className,
  "data-testid": testId,
}: {
  title: string;
  plaintext: string;
  onDismiss: () => void;
  className?: string;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();
  const { copied, copy: copyText } = useCopyToClipboard();
  const copy = () => copyText(plaintext);

  return (
    <SurfaceCard
      className={cn("border-warning/40 bg-warning/5", className)}
      data-testid={testId}
    >
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="font-semibold text-ink-strong text-sm">{title}</h4>
          <p className="mt-0.5 text-ink-muted text-xs">
            {t("developer.reveal.description")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-overlay/15 bg-surface-deep px-3 py-2 font-mono text-ink-body text-xs">
            {plaintext}
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
          <Button type="button" size="sm" intent="ghost" onClick={onDismiss}>
            {t("developer.reveal.dismiss")}
          </Button>
        </div>
      </div>
    </SurfaceCard>
  );
}

export function RevealedSecretBanner() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const revealed = useAppSelector(selectRevealedSecret);

  if (!revealed) {
    return null;
  }

  return (
    <SecretRevealCard
      title={
        revealed.kind === "apiKey"
          ? t("developer.reveal.keyTitle")
          : t("developer.reveal.secretTitle")
      }
      plaintext={revealed.plaintext}
      onDismiss={() => dispatch(dismissRevealedSecret())}
    />
  );
}
