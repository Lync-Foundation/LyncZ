'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Calendar } from 'lucide-react';
import type { BlogPostWithContent } from '@/lib/notion';

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

export default function BlogPostPageClient({ post }: { post: BlogPostWithContent }) {
  const t = useTranslations('blog');
  const locale = useLocale();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-purple-950/20">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Back Link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToBlog')}
        </Link>

        {/* Article Header */}
        <article>
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              {post.title}
            </h1>
            {post.summary && (
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
                {post.summary}
              </p>
            )}
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-500">
              <Calendar className="w-4 h-4" />
              <time dateTime={post.date}>
                {formatDate(post.date, locale)}
              </time>
            </div>
          </header>

          {/* Article Content */}
          <div
            className="prose prose-slate dark:prose-invert max-w-none
              prose-headings:font-semibold prose-headings:text-slate-900 dark:prose-headings:text-white
              prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
              prose-p:text-slate-600 dark:prose-p:text-slate-300
              prose-a:text-purple-600 dark:prose-a:text-purple-400 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-slate-900 dark:prose-strong:text-white
              prose-code:text-purple-600 dark:prose-code:text-purple-400 prose-code:bg-purple-50 dark:prose-code:bg-purple-900/20 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
              prose-pre:bg-slate-900 dark:prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-700
              prose-blockquote:border-l-purple-500 prose-blockquote:bg-purple-50/50 dark:prose-blockquote:bg-purple-900/10 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg
              prose-img:rounded-xl prose-img:shadow-lg
              prose-hr:border-slate-200 dark:prose-hr:border-slate-800
              prose-li:text-slate-600 dark:prose-li:text-slate-300
              prose-table:border-collapse prose-table:w-full prose-th:border prose-th:border-slate-200 dark:prose-th:border-slate-700 prose-th:bg-slate-100 dark:prose-th:bg-slate-800 prose-th:px-4 prose-th:py-2 prose-th:text-left
              prose-td:border prose-td:border-slate-200 dark:prose-td:border-slate-700 prose-td:px-4 prose-td:py-2"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToBlog')}
          </Link>
        </div>
      </div>
    </div>
  );
}
