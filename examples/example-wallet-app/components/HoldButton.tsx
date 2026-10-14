"use client";

import { Button } from "@4mica/ui";
import {
  type AnimationPlaybackControls,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

interface HoldButtonProps {
  onConfirm: () => void;
  disabled?: boolean;
  seconds?: number;
  children: ReactNode;
}

export function HoldButton({
  onConfirm,
  disabled,
  seconds = 1.2,
  children,
}: HoldButtonProps) {
  const progress = useMotionValue(0);
  const width = useTransform(progress, (value) => `${value * 100}%`);
  const running = useRef<AnimationPlaybackControls | null>(null);

  const start = () => {
    if (disabled) return;
    running.current?.stop();
    running.current = animate(progress, 1, {
      duration: seconds * (1 - progress.get()),
      ease: "linear",
      onComplete: () => {
        progress.set(0);
        onConfirm();
      },
    });
  };

  const cancel = () => {
    if (progress.get() >= 1) return;
    running.current?.stop();
    running.current = animate(progress, 0, { duration: 0.25 });
  };

  const isHoldKey = (event: KeyboardEvent) =>
    event.key === " " || event.key === "Enter";

  return (
    <motion.div whileTap={disabled ? undefined : { scale: 0.97 }}>
      <Button
        intent="invert"
        block
        disabled={disabled}
        className="relative select-none overflow-hidden whitespace-nowrap"
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onKeyDown={(event) => {
          if (isHoldKey(event) && !event.repeat) {
            event.preventDefault();
            start();
          }
        }}
        onKeyUp={(event) => isHoldKey(event) && cancel()}
      >
        <motion.span
          aria-hidden
          style={{ width }}
          className="absolute inset-y-0 left-0 bg-brand/35"
        />
        <span className="relative">{children}</span>
      </Button>
    </motion.div>
  );
}
