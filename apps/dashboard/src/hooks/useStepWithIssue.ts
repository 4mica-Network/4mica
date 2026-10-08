import { useEffect } from "react";

const NO_ALIASES: Record<string, number> = {};

export const useStepWithIssue = (
  issues: Record<string, string>,
  stepFields: readonly (readonly string[])[],
  setStep: (step: number) => void,
  aliases: Record<string, number> = NO_ALIASES,
): void => {
  useEffect(() => {
    const keys = Object.keys(issues);
    if (keys.length === 0) {
      return;
    }

    const fromFields = stepFields.findIndex((fields) =>
      fields.some((field) => keys.includes(field)),
    );
    const fromAliases = keys
      .map((key) => aliases[key])
      .find((step): step is number => step !== undefined);
    const target = fromFields >= 0 ? fromFields : fromAliases;

    if (target !== undefined && target >= 0) {
      setStep(target);
    }
  }, [issues, stepFields, setStep, aliases]);
};
