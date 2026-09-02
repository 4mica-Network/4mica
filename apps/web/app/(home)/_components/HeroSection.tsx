"use client";

import { links } from "@4mica/url";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { messages } from "@/i18n";
import MilkyWay from "./MilkyWay";

const { titlePrefix, rotatingWords, titleConnector, titleLine2 } =
  messages.home.hero;

export default function HeroSection() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;

    const query = window.matchMedia("(min-width: 40rem)");
    let id: ReturnType<typeof setInterval> | undefined;

    const sync = () => {
      clearInterval(id);
      id = undefined;
      if (!query.matches) {
        setIndex(0);
        return;
      }
      id = setInterval(() => {
        setIndex((prev) => (prev + 1) % rotatingWords.length);
      }, 2800);
    };

    sync();
    query.addEventListener("change", sync);
    return () => {
      clearInterval(id);
      query.removeEventListener("change", sync);
    };
  }, [reduceMotion]);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: "easeOut" as const },
    },
  };

  return (
    <section className="section-gloss relative isolate overflow-hidden">
      <div className="relative z-10 w-full">
        <div className="mx-auto w-full pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pt-36 lg:pb-32">
          <div className="flex min-w-0 flex-col items-center gap-10 text-center sm:gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:text-left">
            <motion.div
              className="flex flex-1 flex-col items-center lg:items-start"
              variants={container}
              initial="hidden"
              animate="show"
            >
              <motion.h1
                variants={item}
                className="select-none text-balance font-sans text-[clamp(1.6875rem,8.35vw,1.875rem)] text-ink-strong leading-tight tracking-[0.01em] sm:text-4xl md:text-5xl"
              >
                <span className="sr-only">
                  {titlePrefix} {rotatingWords[0]} {titleConnector} {titleLine2}
                </span>
                <span aria-hidden>
                  <span className="block sm:whitespace-nowrap">
                    {titlePrefix}{" "}
                    <span className="sm:hidden">{rotatingWords[0]}</span>
                    <span className="relative hidden text-left align-bottom sm:inline-grid">
                      {rotatingWords.map((word) => (
                        <span
                          key={word}
                          className="invisible col-start-1 row-start-1"
                        >
                          {word}
                        </span>
                      ))}
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={index}
                          className="col-start-1 row-start-1"
                          initial={{ opacity: 0, filter: "blur(10px)" }}
                          animate={{ opacity: 1, filter: "blur(0px)" }}
                          exit={{ opacity: 0, filter: "blur(10px)" }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        >
                          {rotatingWords[index]}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </span>
                  <span className="block">
                    {titleConnector} {titleLine2}
                  </span>
                </span>
              </motion.h1>

              <motion.p
                variants={item}
                className="mt-6 max-w-xl select-none text-ink-body/80 text-md leading-relaxed sm:text-lg md:text-xl"
              >
                {messages.home.hero.subtitle}
              </motion.p>

              <motion.div
                variants={item}
                className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
              >
                <a
                  href={links.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-lg btn-no-lift hero-cta-primary w-full whitespace-nowrap font-semibold sm:w-auto"
                >
                  <span>{messages.common.actions.startBuilding}</span>
                </a>
                <a
                  href="#how-it-works"
                  className="hero-cta-ghost inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-overlay/15 bg-overlay/5 px-5 py-2.5 font-semibold text-ink-strong text-md leading-none backdrop-blur-sm transition-colors duration-200 ease-out hover:text-surface-deep sm:w-auto"
                >
                  <i className="ri-play-fill relative z-10 text-lg leading-none" />
                  <span className="relative z-10">
                    {messages.common.actions.seeHowItWorks}
                  </span>
                </a>
              </motion.div>

              <motion.p
                variants={item}
                className="mt-10 font-light text-ink-muted text-md"
              >
                {messages.home.hero.supportedOn}{" "}
                <a
                  href={links.api.base}
                  className="font-semibold text-ink-body transition-colors hover:text-ink-strong"
                >
                  {messages.home.hero.supportedNetworks.base}
                </a>
                ,{" "}
                <a
                  href={links.api.ethereumSepolia}
                  className="font-semibold text-ink-body transition-colors hover:text-ink-strong"
                >
                  {messages.home.hero.supportedNetworks.ethereumSepolia}
                </a>
              </motion.p>
            </motion.div>

            <motion.div
              className="hidden shrink-0 lg:block"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
            >
              <MilkyWay />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
