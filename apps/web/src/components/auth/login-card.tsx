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
  onPasskeySubmit,
  isPending,
  isPasskeyPending,
  error,
  passkeyError,
  passkeySupported,
  passkeyButtonLabel,
  passkeySupportMessage,
}: {
  onSubmit: (values: LoginValues) => Promise<void> | void;
  onPasskeySubmit?: () => Promise<void> | void;
  isPending?: boolean;
  isPasskeyPending?: boolean;
  error?: string | null;
  passkeyError?: string | null;
  passkeySupported?: boolean;
  passkeyButtonLabel?: string;
  passkeySupportMessage?: string | null;
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
          推荐使用 passkey 登录控制台；API Key 仍保留给自动化与浏览器回退登录。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3" aria-labelledby="passkey-heading">
          <div className="space-y-1">
            <p
              id="passkey-heading"
              className="text-sm font-medium text-foreground"
            >
              Passkey
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              支持设备内认证器、跨设备 passkey 与安全密钥。
            </p>
          </div>
          <Button
            id="passkey-signin"
            type="button"
            size="lg"
            className="w-full"
            onClick={() => onPasskeySubmit?.()}
            disabled={!passkeySupported || isPasskeyPending}
          >
            {isPasskeyPending
              ? "Passkey 登录中…"
              : (passkeyButtonLabel ??
                (passkeySupported
                  ? "使用 Passkey 登录"
                  : "当前浏览器不支持 Passkey"))}
          </Button>
          <p className="min-h-5 text-sm text-destructive" role="alert">
            {passkeyError ??
              (passkeySupported
                ? " "
                : (passkeySupportMessage ??
                  "当前浏览器或上下文不支持 WebAuthn。"))}
          </p>
        </section>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            或使用 API Key
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

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
            disabled={isPending || isPasskeyPending}
          >
            {isPending ? "登录中…" : "登录控制台"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
