import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_BLOG_DATABASE_ID!;

/** Locale used for blog content. Must match Notion "Locale" select options: en, zh-CN, zh-TW */
export type BlogLocale = 'en' | 'zh-CN' | 'zh-TW';

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  summary: string;
  date: string;
  published: boolean;
  locale?: BlogLocale;
}

export interface BlogPostWithContent extends BlogPost {
  content: string;
}

// Get all published blog posts for a locale. If DB has no "Locale" property, all posts are returned (EN).
export async function getBlogPosts(locale: BlogLocale = 'en'): Promise<BlogPost[]> {
  const sort = [{ property: 'Date', direction: 'descending' as const }];
  const publishedOnly = { property: 'Published', checkbox: { equals: true } };
  let results: any[] = [];

  try {
    // Try with Locale filter (requires "Locale" select property in Notion)
    const withLocale = {
      and: [publishedOnly, { property: 'Locale', select: { equals: locale } }],
    };
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: withLocale,
      sorts: sort,
    });
    results = response.results;
    if (results.length === 0 && locale !== 'en') {
      const enResponse = await notion.databases.query({
        database_id: databaseId,
        filter: { and: [publishedOnly, { property: 'Locale', select: { equals: 'en' } }] },
        sorts: sort,
      });
      results = enResponse.results;
    }
  } catch {
    // Locale property may not exist yet; fall back to no locale filter
    try {
      const fallback = await notion.databases.query({
        database_id: databaseId,
        filter: publishedOnly,
        sorts: sort,
      });
      results = fallback.results;
    } catch (error) {
      console.error('Error fetching blog posts:', error);
      return [];
    }
  }

  return results.map((page: any) => {
    const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as { title?: Array<{ plain_text: string }> } | undefined;
    const title = titleProp?.title?.[0]?.plain_text || page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
    const localeVal = page.properties.Locale?.select?.name as BlogLocale | undefined;
    return {
      id: page.id,
      title,
      slug: page.properties.Slug?.rich_text?.[0]?.plain_text || page.id,
      summary: page.properties.Summary?.rich_text?.[0]?.plain_text || '',
      date: page.properties.Date?.date?.start || new Date().toISOString().split('T')[0],
      published: page.properties.Published?.checkbox || false,
      locale: localeVal,
    };
  });
}

// Get a single blog post by slug for the given locale. Falls back to 'en' if no row for that locale.
export async function getBlogPostBySlug(slug: string, locale: BlogLocale = 'en'): Promise<BlogPostWithContent | null> {
  const baseFilter = [
    { property: 'Slug', rich_text: { equals: slug } },
    { property: 'Published', checkbox: { equals: true } },
  ];
  const withLocale = (loc: BlogLocale) => ({
    and: [...baseFilter, { property: 'Locale', select: { equals: loc } }],
  });

  try {
    let response = await notion.databases.query({
      database_id: databaseId,
      filter: withLocale(locale),
    });
    if (response.results.length === 0 && locale !== 'en') {
      response = await notion.databases.query({
        database_id: databaseId,
        filter: withLocale('en'),
      });
    }
    if (response.results.length === 0) {
      return null;
    }

    const page: any = response.results[0];
    const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as { title?: Array<{ plain_text: string }> } | undefined;
    const title = titleProp?.title?.[0]?.plain_text || page.properties.Name?.title?.[0]?.plain_text || 'Untitled';

    const blocks = await notion.blocks.children.list({
      block_id: page.id,
    });
    const content = await blocksToHtml(notion, blocks.results);

    return {
      id: page.id,
      title,
      slug: page.properties.Slug?.rich_text?.[0]?.plain_text || page.id,
      summary: page.properties.Summary?.rich_text?.[0]?.plain_text || '',
      date: page.properties.Date?.date?.start || new Date().toISOString().split('T')[0],
      published: page.properties.Published?.checkbox || false,
      content,
    };
  } catch (err: any) {
    // Locale property may not exist; try without it
    try {
      const fallback = await notion.databases.query({
        database_id: databaseId,
        filter: { and: baseFilter },
      });
      if (fallback.results.length === 0) return null;
      const page: any = fallback.results[0];
      const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as { title?: Array<{ plain_text: string }> } | undefined;
      const title = titleProp?.title?.[0]?.plain_text || page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
      const blocks = await notion.blocks.children.list({ block_id: page.id });
      const content = await blocksToHtml(notion, blocks.results);
      return {
        id: page.id,
        title,
        slug: page.properties.Slug?.rich_text?.[0]?.plain_text || page.id,
        summary: page.properties.Summary?.rich_text?.[0]?.plain_text || '',
        date: page.properties.Date?.date?.start || new Date().toISOString().split('T')[0],
        published: page.properties.Published?.checkbox || false,
        content,
      };
    } catch (error) {
      console.error('Error fetching blog post:', error);
      return null;
    }
  }
}

