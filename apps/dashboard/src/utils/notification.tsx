import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import {
  type ToastContentProps,
  type ToastOptions,
  type ToastPosition,
  toast,
} from "react-toastify";

type NotificationType = "success" | "warning" | "info" | "error";

type PlacementCamel = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
type PlacementPrisma =
  | "TOP_LEFT"
  | "TOP_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_RIGHT";

export type NotificationPlacement = PlacementCamel | PlacementPrisma;

type NotificationData = {
  title: string;
  content: string;
  type: NotificationType;
};

type ActionNotificationProps = ToastContentProps<NotificationData>;

const PRISMA_TO_UI = {
  TOP_LEFT: "topLeft",
  TOP_RIGHT: "topRight",
  BOTTOM_LEFT: "bottomLeft",
  BOTTOM_RIGHT: "bottomRight",
} as const;

const UI_TO_TOAST: Record<PlacementCamel, ToastPosition> = {
  topLeft: "top-left",
  topRight: "top-right",
  bottomLeft: "bottom-left",
  bottomRight: "bottom-right",
};

const POSITION_TO_CONTAINER: Partial<Record<ToastPosition, string>> = {
  "top-left": "notify-top-left",
  "top-right": "notify-top-right",
  "top-center": "notify-top-center",
  "bottom-left": "notify-bottom-left",
  "bottom-right": "notify-bottom-right",
  "bottom-center": "notify-bottom-center",
};

export const NOTIFY_CONTAINER_IDS = [
  "notify-top-left",
  "notify-top-right",
  "notify-bottom-left",
  "notify-bottom-right",
] as const;

const DEFAULT_CONTAINER_ID = "notify-bottom-right";

export function resolveToastPosition(
  placement?: NotificationPlacement,
  fallback: ToastPosition = "bottom-right",
): ToastPosition {
  if (!placement) return fallback;
  const camel =
    (PRISMA_TO_UI as Record<string, string>)[placement] ?? placement;
  return (UI_TO_TOAST as Record<string, ToastPosition>)[camel] ?? fallback;
}

export function notify({
  title,
  content,
  type = "success",
  placement,
  options = {},
}: {
  title: string;
  content: string;
  type?: NotificationType;
  placement?: NotificationPlacement;
  options?: ToastOptions;
}) {
  const {
    position: positionOverride,
    containerId: containerIdOverride,
    ...restOptions
  } = options;

  const position = positionOverride ?? resolveToastPosition(placement);
  const containerId =
    containerIdOverride ??
    POSITION_TO_CONTAINER[position] ??
    DEFAULT_CONTAINER_ID;

  toast(
    (toastProps) => (
      <Notification {...toastProps} data={{ title, content, type }} />
    ),
    {
      position,
      autoClose: 6000,
      className: "w-[400px]",
      ariaLabel: title,
      hideProgressBar: true,
      containerId,
      ...restOptions,
    },
  );
}

type NotifyProps = {
  title: string;
  content: string;
  placement?: NotificationPlacement;
  options?: ToastOptions;
};

export const notifySuccess = (props: NotifyProps) =>
  notify({ ...props, type: "success" });

export const notifyWarning = (props: NotifyProps) =>
  notify({ ...props, type: "warning" });

export const notifyInfo = (props: NotifyProps) =>
  notify({ ...props, type: "info" });

export const notifyError = (props: NotifyProps) =>
  notify({ ...props, type: "error" });

function Notification({ data }: ActionNotificationProps) {
  const { title, content, type } = data;

  const iconMap = {
    success: <CheckCircle className="h-4 w-4 text-[#7dff59]" />,
    warning: <AlertTriangle className="h-4 w-4 text-[#ffc062]" />,
    info: <Info className="h-4 w-4 text-ink-muted" />,
    error: <XCircle className="h-4 w-4 text-[#ff4d4d]" />,
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="shrink-0">{iconMap[type]}</div>
        <span className="font-semibold text-ink-strong text-sm">{title}</span>
      </div>
      {content && <p className="text-ink-muted text-sm">{content}</p>}
    </div>
  );
}
