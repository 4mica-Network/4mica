import { useEffect } from "react";

const NO_ALIASES: Record<string, number> = {};

export const firstStepWith = (
  stepFields: readonly (readonly string[])[],
  keys: readonly string[],
): number =>
  stepFields.findIndex((fields) =>
    fields.some((field) => keys.includes(field)),
  );

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

    const fromFields = firstStepWith(stepFields, keys);
    const fromAliases = keys
      .map((key) => aliases[key])
      .find((step): step is number => step !== undefined);
    const target = fromFields >= 0 ? fromFields : fromAliases;

    if (target !== undefined && target >= 0) {
      setStep(target);
    }
  }, [issues, stepFields, setStep, aliases]);
};
