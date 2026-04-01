import type { Meta, StoryObj } from "@storybook/react-vite";

import { MessageList } from "@/components/messages/message-list";
import { demoMessages } from "@/mocks/data";

const meta = {
  title: "Messages/MessageList",
  component: MessageList,
  tags: ["autodocs"],
  args: {
    messages: demoMessages,
  },
} satisfies Meta<typeof MessageList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
