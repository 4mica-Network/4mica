import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import { messages } from "@/i18n";

function ShinyHoverBorder({
  radiusClass = "rounded-md",
}: {
  radiusClass?: string;
}) {
  return (
    <>
      <div
        className={`pointer-events-none absolute inset-0 z-20 border border-overlay/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${radiusClass}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${radiusClass}`}
        style={{
          padding: "1px",
          background:
            "linear-gradient(115deg, rgba(255,255,255,0), rgba(255,255,255,0.36), rgba(255,255,255,0.04), rgba(255,255,255,0))",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
        }}
      />
    </>
  );
}

const GET_INVOLVED = messages.careers.getInvolved;

export default function CareersPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">{messages.careers.kicker}</p>
            <h1 className="section-title font-normal">
              {messages.careers.title}
            </h1>
            <p className="section-lead mx-auto max-w-2xl">
              {messages.careers.lead}
            </p>
          </div>

          {/* Ways to get involved — connected block */}
          <div className="mt-14 overflow-hidden rounded-md border border-overlay/10">
            <div className="grid divide-y divide-overlay/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {GET_INVOLVED.map((item) => (
                <div
                  key={item.title}
                  className="group relative bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid sm:p-10"
                >
                  <ShinyHoverBorder radiusClass="rounded-none" />
                  <div className="relative z-10">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
                      <i className={item.icon} />
                    </div>
                    <h3 className="font-semibold text-ink-strong text-xl">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-ink-muted text-md leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="mt-24 text-center">
            <h2 className="mx-auto max-w-2xl font-normal text-3xl text-ink-strong tracking-tight md:text-4xl">
              {messages.careers.ctaTitle}
            </h2>
            <p className="section-lead mx-auto max-w-xl">
              {messages.careers.ctaLead}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={links.mailto.contact}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-strong px-5 py-2.5 font-semibold text-md text-surface-deep transition-colors hover:bg-ink-strong/90"
              >
                {messages.common.actions.chatWithUs}
                <i className="ri-chat-3-line text-md" />
              </a>
              <a
                href={links.social.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-overlay/15 bg-overlay/5 px-5 py-2.5 font-semibold text-ink-strong text-md transition-colors hover:bg-overlay/10"
              >
                <i className="ri-github-fill text-md" />
                {messages.common.actions.starOnGithub}
              </a>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
