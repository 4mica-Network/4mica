import Footer from "@components/Footer";
import Header from "@components/Header";
import TimelineSection from "./_components/TimelineSection";

export default function RoadmapPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-24 pb-20">
        <section className="w-full">
          <div className="max-w-3xl">
            <p className="section-kicker">Company</p>
            <h1 className="section-title-lg">Roadmap</h1>
            <p className="section-lead">
              A transparent view into how we deliver credit-backed payment rails
              for web3 commerce.
            </p>
          </div>
        </section>
        <TimelineSection showHeader={false} />
      </div>
      <Footer />
    </div>
  );
}
