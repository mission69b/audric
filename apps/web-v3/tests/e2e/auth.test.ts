import { expect, test } from "@playwright/test";

// SKIPPED for Phase 2 (SPEC_AUDRIC_V3 §9): these exercise the stock Auth.js
// email/password login + register pages, which Phase 3 REPLACES with zkLogin
// Passport (Google sign-in → non-custodial wallet). Re-authored against the
// Passport flow in Phase 3; testing pages we're about to delete is noise.
test.describe
  .skip("Authentication Pages", () => {
    test("login page renders correctly", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByPlaceholder("user@acme.com")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
      await expect(page.getByText("Don't have an account?")).toBeVisible();
    });

    test("register page renders correctly", async ({ page }) => {
      await page.goto("/register");
      await expect(page.getByPlaceholder("user@acme.com")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
      await expect(page.getByText("Already have an account?")).toBeVisible();
    });

    test("can navigate from login to register", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("link", { name: "Sign up" }).click();
      await expect(page).toHaveURL("/register");
    });

    test("can navigate from register to login", async ({ page }) => {
      await page.goto("/register");
      await page.getByRole("link", { name: "Sign in" }).click();
      await expect(page).toHaveURL("/login");
    });
  });
