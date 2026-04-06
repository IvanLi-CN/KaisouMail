import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";

describe("ErrorState", () => {
  it("renders details inside a collapsed disclosure", () => {
    render(
      <ErrorState
        variant="fatal"
        title="页面渲染异常已被拦截"
        description="控制台已经阻止默认错误页继续暴露给用户。"
        details='{"traceId":"trace_demo"}'
        primaryAction={<Button>重新尝试</Button>}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "页面渲染异常已被拦截" }),
    ).toBeInTheDocument();
    expect(screen.getByText("查看技术详情")).toBeInTheDocument();
    expect(screen.getByText(/trace_demo/i)).toBeInTheDocument();
  });
});
