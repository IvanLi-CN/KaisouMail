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
  localPart: z.string().max(32).optional().or(z.literal("")),
  subdomain: z.string().max(32).optional().or(z.literal("")),
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
          可以随机生成，也可以指定用户名与子域。默认一小时后自动销毁。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={form.handleSubmit((values) =>
            onSubmit({
              localPart: values.localPart || undefined,
              subdomain: values.subdomain || undefined,
              expiresInMinutes: values.expiresInMinutes,
            }),
          )}
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
              placeholder="留空则随机"
              {...form.register("subdomain")}
            />
          </div>
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
          <div className="flex items-end">
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? "创建中…" : "创建邮箱"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
