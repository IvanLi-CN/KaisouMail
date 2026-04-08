import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import {
  type IdentityAuthTab,
  IdentityAuthTabsList,
  isIdentityAuthTab,
} from "@/components/identity/identity-auth-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";

const IdentityAuthTabsStoryView = ({
  defaultTab = "api-keys",
}: {
  defaultTab?: IdentityAuthTab;
}) => {
  const [activeTab, setActiveTab] = useState<IdentityAuthTab>(defaultTab);

  return (
    <Card className="max-w-xl" data-testid="identity-auth-tabs-showcase">
      <CardContent className="space-y-6 p-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (isIdentityAuthTab(value)) {
              setActiveTab(value);
            }
          }}
        >
          <IdentityAuthTabsList />

          <TabsContent value="api-keys" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-sm font-medium text-foreground">API Keys</p>
              <p className="mt-2 text-sm text-muted-foreground">
                用于自动化、Agent、应急恢复与 Bearer 调用。
              </p>
            </div>
          </TabsContent>

          <TabsContent value="passkey" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <p className="text-sm font-medium text-foreground">Passkey</p>
              <p className="mt-2 text-sm text-muted-foreground">
                用于浏览器登录、设备绑定与后续便捷会话恢复。
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const meta = {
  title: "Identity/IdentityAuthTabs",
  component: IdentityAuthTabsStoryView,
  tags: ["autodocs"],
  args: {
    defaultTab: "api-keys",
  },
} satisfies Meta<typeof IdentityAuthTabsStoryView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ApiKeysSelected: Story = {};

export const PasskeySelected: Story = {
  args: {
    defaultTab: "passkey",
  },
};

export const InteractiveSwitch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const passkeyTab = canvas.getByRole("tab", { name: "Passkey" });

    await expect(canvas.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.click(passkeyTab);

    await expect(passkeyTab).toHaveAttribute("aria-selected", "true");
    await expect(
      canvas.getByText("用于浏览器登录、设备绑定与后续便捷会话恢复。"),
    ).toBeInTheDocument();
  },
};
