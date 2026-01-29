'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowRight, Calendar, Newspaper } from 'lucide-react';
import type { BlogPost } from '@/lib/notion';
import SciFiBackground from '@/components/SciFiBackground';

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  const localeMap: Record<string, string> = {
    en: 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
  };
  return date.toLocaleDateString(localeMap[locale] ?? 'en-US', options);
}

export default function BlogPageClient({ posts }: { posts: BlogPost[] }) {
  const t = useTranslations('blog');
  const locale = useLocale();

  return (
    <div className="min-h-screen relative">
      <SciFiBackground />
      <div className="container mx-auto px-4 py-12 max-w-4xl relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100/50 dark:bg-purple-900/20 rounded-full text-purple-700 dark:text-purple-300 text-sm font-medium mb-4">
            <Newspaper className="w-4 h-4" />
            {t('badge')}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
            {t('title')}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        {/* Blog Posts */}
        {posts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Newspaper className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t('noPosts')}
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {t('checkBackSoon')}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="block group"
              >
                <article className="p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-200/50 dark:border-slate-700/50 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors mb-2">
                        {post.title}
                      </h2>
                      {post.summary && (
                        <p className="text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                          {post.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-500">
                        <Calendar className="w-4 h-4" />
                        <time dateTime={post.date}>
                          {formatDate(post.date, locale)}
                        </time>
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-800/40 transition-colors">
                      <ArrowRight className="w-5 h-5 text-purple-600 dark:text-purple-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}

        {/* Back to Home */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            ← {t('backToHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
