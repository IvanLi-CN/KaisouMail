import { buildRealisticMailboxAddressExample } from "@kaisoumail/shared";
import { expect, test } from "@playwright/test";

test("demo console login and workspace mail flow", async ({ page }) => {
  const mailboxLocalPart = `e2e${Date.now().toString().slice(-6)}`;
  const manualMailboxLocalPart = `pick${Date.now().toString().slice(-6)}`;
  const fullAddressMailboxLocalPart = `full${Date.now().toString().slice(-6)}`;
  const randomPreviewAddress =
    buildRealisticMailboxAddressExample("<随机 active 域名>");
  const selectedDomainPreviewAddress =
    buildRealisticMailboxAddressExample("mail.example.net");
  const fullAddressPreview = `${fullAddressMailboxLocalPart}@ops.alpha.mail.example.net`;
  const randomMailboxAddress = new RegExp(
    `${mailboxLocalPart}@ops\\.alpha\\.(relay\\.example\\.test|mail\\.example\\.net)`,
  );
  const manualMailboxAddress = `${manualMailboxLocalPart}@ops.alpha.mail.example.net`;
  const searchMailbox = async (query: string) => {
    const searchInput = page.getByLabel("搜索邮箱");
    await searchInput.fill(query);
    await expect(searchInput).toHaveValue(query);
  };
  const clearMailboxSearch = async () => {
    await page.getByLabel("搜索邮箱").fill("");
  };
  const getMailboxRowByTriggerName = (name: RegExp | string) =>
    page.locator(".workspace-mailbox-item").filter({
      has: page.getByRole("button", { name }),
    });

  await page.goto("/login");

  await page.getByLabel("API Key").fill("cfm_demo_secret_123456");
  await page.getByRole("button", { name: "登录控制台" }).click();

  await expect(page).toHaveURL(/\/workspace/);
  await expect(
    page.getByRole("heading", { name: "邮件工作台", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "新建邮箱" }).click();
  await expect(page.getByLabel("用户名")).toBeVisible();
  await expect(page.getByLabel("邮箱域名")).toHaveValue("");
  const createHelpButton = page.getByRole("button", {
    name: "查看邮箱创建说明",
  });
  await expect(createHelpButton).toBeVisible();
  await createHelpButton.click();
  await expect(page.getByText(randomPreviewAddress)).toBeVisible();
  await createHelpButton.click();

  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByLabel("用户名")).toHaveCount(0);

  await page.getByRole("button", { name: "新建邮箱" }).click();
  await page.getByLabel("用户名").fill(mailboxLocalPart);
  await page.getByLabel("子域名").fill("ops.alpha");
  await page.getByRole("button", { name: "创建邮箱" }).click();

  await searchMailbox(mailboxLocalPart);
  const randomMailboxRow = getMailboxRowByTriggerName(randomMailboxAddress);
  await expect(randomMailboxRow).toBeVisible();
  await expect(randomMailboxRow.getByText("新建")).toBeVisible();

  await page.getByRole("heading", { name: "邮件工作台", level: 1 }).click();
  await expect(randomMailboxRow.getByText("新建")).toHaveCount(0);
  await clearMailboxSearch();

  await page.getByRole("button", { name: "新建邮箱" }).click();
  await page.getByLabel("用户名").fill(manualMailboxLocalPart);
  await page.getByLabel("子域名").fill("ops.alpha");
  await page.getByLabel("邮箱域名").selectOption("mail.example.net");
  await createHelpButton.click();
  await expect(page.getByText(selectedDomainPreviewAddress)).toBeVisible();
  await createHelpButton.click();
  await page.getByRole("button", { name: "创建邮箱" }).click();

  await searchMailbox(manualMailboxLocalPart);
  const mailboxRow = getMailboxRowByTriggerName(
    new RegExp(manualMailboxAddress),
  );
  await expect(mailboxRow).toBeVisible();
  await expect(mailboxRow.getByText("新建")).toBeVisible();

  await page.getByRole("heading", { name: "邮件工作台", level: 1 }).click();
  await expect(mailboxRow.getByText("新建")).toHaveCount(0);
  await clearMailboxSearch();

  await page.getByRole("button", { name: "新建邮箱" }).click();
  await page.getByRole("button", { name: "完整" }).click();
  await page
    .getByLabel("完整邮箱地址")
    .fill(
      `${fullAddressMailboxLocalPart.toUpperCase()}@Ops.Alpha.mail.example.net`,
    );
  await createHelpButton.click();
  await expect(page.getByText(fullAddressPreview)).toBeVisible();
  await createHelpButton.click();
  await page.getByRole("button", { name: "创建邮箱" }).click();

  await searchMailbox(fullAddressMailboxLocalPart);
  const fullAddressMailboxRow = getMailboxRowByTriggerName(
    new RegExp(fullAddressPreview),
  );
  await expect(fullAddressMailboxRow).toBeVisible();
  await expect(fullAddressMailboxRow.getByText("新建")).toBeVisible();

  await page.getByRole("heading", { name: "邮件工作台", level: 1 }).click();
  await expect(fullAddressMailboxRow.getByText("新建")).toHaveCount(0);
  await clearMailboxSearch();

  await page.getByRole("button", { name: /全部邮箱/i }).click();
  await page.getByRole("button", { name: /Build artifacts ready/ }).click();

  await expect(
    page.getByRole("heading", { name: "Build artifacts ready" }),
  ).toBeVisible();
  await expect(page.getByText("bundle.zip")).toBeVisible();
});
