"use client";

import { useEffect, useState } from "react";

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      setVisible(window.scrollY > document.documentElement.clientHeight);
    };

    toggleVisibility();
    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={`fixed right-6 bottom-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#151515] text-ink-strong transition-all duration-300 ease-in-out hover:scale-110 hover:bg-[#202020] sm:right-10 sm:bottom-10 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <i className="ri-arrow-up-line text-xl" />
    </button>
  );
}
