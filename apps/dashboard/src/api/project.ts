import { HttpMethod } from "@4mica/http";
import type {
  MovableKind,
  MoveResult,
  NewProject,
  ProjectChanges,
  ProjectMember,
  ProjectRole,
  ProjectSummary,
} from "@stores/project/type";
import { httpClient } from "./client";

export const getProjects = () =>
  httpClient.request<{ items: ProjectSummary[] }>({
    url: "/me/projects",
    method: HttpMethod.GET,
  });

export const createProject = (data: NewProject) =>
  httpClient.request<ProjectSummary, NewProject>({
    url: "/me/projects",
    method: HttpMethod.POST,
    data,
  });

export const updateProject = (data: ProjectChanges) =>
  httpClient.request<ProjectSummary, ProjectChanges>({
    url: "/me/project",
    method: HttpMethod.PATCH,
    data,
  });

export const archiveProject = (archived: boolean) =>
  httpClient.request<ProjectSummary>({
    url: archived ? "/me/project/archive" : "/me/project/unarchive",
    method: HttpMethod.POST,
  });

export const deleteProject = () =>
  httpClient.request<void>({
    url: "/me/project",
    method: HttpMethod.DELETE,
  });

export const getProjectMembers = () =>
  httpClient.request<{ items: ProjectMember[] }>({
    url: "/me/project/members",
    method: HttpMethod.GET,
  });

export const setProjectMemberRole = (userId: string, role: ProjectRole) =>
  httpClient.request<ProjectMember, { role: ProjectRole }>({
    url: `/me/project/members/${encodeURIComponent(userId)}`,
    method: HttpMethod.PUT,
    data: { role },
  });

export const removeProjectMember = (userId: string) =>
  httpClient.request<void>({
    url: `/me/project/members/${encodeURIComponent(userId)}`,
    method: HttpMethod.DELETE,
  });

export const moveResources = (data: {
  kind: MovableKind;
  ids: string[];
  targetProjectId: string;
}) =>
  httpClient.request<MoveResult, typeof data>({
    url: "/me/project/move",
    method: HttpMethod.POST,
    data,
  });
