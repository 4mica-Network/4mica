import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

const loadFeatures = () => import("./features").then((mod) => mod.default);

const loadLayoutFeatures = () =>
  import("./layoutFeatures").then((mod) => mod.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}

export function LayoutMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadLayoutFeatures} strict>
      {children}
    </LazyMotion>
  );
}
