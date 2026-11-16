export const SESSION_RESET = "SESSION_RESET";

export const resetSession = () => ({ type: SESSION_RESET });

type Reducer<S> = (state: S | undefined, action: { type: string }) => S;

export const withSessionReset =
  <S extends { config: unknown }>(reducer: Reducer<S>): Reducer<S> =>
  (state, action) =>
    action.type === SESSION_RESET
      ? reducer(state ? ({ config: state.config } as S) : undefined, action)
      : reducer(state, action);
