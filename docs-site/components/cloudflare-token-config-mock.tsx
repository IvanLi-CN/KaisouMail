const permissions = [
  ["区域", "Zone", "读取"],
  ["区域", "Email Routing Rules", "编辑"],
  ["区域", "Zone Settings", "编辑"],
  ["帐户", "D1", "编辑"],
  ["帐户", "Workers 脚本", "编辑"],
  ["帐户", "Cloudflare Pages", "编辑"],
  ["区域", "Workers Routes", "编辑"],
] as const;

const fieldBase = {
  height: "38px",
  border: "1px solid #cfd7e3",
  borderRadius: "4px",
  background: "#fff",
  color: "#1f2937",
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
      <span style={{ color: "#6b7280", fontSize: "12px" }}>▾</span>
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
          color: "#111827",
          fontWeight: 600,
          fontSize: "22px",
          lineHeight: 1.25,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: "6px",
          color: "#6b7280",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
      >
        {description}
      </div>
    </div>
  );
}

export function CloudflareTokenConfigMock() {
  return (
    <div
      style={{
        margin: "24px 0 28px",
        border: "1px solid #d9e0ea",
        borderRadius: "16px",
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 16px 48px rgba(15, 23, 42, 0.18)",
      }}
    >
      <div style={{ minHeight: "1120px", background: "#fff" }}>
        <div
          style={{
            height: "56px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            padding: "0 20px",
            color: "#4b5563",
            fontSize: "13px",
          }}
        >
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <span>支持</span>
            <span>👤</span>
          </div>
        </div>

        <main style={{ padding: "28px 56px 40px", maxWidth: "980px" }}>
          <div
            style={{
              color: "#2563eb",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            ← 返回以查看所有令牌
          </div>

          <div
            style={{
              marginTop: "18px",
              color: "#111827",
              fontSize: "34px",
              lineHeight: 1.15,
              fontWeight: 700,
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
              border: "1px solid #fed7aa",
              background: "#fff7ed",
              color: "#9a3412",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            共享 token 快速上手示例
            <span style={{ color: "#c2410c", fontWeight: 500 }}>
              仅用于试用；正式环境推荐拆分
            </span>
          </div>

          <section style={{ marginTop: "22px", maxWidth: "840px" }}>
            <SectionTitle
              title="令牌名称"
              description="为您的 API 令牌指定描述性名称。"
            />
            <div
              style={{
                ...fieldBase,
                width: "420px",
                justifyContent: "flex-start",
                color: "#111827",
              }}
            >
              cfm
            </div>
          </section>

          <section style={{ marginTop: "26px", maxWidth: "960px" }}>
            <SectionTitle
              title="权限"
              description="为此令牌选择要应用于您的帐户或网站的编辑或读取权限。"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px minmax(0, 1fr) 186px",
                gap: "10px",
                color: "#6b7280",
                fontSize: "13px",
                marginBottom: "10px",
              }}
            >
              <div>资源</div>
              <div>权限</div>
              <div>权限级别</div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              {permissions.map(([resource, permission, access]) => (
                <div
                  key={`${resource}-${permission}`}
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

            <div
              style={{
                marginTop: "10px",
                color: "#2563eb",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              + 添加更多
            </div>
          </section>

          <section style={{ marginTop: "26px", maxWidth: "960px" }}>
            <SectionTitle
              title="帐户资源"
              description="选择要包括或排除的帐户。"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 260px",
                gap: "10px",
              }}
            >
              <SelectField value="包括" />
              <SelectField value="所有帐户" />
            </div>
          </section>

          <section style={{ marginTop: "26px", maxWidth: "960px" }}>
            <SectionTitle
              title="区域资源"
              description="选择要包括或排除的区域。推荐覆盖 CF Mail 会管理的所有目标区域。"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 340px",
                gap: "10px",
              }}
            >
              <SelectField value="包括" />
              <SelectField value="所有区域" />
            </div>
            <div
              style={{
                marginTop: "10px",
                color: "#2563eb",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              + 添加更多
            </div>
          </section>

          <section style={{ marginTop: "26px", maxWidth: "960px" }}>
            <SectionTitle
              title="客户端 IP 地址筛选"
              description="选择要筛选的 IP 地址或 IP 地址范围。默认情况下，此令牌适用于所有地址。"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px minmax(0, 1fr) 96px",
                gap: "10px",
                alignItems: "end",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: "13px",
                    marginBottom: "8px",
                  }}
                >
                  运算符
                </div>
                <SelectField value="选择" />
              </div>
              <div>
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: "13px",
                    marginBottom: "8px",
                  }}
                >
                  值
                </div>
                <div
                  style={{
                    ...fieldBase,
                    justifyContent: "flex-start",
                    color: "#9ca3af",
                  }}
                >
                  例如，192.168.1.88
                </div>
              </div>
              <div
                style={{
                  height: "38px",
                  borderRadius: "4px",
                  background: "#dbeafe",
                  color: "#3b82f6",
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                使用我的 IP
              </div>
            </div>
            <div
              style={{
                marginTop: "10px",
                color: "#2563eb",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              + 添加更多
            </div>
          </section>

          <section style={{ marginTop: "26px", maxWidth: "960px" }}>
            <SectionTitle
              title="TTL"
              description="定义此令牌将保持活动状态的时间长度。"
            />
            <div
              style={{
                ...fieldBase,
                width: "196px",
                justifyContent: "center",
                gap: "10px",
                color: "#4b5563",
              }}
            >
              <span>Start Date</span>
              <span>→</span>
              <span>End Date</span>
            </div>
          </section>

          <div
            style={{
              marginTop: "34px",
              paddingTop: "18px",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              gap: "10px",
            }}
          >
            <div
              style={{
                height: "36px",
                padding: "0 14px",
                borderRadius: "4px",
                background: "#e5e7eb",
                color: "#374151",
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              取消
            </div>
            <div
              style={{
                height: "36px",
                padding: "0 16px",
                borderRadius: "4px",
                background: "#2563eb",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              继续以显示摘要
            </div>
          </div>

          <div
            style={{
              marginTop: "18px",
              color: "#6b7280",
              fontSize: "13px",
              lineHeight: 1.7,
            }}
          >
            这张图只对应快速试用：把同一个 <code>CLOUDFLARE_API_TOKEN</code>{" "}
            同时放进 Worker secret 和 GitHub secret。正式环境如果拆成两把
            token，请按上方表格分别配置{" "}
            <code>CLOUDFLARE_RUNTIME_API_TOKEN</code> 和{" "}
            <code>CLOUDFLARE_DEPLOY_API_TOKEN</code>。
          </div>
        </main>
      </div>
    </div>
  );
}
