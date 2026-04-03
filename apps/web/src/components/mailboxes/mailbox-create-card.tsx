import { mailboxLocalPartRegex, mailboxSubdomainRegex } from "@cf-mail/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
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

const createMailboxSchema = z.object({
  localPart: z
    .string()
    .max(32)
    .regex(mailboxLocalPartRegex, "仅支持小写字母、数字和短横线")
    .optional()
    .or(z.literal("")),
  subdomain: z
    .string()
    .max(190)
    .regex(mailboxSubdomainRegex, "支持多级子域，例如 team 或 inbox.team")
    .optional()
    .or(z.literal("")),
  expiresInMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
});

type CreateMailboxValues = z.infer<typeof createMailboxSchema>;

export const MailboxCreateCard = ({
  onSubmit,
  isPending,
  rootDomain,
  defaultTtlMinutes,
  maxTtlMinutes,
  isMetaLoading = false,
  metaError = null,
}: {
  onSubmit: (values: {
    localPart?: string;
    subdomain?: string;
    expiresInMinutes: number;
  }) => Promise<void> | void;
  isPending?: boolean;
  rootDomain?: string;
  defaultTtlMinutes?: number;
  maxTtlMinutes?: number;
  isMetaLoading?: boolean;
  metaError?: string | null;
}) => {
  const effectiveDefaultTtlMinutes = defaultTtlMinutes ?? 60;
  const effectiveMaxTtlMinutes = maxTtlMinutes ?? 24 * 60;
  const isMetaReady =
    !isMetaLoading &&
    !metaError &&
    Boolean(rootDomain && defaultTtlMinutes && maxTtlMinutes);
  const isFormDisabled = Boolean(isPending || isMetaLoading);
  const form = useForm<CreateMailboxValues>({
    resolver: zodResolver(createMailboxSchema),
    defaultValues: {
      localPart: "",
      subdomain: "",
      expiresInMinutes: effectiveDefaultTtlMinutes,
    },
  });

  useEffect(() => {
    if (defaultTtlMinutes === undefined) return;
    form.setValue("expiresInMinutes", defaultTtlMinutes, {
      shouldDirty: false,
    });
  }, [defaultTtlMinutes, form]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>创建邮箱</CardTitle>
        <CardDescription>
          {metaError ? (
            <span className="text-destructive">
              邮箱规则加载失败：{metaError}
              。仍可继续创建邮箱，但地址示例将暂时隐藏。
            </span>
          ) : isMetaLoading ? (
            "正在读取邮箱规则…"
          ) : isMetaReady ? (
            <>
              随机或指定用户名 / 子域。支持多级子域，例如
              <span className="ml-1 font-medium text-foreground">alpha</span>或
              <span className="ml-1 font-medium text-foreground">
                ops.alpha
              </span>
              ，地址格式为
              <span className="ml-1 font-medium text-foreground">
                nightly@ops.alpha.{rootDomain}
              </span>
              ，默认 {defaultTtlMinutes} 分钟后自动回收，最长 {maxTtlMinutes}{" "}
              分钟。
            </>
          ) : (
            "正在准备邮箱规则…"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              localPart: values.localPart || undefined,
              subdomain: values.subdomain || undefined,
              expiresInMinutes: values.expiresInMinutes,
            }),
          )}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="localPart">用户名</Label>
              <Input
                id="localPart"
                placeholder="留空则随机"
                disabled={isFormDisabled}
                {...form.register("localPart")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subdomain">子域名</Label>
              <Input
                id="subdomain"
                placeholder="留空则随机，例如 ops.alpha"
                disabled={isFormDisabled}
                {...form.register("subdomain")}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="ttl">生命周期（分钟）</Label>
              <Input
                id="ttl"
                type="number"
                min={5}
                max={effectiveMaxTtlMinutes}
                disabled={isFormDisabled}
                {...form.register("expiresInMinutes", { valueAsNumber: true })}
              />
            </div>
            <Button
              className="w-full md:w-auto"
              type="submit"
              disabled={isFormDisabled}
            >
              {metaError
                ? "创建邮箱"
                : isMetaLoading
                  ? "读取规则中…"
                  : isPending
                    ? "创建中…"
                    : "创建邮箱"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
