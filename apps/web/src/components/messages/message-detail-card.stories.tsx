import type { Meta, StoryObj } from "@storybook/react-vite";

import { MessageDetailCard } from "@/components/messages/message-detail-card";
import { demoMessageDetails } from "@/mocks/data";

const withAttachments = demoMessageDetails.msg_alpha;
const textOnly = demoMessageDetails.msg_beta;
const htmlOnly = {
  ...demoMessageDetails.msg_alpha,
  id: "msg_gamma_story",
  attachmentCount: 0,
  attachments: [],
  text: null,
  previewText: "HTML only preview mail",
};

const meta = {
  title: "Messages/MessageDetailCard",
  component: MessageDetailCard,
  tags: ["autodocs"],
  args: {
    message: withAttachments,
    rawUrl: withAttachments.rawDownloadPath,
  },
} satisfies Meta<typeof MessageDetailCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithAttachments: Story = {};

export const TextOnly: Story = {
  args: {
    message: textOnly,
    rawUrl: textOnly.rawDownloadPath,
  },
};

export const HtmlOnly: Story = {
  args: {
    message: htmlOnly,
    rawUrl: htmlOnly.rawDownloadPath,
  },
};
