type PermissionRow = readonly [
  resource: string,
  permission: string,
  access: string,
];

type MockVariant = "runtime" | "deploy" | "shared";

type VariantConfig = {
  badge: string;
  tokenName: string;
  helper: string;
  permissions: PermissionRow[];
  accountScope: string;
  zoneScope: string;
  footer: string;
};

const variantConfigs: Record<MockVariant, VariantConfig> = {
  runtime: {
    badge: "正式环境 / runtime token",
    tokenName: "cfm-runtime",
    helper:
      "给 kaisoumail-api Worker 用，只负责域名目录和 Email Routing 管理。",
    permissions: [
      ["区域", "Zone", "编辑"],
      ["区域", "Email Routing Rules", "编辑"],
      ["区域", "Zone Settings", "编辑"],
    ],
    accountScope: "目标 Cloudflare 帐户",
    zoneScope: "该帐户内所有 zones（含待新建 zone）",
    footer:
      "把这把 token 填到 Cloudflare Worker secret：CLOUDFLARE_RUNTIME_API_TOKEN。",
  },
  deploy: {
    badge: "正式环境 / deploy token",
    tokenName: "cfm-deploy",
    helper: "给 GitHub Actions 用，只负责部署、Pages 和远程 D1 migration。",
    permissions: [
      ["帐户", "D1", "编辑"],
      ["帐户", "Workers 脚本", "编辑"],
      ["帐户", "Workers R2 存储", "编辑"],
      ["帐户", "Cloudflare Pages", "编辑"],
      ["区域", "Workers Routes", "编辑"],
    ],
    accountScope: "目标 Cloudflare 帐户",
    zoneScope: "用于 Worker Routes 的区域",
    footer:
      "把这把 token 填到 GitHub repository secret：CLOUDFLARE_DEPLOY_API_TOKEN。",
  },
  shared: {
    badge: "快速上手 / shared token",
    tokenName: "cfm",
    helper: "单人试用时可共用；同一把 token 同时给 Worker 和 GitHub Actions。",
    permissions: [
      ["区域", "Zone", "编辑"],
      ["区域", "Email Routing Rules", "编辑"],
      ["区域", "Zone Settings", "编辑"],
      ["帐户", "D1", "编辑"],
      ["帐户", "Workers 脚本", "编辑"],
      ["帐户", "Workers R2 存储", "编辑"],
      ["帐户", "Cloudflare Pages", "编辑"],
      ["区域", "Workers Routes", "编辑"],
    ],
    accountScope: "目标 Cloudflare 帐户",
    zoneScope: "该帐户内所有 zones（含待新建 zone）",
    footer:
      "把同一个 token 同时填到 Worker secret 和 GitHub repository secret：CLOUDFLARE_API_TOKEN。",
  },
};

const brandAccent = "#f48120";

const themeOverrideCss = `
.cf-token-config-mock {
  --cfmock-shell-border: #e4eaf2;
  --cfmock-shell-background: #fcfdff;
  --cfmock-shell-highlight: #ffffff;
  --cfmock-shell-shadow: 0 16px 40px rgba(15, 23, 42, 0.07);
  --cfmock-field-border: #d7e0ea;
  --cfmock-field-background: #ffffff;
  --cfmock-field-background-muted: #ffffff;
  --cfmock-field-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
  --cfmock-heading-color: #1f2a44;
  --cfmock-body-color: #5f6e84;
  --cfmock-helper-color: #66758d;
  --cfmock-subtle-color: #8795a9;
  --cfmock-bar-text-color: #7d8aa1;
  --cfmock-back-link-color: #4c83ff;
  --cfmock-badge-border: rgba(244, 129, 32, 0.22);
  --cfmock-badge-background: rgba(244, 129, 32, 0.10);
  --cfmock-footer-border: rgba(244, 129, 32, 0.18);
  --cfmock-footer-background: rgba(244, 129, 32, 0.06);
  color: var(--cfmock-heading-color);
}

html.dark .cf-token-config-mock,
html[data-theme="dark"] .cf-token-config-mock,
body.dark .cf-token-config-mock {
  --cfmock-shell-border: #2f3444;
  --cfmock-shell-background: #0f141f;
  --cfmock-shell-highlight: #1b2230;
  --cfmock-shell-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  --cfmock-field-border: #343d4f;
  --cfmock-field-background: #141b28;
  --cfmock-field-background-muted: #111724;
  --cfmock-field-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  --cfmock-heading-color: #f3f6fb;
  --cfmock-body-color: #9aa7ba;
  --cfmock-helper-color: #aeb9cb;
  --cfmock-subtle-color: #7d8aa1;
  --cfmock-bar-text-color: #7d8aa1;
  --cfmock-back-link-color: #76a9ff;
  --cfmock-badge-border: rgba(244, 129, 32, 0.34);
  --cfmock-badge-background: rgba(244, 129, 32, 0.14);
  --cfmock-footer-border: rgba(244, 129, 32, 0.28);
  --cfmock-footer-background: rgba(244, 129, 32, 0.08);
}
`;

