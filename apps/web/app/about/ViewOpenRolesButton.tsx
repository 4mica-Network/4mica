"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const MotionLink = motion(Link);

export default function ViewOpenRolesButton() {
  return (
    <MotionLink
      href="/careers"
      initial="rest"
      animate="rest"
      whileHover="hover"
      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-overlay/15 bg-overlay/5 px-5 py-2.5 font-semibold text-ink-strong text-md transition-colors hover:bg-overlay/10"
    >
      View open roles
      <motion.i
        className="ri-arrow-right-line text-md"
        variants={{ rest: { x: 0 }, hover: { x: 4 } }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      />
    </MotionLink>
  );
}
