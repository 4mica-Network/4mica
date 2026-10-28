import actionTypes from "./actionTypes";
import type { AppConfig } from "./type";

export const fetchConfig = () => ({
  type: actionTypes.FETCH_CONFIG_REQUESTED,
});

export const fetchConfigPending = () => ({
  type: actionTypes.FETCH_CONFIG_PENDING,
});

export const fetchConfigSucceeded = (config: AppConfig, fetchedAt: number) => ({
  type: actionTypes.FETCH_CONFIG_SUCCEEDED,
  payload: { config, fetchedAt },
});

export const fetchConfigNotModified = (fetchedAt: number) => ({
  type: actionTypes.FETCH_CONFIG_NOT_MODIFIED,
  payload: { fetchedAt },
});

export const fetchConfigFailed = (message: string) => ({
  type: actionTypes.FETCH_CONFIG_FAILED,
  payload: { message },
});
