"use client";

import { cn } from "@4mica/ui";
import {
  AnimatePresence,
  motion,
  type Transition,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  LifeBuoy,
  ListChecks,
  MessageSquare,
  Play,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { CardAside, CardMain } from "@/components/CardShell";
import { messages, t } from "@/i18n";

const ICONS = {
  overview: FileText,
  about: BookOpen,
  reviews: MessageSquare,
  support: LifeBuoy,
  integrate: ListChecks,
  run: Play,
} as const;

type IconKey = keyof typeof ICONS;

export interface FlowStep {
  id: string;
  title: string;
  content: ReactNode;
  done?: boolean;
  icon?: IconKey;
}

export interface FlowGroup {
  id: string;
  label?: string;
  numbered?: boolean;
  collapsible?: boolean;
  icon?: IconKey;
  steps: FlowStep[];
}

export interface StepFlowProps {
  identity: ReactNode;
  groups: FlowGroup[];
}

export function StepFlow({ identity, groups }: StepFlowProps) {
  const steps = groups.flatMap((group) => group.steps);
  const [activeId, setActiveId] = useState(steps[0]?.id ?? "");
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const activeIndex = steps.findIndex((step) => step.id === activeId);
  const active = steps[activeIndex];
  const next = steps[activeIndex + 1];

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = 0;
    }
  }, [activeId]);

  const pill: Transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 500, damping: 40 };
  const enter: Transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.16, 1, 0.3, 1] };

  const panelId = (id: string) => `${baseId}-panel-${id}`;

  const go = (id: string) => {
    setActiveId(id);
    const owner = groups.find(
      (group) =>
        group.collapsible && group.steps.some((step) => step.id === id),
    );
    if (owner) {
      setOpenGroups((current) => new Set(current).add(owner.id));
    }
  };

  const toggle = (id: string) =>
    setOpenGroups((current) => {
      const nextGroups = new Set(current);
      if (!nextGroups.delete(id)) {
        nextGroups.add(id);
      }
      return nextGroups;
    });

  const renderStep = (step: FlowStep, index: number, numbered: boolean) => {
    const selected = step.id === activeId;
    const Icon = step.icon ? ICONS[step.icon] : null;

    return (
      <li key={step.id}>
        <button
          aria-controls={panelId(step.id)}
          aria-current={selected ? "step" : undefined}
          aria-label={
            step.done ? `${step.title}, ${messages.flow.done}` : undefined
          }
          className={cn(
            "relative flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40",
            selected ? "text-ink-strong" : "text-ink-muted hover:text-ink-body",
          )}
          onClick={() => go(step.id)}
          type="button"
        >
          {selected && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-md bg-overlay/6"
              layoutId={`${baseId}-pill`}
              transition={pill}
            />
          )}

          <span
            aria-hidden="true"
            className={cn(
              "relative grid h-5 w-5 shrink-0 place-items-center rounded-full text-2xs tabular-nums transition-colors",
              selected
                ? "bg-overlay/15 text-ink-strong"
                : "bg-overlay/6 text-ink-muted",
            )}
          >
            {step.done ? (
              <Check className="h-3 w-3" />
            ) : Icon ? (
              <Icon className="h-3 w-3" />
            ) : numbered ? (
              index + 1
            ) : null}
          </span>

          <span className="relative min-w-0 truncate">{step.title}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      <CardAside className="flex flex-col gap-6">
        {identity}

        <nav
          aria-label={messages.flow.stepsLabel}
          className="-mx-2 flex flex-col gap-1"
        >
          {groups.map((group) => {
            const List = group.numbered ? "ol" : "ul";
            const items = group.steps.map((step, index) =>
              renderStep(step, index, Boolean(group.numbered)),
            );

            if (!group.collapsible) {
              return (
                <List className="flex flex-col gap-0.5" key={group.id}>
                  {items}
                </List>
              );
            }

            const open = openGroups.has(group.id);
            const holdsActive = group.steps.some(
              (step) => step.id === activeId,
            );
            const GroupIcon = ICONS[group.icon ?? "integrate"];
            const listId = `${baseId}-group-${group.id}`;

            return (
              <div className="flex flex-col" key={group.id}>
                <button
                  aria-controls={listId}
                  aria-expanded={open}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-overlay/6 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40",
                    holdsActive
                      ? "text-ink-strong"
                      : "text-ink-muted hover:text-ink-body",
                  )}
                  onClick={() => toggle(group.id)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-overlay/6"
                  >
                    <GroupIcon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    aria-hidden="true"
                    className="text-ink-muted"
                    transition={pill}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      animate={{ height: "auto", opacity: 1 }}
                      className="overflow-hidden"
                      exit={{ height: 0, opacity: 0 }}
                      id={listId}
                      initial={{ height: 0, opacity: 0 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : {
                              height: {
                                duration: 0.22,
                                ease: [0.16, 1, 0.3, 1],
                              },
                              opacity: { duration: 0.15 },
                            }
                      }
                    >
                      <List className="flex flex-col gap-0.5 pt-0.5 pl-4">
                        {items}
                      </List>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>
      </CardAside>

      <CardMain>
        <div className="flex h-12 shrink-0 items-center border-overlay/10 border-b px-5 sm:px-6">
          <h2 className="truncate font-medium text-ink-strong text-sm">
            {active?.title}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" ref={panelRef}>
          {steps.map((step) => {
            const selected = step.id === activeId;

            return (
              <motion.div
                animate={selected ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                className="flex flex-col gap-5 p-5 sm:p-6"
                hidden={!selected}
                id={panelId(step.id)}
                initial={false}
                key={step.id}
                role="region"
                aria-label={step.title}
                transition={enter}
              >
                {step.content}
              </motion.div>
            );
          })}
        </div>

        {next && (
          <div className="flex h-12 shrink-0 items-center justify-end border-overlay/10 border-t px-3">
            <motion.button
              className="group inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-ink-muted text-xs transition-colors hover:bg-overlay/6 hover:text-ink-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40"
              onClick={() => go(next.id)}
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            >
              {t(messages.flow.next, { title: next.title })}
              <ArrowRight
                aria-hidden="true"
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </motion.button>
          </div>
        )}
      </CardMain>
    </>
  );
}
