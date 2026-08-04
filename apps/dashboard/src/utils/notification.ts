import type { NotificationPlacement } from "@stores/user/type";

export interface NotificationInput {
  title: string;
  content?: string;
  placement?: NotificationPlacement;
}

export type NotificationTone = "success" | "error";

export interface AppNotification extends NotificationInput {
  id: number;
  tone: NotificationTone;
}

type Listener = (notification: AppNotification) => void;

const listeners = new Set<Listener>();
let nextId = 0;

export const subscribeToNotifications = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const emit = (tone: NotificationTone, input: NotificationInput): void => {
  nextId += 1;
  const notification: AppNotification = { ...input, tone, id: nextId };
  for (const listener of listeners) {
    listener(notification);
  }
};

export const notifySuccess = (input: NotificationInput): void =>
  emit("success", input);

export const notifyError = (input: NotificationInput): void =>
  emit("error", input);
