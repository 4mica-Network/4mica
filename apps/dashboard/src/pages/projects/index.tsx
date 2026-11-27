import { isValidSlug, SLUG_MAX_LENGTH } from "@4mica/rules";
import { Button, Card, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import {
  archiveProject,
  deleteProject,
  projectPendingKeys,
  switchProject,
  updateProject,
} from "@stores/project/actions";
import {
  selectActiveProject,
  selectIsProjectPending,
  selectProjectCan,
  selectProjectIssues,
  selectProjects,
} from "@stores/project/selector";
import { PROJECT_PERMISSION, type ProjectSummary } from "@stores/project/type";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { FieldRow, SwitchCard, TextArea, TextInput } from "@/components/form";
import { SettingsSection } from "@/components/layout";
import { RoleRestricted } from "@/components/Organization/RoleRestricted";
import {
  CreateProjectModal,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from "@/components/Project/CreateProjectModal";
import { SettingsPage } from "@/components/SettingsPage";
import { MembersSection } from "./MembersSection";

function ProjectList() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const active = useAppSelector(selectActiveProject);
  const canCreate = useAppSelector(selectCan(PERMISSION.PROJECTS_CREATE));
  const [creating, setCreating] = useState(false);

  return (
    <SettingsSection
      title={t("projects.list.title")}
      description={t("projects.list.description")}
      action={
        canCreate && (
          <Button
            type="button"
            intent="invert"
            size="sm"
            className="btn-no-lift"
            icon={<Plus aria-hidden="true" className="h-4 w-4" />}
            onClick={() => setCreating(true)}
            data-testid="projects-create"
          >
            {t("project.switcher.create")}
          </Button>
        )
      }
    >
      <div
        className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10"
        data-testid="projects-list"
      >
        {projects.map((project) => (
          <div
            key={project.id}
            className="flex items-center gap-3 bg-surface px-4 py-3"
            data-testid={`projects-row-${project.id}`}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-ink-strong text-sm">
                {project.name}
              </span>
              <span className="truncate font-mono text-ink-subtle text-xs">
                {project.slug}
              </span>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {project.isDefault && (
                <Tag size="sm" variant="neutral">
                  {t("project.switcher.default")}
                </Tag>
              )}
              {project.restricted && (
                <Tag size="sm" variant="neutral">
                  {t("project.create.restricted")}
                </Tag>
              )}
              {project.archived && (
                <Tag size="sm" variant="warning">
                  {t("project.switcher.archived")}
                </Tag>
              )}
              <Tag size="sm" variant="neutral">
                {t(`project.role.${project.role}`)}
              </Tag>
            </div>
            {project.id === active?.id ? (
              <Tag size="sm" variant="default" className="shrink-0">
                {t("projects.list.current")}
              </Tag>
            ) : (
              <Button
                type="button"
                size="sm"
                intent="ghost"
                className="shrink-0"
                onClick={() => dispatch(switchProject(project.id))}
                data-testid={`projects-switch-${project.id}`}
              >
                {t("projects.list.switch")}
              </Button>
            )}
          </div>
        ))}
      </div>
      <CreateProjectModal
        isOpen={creating}
        onClose={() => setCreating(false)}
      />
    </SettingsSection>
  );
}

function ProjectSettingsForm({ project }: { project: ProjectSummary }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const issues = useAppSelector(selectProjectIssues);
  const isSaving = useAppSelector(
    selectIsProjectPending(projectPendingKeys.update),
  );
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [description, setDescription] = useState(project.description ?? "");
  const [restricted, setRestricted] = useState(project.restricted);
  const [restrictProduction, setRestrictProduction] = useState(
    project.restrictProduction,
  );

  const trimmedName = name.trim();
  const candidate = slug.trim().toLowerCase();
  const slugError = isValidSlug(candidate)
    ? (issues.slug ?? undefined)
    : t("project.create.slugInvalid");

  const changes = {
    ...(trimmedName !== project.name ? { name: trimmedName } : {}),
    ...(candidate !== project.slug ? { slug: candidate } : {}),
    ...(description.trim() !== (project.description ?? "")
      ? { description: description.trim() || null }
      : {}),
    ...(restricted !== project.restricted ? { restricted } : {}),
    ...(restrictProduction !== project.restrictProduction
      ? { restrictProduction }
      : {}),
  };
  const dirty = Object.keys(changes).length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || !trimmedName || slugError || isSaving) {
      return;
    }
    dispatch(updateProject(changes));
  };

  return (
    <SettingsSection
      title={t("projects.settings.title")}
      description={t("projects.settings.description", { name: project.name })}
    >
      <Card>
        <form
          className="flex flex-col gap-1"
          onSubmit={submit}
          noValidate
          data-testid="project-settings-form"
        >
          <FieldRow
            title={t("project.create.name")}
            htmlFor="project-name"
            required
          >
            <TextInput
              id="project-name"
              value={name}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              error={
                trimmedName ? issues.name : t("project.create.nameRequired")
              }
              onChange={setName}
            />
          </FieldRow>
          <FieldRow
            title={t("project.create.slug")}
            htmlFor="project-slug"
            required
          >
            <TextInput
              id="project-slug"
              value={slug}
              maxLength={SLUG_MAX_LENGTH}
              autoComplete="off"
              spellCheck={false}
              error={slugError}
              onChange={(value) => setSlug(value.toLowerCase())}
            />
          </FieldRow>
          <FieldRow
            title={t("project.create.descriptionLabel")}
            htmlFor="project-description"
          >
            <TextArea
              id="project-description"
              value={description}
              rows={2}
              maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
              error={issues.description}
              onChange={setDescription}
            />
          </FieldRow>
          <div className="flex flex-col gap-2 pt-3">
            {!project.isDefault && (
              <SwitchCard
                id="project-restricted"
                title={t("project.create.restricted")}
                description={t("project.create.restrictedHint")}
                checked={restricted}
                onToggle={setRestricted}
              />
            )}
            <SwitchCard
              id="project-restrict-production"
              title={t("projects.settings.restrictProduction")}
              description={t("projects.settings.restrictProductionHint")}
              checked={restrictProduction}
              onToggle={setRestrictProduction}
            />
          </div>
          <div className="flex justify-end pt-3">
            <Button
              type="submit"
              size="sm"
              intent="invert"
              className="btn-no-lift min-w-24"
              loading={isSaving}
              disabled={!dirty}
              data-testid="project-settings-save"
            >
              {t("projects.settings.save")}
            </Button>
          </div>
        </form>
      </Card>
    </SettingsSection>
  );
}

