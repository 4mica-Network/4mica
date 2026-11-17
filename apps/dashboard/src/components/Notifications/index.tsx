import { ToastContainer } from "react-toastify";

export function Notifications() {
  return (
    <ToastContainer
      newestOnTop
      closeOnClick
      hideProgressBar
      draggable={false}
      icon={false}
      toastClassName="!bg-surface !border !border-overlay/10 !rounded-lg !shadow-lg"
    />
  );
}
