import { Link } from "react-router-dom";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { projectMeta } from "@/lib/project-meta";
import { appRoutes } from "@/lib/routes";

export const AuthShell = ({
  mode,
  children,
}: {
  mode: "login" | "register" | "register-complete";
  children: React.ReactNode;
}) => {
  const _isLogin = mode === "login";

  return (
    <div className="mx-auto grid min-h-screen max-w-[1220px] items-center gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_520px]">
      <section className="space-y-6">
        <div className="max-w-[24rem]">
          <BrandLockup />
        </div>
        <div className="space-y-3">
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground">
            {projectMeta.projectName}
          </h1>
          <p className="max-w-xl text-sm leading-7 text-muted-foreground">
            临时邮箱控制台。创建地址、查看消息与附件。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Link
            to={appRoutes.workspace}
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition hover:decoration-foreground"
          >
            控制台主页
          </Link>
        </div>
      </section>

      <div>{children}</div>
    </div>
  );
};
