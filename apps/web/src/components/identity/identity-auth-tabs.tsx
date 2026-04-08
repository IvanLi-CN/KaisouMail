import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export const identityAuthTabs = [
  {
    id: "api-keys",
    label: "API Keys",
    description: "用于自动化、Agent、应急恢复与 Bearer 调用。",
  },
  {
    id: "passkey",
    label: "Passkey",
    description: "用于浏览器登录、设备绑定与后续便捷会话恢复。",
  },
] as const;

export type IdentityAuthTab = (typeof identityAuthTabs)[number]["id"];

export const isIdentityAuthTab = (
  value: string | null,
): value is IdentityAuthTab => identityAuthTabs.some((tab) => tab.id === value);

export const IdentityAuthTabsList = () => {
  return (
    <TabsList
      aria-label="身份认证方式"
      className="inline-flex h-auto items-center justify-start gap-1 rounded-xl border border-border bg-[hsl(var(--background)/0.72)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {identityAuthTabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          className="rounded-lg !border-transparent !bg-transparent px-3 py-2 text-sm font-medium !text-[hsl(var(--muted-foreground))] transition-all duration-200 hover:!bg-[rgba(255,255,255,0.03)] hover:!text-[hsl(var(--foreground))] data-[state=inactive]:opacity-75 data-[state=active]:!bg-[hsl(var(--secondary))] data-[state=active]:!text-[hsl(var(--foreground))] data-[state=active]:!shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] data-[state=active]:opacity-100"
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
};
