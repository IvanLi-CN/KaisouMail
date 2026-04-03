import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMetaQuery } from "@/hooks/use-meta";
import type { ApiMeta } from "@/lib/contracts";
import { appRoutes } from "@/lib/routes";

type EndpointDoc = {
  method: string;
  path: string;
  summary: string;
  auth: string;
  requestBody?: string;
  responseBody?: string;
  notes: string[];
};

type EndpointGroup = {
  title: string;
  description: string;
  endpoints: EndpointDoc[];
};

const quickstartSteps = [
  "在 `/api-keys` 页面创建一把新的 API Key，并保存好返回时展示的完整 secret。",
  "自动化或 Agent 调用受保护接口时，直接发送 `Authorization: Bearer <API_KEY>`。",
  "浏览器场景先调用 `POST /api/auth/session` 交换 `cf_mail_session` cookie，再用同一会话访问后续接口。",
  "邮箱地址规则、可用域名、默认 TTL 与上限 TTL 可先通过 `GET /api/meta` 获取，避免在客户端硬编码猜测。",
  "需要撤销凭证时调用 `POST /api/api-keys/:id/revoke`，已撤销 Key 会保留审计记录，但不能继续鉴权。",
] as const;

const authModes = [
  {
    title: "Automation / Agent",
    description: "适合脚本、CI、Agent 与后端服务。",
    detail:
      "所有受保护接口都接受 `Authorization: Bearer <API_KEY>`。鉴权逻辑会优先读取 Bearer token，再回退到浏览器 session cookie。",
  },
  {
    title: "Browser Session",
    description: "适合控制台、嵌入式 WebView 或需要 cookie 会话的前端。",
    detail:
      "`POST /api/auth/session` 会校验 API Key、返回当前用户信息，并通过 `Set-Cookie` 写入 `cf_mail_session`。后续浏览器请求使用 `credentials: include` 即可。",
  },
] as const;

const sectionCardClassName = "border-border/80 bg-card/80";

const CodeBlock = ({ code, label }: { code: string; label: string }) => (
  <div className="space-y-2">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
    <pre className="overflow-x-auto rounded-xl border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap text-foreground">
      <code>{code}</code>
    </pre>
  </div>
);

const EndpointCard = ({ endpoint }: { endpoint: EndpointDoc }) => (
  <Card className={sectionCardClassName}>
    <CardHeader className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{endpoint.method}</Badge>
        <code className="rounded-md bg-muted/40 px-2 py-1 text-sm text-foreground">
          {endpoint.path}
        </code>
      </div>
      <div className="space-y-2">
        <CardTitle>{endpoint.summary}</CardTitle>
        <CardDescription>鉴权方式：{endpoint.auth}</CardDescription>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      {endpoint.requestBody ? (
        <CodeBlock code={endpoint.requestBody} label="Request Body" />
      ) : null}
      {endpoint.responseBody ? (
        <CodeBlock code={endpoint.responseBody} label="Success Response" />
      ) : null}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Notes
        </p>
        <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
          {endpoint.notes.map((note) => (
            <li
              key={note}
              className="rounded-lg border border-border/70 px-3 py-2"
            >
              {note}
            </li>
          ))}
        </ul>
      </div>
    </CardContent>
  </Card>
);

