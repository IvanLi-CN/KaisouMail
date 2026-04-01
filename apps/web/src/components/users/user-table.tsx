import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { UserRecord } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";

const createUserSchema = z.object({
  name: z.string().min(1, "请输入姓名"),
  email: z.string().email("请输入有效邮箱"),
  role: z.enum(["admin", "member"]),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

export const UserTable = ({
  users,
  latestKey,
  onCreate,
}: {
  users: UserRecord[];
  latestKey?: string | null;
  onCreate: (values: CreateUserValues) => Promise<void> | void;
}) => {
  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", role: "member" },
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>创建用户</CardTitle>
          <CardDescription>
            每个用户默认会生成一把初始 API Key。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => onCreate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="user-name">姓名</Label>
              <Input
                id="user-name"
                {...form.register("name")}
                placeholder="Koha"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">邮箱</Label>
              <Input
                id="user-email"
                {...form.register("email")}
                placeholder="koha@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">角色</Label>
              <select
                id="user-role"
                className="flex h-11 w-full rounded-2xl border border-input bg-background/60 px-4 text-sm outline-none"
                {...form.register("role")}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <Button className="w-full" type="submit">
              创建用户
            </Button>
          </form>
          {latestKey ? (
            <div className="rounded-[24px] border border-primary/40 bg-primary/10 p-4 text-sm">
              <p className="font-medium text-primary">初始 API Key</p>
              <p className="mt-2 break-all text-foreground">{latestKey}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>管理员可以查看所有用户与更新时间。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>用户</TableHeaderCell>
                <TableHeaderCell>角色</TableHeaderCell>
                <TableHeaderCell>创建时间</TableHeaderCell>
                <TableHeaderCell>更新时间</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell>{formatDateTime(user.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
