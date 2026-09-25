"use client";

import { Button } from "@4mica/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Flag } from "lucide-react";
import { useState, useTransition } from "react";
import { fileReport } from "@/actions/trust";
import { messages } from "@/i18n";
import { REPORT_REASONS, type ReportReason } from "@/schema/trust";

export interface ReportDialogProps {
  resource: {
    kind: "listing" | "agent";
    id: string;
    username: string;
    ref: string;
  };
  canReport: boolean;
  signInHref: string;
}

const REASON_LABEL: Record<ReportReason, string> = {
  SCAM: messages.trust.reasonScam,
  NOT_WORKING: messages.trust.reasonNotWorking,
  MISLEADING_PRICING: messages.trust.reasonMisleadingPricing,
  SPAM: messages.trust.reasonSpam,
  OTHER: messages.trust.reasonOther,
};

const ERRORS: Record<string, string> = {
  unauthorized: messages.trust.errorSignedOut,
  already_reported: messages.trust.errorAlreadyReported,
  invalid_report: messages.trust.errorInvalidReport,
  not_found: messages.trust.errorNotFound,
};

export function ReportDialog({
  resource,
  canReport,
  signInHref,
}: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("NOT_WORKING");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();

  const send = () => {
    setError(null);

    startTransition(async () => {
      const result = await fileReport(resource, { reason, detail });

      if (result.ok) {
        setDone(true);
        return;
      }

      setError(ERRORS[result.error ?? ""] ?? messages.trust.errorGeneric);
    });
  };

  if (done) {
    return (
      <p className="text-ink-muted text-sm">{messages.trust.reportThanks}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 self-start text-ink-subtle text-sm transition-colors hover:text-ink-body"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Flag aria-hidden="true" className="h-3.5 w-3.5" />
        {messages.trust.reportAction}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    height: { type: "spring", stiffness: 260, damping: 34 },
                    opacity: { duration: 0.18 },
                  }
            }
          >
            {canReport ? (
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {REPORT_REASONS.map((value) => (
                    <button
                      className={
                        value === reason
                          ? "rounded-full border border-overlay/30 bg-overlay/10 px-3 py-1 text-ink-strong text-xs"
                          : "rounded-full border border-overlay/10 px-3 py-1 text-ink-muted text-xs transition-colors hover:text-ink-body"
                      }
                      key={value}
                      onClick={() => setReason(value)}
                      type="button"
                    >
                      {REASON_LABEL[value]}
                    </button>
                  ))}
                </div>

                <textarea
                  className="w-full rounded-md border border-overlay/15 bg-transparent px-3 py-2 text-ink-body text-sm outline-none placeholder:text-ink-subtle focus:border-overlay/30"
                  maxLength={2000}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder={messages.trust.reportPlaceholder}
                  rows={3}
                  value={detail}
                />

                <div className="flex items-center gap-2">
                  <Button
                    disabled={pending}
                    onClick={send}
                    intent="outline"
                    size="sm"
                    type="button"
                  >
                    {messages.trust.reportSubmit}
                  </Button>
                  <span className="text-ink-subtle text-xs">
                    {messages.trust.reportNote}
                  </span>
                </div>

                {error && <p className="text-danger text-sm">{error}</p>}
              </div>
            ) : (
              <p className="pt-1 text-ink-muted text-sm">
                {messages.trust.signInToReport}{" "}
                <a
                  className="text-ink-strong underline underline-offset-2"
                  href={signInHref}
                >
                  {messages.auth.signIn}
                </a>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
