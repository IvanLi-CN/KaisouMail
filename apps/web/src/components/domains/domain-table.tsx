import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCcw, ShieldBan } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { DomainRecord } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const createDomainSchema = z.object({
  rootDomain: z.string().min(1, "请输入根域名"),
  zoneId: z.string().min(1, "请输入 Cloudflare zone id"),
});

type CreateDomainValues = z.infer<typeof createDomainSchema>;

const statusTone = (status: DomainRecord["status"]) => {
  switch (status) {
    case "active":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "disabled":
      return "border-border bg-muted/30 text-muted-foreground";
    case "provisioning_error":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    default:
      return "";
  }
};

export const DomainTable = ({
  domains,
  onCreate,
  onDisable,
  onRetry,
  isCreatePending = false,
}: {
  domains: DomainRecord[];
  onCreate: (values: CreateDomainValues) => Promise<void> | void;
  onDisable: (domainId: string) => void;
  onRetry: (domainId: string) => void;
  isCreatePending?: boolean;
}) => {
  const form = useForm<CreateDomainValues>({
    resolver: zodResolver(createDomainSchema),
    defaultValues: {
      rootDomain: "",
      zoneId: "",
    },
  });

  return (
    <div className="grid gap-6 2xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>接入新域名</CardTitle>
          <CardDescription>
            保存后会立即尝试验证 zone 权限并启用 Email Routing；若同根域名当前是
            `disabled` 或 `provisioning_error`，再次提交会直接用新的 zone id
            修复它。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => onCreate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="root-domain">根域名</Label>
              <Input
                id="root-domain"
                placeholder="mail.example.net"
                {...form.register("rootDomain")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-id">Cloudflare Zone ID</Label>
              <Input
                id="zone-id"
                placeholder="zone_123"
                {...form.register("zoneId")}
              />
            </div>
            <Button className="w-full" type="submit" disabled={isCreatePending}>
              {isCreatePending ? "接入中…" : "接入域名"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>域名列表</CardTitle>
          <CardDescription>
            `active` 可用于新建邮箱；`disabled` 仅阻止新建，不影响已有邮箱收信。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>根域名</TableHeaderCell>
                <TableHeaderCell>Zone ID</TableHeaderCell>
                <TableHeaderCell>状态</TableHeaderCell>
                <TableHeaderCell>最近接入</TableHeaderCell>
                <TableHeaderCell>错误</TableHeaderCell>
                <TableHeaderCell className="text-right">操作</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {domain.rootDomain}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated {formatDateTime(domain.updatedAt)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {domain.zoneId ?? "未配置"}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("border", statusTone(domain.status))}>
                      {domain.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatDateTime(domain.lastProvisionedAt)}
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {domain.lastProvisionError ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {domain.status === "provisioning_error" ? (
                        <ActionButton
                          density="dense"
                          icon={RefreshCcw}
                          label="重试接入"
                          size="sm"
                          variant="outline"
                          onClick={() => onRetry(domain.id)}
                        />
                      ) : null}
                      {domain.status !== "disabled" ? (
                        <ActionButton
                          density="dense"
                          icon={ShieldBan}
                          label="停用域名"
                          size="sm"
                          variant="destructive"
                          onClick={() => onDisable(domain.id)}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
