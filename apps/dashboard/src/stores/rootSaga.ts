import { all } from "redux-saga/effects";
import agentSaga from "./agent/saga";
import apiListingSaga from "./apiListing/saga";
import bannerSaga from "./banner/saga";
import developerSaga from "./developer/saga";
import paymentSaga from "./payment/saga";
import userSaga from "./user/saga";
import walletSaga from "./wallet/saga";

export default function* rootSaga() {
  yield all([
    ...userSaga,
    ...developerSaga,
    ...bannerSaga,
    ...walletSaga,
    ...apiListingSaga,
    ...agentSaga,
    ...paymentSaga,
  ]);
}
