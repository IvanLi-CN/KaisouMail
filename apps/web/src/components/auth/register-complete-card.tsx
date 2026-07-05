import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Fingerprint, UserPlus } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { AuthActionButton } from "@/components/auth/auth-action-button";
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
import type {
  RegistrationErrorField,
  RegistrationFormError,
} from "@/lib/registration-errors";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";

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
  error?: RegistrationFormError | null;
  isPending?: boolean;
  onSubmit: (values: CompleteRegistrationValues) => Promise<void> | void;
}) => {
  const isPasskey = registration.method === "passkey";
  const showInviteInput =
    registration.inviteRequired && !registration.invitePrevalidated;
  const submitSoftDisabled = Boolean(isPending || !registration.canComplete);
  const form = useForm<CompleteRegistrationValues>({
    resolver: zodResolver(completeRegistrationSchema),
    defaultValues: {
      nickname: registration.suggestedNickname ?? "",
      inviteCode: "",
      passkeyName: "Primary Passkey",
    },
  });
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = form;

  useEffect(() => {
    clearErrors();
    if (!error) return;

    const visibleFields: RegistrationErrorField[] = [
      ...(showInviteInput ? (["inviteCode"] as RegistrationErrorField[]) : []),
      "nickname",
      ...(isPasskey ? (["passkeyName"] as RegistrationErrorField[]) : []),
    ];
    const firstField = visibleFields.find((field) => error.fields?.[field]);
    for (const field of visibleFields) {
      const message = error.fields?.[field];
      if (!message) continue;
      setError(
        field,
        { type: "server", message },
        { shouldFocus: field === firstField },
      );
    }
    if (error.form) {
      setError("root.server", { type: "server", message: error.form });
    }
  }, [clearErrors, error, isPasskey, setError, showInviteInput]);

  const inviteCodeError = errors.inviteCode?.message;
  const nicknameError = errors.nickname?.message;
  const passkeyNameError = errors.passkeyName?.message;
  const hiddenFieldError =
    (!showInviteInput ? error?.fields?.inviteCode : null) ??
    (!isPasskey ? error?.fields?.passkeyName : null) ??
    null;
  const formError =
    errors.root?.server?.message ?? hiddenFieldError ?? registration.error;

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
  const submitForm = handleSubmit((values) => {
    if (
      registration.inviteRequired &&
      !registration.invitePrevalidated &&
      !values.inviteCode?.trim()
    ) {
      setError(
        "inviteCode",
        { type: "manual", message: "请输入邀请码。" },
        { shouldFocus: true },
      );
      return;
    }

    return onSubmit(values);
  });

  return (
    <Card className="mx-auto w-full max-w-[520px] border-border/70 bg-card/95 p-4 shadow-none sm:p-6">
      <CardHeader className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">注册进行中</p>
          <CardTitle className="text-2xl">继续完成注册</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            身份验证已完成，补充账号资料后即可进入控制台。
          </p>
        </div>

        <ol
          className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-start gap-2 text-sm"
          aria-label="注册进度"
        >
          <li className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="h-7 w-7 text-primary"
              />
              <p className="text-base font-semibold leading-6 text-foreground">
                已通过 {methodLabel(registration.method)} 验证
              </p>
            </div>
            <p className="pl-9 text-xs leading-5 text-muted-foreground">
              身份来源已确认
            </p>
          </li>
          <li aria-hidden="true" className="mt-3.5 h-px bg-border" />
          <li className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-sm font-semibold text-primary"
              >
                2
              </span>
              <p className="text-base font-semibold leading-6 text-foreground">
                填写账号资料
              </p>
            </div>
            <p className="pl-9 text-xs leading-5 text-muted-foreground">
              设置昵称并完成账号创建
            </p>
          </li>
        </ol>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-4" aria-labelledby="account-details-title">
          <p id="account-details-title" className="text-sm font-medium">
            账号资料
          </p>

          {showInviteInput ? (
            <div className="space-y-2">
              <Label htmlFor="complete-invite-code">邀请码</Label>
              <Input
                id="complete-invite-code"
                placeholder="km_xxx"
                autoComplete="off"
                aria-describedby={
                  inviteCodeError ? "complete-invite-code-error" : undefined
                }
                aria-invalid={Boolean(inviteCodeError)}
                className={cn(
                  inviteCodeError ? "border-destructive" : undefined,
                )}
                {...register("inviteCode")}
              />
              {inviteCodeError ? (
                <p
                  className="text-sm text-destructive"
                  id="complete-invite-code-error"
                  role="alert"
                >
                  {inviteCodeError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="complete-nickname">昵称</Label>
            <Input
              id="complete-nickname"
              placeholder="例如 Ivan Owner"
              autoComplete="nickname"
              aria-describedby={
                nicknameError ? "complete-nickname-error" : undefined
              }
              aria-invalid={Boolean(nicknameError)}
              className={cn(nicknameError ? "border-destructive" : undefined)}
              {...register("nickname")}
            />
            {nicknameError ? (
              <p
                className="text-sm text-destructive"
                id="complete-nickname-error"
                role="alert"
              >
                {nicknameError}
              </p>
            ) : null}
          </div>

          {isPasskey ? (
            <div className="space-y-2">
              <Label htmlFor="complete-passkey-name">设备名称</Label>
              <Input
                id="complete-passkey-name"
                placeholder="Primary Passkey"
                autoComplete="off"
                aria-describedby={
                  passkeyNameError ? "complete-passkey-name-error" : undefined
                }
                aria-invalid={Boolean(passkeyNameError)}
                className={cn(
                  passkeyNameError ? "border-destructive" : undefined,
                )}
                {...register("passkeyName")}
              />
              {passkeyNameError ? (
                <p
                  className="text-sm text-destructive"
                  id="complete-passkey-name-error"
                  role="alert"
                >
                  {passkeyNameError}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}

        <AuthActionButton
          type="button"
          icon={isPasskey ? Fingerprint : UserPlus}
          label={
            isPending
              ? "提交中…"
              : isPasskey
                ? "完成注册并保存 Passkey"
                : "完成注册并创建账号"
          }
          size="lg"
          aria-disabled={submitSoftDisabled || undefined}
          onClick={(event) => {
            if (preventSoftDisabledAction(event, submitSoftDisabled)) {
              return;
            }

            void submitForm(event);
          }}
        />
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