function DangerZone({ project }: { project: ProjectSummary }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canUpdate = useAppSelector(
    selectProjectCan(PROJECT_PERMISSION.PROJECT_UPDATE),
  );
  const canDelete = useAppSelector(
    selectProjectCan(PROJECT_PERMISSION.PROJECT_DELETE),
  );
  const isArchiving = useAppSelector(
    selectIsProjectPending(projectPendingKeys.archive),
  );
  const isDeleting = useAppSelector(
    selectIsProjectPending(projectPendingKeys.remove),
  );

  if (project.isDefault || (!canUpdate && !canDelete)) {
    return null;
  }

  return (
    <SettingsSection
      title={t("projects.danger.title")}
      description={t("projects.danger.description")}
    >
      <Card className="flex flex-col gap-4">
        {canUpdate && (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium text-ink-strong text-sm">
                {project.archived
                  ? t("projects.danger.unarchive")
                  : t("projects.danger.archive")}
              </p>
              <p className="mt-0.5 text-ink-muted text-xs">
                {project.archived
                  ? t("projects.danger.unarchiveHint")
                  : t("projects.danger.archiveHint")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              intent="soft"
              loading={isArchiving}
              onClick={() => dispatch(archiveProject(!project.archived))}
              data-testid="project-archive"
            >
              {project.archived
                ? t("projects.danger.unarchive")
                : t("projects.danger.archive")}
            </Button>
          </div>
        )}
        {canDelete && (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium text-ink-strong text-sm">
                {t("projects.danger.delete")}
              </p>
              <p className="mt-0.5 text-ink-muted text-xs">
                {t("projects.danger.deleteHint")}
              </p>
            </div>
            <ConfirmAction
              title={t("projects.danger.deleteConfirm", { name: project.name })}
              onConfirm={() => dispatch(deleteProject())}
              data-testid="project-delete-confirm"
            >
              <Button
                type="button"
                size="sm"
                intent="danger"
                loading={isDeleting}
                data-testid="project-delete"
              >
                {t("projects.danger.delete")}
              </Button>
            </ConfirmAction>
          </div>
        )}
      </Card>
    </SettingsSection>
  );
}

export function ProjectsSettings() {
  const { t } = useTranslation();
  const project = useAppSelector(selectActiveProject);
  const canUpdate = useAppSelector(
    selectProjectCan(PROJECT_PERMISSION.PROJECT_UPDATE),
  );

  return (
    <SettingsPage
      titleKey="page.settings.projects.title"
      descriptionKey="page.settings.projects.description"
    >
      <ProjectList />
      {project && (
        <>
          <RoleRestricted allowed={canUpdate} message={t("project.restricted")}>
            <ProjectSettingsForm key={project.id} project={project} />
          </RoleRestricted>
          <MembersSection />
          <DangerZone project={project} />
        </>
      )}
    </SettingsPage>
  );
}
