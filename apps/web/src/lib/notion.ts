import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const databaseId = process.env.NOTION_BLOG_DATABASE_ID!;

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  summary: string;
  date: string;
  published: boolean;
}

export interface BlogPostWithContent extends BlogPost {
  content: string;
}

// Get all published blog posts
export async function getBlogPosts(): Promise<BlogPost[]> {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'Published',
        checkbox: {
          equals: true,
        },
      },
      sorts: [
        {
          property: 'Date',
          direction: 'descending',
        },
      ],
    });

    return response.results.map((page: any) => ({
      id: page.id,
      title: page.properties.Name?.title?.[0]?.plain_text || 'Untitled',
      slug: page.properties.Slug?.rich_text?.[0]?.plain_text || page.id,
      summary: page.properties.Summary?.rich_text?.[0]?.plain_text || '',
      date: page.properties.Date?.date?.start || new Date().toISOString().split('T')[0],
      published: page.properties.Published?.checkbox || false,
    }));
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }
}

// Get a single blog post by slug
export async function getBlogPostBySlug(slug: string): Promise<BlogPostWithContent | null> {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        and: [
          {
            property: 'Slug',
            rich_text: {
              equals: slug,
            },
          },
          {
            property: 'Published',
            checkbox: {
              equals: true,
            },
          },
        ],
      },
    });

    if (response.results.length === 0) {
      return null;
    }

    const page: any = response.results[0];
    
    // Get page content (blocks)
    const blocks = await notion.blocks.children.list({
      block_id: page.id,
    });

    const content = blocksToHtml(blocks.results);

    return {
      id: page.id,
      title: page.properties.Name?.title?.[0]?.plain_text || 'Untitled',
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

// Convert Notion blocks to HTML
function blocksToHtml(blocks: any[]): string {
  return blocks.map((block) => {
    const type = block.type;
    
    switch (type) {
      case 'paragraph':
        const text = richTextToHtml(block.paragraph.rich_text);
        return text ? `<p>${text}</p>` : '';
      
      case 'heading_1':
        return `<h1>${richTextToHtml(block.heading_1.rich_text)}</h1>`;
      
      case 'heading_2':
        return `<h2>${richTextToHtml(block.heading_2.rich_text)}</h2>`;
      
      case 'heading_3':
        return `<h3>${richTextToHtml(block.heading_3.rich_text)}</h3>`;
      
      case 'bulleted_list_item':
        return `<li>${richTextToHtml(block.bulleted_list_item.rich_text)}</li>`;
      
      case 'numbered_list_item':
        return `<li>${richTextToHtml(block.numbered_list_item.rich_text)}</li>`;
      
      case 'quote':
        return `<blockquote>${richTextToHtml(block.quote.rich_text)}</blockquote>`;
      
      case 'code':
        return `<pre><code>${richTextToHtml(block.code.rich_text)}</code></pre>`;
      
      case 'divider':
        return '<hr />';
      
      case 'image':
        const imageUrl = block.image.type === 'external' 
          ? block.image.external.url 
          : block.image.file.url;
        const caption = block.image.caption?.[0]?.plain_text || '';
        return `<figure><img src="${imageUrl}" alt="${caption}" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
      
      default:
        return '';
    }
  }).join('\n');
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
