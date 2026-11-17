import { Slide, ToastContainer } from "react-toastify";

export function Notifications() {
  return (
    <ToastContainer
      newestOnTop
      closeOnClick
      hideProgressBar
      draggable={false}
      icon={false}
      transition={Slide}
    />
  );
}
