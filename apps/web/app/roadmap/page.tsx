import Footer from "../../components/Footer";
import Header from "../../components/Header";
import TimelineSection from "../../components/TimelineSection";

export default function RoadmapPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 pb-20">
        <section className="container mx-auto px-6">
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
      </main>
      <Footer />
    </div>
  );
}
