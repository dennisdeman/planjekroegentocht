import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export type BlogFrontmatter = {
  title: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  author?: string;
  image?: string; // path under /public, e.g. "/blog/X.jpg"
  imageAlt?: string;
  tags?: string[];
};

export type BlogPostMeta = BlogFrontmatter & {
  slug: string;
  readingMinutes: number;
};

export type BlogPost = BlogPostMeta & {
  contentHtml: string;
};

function ensureDir(): void {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }
}

function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

function parseFile(filename: string): { meta: BlogPostMeta; raw: string } {
  const fullPath = path.join(BLOG_DIR, filename);
  const file = fs.readFileSync(fullPath, "utf8");
  const parsed = matter(file);
  const fm = parsed.data as BlogFrontmatter;
  if (!fm.title || !fm.date || !fm.description) {
    throw new Error(`Blog post ${filename} mist verplichte frontmatter (title/date/description)`);
  }
  const slug = filename.replace(/\.md$/, "");
  return {
    raw: parsed.content,
    meta: {
      ...fm,
      slug,
      readingMinutes: readingTime(parsed.content),
    },
  };
}

export function getAllPosts(): BlogPostMeta[] {
  ensureDir();
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));
  return files
    .map((f) => parseFile(f).meta)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): BlogPost | null {
  ensureDir();
  const filename = `${slug}.md`;
  const fullPath = path.join(BLOG_DIR, filename);
  if (!fs.existsSync(fullPath)) return null;
  const { meta, raw } = parseFile(filename);
  const contentHtml = marked.parse(raw, { async: false }) as string;
  return { ...meta, contentHtml };
}

export function getAllSlugs(): string[] {
  ensureDir();
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}