const buildEndpointGroups = (meta: ApiMeta): EndpointGroup[] => {
  const ttl = meta.defaultMailboxTtlMinutes;
  const maxTtl = meta.maxMailboxTtlMinutes;
  const localPartExample = "build";
  const subdomainExample = "alpha";
  const rootDomainExample = "mail.example.net";
  const addressExample = `${localPartExample}@${subdomainExample}.${rootDomainExample}`;

  return [
    {
      title: "Metadata",
      description:
        "先读取域名、TTL 与地址规则，后续邮箱创建和轮询都能直接复用。",
      endpoints: [
        {
          method: "GET",
          path: "/api/meta",
          summary: "读取邮箱域名与地址规则元数据。",
          auth: "无需预先登录",
          responseBody: `{
  "domains": ${JSON.stringify(meta.domains, null, 2)},
  "defaultMailboxTtlMinutes": ${ttl},
  "minMailboxTtlMinutes": ${meta.minMailboxTtlMinutes},
  "maxMailboxTtlMinutes": ${maxTtl},
  "addressRules": {
    "format": "localPart@subdomain.rootDomain",
    "localPartPattern": "${meta.addressRules.localPartPattern}",
    "subdomainPattern": "${meta.addressRules.subdomainPattern}",
    "examples": ${JSON.stringify(meta.addressRules.examples, null, 4)}
  }
}`,
          notes: [
            "客户端可先调用这个接口拿到当前可用域名列表，再决定是否显式传入 `rootDomain`。",
            "创建邮箱时如果省略 `rootDomain`，服务端会从当前 active 域名里随机挑一个。",
          ],
        },
      ],
    },
    {
      title: "Session Auth",
      description: "API Key 可以直接用于自动化，也可以先交换成浏览器 session。",
      endpoints: [
        {
          method: "POST",
          path: "/api/auth/session",
          summary: "用 API Key 换取浏览器 session cookie。",
          auth: "无需预先登录",
          requestBody: `{
  "apiKey": "cfm_your_secret_here"
}`,
          responseBody: `{
  "user": {
    "id": "usr_xxx",
    "email": "owner@example.com",
    "name": "Ivan Owner",
    "role": "admin"
  },
  "authenticatedAt": "2026-04-03T12:00:00.000Z"
}`,
          notes: [
            "`apiKey` 必填，shared schema 只约束最少 16 个字符。",
            "成功时会额外返回 `Set-Cookie: cf_mail_session=...; HttpOnly; Path=/; SameSite=Lax`。",
            "失败时也统一返回 `{ error, details }`。",
          ],
        },
        {
          method: "GET",
          path: "/api/auth/session",
          summary: "读取当前会话用户信息。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          responseBody: `{
  "user": {
    "id": "usr_xxx",
    "email": "owner@example.com",
    "name": "Ivan Owner",
    "role": "admin"
  },
  "authenticatedAt": "2026-04-03T12:00:00.000Z"
}`,
          notes: [
            "用于控制台恢复会话，也可供 Agent 自检当前凭证是否仍有效。",
            "鉴权中间件会先尝试 Bearer header，再尝试 cookie。",
          ],
        },
        {
          method: "DELETE",
          path: "/api/auth/session",
          summary: "清除浏览器 session cookie。",
          auth: "无需预先登录",
          notes: [
            "成功时返回 `204 No Content`。",
            "接口会下发过期的 `cf_mail_session` cookie，用于浏览器退出登录。",
          ],
        },
      ],
    },
    {
      title: "API Key Lifecycle",
      description: "创建、列出、撤销当前用户的 API Key。",
      endpoints: [
        {
          method: "GET",
          path: "/api/api-keys",
          summary: "列出当前用户可见的 API Keys。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          responseBody: `{
  "apiKeys": [
    {
      "id": "key_primary",
      "name": "Primary automation",
      "prefix": "cfm_demo_pri",
      "scopes": ["mailboxes:write", "messages:read"],
      "createdAt": "2026-04-01T08:00:00.000Z",
      "lastUsedAt": "2026-04-01T08:30:00.000Z",
      "revokedAt": null
    }
  ]
}`,
          notes: [
            "返回的是脱敏后的记录，不会再次返回完整 secret。",
            "当前记录字段由 `apiKeySchema` 定义：`id`、`name`、`prefix`、`scopes`、`createdAt`、`lastUsedAt`、`revokedAt`。",
          ],
        },
        {
          method: "POST",
          path: "/api/api-keys",
          summary: "为当前用户创建新的 API Key。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          requestBody: `{
  "name": "CI bot",
  "scopes": ["mailboxes:write", "messages:read"]
}`,
          responseBody: `{
  "apiKey": "cfm_full_secret_returned_once",
  "apiKeyRecord": {
    "id": "key_xxx",
    "name": "CI bot",
    "prefix": "cfm_full_sec",
    "scopes": ["mailboxes:write", "messages:read"],
    "createdAt": "2026-04-03T12:00:00.000Z",
    "lastUsedAt": null,
    "revokedAt": null
  }
}`,
          notes: [
            "`name` 由 shared schema 限制为 1-64 字符。",
            "`scopes` 是字符串数组；Web 控制台当前默认发 `mailboxes:write` 与 `messages:read`。",
            "完整 `apiKey` 只会在创建响应里返回一次，客户端应立即保存。",
          ],
        },
        {
          method: "POST",
          path: "/api/api-keys/:id/revoke",
          summary: "撤销指定 API Key。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          notes: [
            "成功时返回 `204 No Content`。",
            "当前实现允许 Key 所属用户本人撤销，也允许 admin 撤销其他用户的 Key。",
            "撤销后 `revokedAt` 会写入时间戳，后续鉴权不再接受该 Key。",
          ],
        },
      ],
    },
    {
      title: "Mailboxes",
      description: "自动化通常用这些接口创建、查询、ensure 和销毁临时邮箱。",
      endpoints: [
        {
          method: "GET",
          path: "/api/mailboxes",
          summary: "列出当前用户可访问的邮箱。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          responseBody: `{
  "mailboxes": [
    {
      "id": "mbx_alpha",
      "userId": "usr_xxx",
      "localPart": "${localPartExample}",
      "subdomain": "${subdomainExample}",
      "rootDomain": "${rootDomainExample}",
      "address": "${addressExample}",
      "status": "active",
      "createdAt": "2026-04-03T12:00:00.000Z",
      "lastReceivedAt": null,
      "expiresAt": "2026-04-03T13:00:00.000Z",
      "destroyedAt": null,
      "routingRuleId": "rule_alpha"
    }
  ]
}`,
          notes: [
            "列表响应包装在 `{ mailboxes: [...] }` 下。",
            "字段集合由 `mailboxSchema` 定义，包含 `lastReceivedAt`、`expiresAt` 与 `routingRuleId`。",
          ],
        },
        {
          method: "POST",
          path: "/api/mailboxes",
          summary: "创建新的临时邮箱。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          requestBody: `{
  "localPart": "${localPartExample}",
  "subdomain": "${subdomainExample}",
  "rootDomain": "${rootDomainExample}",
  "expiresInMinutes": ${ttl}
}`,
          responseBody: `{
      "id": "mbx_alpha",
      "userId": "usr_xxx",
      "localPart": "${localPartExample}",
      "subdomain": "${subdomainExample}",
      "rootDomain": "${rootDomainExample}",
      "address": "${addressExample}",
      "status": "active",
      "createdAt": "2026-04-03T12:00:00.000Z",
  "lastReceivedAt": null,
  "expiresAt": "2026-04-03T13:00:00.000Z",
  "destroyedAt": null,
  "routingRuleId": "rule_alpha"
}`,
          notes: [
            "`localPart` 与 `subdomain` 都是可选字段，但会经过 shared 正则校验。",
            "`rootDomain` 可选；省略时服务端会从当前 active 域名里随机挑一个。",
            `expiresInMinutes 必须是 ${meta.minMailboxTtlMinutes} 到 ${maxTtl} 之间的整数；未传时默认 ${ttl}。`,
          ],
        },
        {
          method: "POST",
          path: "/api/mailboxes/ensure",
          summary:
            "按 address 或 localPart+subdomain 幂等获取 active mailbox，不存在时创建。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          requestBody: `{
  "address": "${addressExample}",
  "expiresInMinutes": ${ttl}
}`,
          responseBody: `{
      "id": "mbx_alpha",
      "userId": "usr_xxx",
      "localPart": "${localPartExample}",
      "subdomain": "${subdomainExample}",
      "rootDomain": "${rootDomainExample}",
      "address": "${addressExample}",
      "status": "active",
      "createdAt": "2026-04-03T12:00:00.000Z",
  "lastReceivedAt": null,
  "expiresAt": "2026-04-03T13:00:00.000Z",
  "destroyedAt": null,
  "routingRuleId": "rule_alpha"
}`,
          notes: [
            "locator 只能二选一：直接传 `address`，或传 `localPart` + `subdomain`，其中 `rootDomain` 可选。",
            "命中现有 active mailbox 时返回 `200`；创建新邮箱时返回 `201`。",
            "同地址的 destroyed 记录不会被复用，也不会阻塞重新创建。",
          ],
        },
        {
          method: "GET",
          path: "/api/mailboxes/resolve?address=<mailbox>",
          summary: "按邮箱地址直接解析当前用户可见的 active mailbox。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          responseBody: `{
      "id": "mbx_alpha",
      "userId": "usr_xxx",
      "localPart": "${localPartExample}",
      "subdomain": "${subdomainExample}",
      "rootDomain": "${rootDomainExample}",
      "address": "${addressExample}",
      "status": "active",
      "createdAt": "2026-04-03T12:00:00.000Z",
  "lastReceivedAt": null,
  "expiresAt": "2026-04-03T13:00:00.000Z",
  "destroyedAt": null,
  "routingRuleId": "rule_alpha"
}`,
          notes: [
            "适合客户端先拿到邮箱地址，再回查 mailbox id，而不是先全量 list 再本地筛。",
            "只返回 active mailbox；不存在时返回统一 `{ error, details }`。",
          ],
        },
        {
          method: "GET",
          path: "/api/mailboxes/:id",
          summary: "读取单个邮箱详情。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          notes: ["成功时直接返回 `mailboxSchema`，不会再额外包一层对象。"],
        },
        {
          method: "DELETE",
          path: "/api/mailboxes/:id",
          summary: "销毁指定邮箱。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          notes: [
            "成功时直接返回更新后的邮箱记录。",
            "自动化销毁后可用 `destroyedAt` 与 `status` 判断后续状态。",
          ],
        },
      ],
    },
    {
      title: "Mailbox Domains",
      description:
        "管理员先在 Cloudflare 添加域，再在单控制台里实时发现并切换项目启用状态。",
      endpoints: [
        {
          method: "GET",
          path: "/api/domains",
          summary: "列出全部邮箱域名记录。",
          auth: "Bearer 或 `cf_mail_session` cookie（admin only）",
          responseBody: `{
  "domains": [
    {
      "id": "dom_primary",
      "rootDomain": "${rootDomainExample}",
      "zoneId": "cf-zone-primary",
      "status": "active",
      "lastProvisionError": null,
      "createdAt": "2026-04-03T12:00:00.000Z",
      "updatedAt": "2026-04-03T12:00:00.000Z",
      "lastProvisionedAt": "2026-04-03T12:00:00.000Z",
      "disabledAt": null
    }
  ]
}`,
          notes: [
            "返回所有状态，包括 `active`、`provisioning_error` 和 `disabled`。",
            "普通用户不能访问；域名选择器只会消费其中 status=active 的记录。",
          ],
        },
        {
          method: "GET",
          path: "/api/domains/catalog",
          summary: "实时列出 Cloudflare 当前可见域名，并合并项目内启用状态。",
          auth: "Bearer 或 `cf_mail_session` cookie（admin only）",
          responseBody: `{
  "domains": [
    {
      "id": null,
      "rootDomain": "ops.example.org",
      "zoneId": "cf-zone-ops",
      "cloudflareAvailability": "available",
      "projectStatus": "not_enabled",
      "lastProvisionError": null,
      "createdAt": null,
      "updatedAt": null,
      "lastProvisionedAt": null,
      "disabledAt": null
    },
    {
      "id": "dom_primary",
      "rootDomain": "${rootDomainExample}",
      "zoneId": "cf-zone-primary",
      "cloudflareAvailability": "available",
      "projectStatus": "active",
      "lastProvisionError": null,
      "createdAt": "2026-04-03T12:00:00.000Z",
      "updatedAt": "2026-04-03T12:00:00.000Z",
      "lastProvisionedAt": "2026-04-03T12:00:00.000Z",
      "disabledAt": null
    }
  ]
}`,
          notes: [
            "`cloudflareAvailability` 表示当前 token 是否还能列出该 zone，`projectStatus` 表示项目内是否启用。",
            "本地已有记录但 Cloudflare 当前不可见时，仍会回显为 `missing`，方便管理员继续停用或排查权限。",
          ],
        },
        {
          method: "POST",
          path: "/api/domains",
          summary:
            "从 Cloudflare catalog 启用域名，并立即尝试接入 Email Routing。",
          auth: "Bearer 或 `cf_mail_session` cookie（admin only）",
          requestBody: `{
  "rootDomain": "${rootDomainExample}",
  "zoneId": "cf-zone-primary"
}`,
          responseBody: `{
  "id": "dom_primary",
  "rootDomain": "${rootDomainExample}",
  "zoneId": "cf-zone-primary",
  "status": "active",
  "lastProvisionError": null,
  "createdAt": "2026-04-03T12:00:00.000Z",
  "updatedAt": "2026-04-03T12:00:00.000Z",
  "lastProvisionedAt": "2026-04-03T12:00:00.000Z",
  "disabledAt": null
}`,
          notes: [
            "前端不会再让管理员手填 zone id，而是直接从 `GET /api/domains/catalog` 的可见域里选中后提交。",
            "若 Cloudflare 接入失败，接口仍会返回记录，但 `status` 会是 `provisioning_error`。",
            "相同 `rootDomain` 仅在现有记录仍是 `active` 时返回 `409`；若是 `disabled` 或 `provisioning_error`，再次提交会原地修复它。",
          ],
        },
        {
          method: "POST",
          path: "/api/domains/:id/retry",
          summary: "重试失败域名的 Cloudflare 接入。",
          auth: "Bearer 或 `cf_mail_session` cookie（admin only）",
          notes: [
            "成功后状态会切回 `active`，并刷新 `lastProvisionedAt`。",
            "已停用的域名不能 retry；需要新建一条新记录。",
          ],
        },
        {
          method: "POST",
          path: "/api/domains/:id/disable",
          summary: "停用域名，阻止后续新建邮箱。",
          auth: "Bearer 或 `cf_mail_session` cookie（admin only）",
          notes: [
            "停用不会删除该域名下现有 mailbox 或 routing rule。",
            "停用后 `/api/meta` 不再把该域名放进 `domains[]`。",
          ],
        },
      ],
    },
    {
      title: "Messages",
      description: "读取收件结果、详情和原始 EML，并可通过时间游标增量轮询。",
      endpoints: [
        {
          method: "GET",
          path: "/api/messages?mailbox=<address>&after=<iso>&since=<iso>",
          summary:
            "按邮箱地址和时间下界过滤消息列表；`mailbox` 查询参数可重复出现。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          responseBody: `{
  "messages": [
    {
      "id": "msg_alpha",
      "mailboxId": "mbx_alpha",
      "mailboxAddress": "${addressExample}",
      "subject": "Build artifacts ready",
      "previewText": "Your nightly bundle is attached.",
      "fromName": "CI Runner",
      "fromAddress": "ci@example.net",
      "receivedAt": "2026-04-03T12:15:00.000Z",
      "sizeBytes": 182340,
      "attachmentCount": 1,
      "hasHtml": true
    }
  ]
}`,
          notes: [
            "不过滤时返回当前用户可见的全部消息摘要。",
            "`after` 与 `since` 都接受 ISO datetime，语义相同；若同时传入，服务端会取较晚的那个作为严格下界。",
            "适合验证码轮询或增量收件场景，避免反复扫描旧邮件。",
          ],
        },
        {
          method: "GET",
          path: "/api/messages/:id",
          summary: "读取单条消息的完整解析结果。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          responseBody: `{
  "message": {
    "id": "msg_alpha",
    "mailboxId": "mbx_alpha",
    "mailboxAddress": "${addressExample}",
    "subject": "Build artifacts ready",
    "previewText": "Your nightly bundle is attached.",
    "fromName": "CI Runner",
    "fromAddress": "ci@example.net",
    "receivedAt": "2026-04-03T12:15:00.000Z",
    "sizeBytes": 182340,
    "attachmentCount": 1,
    "hasHtml": true,
    "envelopeFrom": "ci@example.net",
    "envelopeTo": "${addressExample}",
    "messageId": "<demo@example.net>",
    "dateHeader": "2026-04-03T12:15:00.000Z",
    "html": "<p>Nightly bundle is ready.</p>",
    "text": "Nightly bundle is ready.",
    "headers": [{ "key": "Subject", "value": "Build artifacts ready" }],
    "recipients": {
      "to": [],
      "cc": [],
      "bcc": [],
      "replyTo": []
    },
    "attachments": [],
    "rawDownloadPath": "/api/messages/msg_alpha/raw"
  }
}`,
          notes: [
            "消息详情是在 `message` 对象下返回，结构由 `messageDetailSchema` 定义。",
            "`rawDownloadPath` 可直接拼接到同源 API Base 后下载原始 EML。",
          ],
        },
        {
          method: "GET",
          path: "/api/messages/:id/raw",
          summary: "下载原始 EML。",
          auth: "Bearer 或 `cf_mail_session` cookie",
          notes: [
            "该接口返回的是原始邮件响应体，不走 JSON 包装。",
            "适合做归档、重放或交给其他解析器二次处理。",
          ],
        },
      ],
    },
  ];
};

const buildCurlExample = () => `curl -X POST "$API_BASE/api/auth/session" \\
  -H "Content-Type: application/json" \\
  -d '{"apiKey":"cfm_your_secret_here"}'`;

const buildBearerExample = () => `curl "$API_BASE/api/api-keys" \\
  -H "Authorization: Bearer cfm_your_secret_here"`;

const ApiKeysDocsPageView = ({ meta }: { meta: ApiMeta }) => {
  const endpointGroups = buildEndpointGroups(meta);
  const overviewAddressExample = "build@alpha.mail.example.net";
  const errorContract = `{
  "error": "Authentication required",
  "details": null
}`;
  const authFailureContract = `{
  "error": "Invalid API key",
  "details": null
}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="API 对接文档"
        description="给人类和 Agent 看的站内参考页：围绕当前已实现的 Worker 路由与 shared schema，整理凭证、会话、邮箱和消息接口的实际接入方式。"
        eyebrow="Integration"
        action={
          <Button asChild variant="outline">
            <Link to={appRoutes.apiKeys}>回到 API Keys</Link>
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card className={sectionCardClassName}>
          <CardHeader>
            <CardTitle>接入概览</CardTitle>
            <CardDescription>
              当前项目支持两种鉴权入口：直接 Bearer API Key，或先用 API Key
              交换浏览器 session cookie。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              {authModes.map((mode) => (
                <div
                  key={mode.title}
                  className="rounded-xl border border-border/70 bg-muted/20 p-4"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {mode.title}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {mode.description}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {mode.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              <p>
                可用域名列表应通过 <code>GET /api/meta</code>{" "}
                动态读取；创建邮箱时既可以显式传 <code>rootDomain</code>
                ，也可以省略后让服务端从 active 域名中随机分配。 默认 TTL 为{" "}
                <code>{meta.defaultMailboxTtlMinutes}</code> 分钟，最长{" "}
                <code>{meta.maxMailboxTtlMinutes}</code> 分钟。
              </p>
              <p className="mt-2">
                地址格式固定为 <code>{meta.addressRules.format}</code>，示例：
                <code className="ml-1">{overviewAddressExample}</code>
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Recommended Flow
              </p>
              <ol className="space-y-2 text-sm leading-6 text-muted-foreground">
                {quickstartSteps.map((step, index) => (
                  <li
                    key={step}
                    className="rounded-xl border border-border/70 px-4 py-3"
                  >
                    <span className="mr-2 font-semibold text-foreground">
                      {index + 1}.
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card className={sectionCardClassName}>
          <CardHeader>
            <CardTitle>可直接复用的示例</CardTitle>
            <CardDescription>
              这些示例与当前 Web 控制台、Worker 路由和 shared schema 保持一致。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CodeBlock code={buildCurlExample()} label="Exchange Session" />
            <CodeBlock code={buildBearerExample()} label="Bearer Auth" />
            <CodeBlock code={errorContract} label="ApiError Envelope" />
            <CodeBlock code={authFailureContract} label="Auth Failure" />
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
              <p>
                所有 JSON 失败响应都统一返回 <code>error</code> 与{" "}
                <code>details</code> 字段。
              </p>
              <p className="mt-2">
                例如无权限时会返回{" "}
                <code>{`{"error":"Authentication required","details":null}`}</code>
                ，API Key 无效时会返回{" "}
                <code>{`{"error":"Invalid API key","details":null}`}</code>。
              </p>
              <p className="mt-2">
                原始 EML 下载接口是唯一例外，因为它直接返回邮件响应体，不走 JSON
                包装。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {endpointGroups.map((group) => (
        <section key={group.title} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {group.title}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {group.description}
            </p>
          </div>
          <div className="grid gap-6 2xl:grid-cols-2">
            {group.endpoints.map((endpoint) => (
              <EndpointCard
                key={`${endpoint.method}-${endpoint.path}`}
                endpoint={endpoint}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export const ApiKeysDocsPage = () => {
  const metaQuery = useMetaQuery();

  if (!metaQuery.data) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="API 对接文档"
          description="正在读取 `/api/meta`，准备把当前可用域名、TTL 和地址规则写进这份文档。"
          eyebrow="Integration"
        />
        <Card className={sectionCardClassName}>
          <CardContent className="py-10 text-sm text-muted-foreground">
            正在加载接口元数据…
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ApiKeysDocsPageView meta={metaQuery.data} />;
};

export { ApiKeysDocsPageView };
