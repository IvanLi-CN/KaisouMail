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

const loginSchema = z.object({
  apiKey: z.string().min(8, "请输入有效 API Key"),
});

type LoginValues = z.infer<typeof loginSchema>;

export const LoginCard = ({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (values: LoginValues) => Promise<void> | void;
  isPending?: boolean;
  error?: string | null;
}) => {
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { apiKey: "" },
  });

  return (
    <Card className="mx-auto w-full max-w-lg p-6">
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Sign in
        </p>
        <CardTitle className="text-2xl">登录 KaisouMail</CardTitle>
        <CardDescription>
          使用 API Key 登录控制台。浏览器端会换成 HttpOnly session cookie。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit((values) => onSubmit(values))}
        >
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="cfm_xxx"
              autoComplete="off"
              {...form.register("apiKey")}
            />
            <p className="text-sm text-destructive">
              {form.formState.errors.apiKey?.message ?? error ?? " "}
            </p>
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isPending}
          >
            {isPending ? "登录中…" : "登录控制台"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
