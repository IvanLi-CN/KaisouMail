import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useRef, useState } from "react";
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
import { appRoutes } from "@/lib/routes";

const apiKeyLoginSchema = z.object({
  apiKey: z.string().min(8, "请输入有效 API Key"),
});

export type ApiKeyLoginValues = z.infer<typeof apiKeyLoginSchema>;

export const ApiKeyLoginCard = ({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (values: ApiKeyLoginValues) => Promise<void> | void;
  isPending?: boolean;
  error?: string | null;
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const form = useForm<ApiKeyLoginValues>({
    resolver: zodResolver(apiKeyLoginSchema),
    defaultValues: { apiKey: "" },
  });
  const isApiKeyBusy = Boolean(isPending || isSubmitting);

  const handleSubmit = async (values: ApiKeyLoginValues) => {
    if (isSubmittingRef.current || isPending) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-[520px] border-border/70 bg-card/95 p-4 shadow-none sm:p-6">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">API Key 登录</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="space-y-5 rounded-2xl border border-border/70 bg-background/45 p-4"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="cfm_xxx"
              autoComplete="off"
              disabled={isApiKeyBusy}
              aria-busy={isApiKeyBusy}
              {...form.register("apiKey")}
            />
            <p className="text-sm text-destructive">
              {form.formState.errors.apiKey?.message ?? error ?? " "}
            </p>
          </div>
          <AuthActionButton
            type="submit"
            size="lg"
            icon={LogIn}
            label={isApiKeyBusy ? "正在验证 API Key…" : "登录控制台"}
            className={
              isApiKeyBusy
                ? "border-primary/70 bg-primary/20 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.22)] disabled:opacity-100"
                : undefined
            }
            disabled={isApiKeyBusy}
            aria-busy={isApiKeyBusy}
            data-auth-state={isApiKeyBusy ? "loading" : "idle"}
          />
        </form>
      </CardContent>
      <CardFooter className="flex justify-center pt-2">
        <Link
          to={appRoutes.login}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition hover:decoration-foreground"
        >
          返回登录方式
        </Link>
      </CardFooter>
    </Card>
  );
};
