import { mailboxLocalPartRegex, mailboxSubdomainRegex } from "@cf-mail/shared";
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
}: {
  onSubmit: (values: {
    localPart?: string;
    subdomain?: string;
    expiresInMinutes: number;
  }) => Promise<void> | void;
  isPending?: boolean;
}) => {
  const form = useForm<CreateMailboxValues>({
    resolver: zodResolver(createMailboxSchema),
    defaultValues: {
      localPart: "",
      subdomain: "",
      expiresInMinutes: 60,
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>创建邮箱</CardTitle>
        <CardDescription>
          随机或指定用户名 / 子域。支持多级子域，例如
          <span className="ml-1 font-medium text-foreground">alpha</span>或
          <span className="ml-1 font-medium text-foreground">ops.alpha</span>
          ，默认 60 分钟后自动回收。
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
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="ttl">生命周期（分钟）</Label>
              <Input
                id="ttl"
                type="number"
                min={5}
                max={1440}
                {...form.register("expiresInMinutes", { valueAsNumber: true })}
              />
            </div>
            <Button
              className="w-full md:w-auto"
              type="submit"
              disabled={isPending}
            >
              {isPending ? "创建中…" : "创建邮箱"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
