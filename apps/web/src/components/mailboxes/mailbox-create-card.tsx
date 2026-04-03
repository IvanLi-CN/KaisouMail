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
  rootDomain: z.string().optional().or(z.literal("")),
  expiresInMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
});

type CreateMailboxValues = z.infer<typeof createMailboxSchema>;

const pickRandomDomain = (domains: string[]) => {
  if (domains.length === 0) return "";
  const index = Math.floor(Math.random() * domains.length);
  return domains[index] ?? "";
};

export const MailboxCreateCard = ({
  onSubmit,
  isPending,
  domains = [],
  defaultTtlMinutes,
  maxTtlMinutes,
  isMetaLoading = false,
  metaError = null,
}: {
  onSubmit: (values: {
    localPart?: string;
    subdomain?: string;
    rootDomain?: string;
    expiresInMinutes: number;
  }) => Promise<void> | void;
  isPending?: boolean;
  domains?: string[];
  defaultTtlMinutes: number;
  maxTtlMinutes: number;
  isMetaLoading?: boolean;
  metaError?: string | null;
}) => {
  const form = useForm<CreateMailboxValues>({
    resolver: zodResolver(createMailboxSchema),
    defaultValues: {
      localPart: "",
      subdomain: "",
      rootDomain: pickRandomDomain(domains),
      expiresInMinutes: defaultTtlMinutes,
    },
  });

  const selectedRootDomain = form.watch("rootDomain");
  const selectedExampleRootDomain =
    selectedRootDomain || domains[0] || "example.com";

  useEffect(() => {
    form.setValue("expiresInMinutes", defaultTtlMinutes, {
      shouldDirty: false,
    });
  }, [defaultTtlMinutes, form]);

  useEffect(() => {
    const nextDomain = selectedRootDomain;
    if (domains.length === 0) {
      if (nextDomain) {
        form.setValue("rootDomain", "", {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
      return;
    }
    if (nextDomain && domains.includes(nextDomain)) return;
    form.setValue("rootDomain", pickRandomDomain(domains), {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [domains, form, selectedRootDomain]);

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
            "正在读取邮箱规则与默认 TTL…"
          ) : (
            "随机或指定用户名 / 子域。支持多级子域，例如"
          )}
          {!metaError ? (
            <>
              <span className="ml-1 font-medium text-foreground">alpha</span>或
              <span className="ml-1 font-medium text-foreground">
                ops.alpha
              </span>
              。邮箱域名会从可用列表中随机预选，也可以手动切换，地址格式为
              <span className="ml-1 font-medium text-foreground">
                nightly@ops.alpha.{selectedExampleRootDomain}
              </span>
              ，默认 {defaultTtlMinutes} 分钟后自动回收，最长 {maxTtlMinutes}{" "}
              分钟。
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              localPart: values.localPart || undefined,
              subdomain: values.subdomain || undefined,
              rootDomain: values.rootDomain || undefined,
              expiresInMinutes: values.expiresInMinutes,
            }),
          )}
        >
          <div
            className={
              domains.length > 0
                ? "grid gap-4 md:grid-cols-3"
                : "grid gap-4 md:grid-cols-2"
            }
          >
            <div className="space-y-2">
              <Label htmlFor="localPart">用户名</Label>
              <Input
                id="localPart"
                placeholder="留空则随机"
                {...form.register("localPart")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subdomain">子域名</Label>
              <Input
                id="subdomain"
                placeholder="留空则随机，例如 ops.alpha"
                {...form.register("subdomain")}
              />
            </div>
            {domains.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="rootDomain">邮箱域名</Label>
                <select
                  id="rootDomain"
                  className="flex h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  {...form.register("rootDomain")}
                >
                  {domains.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="ttl">生命周期（分钟）</Label>
              <Input
                id="ttl"
                type="number"
                min={5}
                max={maxTtlMinutes}
                {...form.register("expiresInMinutes", { valueAsNumber: true })}
              />
            </div>
            <Button
              className="w-full md:w-auto"
              type="submit"
              disabled={isPending || isMetaLoading}
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
