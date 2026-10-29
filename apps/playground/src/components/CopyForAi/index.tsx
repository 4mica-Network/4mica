"use client";

import { cn, Dropdown } from "@4mica/ui";
import {
  AnimatePresence,
  motion,
  type Transition,
  useReducedMotion,
} from "framer-motion";
import {
  Check,
  ChevronDown,
  FileText,
  type LucideIcon,
  Sparkles,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { copyText } from "@/components/ActionGroup";
import { messages } from "@/i18n";

const CLOSE_AFTER_MS = 650;

export interface CopyForAiProps {
  markdown: string;
  prompt: string;
}

interface Item {
  id: "markdown" | "prompt";
  label: string;
  icon: LucideIcon;
  value: string;
}

export function CopyForAi({ markdown, prompt }: CopyForAiProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<Item["id"] | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  const menuId = useId();

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const close = () => {
    setOpen(false);
    setCopied(null);
    trigger.current?.focus();
  };

  const items: Item[] = [
    {
      id: "markdown",
      label: messages.ai.markdown,
      icon: FileText,
      value: markdown,
    },
    { id: "prompt", label: messages.ai.prompt, icon: Sparkles, value: prompt },
  ];

  const select = async (item: Item) => {
    if (!(await copyText(item.value, messages.ai.copied))) {
      return;
    }

    setCopied(item.id);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(close, CLOSE_AFTER_MS);
  };

  const swap: Transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.12, ease: "easeOut" };

  return (
    <>
      <motion.button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-xl border border-overlay/10 bg-overlay/4 pr-2.5 pl-3.5 text-ink-body text-sm transition-colors hover:bg-overlay/8 hover:text-ink-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40"
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      >
        {messages.ai.trigger}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          aria-hidden="true"
          className="text-ink-muted"
          transition={swap}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </motion.button>

      {open && (
        <Dropdown
          anchorRef={trigger}
          autoFocus
          className="rounded-xl border-overlay/10 p-1"
          isOpen
          onClickOutside={close}
          onDismiss={close}
          placement="bottomLeft"
          placementOffsetY={6}
        >
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            aria-label={messages.ai.trigger}
            className="flex min-w-52 flex-col gap-0.5"
            id={menuId}
            initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
            role="menu"
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          >
            {items.map((item) => {
              const isCopied = copied === item.id;
              const Icon = item.icon;

              return (
                <button
                  aria-label={isCopied ? messages.ai.copied : item.label}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-none",
                    isCopied
                      ? "bg-success/10 text-ink-strong"
                      : "text-ink-body hover:bg-overlay/6 hover:text-ink-strong focus-visible:bg-overlay/6",
                  )}
                  key={item.id}
                  onClick={() => select(item)}
                  role="menuitem"
                  type="button"
                >
                  <span className="relative grid h-4 w-4 place-items-center">
                    <AnimatePresence initial={false}>
                      <motion.span
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute inset-0 grid place-items-center"
                        exit={{ opacity: 0, scale: 0.6 }}
                        initial={{ opacity: 0, scale: 0.6 }}
                        key={isCopied ? "done" : "idle"}
                        transition={swap}
                      >
                        {isCopied ? (
                          <Check
                            aria-hidden="true"
                            className="h-4 w-4 text-success"
                          />
                        ) : (
                          <Icon
                            aria-hidden="true"
                            className="h-4 w-4 text-ink-muted"
                          />
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  {isCopied ? messages.ai.copied : item.label}
                </button>
              );
            })}
          </motion.div>
        </Dropdown>
      )}
    </>
  );
}
