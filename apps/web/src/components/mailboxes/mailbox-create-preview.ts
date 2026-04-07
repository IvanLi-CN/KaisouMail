import { buildRealisticMailboxAddressExample } from "@kaisoumail/shared";

export const RANDOM_ROOT_DOMAIN_OPTION_LABEL = "随机";
export const RANDOM_ROOT_DOMAIN_EXAMPLE = "<随机 active 域名>";
export const UNAVAILABLE_ROOT_DOMAIN_EXAMPLE = "<启用后可用的域名>";

type MailboxCreatePreviewOptions = {
  rootDomain?: string;
  hasAvailableDomains?: boolean;
};

export const buildMailboxCreateAddressExample = ({
  rootDomain,
  hasAvailableDomains = true,
}: MailboxCreatePreviewOptions) =>
  buildRealisticMailboxAddressExample(
    rootDomain ||
      (hasAvailableDomains
        ? RANDOM_ROOT_DOMAIN_EXAMPLE
        : UNAVAILABLE_ROOT_DOMAIN_EXAMPLE),
  );

export const buildMailboxCreateDomainHint = ({
  rootDomain,
  hasAvailableDomains = true,
}: MailboxCreatePreviewOptions) =>
  rootDomain
    ? "当前已手动指定邮箱域名；提交后会绑定这个具体域名。"
    : hasAvailableDomains
      ? "默认会随机分配一个 active 域名；只有手动选择时才会固定到具体域名。"
      : "当前没有 active 邮箱域名可供分配；启用域名后才能创建邮箱。";
