"use client";

import { cn } from "@4mica/ui";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export interface RevealLinkProps {
  href: string;
  children: ReactNode;
  external?: boolean;
  className?: string;
}

const ICON_WIDTH = 20;

export function RevealLink({
  href,
  children,
  external,
  className,
}: RevealLinkProps) {
  const [active, setActive] = useState(false);
  const reduceMotion = useReducedMotion();
  const Icon = external ? ExternalLink : ArrowUpRight;

  return (
    <motion.a
      className={cn("inline-flex items-center text-sm outline-none", className)}
      href={href}
      onBlur={() => setActive(false)}
      onFocus={() => setActive(true)}
      onHoverEnd={() => setActive(false)}
      onHoverStart={() => setActive(true)}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      <span
        className={cn(
          "transition-colors duration-200",
          active ? "text-ink-strong" : "text-ink-body",
        )}
      >
        {children}
      </span>

      <motion.span
        animate={{
          width: active ? ICON_WIDTH : 0,
          opacity: active ? 1 : 0,
        }}
        aria-hidden="true"
        className="inline-flex shrink-0 items-center overflow-hidden text-ink-muted"
        initial={false}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 520, damping: 34 }
        }
      >
        <Icon className="ml-1.5 h-3.5 w-3.5" />
      </motion.span>
    </motion.a>
  );
}
