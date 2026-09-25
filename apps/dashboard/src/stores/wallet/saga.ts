import { HttpError } from "@4mica/http";
import * as api from "@api/wallet";
import i18n from "@i18n";
import { notifyError, notifySuccess } from "@utils/notification";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import {
  NoWalletError,
  signMessage,
  WalletRejectedError,
} from "@/lib/wallet-signer";
import {
  batchDeleteWalletsSucceeded,
  createWalletSucceeded,
  deleteWalletSucceeded,
  fetchActiveWalletsSucceeded,
  fetchWallets as fetchWalletsAction,
  fetchWalletsFailed,
  fetchWalletsPending,
  fetchWalletsSucceeded,
  type PendingMeta,
  updateWalletSucceeded,
  walletActionFailed,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectWalletState } from "./selector";
import type { PaymentNetwork, WalletRole, WalletState } from "./type";

interface ApiIssue {
  path: string;
  message: string;
}

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

const toIssueMap = (error: unknown): Record<string, string> => {
  if (!(error instanceof HttpError)) {
    return {};
  }
  const issues = (error.body as { issues?: ApiIssue[] } | null)?.issues;
  return Array.isArray(issues)
    ? Object.fromEntries(issues.map((i) => [i.path, i.message]))
    : {};
};

const toMessage = (error: unknown, fallback: string): string => {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return t(
        "store.wallet.sessionExpired",
        "Your session has expired. Refresh the page and sign in again.",
      );
    }
    return (error.body as { message?: string } | null)?.message ?? fallback;
  }
  if (error instanceof NoWalletError) {
    return t(
      "store.wallet.noWallet",
      "No browser wallet was detected. Install one to link an address.",
    );
  }
  if (error instanceof WalletRejectedError) {
    return t(
      "store.wallet.rejected",
      "You dismissed the signature request, so nothing was linked.",
    );
  }
  return fallback;
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = toMessage(error, fallback);
  yield put(walletActionFailed(message, toIssueMap(error), meta));

  if (!(error instanceof WalletRejectedError)) {
    notifyError({
      title: t("store.wallet.failedTitle", "Something went wrong"),
      content: message,
    });
  }
}

export function* fetchWallets(): Generator {
  try {
    yield put(fetchWalletsPending());

    const state = (yield select(selectWalletState)) as WalletState;
    const { filters, page, limit } = state;

    const result = (yield call(() =>
      api.getWallets({
        page,
        limit,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.network ? { network: filters.network } : {}),
      }),
    )) as Awaited<ReturnType<typeof api.getWallets>>;

    yield put(fetchWalletsSucceeded(result));
  } catch (error) {
    yield put(
      fetchWalletsFailed(
        toMessage(
          error,
          t("store.wallet.fetchFailed", "Couldn't load your wallets."),
        ),
      ),
    );
  }
}

export function* fetchActiveWallets(): Generator {
  try {
    const result = (yield call(() =>
      api.getWallets({ limit: 100, status: "ACTIVE" }),
    )) as Awaited<ReturnType<typeof api.getWallets>>;

    yield put(fetchActiveWalletsSucceeded({ items: result.items }));
  } catch {
    yield put(fetchActiveWalletsSucceeded({ items: [] }));
  }
}

export function* createWallet(action: {
  type: string;
  payload: {
    label: string;
    description?: string | null;
    address: string;
    network: PaymentNetwork;
    role: WalletRole;
  };
  meta: PendingMeta;
}): Generator {
  const { address, network } = action.payload;

  try {
    const challenge = (yield call(() =>
      api.createWalletChallenge({ address, network }),
    )) as Awaited<ReturnType<typeof api.createWalletChallenge>>;

    const signature = (yield call(() =>
      signMessage(address, challenge.message),
    )) as string;

    const wallet = (yield call(() =>
      api.createWallet({
        ...action.payload,
        nonce: challenge.nonce,
        signature,
      }),
    )) as Awaited<ReturnType<typeof api.createWallet>>;

    yield put(createWalletSucceeded(wallet, action.meta));
    yield put(fetchWalletsAction());

    notifySuccess({
      title: t("store.wallet.created", "Wallet linked"),
      content: t(
        "store.wallet.createdBody",
        "You proved control of this address, so it can now receive payments.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't link that wallet.", action.meta);
  }
}

export function* updateWallet(action: {
  type: string;
  payload: { id: string; data: Record<string, unknown> };
  meta: PendingMeta;
}): Generator {
  try {
    const wallet = (yield call(() =>
      api.updateWallet(action.payload.id, action.payload.data),
    )) as Awaited<ReturnType<typeof api.updateWallet>>;

    yield put(updateWalletSucceeded(wallet, action.meta));
    yield put(fetchWalletsAction());

    notifySuccess({
      title: t("store.wallet.updated", "Wallet updated"),
      content: t("store.wallet.updatedBody", "Your changes have been saved."),
    });
  } catch (error) {
    yield* fail(error, "Couldn't update that wallet.", action.meta);
  }
}

export function* deleteWallet(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteWallet(action.payload.id));
    yield put(deleteWalletSucceeded(action.payload.id, action.meta));
    yield put(fetchWalletsAction());

    notifySuccess({
      title: t("store.wallet.deleted", "Wallet removed"),
      content: t(
        "store.wallet.deletedBody",
        "It will no longer be offered as a payment destination.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't remove that wallet.", action.meta);
  }
}

export function* batchDeleteWallets(action: {
  type: string;
  payload: { ids: string[] };
  meta: PendingMeta;
}): Generator {
  try {
    const result = (yield call(() =>
      api.batchDeleteWallets(action.payload.ids),
    )) as Awaited<ReturnType<typeof api.batchDeleteWallets>>;

    yield put(batchDeleteWalletsSucceeded(result, action.meta));
    yield put(fetchWalletsAction());

    const count = result.deleted.length;
    notifySuccess({
      title: t("store.wallet.batchDeleted", "Wallets removed"),
      content: i18n.t("store.wallet.batchDeletedBody", {
        defaultValue: "{{count}} wallets were removed.",
        count,
      }),
    });
  } catch (error) {
    yield* fail(error, "Couldn't remove those wallets.", action.meta);
  }
}

export default [
  takeLatest(actionTypes.FETCH_WALLETS_REQUESTED, fetchWallets),
  takeLatest(actionTypes.FETCH_ACTIVE_WALLETS_REQUESTED, fetchActiveWallets),
  takeLatest(actionTypes.SET_WALLET_FILTERS, fetchWallets),
  takeLatest(actionTypes.SET_WALLET_PAGE, fetchWallets),
  takeEvery(actionTypes.CREATE_WALLET_REQUESTED, createWallet),
  takeEvery(actionTypes.UPDATE_WALLET_REQUESTED, updateWallet),
  takeEvery(actionTypes.DELETE_WALLET_REQUESTED, deleteWallet),
  takeEvery(actionTypes.BATCH_DELETE_WALLETS_REQUESTED, batchDeleteWallets),
];
