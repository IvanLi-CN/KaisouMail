import { zodResolver } from "@hookform/resolvers/zod";
import { Fingerprint, Github } from "lucide-react";
import type { MouseEvent } from "react";
import { useRef, useState } from "react";
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
type RegisterAction = "passkey" | `provider:${"github" | "linuxdo"}`;

const providerLabel = (provider: "github" | "linuxdo" | "passkey") =>
  provider === "github"
    ? "GitHub"
    : provider === "linuxdo"
      ? "LinuxDO"
      : "Passkey";

const authActionPendingClassName =
  "border-primary/70 bg-primary/20 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.22)] disabled:opacity-100";

export const RegisterCard = ({
  onProviderRegister,
  onPasskeyStart,
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
  error?: string | null;
  passkeySupported?: boolean;
  passkeySupportMessage?: string | null;
  providers?: AuthProviderStatus[];
}) => {
  const [activeAction, setActiveAction] = useState<RegisterAction | null>(null);
  const activeActionRef = useRef<RegisterAction | null>(null);
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
  const isPasskeyBusy = activeAction === "passkey";
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
  const finishActiveAction = (action: RegisterAction) => {
    if (activeActionRef.current === action) {
      activeActionRef.current = null;
    }
    setActiveAction((current) => (current === action ? null : current));
  };
  const handlePasskeyStart = async (event: MouseEvent<HTMLButtonElement>) => {
    const passkeySoftDisabled = Boolean(!passkeySupported || isPasskeyBusy);

    if (preventSoftDisabledAction(event, passkeySoftDisabled)) {
      return;
    }
    if (!onPasskeyStart || activeActionRef.current !== null) {
      return;
    }

    activeActionRef.current = "passkey";
    setActiveAction("passkey");
    try {
      await submitPasskey();
    } finally {
      finishActiveAction("passkey");
    }
  };
  const handleProviderRegister = async (
    event: MouseEvent<HTMLButtonElement>,
    provider: "github" | "linuxdo",
    softDisabled: boolean,
  ) => {
    if (preventSoftDisabledAction(event, softDisabled)) {
      return;
    }
    if (!onProviderRegister || activeActionRef.current !== null) {
      return;
    }

    const action = `provider:${provider}` as const;
    activeActionRef.current = action;
    setActiveAction(action);
    try {
      await submitWithProvider(provider)();
    } finally {
      finishActiveAction(action);
    }
  };
  const passkeyTooltip = !passkeySupported
    ? (passkeySupportMessage ?? "当前浏览器或上下文不支持 WebAuthn。")
    : null;
  const passkeyButton = (
    <AuthActionButton
      type="button"
      icon={Fingerprint}
      label={`使用 ${providerLabel("passkey")} 继续`}
      isLoading={isPasskeyBusy}
      loadingLabel="正在准备 Passkey…"
      variant="outline"
      className={isPasskeyBusy ? authActionPendingClassName : undefined}
      disabled={isPasskeyBusy}
      aria-busy={isPasskeyBusy}
      aria-disabled={passkeyTooltip ? true : undefined}
      data-auth-state={isPasskeyBusy ? "loading" : "idle"}
      onClick={(event) => {
        void handlePasskeyStart(event);
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
            .map((provider) => {
              const action = `provider:${provider.provider}` as const;
              const isProviderBusy = activeAction === action;
              const providerSoftDisabled = Boolean(
                !provider.configured || isProviderBusy,
              );

              return (
                <AuthActionButton
                  key={provider.provider}
                  type="button"
                  icon={provider.provider === "github" ? Github : LinuxDoIcon}
                  label={`使用 ${providerLabel(provider.provider)} 继续`}
                  isLoading={isProviderBusy}
                  loadingLabel={`正在跳转 ${providerLabel(provider.provider)}…`}
                  variant="outline"
                  className={
                    isProviderBusy ? authActionPendingClassName : undefined
                  }
                  disabled={isProviderBusy}
                  aria-busy={isProviderBusy}
                  aria-disabled={!provider.configured || undefined}
                  data-auth-state={isProviderBusy ? "loading" : "idle"}
                  onClick={(event) => {
                    void handleProviderRegister(
                      event,
                      provider.provider,
                      providerSoftDisabled,
                    );
                  }}
                />
              );
            })}
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