// Convert Notion blocks to HTML (async to fetch table children)
async function blocksToHtml(notionClient: Client, blocks: any[]): Promise<string> {
  const parts: string[] = [];
  for (const block of blocks) {
    const type = block.type;

    switch (type) {
      case 'paragraph': {
        const text = richTextToHtml(block.paragraph?.rich_text ?? []);
        parts.push(text ? `<p>${text}</p>` : '');
        break;
      }
      case 'heading_1':
        parts.push(`<h1>${richTextToHtml(block.heading_1?.rich_text ?? [])}</h1>`);
        break;
      case 'heading_2':
        parts.push(`<h2>${richTextToHtml(block.heading_2?.rich_text ?? [])}</h2>`);
        break;
      case 'heading_3':
        parts.push(`<h3>${richTextToHtml(block.heading_3?.rich_text ?? [])}</h3>`);
        break;
      case 'bulleted_list_item':
        parts.push(`<li>${richTextToHtml(block.bulleted_list_item?.rich_text ?? [])}</li>`);
        break;
      case 'numbered_list_item':
        parts.push(`<li>${richTextToHtml(block.numbered_list_item?.rich_text ?? [])}</li>`);
        break;
      case 'quote':
        parts.push(`<blockquote>${richTextToHtml(block.quote?.rich_text ?? [])}</blockquote>`);
        break;
      case 'code':
        parts.push(`<pre><code>${richTextToHtml(block.code?.rich_text ?? [])}</code></pre>`);
        break;
      case 'divider':
        parts.push('<hr />');
        break;
      case 'image': {
        const imageUrl = block.image?.type === 'external'
          ? block.image.external?.url
          : block.image?.file?.url;
        const caption = block.image?.caption?.[0]?.plain_text || '';
        if (imageUrl) {
          parts.push(`<figure><img src="${imageUrl}" alt="${escapeHtml(caption)}" />${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`);
        }
        break;
      }
      case 'table': {
        const tableHtml = await renderTable(notionClient, block);
        parts.push(tableHtml);
        break;
      }
      default:
        break;
    }
  }
  return parts.join('\n');
}

// Fetch table children and render as HTML
async function renderTable(notionClient: Client, tableBlock: any): Promise<string> {
  const tableId = tableBlock.id;
  const hasColumnHeader = tableBlock.table?.has_column_header ?? false;
  const { results } = await notionClient.blocks.children.list({ block_id: tableId });
  const rows = results.filter((b: any) => b.type === 'table_row');
  if (rows.length === 0) return '';

  const trs = rows.map((rowBlock: any, index: number) => {
    const cells = rowBlock.table_row?.cells ?? [];
    const useTh = hasColumnHeader && index === 0;
    const tag = useTh ? 'th' : 'td';
    const cellsHtml = cells
      .map((cell: any[]) => `<${tag}>${richTextToHtml(cell ?? [])}</${tag}>`)
      .join('');
    return `<tr>${cellsHtml}</tr>`;
  });

  return `<div class="notion-table-wrapper overflow-x-auto my-6"><table class="notion-table min-w-full border border-slate-200 dark:border-slate-700 border-collapse"><tbody>${trs.join('')}</tbody></table></div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convert rich text to HTML
function richTextToHtml(richText: any[]): string {
  if (!richText || richText.length === 0) return '';
  
  return richText.map((text) => {
    let content = text.plain_text;
    
    // Apply annotations
    if (text.annotations.bold) content = `<strong>${content}</strong>`;
    if (text.annotations.italic) content = `<em>${content}</em>`;
    if (text.annotations.strikethrough) content = `<del>${content}</del>`;
    if (text.annotations.underline) content = `<u>${content}</u>`;
    if (text.annotations.code) content = `<code>${content}</code>`;
    
    // Apply link
    if (text.href) {
      content = `<a href="${text.href}" target="_blank" rel="noopener noreferrer">${content}</a>`;
    }
    
    return content;
  }).join('');
}
