import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api";
import {
  demoAdminUsers,
  demoInvites,
  demoRegistrationSettings,
  demoSessionUser,
} from "@/mocks/data";
import { UsersPageView } from "@/pages/users-page";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      createAdminTransferIntent: vi.fn(async () => ({
        intentToken: "intent_demo",
      })),
      createAdminTransferPasskeyOptions: vi.fn(),
      verifyAdminTransferPasskey: vi.fn(),
      verifyAdminTransferApiKey: vi.fn(),
    },
  };
});

const demoCurrentAdmin = {
  user: demoSessionUser,
  externalAccounts: demoAdminUsers[0]?.externalAccounts ?? [],
  hasPasskeys: (demoAdminUsers[0]?.passkeyCount ?? 0) > 0,
};

const buildAdminUsers = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const source = demoAdminUsers[index % demoAdminUsers.length];
    if (!source) {
      throw new Error("Expected demo admin user fixture");
    }
    const number = index + 1;
    return {
      ...source,
      id: `usr_page_${number}`,
      username: `member${number}`,
      nickname: `Member ${number}`,
      createdAt: `2026-04-${String(number).padStart(2, "0")}T08:00:00.000Z`,
      updatedAt: `2026-04-${String(number).padStart(2, "0")}T09:00:00.000Z`,
      deletedAt: null,
    };
  });

const buildInvites = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const source = demoInvites[index % demoInvites.length];
    if (!source) {
      throw new Error("Expected demo invite fixture");
    }
    const number = index + 1;
    return {
      ...source,
      id: `inv_page_${number}`,
      code: `km_demo_invite_${String(number).padStart(2, "0")}`,
      note: `Invite page ${number}`,
      createdAt: `2026-04-${String(number).padStart(2, "0")}T08:00:00.000Z`,
      usedAt: null,
      usedByUserId: null,
    };
  });

