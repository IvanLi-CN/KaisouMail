import { zodResolver } from "@hookform/resolvers/zod";
import { rootDomainRegex } from "@kaisoumail/shared";
import { Check, Copy, ExternalLink, Globe2 } from "lucide-react";
import type { FocusEvent, MouseEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DomainCatalogItem, DomainRecord } from "@/lib/contracts";
import {
  buildSubdomainDirectBindHint,
  classifyDomainBindError,
  type DomainBindErrorHint,
} from "@/lib/domain-bind-errors";
import {
  hasDelegationRecoveryStatus,
  isFreshDomainCatalogEntry,
} from "@/lib/domain-catalog";
import {
  classifyMailDomain,
  recommendApexMailboxBinding,
} from "@/lib/domain-classification";
import type { PublicDocsLinks } from "@/lib/public-docs";

const bindDomainSchema = z.object({
  mailDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(rootDomainRegex, "请输入有效邮箱域名，例如 example.com"),
});

type BindDomainValues = z.infer<typeof bindDomainSchema>;

type BindSuccessGuide = {
  mailDomain: string;
  title: string;
  summary: string;
  steps: string[];
  nameServers: string[];
  nameserverNote: string | null;
  cloudflareStatus?: string | null;
  projectStatus: DomainCatalogItem["projectStatus"] | DomainRecord["status"];
};

type BindSuccessGuideState = {
  mailDomain: string;
  fallbackResult: DomainRecord | DomainCatalogItem;
};

const buildNameserverGuideHref = (docsLinks?: PublicDocsLinks | null) =>
  docsLinks?.projectDomainBinding
    ? `${docsLinks.projectDomainBinding}#zone-pending-or-nameserver-not-delegated`
    : null;

const buildBindSuccessGuide = ({
  result,
  knownParentZones,
}: {
  result: DomainRecord | DomainCatalogItem;
  knownParentZones?: string[];
}): BindSuccessGuide => {
  const mailDomain = result.mailDomain;
  const projectStatus =
    "projectStatus" in result ? result.projectStatus : result.status;
  const cloudflareStatus =
    "cloudflareStatus" in result ? result.cloudflareStatus : null;
  const nameServers = "nameServers" in result ? result.nameServers : [];
  const classification = classifyMailDomain(mailDomain, { knownParentZones });
  const needsDelegationRecovery = hasDelegationRecoveryStatus({
    cloudflareStatus,
    lastProvisionError: result.lastProvisionError,
    allowMissingCloudflareStatus: !("cloudflareStatus" in result),
  });

  if (projectStatus === "active") {
    return {
      mailDomain,
      title: "域名已接入，可继续使用",
      summary: "当前域名已经可用，可以直接继续创建邮箱。",
      nameServers,
      nameserverNote: null,
      cloudflareStatus,
      projectStatus,
      steps: [
        "保持当前页面即可，后续新建邮箱时可直接选择这个域名。",
        "如果你需要确认接入状态，可在域名目录中看到 active。",
        "如果后续状态又变更，再按页面里的提示继续处理。",
      ],
    };
  }

  if (needsDelegationRecovery) {
    const isSubdomain = classification.type === "subdomain";
    const title = isSubdomain
      ? "还差一步：在父域添加 NS"
      : "还差一步：切换权威 NS";
    const summary =
      nameServers.length > 0
        ? isSubdomain
          ? `Cloudflare 已分配 nameserver。请去父域 ${classification.parentDomain} 的 DNS 管理处，为子域标签 ${classification.delegatedLabel} 添加下面这组 NS；完成后再回来重试。`
          : `Cloudflare 已分配 nameserver。请把 ${mailDomain} 的权威 NS 切到下面这组值；完成后再回来重试。`
        : "Cloudflare 已创建 zone，但 nameserver 还没返回；请先保持当前页面打开，系统会继续刷新。";
    const steps =
      nameServers.length > 0
        ? isSubdomain
          ? [
              `去父域 ${classification.parentDomain} 的 DNS / 注册商管理处，为子域标签 ${classification.delegatedLabel} 添加下面显示的 NS 记录。`,
              "保持当前页面打开，系统会自动刷新状态；等 Cloudflare 从 pending 变成 active。",
              "状态变成 active 后，对该域名点击“重试接入”。",
            ]
          : [
              `去当前 DNS / 注册商管理处，把 ${mailDomain} 的权威 NS 改成下面显示的值。`,
              "保持当前页面打开，系统会自动刷新状态；等 Cloudflare 从 pending 变成 active。",
              "状态变成 active 后，对该域名点击“重试接入”。",
            ]
        : isSubdomain
          ? [
              "先保留当前页面。",
              "保持当前页面打开，等待系统自动刷新拿到 nameserver。",
              `拿到 nameserver 后，去父域 ${classification.parentDomain} 的 DNS / 注册商管理处，为子域标签 ${classification.delegatedLabel} 添加对应的 NS 记录，再等待状态继续刷新。`,
            ]
          : [
              "先保留当前页面。",
              "保持当前页面打开，等待系统自动刷新拿到 nameserver。",
              `拿到 nameserver 后，把 ${mailDomain} 的权威 NS 改成对应值，再等待状态继续刷新。`,
            ];
    const nameserverNote =
      nameServers.length > 0
        ? isSubdomain
          ? `这是已有子域 zone 记录。若你继续维护它，请去父域 ${classification.parentDomain} 的 DNS 管理处，为子域标签 ${classification.delegatedLabel} 添加下面这组 NS。`
          : `这是 apex 接入，请把 ${mailDomain} 的权威 NS 切到下面这组值。`
        : null;

    return {
      mailDomain,
      title,
      summary,
      nameServers,
      nameserverNote,
      cloudflareStatus,
      projectStatus,
      steps,
    };
  }

  return {
    mailDomain,
    title: "绑定已提交，稍后再试",
    summary: "Cloudflare 暂时没有完成接入；这次不需要修改 NS。",
    nameServers: [],
    nameserverNote: null,
    cloudflareStatus,
    projectStatus,
    steps: [
      "先保留当前页面，系统会继续刷新状态。",
      "如果状态恢复正常，再按页面提示继续使用。",
      "如果之后仍是 provisioning_error，再回到列表点击“重试接入”。",
    ],
  };
};

