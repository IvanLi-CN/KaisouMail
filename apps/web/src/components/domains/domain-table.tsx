import {
  CheckCircle2,
  CloudOff,
  RefreshCcw,
  ShieldBan,
  Trash2,
} from "lucide-react";
import { useState } from "react";

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
import { formatDateTime } from "@/lib/format";
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
  isEnablePending?: boolean;
  isDomainLifecycleEnabled?: boolean;
}) => {
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const activeCount = domains.filter(
    (domain) => domain.projectStatus === "active",
  ).length;
  const discoverableCount = domains.filter(
    (domain) => domain.cloudflareAvailability === "available",
  ).length;
  const projectBoundCount = domains.filter(
    (domain) => domain.bindingSource === "project_bind",
  ).length;

  return (
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
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>根域名</TableHeaderCell>
              <TableHeaderCell>来源</TableHeaderCell>
              <TableHeaderCell>Cloudflare</TableHeaderCell>
              <TableHeaderCell>项目状态</TableHeaderCell>
              <TableHeaderCell>Zone / NS</TableHeaderCell>
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
              const canDisable = domain.projectStatus === "active" && domain.id;
              const canDelete =
                isDomainLifecycleEnabled &&
                domain.bindingSource === "project_bind" &&
                Boolean(domain.id);
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
                    <div className="space-y-2">
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
                  <TableCell className="max-w-xs">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p className="font-mono">{domain.zoneId ?? "不可见"}</p>
                      {domain.nameServers.length > 0 ? (
                        <p>{domain.nameServers.join(" · ")}</p>
                      ) : (
                        <p>nameservers 暂不可见</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDateTime(domain.lastProvisionedAt)}
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {domain.lastProvisionError ??
                      (domain.cloudflareAvailability === "missing"
                        ? "当前 Cloudflare token 已无法列出该 zone"
                        : "—")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
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
  );
};
