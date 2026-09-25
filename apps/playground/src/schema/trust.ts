import * as v from "valibot";

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export const REPORT_REASONS = [
  "SCAM",
  "NOT_WORKING",
  "MISLEADING_PRICING",
  "SPAM",
  "OTHER",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const RatingSchema = v.pipe(
  v.union([v.string(), v.number()]),
  v.transform(Number),
  v.number("must be a number"),
  v.integer("must be a whole number"),
  v.minValue(RATING_MIN, "must be at least 1"),
  v.maxValue(RATING_MAX, "must be at most 5"),
);

const optionalText = (max: number) =>
  v.pipe(
    v.nullish(v.string(), ""),
    v.transform((value) => value.trim()),
    v.maxLength(max, `must be ${max} characters or shorter`),
    v.transform((value) => (value === "" ? null : value)),
  );

export const SubmitReviewSchema = v.object({
  rating: RatingSchema,
  title: optionalText(120),
  body: optionalText(2000),
});

export const FileReportSchema = v.object({
  reason: v.picklist(REPORT_REASONS, "choose a reason"),
  detail: optionalText(2000),
});

export type SubmitReviewInput = v.InferOutput<typeof SubmitReviewSchema>;
export type FileReportInput = v.InferOutput<typeof FileReportSchema>;

export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verifiedPurchase: boolean;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
}

export interface TrustSummary {
  ratingCount: number;
  ratingAverage: number | null;
  verifiedCount: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}
