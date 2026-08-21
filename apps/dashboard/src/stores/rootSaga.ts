import { all } from "redux-saga/effects";
import bannerSaga from "./banner/saga";
import developerSaga from "./developer/saga";
import userSaga from "./user/saga";

export default function* rootSaga() {
  yield all([...userSaga, ...developerSaga, ...bannerSaga]);
}
