import { Card } from "@/components/ui/card";

export const StatGrid = ({
  stats,
}: {
  stats: Array<{ label: string; value: string; hint: string }>;
}) => (
  <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
    {stats.map((stat) => (
      <Card key={stat.label} className="space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {stat.label}
        </p>
        <div className="space-y-1">
          <p className="text-3xl font-semibold text-foreground">{stat.value}</p>
          <p className="text-sm text-muted-foreground">{stat.hint}</p>
        </div>
      </Card>
    ))}
  </div>
);
