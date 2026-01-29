import { cookies } from 'next/headers';
import { getBlogPosts } from '@/lib/notion';
import type { BlogLocale } from '@/lib/notion';
import BlogPageClient from './BlogPageClient';

export const revalidate = 60; // Revalidate every 60 seconds

const VALID_BLOG_LOCALES: BlogLocale[] = ['en', 'zh-CN', 'zh-TW'];

function getLocaleFromCookie(): BlogLocale {
  const cookieStore = cookies();
  const nextLocale = cookieStore.get('NEXT_LOCALE')?.value;
  if (nextLocale && VALID_BLOG_LOCALES.includes(nextLocale as BlogLocale)) {
    return nextLocale as BlogLocale;
  }
  return 'en';
}

export default async function BlogPage() {
  const locale = getLocaleFromCookie();
  const posts = await getBlogPosts(locale);
  return <BlogPageClient posts={posts} />;
}
