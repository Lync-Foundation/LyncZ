import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getBlogPostBySlug, getBlogPosts } from '@/lib/notion';
import type { BlogLocale } from '@/lib/notion';
import BlogPostPageClient from './BlogPostPageClient';

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

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getBlogPosts('en');
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const locale = getLocaleFromCookie();
  const post = await getBlogPostBySlug(slug, locale);

  if (!post) {
    notFound();
  }

  return <BlogPostPageClient post={post} />;
}
