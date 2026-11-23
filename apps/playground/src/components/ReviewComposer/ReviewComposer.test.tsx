import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { messages, t } from "@/i18n";

vi.mock("@/actions/trust", () => ({
  submitReview: vi.fn(async () => ({ ok: true })),
  deleteOwnReview: vi.fn(async () => ({ ok: true })),
}));

const { ReviewComposer } = await import(".");

const resource = {
  kind: "listing" as const,
  id: "l1",
  username: "atlas",
  ref: "weather",
};

const star = (score: number) =>
  screen.getByRole("button", {
    name: t(messages.trust.rateN, { count: String(score) }),
  });

describe("ReviewComposer", () => {
  it("labels the rating group and the text fields", () => {
    render(
      <ReviewComposer
        canReview
        existing={null}
        resource={resource}
        signInHref="/sign-in"
      />,
    );

    expect(
      screen.getByRole("group", { name: messages.trust.ratingLabel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: messages.trust.titleLabel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: messages.trust.bodyLabel }),
    ).toBeInTheDocument();
  });

  it("does not fill stars on focus and marks the chosen one pressed", async () => {
    const user = userEvent.setup();
    render(
      <ReviewComposer
        canReview
        existing={null}
        resource={resource}
        signInHref="/sign-in"
      />,
    );

    await user.tab();
    await user.tab();
    await user.tab();
    expect(star(3)).toHaveFocus();
    expect(star(3).querySelector("svg")).not.toHaveClass("fill-warning");

    await user.keyboard("{Enter}");
    expect(star(3)).toHaveAttribute("aria-pressed", "true");
    expect(star(2)).toHaveAttribute("aria-pressed", "false");
  });

  it("announces a missing rating", async () => {
    const user = userEvent.setup();
    render(
      <ReviewComposer
        canReview
        existing={null}
        resource={resource}
        signInHref="/sign-in"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: messages.trust.postReview }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      messages.trust.errorNoRating,
    );
  });

  it("returns focus to the first star after deleting", async () => {
    const user = userEvent.setup();
    render(
      <ReviewComposer
        canReview
        existing={{
          id: "r1",
          rating: 4,
          title: "Good",
          body: null,
          verifiedPurchase: false,
          ownerReply: null,
          ownerRepliedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          authorId: "u1",
          authorName: "Ada",
          authorUsername: null,
          authorAvatarUrl: null,
        }}
        resource={resource}
        signInHref="/sign-in"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: messages.trust.deleteReview }),
    );

    await waitFor(() => expect(star(1)).toHaveFocus());
  });
});
