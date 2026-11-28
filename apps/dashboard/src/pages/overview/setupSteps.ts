import type { ProjectMember, ProjectSummary } from "@stores/project/type";

export type SetupStepId = "invite" | "project" | "access";

export interface SetupStep {
  id: SetupStepId;
  to: string;
  done: boolean;
}

export const setupSteps = ({
  memberCount,
  invitationCount,
  projects,
  activeProjectId,
  activeMembers,
}: {
  memberCount: number;
  invitationCount: number;
  projects: ProjectSummary[];
  activeProjectId: string | null;
  activeMembers: ProjectMember[];
}): SetupStep[] => {
  const extra = projects.filter((project) => !project.isDefault);
  const activeIsExtra = extra.some((project) => project.id === activeProjectId);
  const reviewed =
    extra.some((project) => project.restricted) ||
    (activeIsExtra &&
      activeMembers.some((member) => member.projectRole !== null));
  return [
    {
      id: "invite",
      to: "/settings/team?invite=1",
      done: memberCount > 1 || invitationCount > 0,
    },
    { id: "project", to: "/settings/projects", done: projects.length > 1 },
    { id: "access", to: "/settings/projects", done: reviewed },
  ];
};

export const setupDismissKey = (organizationId: string): string =>
  `4mica:org-setup:${organizationId}`;

export const readSetupDismissed = (organizationId: string): boolean => {
  try {
    return localStorage.getItem(setupDismissKey(organizationId)) === "1";
  } catch {
    return false;
  }
};

export const writeSetupDismissed = (organizationId: string): void => {
  try {
    localStorage.setItem(setupDismissKey(organizationId), "1");
  } catch {}
};
