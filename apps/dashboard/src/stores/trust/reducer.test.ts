import { describe, expect, it } from "vitest";
import {
  faqsChanged,
  fetchTrustSucceeded,
  replyToReviewSucceeded,
  savePolicySucceeded,
  trustActionFailed,
  updateReportSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import reducer, { INITIAL_STATE } from "./reducer";
import type { Faq, Report, ResourcePolicy, Review, TrustSummary } from "./type";

const summary: TrustSummary = {
  ratingCount: 2,
  ratingAverage: 4,
  verifiedCount: 1,
  openReports: 1,
  unansweredReviews: 1,
  distribution: { "1": 0, "2": 0, "3": 1, "4": 0, "5": 1 },
};

const review = (over: Partial<Review> = {}): Review =>
  ({
    id: "r1",
    rating: 5,
    title: null,
    body: null,
    verifiedPurchase: true,
    ownerReply: null,
    ownerRepliedAt: null,
    hiddenAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    author: { username: "dana", name: "Dana", avatarUrl: null },
    ...over,
  }) as Review;

const report = (over: Partial<Report> = {}): Report =>
  ({
    id: "p1",
    reason: "NOT_WORKING",
    detail: null,
    status: "OPEN",
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  }) as Report;

describe("trustReducer", () => {
  it("stores everything one fetch returns", () => {
    const next = reducer(
      INITIAL_STATE,
      fetchTrustSucceeded({
        policy: null,
        summary,
        reviews: [review()],
        reports: [report()],
        faqs: [],
      }),
    );

    expect(next.summary).toEqual(summary);
    expect(next.reviews).toHaveLength(1);
    expect(next.reports).toHaveLength(1);
    expect(next.pending.trust).toBeUndefined();
  });

  it("marks the fetch pending and clears it on failure", () => {
    const pending = reducer(INITIAL_STATE, {
      type: actionTypes.FETCH_TRUST_PENDING,
    });
    expect(pending.pending.trust).toBe(true);

    const failed = reducer(pending, {
      type: actionTypes.FETCH_TRUST_FAILED,
      payload: { message: "nope" },
    });
    expect(failed.pending.trust).toBeUndefined();
    expect(failed.error).toBe("nope");
  });

  it("replaces only the review that was replied to", () => {
    const state = {
      ...INITIAL_STATE,
      reviews: [review({ id: "r1" }), review({ id: "r2" })],
    };

    const next = reducer(
      state,
      replyToReviewSucceeded(review({ id: "r2", ownerReply: "Fixed." })),
    );

    expect(next.reviews[0].ownerReply).toBeNull();
    expect(next.reviews[1].ownerReply).toBe("Fixed.");
  });

  it("replaces only the report that changed", () => {
    const state = {
      ...INITIAL_STATE,
      reports: [report({ id: "p1" }), report({ id: "p2" })],
    };

    const next = reducer(
      state,
      updateReportSucceeded(report({ id: "p2", status: "RESOLVED" })),
    );

    expect(next.reports[0].status).toBe("OPEN");
    expect(next.reports[1].status).toBe("RESOLVED");
  });

  it("keeps per-row pending keys isolated", () => {
    const a = reducer(INITIAL_STATE, {
      type: actionTypes.REPLY_TO_REVIEW_REQUESTED,
      meta: { pendingKey: "review:r1" },
    });
    const b = reducer(a, {
      type: actionTypes.UPDATE_REPORT_REQUESTED,
      meta: { pendingKey: "report:p1" },
    });

    expect(b.pending).toEqual({ "review:r1": true, "report:p1": true });

    const done = reducer(b, replyToReviewSucceeded(review({ id: "r1" })));
    expect(done.pending).toEqual({ "report:p1": true });
  });

  it("surfaces server validation issues against their field", () => {
    const next = reducer(
      INITIAL_STATE,
      trustActionFailed(
        "The request body failed validation.",
        { supportEmail: "must be an email address" },
        { pendingKey: "savePolicy" },
      ),
    );

    expect(next.validationIssues.supportEmail).toBe("must be an email address");
    expect(next.pending.savePolicy).toBeUndefined();
  });

  it("clears the saved policy pending flag", () => {
    const saving = reducer(INITIAL_STATE, {
      type: actionTypes.SAVE_POLICY_REQUESTED,
      meta: { pendingKey: "savePolicy" },
    });
    expect(saving.pending.savePolicy).toBe(true);

    const saved = reducer(
      saving,
      savePolicySucceeded({ id: "p" } as ResourcePolicy),
    );
    expect(saved.pending.savePolicy).toBeUndefined();
    expect(saved.policy?.id).toBe("p");
  });

  const faq = (id: string, sortOrder: number): Faq => ({
    id,
    question: id.toUpperCase(),
    answer: id,
    sortOrder,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });

  it("swaps the whole faq list on a reorder", () => {
    const state = {
      ...INITIAL_STATE,
      faqs: [faq("a", 0), faq("b", 1)],
      pending: { "faq:order": true },
    };

    const next = reducer(
      state,
      faqsChanged([faq("b", 0), faq("a", 1)], "faq:order"),
    );

    expect(next.faqs.map((faq) => faq.id)).toEqual(["b", "a"]);
    expect(next.pending["faq:order"]).toBeUndefined();
  });

  it("resets when the page unmounts so another app never shows stale data", () => {
    const state = { ...INITIAL_STATE, summary, reviews: [review()] };

    expect(reducer(state, { type: actionTypes.RESET_TRUST })).toEqual(
      INITIAL_STATE,
    );
  });
});
