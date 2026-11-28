import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useWorkspaceMode } from "@/hooks/useWorkspaceMode";
import { isPathVisible } from "@/nav";

export function WorkspaceGuard({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const mode = useWorkspaceMode();
  if (!isPathVisible(path, mode)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
