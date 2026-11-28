import { cn, Dropdown, Tag, Tooltip } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { switchProject } from "@stores/project/actions";
import { selectActiveProject, selectProjects } from "@stores/project/selector";
import { Check, ChevronsUpDown, FolderKanban, Plus } from "lucide-react";
import { lazy, Suspense, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLeaveDetail } from "./useLeaveDetail";

const CreateProjectModal = lazy(() =>
  import("./CreateProjectModal").then((module) => ({
    default: module.CreateProjectModal,
  })),
);

const ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-ink-body text-sm outline-none hover:bg-overlay/10 focus-visible:bg-overlay/10 focus-visible:ring-1 focus-visible:ring-overlay/60 focus-visible:ring-inset";

export function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const leaveDetail = useLeaveDetail();
  const projects = useAppSelector(selectProjects);
  const active = useAppSelector(selectActiveProject);
  const canCreate = useAppSelector(selectCan(PERMISSION.PROJECTS_CREATE));
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  if (!active) {
    return null;
  }

  const choose = (id: string) => {
    setOpen(false);
    if (id === active.id) {
      return;
    }
    leaveDetail();
    dispatch(switchProject(id));
  };

  const label = t("project.switcher.label");

  return (
    <>
      <Tooltip
        title={`${label}: ${active.name}`}
        placement="right"
        disabled={!collapsed}
        delay={80}
      >
        <span className="block w-full">
          <button
            ref={anchorRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-label={`${label}: ${active.name}`}
            onClick={() => setOpen((value) => !value)}
            className="flex h-9 w-full items-center overflow-hidden rounded-md text-left text-ink-body text-sm hover:bg-overlay/5"
            data-testid="project-switcher"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center text-ink-muted">
              <FolderKanban aria-hidden="true" className="h-4 w-4" />
            </span>
            <span
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 pr-2 transition-opacity duration-200",
                collapsed ? "opacity-0" : "opacity-100",
              )}
            >
              <span
                className="min-w-0 flex-1 truncate font-medium text-ink-strong"
                data-testid="active-project"
              >
                {active.name}
              </span>
              {active.archived && (
                <Tag size="sm" variant="neutral" className="shrink-0">
                  {t("project.switcher.archived")}
                </Tag>
              )}
              <ChevronsUpDown
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-ink-subtle"
              />
            </span>
          </button>
        </span>
      </Tooltip>

      <Dropdown
        isOpen={open}
        anchorRef={anchorRef}
        placement="bottom"
        matchAnchorWidth={!collapsed}
        onClickOutside={() => setOpen(false)}
        autoFocus
        className="min-w-56 bg-surface-deep p-1"
      >
        <div
          id={menuId}
          role="menu"
          aria-label={t("project.switcher.title")}
          data-testid="project-menu"
        >
          <span className="block px-2.5 pt-1.5 pb-1 text-2xs text-ink-subtle uppercase tracking-wide">
            {t("project.switcher.title")}
          </span>
          {projects.map((project) => {
            const isActive = project.id === active.id;
            return (
              <button
                key={project.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => choose(project.id)}
                className={cn(ITEM_CLASS, project.archived && "text-ink-muted")}
                data-testid={`project-option-${project.id}`}
              >
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.isDefault && (
                  <Tag size="sm" variant="neutral" className="shrink-0">
                    {t("project.switcher.default")}
                  </Tag>
                )}
                {project.archived && (
                  <Tag size="sm" variant="neutral" className="shrink-0">
                    {t("project.switcher.archived")}
                  </Tag>
                )}
                <Check
                  aria-hidden="true"
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-ink-strong" : "invisible",
                  )}
                />
              </button>
            );
          })}
          {canCreate && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className={cn(ITEM_CLASS, "border-overlay/10 border-t")}
              data-testid="project-create"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t("project.switcher.create")}
            </button>
          )}
        </div>
      </Dropdown>

      {creating && (
        <Suspense fallback={null}>
          <CreateProjectModal isOpen onClose={() => setCreating(false)} />
        </Suspense>
      )}
    </>
  );
}