const shellStyle = {
  margin: "24px 0 28px",
  border: "1px solid var(--cfmock-shell-border)",
  borderRadius: "18px",
  overflow: "hidden",
  color: "var(--cfmock-heading-color)",
  background: "var(--cfmock-shell-background)",
  boxShadow: "var(--cfmock-shell-shadow)",
  position: "relative" as const,
} as const;

const fieldBase = {
  height: "44px",
  border: "1px solid var(--cfmock-field-border)",
  borderRadius: "10px",
  background: "var(--cfmock-field-background)",
  color: "var(--cfmock-heading-color)",
  fontSize: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 12px",
  boxSizing: "border-box" as const,
  boxShadow: "var(--cfmock-field-shadow)",
} as const;

function SelectField({ value, width }: { value: string; width?: string }) {
  return (
    <div style={{ ...fieldBase, width: width ?? "100%" }}>
      <span>{value}</span>
      <span style={{ color: "var(--cfmock-subtle-color)", fontSize: "12px" }}>
        ▾
      </span>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div
        style={{
          color: "var(--cfmock-heading-color)",
          fontWeight: 700,
          fontSize: "24px",
          lineHeight: 1.25,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: "6px",
          color: "var(--cfmock-helper-color)",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
      >
        {description}
      </div>
    </div>
  );
}

export function CloudflareTokenConfigMock({
  variant,
}: {
  variant: MockVariant;
}) {
  const config = variantConfigs[variant];

  return (
    <div className="cf-token-config-mock" style={shellStyle}>
      <style>{themeOverrideCss}</style>
      <div
        style={{
          height: "56px",
          borderBottom: "1px solid var(--cfmock-shell-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          background: "var(--cfmock-shell-highlight)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: "28px",
            height: "18px",
            borderRadius: "999px",
            background: brandAccent,
            position: "relative",
            boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.12)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-3px",
              left: "2px",
              width: "10px",
              height: "10px",
              borderRadius: "999px",
              background: "#ffb15c",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            color: "var(--cfmock-bar-text-color)",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          <span>支持</span>
          <span>👤</span>
        </div>
      </div>
      <div style={{ minHeight: "900px", position: "relative" }}>
        <main style={{ padding: "34px 40px 40px", maxWidth: "980px" }}>
          <div
            style={{
              color: "var(--cfmock-back-link-color)",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            ← 返回以查看所有令牌
          </div>

          <div
            style={{
              marginTop: "18px",
              color: "var(--cfmock-heading-color)",
              fontSize: "34px",
              lineHeight: 1.15,
              fontWeight: 800,
            }}
          >
            创建自定义令牌
          </div>

          <div
            style={{
              marginTop: "16px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 12px",
              borderRadius: "999px",
              border: "1px solid var(--cfmock-badge-border)",
              background: "var(--cfmock-badge-background)",
              color: brandAccent,
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {config.badge}
          </div>

          <div
            style={{
              marginTop: "12px",
              maxWidth: "760px",
              color: "var(--cfmock-body-color)",
              fontSize: "14px",
              lineHeight: 1.7,
            }}
          >
            {config.helper}
          </div>

          <section style={{ marginTop: "24px", maxWidth: "840px" }}>
            <SectionTitle
              title="令牌名称"
              description="为您的 API 令牌指定描述性名称。"
            />
            <div
              style={{
                ...fieldBase,
                width: "420px",
                justifyContent: "flex-start",
                background: "var(--cfmock-field-background-muted)",
              }}
            >
              {config.tokenName}
            </div>
          </section>

          <section style={{ marginTop: "28px", maxWidth: "960px" }}>
            <SectionTitle
              title="权限"
              description="按 KaisouMail 对应场景把权限配全即可。"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px minmax(0, 1fr) 186px",
                gap: "10px",
                color: "var(--cfmock-subtle-color)",
                fontSize: "13px",
                marginBottom: "10px",
              }}
            >
              <div>资源</div>
              <div>权限</div>
              <div>权限级别</div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              {config.permissions.map(([resource, permission, access]) => (
                <div
                  key={`${variant}-${resource}-${permission}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px minmax(0, 1fr) 186px",
                    gap: "10px",
                  }}
                >
                  <SelectField value={resource} />
                  <SelectField value={permission} />
                  <SelectField value={access} />
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginTop: "28px", maxWidth: "960px" }}>
            <SectionTitle
              title="帐户资源"
              description="按这个示意选择范围即可。"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 300px",
                gap: "10px",
              }}
            >
              <SelectField value="包括" />
              <SelectField value={config.accountScope} />
            </div>
          </section>

          <section style={{ marginTop: "28px", maxWidth: "960px" }}>
            <SectionTitle
              title="区域资源"
              description="推荐覆盖当前项目会管理到的所有目标区域。"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 340px",
                gap: "10px",
              }}
            >
              <SelectField value="包括" />
              <SelectField value={config.zoneScope} />
            </div>
          </section>

          <div
            style={{
              marginTop: "30px",
              padding: "16px 18px",
              borderRadius: "12px",
              border: "1px solid var(--cfmock-footer-border)",
              background: "var(--cfmock-footer-background)",
              color: "var(--cfmock-heading-color)",
              fontSize: "14px",
              lineHeight: 1.7,
            }}
          >
            {config.footer}
          </div>
        </main>
      </div>
    </div>
  );
}
