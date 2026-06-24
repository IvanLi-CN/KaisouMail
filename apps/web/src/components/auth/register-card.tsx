import { zodResolver } from "@hookform/resolvers/zod";
import { Fingerprint, Github } from "lucide-react";
import type { MouseEvent } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { AuthActionButton } from "@/components/auth/auth-action-button";
import { LinuxDoIcon } from "@/components/icons/linuxdo-icon";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import type { AuthProviderStatus } from "@/lib/contracts";
import { appRoutes } from "@/lib/routes";

const registerIntentSchema = z.object({
  inviteCode: z.string().trim().max(128).optional(),
});

type RegisterIntentValues = z.infer<typeof registerIntentSchema>;

const providerLabel = (provider: "github" | "linuxdo" | "passkey") =>
  provider === "github"
    ? "GitHub"
    : provider === "linuxdo"
      ? "LinuxDO"
      : "Passkey";

export const RegisterCard = ({
  onProviderRegister,
  onPasskeyStart,
  isPending,
  error,
  passkeySupported,
  passkeySupportMessage,
  providers,
}: {
  onProviderRegister?: (
    provider: "github" | "linuxdo",
    values: RegisterIntentValues,
  ) => Promise<void> | void;
  onPasskeyStart?: (values: RegisterIntentValues) => Promise<void> | void;
  isPending?: boolean;
  error?: string | null;
  passkeySupported?: boolean;
  passkeySupportMessage?: string | null;
  providers?: AuthProviderStatus[];
}) => {
  const form = useForm<RegisterIntentValues>({
    resolver: zodResolver(registerIntentSchema),
    defaultValues: { inviteCode: "" },
  });

  const providerEntries =
    providers?.filter(
      (
        provider,
      ): provider is AuthProviderStatus & {
        provider: "github" | "linuxdo" | "passkey";
      } => provider.loginEnabled,
    ) ?? [];

  const requiresInvite =
    providerEntries.length > 0 &&
    providerEntries.every(
      (provider) => provider.registrationMode === "invite-only",
    );

  const submitWithProvider = (provider: "github" | "linuxdo") =>
    form.handleSubmit((values) => onProviderRegister?.(provider, values));

  const submitPasskey = form.handleSubmit((values) => onPasskeyStart?.(values));
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
  const passkeySoftDisabled = Boolean(!passkeySupported || isPending);
  const passkeyTooltip = !passkeySupported
    ? (passkeySupportMessage ?? "当前浏览器或上下文不支持 WebAuthn。")
    : null;
  const passkeyButton = (
    <AuthActionButton
      type="button"
      icon={Fingerprint}
      label={`使用 ${providerLabel("passkey")} 继续`}
      variant="outline"
      aria-disabled={passkeySoftDisabled || undefined}
      onClick={(event) => {
        if (preventSoftDisabledAction(event, passkeySoftDisabled)) {
          return;
        }

        void submitPasskey();
      }}
    />
  );

  return (
    <Card className="mx-auto w-full max-w-[520px] border-border/70 bg-card/95 p-4 shadow-none sm:p-6">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">注册 KaisouMail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="register-invite-code">
            邀请码{requiresInvite ? "" : "（如需）"}
          </Label>
          <Input
            id="register-invite-code"
            placeholder="km_xxx"
            autoComplete="off"
            {...form.register("inviteCode")}
          />
          <p className="min-h-5 text-sm text-destructive" role="alert">
            {form.formState.errors.inviteCode?.message ?? error ?? " "}
          </p>
        </div>

        <div className="grid gap-3">
          {providerEntries
            .filter(
              (
                provider,
              ): provider is AuthProviderStatus & {
                provider: "github" | "linuxdo";
              } => provider.provider !== "passkey",
            )
            .map((provider) => (
              <AuthActionButton
                key={provider.provider}
                type="button"
                icon={provider.provider === "github" ? Github : LinuxDoIcon}
                label={`使用 ${providerLabel(provider.provider)} 继续`}
                variant="outline"
                aria-disabled={!provider.configured || isPending || undefined}
                onClick={(event) => {
                  if (
                    preventSoftDisabledAction(
                      event,
                      Boolean(!provider.configured || isPending),
                    )
                  ) {
                    return;
                  }

                  void submitWithProvider(provider.provider)();
                }}
              />
            ))}
          {providerEntries.some(
            (provider) => provider.provider === "passkey",
          ) ? (
            passkeyTooltip ? (
              <Tooltip tooltipContent={passkeyTooltip} delayDuration={0}>
                {passkeyButton}
              </Tooltip>
            ) : (
              passkeyButton
            )
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="flex justify-center pt-2">
        <Link
          to={appRoutes.login}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition hover:decoration-foreground"
        >
          已有账号？前往登录
        </Link>
      </CardFooter>
    </Card>
  );
};
