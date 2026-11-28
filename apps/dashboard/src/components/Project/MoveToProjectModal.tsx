import { Button, Modal } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { moveResources, projectPendingKeys } from "@stores/project/actions";
import {
  projectAllows,
  selectActiveProjectId,
  selectEnvironment,
  selectIsProjectPending,
  selectProjectError,
  selectProjects,
} from "@stores/project/selector";
import { type MovableKind, PROJECT_PERMISSION } from "@stores/project/type";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, Select } from "@/components/form";
import { useOnSuccess } from "@/hooks/useOnSuccess";

export function MoveToProjectModal({
  isOpen,
  onClose,
  kind,
  ids,
}: {
  isOpen: boolean;
  onClose: () => void;
  kind: MovableKind;
  ids: string[];
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const activeId = useAppSelector(selectActiveProjectId);
  const environment = useAppSelector(selectEnvironment);
  const isMoving = useAppSelector(
    selectIsProjectPending(projectPendingKeys.move),
  );
  const failed = Boolean(useAppSelector(selectProjectError));
  const [target, setTarget] = useState("");

  const targets = projects.filter(
    (project) =>
      project.id !== activeId &&
      !project.archived &&
      projectAllows(project, environment, PROJECT_PERMISSION.RESOURCES_WRITE),
  );

  useEffect(() => {
    if (isOpen) {
      setTarget("");
    }
  }, [isOpen]);

  useOnSuccess(isMoving, failed, onClose);

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen={isOpen}
      onClose={onClose}
      title={t("project.move.title")}
      description={t("project.move.body", { count: ids.length })}
      size="md"
      data-testid="move-to-project-modal"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button intent="ghost" size="sm" onClick={onClose}>
            {t("confirm.cancel")}
          </Button>
          <Button
            type="button"
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24 text-sm"
            loading={isMoving}
            disabled={!target || ids.length === 0}
            onClick={() =>
              dispatch(moveResources({ kind, ids, targetProjectId: target }))
            }
            data-testid="move-to-project-submit"
          >
            {t("project.move.submit")}
          </Button>
        </div>
      }
    >
      {targets.length === 0 ? (
        <p className="text-ink-muted text-sm">{t("project.move.none")}</p>
      ) : (
        <FieldRow title={t("project.move.target")} htmlFor="move-target">
          <Select
            id="move-target"
            value={target}
            options={targets.map((project) => ({
              value: project.id,
              title: project.name,
            }))}
            onChange={setTarget}
          />
        </FieldRow>
      )}
    </Modal>
  );
}
