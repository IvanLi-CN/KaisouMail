import {
  Check,
  CheckCircle2,
  CloudOff,
  Copy,
  ExternalLink,
  PanelRightOpen,
  RefreshCcw,
  ShieldBan,
  Trash2,
} from "lucide-react";
import type { FocusEvent, MouseEvent } from "react";
import { useEffect, useId, useState } from "react";

import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { DomainCatalogItem } from "@/lib/contracts";
import { needsNameserverDelegation } from "@/lib/domain-catalog";
import { formatDateTime } from "@/lib/format";
import type { PublicDocsLinks } from "@/lib/public-docs";
import { cn } from "@/lib/utils";

const projectStatusTone = (status: DomainCatalogItem["projectStatus"]) => {
  switch (status) {
    case "active":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "disabled":
      return "border-border bg-muted/30 text-muted-foreground";
    case "provisioning_error":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    case "not_enabled":
      return "border-primary/40 bg-primary/10 text-primary";
    default:
      return "";
  }
};

const cloudflareTone = (
  availability: DomainCatalogItem["cloudflareAvailability"],
) =>
  availability === "available"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : "border-rose-500/40 bg-rose-500/10 text-rose-200";

const bindingSourceTone = (
  bindingSource: DomainCatalogItem["bindingSource"],
  projectStatus: DomainCatalogItem["projectStatus"],
) => {
  if (bindingSource === "project_bind") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  }
  if (projectStatus === "not_enabled") {
    return "border-border bg-muted/30 text-muted-foreground";
  }
  return "border-violet-500/40 bg-violet-500/10 text-violet-200";
};

const bindingSourceLabel = (
  bindingSource: DomainCatalogItem["bindingSource"],
  projectStatus: DomainCatalogItem["projectStatus"],
) => {
  if (bindingSource === "project_bind") return "project_bind";
  if (projectStatus === "not_enabled") return "catalog_only";
  return "catalog";
};

const cloudflareStatusTone = (status: string | null) => {
  if (!status) {
    return "border-border bg-muted/30 text-muted-foreground";
  }
  if (status === "active") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "pending") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border-border bg-muted/30 text-muted-foreground";
};

