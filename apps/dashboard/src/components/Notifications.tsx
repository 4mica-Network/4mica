import { NOTIFY_CONTAINER_IDS } from "@utils/notification";
import { ToastContainer } from "react-toastify";

/**
 * One container per placement. Toasts pick a container by id, so a user who
 * moves their notification position takes effect without a remount.
 */
export function Notifications() {
  return (
    <>
      {NOTIFY_CONTAINER_IDS.map((containerId) => (
        <ToastContainer
          key={containerId}
          containerId={containerId}
          newestOnTop
          closeOnClick
          hideProgressBar
          draggable={false}
          icon={false}
          toastClassName="!bg-surface !border !border-overlay/10 !rounded-lg !shadow-lg"
        />
      ))}
    </>
  );
}
