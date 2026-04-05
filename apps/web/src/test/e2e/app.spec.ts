import { expect, test } from "@playwright/test";

test("demo console login and workspace mail flow", async ({ page }) => {
  const mailboxLocalPart = `e2e${Date.now().toString().slice(-6)}`;
  const mailboxAddress = `${mailboxLocalPart}@ops.alpha.mail.example.net`;

  await page.goto("/login");

  await page.getByLabel("API Key").fill("cfm_demo_secret_123456");
  await page.getByRole("button", { name: "登录控制台" }).click();

  await expect(page).toHaveURL(/\/workspace/);
  await expect(
    page.getByRole("heading", { name: "邮件工作台", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "新建邮箱" }).click();
  await expect(page.getByLabel("用户名")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("用户名")).toHaveCount(0);

  await page.getByRole("button", { name: "新建邮箱" }).click();
  await page.getByLabel("用户名").fill(mailboxLocalPart);
  await page.getByLabel("子域名").fill("ops.alpha");
  await page.getByLabel("邮箱域名").selectOption("mail.example.net");
  await page.getByRole("button", { name: "创建邮箱" }).click();

  const mailboxRow = page.getByRole("button", {
    name: new RegExp(mailboxAddress),
  });
  await expect(mailboxRow).toBeVisible();
  await expect(mailboxRow.getByText("新建")).toBeVisible();

  await page.getByRole("heading", { name: "邮件工作台", level: 1 }).click();
  await expect(mailboxRow.getByText("新建")).toHaveCount(0);

  await page.getByRole("button", { name: /全部邮箱/i }).click();
  await page.getByRole("button", { name: /Build artifacts ready/ }).click();

  await expect(
    page.getByRole("heading", { name: "Build artifacts ready" }),
  ).toBeVisible();
  await expect(page.getByText("bundle.zip")).toBeVisible();
});
