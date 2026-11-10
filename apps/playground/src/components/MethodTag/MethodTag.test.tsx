import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MethodTag } from ".";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

describe("MethodTag", () => {
  it("gives every HTTP method its own colour", () => {
    const tones = METHODS.map((method) => {
      const { unmount } = render(<MethodTag method={method} />);
      const tone = screen.getByText(method).parentElement?.className;
      unmount();
      return tone;
    });

    expect(new Set(tones).size).toBe(METHODS.length);
  });
});
