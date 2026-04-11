type PermissionRow = readonly [
  resource: string,
  permission: string,
  access: string,
];

type MockVariant = "runtime" | "deploy" | "shared";

type VariantConfig = {
  badge: string;
  accent: string;
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
    accent: "#64d2ff",
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
    accent: "#7ef0c1",
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
    accent: "#ffb86b",
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

const shellStyle = {
  margin: "24px 0 28px",
  border: "1px solid #d9e1ec",
  borderRadius: "18px",
  overflow: "hidden",
  color: "#1f2937",
  background: "#ffffff",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.08)",
  position: "relative" as const,
} as const;

const topBarStyle = {
  height: "56px",
  borderBottom: "1px solid #e5ebf3",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  padding: "0 20px",
  color: "#6b7280",
  fontSize: "13px",
  background: "#ffffff",
} as const;

const fieldBase = {
  height: "40px",
  border: "1px solid #d5deea",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#172033",
  fontSize: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 12px",
  boxSizing: "border-box" as const,
} as const;

function SelectField({ value, width }: { value: string; width?: string }) {
  return (
    <div style={{ ...fieldBase, width: width ?? "100%" }}>
      <span>{value}</span>
      <span style={{ color: "#7b8baa", fontSize: "12px" }}>▾</span>
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
          color: "#172033",
          fontWeight: 700,
          fontSize: "22px",
          lineHeight: 1.25,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: "6px",
          color: "#66758d",
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
    <div style={shellStyle}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(15,23,42,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.03) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          pointerEvents: "none",
          opacity: 0.35,
        }}
      />

      <div style={{ minHeight: "980px", position: "relative" }}>
        <div style={topBarStyle}>
          <div
            style={{
              width: "22px",
              height: "14px",
              borderRadius: "999px",
              background: "#f48120",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-3px",
                left: "2px",
                width: "8px",
                height: "8px",
                borderRadius: "999px",
                background: "#f9a84a",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span>支持</span>
            <span>👤</span>
          </div>
        </div>

        <main style={{ padding: "28px 56px 40px", maxWidth: "980px" }}>
          <div
            style={{
              color: "#76a9ff",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            ← 返回以查看所有令牌
          </div>

          <div
            style={{
              marginTop: "18px",
              color: "#172033",
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
              gap: "10px",
              padding: "10px 14px",
              borderRadius: "999px",
              border: `1px solid ${config.accent}44`,
              background: `${config.accent}14`,
              color: config.accent,
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
              color: "#66758d",
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
                color: "#66758d",
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
              border: `1px solid ${config.accent}2f`,
              background: `${config.accent}10`,
              color: "#243247",
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
