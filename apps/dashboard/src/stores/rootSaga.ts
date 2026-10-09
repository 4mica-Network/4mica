import { all } from "redux-saga/effects";
import agentSaga from "./agent/saga";
import apiListingSaga from "./apiListing/saga";
import bannerSaga from "./banner/saga";
import customerSaga from "./customer/saga";
import developerSaga from "./developer/saga";
import paymentSaga from "./payment/saga";
import resourceKeySaga from "./resourceKey/saga";
import trustSaga from "./trust/saga";
import userSaga from "./user/saga";
import walletSaga from "./wallet/saga";

export default function* rootSaga() {
  yield all([
    ...userSaga,
    ...developerSaga,
    ...bannerSaga,
    ...walletSaga,
    ...apiListingSaga,
    ...trustSaga,
    ...agentSaga,
    ...paymentSaga,
    ...customerSaga,
    ...resourceKeySaga,
  ]);
}
