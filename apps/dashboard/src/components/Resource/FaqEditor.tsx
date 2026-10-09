import { Button, InputField, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import type { ResourceRef } from "@stores/shared/type";
import {
  createFaq,
  deleteFaq,
  reorderFaqs,
  trustPendingKeys,
  updateFaq,
} from "@stores/trust/actions";
import {
  selectFaqs,
  selectIsTrustPending,
  selectTrustError,
  selectTrustIssues,
} from "@stores/trust/selector";
import type { Faq } from "@stores/trust/type";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import type { DragEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useOnSuccess } from "@/hooks/useOnSuccess";

function FaqRow({
  faq,
  position,
  total,
  onMove,
  resource,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isOver,
}: {
  faq: Faq;
  position: number;
  total: number;
  onMove: (offset: -1 | 1) => void;
  resource: ResourceRef;
  onDragStart: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
  isOver: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsTrustPending(trustPendingKeys.faq(faq.id)),
  );
  const error = useAppSelector(selectTrustError);
  const issues = useAppSelector(selectTrustIssues);

  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [attempted, setAttempted] = useState(false);

  useOnSuccess(isPending, error !== null, () => setAttempted(false));

  const showIssues = attempted && !isPending;

  const isDirty = question !== faq.question || answer !== faq.answer;

  return (
    <li
      className={[
        "flex items-start gap-2 rounded-lg border px-3 py-3 transition-colors",
        isDragging ? "opacity-40" : "",
        isOver ? "border-brand/40 bg-overlay/5" : "border-overlay/10",
      ].join(" ")}
      onDragEnd={onDrop}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        aria-label={t("appDetail.faq.reorder")}
        className="mt-2 cursor-grab text-ink-subtle active:cursor-grabbing"
        draggable
        onDragStart={onDragStart}
        type="button"
      >
        <GripVertical aria-hidden="true" className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <InputField
          aria-label={t("appDetail.faq.questionLabel", { n: position })}
          error={showIssues ? issues.question : undefined}
          maxLength={280}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("appDetail.faq.questionPlaceholder")}
          spellCheck
          value={question}
        />
        <InputField
          aria-label={t("appDetail.faq.answerLabel", { n: position })}
          error={showIssues ? issues.answer : undefined}
          maxLength={2000}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={t("appDetail.faq.answerPlaceholder")}
          rows={3}
          spellCheck
          value={answer}
          variant="textarea"
        />

        {isDirty && (
          <div className="flex justify-end gap-2">
            <Button
              intent="ghost"
              onClick={() => {
                setQuestion(faq.question);
                setAnswer(faq.answer);
              }}
              size="sm"
              type="button"
            >
              {t("settings.discard")}
            </Button>
            <Button
              className="btn-no-lift"
              disabled={isPending || !question.trim() || !answer.trim()}
              intent="invert"
              onClick={() => {
                setAttempted(true);
                dispatch(
                  updateFaq(resource, faq.id, {
                    question: question.trim(),
                    answer: answer.trim(),
                  }),
                );
              }}
              size="sm"
              type="button"
            >
              {isPending ? <Spinner size="sm" /> : t("settings.update")}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-1 flex shrink-0 flex-col gap-0.5">
        <Button
          aria-label={t("appDetail.faq.moveUp", { n: position })}
          disabled={isPending || position === 1}
          intent="ghost"
          onClick={() => onMove(-1)}
          size="sm"
        >
          <ArrowUp aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t("appDetail.faq.moveDown", { n: position })}
          disabled={isPending || position === total}
          intent="ghost"
          onClick={() => onMove(1)}
          size="sm"
        >
          <ArrowDown aria-hidden="true" className="h-4 w-4" />
        </Button>
        <ConfirmAction
          title={t("appDetail.faq.removeConfirm")}
          confirmLabel={t("confirm.remove")}
          onConfirm={() => dispatch(deleteFaq(resource, faq.id))}
        >
          <Button
            aria-label={t("appDetail.faq.remove", { n: position })}
            disabled={isPending}
            intent="ghost"
            size="sm"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </ConfirmAction>
      </div>
    </li>
  );
}

export function FaqEditor({ resource }: { resource: ResourceRef }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const faqs = useAppSelector(selectFaqs);
  const isAdding = useAppSelector(selectIsTrustPending("faq:new"));
  const error = useAppSelector(selectTrustError);
  const issues = useAppSelector(selectTrustIssues);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useOnSuccess(isAdding, error !== null, () => {
    setQuestion("");
    setAnswer("");
    setAttempted(false);
  });

  const showIssues = attempted && !isAdding;

  const add = () => {
    if (!question.trim() || !answer.trim() || isAdding) {
      return;
    }

    setAttempted(true);
    dispatch(
      createFaq(resource, {
        question: question.trim(),
        answer: answer.trim(),
      }),
    );
  };

  const move = (id: string, offset: -1 | 1) => {
    const ids = faqs.map((faq) => faq.id);
    const from = ids.indexOf(id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length) {
      return;
    }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    dispatch(reorderFaqs(resource, ids));
  };

  const commitOrder = () => {
    if (!dragId || !overId || dragId === overId) {
      setDragId(null);
      setOverId(null);
      return;
    }

    const ids = faqs.map((faq) => faq.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);

    ids.splice(to, 0, ids.splice(from, 1)[0]);

    dispatch(reorderFaqs(resource, ids));
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {faqs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {faqs.map((faq, index) => (
            <FaqRow
              faq={faq}
              position={index + 1}
              total={faqs.length}
              onMove={(offset) => move(faq.id, offset)}
              isDragging={dragId === faq.id}
              isOver={overId === faq.id && dragId !== faq.id}
              key={faq.id}
              onDragOver={(event) => {
                event.preventDefault();
                setOverId(faq.id);
              }}
              onDragStart={() => setDragId(faq.id)}
              onDrop={commitOrder}
              resource={resource}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-overlay/10 border-dashed px-3 py-3">
        <InputField
          aria-label={t("appDetail.faq.newQuestionLabel")}
          error={showIssues ? issues.question : undefined}
          maxLength={280}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("appDetail.faq.questionPlaceholder")}
          spellCheck
          value={question}
        />
        <InputField
          aria-label={t("appDetail.faq.newAnswerLabel")}
          error={showIssues ? issues.answer : undefined}
          maxLength={2000}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={t("appDetail.faq.answerPlaceholder")}
          spellCheck
          rows={2}
          value={answer}
          variant="textarea"
        />
        <div className="flex justify-end">
          <Button
            className="btn-no-lift"
            disabled={isAdding || !question.trim() || !answer.trim()}
            intent="invert"
            onClick={add}
            size="sm"
            type="button"
          >
            {isAdding ? (
              <Spinner size="sm" />
            ) : (
              <>
                <Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />
                {t("appDetail.faq.add")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