const isDomainRecord = (value: unknown): value is DomainRecord =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  "mailDomain" in value &&
  "status" in value;

const isDomainCatalogItem = (value: unknown): value is DomainCatalogItem =>
  typeof value === "object" &&
  value !== null &&
  "mailDomain" in value &&
  "projectStatus" in value;

export const DomainBindCard = ({
  onSubmit,
  domains = [],
  docsLinks = null,
  isCatalogLive = true,
  isPending = false,
}: {
  onSubmit: (
    values: BindDomainValues,
  ) =>
    | Promise<DomainRecord | DomainCatalogItem | undefined>
    | DomainRecord
    | DomainCatalogItem
    | undefined;
  domains?: DomainCatalogItem[];
  docsLinks?: PublicDocsLinks | null;
  isCatalogLive?: boolean;
  isPending?: boolean;
}) => {
  const form = useForm<BindDomainValues>({
    resolver: zodResolver(bindDomainSchema),
    defaultValues: {
      mailDomain: "",
    },
  });
  const [submitError, setSubmitError] = useState<DomainBindErrorHint | null>(
    null,
  );
  const [successGuideState, setSuccessGuideState] =
    useState<BindSuccessGuideState | null>(null);
  const [copiedNameserver, setCopiedNameserver] = useState<string | null>(null);
  const knownParentZones = useMemo(
    () => domains.map((domain) => domain.mailDomain),
    [domains],
  );
  const successGuide = useMemo<BindSuccessGuide | null>(() => {
    if (!successGuideState) return null;

    const latestDomain = domains.find((domain) =>
      isFreshDomainCatalogEntry({
        domain,
        result: successGuideState.fallbackResult,
      }),
    );

    return buildBindSuccessGuide({
      result: latestDomain ?? successGuideState.fallbackResult,
      knownParentZones,
    });
  }, [domains, knownParentZones, successGuideState]);
  const nameserverGuideHref = buildNameserverGuideHref(docsLinks);
  const successGuideTitleId = useId();

  useEffect(() => {
    setCopiedNameserver((current) => {
      if (!current) return null;
      return successGuide?.nameServers.includes(current) ? current : null;
    });
  }, [successGuide]);

  const selectInputValue = (
    event: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>,
  ) => {
    event.currentTarget.select();
  };

  useEffect(() => {
    if (!successGuide) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSuccessGuideState(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [successGuide]);

  const openSuccessGuide = (result: DomainRecord | DomainCatalogItem) => {
    setCopiedNameserver(null);
    setSuccessGuideState({
      mailDomain: result.mailDomain,
      fallbackResult: result,
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-4 w-4" />
            绑定邮箱域名
          </CardTitle>
          <CardDescription>
            项目直绑目前仅支持 apex，例如 `example.com`。如果你需要
            `user@mail.example.com` 这类地址，请先绑定 apex，再在创建邮箱时把
            subdomain 填成 `mail`。
          </CardDescription>
          <div
            className="flex flex-wrap items-center gap-2 text-xs"
            data-testid="domain-bind-delegation-guide"
          >
            <p className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-100">
              apex 直绑若停在 <code>pending</code> /{" "}
              <code>provisioning_error</code>：先完成权威 NS 切换，再重试。
            </p>
            {nameserverGuideHref ? (
              <a
                href={nameserverGuideHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
              >
                查看步骤
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto] md:grid-rows-[auto_auto]"
            data-testid="domain-bind-form"
            onSubmit={form.handleSubmit(async (values) => {
              setSubmitError(null);
              const subdomainRecommendation = recommendApexMailboxBinding(
                values.mailDomain,
              );
              const existingSubdomainRecord = subdomainRecommendation
                ? domains.find(
                    (domain) =>
                      domain.mailDomain === subdomainRecommendation.mailDomain,
                  )
                : null;

              if (
                subdomainRecommendation &&
                !existingSubdomainRecord &&
                isCatalogLive
              ) {
                setSubmitError(
                  buildSubdomainDirectBindHint(
                    subdomainRecommendation,
                    docsLinks,
                  ),
                );
                return;
              }

              try {
                const result = await onSubmit(values);
                form.reset();
                if (isDomainRecord(result) || isDomainCatalogItem(result)) {
                  openSuccessGuide(result);
                }
              } catch (reason) {
                setSubmitError(
                  classifyDomainBindError(reason, docsLinks, values.mailDomain),
                );
              }
            })}
          >
            <div className="order-1 min-w-0 space-y-2 md:col-start-1 md:row-start-1">
              <Label htmlFor="mailDomain">邮箱域名（仅支持 apex 直绑）</Label>
              <Input
                aria-label="邮箱域名"
                id="mailDomain"
                placeholder="example.com"
                autoComplete="off"
                {...form.register("mailDomain")}
              />
            </div>
            <div
              className="order-2 min-h-5 text-sm md:col-start-1 md:row-start-2"
              data-testid="domain-bind-error"
              role={
                form.formState.errors.mailDomain?.message || submitError
                  ? "alert"
                  : undefined
              }
            >
              {form.formState.errors.mailDomain?.message ? (
                <p className="text-destructive">
                  {form.formState.errors.mailDomain.message}
                </p>
              ) : submitError ? (
                <div className="relative inline-flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-destructive/30 bg-background/95 px-3 py-2 text-xs shadow-sm">
                  <span className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t border-destructive/30 bg-background/95" />
                  <p className="font-medium text-destructive">
                    {submitError.title}
                  </p>
                  {submitError.rawMessage !== submitError.title ? (
                    <p className="basis-full text-muted-foreground">
                      {submitError.rawMessage}
                    </p>
                  ) : null}
                  {submitError.docsHref ? (
                    <a
                      href={submitError.docsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                    >
                      查看处理步骤
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              ) : (
                " "
              )}
            </div>
            <div
              className="order-3 flex md:col-start-2 md:row-start-1 md:items-end"
              data-testid="domain-bind-submit-slot"
            >
              <Button
                type="submit"
                className="w-full md:w-auto"
                disabled={isPending}
              >
                {isPending ? "绑定中…" : "绑定到 Cloudflare"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {successGuide ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          data-testid="domain-bind-success-guide-dialog"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={successGuideTitleId}
            className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-[0_36px_120px_rgba(2,6,23,0.58)]"
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                后续步骤
              </p>
              <h3
                id={successGuideTitleId}
                className="text-xl font-semibold tracking-tight text-foreground"
              >
                {successGuide.title}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                <span className="font-medium text-foreground">
                  {successGuide.mailDomain}
                </span>
                。{successGuide.summary}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-primary">
                  项目状态：{successGuide.projectStatus}
                </span>
                {successGuide.cloudflareStatus ? (
                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-100">
                    Cloudflare：{successGuide.cloudflareStatus}
                  </span>
                ) : null}
              </div>
            </div>
            {successGuide.nameServers.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-border/80 bg-background/60 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    需要使用的 nameserver
                  </p>
                  {successGuide.nameserverNote ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {successGuide.nameserverNote}{" "}
                      点击输入框会自动全选，每条可单独复制。
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2">
                  {successGuide.nameServers.map((nameServer) => (
                    <div
                      key={`${successGuide.mailDomain}:${nameServer}`}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2"
                    >
                      <Input
                        readOnly
                        value={nameServer}
                        aria-label={`Nameserver ${nameServer}`}
                        className="h-auto flex-1 border-0 bg-transparent px-0 font-mono text-sm text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        onFocus={selectInputValue}
                        onClick={selectInputValue}
                      />
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label={`复制 ${nameServer}`}
                        className="shrink-0"
                        onClick={async () => {
                          try {
                            if (!navigator.clipboard?.writeText) {
                              setCopiedNameserver(null);
                              return;
                            }
                            await navigator.clipboard.writeText(nameServer);
                            setCopiedNameserver(nameServer);
                          } catch {
                            setCopiedNameserver(null);
                          }
                        }}
                      >
                        {copiedNameserver === nameServer ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <ol className="mt-5 space-y-3">
              {successGuide.steps.map((step, index) => (
                <li
                  key={`${successGuide.mailDomain}:${step}`}
                  className="flex gap-3 rounded-2xl border border-border/80 bg-background/50 px-4 py-3"
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-foreground">{step}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                autoFocus
                onClick={() => {
                  setSuccessGuideState(null);
                }}
              >
                我知道了
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
