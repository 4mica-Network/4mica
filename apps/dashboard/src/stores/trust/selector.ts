import type { RootState } from "@stores/index";
import type { TrustState } from "./type";

export const selectTrustState = (state: RootState): TrustState => state.trust;

export const selectPolicy = (state: RootState) => state.trust.policy;
export const selectFaqs = (state: RootState) => state.trust.faqs;
export const selectTrustSummary = (state: RootState) => state.trust.summary;
export const selectReviews = (state: RootState) => state.trust.reviews;
export const selectReports = (state: RootState) => state.trust.reports;
export const selectTrustError = (state: RootState) => state.trust.error;

export const selectTrustIssues = (state: RootState) =>
  state.trust.validationIssues;

export const selectIsTrustPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.trust.pending[key]);
