import { setRequestHeadersProvider } from "@4mica/http";
import {
  applyMiddleware,
  combineReducers,
  compose,
  createStore,
  type Reducer,
} from "redux";
import createSagaMiddleware from "redux-saga";
import { all } from "redux-saga/effects";
import type agentReducer from "./agent/reducer";
import type apiListingReducer from "./apiListing/reducer";
import type balanceReducer from "./balance/reducer";
import bannerReducer from "./banner/reducer";
import bannerSaga from "./banner/saga";
import type complianceReducer from "./compliance/reducer";
import configReducer from "./config/reducer";
import configSaga from "./config/saga";
import type customerReducer from "./customer/reducer";
import type developerReducer from "./developer/reducer";
import organizationReducer from "./organization/reducer";
import organizationSaga from "./organization/saga";
import { organizationHeaders } from "./organization/selector";
import type paymentReducer from "./payment/reducer";
import { onStoreRegistered } from "./registry";
import type resourceKeyReducer from "./resourceKey/reducer";
import { sessionScoped } from "./rootSaga";
import { withSessionReset } from "./session";
import type supportReducer from "./support/reducer";
import type teamReducer from "./team/reducer";
import type trustReducer from "./trust/reducer";
import userReducer from "./user/reducer";
import userSaga from "./user/saga";
import type walletReducer from "./wallet/reducer";

const eagerReducers = {
  user: userReducer,
  config: configReducer,
  banner: bannerReducer,
  organization: organizationReducer,
};

export interface LazyReducers {
  developer: typeof developerReducer;
  wallet: typeof walletReducer;
  apiListing: typeof apiListingReducer;
  trust: typeof trustReducer;
  agent: typeof agentReducer;
  payment: typeof paymentReducer;
  balance: typeof balanceReducer;
  customer: typeof customerReducer;
  resourceKey: typeof resourceKeyReducer;
  compliance: typeof complianceReducer;
  support: typeof supportReducer;
  team: typeof teamReducer;
}

type AllReducers = typeof eagerReducers & LazyReducers;

export type RootState = {
  [K in keyof AllReducers]: ReturnType<AllReducers[K]>;
};

const lazyReducers: Partial<LazyReducers> = {};

const rootReducer = () =>
  withSessionReset<RootState>(
    combineReducers({
      ...eagerReducers,
      ...lazyReducers,
    }) as unknown as Reducer<RootState, { type: string }>,
  );

const sagaMiddleware = createSagaMiddleware();

const composeEnhancers =
  import.meta.env.DEV && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
    ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
    : compose;

export const store = createStore(
  rootReducer(),
  composeEnhancers(applyMiddleware(sagaMiddleware)),
);

sagaMiddleware.run(sessionScoped, [...userSaga, ...configSaga, ...bannerSaga]);
sagaMiddleware.run(function* () {
  yield all(organizationSaga);
});

setRequestHeadersProvider(() => organizationHeaders(store.getState()));

onStoreRegistered(({ name, reducer, watchers }) => {
  Object.assign(lazyReducers, { [name]: reducer });
  store.replaceReducer(rootReducer());
  sagaMiddleware.run(sessionScoped, watchers);
});

export type AppDispatch = typeof store.dispatch;
