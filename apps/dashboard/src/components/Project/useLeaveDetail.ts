import { useLocation, useNavigate } from "react-router-dom";

export const listPathFor = (pathname: string): string | null => {
  const [first, ...rest] = pathname.split("/").filter(Boolean);
  return first && first !== "settings" && rest.length > 0 ? `/${first}` : null;
};

export function useLeaveDetail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return () => {
    const target = listPathFor(pathname);
    if (target) {
      navigate(target);
    }
  };
}
