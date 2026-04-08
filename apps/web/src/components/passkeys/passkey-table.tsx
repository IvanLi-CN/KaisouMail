import { zodResolver } from "@hookform/resolvers/zod";
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
  onCreate,
  onRevoke,
  isPending,
  error,
}: {
  passkeys: PasskeyRecord[];
  passkeySupported: boolean;
  emptyMessage?: string | null;
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
              className="w-full"
              type="submit"
              disabled={!passkeySupported || isPending}
            >
              {isPending ? "注册中…" : "注册当前设备"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已注册 Passkeys</CardTitle>
          <CardDescription>
            已撤销记录会保留审计信息，但不能继续用于登录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>名称</TableHeaderCell>
                <TableHeaderCell>设备类型</TableHeaderCell>
                <TableHeaderCell>最近使用</TableHeaderCell>
                <TableHeaderCell>状态</TableHeaderCell>
                <TableHeaderCell className="text-right">操作</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {passkeys.length > 0 ? (
                passkeys.map((passkey) => (
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
                          {passkey.transports.join(", ") || "未知传输方式"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(passkey.lastUsedAt)}</TableCell>
                    <TableCell>
                      {passkey.revokedAt
                        ? `已撤销 · ${formatDateTime(passkey.revokedAt)}`
                        : "可用"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onRevoke(passkey.id)}
                        disabled={Boolean(passkey.revokedAt)}
                      >
                        {passkey.revokedAt ? "已撤销" : "撤销"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    {emptyMessage ?? "当前还没有注册任何 passkey。"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
