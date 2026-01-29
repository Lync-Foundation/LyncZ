import { cookies } from 'next/headers';
import { getBlogPosts } from '@/lib/notion';
import type { BlogLocale } from '@/lib/notion';
import BlogPageClient from './BlogPageClient';

// Force dynamic rendering to access cookies
export const dynamic = 'force-dynamic';

const VALID_BLOG_LOCALES: BlogLocale[] = ['en', 'zh-CN', 'zh-TW'];

async function getLocaleFromCookie(): Promise<BlogLocale> {
  try {
    const cookieStore = await cookies();
    const nextLocale = cookieStore.get('NEXT_LOCALE')?.value;
    if (nextLocale && VALID_BLOG_LOCALES.includes(nextLocale as BlogLocale)) {
      return nextLocale as BlogLocale;
    }
  } catch {
    // Cookie access failed, use default
  }
  return 'en';
}

export default async function BlogPage() {
  const locale = await getLocaleFromCookie();
  const posts = await getBlogPosts(locale);
  return <BlogPageClient posts={posts} />;
}
// force rebuild 1769728705
