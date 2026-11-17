import type { Task } from "redux-saga";
import { all, cancel, fork, take } from "redux-saga/effects";
import agentSaga from "./agent/saga";
import apiListingSaga from "./apiListing/saga";
import balanceSaga from "./balance/saga";
import bannerSaga from "./banner/saga";
import complianceSaga from "./compliance/saga";
import configSaga from "./config/saga";
import customerSaga from "./customer/saga";
import developerSaga from "./developer/saga";
import paymentSaga from "./payment/saga";
import resourceKeySaga from "./resourceKey/saga";
import { SESSION_RESET } from "./session";
import supportSaga from "./support/saga";
import trustSaga from "./trust/saga";
import userSaga from "./user/saga";
import walletSaga from "./wallet/saga";

function* watchers() {
  yield all([
    ...userSaga,
    ...developerSaga,
    ...bannerSaga,
    ...walletSaga,
    ...apiListingSaga,
    ...trustSaga,
    ...agentSaga,
    ...paymentSaga,
    ...balanceSaga,
    ...customerSaga,
    ...resourceKeySaga,
    ...complianceSaga,
    ...configSaga,
    ...supportSaga,
  ]);
}

export default function* rootSaga(): Generator {
  while (true) {
    const task = yield fork(watchers);
    yield take(SESSION_RESET);
    yield cancel(task as Task);
  }
}
