import { Link, useLocation } from "react-router-dom";

import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { useSessionQuery } from "@/hooks/use-session";
import { appRoutes } from "@/lib/routes";

export const NotFoundPage = () => {
  const location = useLocation();
  const sessionQuery = useSessionQuery();
  const primaryHref = sessionQuery.data?.user
    ? appRoutes.workspace
    : appRoutes.login;
  const primaryLabel = sessionQuery.data?.user ? "回到工作台" : "前往登录页";

  return (
    <ErrorState
      variant="not-found"
      layout="fullScreen"
      title="这个地址不存在"
      description="我们没有在控制台里找到对应的页面入口。你可以回到稳定入口继续操作，或者检查地址是否拼写正确。"
      details={`Path: ${location.pathname}${location.search}${location.hash}`}
      primaryAction={
        <Button asChild>
          <Link to={primaryHref}>{primaryLabel}</Link>
        </Button>
      }
      secondaryAction={
        <Button asChild variant="outline">
          <Link to={appRoutes.mailboxes}>打开邮箱管理</Link>
        </Button>
      }
    />
  );
};
