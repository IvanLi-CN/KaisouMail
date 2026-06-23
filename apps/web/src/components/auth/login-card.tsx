import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
    <Button
      id="passkey-signin"
      type="button"
      size="lg"
      className="min-h-11 w-full"
      aria-disabled={passkeySoftDisabled || undefined}
      onClick={(event) => {
        if (preventSoftDisabledAction(event, passkeySoftDisabled)) {
          return;
        }

        void onPasskeySubmit?.();
      }}
    >
      {isPasskeyPending ? "Passkey 登录中…" : "使用 Passkey 登录"}
    </Button>
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
              <Button
                key={provider.provider}
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11 w-full justify-center"
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
              >
                使用 {providerLabel(provider.provider)} 登录
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 w-full justify-center"
              onClick={() => {
                navigate(appRoutes.loginApiKey);
              }}
            >
              使用 API Key 登录
            </Button>
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
