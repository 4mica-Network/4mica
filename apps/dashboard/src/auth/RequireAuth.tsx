import { useAuth } from "@clerk/clerk-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { CurrentUserProvider } from "@/auth/CurrentUserProvider";
import { FullScreenLoader } from "@/auth/FullScreenLoader";

export function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return <FullScreenLoader messageKey="auth.loading" />;
  }

  if (!isSignedIn) {
    const target = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/sign-in?redirect_url=${encodeURIComponent(target)}`}
        replace
      />
    );
  }

  return (
    <CurrentUserProvider>
      <Outlet />
    </CurrentUserProvider>
  );
}
