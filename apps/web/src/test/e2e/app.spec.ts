import { expect, test } from "@playwright/test";

test("demo console login and message detail flow", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("API Key").fill("cfm_demo_secret_123456");
  await page.getByRole("button", { name: "登录控制台" }).click();

  await expect(page).toHaveURL(/\/mailboxes$/);
  await expect(page.getByText("邮箱控制台")).toBeVisible();

  await page.getByRole("link", { name: "Build artifacts ready" }).click();

  await expect(page).toHaveURL(/\/messages\/msg_alpha$/);
  await expect(
    page.getByRole("heading", { name: "Build artifacts ready", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("bundle.zip")).toBeVisible();
});
