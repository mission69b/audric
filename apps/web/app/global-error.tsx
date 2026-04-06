'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-black font-sans">
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="max-w-sm space-y-4">
            <h1 className="text-2xl font-semibold">Something broke.</h1>
            <p className="text-gray-500 leading-relaxed">
              We hit an unexpected error. Your funds are safe — this is a display issue only.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={reset}
                className="rounded-lg bg-black px-6 py-3 font-semibold text-white transition hover:opacity-80"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-lg border border-gray-200 px-6 py-3 font-semibold text-black transition hover:bg-gray-50"
              >
                Back to home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
