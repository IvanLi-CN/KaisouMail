import { buildRealisticMailboxAddressExample } from "@kaisoumail/shared";
import { expect, type Locator, test } from "@playwright/test";

const expectMailboxHighlightBadge = async (
  rowButton: Locator,
  visible: boolean,
) => {
  const rowShell = rowButton.locator("xpath=..");
  const badge = rowShell.getByText("新建", { exact: true });

  if (visible) {
    await expect(badge).toBeVisible();
    return;
  }

  await expect(badge).toHaveCount(0);
};

test("demo console login and workspace mail flow", async ({ page }) => {
  const mailboxList = page.getByRole("region", { name: "邮箱列表" });
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

  const randomMailboxRow = mailboxList.getByRole("button", {
    name: randomMailboxAddress,
  });
  await expect(randomMailboxRow).toBeVisible();
  await expectMailboxHighlightBadge(randomMailboxRow, true);

  await page.getByRole("heading", { name: "邮件工作台", level: 1 }).click();
  await expectMailboxHighlightBadge(randomMailboxRow, false);

  await page.getByRole("button", { name: "新建邮箱" }).click();
  await page.getByLabel("用户名").fill(manualMailboxLocalPart);
  await page.getByLabel("子域名").fill("ops.alpha");
  await page.getByLabel("邮箱域名").selectOption("mail.example.net");
  await createHelpButton.click();
  await expect(page.getByText(selectedDomainPreviewAddress)).toBeVisible();
  await createHelpButton.click();
  await page.getByRole("button", { name: "创建邮箱" }).click();

  const mailboxRow = mailboxList.getByRole("button", {
    name: new RegExp(manualMailboxAddress),
  });
  await expect(mailboxRow).toBeVisible();
  await expectMailboxHighlightBadge(mailboxRow, true);

  await page.getByRole("heading", { name: "邮件工作台", level: 1 }).click();
  await expectMailboxHighlightBadge(mailboxRow, false);

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

  const fullAddressMailboxRow = mailboxList.getByRole("button", {
    name: new RegExp(fullAddressPreview),
  });
  await expect(fullAddressMailboxRow).toBeVisible();
  await expectMailboxHighlightBadge(fullAddressMailboxRow, true);

  await page.getByRole("heading", { name: "邮件工作台", level: 1 }).click();
  await expectMailboxHighlightBadge(fullAddressMailboxRow, false);

  await page.getByRole("button", { name: /全部邮箱/i }).click();
  await page.getByRole("button", { name: /Build artifacts ready/ }).click();

  await expect(
    page.getByRole("heading", { name: "Build artifacts ready" }),
  ).toBeVisible();
  await expect(page.getByText("bundle.zip")).toBeVisible();
});
