import { Tag } from "@4mica/ui";
import { BadgeCheck, ShieldQuestion } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Stars } from "@/components/Stars";
import { messages, t } from "@/i18n";
import { RATING_MAX, type TrustSummary } from "@/schema/trust";

export interface PolicyFields {
  refundPolicy: string | null;
  uptimeTarget: string | null;
  supportResponse: string | null;
  supportEmail: string | null;
  rateLimit: string | null;
  dataRetention: string | null;
  testEndpoint: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  statusUrl: string | null;
}

interface TrustFact {
  label: string;
  value: string;
}

export interface TrustPanelProps {
  summary: TrustSummary;
  policy: PolicyFields | null;
  publishedAt: string | null;
}

const Bar = ({ count, total }: { count: number; total: number }) => (
  <span className="h-1 flex-1 overflow-hidden rounded-full bg-overlay/10">
    <span
      className="block h-full rounded-full bg-warning/70"
      style={{ width: `${total === 0 ? 0 : (count / total) * 100}%` }}
    />
  </span>
);

export function TrustPanel({ summary, policy, publishedAt }: TrustPanelProps) {
  const { ratingCount, ratingAverage, verifiedCount, distribution } = summary;

  const candidates: (TrustFact | null)[] = [
    policy?.refundPolicy
      ? { label: messages.trust.refundLabel, value: policy.refundPolicy }
      : null,
    policy?.uptimeTarget
      ? { label: messages.trust.uptimeLabel, value: policy.uptimeTarget }
      : null,
    policy?.supportResponse
      ? { label: messages.trust.supportLabel, value: policy.supportResponse }
      : null,
    policy?.rateLimit
      ? { label: messages.trust.rateLimitLabel, value: policy.rateLimit }
      : null,
    policy?.dataRetention
      ? { label: messages.trust.dataLabel, value: policy.dataRetention }
      : null,
  ];

  const facts = candidates.filter((fact): fact is TrustFact => fact !== null);

  return (
    <section className="flex flex-col gap-5">
      <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
        {messages.trust.heading}
      </h2>

      {ratingCount === 0 ? (
        <EmptyState
          description={messages.trust.noRatings}
          icon={<ShieldQuestion className="h-4 w-4" />}
          title={messages.trust.noRatingsTitle}
        />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-3xl text-ink-strong tabular-nums tracking-tight">
              {(ratingAverage ?? 0).toFixed(1)}
            </span>
            <span className="text-ink-subtle text-sm">/ {RATING_MAX}</span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Stars value={ratingAverage ?? 0} />
            <span className="text-ink-muted text-sm">
              {t(
                ratingCount === 1
                  ? messages.trust.ratingCountOne
                  : messages.trust.ratingCountOther,
                { count: String(ratingCount) },
              )}
              {verifiedCount > 0 &&
                ` · ${t(messages.trust.verifiedCount, {
                  count: String(verifiedCount),
                })}`}
            </span>
          </div>

          <div className="flex w-full max-w-45 flex-col gap-1">
            {([5, 4, 3, 2, 1] as const).map((score) => (
              <div className="flex items-center gap-2" key={score}>
                <span className="w-2 text-ink-subtle text-xs tabular-nums">
                  {score}
                </span>
                <Bar
                  count={distribution[String(score) as "1"]}
                  total={ratingCount}
                />
                <span className="w-4 text-right text-ink-subtle text-xs tabular-nums">
                  {distribution[String(score) as "1"]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {facts.length > 0 && (
        <dl className="flex flex-col gap-2 border-overlay/10 border-t pt-4 text-sm">
          {facts.map((fact) => (
            <div
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
              key={fact.label}
            >
              <dt className="w-32 shrink-0 text-ink-subtle">{fact.label}</dt>
              <dd className="min-w-0 flex-1 text-ink-body leading-relaxed">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {publishedAt && (
          <Tag size="sm" variant="neutral">
            {t(messages.trust.listedSince, {
              date: new Date(publishedAt).getFullYear().toString(),
            })}
          </Tag>
        )}
        {verifiedCount > 0 && (
          <Tag size="sm" variant="success">
            <BadgeCheck aria-hidden="true" className="mr-1 h-3 w-3" />
            {messages.trust.hasVerifiedBuyers}
          </Tag>
        )}
        {policy === null && (
          <Tag size="sm" variant="warning">
            {messages.trust.noPolicy}
          </Tag>
        )}
      </div>
    </section>
  );
}
