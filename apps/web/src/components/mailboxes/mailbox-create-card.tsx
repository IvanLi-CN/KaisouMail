import { useState } from "react";
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
  maxTtlMinutes,
  isMetaLoading = false,
  metaError = null,
  submitError = null,
}: {
  onSubmit: (values: {
    localPart?: string;
    subdomain?: string;
    rootDomain?: string;
    expiresInMinutes: number;
  }) => Promise<void> | void;
  isPending?: boolean;
  domains?: string[];
  defaultTtlMinutes: number;
  maxTtlMinutes: number;
  isMetaLoading?: boolean;
  metaError?: string | null;
  submitError?: string | null;
}) => {
  const [selectedExampleRootDomain, setSelectedExampleRootDomain] = useState(
    domains[0] || "example.com",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>创建邮箱</CardTitle>
        <CardDescription>
          {metaError ? (
            <span className="text-destructive">
              邮箱规则加载失败：{metaError}
              。仍可继续创建邮箱，但地址示例将暂时隐藏。
            </span>
          ) : isMetaLoading ? (
            "正在读取邮箱规则与默认 TTL…"
          ) : (
            "随机或指定用户名 / 子域。支持多级子域，例如"
          )}
          {!metaError ? (
            <>
              <span className="ml-1 font-medium text-foreground">alpha</span>或
              <span className="ml-1 font-medium text-foreground">
                ops.alpha
              </span>
              。邮箱域名会从可用列表中随机预选，也可以手动切换，地址格式为
              <span className="ml-1 font-medium text-foreground">
                nightly@ops.alpha.{selectedExampleRootDomain}
              </span>
              ，默认 {defaultTtlMinutes} 分钟后自动回收，最长 {maxTtlMinutes}{" "}
              分钟。
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MailboxCreateForm
          defaultTtlMinutes={defaultTtlMinutes}
          domains={domains}
          isMetaLoading={isMetaLoading}
          isPending={isPending}
          maxTtlMinutes={maxTtlMinutes}
          onDomainPreviewChange={setSelectedExampleRootDomain}
          submitError={submitError}
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  );
};
