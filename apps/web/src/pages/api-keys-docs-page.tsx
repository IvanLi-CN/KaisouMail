import { buildRealisticMailboxAddressExample } from "@kaisoumail/shared";
import { BookOpenText } from "lucide-react";
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
import type { PublicDocsLinks } from "@/lib/public-docs";
import { publicDocsLinks } from "@/lib/public-docs";
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
  "需要浏览器便捷登录时，先在同页注册一个 passkey；之后登录页可直接走 passkey 完成会话恢复。",
  "自动化或 Agent 调用受保护接口时，直接发送 `Authorization: Bearer <API_KEY>`。",
  "浏览器回退场景仍可调用 `POST /api/auth/session` 交换 `kaisoumail_session` cookie，再用同一会话访问后续接口。",
  "邮箱地址规则、可用域名、默认 TTL 与上限 TTL 可先通过 `GET /api/meta` 获取，避免在客户端硬编码猜测。",
  "需要撤销凭证时，可调用 `DELETE /api/passkeys/:id` 或 `POST /api/api-keys/:id/revoke`；撤销记录会保留审计信息，但不能继续鉴权。",
] as const;

const authModes = [
  {
    title: "Browser Passkey",
    description: "适合控制台用户，直接在浏览器里完成 WebAuthn 登录。",
    detail:
      "先在已登录会话里通过 `/api/passkeys/registration/*` 注册 passkey，之后登录页会调用 `/api/auth/passkey/options` + `/api/auth/passkey/verify` 直接换取同一个 `kaisoumail_session`。",
  },
  {
    title: "Automation / Agent",
    description: "适合脚本、CI、Agent 与后端服务。",
    detail:
      "绝大多数受保护接口都接受 `Authorization: Bearer <API_KEY>`。Passkey 注册、列表与撤销只接受已登录浏览器 session cookie，避免自动化密钥直接绑定长期浏览器凭证。",
  },
  {
    title: "Browser Session",
    description: "适合控制台、嵌入式 WebView 或需要 cookie 会话的前端。",
    detail:
      "`POST /api/auth/session` 会校验 API Key、返回当前用户信息，并通过 `Set-Cookie` 写入 `kaisoumail_session`。后续浏览器请求使用 `credentials: include` 即可。",
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
  "passkeyAuthEnabled": ${meta.passkeyAuthEnabled},
  "passkeyTrustedOrigins": ${JSON.stringify(meta.passkeyTrustedOrigins, null, 2)},
  "supportsUnlimitedMailboxTtl": ${meta.supportsUnlimitedMailboxTtl},
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
            "有限 TTL 统一按分钟表达；传 `expiresInMinutes: null` 表示长期，省略该字段则回退到默认 TTL。",
            "浏览器登录页与身份认证页会同时检查 `passkeyAuthEnabled` 与 `passkeyTrustedOrigins`，只有当前页面 origin 命中可信列表时才启用 passkey CTA。",
          ],
        },
      ],
    },
    {
      title: "Session Auth",
      description:
        "浏览器支持 passkey 直登，也保留 API Key → session cookie 回退链路。",
      endpoints: [
        {
          method: "POST",
          path: "/api/auth/passkey/options",
          summary: "生成 discoverable passkey 登录 challenge。",
          auth: "无需预先登录",
          responseBody: `{
  "challenge": "<base64url>",
  "rpId": "example.com",
  "userVerification": "required"
}`,
          notes: [
            "接口会同步下发短时效、HttpOnly 的 passkey challenge cookie。",
            "`rpId` 会固定为当前可信 origin 集共享的 WebAuthn RP ID（单域时等于该 host，多域别名时会回退到共享的非 public suffix）；本地 passkey 调试必须使用 `localhost`，不能直接用 IP 字面量；验证阶段会接受 `WEB_APP_ORIGIN` 与 `WEB_APP_ORIGINS` 里配置的全部可信 origin。",
            "浏览器控制台与 API 还必须保持 same-site，开发时不要混用 `localhost` 与 `127.0.0.1`，否则 challenge cookie 无法在 verify 阶段回传。",
          ],
        },
        {
          method: "POST",
          path: "/api/auth/passkey/verify",
          summary: "校验浏览器返回的 passkey assertion 并签发 session cookie。",
          auth: "无需预先登录",
          requestBody: `{
  "response": {
    "id": "<credential-id>",
    "rawId": "<credential-id>",
    "response": {
      "authenticatorData": "<base64url>",
      "clientDataJSON": "<base64url>",
      "signature": "<base64url>"
    },
    "clientExtensionResults": {},
    "type": "public-key"
  }
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
            "成功时会同时清掉 challenge cookie 并写入 `kaisoumail_session`。",
            "已撤销或不存在的 credential 会返回统一 `{ error, details }` 失败包。",
          ],
        },
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
            "成功时会额外返回 `Set-Cookie: kaisoumail_session=...; HttpOnly; Path=/; SameSite=Lax`。",
            "失败时也统一返回 `{ error, details }`。",
          ],
        },
        {
          method: "GET",
          path: "/api/auth/session",
          summary: "读取当前会话用户信息。",
          auth: "Bearer 或 `kaisoumail_session` cookie",
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
            "接口会下发过期的 `kaisoumail_session` cookie，用于浏览器退出登录。",
          ],
        },
      ],
    },
    {
      title: "Passkey Management",
      description: "已登录用户可以注册、列出和撤销自己的 passkeys。",
      endpoints: [
        {
          method: "GET",
          path: "/api/passkeys",
          summary: "列出当前用户的 passkeys。",
          auth: "仅 `kaisoumail_session` cookie",
          responseBody: `{
  "passkeys": [
    {
      "id": "psk_xxx",
      "name": "MacBook Pro",
      "credentialId": "<credential-id>",
      "deviceType": "multiDevice",
      "backedUp": true,
      "transports": ["internal", "hybrid"],
      "createdAt": "2026-04-03T12:00:00.000Z",
      "lastUsedAt": "2026-04-03T12:20:00.000Z",
      "revokedAt": null
    }
  ]
}`,
          notes: [
            "列表只返回当前用户自己的 passkeys，不提供跨用户管理。",
            "返回字段由 `passkeySchema` 定义，便于 UI 显示设备类型、备份状态与审计时间戳。",
          ],
        },
        {
          method: "POST",
          path: "/api/passkeys/registration/options",
          summary: "为当前登录用户生成 passkey 注册 challenge。",
          auth: "仅 `kaisoumail_session` cookie",
          requestBody: `{
  "name": "MacBook Pro"
}`,
          responseBody: `{
  "challenge": "<base64url>",
  "rp": { "name": "KaisouMail", "id": "cfm.example.com" }
}`,
          notes: [
            "成功时会写入短时效、HttpOnly 的注册 challenge cookie。",
            "设备名称要求 1-64 字符，并会随 challenge 一起签名保存，verify 时直接落库。",
          ],
        },
        {
          method: "POST",
          path: "/api/passkeys/registration/verify",
          summary: "校验 passkey attestation 并保存凭证。",
          auth: "仅 `kaisoumail_session` cookie",
          requestBody: `{
  "response": {
    "id": "<credential-id>",
    "rawId": "<credential-id>",
    "response": {
      "attestationObject": "<base64url>",
      "clientDataJSON": "<base64url>",
      "transports": ["internal"]
    },
    "clientExtensionResults": {},
    "type": "public-key"
  }
}`,
          responseBody: `{
  "id": "psk_xxx",
  "name": "MacBook Pro",
  "credentialId": "<credential-id>",
  "deviceType": "multiDevice",
  "backedUp": true,
  "transports": ["internal"],
  "createdAt": "2026-04-03T12:00:00.000Z",
  "lastUsedAt": null,
  "revokedAt": null
}`,
          notes: [
            "重复 credential 会返回 `409`，避免同一 passkey 被重复注册。",
            "成功时会清掉注册 challenge cookie，并返回脱敏后的 passkey 记录。",
          ],
        },
        {
          method: "DELETE",
          path: "/api/passkeys/:id",
          summary: "撤销指定 passkey。",
          auth: "仅 `kaisoumail_session` cookie",
          notes: [
            "成功时返回 `204 No Content`。",
            "撤销只作用于当前用户自己的 passkey；撤销后记录仍保留 `revokedAt` 供审计使用。",
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
          auth: "Bearer 或 `kaisoumail_session` cookie",
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
          auth: "Bearer 或 `kaisoumail_session` cookie",
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
          auth: "Bearer 或 `kaisoumail_session` cookie",
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
          auth: "Bearer 或 `kaisoumail_session` cookie",
          responseBody: `{
  "mailboxes": [
    {
      "id": "mbx_alpha",
      "userId": "usr_xxx",
      "localPart": "${localPartExample}",
      "subdomain": "${subdomainExample}",
      "rootDomain": "${rootDomainExample}",
      "address": "${addressExample}",
      "source": "registered",
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
            "字段集合由 `mailboxSchema` 定义，包含 `source`、`lastReceivedAt`、`expiresAt` 与 `routingRuleId`；Catch All 自动物化邮箱的 `source=catch_all`，长期邮箱的 `expiresAt` 会是 null。",
            "可选 `scope=workspace` 会切换到工作区视图：始终保留 `active` / `destroying`，`destroyed` 只保留最近 7 天内、按 `destroyedAt` 倒序最多 50 条。",
            "服务端会把大批量 D1 `IN (...)` 查询拆成每批最多 50 条，避免 admin 工作区因为历史邮箱过多而触发参数上限。",
          ],
        },
        {
          method: "POST",
          path: "/api/mailboxes",
          summary: "创建新的临时邮箱。",
          auth: "Bearer 或 `kaisoumail_session` cookie",
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
      "source": "registered",
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
            `expiresInMinutes 在有限模式下必须是 ${meta.minMailboxTtlMinutes} 到 ${maxTtl} 之间的整数；传 null 表示长期，未传时默认 ${ttl}。`,
          ],
        },
        {
          method: "POST",
          path: "/api/mailboxes/ensure",
          summary:
            "按 address 或 localPart+subdomain 幂等获取 active mailbox，不存在时创建。",
          auth: "Bearer 或 `kaisoumail_session` cookie",
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
      "source": "registered",
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
            "若要创建长期邮箱，可显式传 `expiresInMinutes: null`。",
          ],
        },
        {
          method: "GET",
          path: "/api/mailboxes/resolve?address=<mailbox>",
          summary: "按邮箱地址直接解析当前用户可见的 active mailbox。",
          auth: "Bearer 或 `kaisoumail_session` cookie",
          responseBody: `{
      "id": "mbx_alpha",
      "userId": "usr_xxx",
      "localPart": "${localPartExample}",
      "subdomain": "${subdomainExample}",
      "rootDomain": "${rootDomainExample}",
      "address": "${addressExample}",
      "source": "registered",
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
          auth: "Bearer 或 `kaisoumail_session` cookie",
          notes: ["成功时直接返回 `mailboxSchema`，不会再额外包一层对象。"],
        },
        {
          method: "DELETE",
          path: "/api/mailboxes/:id",
          summary: "销毁指定邮箱。",
          auth: "Bearer 或 `kaisoumail_session` cookie",
          notes: [
            "成功时直接返回更新后的邮箱记录。",
            "自动化销毁后可用 `destroyedAt` 与 `status` 判断后续状态。",
            "对 Catch-all 驱动、`routingRuleId=null` 的邮箱，销毁时不会再额外写 Cloudflare 删除单地址规则。",
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
          auth: "Bearer 或 `kaisoumail_session` cookie（admin only）",
          responseBody: `{
  "domains": [
    {
      "id": "dom_primary",
      "rootDomain": "${rootDomainExample}",
      "zoneId": "cf-zone-primary",
      "status": "active",
      "catchAllEnabled": false,
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
          auth: "Bearer 或 `kaisoumail_session` cookie（admin only）",
          responseBody: `{
  "cloudflareSync": {
    "status": "live",
    "retryAfter": null,
    "retryAfterSeconds": null,
    "rateLimitContext": null
  },
  "domains": [
    {
      "id": null,
      "rootDomain": "ops.example.org",
      "zoneId": "cf-zone-ops",
      "cloudflareAvailability": "available",
      "projectStatus": "not_enabled",
      "catchAllEnabled": false,
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
      "catchAllEnabled": false,
      "lastProvisionError": null,
      "createdAt": "2026-04-03T12:00:00.000Z",
      "updatedAt": "2026-04-03T12:00:00.000Z",
      "lastProvisionedAt": "2026-04-03T12:00:00.000Z",
      "disabledAt": null
    }
  ]
}`,
          notes: [
            "`cloudflareAvailability` 表示当前 token 是否还能列出该 zone，`projectStatus` 表示项目内是否启用，`catchAllEnabled` 表示项目是否接管该域的 Cloudflare catch-all。",
            "本地已有记录但 Cloudflare 当前不可见时，仍会回显为 `missing`，方便管理员继续停用或排查权限。",
            "若 Cloudflare API 正在 429 冷却，接口仍返回 `200 + cloudflareSync.status=rate_limited`，并保留项目内已知域名数据。",
            "`cloudflareSync.rateLimitContext` 会指出最先触发本轮冷却的项目接口与 Cloudflare 上游 path，方便定位到底是 catalog 读取还是 mailbox / domain 写操作撞限额。",
          ],
        },
        {
          method: "POST",
          path: "/api/domains",
          summary:
            "从 Cloudflare catalog 启用域名，并立即尝试接入 Email Routing。",
          auth: "Bearer 或 `kaisoumail_session` cookie（admin only）",
          requestBody: `{
  "rootDomain": "${rootDomainExample}",
  "zoneId": "cf-zone-primary"
}`,
          responseBody: `{
  "id": "dom_primary",
  "rootDomain": "${rootDomainExample}",
  "zoneId": "cf-zone-primary",
  "status": "active",
  "catchAllEnabled": false,
  "lastProvisionError": null,
  "createdAt": "2026-04-03T12:00:00.000Z",
  "updatedAt": "2026-04-03T12:00:00.000Z",
  "lastProvisionedAt": "2026-04-03T12:00:00.000Z",
  "disabledAt": null
}`,
          notes: [
            "建议先通过 `GET /api/domains/catalog` 获取可见域，再选择目标 zone 提交绑定。",
            "若 Cloudflare 接入失败，接口仍会返回记录，但 `status` 会是 `provisioning_error`。",
            "若上游 Cloudflare API 429，接口会直接返回 `429` 并携带 `Retry-After`，不会把域名误写成 `provisioning_error`。",
            "Cloudflare 429 错误详情里会带 `rateLimitContext`，标明触发的项目接口与 Cloudflare method/path。",
            "相同 `rootDomain` 仅在现有记录仍是 `active` 时返回 `409`；若是 `disabled` 或 `provisioning_error`，再次提交会原地修复它。",
          ],
        },
        {
          method: "POST",
          path: "/api/domains/:id/catch-all/enable",
          summary:
            "开启域名级 Catch All，并把 Cloudflare catch-all 切到邮件 Worker。",
          auth: "Bearer 或 `kaisoumail_session` cookie（admin only）",
          notes: [
            "成功后返回 `domainSchema`，并把 `catchAllEnabled` 设为 `true`。",
            "项目会先快照 Cloudflare 原始 catch-all 规则，关闭时再恢复旧值。",
            "这一步不需要新增 secret 名；沿用现有 runtime token 与 `EMAIL_WORKER_NAME`。",
          ],
        },
        {
          method: "POST",
          path: "/api/domains/:id/catch-all/disable",
          summary:
            "关闭域名级 Catch All，并恢复开启前的 Cloudflare catch-all 配置。",
          auth: "Bearer 或 `kaisoumail_session` cookie（admin only）",
          notes: [
            "成功后返回 `domainSchema`，并把 `catchAllEnabled` 设为 `false`。",
            "关闭前会先为仍依赖 Catch-all 收信、但尚未写入单地址 route 的 `registered` 邮箱补建 Cloudflare routing rule；任一补建失败时会中止关闭并保留 Catch-all 开启。",
            "若该域当前已启用 Catch All，停用域名时也会先走这一步，避免 disabled 域继续接收未注册地址邮件。",
          ],
        },
        {
          method: "POST",
          path: "/api/domains/:id/retry",
          summary: "重试失败域名的 Cloudflare 接入。",
          auth: "Bearer 或 `kaisoumail_session` cookie（admin only）",
          notes: [
            "成功后状态会切回 `active`，并刷新 `lastProvisionedAt`。",
            "若上游 Cloudflare API 429，接口会直接返回 `429` 并透传 `Retry-After`。",
            "已停用的域名不能 retry；需要新建一条新记录。",
          ],
        },
        {
          method: "POST",
          path: "/api/domains/:id/disable",
          summary: "停用域名，阻止后续新建邮箱。",
          auth: "Bearer 或 `kaisoumail_session` cookie（admin only）",
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
          path: "/api/messages?mailbox=<address>&after=<iso>&since=<iso>&scope=<default|workspace>",
          summary:
            "按邮箱地址和时间下界过滤消息列表；`mailbox` 查询参数可重复出现。",
          auth: "Bearer 或 `kaisoumail_session` cookie",
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
      "hasHtml": true,
      "verification": {
        "code": "842911",
        "source": "body",
        "method": "rules"
      }
    }
  ]
}`,
          notes: [
            "不过滤时返回当前用户可见的全部消息摘要。",
            "`after` 与 `since` 都接受 ISO datetime，语义相同；若同时传入，服务端会取较晚的那个作为严格下界。",
            "适合验证码轮询或增量收件场景，避免反复扫描旧邮件。",
            "`scope=workspace` 会先套用工作区可见邮箱集合，再返回对应消息，确保左侧邮箱 rail、聚合计数和中栏邮件流一致。",
            "`verification` 为可选对象；命中时会返回最终验证码值、来源（`subject|body`）与判定方式（`rules|ai`），未命中则为 `null`。",
          ],
        },
        {
          method: "GET",
          path: "/api/messages/:id",
          summary: "读取单条消息的完整解析结果。",
          auth: "Bearer 或 `kaisoumail_session` cookie",
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
    "verification": {
      "code": "842911",
      "source": "body",
      "method": "rules"
    },
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
            "验证码识别结果会和正文详情一起返回，工作台可以直接复用这一份 `verification` 对象做复制入口。",
            "`rawDownloadPath` 可直接拼接到同源 API Base 后下载原始 EML。",
          ],
        },
        {
          method: "GET",
          path: "/api/messages/:id/raw",
          summary: "下载原始 EML。",
          auth: "Bearer 或 `kaisoumail_session` cookie",
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

const ApiKeysDocsPageView = ({
  meta,
  docsLinks = null,
}: {
  meta: ApiMeta;
  docsLinks?: PublicDocsLinks | null;
}) => {
  const endpointGroups = buildEndpointGroups(meta);
  const overviewAddressExample =
    meta.addressRules.examples[0] ??
    buildRealisticMailboxAddressExample("mail.example.net");
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
        title="API 对接速查"
        description="查看常用接口、认证方式和地址规则。"
        eyebrow="Integration"
        action={
          <div className="flex flex-wrap justify-end gap-2">
            {docsLinks ? (
              <Button asChild variant="secondary">
                <a href={docsLinks.docsHome} target="_blank" rel="noreferrer">
                  <BookOpenText className="mr-2 h-4 w-4" />
                  公开文档站
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to={appRoutes.apiKeys}>回到身份认证</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card className={sectionCardClassName}>
          <CardHeader>
            <CardTitle>接入概览</CardTitle>
            <CardDescription>
              当前项目支持三种入口：浏览器 passkey、直接 Bearer API Key，以及
              API Key → 浏览器 session cookie 回退链路。
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
                <code>{meta.defaultMailboxTtlMinutes}</code> 分钟，有限上限为{" "}
                <code>{meta.maxMailboxTtlMinutes}</code> 分钟；当{" "}
                <code>supportsUnlimitedMailboxTtl</code> 为 true 时，还可传{" "}
                <code>expiresInMinutes: null</code> 表示长期。
              </p>
              <p className="mt-2">
                地址格式固定为 <code>{meta.addressRules.format}</code>，示例：
                <code className="ml-1">{overviewAddressExample}</code>
              </p>
              <p className="mt-2">
                passkey 相关 challenge 与验证依赖控制台 origin 配置集：
                <code className="ml-1">WEB_APP_ORIGIN</code> 提供主来源，
                <code className="ml-1">WEB_APP_ORIGINS</code> 可扩展额外可信
                WebAuthn origin；接口会从这些 host 推导共享的
                <code className="ml-1">rpId</code>，让同一套 passkey 可在
                多个控制台别名之间复用。
              </p>
              <p className="mt-2">
                项目同时支持拆分 token 和共享 token：运行时优先读取{" "}
                <code className="ml-1">CLOUDFLARE_RUNTIME_API_TOKEN</code>，
                部署流水线优先读取{" "}
                <code className="ml-1">CLOUDFLARE_DEPLOY_API_TOKEN</code>；
                两边都没单独配置时，才回退到共享的{" "}
                <code className="ml-1">CLOUDFLARE_API_TOKEN</code>。
              </p>
              <p className="mt-2">
                正式环境推荐拆成两把 token。runtime token 最小权限是{" "}
                <code className="ml-1">Zone: Zone: Edit</code>、
                <code className="ml-1">Zone: Email Routing Rules: Edit</code> 和
                <code className="ml-1">Zone: Zone Settings: Edit</code>；deploy
                token 负责 D1、Workers Scripts、Cloudflare Pages 和 Workers
                Routes。
              </p>
              <p className="mt-2">
                Catch All 的读取 / 更新也复用同一组 Email Routing Rules 权限；
                这次能力扩展**不需要新增 Cloudflare token 权限，也不需要新增
                secret 名**。
              </p>
              <p className="mt-2">
                如果你只是单人快速试用，也可以只配置一把共享的{" "}
                <code className="ml-1">CLOUDFLARE_API_TOKEN</code>
                ，但它必须同时具备运行时和部署两侧的并集权限。
              </p>
              <p className="mt-2">
                如果域名目录显示 <code>provisioning_error</code> /{" "}
                <code>Authentication error</code>，优先检查 token 是否缺少{" "}
                <code>Zone Settings: Edit</code>，以及 scope 是否覆盖目标 zone。
              </p>
              {docsLinks ? (
                <p className="mt-2">
                  更多权限矩阵与部署说明见{" "}
                  <a
                    className="underline underline-offset-4"
                    href={docsLinks.docsHome}
                    target="_blank"
                    rel="noreferrer"
                  >
                    公开文档站
                  </a>{" "}
                  与{" "}
                  <a
                    className="underline underline-offset-4"
                    href={docsLinks.tokenPermissions}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Cloudflare Token 权限页
                  </a>
                  。
                </p>
              ) : null}
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
          title="API 对接速查"
          description="正在读取当前可用域名和地址规则。"
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

  return (
    <ApiKeysDocsPageView meta={metaQuery.data} docsLinks={publicDocsLinks} />
  );
};

export { ApiKeysDocsPageView };
