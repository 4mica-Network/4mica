"use client";

import { motion } from "framer-motion";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

export function AutoHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const node = inner.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.borderBoxSize[0]?.blockSize ?? node.offsetHeight),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="overflow-hidden"
    >
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}
