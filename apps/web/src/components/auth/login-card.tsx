import { Fingerprint, Github, KeyRound } from "lucide-react";
import type { MouseEvent } from "react";
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
  onProviderLogin?: (provider: "github" | "linuxdo") => void;
  isPasskeyPending?: boolean;
  isProviderPending?: boolean;
  passkeyError?: string | null;
  passkeySupported?: boolean;
  passkeyButtonLabel?: string;
  passkeySupportMessage?: string | null;
  providers?: AuthProviderStatus[];
}) => {
  const navigate = useNavigate();
  const providerEntries =
    providers?.filter(
      (
        provider,
      ): provider is AuthProviderStatus & { provider: "github" | "linuxdo" } =>
        provider.provider !== "passkey" && provider.loginEnabled,
    ) ?? [];
  const passkeySoftDisabled = Boolean(!passkeySupported || isPasskeyPending);
  const passkeyTooltip = !passkeySupported
    ? (passkeySupportMessage ??
      passkeyButtonLabel ??
      "当前浏览器或上下文不支持 WebAuthn。")
    : null;
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
  const passkeyButton = (
    <AuthActionButton
      id="passkey-signin"
      type="button"
      icon={Fingerprint}
      label={isPasskeyPending ? "Passkey 登录中…" : "使用 Passkey 登录"}
      size="lg"
      aria-disabled={passkeySoftDisabled || undefined}
      onClick={(event) => {
        if (preventSoftDisabledAction(event, passkeySoftDisabled)) {
          return;
        }

        void onPasskeySubmit?.();
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
            {providerEntries.map((provider) => (
              <AuthActionButton
                key={provider.provider}
                type="button"
                icon={provider.provider === "github" ? Github : LinuxDoIcon}
                label={`使用 ${providerLabel(provider.provider)} 登录`}
                variant="outline"
                size="lg"
                aria-disabled={
                  !provider.configured || isProviderPending || undefined
                }
                onClick={(event) => {
                  if (
                    preventSoftDisabledAction(
                      event,
                      Boolean(!provider.configured || isProviderPending),
                    )
                  ) {
                    return;
                  }

                  onProviderLogin?.(provider.provider);
                }}
              />
            ))}
            <AuthActionButton
              type="button"
              icon={KeyRound}
              label="使用 API Key 登录"
              variant="outline"
              size="lg"
              onClick={() => {
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
