import { getProjectAgents, getProjectApiKeys } from "@api/finance";
import type { PolicyScope } from "@stores/finance/type";
import { useEffect, useState } from "react";

export interface TargetOption {
  value: string;
  title: string;
}

export const useScopeTargets = (
  scope: PolicyScope,
  projectId: string,
): { options: TargetOption[]; loading: boolean } => {
  const [options, setOptions] = useState<TargetOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ((scope !== "AGENT" && scope !== "API_KEY") || !projectId) {
      setOptions([]);
      return;
    }
    let active = true;
    setLoading(true);
    const request: Promise<TargetOption[]> =
      scope === "AGENT"
        ? getProjectAgents(projectId).then(({ items }) =>
            items.map((agent) => ({ value: agent.id, title: agent.name })),
          )
        : getProjectApiKeys(projectId).then((keys) =>
            keys
              .filter((key) => !key.revokedAt)
              .map((key) => ({
                value: key.id,
                title: `${key.name} · ${key.prefix}…${key.last4}`,
              })),
          );
    request
      .then((next) => active && setOptions(next))
      .catch(() => active && setOptions([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [scope, projectId]);

  return { options, loading };
};
