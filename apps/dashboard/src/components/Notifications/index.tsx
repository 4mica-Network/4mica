import { useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { Slide, ToastContainer } from "react-toastify";
import { toastPosition } from "@/lib/notify";

export function Notifications() {
  const placement = useAppSelector(selectUser)?.notificationPlacement;

  return (
    <ToastContainer
      position={toastPosition(placement)}
      newestOnTop
      closeOnClick
      hideProgressBar
      draggable={false}
      icon={false}
      transition={Slide}
    />
  );
}
