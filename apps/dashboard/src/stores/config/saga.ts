import { HttpError } from "@4mica/http";
import * as api from "@api/config";
import { toMessage } from "@utils/http-errors";
import { call, put, select, takeLatest } from "redux-saga/effects";
import {
  fetchConfigFailed,
  fetchConfigNotModified,
  fetchConfigPending,
  fetchConfigSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { writeConfigCache } from "./persist";
import { selectConfigState } from "./selector";
import type { AppConfig, ConfigState } from "./type";

export const CONFIG_MAX_AGE_MS = 60 * 60 * 1000;

export function* fetchConfig(): Generator {
  const { config, fetchedAt } = (yield select(
    selectConfigState,
  )) as ConfigState;

  if (config && fetchedAt && Date.now() - fetchedAt < CONFIG_MAX_AGE_MS) {
    return;
  }

  try {
    yield put(fetchConfigPending());
    const next = (yield call(api.getConfig, config?.version)) as AppConfig;
    const now = Date.now();
    yield put(fetchConfigSucceeded(next, now));
    writeConfigCache({ config: next, fetchedAt: now });
  } catch (error) {
    if (error instanceof HttpError && error.status === 304 && config) {
      const now = Date.now();
      yield put(fetchConfigNotModified(now));
      writeConfigCache({ config, fetchedAt: now });
      return;
    }
    if (import.meta.env.DEV) {
      console.warn("[config] fetch failed", error);
    }
    yield put(fetchConfigFailed(toMessage(error, "Couldn't load settings.")));
  }
}

export default [takeLatest(actionTypes.FETCH_CONFIG_REQUESTED, fetchConfig)];
