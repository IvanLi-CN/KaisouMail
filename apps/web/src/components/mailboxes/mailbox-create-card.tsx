import { minMailboxTtlMinutes } from "@kaisoumail/shared";
import { MailboxCreateForm } from "@/components/mailboxes/mailbox-create-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const MailboxCreateCard = ({
  onSubmit,
  isPending,
  domains = [],
  defaultTtlMinutes,
  minTtlMinutes = minMailboxTtlMinutes,
  maxTtlMinutes,
  supportsUnlimitedTtl = true,
  isMetaLoading = false,
  metaError = null,
  submitError = null,
  tagSuggestions = [],
}: {
  onSubmit: (values: {
    localPart?: string;
    subdomain?: string;
    rootDomain?: string;
    expiresInMinutes: number | null;
    tags?: string[];
  }) => Promise<void> | void;
  isPending?: boolean;
  domains?: string[];
  defaultTtlMinutes: number;
  minTtlMinutes?: number;
  maxTtlMinutes: number;
  supportsUnlimitedTtl?: boolean;
  isMetaLoading?: boolean;
  metaError?: string | null;
  submitError?: string | null;
  tagSuggestions?: string[];
}) => {
  const statusDescription = metaError ? (
    <span className="text-destructive">邮箱规则加载失败：{metaError}</span>
  ) : isMetaLoading ? (
    "正在读取邮箱规则…"
  ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>创建邮箱</CardTitle>
        {statusDescription ? (
          <CardDescription>{statusDescription}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <MailboxCreateForm
          defaultTtlMinutes={defaultTtlMinutes}
          domains={domains}
          isMetaLoading={isMetaLoading}
          isPending={isPending}
          maxTtlMinutes={maxTtlMinutes}
          minTtlMinutes={minTtlMinutes}
          supportsUnlimitedTtl={supportsUnlimitedTtl}
          submitError={submitError}
          tagSuggestions={tagSuggestions}
          ttlDensity="compact"
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  );
};