const getSystemNavButton = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}`) });

const getTransferAdminButton = () => {
  const buttons = screen.getAllByRole("button", { name: "转移管理员" });
  const button = buttons[1];
  if (!button) {
    throw new Error("Expected a transfer admin action for the secondary user");
  }
  return button;
};

describe("users page view", () => {
  it("renders a recoverable error state", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          users={[]}
          invites={[]}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          error={{
            variant: "recoverable",
            title: "管理员数据加载失败",
            description: "控制台现在不可用。",
            details: '{"error":"Request failed"}',
          }}
          onRetry={vi.fn()}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "管理员数据加载失败" }),
    ).toBeInTheDocument();
  });

  it("renders admin users, invites and settings", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="users"
          users={demoAdminUsers}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("@ivan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@teammate").length).toBeGreaterThan(0);
    expect(getSystemNavButton("用户")).toHaveAttribute("aria-pressed", "true");
  });

  it("opens transfer dialog before admin handoff", async () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="users"
          users={demoAdminUsers}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(getTransferAdminButton());

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("目标账号")).toBeInTheDocument();
    expect(apiClient.createAdminTransferIntent).toHaveBeenCalled();
  });

  it("keeps final transfer action locked until reauth finishes", async () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="users"
          users={demoAdminUsers}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(getTransferAdminButton());

    const confirmButton = await screen.findByRole("button", {
      name: "确认转移管理员",
    });
    expect(confirmButton).toBeDisabled();
  });

  it("submits batch invite generation from the list toolbar", async () => {
    const onCreateInvite = vi.fn();

    render(
      <MemoryRouter>
        <UsersPageView
          section="invites"
          users={demoAdminUsers}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={onCreateInvite}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    const quantityInput = screen.getByLabelText("数量") as HTMLInputElement;
    fireEvent.change(quantityInput, {
      target: { value: "8", valueAsNumber: 8 },
    });
    fireEvent.click(screen.getByRole("button", { name: "批量生成邀请码" }));

    await waitFor(() =>
      expect(onCreateInvite).toHaveBeenCalledWith({
        note: "",
        count: 8,
      }),
    );
  });

  it("paginates the user list", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="users"
          users={buildAdminUsers(12)}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("显示 1-10 / 12 个用户")).toBeInTheDocument();
    expect(screen.queryByText("@member12")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getByText("显示 11-12 / 12 个用户")).toBeInTheDocument();
    expect(screen.getAllByText("@member12").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("paginates the invite list", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="invites"
          users={demoAdminUsers}
          invites={buildInvites(13)}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("显示 1-10 / 13 个邀请码")).toBeInTheDocument();
    expect(screen.queryByText("km_demo_invite_13")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getByText("显示 11-13 / 13 个邀请码")).toBeInTheDocument();
    expect(screen.getAllByText("km_demo_invite_13").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("keeps server pagination controls bound to the supplied page metadata", () => {
    const onUsersPageChange = vi.fn();

    render(
      <MemoryRouter>
        <UsersPageView
          section="users"
          users={buildAdminUsers(2)}
          usersPagination={{
            page: 2,
            pageSize: 10,
            totalItems: 12,
            totalPages: 2,
          }}
          usersPaginationMode="server"
          invites={demoInvites}
          invitesPagination={{
            page: 1,
            pageSize: 10,
            totalItems: demoInvites.length,
            totalPages: 1,
          }}
          invitesPaginationMode="server"
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
          onUsersPageChange={onUsersPageChange}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("显示 11-12 / 12 个用户")).toBeInTheDocument();
    expect(screen.getByText("第 2 / 2 页")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "上一页" }));

    expect(onUsersPageChange).toHaveBeenCalledWith(1);
  });

  it("hides local user filters when server pagination is active", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="users"
          users={buildAdminUsers(2)}
          usersPagination={{
            page: 2,
            pageSize: 10,
            totalItems: 12,
            totalPages: 2,
          }}
          usersPaginationMode="server"
          invites={demoInvites}
          invitesPagination={{
            page: 1,
            pageSize: 10,
            totalItems: demoInvites.length,
            totalPages: 1,
          }}
          invitesPaginationMode="server"
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
          onUsersPageChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("textbox", { name: "筛选当前页用户" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "当前按服务端分页展示完整结果，暂不提供页内搜索或角色筛选。",
      ),
    ).toBeInTheDocument();
  });

  it("switches between system subsections", () => {
    const onSectionChange = vi.fn();

    render(
      <MemoryRouter>
        <UsersPageView
          section="users"
          onSectionChange={onSectionChange}
          users={demoAdminUsers}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(getSystemNavButton("邀请"));

    expect(onSectionChange).toHaveBeenCalledWith("invites");
  });

  it("submits explicit OAuth secret clear flags from the registration section", async () => {
    const onUpdateSettings = vi.fn();

    render(
      <MemoryRouter>
        <UsersPageView
          section="registration"
          users={demoAdminUsers}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={onUpdateSettings}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    const clearButtons = screen.getAllByRole("button", {
      name: "清空已存密钥",
    });
    const githubClearButton = clearButtons[0];
    if (!githubClearButton) {
      throw new Error("Expected GitHub clear secret button");
    }
    fireEvent.click(githubClearButton);
    fireEvent.click(screen.getByRole("button", { name: "保存注册设置" }));

    await waitFor(() =>
      expect(onUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          clearGithubClientSecret: true,
          clearLinuxdoClientSecret: false,
        }),
      ),
    );
  });

  it("shows a first-load users skeleton while the list is still loading", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="users"
          users={[]}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          isUsersLoading
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("users-page-skeleton")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "用户", level: 2 }),
    ).toBeInTheDocument();
  });

  it("shows an invites skeleton while the invite list is still loading", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="invites"
          users={demoAdminUsers}
          invites={[]}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          isInvitesLoading
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("invites-page-skeleton")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "批量生成邀请码" }),
    ).toBeInTheDocument();
  });

  it("shows a registration skeleton while settings are still loading", () => {
    render(
      <MemoryRouter>
        <UsersPageView
          section="registration"
          users={demoAdminUsers}
          invites={demoInvites}
          settings={demoRegistrationSettings}
          currentAdminUserId={demoSessionUser.id}
          currentAdmin={demoCurrentAdmin}
          isSettingsLoading
          onCreateInvite={vi.fn()}
          onDeleteInvite={vi.fn()}
          onUpdateSettings={vi.fn()}
          onTransferAdmin={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByTestId("registration-settings-skeleton"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "注册设置", level: 2 }),
    ).toBeInTheDocument();
  });
});
