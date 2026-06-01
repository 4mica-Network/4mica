import Image from "next/image";
import Link from "next/link";
import Footer from "../../components/Footer";
import Header from "../../components/Header";

export default function LeadershipPage() {
  const teamMembers = [
    {
      name: "Akash Madhusudan",
      role: "CEO & Co-Founder",
      image: "/assets/akash.jpg",
      imagePosition: "50% 18%",
      bio: "Spent a decade solving real problems across banking, AI, and cryptography to build 4Mica.",
    },
    {
      name: "Mairon Mahzoun",
      role: "CTO & Co-Founder",
      image: "/assets/mairon.jpg",
      imagePosition: "50% 20%",
      bio: "Focused on building payment infrastructure that scales across chains and real-world commerce.",
    },
    {
      name: "Tomer Ashur",
      role: "Co-Founder",
      image: "/assets/tomer.png",
      imagePosition: "50% 15%",
      bio: "Cryptography expert leading the instant transaction layer for next-gen commerce.",
    },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 pb-20">
        <section className="container mx-auto px-6">
          <div className="max-w-3xl">
            <p className="section-kicker">Team</p>
            <h1 className="section-title-lg">Team</h1>
            <p className="section-lead">
              4Mica is led by founders who have shipped payment infrastructure
              across finance, AI, and cryptography. We are focused on bringing
              production-grade credit rails to web3 commerce.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <div
                key={member.name}
                className="glass-panel overflow-hidden rounded-xl"
              >
                <div className="relative aspect-4/5 bg-surface-solid/35">
                  <Image
                    src={member.image}
                    alt={member.name}
                    fill
                    className="object-cover"
                    style={{
                      objectPosition: member.imagePosition ?? "50% 20%",
                    }}
                    quality={100}
                  />
                </div>
                <div className="p-6">
                  <h2 className="font-semibold text-ink-strong text-lg">
                    {member.name}
                  </h2>
                  <p className="mt-1 font-semibold text-brand text-sm">
                    {member.role}
                  </p>
                  <p className="mt-3 text-ink-body text-sm leading-relaxed">
                    {member.bio}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel mt-12 max-w-4xl rounded-2xl p-6 sm:p-8">
            <h2 className="font-semibold text-ink-strong text-xl">
              How we work
            </h2>
            <p className="mt-3 text-ink-body text-sm leading-relaxed">
              We build with a security-first mindset and keep every protocol
              component auditable. The team ships with a focus on production
              reliability, clear integration paths, and measurable outcomes for
              partners.
            </p>
            <div className="mt-4">
              <Link
                href="/about"
                className="link-accent inline-flex items-center font-semibold text-sm"
              >
                Read the 4Mica Mission
                <i className="ri-arrow-right-line ml-2 text-base"></i>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
