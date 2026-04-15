'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-transparent text-ink py-12">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <Link href="/" className="text-3xl font-bold font-pacifico mb-4 block">
              4Mica
            </Link>
            <p className="text-ink/80 leading-relaxed max-w-md">
              Instant, cryptographically-backed lines-of-credit for any product. Secure, seamless, and decentralized.
            </p>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="link-muted cursor-pointer">
                  4Mica Mission
                </Link>
              </li>
              <li>
                <Link href="/leadership" className="link-muted cursor-pointer">
                  Team
                </Link>
              </li>
              <li>
                <Link href="/#resources" className="link-muted cursor-pointer">
                  Resources
                </Link>
              </li>
              <li>
                <Link href="/roadmap" className="link-muted cursor-pointer">
                  Roadmap
                </Link>
              </li>
              <li>
                <Link href="/careers" className="link-muted cursor-pointer">
                  Careers
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Follow Us</h4>
            <div className="flex space-x-4">
              <Link href="https://x.com/0x4Mica" className="link-muted cursor-pointer">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-twitter-line text-xl"></i>
                </div>
              </Link>
              <Link href="https://www.linkedin.com/company/4mica" className="link-muted cursor-pointer">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-linkedin-line text-xl"></i>
                </div>
              </Link>
              <Link href="https://github.com/4mica-Network" className="link-muted cursor-pointer">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-github-line text-xl"></i>
                </div>
              </Link>
            </div>
          </div>
        </div>
        
        <div className="border-t border-ink/20 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-ink/80 mb-4 md:mb-0">
              © 2026 4Mica. All rights reserved
            </p>
            <div className="flex space-x-6">
              <Link href="/privacy" className="link-muted cursor-pointer whitespace-nowrap">
                Privacy Policy
              </Link>
              <Link href="/terms" className="link-muted cursor-pointer whitespace-nowrap">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
