import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";

function ShinyHoverBorder({
  radiusClass = "rounded-md",
}: {
  radiusClass?: string;
}) {
  return (
    <>
      <div
        className={`pointer-events-none absolute inset-0 z-20 border border-white/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${radiusClass}`}
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

const GET_INVOLVED = [
  {
    title: "Contribute code",
    icon: "ri-git-branch-line",
    desc: "Open a PR or an issue on our repos — every protocol component is open and auditable.",
  },
  {
    title: "Share research",
    icon: "ri-flask-line",
    desc: "Working on payments, cryptography, or credit? We'd love to compare notes.",
  },
  {
    title: "Partner with us",
    icon: "ri-shake-hands-line",
    desc: "Building a service that needs instant settlement? Let's explore an integration.",
  },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">Careers</p>
            <h1 className="section-title font-normal">Build with us</h1>
            <p className="section-lead mx-auto max-w-2xl">
              We&apos;re not actively hiring right now — but we always welcome
              contributions and collaboration with builders who care about
              instant, on-chain commerce.
            </p>
          </div>

          {/* Ways to get involved — connected block */}
          <div className="mt-14 overflow-hidden rounded-md border border-white/10">
            <div className="grid divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {GET_INVOLVED.map((item) => (
                <div
                  key={item.title}
                  className="group relative bg-[#0a0a0a] p-8 transition-colors duration-500 hover:bg-[#101010] sm:p-10"
                >
                  <ShinyHoverBorder radiusClass="rounded-none" />
                  <div className="relative z-10">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-white/5 text-2xl text-white">
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
              Let&apos;s chat
            </h2>
            <p className="section-lead mx-auto max-w-xl">
              If you want to contribute, share research, or explore a
              partnership, reach out and we&apos;ll get back quickly.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={links.mailto.careers}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-5 py-2.5 font-semibold text-black text-md transition-colors hover:bg-white/90"
              >
                Chat with us
                <i className="ri-chat-3-line text-md" />
              </a>
              <a
                href={links.social.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-5 py-2.5 font-semibold text-ink-strong text-md transition-colors hover:bg-white/10"
              >
                <i className="ri-github-fill text-md" />
                Star on GitHub
              </a>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
