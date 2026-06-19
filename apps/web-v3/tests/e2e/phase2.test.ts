import { expect, test } from "@playwright/test";

// Phase 2 deliverables (SPEC_AUDRIC_V3 §5c/§6b): composer chips are PREFILL-only
// (injection, never auto-send) and the private-blob seam round-trips through the
// authed read route.

test.describe("Phase 2 — composer chips (prefill-only)", () => {
  test("clicking a chip prefills the composer without sending", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("suggested-actions")).toBeVisible();
    await page.getByText("Research a topic").first().click();

    // Injection-only: the text lands in the composer; nothing is sent.
    await expect(page.getByTestId("multimodal-input")).toHaveValue(
      "Research a topic"
    );
  });
});

test.describe("Phase 2 — private blob seam", () => {
  // 1x1 transparent PNG.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  );

  test("upload → authed read returns the same bytes", async ({ page }) => {
    // Establish a session in the browser context (page.request shares cookies).
    await page.goto("/");

    const uploadRes = await page.request.post("/api/files/upload", {
      multipart: {
        file: { name: "px.png", mimeType: "image/png", buffer: PNG },
      },
    });
    expect(uploadRes.ok()).toBeTruthy();

    const { url, pathname, contentType } = await uploadRes.json();
    expect(pathname).toBeTruthy();
    expect(contentType).toBe("image/png");
    // The seam returns the in-app authed read URL, never a public vendor URL.
    expect(url).toContain("/api/files/blob?pathname=");

    const readRes = await page.request.get(url);
    expect(readRes.status()).toBe(200);
    expect(readRes.headers()["content-type"]).toContain("image/png");

    const body = await readRes.body();
    expect(Buffer.compare(body, PNG)).toBe(0);
  });
});
