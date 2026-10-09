import type { HttpMethodName, PublicVisibility } from "@stores/apiListing/type";

export const VISIBILITY_LABEL_KEYS = {
  PRIVATE: "apiListing.visibility.private",
  UNLISTED: "apiListing.visibility.unlisted",
  PUBLIC: "apiListing.visibility.public",
} as const satisfies Record<PublicVisibility, string>;

export const VISIBILITY_TAG_VARIANT = {
  PRIVATE: "neutral",
  UNLISTED: "warning",
  PUBLIC: "success",
} as const satisfies Record<
  PublicVisibility,
  "neutral" | "warning" | "success"
>;

export const VISIBILITY_OPTIONS = (
  Object.keys(VISIBILITY_LABEL_KEYS) as PublicVisibility[]
).map((value) => ({ value, labelKey: VISIBILITY_LABEL_KEYS[value] }));

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const satisfies readonly HttpMethodName[];

export const HTTP_METHOD_OPTIONS = HTTP_METHODS.map((value) => ({
  value,
  title: value,
}));

export const CATEGORY_SUGGESTIONS = [
  "Credit",
  "Data",
  "Identity",
  "Inference",
  "Payments",
  "Search",
  "Storage",
] as const;
