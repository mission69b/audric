import { NextResponse } from "next/server";

/**
 * t2 code binary downloads (SPEC_INFERENCE_DEMAND step 2, milestone 3).
 *
 * The @t2000/code npm launcher requests
 *   api.t2000.ai/api/releases/download/{version}/{file}
 * and follows redirects — we 302 to the matching GitHub release asset on
 * mission69b/t2code-releases. Keeping the launcher pinned to api.t2000.ai
 * (not GitHub directly) means hosting can move later without shipping a new
 * npm launcher — installed launchers live forever.
 *
 * Strict allowlists (semver + the launcher's exact PLATFORM_TARGETS file
 * names) so this can't be used as an open redirect.
 */

const RELEASES_BASE =
  "https://github.com/mission69b/t2code-releases/releases/download";

const VERSION_RE = /^\d+\.\d+\.\d+$/;

const ALLOWED_FILES = new Set([
  "t2code-linux-x64.tar.gz",
  "t2code-linux-x64-baseline.tar.gz",
  "t2code-linux-arm64.tar.gz",
  "t2code-darwin-x64.tar.gz",
  "t2code-darwin-arm64.tar.gz",
  "t2code-win32-x64.tar.gz",
  "t2code-win32-x64-baseline.tar.gz",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string; file: string }> }
) {
  const { version, file } = await params;

  if (!VERSION_RE.test(version) || !ALLOWED_FILES.has(file)) {
    return NextResponse.json(
      { error: "Unknown release artifact" },
      { status: 404 }
    );
  }

  return NextResponse.redirect(`${RELEASES_BASE}/v${version}/${file}`, 302);
}
