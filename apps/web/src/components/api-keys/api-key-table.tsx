import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { ApiKeyRecord } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";

const createKeySchema = z.object({
  name: z.string().min(1, "请输入名称"),
});

type CreateKeyValues = z.infer<typeof createKeySchema>;

const API_KEYS_PER_PAGE = 10;

const compareApiKeysByRecentUse = (left: ApiKeyRecord, right: ApiKeyRecord) => {
  if (left.lastUsedAt && right.lastUsedAt) {
    const lastUsedComparison = right.lastUsedAt.localeCompare(left.lastUsedAt);
    if (lastUsedComparison !== 0) return lastUsedComparison;
  } else if (left.lastUsedAt) {
    return -1;
  } else if (right.lastUsedAt) {
    return 1;
  }

  const createdAtComparison = right.createdAt.localeCompare(left.createdAt);
  if (createdAtComparison !== 0) return createdAtComparison;

  return left.id.localeCompare(right.id);
};

export const ApiKeyTable = ({
  apiKeys,
  latestSecret,
  onCreate,
  onRevoke,
}: {
  apiKeys: ApiKeyRecord[];
  latestSecret?: string | null;
  onCreate: (values: {
    name: string;
    scopes: string[];
  }) => Promise<void> | void;
  onRevoke: (keyId: string) => void;
}) => {
  const form = useForm<CreateKeyValues>({
    resolver: zodResolver(createKeySchema),
    defaultValues: { name: "" },
  });
  const [paginationState, setPaginationState] = useState({
    page: 1,
    resetKey: "",
  });
  const sortedApiKeys = [...apiKeys].sort(compareApiKeysByRecentUse);
  const totalPages = Math.max(
    1,
    Math.ceil(sortedApiKeys.length / API_KEYS_PER_PAGE),
  );
  const paginationResetKey = sortedApiKeys
    .map(
      (apiKey) => `${apiKey.id}:${apiKey.createdAt}:${apiKey.lastUsedAt ?? ""}`,
    )
    .join("|");
  const page =
    paginationState.resetKey === paginationResetKey
      ? Math.min(paginationState.page, totalPages)
      : 1;
  const pageStart = (page - 1) * API_KEYS_PER_PAGE;
  const paginatedApiKeys = sortedApiKeys.slice(
    pageStart,
    pageStart + API_KEYS_PER_PAGE,
  );
  const visibleRangeStart = sortedApiKeys.length === 0 ? 0 : pageStart + 1;
  const visibleRangeEnd = pageStart + paginatedApiKeys.length;

  return (
    <div className="grid gap-6 2xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>创建 API Key</CardTitle>
          <CardDescription>
            V1 先使用默认 scopes：mailboxes:write + messages:read。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) =>
              onCreate({
                name: values.name,
                scopes: ["mailboxes:write", "messages:read"],
              }),
            )}
          >
            <div className="space-y-2">
              <Label htmlFor="key-name">名称</Label>
              <Input
                id="key-name"
                placeholder="例如 CI bot"
                {...form.register("name")}
              />
              <p className="text-sm text-destructive">
                {form.formState.errors.name?.message ?? " "}
              </p>
            </div>
            <Button className="w-full" type="submit">
              生成 Key
            </Button>
          </form>
          {latestSecret ? (
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                仅展示一次
              </p>
              <p className="mt-2 break-all text-foreground">{latestSecret}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>现有 API Keys</CardTitle>
          <CardDescription>
            已撤销的 Key 仍保留审计信息，但不能再次使用。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>名称</TableHeaderCell>
                <TableHeaderCell>Prefix</TableHeaderCell>
                <TableHeaderCell>Scopes</TableHeaderCell>
                <TableHeaderCell>最近使用</TableHeaderCell>
                <TableHeaderCell className="text-right">操作</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedApiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {apiKey.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        创建于 {formatDateTime(apiKey.createdAt)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{apiKey.prefix}</TableCell>
                  <TableCell>{apiKey.scopes.join(", ")}</TableCell>
                  <TableCell>{formatDateTime(apiKey.lastUsedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onRevoke(apiKey.id)}
                      disabled={Boolean(apiKey.revokedAt)}
                    >
                      {apiKey.revokedAt ? "已撤销" : "撤销"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 ? (
            <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                显示 {visibleRangeStart}-{visibleRangeEnd} 项，共{" "}
                {sortedApiKeys.length} 项
              </p>
              <div className="flex items-center justify-end gap-2">
                <span>
                  第 {page} / {totalPages} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPaginationState({
                      page: page - 1,
                      resetKey: paginationResetKey,
                    })
                  }
                  disabled={page === 1}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPaginationState({
                      page: page + 1,
                      resetKey: paginationResetKey,
                    })
                  }
                  disabled={page === totalPages}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
