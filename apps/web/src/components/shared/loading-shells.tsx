import type { HTMLAttributes, ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const shellWidths = [
  "w-[92%]",
  "w-[76%]",
  "w-[84%]",
  "w-[68%]",
  "w-[88%]",
] as const;

const buildSkeletonIds = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

const CardHeaderSkeleton = ({
  titleWidth = "w-32",
  descriptionWidth = "w-64",
}: {
  titleWidth?: string;
  descriptionWidth?: string;
}) => (
  <CardHeader>
    <CardTitle>
      <Skeleton className={cn("h-6", titleWidth)} />
    </CardTitle>
    <CardDescription>
      <Skeleton className={cn("h-4", descriptionWidth)} />
    </CardDescription>
  </CardHeader>
);

export const FormCardSkeleton = ({
  className,
  fieldCount = 3,
  testId,
}: {
  className?: string;
  fieldCount?: number;
  testId?: string;
}) => (
  <Card aria-busy="true" className={className} data-testid={testId}>
    <CardHeaderSkeleton titleWidth="w-32" descriptionWidth="w-52" />
    <CardContent className="space-y-4">
      {buildSkeletonIds("form-field", fieldCount).map((fieldId) => (
        <div className="space-y-2" key={fieldId}>
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-10 w-full rounded-xl" />
    </CardContent>
  </Card>
);

export const TableCardSkeleton = ({
  className,
  columnCount = 5,
  rowCount = 5,
  testId,
}: {
  className?: string;
  columnCount?: number;
  rowCount?: number;
  testId?: string;
}) => (
  <Card aria-busy="true" className={className} data-testid={testId}>
    <CardHeaderSkeleton titleWidth="w-36" descriptionWidth="w-64" />
    <CardContent>
      <Table>
        <TableHead>
          <TableRow className="hover:bg-transparent">
            {buildSkeletonIds("table-header", columnCount).map((headerId) => (
              <TableHeaderCell key={headerId}>
                <Skeleton className="h-3 w-14" />
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {buildSkeletonIds("table-row", rowCount).map((rowId, rowIndex) => (
            <TableRow className="hover:bg-transparent" key={rowId}>
              {buildSkeletonIds(`${rowId}-cell`, columnCount).map(
                (cellId, columnIndex) => (
                  <TableCell key={cellId}>
                    <Skeleton
                      className={cn(
                        "h-4",
                        shellWidths[
                          (rowIndex + columnIndex) % shellWidths.length
                        ],
                      )}
                    />
                  </TableCell>
                ),
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

export const DetailPageSkeleton = ({
  className,
  content,
  testId,
}: {
  className?: string;
  content?: ReactNode;
  testId?: string;
}) => (
  <div
    aria-busy="true"
    className={cn("space-y-6", className)}
    data-testid={testId}
  >
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-[26rem] max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
    </div>

    <Card>
      <CardHeaderSkeleton titleWidth="w-24" descriptionWidth="w-56" />
      <CardContent className="space-y-4">
        {content ?? (
          <>
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-5 w-[82%]" />
            <Skeleton className="h-5 w-[94%]" />
            <Skeleton className="h-5 w-[70%]" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </>
        )}
      </CardContent>
    </Card>
  </div>
);

export const WorkspaceListPaneSkeleton = ({
  className,
  rowCount = 5,
  testId,
}: {
  className?: string;
  rowCount?: number;
  testId?: string;
}) => (
  <div
    aria-busy="true"
    className={cn("mx-3 space-y-3", className)}
    data-testid={testId}
  >
    {buildSkeletonIds("workspace-row", rowCount).map((rowId) => (
      <div
        className="rounded-xl border border-border bg-muted/10 px-3 py-3"
        key={rowId}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-[78%]" />
              <Skeleton className="h-3 w-[42%]" />
            </div>
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const WorkspaceDetailPaneSkeleton = ({
  className,
  testId,
}: {
  className?: string;
  testId?: string;
}) => (
  <div
    aria-busy="true"
    className={cn("space-y-4", className)}
    data-testid={testId}
  >
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-7 w-[72%]" />
      <Skeleton className="h-4 w-[52%]" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-4 w-[24%]" />
      <Skeleton className="h-4 w-[92%]" />
      <Skeleton className="h-4 w-[86%]" />
      <Skeleton className="h-4 w-[80%]" />
      <Skeleton className="h-36 w-full rounded-2xl" />
    </div>
  </div>
);

export const LoadingShellContainer = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-6", className)} {...props} />
);
