
'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function BlogContent() {
  const [subscribedEmail, setSubscribedEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleNewsletterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('email', subscribedEmail);
    
    setIsSubscribed(true);
    setSubscribedEmail('');
  };

  const blogPosts = [
    {
      id: 1,
      title: 'Getting Paid with 4Mica',
      excerpt: 'This post explains V1 vs V2 first, then dives into tabs, req_ids, guarantees, certificates, and ERC-8004 validation-gated remuneration.',
      author: 'Mairon',
      date: '2026-01-29',
      readTime: '15 min read',
      category: 'Integration',
      href: '/resources/blog/getting-paid-by-4mica',
    },
    {
      id: 2,
      title: 'Paying with 4Mica',
      excerpt: 'A payer guide for 4Mica credit with V1/V2 signing, versioned payment-header retries (X-PAYMENT/PAYMENT-SIGNATURE), and validation-aware settlement behavior.',
      author: 'Mairon',
      date: '2026-01-29',
      readTime: '10 min read',
      category: 'Integration',
      href: '/resources/blog/paying-with-4mica',
    },
  ];

  const categories = ['All', 'Payments', 'Technology', 'Architecture', 'Integration', 'Security', 'Case Study', 'Economics'];
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredPosts = selectedCategory === 'All' 
    ? blogPosts 
    : blogPosts.filter(post => post.category === selectedCategory);

  return (
    <div className="min-h-screen pt-20 text-ink-body">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="section-title mb-6">
            4Mica Blog
          </h1>
          <div className="accent-bar mx-auto mb-8"></div>
          <p className="section-lead max-w-3xl mx-auto text-xl">
            Insights, updates, and thought leadership on AVS payments, blockchain infrastructure, and the future of decentralized finance.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Category Filter */}
            <div className="mb-8">
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                      selectedCategory === category
                        ? 'bg-brand-deep text-ink'
                        : 'bg-white/10 text-ink-body hover:bg-white/15 hover:text-ink-strong'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Blog Posts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {filteredPosts.map((post) => (
                <article key={post.id} className="glass-panel rounded-lg overflow-hidden transition-all hover:translate-y-[-2px]">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="bg-brand-deep text-ink px-3 py-1 rounded-full text-sm font-medium">
                        {post.category}
                      </span>
                      <span className="text-sm text-ink-muted">{post.readTime}</span>
                    </div>
                    
                    <h2 className="text-xl font-bold text-ink-strong mb-3 line-clamp-2">
                      {post.title}
                    </h2>
                    
                    <p className="text-ink-body mb-4 line-clamp-3">
                      {post.excerpt}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-brand-strong rounded-full flex items-center justify-center mr-3">
                          <span className="text-white text-sm font-semibold">
                            {post.author.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-ink-strong">{post.author}</p>
                          <p className="text-xs text-ink-muted">{post.date}</p>
                        </div>
                      </div>
                      
                      <Link 
                        href={post.href}
                        className="link-accent cursor-pointer whitespace-nowrap"
                      >
                        Read More →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Load More Button */}
            <div className="text-center mt-12">
              <button className="btn btn-primary btn-md whitespace-nowrap">
                Load More Articles
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="space-y-8">
              {/* Newsletter Signup */}
              <div className="glass-panel rounded-lg p-6">
                <h3 className="text-xl font-bold text-ink-strong mb-4">Stay Updated</h3>
                <p className="text-ink-body mb-4">
                  Get the latest insights on AVS payments and blockchain infrastructure.
                </p>
                
                {isSubscribed ? (
                  <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-lg p-4 text-center">
                    <div className="w-8 h-8 bg-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-check-line text-white"></i>
                      </div>
                    </div>
                    <p className="text-emerald-200 text-sm">Successfully subscribed!</p>
                  </div>
                ) : (
                  <form onSubmit={handleNewsletterSubmit} id="newsletter-signup">
                    <input
                      type="email"
                      name="email"
                      value={subscribedEmail}
                      onChange={(e) => setSubscribedEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-strong/60 mb-3 text-sm form-field-dark"
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-md w-full whitespace-nowrap"
                    >
                      Subscribe
                    </button>
                  </form>
                )}
              </div>

              {/* Recent Posts */}
              <div className="glass-panel rounded-lg p-6">
                <h3 className="text-xl font-bold text-ink-strong mb-4">Recent Posts</h3>
                <div className="space-y-4">
                  {blogPosts.slice(0, 3).map((post) => (
                    <Link 
                      key={post.id} 
                      href={post.href}
                      className="block cursor-pointer"
                    >
                      <div className="flex space-x-3 hover:bg-white/5 p-2 rounded transition-colors">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-ink-strong line-clamp-2 mb-1">
                            {post.title}
                          </h4>
                          <p className="text-xs text-ink-muted">{post.date}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Popular Tags */}
              <div className="glass-panel rounded-lg p-6">
                <h3 className="text-xl font-bold text-ink-strong mb-4">Popular Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {['AVS', 'Payments', 'Blockchain', 'DeFi', 'EigenLayer', 'Security', 'Integration', 'Architecture'].map((tag) => (
                    <span 
                      key={tag}
                      className="bg-white/10 text-ink-body px-3 py-1 rounded-full text-sm hover:bg-brand-deep hover:text-ink transition-colors cursor-pointer"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
