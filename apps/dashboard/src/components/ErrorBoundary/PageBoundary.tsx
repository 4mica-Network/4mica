import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PageCrash } from "./fallbacks";
import { ErrorBoundary } from "./index";

export function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary resetKey={pathname} fallback={PageCrash}>
      {children}
    </ErrorBoundary>
  );
}
