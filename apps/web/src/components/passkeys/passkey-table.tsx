import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TableCardSkeleton } from "@/components/shared/loading-shells";
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
import type { PasskeyRecord } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";

const createPasskeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请输入设备名称")
    .max(64, "设备名称最多 64 个字符"),
});

type CreatePasskeyValues = z.infer<typeof createPasskeySchema>;

const toDeviceTypeLabel = (value: PasskeyRecord["deviceType"]) =>
  value === "multiDevice" ? "多设备" : "单设备";

export const PasskeyTable = ({
  passkeys,
  passkeySupported,
  emptyMessage,
  isLoading = false,
  onCreate,
  onRevoke,
  isPending,
  error,
}: {
  passkeys: PasskeyRecord[];
  passkeySupported: boolean;
  emptyMessage?: string | null;
  isLoading?: boolean;
  onCreate: (name: string) => Promise<unknown> | undefined;
  onRevoke: (passkeyId: string) => void;
  isPending?: boolean;
  error?: string | null;
}) => {
  const form = useForm<CreatePasskeyValues>({
    resolver: zodResolver(createPasskeySchema),
    defaultValues: { name: "" },
  });

  return (
    <div className="grid gap-6 2xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>注册 Passkey</CardTitle>
          <CardDescription>
            为当前账号绑定浏览器设备、系统钥匙串或外置安全密钥。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              await onCreate(values.name);
              form.reset();
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="passkey-name">设备名称</Label>
              <Input
                id="passkey-name"
                placeholder="例如 MacBook Pro / 1Password"
                {...form.register("name")}
                disabled={!passkeySupported || isPending}
              />
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.name?.message ??
                  error ??
                  (passkeySupported
                    ? " "
                    : "当前浏览器、上下文或部署配置暂不支持 passkey 注册。")}
              </p>
            </div>
            <Button
              className="h-11 w-full"
              type="submit"
              disabled={!passkeySupported || isPending}
            >
              {isPending ? "注册中…" : "注册当前设备"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <TableCardSkeleton
          columnCount={5}
          rowCount={4}
          testId="passkey-table-skeleton"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>已注册 Passkeys</CardTitle>
            <CardDescription>
              已撤销记录会保留审计信息，但不能继续用于登录。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {passkeys.length > 0 ? (
              <>
                <div className="space-y-3 md:hidden">
                  {passkeys.map((passkey) => (
                    <div
                      key={passkey.id}
                      className="rounded-2xl border border-border/70 bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium text-foreground">
                            {passkey.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            创建于 {formatDateTime(passkey.createdAt)}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="min-h-11 shrink-0"
                          onClick={() => onRevoke(passkey.id)}
                          disabled={Boolean(passkey.revokedAt)}
                        >
                          {passkey.revokedAt ? "已撤销" : "撤销"}
                        </Button>
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm">
                        <div className="space-y-1">
                          <dt className="text-xs font-medium text-muted-foreground">
                            设备类型
                          </dt>
                          <dd className="text-foreground">
                            {toDeviceTypeLabel(passkey.deviceType)}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs font-medium text-muted-foreground">
                            传输与备份
                          </dt>
                          <dd className="text-foreground">
                            {passkey.backedUp ? "已备份" : "未备份"} ·{" "}
                            {passkey.transports.join(", ") || "未知传输方式"}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs font-medium text-muted-foreground">
                            最近使用
                          </dt>
                          <dd className="text-foreground">
                            {formatDateTime(passkey.lastUsedAt)}
                          </dd>
                        </div>
                        <div className="space-y-1">
                          <dt className="text-xs font-medium text-muted-foreground">
                            状态
                          </dt>
                          <dd className="text-foreground">
                            {passkey.revokedAt
                              ? `已撤销 · ${formatDateTime(passkey.revokedAt)}`
                              : "可用"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>名称</TableHeaderCell>
                        <TableHeaderCell>设备类型</TableHeaderCell>
                        <TableHeaderCell>最近使用</TableHeaderCell>
                        <TableHeaderCell>状态</TableHeaderCell>
                        <TableHeaderCell className="text-right">
                          操作
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {passkeys.map((passkey) => (
                        <TableRow key={passkey.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">
                                {passkey.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                创建于 {formatDateTime(passkey.createdAt)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p>{toDeviceTypeLabel(passkey.deviceType)}</p>
                              <p className="text-xs text-muted-foreground">
                                {passkey.backedUp ? "已备份" : "未备份"} ·{" "}
                                {passkey.transports.join(", ") ||
                                  "未知传输方式"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatDateTime(passkey.lastUsedAt)}
                          </TableCell>
                          <TableCell>
                            {passkey.revokedAt
                              ? `已撤销 · ${formatDateTime(passkey.revokedAt)}`
                              : "可用"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="min-h-10"
                              onClick={() => onRevoke(passkey.id)}
                              disabled={Boolean(passkey.revokedAt)}
                            >
                              {passkey.revokedAt ? "已撤销" : "撤销"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 p-6 text-center text-sm text-muted-foreground">
                {emptyMessage ?? "当前还没有注册任何 passkey。"}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
