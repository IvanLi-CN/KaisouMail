import { Fingerprint, Github, KeyRound } from "lucide-react";
import type { MouseEvent } from "react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthActionButton } from "@/components/auth/auth-action-button";
import { LinuxDoIcon } from "@/components/icons/linuxdo-icon";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import type { AuthProviderStatus } from "@/lib/contracts";
import { appRoutes } from "@/lib/routes";

type LoginAction = "passkey" | `provider:${"github" | "linuxdo"}`;

const providerLabel = (provider: "github" | "linuxdo") =>
  provider === "github" ? "GitHub" : "LinuxDO";

export const LoginCard = ({
  onPasskeySubmit,
  onProviderLogin,
  isPasskeyPending,
  isProviderPending,
  passkeyError,
  passkeySupported,
  passkeyButtonLabel,
  passkeySupportMessage,
  providers,
}: {
  onPasskeySubmit?: () => Promise<void> | void;
  onProviderLogin?: (provider: "github" | "linuxdo") => Promise<void> | void;
  isPasskeyPending?: boolean;
  isProviderPending?: boolean;
  passkeyError?: string | null;
  passkeySupported?: boolean;
  passkeyButtonLabel?: string;
  passkeySupportMessage?: string | null;
  providers?: AuthProviderStatus[];
}) => {
  const navigate = useNavigate();
  const [activeAction, setActiveAction] = useState<LoginAction | null>(null);
  const activeActionRef = useRef<LoginAction | null>(null);
  const providerEntries =
    providers?.filter(
      (
        provider,
      ): provider is AuthProviderStatus & { provider: "github" | "linuxdo" } =>
        provider.provider !== "passkey" && provider.loginEnabled,
    ) ?? [];
  const isPasskeyBusy = Boolean(isPasskeyPending || activeAction === "passkey");
  const isAnyProviderBusy = Boolean(
    isProviderPending || activeAction?.startsWith("provider:"),
  );
  const isAuthBusy = isPasskeyBusy || isAnyProviderBusy;
  const passkeySoftDisabled = Boolean(!passkeySupported || isAuthBusy);
  const passkeyTooltip = !passkeySupported
    ? (passkeySupportMessage ??
      passkeyButtonLabel ??
      "当前浏览器或上下文不支持 WebAuthn。")
    : null;

  const finishActiveAction = (action: LoginAction) => {
    if (activeActionRef.current === action) {
      activeActionRef.current = null;
    }
    setActiveAction((current) => (current === action ? null : current));
  };

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

  const handlePasskeySubmit = async (event: MouseEvent<HTMLButtonElement>) => {
    if (preventSoftDisabledAction(event, passkeySoftDisabled)) {
      return;
    }
    if (!onPasskeySubmit || activeActionRef.current !== null || isAuthBusy) {
      return;
    }

    activeActionRef.current = "passkey";
    setActiveAction("passkey");
    try {
      await onPasskeySubmit();
    } finally {
      finishActiveAction("passkey");
    }
  };

  const handleProviderLogin = async (
    event: MouseEvent<HTMLButtonElement>,
    provider: "github" | "linuxdo",
    softDisabled: boolean,
  ) => {
    if (preventSoftDisabledAction(event, softDisabled)) {
      return;
    }

    const action = `provider:${provider}` as const;
    if (!onProviderLogin || activeActionRef.current !== null || isAuthBusy) {
      return;
    }

    activeActionRef.current = action;
    setActiveAction(action);
    try {
      await onProviderLogin(provider);
    } finally {
      finishActiveAction(action);
    }
  };

  const passkeyButton = (
    <AuthActionButton
      id="passkey-signin"
      type="button"
      icon={Fingerprint}
      label={isPasskeyBusy ? "正在唤起 Passkey…" : "使用 Passkey 登录"}
      size="lg"
      className={
        isPasskeyBusy
          ? "border-primary/70 bg-primary/20 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.22)] disabled:opacity-100"
          : undefined
      }
      aria-busy={isPasskeyBusy}
      aria-disabled={passkeySoftDisabled || undefined}
      data-auth-state={isPasskeyBusy ? "loading" : "idle"}
      onClick={(event) => {
        void handlePasskeySubmit(event);
      }}
    />
  );

  return (
    <Card className="mx-auto w-full max-w-[520px] border-border/70 bg-card/95 p-4 shadow-none sm:p-6">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">登录 KaisouMail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3" aria-labelledby="signin-methods-heading">
          <div className="space-y-1">
            <p
              id="signin-methods-heading"
              className="text-sm font-medium text-foreground"
            >
              登录方式
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              {passkeyTooltip ? (
                <Tooltip tooltipContent={passkeyTooltip} delayDuration={0}>
                  {passkeyButton}
                </Tooltip>
              ) : (
                passkeyButton
              )}
              {passkeyError ? (
                <p className="text-sm text-destructive" role="alert">
                  {passkeyError}
                </p>
              ) : null}
            </div>
            {providerEntries.map((provider) => {
              const action = `provider:${provider.provider}` as const;
              const isProviderBusy = Boolean(
                isProviderPending || activeAction === action,
              );
              const providerSoftDisabled = Boolean(
                !provider.configured || isAuthBusy,
              );

              return (
                <AuthActionButton
                  key={provider.provider}
                  type="button"
                  icon={provider.provider === "github" ? Github : LinuxDoIcon}
                  label={
                    isProviderBusy
                      ? `正在跳转 ${providerLabel(provider.provider)}…`
                      : `使用 ${providerLabel(provider.provider)} 登录`
                  }
                  variant="outline"
                  size="lg"
                  className={
                    isProviderBusy
                      ? "border-primary/70 bg-primary/20 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.22)] disabled:opacity-100"
                      : undefined
                  }
                  aria-busy={isProviderBusy}
                  aria-disabled={providerSoftDisabled || undefined}
                  data-auth-state={isProviderBusy ? "loading" : "idle"}
                  onClick={(event) => {
                    void handleProviderLogin(
                      event,
                      provider.provider,
                      providerSoftDisabled,
                    );
                  }}
                />
              );
            })}
            <AuthActionButton
              type="button"
              icon={KeyRound}
              label="使用 API Key 登录"
              variant="outline"
              size="lg"
              aria-disabled={isAuthBusy || undefined}
              onClick={(event) => {
                if (preventSoftDisabledAction(event, isAuthBusy)) {
                  return;
                }
                navigate(appRoutes.loginApiKey);
              }}
            />
          </div>
        </section>
      </CardContent>
      <CardFooter className="flex justify-center pt-2">
        <Link
          to={appRoutes.register}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition hover:decoration-foreground"
        >
          还没有账号？前往注册
        </Link>
      </CardFooter>
    </Card>
  );
};
