"use client";

import { motion, useAnimationFrame, useMotionValue } from "framer-motion";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { messages } from "@/i18n";

interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string;
  avatar: string;
}

const testimonials: readonly Testimonial[] = messages.team.testimonials;

const TestimonialCard = forwardRef<HTMLDivElement, { data: Testimonial }>(
  ({ data }, ref) => (
    <div
      ref={ref}
      className="mr-4 min-w-70 max-w-100 rounded-xl border border-overlay/10 bg-surface-deep/25 p-6 sm:mr-6 sm:min-w-90"
    >
      <div className="flex h-full flex-col justify-between gap-6">
        <blockquote className="font-medium text-ink-body text-md leading-relaxed sm:text-lg">
          &ldquo;{data.quote}&rdquo;
        </blockquote>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-overlay/10 bg-overlay/5 font-semibold text-ink-strong text-md">
            {data.avatar}
          </span>
          <div className="flex flex-col">
            <span className="text-ink-strong text-md">{data.name}</span>
            <span className="text-ink-muted text-md">{data.role}</span>
          </div>
        </div>
      </div>
    </div>
  ),
);
TestimonialCard.displayName = "TestimonialCard";

export default function LifeAt4Mica() {
  const firstCardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [isHovered, setIsHovered] = useState(false);
  const [cardWidth, setCardWidth] = useState(400 + 24);

  const measureCard = useCallback(() => {
    if (!firstCardRef.current) return;
    const el = firstCardRef.current;
    const styles = window.getComputedStyle(el);
    const mr = Number.parseFloat(styles.marginRight || "0");
    setCardWidth(el.offsetWidth + mr);
  }, []);

  useEffect(() => {
    measureCard();
    window.addEventListener("resize", measureCard);
    return () => window.removeEventListener("resize", measureCard);
  }, [measureCard]);

  useAnimationFrame((_, delta) => {
    if (isHovered) return;
    const moveBy = (delta / 1000) * 60;
    x.set(x.get() - moveBy);

    const segmentWidth = cardWidth * testimonials.length;
    if (Math.abs(x.get()) >= segmentWidth) {
      x.set(x.get() + segmentWidth);
    }
  });

  return (
    <div className="mt-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="section-kicker">{messages.team.cultureKicker}</p>
        <h2 className="section-title font-normal">
          {messages.team.cultureTitle}
        </h2>
        <p className="section-lead mx-auto max-w-2xl">
          {messages.team.cultureLead}
        </p>
      </div>

      <div
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsHovered(true)}
        onTouchEnd={() => setIsHovered(false)}
        className="mask-[linear-gradient(to_right,transparent_0%,black_8%,black_92%,transparent_100%)] mt-12 overflow-hidden"
      >
        <motion.div className="flex" style={{ x }}>
          {[...testimonials, ...testimonials, ...testimonials].map(
            (testimonial, idx) => (
              <TestimonialCard
                key={`${testimonial.id}-${idx}`}
                data={testimonial}
                ref={idx === 0 ? firstCardRef : undefined}
              />
            ),
          )}
        </motion.div>
      </div>
    </div>
  );
}
