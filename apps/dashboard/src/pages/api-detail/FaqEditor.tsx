import { Button, InputField, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import type { ResourceRef } from "@stores/trust/actions";
import {
  createFaq,
  deleteFaq,
  reorderFaqs,
  updateFaq,
} from "@stores/trust/actions";
import { selectFaqs, selectIsTrustPending } from "@stores/trust/selector";
import type { Faq } from "@stores/trust/type";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { DragEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

function FaqRow({
  faq,
  resource,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isOver,
}: {
  faq: Faq;
  resource: ResourceRef;
  onDragStart: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
  isOver: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(selectIsTrustPending(`faq:${faq.id}`));

  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);

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
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <InputField
          maxLength={280}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("appDetail.faq.questionPlaceholder")}
          value={question}
        />
        <InputField
          maxLength={2000}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={t("appDetail.faq.answerPlaceholder")}
          rows={3}
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
              onClick={() =>
                dispatch(
                  updateFaq(resource, faq.id, {
                    question: question.trim(),
                    answer: answer.trim(),
                  }),
                )
              }
              size="sm"
              type="button"
            >
              {isPending ? <Spinner size="sm" /> : t("settings.update")}
            </Button>
          </div>
        )}
      </div>

      <Button
        aria-label={t("appDetail.faq.remove")}
        className="mt-1"
        disabled={isPending}
        intent="ghost"
        onClick={() => dispatch(deleteFaq(resource, faq.id))}
        size="sm"
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

export function FaqEditor({ resource }: { resource: ResourceRef }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const faqs = useAppSelector(selectFaqs);
  const isAdding = useAppSelector(selectIsTrustPending("faq:new"));

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const add = () => {
    if (!question.trim() || !answer.trim()) {
      return;
    }

    dispatch(
      createFaq(resource, {
        question: question.trim(),
        answer: answer.trim(),
      }),
    );
    setQuestion("");
    setAnswer("");
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
          {faqs.map((faq) => (
            <FaqRow
              faq={faq}
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
          maxLength={280}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("appDetail.faq.questionPlaceholder")}
          value={question}
        />
        <InputField
          maxLength={2000}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={t("appDetail.faq.answerPlaceholder")}
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
                <Plus className="mr-1.5 h-4 w-4" />
                {t("appDetail.faq.add")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
