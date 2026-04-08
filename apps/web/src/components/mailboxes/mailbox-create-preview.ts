import { buildRealisticMailboxAddressExample } from "@kaisoumail/shared";

export const RANDOM_ROOT_DOMAIN_OPTION_LABEL = "随机";
export const RANDOM_ROOT_DOMAIN_EXAMPLE = "<随机 active 域名>";
export const UNAVAILABLE_ROOT_DOMAIN_EXAMPLE = "<启用后可用的域名>";
export const SUPPORTED_FULL_ADDRESS_EXAMPLE = "<当前支持的完整邮箱地址>";

export type MailboxCreateInputMode = "segmented" | "address";

export type MailboxCreatePreviewState = {
  mode: MailboxCreateInputMode;
  rootDomain?: string;
  address?: string;
};

type MailboxCreatePreviewOptions = Partial<MailboxCreatePreviewState> & {
  hasAvailableDomains?: boolean;
};

export const buildMailboxCreateAddressExample = ({
  mode = "segmented",
  rootDomain,
  address,
  hasAvailableDomains = true,
}: MailboxCreatePreviewOptions) =>
  mode === "address"
    ? address ||
      buildRealisticMailboxAddressExample(
        hasAvailableDomains
          ? SUPPORTED_FULL_ADDRESS_EXAMPLE
          : UNAVAILABLE_ROOT_DOMAIN_EXAMPLE,
      )
    : buildRealisticMailboxAddressExample(
        rootDomain ||
          (hasAvailableDomains
            ? RANDOM_ROOT_DOMAIN_EXAMPLE
            : UNAVAILABLE_ROOT_DOMAIN_EXAMPLE),
      );

export const buildMailboxCreateDomainHint = ({
  mode = "segmented",
  rootDomain,
  address,
  hasAvailableDomains = true,
}: MailboxCreatePreviewOptions) =>
  mode === "address"
    ? address
      ? "当前将按完整邮箱地址创建；域名必须属于当前支持列表。"
      : hasAvailableDomains
        ? "切换后可直接输入完整邮箱地址；只有当前支持域名下的地址才可提交。"
        : "当前没有 active 邮箱域名可供分配；启用域名后才能输入受支持的完整邮箱地址。"
    : rootDomain
      ? "当前已手动指定邮箱域名；提交后会绑定这个具体域名。"
      : hasAvailableDomains
        ? "默认会随机分配一个 active 域名；只有手动选择时才会固定到具体域名。"
        : "当前没有 active 邮箱域名可供分配；启用域名后才能创建邮箱。";
