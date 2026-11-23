import type { RootState } from "@stores/index";
import { fork, put, select, take, takeEvery } from "redux-saga/effects";

export const writeSucceededTypes = (actionTypes: Record<string, string>) =>
  Object.values(actionTypes).filter(
    (type) => type.endsWith("_SUCCEEDED") && !type.startsWith("FETCH_"),
  );

export function refreshAfterWrite({
  fetchType,
  writeTypes,
  isLoading,
}: {
  fetchType: string;
  writeTypes: string[];
  isLoading: (state: RootState) => boolean;
}) {
  return fork(function* (): Generator {
    let lastPayload: unknown;

    yield fork(function* (): Generator {
      while (true) {
        const action = (yield take(fetchType)) as { payload?: unknown };
        lastPayload = action.payload;
      }
    });

    yield takeEvery(writeTypes, function* (): Generator {
      if ((yield select(isLoading)) as boolean) {
        yield put({ type: fetchType, payload: lastPayload });
      }
    });
  });
}
