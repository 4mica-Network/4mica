import type { Task } from "redux-saga";
import { all, cancel, type ForkEffect, fork, take } from "redux-saga/effects";
import { SESSION_RESET } from "./session";

export type Watchers = ForkEffect[];

export function* sessionScoped(watchers: Watchers): Generator {
  while (true) {
    const task = yield fork(function* () {
      yield all(watchers);
    });
    yield take(SESSION_RESET);
    yield cancel(task as Task);
  }
}
