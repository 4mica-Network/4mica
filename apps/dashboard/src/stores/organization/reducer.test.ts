import { describe, expect, it } from "vitest";
import type { RootState } from "..";
import {
  activeOrganizationSet,
  fetchInvitation,
  fetchInvitationSucceeded,
  fetchOrganizationsFailed,
  fetchOrganizationsPending,
  fetchOrganizationsSucceeded,
  leaveOrganizationSucceeded,
  updateOrganizationSucceeded,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import {
  organizationHeaders,
  selectActiveOrganization,
  selectCan,
  selectHasResolvedOrganizations,
} from "./selector";
import type { InvitationPreview, OrganizationSummary } from "./type";

const organization = (
  over: Partial<OrganizationSummary> = {},
): OrganizationSummary => ({
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "DEVELOPER",
  permissions: ["resources.read", "resources.write", "payments.read"],
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const loaded = reducer(
  INITIAL_STATE,
  fetchOrganizationsSucceeded({
    items: [
      organization({
        id: "personal",
        personal: true,
        role: "OWNER",
        permissions: ["wallets.manage"],
      }),
      organization(),
    ],
    defaultId: "personal",
    activeId: "acme",
  }),
);

const root = (organizationState = loaded) =>
  ({ organization: organizationState }) as RootState;

describe("organization reducer", () => {
  it("stays resolved while a refetch is in flight", () => {
    const pending = reducer(loaded, fetchOrganizationsPending());
    expect(pending.status).toBe("loaded");
  });

  it("resolves as failed when the first load fails", () => {
    const failed = reducer(INITIAL_STATE, fetchOrganizationsFailed("nope"));
    expect(selectHasResolvedOrganizations(root(failed))).toBe(true);
  });

  it("replaces an updated organization in place", () => {
    const next = reducer(
      loaded,
      updateOrganizationSucceeded(organization({ name: "Acme Ltd" }), {
        pendingKey: "updateOrganization",
      }),
    );
    expect(next.items.map((item) => item.name)).toEqual(["Acme", "Acme Ltd"]);
  });

  it("drops an organization the user left", () => {
    const next = reducer(
      loaded,
      leaveOrganizationSucceeded("acme", { pendingKey: "leaveOrganization" }),
    );
    expect(next.items.map((item) => item.id)).toEqual(["personal"]);
  });

  it("ignores a preview for a token it is no longer showing", () => {
    const viewing = reducer(loaded, fetchInvitation("new"));
    const raced = reducer(
      viewing,
      fetchInvitationSucceeded("old", {} as InvitationPreview),
    );
    expect(raced.invitation).toEqual(viewing.invitation);
  });
});

describe("organization selectors", () => {
  it("finds the active organization", () => {
    expect(selectActiveOrganization(root())?.id).toBe("acme");
  });

  it("answers permission checks from the active organization", () => {
    expect(selectCan("resources.write")(root())).toBe(true);
    expect(selectCan("wallets.manage")(root())).toBe(false);

    const owner = reducer(loaded, activeOrganizationSet("personal"));
    expect(selectCan("wallets.manage")(root(owner))).toBe(true);
  });

  it("does not block anything before an organization is known", () => {
    expect(selectCan("wallets.manage")({} as RootState)).toBe(true);
  });

  it("sends the active organization as X-Org-Id", () => {
    expect(organizationHeaders(root())).toEqual({ "X-Org-Id": "acme" });
    expect(organizationHeaders(root(INITIAL_STATE))).toBeNull();
  });
});
