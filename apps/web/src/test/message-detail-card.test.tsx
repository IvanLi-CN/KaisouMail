import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { MessageDetailCard } from "@/components/messages/message-detail-card";
import { demoMessageDetails } from "@/mocks/data";

describe("MessageDetailCard", () => {
  it("renders parsed mail content and attachments", () => {
    const message = demoMessageDetails.msg_alpha;

    render(
      <MemoryRouter>
        <MessageDetailCard message={message} rawUrl={message.rawDownloadPath} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: message.subject }),
    ).toBeInTheDocument();
    expect(screen.getByText("bundle.zip")).toBeInTheDocument();
    expect(
      screen.getByTitle(`HTML preview for ${message.subject}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载 Raw EML" })).toHaveAttribute(
      "href",
      message.rawDownloadPath,
    );
  });
});
