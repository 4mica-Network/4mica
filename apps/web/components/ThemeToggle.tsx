"use client";

import { useTheme } from "@context/ThemeProvider";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Only reflect the resolved theme after mount to avoid a hydration mismatch.
  useEffect(() => setMounted(true), []);

  const isDark = !mounted || theme === "dark";
  const iconKey = isDark ? "moon" : "sun";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-ink-body transition-colors hover:bg-overlay/10 hover:text-ink-strong ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={iconKey}
          className="absolute inline-flex items-center justify-center"
          initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <i
            className={`${isDark ? "ri-moon-line" : "ri-sun-line"} text-lg leading-none`}
          />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
