import { expect, test } from "@playwright/test";

test("demo console login and workspace mail flow", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("API Key").fill("cfm_demo_secret_123456");
  await page.getByRole("button", { name: "登录控制台" }).click();

  await expect(page).toHaveURL(/\/workspace/);
  await expect(
    page.getByRole("heading", { name: "邮件工作台", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Build artifacts ready/ }).click();

  await expect(
    page.getByRole("heading", { name: "Build artifacts ready" }),
  ).toBeVisible();
  await expect(page.getByText("bundle.zip")).toBeVisible();
});
