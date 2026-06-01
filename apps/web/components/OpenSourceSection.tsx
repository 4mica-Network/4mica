import { Star } from "lucide-react";

const repoHref = "https://github.com/4mica-Network/4mica-core/";

export default function OpenSourceSection() {
  return (
    <section
      aria-labelledby="open-source-title"
      className="section-gloss relative py-20"
    >
      <div className="container mx-auto px-6">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.1fr] lg:items-center">
          <div>
            <h2
              id="open-source-title"
              className="font-bold text-5xl text-ink-strong tracking-tight sm:text-6xl lg:text-7xl"
            >
              <span className="text-ink-strong">Open-</span>
              <span className="text-ink-body">source</span>
            </h2>
            <p className="mt-6 max-w-[48ch] text-ink-body/80 text-lg leading-relaxed">
              We build in public. Browse the code, follow progress, and help
              shape 4mica on GitHub.
            </p>
            <a
              href={repoHref}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-invert btn-md mt-8"
            >
              <Star className="h-4 w-4" />
              Star us on GitHub
            </a>
          </div>
          <div className="relative flex items-center justify-center lg:justify-end">
            <div className="github-mark-wrap mt-8 sm:mt-0">
              <div className="github-mark-glow" aria-hidden="true" />
              <svg
                className="github-mark"
                viewBox="0 0 496 512"
                aria-hidden="true"
              >
                <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-6.1.1-11.1-3.2-11.1-7.2 0-2 2.3-3.6 5.2-3.6 6.1-.1 11.1 3.2 11.1 7.2zM244.8 8C106.9 8 0 113.1 0 251c0 110.7 69.8 204.2 166.5 237.4 12.2 2.2 16.5-5.2 16.5-11.6 0-5.7-.2-24.5-.3-44.4-67.7 14.7-82-32.7-82-32.7-11.1-28.1-27.1-35.6-27.1-35.6-22.2-15.2 1.7-14.9 1.7-14.9 24.6 1.7 37.5 25.3 37.5 25.3 21.9 37.5 57.3 26.7 71.3 20.4 2.2-15.9 8.6-26.7 15.6-32.8-54-6.1-110.7-27-110.7-120.3 0-26.6 9.5-48.3 25.3-65.3-2.5-6.1-11-30.7 2.4-64 0 0 20.6-6.6 67.4 24.9 19.6-5.5 40.6-8.3 61.5-8.4 20.9.1 41.9 2.9 61.5 8.4 46.8-31.5 67.4-24.9 67.4-24.9 13.4 33.3 4.9 57.9 2.4 64 15.7 17 25.2 38.7 25.2 65.3 0 93.5-56.7 114.1-110.9 120.1 8.8 7.5 16.5 22.4 16.5 45.1 0 32.6-.3 58.9-.3 67 0 6.4 4.3 13.9 16.6 11.6C428.2 455.2 498 361.7 498 251 498 113.1 392.9 8 244.8 8z" />
              </svg>
              <svg
                className="github-mark-sweep"
                viewBox="0 0 496 512"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id="github-sweep-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#48C9B0" stopOpacity="0" />
                    <stop offset="45%" stopColor="#48C9B0" stopOpacity="0.9" />
                    <stop offset="75%" stopColor="#7BCBFF" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#8066FF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-6.1.1-11.1-3.2-11.1-7.2 0-2 2.3-3.6 5.2-3.6 6.1-.1 11.1 3.2 11.1 7.2zM244.8 8C106.9 8 0 113.1 0 251c0 110.7 69.8 204.2 166.5 237.4 12.2 2.2 16.5-5.2 16.5-11.6 0-5.7-.2-24.5-.3-44.4-67.7 14.7-82-32.7-82-32.7-11.1-28.1-27.1-35.6-27.1-35.6-22.2-15.2 1.7-14.9 1.7-14.9 24.6 1.7 37.5 25.3 37.5 25.3 21.9 37.5 57.3 26.7 71.3 20.4 2.2-15.9 8.6-26.7 15.6-32.8-54-6.1-110.7-27-110.7-120.3 0-26.6 9.5-48.3 25.3-65.3-2.5-6.1-11-30.7 2.4-64 0 0 20.6-6.6 67.4 24.9 19.6-5.5 40.6-8.3 61.5-8.4 20.9.1 41.9 2.9 61.5 8.4 46.8-31.5 67.4-24.9 67.4-24.9 13.4 33.3 4.9 57.9 2.4 64 15.7 17 25.2 38.7 25.2 65.3 0 93.5-56.7 114.1-110.9 120.1 8.8 7.5 16.5 22.4 16.5 45.1 0 32.6-.3 58.9-.3 67 0 6.4 4.3 13.9 16.6 11.6C428.2 455.2 498 361.7 498 251 498 113.1 392.9 8 244.8 8z" />
              </svg>
              <span
                className="github-speck github-speck-1"
                aria-hidden="true"
              />
              <span
                className="github-speck github-speck-2"
                aria-hidden="true"
              />
              <span
                className="github-speck github-speck-3"
                aria-hidden="true"
              />
              <span
                className="github-speck github-speck-4"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
