import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("defaults plain buttons to type=button", () => {
    render(
      <form>
        <Button>销毁</Button>
      </form>,
    );

    expect(screen.getByRole("button", { name: "销毁" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("preserves an explicit submit type", () => {
    render(
      <form>
        <Button type="submit">创建邮箱</Button>
      </form>,
    );

    expect(screen.getByRole("button", { name: "创建邮箱" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("keeps button and badge labels on a single line", () => {
    render(
      <div>
        <Button>打开邮件工作台</Button>
        <Badge>高密度</Badge>
      </div>,
    );

    expect(screen.getByRole("button", { name: "打开邮件工作台" })).toHaveClass(
      "whitespace-nowrap",
    );
    expect(screen.getByText("高密度")).toHaveClass("whitespace-nowrap");
  });
});
