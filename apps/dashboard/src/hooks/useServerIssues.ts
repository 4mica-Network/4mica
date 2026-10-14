import { useEffect } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

export const useServerIssues = <T extends FieldValues>(
  issues: Record<string, string>,
  setError: UseFormSetError<T>,
): void => {
  useEffect(() => {
    Object.entries(issues).forEach(([field, message], index) => {
      setError(
        field as Path<T>,
        { type: "server", message },
        { shouldFocus: index === 0 },
      );
    });
  }, [issues, setError]);
};
