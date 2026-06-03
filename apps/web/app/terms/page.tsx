"use client";

import Footer from "@/components/Footer";
import Header from "@/components/Header";

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="min-h-screen pt-24 text-ink-body">
        <div className="container mx-auto px-6">
          <div className="glass-panel mx-auto max-w-3xl rounded-2xl p-8 sm:p-10">
            <h1 className="font-semibold text-3xl text-ink-strong">
              Terms of Service
            </h1>
            <p className="mt-3 text-ink-muted text-sm">
              Last updated: February 6, 2026
            </p>

            <div className="mt-6 space-y-4 text-sm leading-relaxed">
              <p>
                By using 4Mica, you agree to these terms. If you do not agree,
                do not use the service.
              </p>
              <p>
                4Mica provides software and interfaces to interact with
                blockchain networks. You are responsible for your wallet
                security, transaction approvals, and compliance with applicable
                laws.
              </p>
              <p>
                The service is provided “as is” without warranties of any kind.
                We are not liable for losses arising from blockchain
                transactions or third-party services.
              </p>
              <p>
                Questions? Contact us at{" "}
                <span className="font-mono">mairon@4mica.xyz</span>.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
