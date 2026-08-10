export type ServiceState = "ready" | "draining" | "closing";

let state: ServiceState = "ready";

export const getServiceState = (): ServiceState => state;

export const isAcceptingTraffic = (): boolean => state === "ready";

export const setServiceState = (next: ServiceState): void => {
  state = next;
};

export const resetServiceState = (): void => {
  state = "ready";
};
