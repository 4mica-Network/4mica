import { AlertTriangle, Check, Info, type LucideIcon, X } from "lucide-react";
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

const TONES: Record<NotificationType, { Icon: LucideIcon; tint: string }> = {
  success: { Icon: Check, tint: "bg-success/10 text-success" },
  warning: { Icon: AlertTriangle, tint: "bg-warning/10 text-warning" },
  info: { Icon: Info, tint: "bg-overlay/5 text-ink-muted" },
  error: { Icon: X, tint: "bg-danger/10 text-danger" },
};

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
  const { Icon, tint } = TONES[type];

  return (
    <div className="flex w-full min-w-0 items-start gap-3">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tint}`}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
        <span className="font-medium text-ink-strong text-sm">{title}</span>
        {content && <p className="text-ink-muted text-sm">{content}</p>}
      </div>
    </div>
  );
}
