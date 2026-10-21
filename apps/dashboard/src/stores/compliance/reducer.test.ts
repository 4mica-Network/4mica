import { describe, expect, it } from "vitest";
import {
  complianceActionFailed,
  createOwner,
  createOwnerSucceeded,
  fetchComplianceSucceeded,
  submitCompliance,
  submitComplianceSucceeded,
  updateCompliance,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { ComplianceSnapshot } from "./type";

const SNAPSHOT: ComplianceSnapshot = {
  kybStatus: "UNVERIFIED",
  profile: null,
  owners: [],
  missing: ["owners", "attestations"],
};

describe("compliance reducer", () => {
  it("takes the whole snapshot when it loads", () => {
    const state = reducer(INITIAL_STATE, fetchComplianceSucceeded(SNAPSHOT));

    expect(state.hasLoaded).toBe(true);
    expect(state.missing).toEqual(["owners", "attestations"]);
  });

  it("tracks each save under its own section", () => {
    const saving = reducer(
      INITIAL_STATE,
      updateCompliance({ regulator: "FCA" }, "licence"),
    );

    expect(saving.pending).toEqual({ "section:licence": true });
  });

  it("refreshes what is missing after a person is added", () => {
    const request = createOwner({
      fullName: "Ada Lovelace",
      role: "OWNER",
      ownershipPercent: 100,
      dateOfBirth: "1985-12-10",
      nationality: "GB",
      countryOfResidence: "GB",
      email: null,
      isPep: false,
    });
    const adding = reducer(INITIAL_STATE, request);

    expect(adding.pending).toEqual({ createOwner: true });

    const done = reducer(
      adding,
      createOwnerSucceeded(
        { ...SNAPSHOT, missing: ["attestations"] },
        request.meta,
      ),
    );

    expect(done.missing).toEqual(["attestations"]);
    expect(done.pending).toEqual({});
  });

  it("moves to review on a successful submission", () => {
    const { meta } = submitCompliance();
    const state = reducer(
      reducer(INITIAL_STATE, submitCompliance()),
      submitComplianceSucceeded(
        { ...SNAPSHOT, kybStatus: "PENDING", missing: [] },
        meta,
      ),
    );

    expect(state.kybStatus).toBe("PENDING");
    expect(state.pending).toEqual({});
  });

  it("keeps the field issues a failed save reported", () => {
    const { meta } = updateCompliance({ termsUrl: "nope" }, "policies");
    const state = reducer(
      reducer(
        INITIAL_STATE,
        updateCompliance({ termsUrl: "nope" }, "policies"),
      ),
      complianceActionFailed(
        "The request body failed validation.",
        { termsUrl: "must be an http:// or https:// URL" },
        meta,
      ),
    );

    expect(state.validationIssues).toEqual({
      termsUrl: "must be an http:// or https:// URL",
    });
    expect(state.pending).toEqual({});
  });
});
