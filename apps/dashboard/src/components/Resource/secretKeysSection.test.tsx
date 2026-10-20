import type { ApiKey } from "@stores/developer/type";
import type { ResourceKeyState } from "@stores/resourceKey/type";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch, storeState } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  storeState: { resourceKey: {} as Record<string, unknown> },
}));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(storeState),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { SecretKeysSection } = await import("./SecretKeysSection");
const actionTypes = (await import("@stores/resourceKey/actionTypes")).default;
const { INITIAL_STATE } = await import("@stores/resourceKey/reducer");

const resource = { kind: "listing" as const, id: "listing_1" };

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "key_1",
  name: "Production",
  prefix: "4mica_sk_ab12",
  last4: "wxyz",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
  ...over,
});

const seed = (over: Partial<ResourceKeyState> = {}) => {
  storeState.resourceKey = { ...INITIAL_STATE, hasLoaded: true, ...over };
};

const typesDispatched = () =>
  dispatch.mock.calls.map(([action]) => (action as { type: string }).type);

describe("SecretKeysSection", () => {
  beforeEach(() => {
    dispatch.mockClear();
    seed();
  });

  it("loads the keys for its resource on mount and resets on unmount", () => {
    const { unmount } = render(<SecretKeysSection resource={resource} />);

    expect(dispatch.mock.calls[0][0]).toEqual({
      type: actionTypes.FETCH_RESOURCE_KEYS_REQUESTED,
      payload: resource,
    });

    unmount();
    expect(typesDispatched()).toContain(actionTypes.RESET_RESOURCE_KEYS);
  });

  it("shows an empty state until a key exists", () => {
    render(<SecretKeysSection resource={resource} />);

    expect(
      screen.getByTestId("secret-keys-empty-empty-state-title"),
    ).toBeInTheDocument();
  });

  it("lists each key by name and masked value", () => {
    seed({ items: [key(), key({ id: "key_2", name: "Staging" })] });
    render(<SecretKeysSection resource={resource} />);

    expect(screen.getByTestId("secret-key-row-key_1")).toHaveTextContent(
      "Production",
    );
    expect(screen.getByTestId("secret-key-row-key_1")).toHaveTextContent(
      "4mica_sk_ab12…wxyz",
    );
    expect(screen.getByTestId("secret-key-row-key_2")).toHaveTextContent(
      "Staging",
    );
  });

  it("only creates once a name is typed", () => {
    render(<SecretKeysSection resource={resource} />);

    const button = screen.getByTestId("secret-key-create");
    expect(button).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText("appDetail.keys.namePlaceholder"),
      { target: { value: "  Production  " } },
    );
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(dispatch).toHaveBeenCalledWith({
      type: actionTypes.CREATE_RESOURCE_KEY_REQUESTED,
      payload: { resource, name: "Production" },
      meta: { pendingKey: "createResourceKey" },
    });
  });

  it("shows the plaintext once after a create", () => {
    seed({
      items: [key()],
      revealed: { id: "key_1", plaintext: "4mica_sk_secret_value" },
    });
    render(<SecretKeysSection resource={resource} />);

    expect(screen.getByTestId("secret-key-reveal")).toHaveTextContent(
      "4mica_sk_secret_value",
    );

    fireEvent.click(screen.getByText("developer.reveal.dismiss"));
    expect(typesDispatched()).toContain(
      actionTypes.DISMISS_REVEALED_RESOURCE_KEY,
    );
  });

  it("revokes and deletes against the resource the page is on", () => {
    seed({ items: [key()] });
    render(<SecretKeysSection resource={resource} />);

    fireEvent.click(screen.getByTestId("secret-key-revoke-key_1"));
    fireEvent.click(
      screen.getByTestId(
        "secret-key-revoke-key_1-popup-confirm-confirm-popup-confirm",
      ),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: actionTypes.REVOKE_RESOURCE_KEY_REQUESTED,
      payload: { resource, keyId: "key_1" },
      meta: { pendingKey: "resourceKey:key_1" },
    });

    fireEvent.click(screen.getByTestId("secret-key-delete-key_1"));
    fireEvent.click(
      screen.getByTestId(
        "secret-key-delete-key_1-popup-confirm-confirm-popup-confirm",
      ),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: actionTypes.DELETE_RESOURCE_KEY_REQUESTED,
      payload: { resource, keyId: "key_1" },
      meta: { pendingKey: "resourceKey:key_1" },
    });
  });

  it("hides revoke on a revoked key and labels it", () => {
    seed({ items: [key({ revokedAt: "2026-10-08T01:00:00.000Z" })] });
    render(<SecretKeysSection resource={resource} />);

    expect(screen.queryByTestId("secret-key-revoke-key_1")).toBeNull();
    expect(screen.getByTestId("secret-key-row-key_1")).toHaveTextContent(
      "appDetail.keys.revoked",
    );
  });
});
