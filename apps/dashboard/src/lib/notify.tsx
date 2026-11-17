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

function resolveToastPosition(
  placement?: NotificationPlacement,
  fallback: ToastPosition = "bottom-right",
): ToastPosition {
  if (!placement) return fallback;
  const camel =
    (PRISMA_TO_UI as Record<string, string>)[placement] ?? placement;
  return (UI_TO_TOAST as Record<string, ToastPosition>)[camel] ?? fallback;
}

function notify({
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
  const { position: positionOverride, ...restOptions } = options;

  const position = positionOverride ?? resolveToastPosition(placement);

  toast(
    (toastProps) => (
      <Notification {...toastProps} data={{ title, content, type }} />
    ),
    {
      position,
      autoClose: 6000,
      className: "w-[400px]",
      hideProgressBar: true,
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

export const notifyError = (props: NotifyProps) =>
  notify({ ...props, type: "error" });

function Notification({ data }: ActionNotificationProps) {
  const { title, content, type } = data;

  const iconMap = {
    success: <CheckCircle className="h-4 w-4 text-success" />,
    warning: <AlertTriangle className="h-4 w-4 text-warning" />,
    info: <Info className="h-4 w-4 text-ink-muted" />,
    error: <XCircle className="h-4 w-4 text-danger" />,
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
