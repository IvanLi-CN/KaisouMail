import { RefreshCw } from "lucide-react";
import {
  isRouteErrorResponse,
  Link,
  useNavigate,
  useRouteError,
} from "react-router-dom";

import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { useSessionQuery } from "@/hooks/use-session";
import { getErrorDetails, getErrorMessage } from "@/lib/error-utils";
import { appRoutes } from "@/lib/routes";

const getRouteErrorCopy = (error: unknown) => {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        variant: "not-found" as const,
        title: "找不到你要打开的页面",
        description:
          "这个路由不存在，或者它已经被移动到了新的入口。你可以返回工作台，或者重新回到登录页开始。",
        details:
          typeof error.data === "string"
            ? error.data
            : JSON.stringify(error.data ?? { status: error.status }, null, 2),
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        variant: "permission" as const,
        title: "当前会话没有权限访问这里",
        description:
          "你的登录身份暂时不能打开这个页面。请切回可访问的控制台入口，或使用具备权限的 API Key 重新登录。",
        details:
          typeof error.data === "string"
            ? error.data
            : JSON.stringify(error.data ?? { status: error.status }, null, 2),
      };
    }
  }

  return {
    variant: "fatal" as const,
    title: "这个页面在渲染时出了点问题",
    description:
      "控制台已经拦住了这次异常，避免你落到默认的 React Router 报错页。可以先重试一次，或退回稳定入口继续操作。",
    details: getErrorDetails(error),
  };
};

export const RouteErrorBoundary = () => {
  const error = useRouteError();
  const navigate = useNavigate();
  const sessionQuery = useSessionQuery();
  const primaryHref = sessionQuery.data?.user
    ? appRoutes.workspace
    : appRoutes.login;
  const primaryLabel = sessionQuery.data?.user ? "回到工作台" : "前往登录页";
  const resolved = getRouteErrorCopy(error);

  return (
    <ErrorState
      variant={resolved.variant}
      layout="fullScreen"
      title={resolved.title}
      description={resolved.description}
      details={
        resolved.details ?? getErrorMessage(error, "Unknown route error")
      }
      primaryAction={
        <Button onClick={() => navigate(0)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          重新尝试
        </Button>
      }
      secondaryAction={
        <Button asChild variant="outline">
          <Link to={primaryHref}>{primaryLabel}</Link>
        </Button>
      }
    />
  );
};
