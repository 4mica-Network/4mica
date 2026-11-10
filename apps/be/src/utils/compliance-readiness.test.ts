import { describe, expect, it } from "vitest";
import {
  COMPLIANCE_REQUIREMENTS,
  missingRequirements,
  type ReadinessBusiness,
  type ReadinessProfile,
} from "./compliance-readiness";

const BUSINESS: ReadinessBusiness = {
  legalName: "Atlas Research Ltd",
  businessType: "LLC",
  registrationNumber: "12345678",
  taxId: "GB123",
  website: "https://atlas.example",
  addressLine1: "1 Market St",
  city: "London",
  postalCode: "EC1A 1AA",
  country: "GB",
};

const PROFILE: ReadinessProfile = {
  incorporationCountry: "GB",
  incorporatedOn: new Date("2020-01-01"),
  monthlyVolume: "UNDER_10K",
  customerBase: "BUSINESSES",
  customerRegions: ["GB"],
  isRegulated: false,
  licenceType: null,
  licenceNumber: null,
  regulator: null,
  complianceOfficerName: "Ada Lovelace",
  complianceOfficerEmail: "ada@atlas.example",
  termsUrl: "https://atlas.example/terms",
  privacyUrl: "https://atlas.example/privacy",
  fundsSource: "BUSINESS_REVENUE",
  fundsSourceDetail: null,
  sanctionsAttestedAt: new Date(),
  prohibitedAttestedAt: new Date(),
  accuracyAttestedAt: new Date(),
  attestedBy: "Ada Lovelace",
};

const OWNERS = [{ role: "OWNER" }];

describe("missingRequirements", () => {
  it("asks for nothing once every requirement is met", () => {
    expect(missingRequirements(BUSINESS, PROFILE, OWNERS)).toEqual([]);
  });

  it("asks for everything when nothing has been filled in", () => {
    expect(missingRequirements(null, null, [])).toEqual(
      COMPLIANCE_REQUIREMENTS.filter((key) => key !== "profile.licence"),
    );
  });

  it("needs a full address, not just a country", () => {
    expect(
      missingRequirements({ ...BUSINESS, city: " " }, PROFILE, OWNERS),
    ).toEqual(["business.address"]);
  });

  it("needs licence details only from a regulated business", () => {
    expect(
      missingRequirements(BUSINESS, { ...PROFILE, isRegulated: true }, OWNERS),
    ).toEqual(["profile.licence"]);
  });

  it("needs an explanation when the source of funds is other", () => {
    expect(
      missingRequirements(
        BUSINESS,
        { ...PROFILE, fundsSource: "OTHER" },
        OWNERS,
      ),
    ).toEqual(["profile.fundsSource"]);
  });

  it("needs someone who owns or controls the business", () => {
    expect(
      missingRequirements(BUSINESS, PROFILE, [{ role: "DIRECTOR" }]),
    ).toEqual(["owners.control"]);
  });

  it("needs every attestation and the name of who signed them", () => {
    expect(
      missingRequirements(
        BUSINESS,
        { ...PROFILE, prohibitedAttestedAt: null },
        OWNERS,
      ),
    ).toEqual(["attestations"]);
    expect(
      missingRequirements(BUSINESS, { ...PROFILE, attestedBy: null }, OWNERS),
    ).toEqual(["attestations"]);
  });
});
