'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { navigationItems, type Language } from './navigation';
import OverviewSection from './sections/OverviewSection';
import InstallationSection from './sections/InstallationSection';
import RegistrationSection from './sections/RegistrationSection';
import ServerIntegrationSection from './sections/ServerIntegrationSection';
import ClientIntegrationSection from './sections/ClientIntegrationSection';
import FacilitatorApiSection from './sections/FacilitatorApiSection';
import OperatorApiSection from './sections/OperatorApiSection';
import PaymentFlowSection from './sections/PaymentFlowSection';
import ExamplesSection from './sections/ExamplesSection';
import GuaranteeModesSection from './sections/GuaranteeModesSection';

const LANGUAGES: { id: Language; label: string; icon: string }[] = [
  { id: 'typescript', label: 'TypeScript', icon: 'ri-javascript-line' },
  { id: 'python', label: 'Python', icon: 'ri-code-s-slash-line' },
  { id: 'rust', label: 'Rust', icon: 'ri-terminal-box-line' },
];

const subtitles: Record<Language, string> = {
  typescript:
    '@4mica/x402 ships Express middleware and client helpers for the x402 Payment Protocol with 4Mica credit flow support, including standard (V1) and verified (V2) payment guarantees — V2 gates remuneration on ERC-8004 job-validation outcomes — plus automatic facilitator/scheme registration.',
  python:
    '4mica-x402 ships FastAPI and Flask server middleware and httpx/requests client helpers for the x402 Payment Protocol with 4Mica credit flow support, including standard (V1) and verified (V2) payment guarantees — V2 gates remuneration on ERC-8004 job-validation outcomes — plus automatic facilitator/scheme registration.',
  rust:
    'The 4Mica Rust SDK provides collateral management and wallet operations for the x402 Payment Protocol. Server middleware and HTTP client wrappers for Rust are on the roadmap.',
};

const LANGUAGE_AWARE_SECTIONS = new Set([
  'installation',
  'registration',
  'server-integration',
  'client-integration',
]);

export default function TechnicalDocsContent() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-20 text-ink-body" aria-busy>Loading technical docs…</div>}>
      <TechnicalDocsContentInner />
    </Suspense>
  );
}

function TechnicalDocsContentInner() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState('overview');
  const [language, setLanguage] = useState<Language>('typescript');

  useEffect(() => {
    const requestedSection = searchParams.get('section');
    const normalizedSection = requestedSection === 'guarantee-versions' ? 'guarantee-modes' : requestedSection;
    if (normalizedSection && navigationItems.some((item) => item.id === normalizedSection)) {
      setActiveSection(normalizedSection);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen pt-20 text-ink-body">
      <div className="container mx-auto px-6">
        <div className="text-center mb-10">
          <h1 className="section-title mb-6">
            4Mica x402 Integration Documentation
          </h1>
          <div className="accent-bar mx-auto mb-8"></div>

          <div className="flex justify-center gap-3 mb-6">
            {LANGUAGES.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setLanguage(id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  language === id
                    ? 'bg-brand-deep text-ink'
                    : 'text-ink-body hover:bg-white/10 border border-white/10'
                }`}
            >
                <i className={`${icon} text-base`} />
                {label}
              </button>
            ))}
          </div>

          <p className="section-lead max-w-3xl mx-auto text-xl">
            {subtitles[language]}
          </p>
        </div>

        {LANGUAGE_AWARE_SECTIONS.has(activeSection) && language === 'rust' && activeSection !== 'registration' && (
          <div className="mb-6 bg-white/5 border border-white/10 rounded-lg px-6 py-4 text-sm text-ink-body max-w-2xl mx-auto text-center">
            <i className="ri-time-line mr-2 text-base" />
            <span className="font-semibold text-ink-strong">Rust support is in progress.</span>{' '}
            The SDK is available for collateral management and wallet operations.
            Server middleware and HTTP client wrappers are coming soon.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <div className="glass-panel rounded-lg p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-ink-strong mb-4">Contents</h3>
              <nav className="space-y-2">
                {navigationItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center ${
                      activeSection === item.id
                        ? 'bg-brand-deep text-ink'
                        : 'text-ink-body hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <div className="w-5 h-5 flex items-center justify-center mr-3">
                      <i className={`${item.icon} text-lg`}></i>
                    </div>
                    {item.title}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="glass-panel rounded-lg p-8">
              {activeSection === 'overview' && <OverviewSection onNavigate={setActiveSection} language={language} />}
              {activeSection === 'installation' && <InstallationSection language={language} />}
              {activeSection === 'registration' && <RegistrationSection language={language} />}
              {activeSection === 'server-integration' && <ServerIntegrationSection language={language} />}
              {activeSection === 'client-integration' && <ClientIntegrationSection language={language} />}
              {activeSection === 'facilitator-api' && <FacilitatorApiSection />}
              {activeSection === 'operator-api' && <OperatorApiSection />}
              {activeSection === 'payment-flow' && <PaymentFlowSection />}
              {activeSection === 'examples' && <ExamplesSection />}
              {activeSection === 'guarantee-modes' && <GuaranteeModesSection />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
