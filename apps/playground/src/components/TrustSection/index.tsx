import { ReportDialog } from "@/components/ReportDialog";
import { ReviewComposer } from "@/components/ReviewComposer";
import { ReviewList } from "@/components/ReviewList";
import { TrustPanel } from "@/components/TrustPanel";
import { messages } from "@/i18n";
import type { PublicProfile } from "@/schema/profile";
import type { ResourceKind } from "@/services/trust";
import {
  getPolicy,
  getTrustSummary,
  getViewerReview,
  listReviews,
} from "@/services/trust";
import { getViewer } from "@/services/viewer";

export interface TrustSectionProps {
  kind: ResourceKind;
  id: string;
  resourceRef: string;
  profile: PublicProfile;
  publishedAt: string | null;
}

export async function TrustSection({
  kind,
  id,
  resourceRef,
  profile,
  publishedAt,
}: TrustSectionProps) {
  const viewer = await getViewer();
  const [summary, policy, reviews] = await Promise.all([
    getTrustSummary(kind, id),
    getPolicy(kind, id),
    listReviews(kind, id),
  ]);

  const existing = viewer ? await getViewerReview(kind, id, viewer.id) : null;
  const resource = {
    kind,
    id,
    username: profile.username,
    ref: resourceRef,
  };
  const ownerName = profile.name || `@${profile.username}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(
    kind === "listing"
      ? `/${profile.username}/api/${resourceRef}`
      : `/${profile.username}/agents/${resourceRef}`,
  )}`;

  return (
    <div className="flex flex-col gap-8">
      <TrustPanel policy={policy} publishedAt={publishedAt} summary={summary} />

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
          {messages.trust.reviewsHeading}
        </h2>

        <ReviewList ownerName={ownerName} reviews={reviews} />

        {!profile.isOwner && (
          <ReviewComposer
            canReview={viewer !== null}
            existing={existing}
            resource={resource}
            signInHref={signInHref}
          />
        )}

        {!profile.isOwner && (
          <ReportDialog
            canReport={viewer !== null}
            resource={resource}
            signInHref={signInHref}
          />
        )}
      </section>
    </div>
  );
}
