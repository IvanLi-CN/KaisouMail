import { RefreshCw } from "lucide-react";

import {
  ActionButton,
  type ActionButtonDensity,
  type ActionButtonLabelVisibility,
} from "@/components/ui/action-button";
import { formatRefreshTime } from "@/lib/message-refresh";

export const MessageRefreshControl = ({
  isRefreshing,
  lastRefreshedAt,
  onRefresh,
  density = "dense",
  labelVisibility = "auto",
}: {
  isRefreshing: boolean;
  lastRefreshedAt: number | null;
  onRefresh: () => Promise<void> | void;
  density?: ActionButtonDensity;
  labelVisibility?: ActionButtonLabelVisibility;
}) => (
  <div className="flex items-center gap-2">
    <span className="whitespace-nowrap text-xs text-muted-foreground">
      {isRefreshing ? "正在刷新…" : formatRefreshTime(lastRefreshedAt)}
    </span>
    <ActionButton
      density={density}
      icon={RefreshCw}
      iconClassName={isRefreshing ? "animate-spin" : undefined}
      label={isRefreshing ? "刷新中" : "手动刷新"}
      labelVisibility={labelVisibility}
      priority="secondary"
      tooltip="刷新当前页面的数据"
      variant="outline"
      onClick={() => void onRefresh()}
      disabled={isRefreshing}
    />
  </div>
);
