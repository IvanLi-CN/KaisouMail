import { CheckCircle2, CloudOff, RefreshCcw, ShieldBan } from "lucide-react";

import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export const DomainTable = ({
  domains,
  onEnable,
  onDisable,
  onRetry,
  isEnablePending = false,
}: {
  domains: DomainCatalogItem[];
  onEnable: (values: {
    rootDomain: string;
    zoneId: string;
  }) => Promise<void> | void;
  onDisable: (domainId: string) => void;
  onRetry: (domainId: string) => void;
  isEnablePending?: boolean;
}) => {
  const activeCount = domains.filter(
    (domain) => domain.projectStatus === "active",
  ).length;
  const discoverableCount = domains.filter(
    (domain) => domain.cloudflareAvailability === "available",
  ).length;

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>Cloudflare 域名目录</CardTitle>
            <CardDescription>
              实时读取当前 token 可管理的 zones；项目只会从 `active`
              域里创建邮箱，停用不会影响已存在邮箱收信。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="border-primary/40 bg-primary/10 text-primary">
              Cloudflare 可见 {discoverableCount}
            </Badge>
            <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
              项目已启用 {activeCount}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>根域名</TableHeaderCell>
              <TableHeaderCell>Cloudflare</TableHeaderCell>
              <TableHeaderCell>项目状态</TableHeaderCell>
              <TableHeaderCell>Zone ID</TableHeaderCell>
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
              const zoneId = domain.zoneId ?? "";
              const domainId = domain.id ?? "";

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
                        {domain.cloudflareAvailability === "missing"
                          ? "Cloudflare 当前 token 已不可见"
                          : "Cloudflare 当前可管理"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        "border",
                        cloudflareTone(domain.cloudflareAvailability),
                      )}
                    >
                      {domain.cloudflareAvailability}
                    </Badge>
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
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {domain.zoneId ?? "不可见"}
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
