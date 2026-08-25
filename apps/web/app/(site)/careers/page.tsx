import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import JsonLd from "@components/JsonLd";
import ShinyHoverBorder from "@components/ShinyHoverBorder";
import { pageSchema } from "@seo/structuredData";
import { messages } from "@/i18n";
import LifeAt4Mica from "./LifeAt4Mica";

const GET_INVOLVED = messages.careers.getInvolved;

const VALUES = messages.careers.values;

const PERKS = messages.careers.perks;

export default function CareersPage() {
  return (
    <div className="min-h-screen">
      <JsonLd data={pageSchema([{ name: "Careers", path: "/careers" }])} />
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">{messages.careers.kicker}</p>
            <h1 className="section-title font-normal">
              {messages.careers.title}
            </h1>
            <p className="section-lead mx-auto max-w-2xl">
              {messages.careers.lead}
            </p>
          </div>

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

          <div className="mt-40">
            <div className="mx-auto max-w-2xl text-center">
              <p className="section-kicker">{messages.careers.valuesKicker}</p>
              <h2 className="section-title font-normal">
                {messages.careers.valuesTitle}
              </h2>
              <p className="section-lead mx-auto max-w-2xl">
                {messages.careers.valuesLead}
              </p>
            </div>

            <div className="mt-12 overflow-hidden rounded-md border border-overlay/10">
              <div className="grid divide-y divide-overlay/10 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
                {VALUES.map((value) => (
                  <div
                    key={value.title}
                    className="group relative bg-surface p-6 transition-colors duration-500 hover:bg-surface-solid sm:p-8"
                  >
                    <ShinyHoverBorder radiusClass="rounded-none" />
                    <div className="relative z-10">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
                        <i className={value.icon} />
                      </div>
                      <h3 className="font-semibold text-ink-strong text-xl">
                        {value.title}
                      </h3>
                      <p className="mt-2 text-ink-muted text-md leading-relaxed">
                        {value.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-40">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <p className="section-kicker">
                  {messages.careers.benefitsKicker}
                </p>
                <h2 className="section-title font-normal">
                  {messages.careers.benefitsTitle}
                </h2>
              </div>
              <p className="max-w-sm text-ink-body text-md leading-relaxed md:pb-2">
                {messages.careers.benefitsLead}
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PERKS.map((perk) => (
                <div
                  key={perk.title}
                  className="rounded-2xl border border-overlay/5 bg-overlay/3 p-6 transition-colors duration-300 hover:bg-overlay/5"
                >
                  <i className={`${perk.icon} text-2xl ${perk.color}`} />
                  <h3 className="mt-6 font-semibold text-ink-strong text-lg">
                    {perk.title}
                  </h3>
                  <p className="mt-2 text-ink-muted text-md leading-relaxed">
                    {perk.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <LifeAt4Mica />

          <div className="mt-40 text-center">
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
