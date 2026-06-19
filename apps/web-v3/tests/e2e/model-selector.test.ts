import { expect, test } from "@playwright/test";

// Audric v3 curated switcher (SPEC_AUDRIC_V3 §5/§5c): Kimi (Fast/Free, default)
// + DeepSeek / Grok / GPT-OSS-120B, all `Anon`-badged, under one "Available"
// group. (Replaces the stock template's Mistral/Moonshot group assertions.)
test.describe("Model Selector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("displays the model button defaulting to Kimi", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await expect(modelButton).toBeVisible();
    await expect(modelButton).toContainText("Kimi");
  });

  test("opens the model selector popover on click", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
  });

  test("can search for a model", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    await page.getByPlaceholder("Search models...").fill("DeepSeek");
    await expect(page.getByText("DeepSeek V3.2").first()).toBeVisible();
  });

  test("can close the model selector with Escape", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    await expect(page.getByPlaceholder("Search models...")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
  });

  test("shows the Available group", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    await expect(page.getByText("Available")).toBeVisible();
  });

  test("shows honest Anon privacy badges and a Free tier", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    // Every launch model is gateway-routed → Anon (never overclaim "private").
    await expect(page.getByText("Anon").first()).toBeVisible();
    // The free Fast model (Kimi) is labeled Free.
    await expect(page.getByText("Free").first()).toBeVisible();
  });

  test("can select a different model", async ({ page }) => {
    await page.getByTestId("model-selector").click();
    await page.getByText("DeepSeek V3.2").first().click();
    await expect(page.getByPlaceholder("Search models...")).not.toBeVisible();
    await expect(page.getByTestId("model-selector")).toContainText(
      "DeepSeek V3.2"
    );
  });
});
