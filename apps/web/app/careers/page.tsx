import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";

export default function CareersPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-24 pb-20">
        <section className="w-full">
          <div className="max-w-3xl">
            <p className="section-kicker">Company</p>
            <h1 className="section-title-lg">Careers</h1>
            <p className="section-lead">
              At the moment we are not hiring, but we welcome contributions and
              collaboration with builders who care about instant, on-chain
              commerce.
            </p>
          </div>

          <div className="glass-panel mt-12 max-w-3xl rounded-2xl p-8">
            <h2 className="font-semibold text-2xl text-ink-strong">
              Let&apos;s chat
            </h2>
            <p className="mt-3 text-ink-body text-sm leading-relaxed">
              If you want to contribute, share research, or explore a
              partnership, reach out and we&apos;ll get back quickly.
            </p>
            <a
              href={links.mailto.contact}
              className="btn btn-primary btn-md mt-6"
            >
              Chat with us
              <i className="ri-chat-3-line text-base"></i>
            </a>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
