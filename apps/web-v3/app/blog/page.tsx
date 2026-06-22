import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog · Audric",
  description:
    "Notes on private, decentralized AI — from the team building Audric.",
};

export default function BlogIndexPage() {
  const posts = getAllPosts();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-12">
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Back to Audric
      </Link>
      <h1 className="mt-6 font-semibold text-3xl text-foreground tracking-tight">
        Blog
      </h1>
      <p className="mt-1 text-muted-foreground text-sm">
        Notes on private, decentralized AI.
      </p>

      {posts.length === 0 ? (
        <p className="mt-12 text-muted-foreground text-sm">No posts yet.</p>
      ) : (
        <div className="mt-10 flex flex-col gap-8">
          {posts.map((p) => (
            <Link className="group block" href={`/blog/${p.slug}`} key={p.slug}>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatDate(p.date)}
              </p>
              <h2 className="mt-1 font-semibold text-foreground text-lg transition-colors group-hover:text-foreground/70">
                {p.title}
              </h2>
              {p.description ? (
                <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                  {p.description}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
