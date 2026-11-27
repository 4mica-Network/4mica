export const SESSION_RESET = "SESSION_RESET";

export const resetSession = (keep: readonly string[] = []) => ({
  type: SESSION_RESET,
  meta: { keep },
});

type Reducer<S> = (state: S | undefined, action: { type: string }) => S;

const keptSlices = <S extends { config: unknown }>(
  state: S,
  action: { type: string; meta?: { keep?: readonly string[] } },
): S => {
  const kept: Record<string, unknown> = { config: state.config };
  for (const name of action.meta?.keep ?? []) {
    if (name in state) {
      kept[name] = (state as Record<string, unknown>)[name];
    }
  }
  return kept as S;
};

export const withSessionReset =
  <S extends { config: unknown }>(reducer: Reducer<S>): Reducer<S> =>
  (state, action) =>
    action.type === SESSION_RESET
      ? reducer(state ? keptSlices(state, action) : undefined, action)
      : reducer(state, action);
