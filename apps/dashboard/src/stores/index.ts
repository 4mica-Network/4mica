import { applyMiddleware, combineReducers, compose, createStore } from "redux";
import createSagaMiddleware from "redux-saga";
import agentReducer from "./agent/reducer";
import apiListingReducer from "./apiListing/reducer";
import bannerReducer from "./banner/reducer";
import developerReducer from "./developer/reducer";
import paymentReducer from "./payment/reducer";
import rootSaga from "./rootSaga";
import trustReducer from "./trust/reducer";
import userReducer from "./user/reducer";
import walletReducer from "./wallet/reducer";

const rootReducer = combineReducers({
  user: userReducer,
  developer: developerReducer,
  banner: bannerReducer,
  wallet: walletReducer,
  apiListing: apiListingReducer,
  trust: trustReducer,
  agent: agentReducer,
  payment: paymentReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const sagaMiddleware = createSagaMiddleware();

const composeEnhancers =
  import.meta.env.DEV && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
    ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
    : compose;

export const store = createStore(
  rootReducer,
  composeEnhancers(applyMiddleware(sagaMiddleware)),
);

sagaMiddleware.run(rootSaga);

export type AppDispatch = typeof store.dispatch;
