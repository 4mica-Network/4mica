import * as v from "valibot";

export const RecordBannerInteractionSchema = v.object({
  type: v.picklist(
    ["VIEWED", "CLICKED", "DISMISSED", "VIDEO_PLAYED"],
    "must be a known banner interaction type",
  ),
});

export type RecordBannerInteractionInput = v.InferOutput<
  typeof RecordBannerInteractionSchema
>;
