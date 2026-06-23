import { zodResolver } from "@hookform/resolvers/zod";
import type { MouseEvent } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PendingRegistration } from "@/lib/contracts";
import { appRoutes } from "@/lib/routes";

const completeRegistrationSchema = z.object({
  nickname: z.string().trim().min(1, "请输入昵称"),
  inviteCode: z.string().trim().max(128).optional(),
  passkeyName: z.string().trim().optional(),
});

export type CompleteRegistrationValues = z.infer<
  typeof completeRegistrationSchema
>;

const methodLabel = (method: PendingRegistration["method"]) =>
  method === "github" ? "GitHub" : method === "linuxdo" ? "LinuxDO" : "Passkey";

export const RegisterCompleteCard = ({
  registration,
  error,
  isPending,
  onSubmit,
}: {
  registration: PendingRegistration;
  error?: string | null;
  isPending?: boolean;
  onSubmit: (values: CompleteRegistrationValues) => Promise<void> | void;
}) => {
  const isPasskey = registration.method === "passkey";
  const submitSoftDisabled = Boolean(isPending || !registration.canComplete);
  const form = useForm<CompleteRegistrationValues>({
    resolver: zodResolver(completeRegistrationSchema),
    defaultValues: {
      nickname: registration.suggestedNickname ?? "",
      inviteCode: "",
      passkeyName: "Primary Passkey",
    },
  });
  const preventSoftDisabledAction = (
    event: MouseEvent<HTMLButtonElement>,
    softDisabled: boolean,
  ) => {
    if (!softDisabled) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    return true;
  };

  return (
    <Card className="mx-auto w-full max-w-[520px] border-border/70 bg-card/95 p-4 shadow-none sm:p-6">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">完成注册</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-border/70 bg-background/45 px-4 py-3 text-sm text-muted-foreground">
          {methodLabel(registration.method)}
        </div>

        {registration.inviteRequired && !registration.invitePrevalidated ? (
          <div className="space-y-2">
            <Label htmlFor="complete-invite-code">邀请码</Label>
            <Input
              id="complete-invite-code"
              placeholder="km_xxx"
              autoComplete="off"
              {...form.register("inviteCode")}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="complete-nickname">昵称</Label>
          <Input
            id="complete-nickname"
            placeholder="例如 Ivan Owner"
            autoComplete="nickname"
            {...form.register("nickname")}
          />
        </div>

        {isPasskey ? (
          <div className="space-y-2">
            <Label htmlFor="complete-passkey-name">设备名称</Label>
            <Input
              id="complete-passkey-name"
              placeholder="Primary Passkey"
              autoComplete="off"
              {...form.register("passkeyName")}
            />
          </div>
        ) : null}

        <p className="min-h-5 text-sm text-destructive" role="alert">
          {form.formState.errors.inviteCode?.message ??
            form.formState.errors.nickname?.message ??
            form.formState.errors.passkeyName?.message ??
            error ??
            registration.error ??
            " "}
        </p>

        <Button
          type="button"
          size="lg"
          className="min-h-11 w-full"
          aria-disabled={submitSoftDisabled || undefined}
          onClick={(event) => {
            if (preventSoftDisabledAction(event, submitSoftDisabled)) {
              return;
            }

            void form.handleSubmit((values) => onSubmit(values))(event);
          }}
        >
          {isPending
            ? "提交中…"
            : isPasskey
              ? "使用 Passkey 创建账号"
              : "创建账号"}
        </Button>
      </CardContent>
      <CardFooter className="flex justify-center pt-2">
        <Link
          to={appRoutes.login}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition hover:decoration-foreground"
        >
          返回登录
        </Link>
      </CardFooter>
    </Card>
  );
};
