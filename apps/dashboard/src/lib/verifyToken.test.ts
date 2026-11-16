import { beforeEach, describe, expect, it } from "vitest";
import {
  captureVerifyToken,
  clearVerifyToken,
  readVerifyToken,
} from "./verifyToken";

const visit = (url: string) => window.history.replaceState(null, "", url);
const currentUrl = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

describe("verifyToken", () => {
  beforeEach(() => {
    clearVerifyToken();
    visit("/");
  });

  it("takes the token out of the fragment and off the URL", () => {
    visit("/settings/profile#verifyToken=4mica_ev_good");

    captureVerifyToken();

    expect(currentUrl()).toBe("/settings/profile");
    expect(readVerifyToken()).toBe("4mica_ev_good");
  });

  it("still accepts a link that carries the token in the query", () => {
    visit("/settings/profile?verifyToken=4mica_ev_old&tab=1");

    captureVerifyToken();

    expect(currentUrl()).toBe("/settings/profile?tab=1");
    expect(readVerifyToken()).toBe("4mica_ev_old");
  });

  it("leaves an unrelated URL untouched", () => {
    visit("/settings/profile?verify=success#section");

    captureVerifyToken();

    expect(currentUrl()).toBe("/settings/profile?verify=success#section");
    expect(readVerifyToken()).toBeNull();
  });

  it("forgets the token once cleared", () => {
    visit("/settings/profile#verifyToken=4mica_ev_good");
    captureVerifyToken();

    clearVerifyToken();

    expect(readVerifyToken()).toBeNull();
  });
});