export const DomainTable = ({
  domains,
  onEnable,
  onDisable,
  onDelete,
  onRetry,
  docsLinks = null,
  isEnablePending = false,
  isDomainLifecycleEnabled = true,
}: {
  domains: DomainCatalogItem[];
  onEnable: (values: {
    rootDomain: string;
    zoneId: string;
  }) => Promise<void> | void;
  onDisable: (domainId: string) => Promise<void> | void;
  onDelete: (domainId: string) => Promise<void> | void;
  onRetry: (domainId: string) => Promise<void> | void;
  docsLinks?: PublicDocsLinks | null;
  isEnablePending?: boolean;
  isDomainLifecycleEnabled?: boolean;
}) => {
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailsRootDomain, setDetailsRootDomain] = useState<string | null>(
    null,
  );
  const [copiedDetailValue, setCopiedDetailValue] = useState<string | null>(
    null,
  );
  const detailsDialogTitleId = useId();

  const activeCount = domains.filter(
    (domain) => domain.projectStatus === "active",
  ).length;
  const discoverableCount = domains.filter(
    (domain) => domain.cloudflareAvailability === "available",
  ).length;
  const projectBoundCount = domains.filter(
    (domain) => domain.bindingSource === "project_bind",
  ).length;
  const delegationPendingCount = domains.filter(
    needsNameserverDelegation,
  ).length;
  const nameserverGuideHref = docsLinks?.projectDomainBinding
    ? `${docsLinks.projectDomainBinding}#zone-pending-or-nameserver-not-delegated`
    : null;
  const detailDomain = detailsRootDomain
    ? (domains.find((domain) => domain.rootDomain === detailsRootDomain) ??
      null)
    : null;

  useEffect(() => {
    if (!detailDomain) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCopiedDetailValue(null);
        setDetailsRootDomain(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailDomain]);

  const selectInputValue = (
    event: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>,
  ) => {
    event.currentTarget.select();
  };

  const copyDetailField = async (value: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        setCopiedDetailValue(null);
        return;
      }
      await navigator.clipboard.writeText(value);
      setCopiedDetailValue(value);
    } catch {
      setCopiedDetailValue(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle>Cloudflare 域名目录</CardTitle>
              <CardDescription>
                这里同时展示 Cloudflare 当前可见的
                zones、项目里的启用状态，以及由项目直接创建的可删除域名。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge className="border-primary/40 bg-primary/10 text-primary">
                Cloudflare 可见 {discoverableCount}
              </Badge>
              <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                项目已启用 {activeCount}
              </Badge>
              <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-200">
                项目直绑 {projectBoundCount}
              </Badge>
            </div>
          </div>
          {delegationPendingCount > 0 ? (
            <div
              className="flex flex-wrap items-center gap-2 text-xs"
              data-testid="domain-catalog-delegation-guide"
            >
              <p className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-100">
                有 {delegationPendingCount} 个项目直绑域名待完成 NS 委派；先改
                NS，再点“重试接入”。
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
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>根域名</TableHeaderCell>
                <TableHeaderCell>来源</TableHeaderCell>
                <TableHeaderCell>Cloudflare</TableHeaderCell>
                <TableHeaderCell>项目状态</TableHeaderCell>
                <TableHeaderCell>最近接入</TableHeaderCell>
                <TableHeaderCell>错误</TableHeaderCell>
                <TableHeaderCell className="text-right">操作</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {domains.map((domain) => {
                const canEnable =
                  domain.cloudflareAvailability === "available" &&
                  domain.zoneId &&
                  (domain.projectStatus === "not_enabled" ||
                    domain.projectStatus === "disabled");
                const canRetry =
                  domain.projectStatus === "provisioning_error" && domain.id;
                const canDisable =
                  domain.projectStatus === "active" && domain.id;
                const canDelete =
                  isDomainLifecycleEnabled &&
                  domain.bindingSource === "project_bind" &&
                  Boolean(domain.id);
                const requiresNameserverDelegation =
                  needsNameserverDelegation(domain);
                const zoneId = domain.zoneId ?? "";
                const domainId = domain.id ?? "";
                const isDeleteOpen = deleteTargetId === domainId;

                return (
                  <TableRow
                    key={`${domain.rootDomain}:${domain.zoneId ?? "none"}`}
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {domain.rootDomain}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {domain.bindingSource === "project_bind"
                            ? "由项目创建到 Cloudflare；支持删除该 zone"
                            : domain.cloudflareAvailability === "missing"
                              ? "Cloudflare 当前 token 已不可见"
                              : "Cloudflare 当前可管理"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "border",
                          bindingSourceTone(
                            domain.bindingSource,
                            domain.projectStatus,
                          ),
                        )}
                      >
                        {bindingSourceLabel(
                          domain.bindingSource,
                          domain.projectStatus,
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex flex-wrap gap-2"
                        data-testid={`cloudflare-status-group-${domain.rootDomain}`}
                      >
                        <Badge
                          className={cn(
                            "border",
                            cloudflareTone(domain.cloudflareAvailability),
                          )}
                        >
                          {domain.cloudflareAvailability}
                        </Badge>
                        <Badge
                          className={cn(
                            "border",
                            cloudflareStatusTone(domain.cloudflareStatus),
                          )}
                        >
                          {domain.cloudflareStatus ?? "unknown"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "border",
                          projectStatusTone(domain.projectStatus),
                        )}
                      >
                        {domain.projectStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDateTime(domain.lastProvisionedAt)}
                    </TableCell>
                    <TableCell className="max-w-[16rem] align-top text-sm text-muted-foreground">
                      <div className="space-y-2">
                        <p>
                          {domain.lastProvisionError ??
                            (domain.cloudflareAvailability === "missing"
                              ? "当前 Cloudflare token 已无法列出该 zone"
                              : "—")}
                        </p>
                        {requiresNameserverDelegation ? (
                          <div
                            className="flex items-center gap-2 text-[11px] leading-4"
                            data-testid={`domain-row-delegation-guide-${domainId || domain.rootDomain}`}
                          >
                            <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-amber-100/90">
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/90"
                              />
                              <span>
                                <span className="font-medium text-amber-200">
                                  待委派
                                </span>
                                ，改 NS 后重试。
                              </span>
                            </span>
                            {nameserverGuideHref ? (
                              <a
                                href={nameserverGuideHref}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                              >
                                步骤
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <ActionButton
                          density="dense"
                          forceIconOnly
                          icon={PanelRightOpen}
                          label="查看详情"
                          size="sm"
                          variant="outline"
                          data-testid={`domain-details-trigger-${domainId || domain.rootDomain}`}
                          onClick={() => {
                            setCopiedDetailValue(null);
                            setDetailsRootDomain(domain.rootDomain);
                          }}
                        />
                        {canEnable ? (
                          <ActionButton
                            density="dense"
                            icon={CheckCircle2}
                            label={
                              domain.projectStatus === "disabled"
                                ? "重新启用"
                                : "启用域名"
                            }
                            size="sm"
                            variant="outline"
                            disabled={isEnablePending}
                            onClick={() =>
                              onEnable({
                                rootDomain: domain.rootDomain,
                                zoneId,
                              })
                            }
                          />
                        ) : null}
                        {canRetry ? (
                          <ActionButton
                            density="dense"
                            icon={RefreshCcw}
                            label="重试接入"
                            size="sm"
                            variant="outline"
                            onClick={() => onRetry(domainId)}
                          />
                        ) : null}
                        {canDisable ? (
                          <ActionButton
                            density="dense"
                            icon={ShieldBan}
                            label="停用域名"
                            size="sm"
                            variant="destructive"
                            onClick={() => onDisable(domainId)}
                          />
                        ) : null}
                        {canDelete ? (
                          <Popover
                            open={isDeleteOpen}
                            onOpenChange={(nextOpen) => {
                              setDeleteTargetId(nextOpen ? domainId : null);
                              if (!nextOpen) {
                                setDeleteError(null);
                              }
                            }}
                          >
                            <PopoverAnchor asChild>
                              <div>
                                <ActionButton
                                  density="dense"
                                  icon={Trash2}
                                  label="删除域名"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setDeleteTargetId(domainId);
                                    setDeleteError(null);
                                  }}
                                />
                              </div>
                            </PopoverAnchor>
                            <PopoverContent
                              align="end"
                              className="w-[min(calc(100vw-2rem),24rem)] space-y-4"
                            >
                              <div className="space-y-2 text-left">
                                <p className="text-sm font-semibold text-foreground">
                                  确认删除 {domain.rootDomain}？
                                </p>
                                <p className="text-sm leading-6 text-muted-foreground">
                                  这个操作会从 Cloudflare 删除对应
                                  zone，并在项目里软删除域名记录。若该域名下仍有
                                  active 邮箱，删除会被阻断。
                                </p>
                              </div>
                              {deleteError ? (
                                <p
                                  className="text-sm text-destructive"
                                  role="alert"
                                >
                                  {deleteError}
                                </p>
                              ) : null}
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setDeleteTargetId(null);
                                    setDeleteError(null);
                                  }}
                                >
                                  取消
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={deletePendingId === domainId}
                                  onClick={async () => {
                                    setDeletePendingId(domainId);
                                    setDeleteError(null);
                                    try {
                                      await onDelete(domainId);
                                      setDeleteTargetId(null);
                                    } catch (reason) {
                                      setDeleteError(
                                        reason instanceof Error
                                          ? reason.message
                                          : "删除域名失败",
                                      );
                                    } finally {
                                      setDeletePendingId(null);
                                    }
                                  }}
                                >
                                  {deletePendingId === domainId
                                    ? "删除中…"
                                    : "确认删除"}
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : null}
                        {domain.cloudflareAvailability === "missing" ? (
                          <ActionButton
                            density="dense"
                            icon={CloudOff}
                            label="Cloudflare 不可见"
                            size="sm"
                            variant="outline"
                            disabled
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {detailDomain ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          data-testid="domain-details-dialog"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailsDialogTitleId}
            className="w-full max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-[0_36px_120px_rgba(2,6,23,0.58)]"
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                域名详情
              </p>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <h3
                    id={detailsDialogTitleId}
                    className="text-xl font-semibold tracking-tight text-foreground"
                  >
                    {detailDomain.rootDomain}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    在这里查看当前域名的 Cloudflare zone 与 nameserver 信息。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge
                    className={cn(
                      "border",
                      bindingSourceTone(
                        detailDomain.bindingSource,
                        detailDomain.projectStatus,
                      ),
                    )}
                  >
                    {bindingSourceLabel(
                      detailDomain.bindingSource,
                      detailDomain.projectStatus,
                    )}
                  </Badge>
                  <Badge
                    className={cn(
                      "border",
                      cloudflareTone(detailDomain.cloudflareAvailability),
                    )}
                  >
                    {detailDomain.cloudflareAvailability}
                  </Badge>
                  <Badge
                    className={cn(
                      "border",
                      cloudflareStatusTone(detailDomain.cloudflareStatus),
                    )}
                  >
                    {detailDomain.cloudflareStatus ?? "unknown"}
                  </Badge>
                  <Badge
                    className={cn(
                      "border",
                      projectStatusTone(detailDomain.projectStatus),
                    )}
                  >
                    {detailDomain.projectStatus}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <section className="rounded-2xl border border-border/80 bg-background/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Cloudflare Zone
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      用于核对当前项目绑定到了哪个 Cloudflare zone。
                    </p>
                  </div>
                  <span className="text-xs leading-5 text-muted-foreground">
                    点击输入框可全选
                  </span>
                </div>
                <div className="mt-3 rounded-xl border border-border/70 bg-card px-3 py-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <Input
                      readOnly
                      value={detailDomain.zoneId ?? "当前 token 暂不可见"}
                      title={detailDomain.zoneId ?? "当前 token 暂不可见"}
                      aria-label={`Zone ${detailDomain.rootDomain}`}
                      className="min-w-0 h-auto border-0 bg-transparent px-0 font-mono text-sm text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      onFocus={selectInputValue}
                      onClick={selectInputValue}
                    />
                    {detailDomain.zoneId ? (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label={`复制 zone ${detailDomain.zoneId}`}
                        className="shrink-0"
                        onClick={() =>
                          copyDetailField(detailDomain.zoneId ?? "")
                        }
                      >
                        {copiedDetailValue === detailDomain.zoneId ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-border/80 bg-background/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Nameserver
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      去注册商修改 NS 时，以这里显示的值为准。
                    </p>
                  </div>
                  <span className="text-xs leading-5 text-muted-foreground">
                    每条可单独复制
                  </span>
                </div>
                {detailDomain.nameServers.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {detailDomain.nameServers.map((nameServer) => (
                      <div
                        key={`${detailDomain.rootDomain}:${nameServer}`}
                        className="rounded-xl border border-border/70 bg-card px-3 py-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <Input
                            readOnly
                            value={nameServer}
                            title={nameServer}
                            aria-label={`Nameserver ${nameServer}`}
                            className="min-w-0 h-auto border-0 bg-transparent px-0 font-mono text-sm text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                            onFocus={selectInputValue}
                            onClick={selectInputValue}
                          />
                          <Button
                            size="icon-sm"
                            variant="outline"
                            aria-label={`复制 ${nameServer}`}
                            className="shrink-0"
                            onClick={() => copyDetailField(nameServer)}
                          >
                            {copiedDetailValue === nameServer ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-border/70 bg-card/60 px-3 py-4 text-sm text-muted-foreground">
                    nameserver
                    暂不可见；如果这是刚创建的直绑域名，请保持页面打开，稍后再回来查看。
                  </div>
                )}
              </section>
            </div>
            {needsNameserverDelegation(detailDomain) ? (
              <section
                className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"
                data-testid="domain-details-delegation-guide"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-100">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-amber-300/90"
                    />
                    先改 NS，再重试接入
                  </span>
                  {nameserverGuideHref ? (
                    <a
                      href={nameserverGuideHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                    >
                      查看步骤
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-amber-100/90">
                  当前域名还在等待 Cloudflare 完成委派。先去注册商修改 NS，等
                  Cloudflare 变成 <code>active</code>{" "}
                  后，再回到列表点击“重试接入”。
                </p>
              </section>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                autoFocus
                onClick={() => {
                  setCopiedDetailValue(null);
                  setDetailsRootDomain(null);
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
