import { zodResolver } from "@hookform/resolvers/zod";
import { rootDomainRegex } from "@kaisoumail/shared";
import { Globe2 } from "lucide-react";
import { useState } from "react";
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

const bindDomainSchema = z.object({
  rootDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(rootDomainRegex, "请输入有效根域名，例如 example.com"),
});

type BindDomainValues = z.infer<typeof bindDomainSchema>;

export const DomainBindCard = ({
  onSubmit,
  isPending = false,
}: {
  onSubmit: (values: BindDomainValues) => Promise<void> | void;
  isPending?: boolean;
}) => {
  const form = useForm<BindDomainValues>({
    resolver: zodResolver(bindDomainSchema),
    defaultValues: {
      rootDomain: "",
    },
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="h-4 w-4" />
          绑定新域名
        </CardTitle>
        <CardDescription>
          直接通过 Cloudflare API 创建 full zone，并立即尝试启用邮箱路由。 如果
          zone 还没完成激活，域名会保留在项目里等待你后续重试。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={form.handleSubmit(async (values) => {
            setSubmitError(null);
            try {
              await onSubmit(values);
              form.reset();
            } catch (reason) {
              setSubmitError(
                reason instanceof Error ? reason.message : "绑定域名失败",
              );
            }
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="rootDomain">根域名</Label>
            <Input
              id="rootDomain"
              placeholder="example.com"
              autoComplete="off"
              {...form.register("rootDomain")}
            />
            <p className="text-sm text-destructive" role="alert">
              {form.formState.errors.rootDomain?.message ?? submitError ?? " "}
            </p>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={isPending}
            >
              {isPending ? "绑定中…" : "绑定到 Cloudflare"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
