import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogContent } from "@/components/blog/blog-content";
import { formatDate, getAllPosts, getPost } from "@/lib/blog";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) {
    return { title: "Not found · Audric" };
  }
  return {
    title: `${post.title} · Audric`,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) {
    notFound();
  }
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-12">
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/blog"
      >
        ← Blog
      </Link>
      <h1 className="mt-6 font-semibold text-3xl text-foreground tracking-tight">
        {post.title}
      </h1>
      <p className="mt-1 text-muted-foreground text-sm">
        {formatDate(post.date)}
        {post.author ? ` · ${post.author}` : ""}
      </p>
      <BlogContent content={post.content} />
    </div>
  );
}
