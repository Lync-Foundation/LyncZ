import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getBlogPostBySlug, getBlogPosts } from '@/lib/notion';
import type { BlogLocale } from '@/lib/notion';
import BlogPostPageClient from './BlogPostPageClient';

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

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocaleFromCookie();
  const post = await getBlogPostBySlug(slug, locale);

  if (!post) {
    notFound();
  }

  return <BlogPostPageClient post={post} />;
}
