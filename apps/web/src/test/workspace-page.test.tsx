import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoMailboxes, demoMessages, demoMeta } from "@/mocks/data";
import { WorkspacePage } from "@/pages/workspace-page";

const workspacePageState: {
  meta: typeof demoMeta | undefined;
  metaError: Error | null;
  mailboxes: typeof demoMailboxes | undefined;
  mailboxesError: Error | null;
  allMessages: typeof demoMessages | undefined;
  allMessagesError: Error | null;
  mailboxMessages: typeof demoMessages | undefined;
  mailboxMessagesError: Error | null;
  detail: unknown;
  detailError: Error | null;
  refresh: ReturnType<typeof vi.fn>;
} = {
  meta: demoMeta,
  metaError: null as Error | null,
  mailboxes: demoMailboxes,
  mailboxesError: null as Error | null,
  allMessages: demoMessages,
  allMessagesError: null as Error | null,
  mailboxMessages: demoMessages.filter(
    (message) => message.mailboxId === "mbx_alpha",
  ),
  mailboxMessagesError: null as Error | null,
  detail: undefined as unknown,
  detailError: null as Error | null,
  refresh: vi.fn(),
};

const workspacePropsState = {
  mailboxesError: null as null | { title: string },
  visibleMailboxAddresses: [] as string[],
  mailboxScope: null as string | null,
  allMessagesScope: null as string | null,
  selectedMailboxIds: [] as string[],
  selectedMessagesScope: null as string | null,
};
const localStorageState = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
};

vi.mock("@/components/workspace/mail-workspace", () => ({
  MailWorkspace: (props: {
    mailboxesError?: { title: string } | null;
    visibleMailboxes: Array<{ address: string }>;
  }) => {
    workspacePropsState.mailboxesError = props.mailboxesError ?? null;
    workspacePropsState.visibleMailboxAddresses = props.visibleMailboxes.map(
      (mailbox) => mailbox.address,
    );

    return (
      <div>
        <div data-testid="workspace-rail-error">
          {props.mailboxesError?.title ?? "no-mailboxes-error"}
        </div>
        <ul>
          {props.visibleMailboxes.map((mailbox) => (
            <li key={mailbox.address}>{mailbox.address}</li>
          ))}
        </ul>
      </div>
    );
  },
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaQuery: () => ({
    data: workspacePageState.meta,
    error: workspacePageState.metaError,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-mailboxes", () => ({
  mailboxKeys: {
    all: ["mailboxes"],
    list: (scope = "default") => ["mailboxes", { scope }],
  },
  useMailboxesQuery: (options?: { scope?: string }) => {
    workspacePropsState.mailboxScope = options?.scope ?? "default";
    return {
      data: workspacePageState.mailboxes,
      error: workspacePageState.mailboxesError,
      isLoading: false,
      isFetching: false,
      dataUpdatedAt: 1_713_526_800_000,
    };
  },
  useCreateMailboxMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-messages", () => ({
  messageKeys: {
    list: (
      mailboxes: string[] = [],
      _filters?: unknown,
      scope = "default",
      mailboxIds: string[] = [],
    ) => ["messages", mailboxes, scope, mailboxIds],
    detail: (messageId: string) => ["message", messageId],
  },
  useMessagesQuery: (
    mailboxes: string[] = [],
    _filters?: unknown,
    options?: { mailboxIds?: string[]; scope?: string },
  ) => {
    if ((options?.mailboxIds?.length ?? 0) > 0) {
      workspacePropsState.selectedMessagesScope = options?.scope ?? "default";
      workspacePropsState.selectedMailboxIds = options?.mailboxIds ?? [];
      return {
        data: workspacePageState.mailboxMessages,
        error: workspacePageState.mailboxMessagesError,
        isLoading: false,
        isFetching: false,
        dataUpdatedAt: 1_713_526_800_000,
      };
    }

    if (mailboxes.length === 0) {
      workspacePropsState.allMessagesScope = options?.scope ?? "default";
      return {
        data: workspacePageState.allMessages,
        error: workspacePageState.allMessagesError,
        isLoading: false,
        isFetching: false,
        dataUpdatedAt: 1_713_526_800_000,
      };
    }

    workspacePropsState.selectedMessagesScope = options?.scope ?? "default";
    return {
      data: workspacePageState.mailboxMessages,
      error: workspacePageState.mailboxMessagesError,
      isLoading: false,
      isFetching: false,
      dataUpdatedAt: 1_713_526_800_000,
    };
  },
  useMessageDetailQuery: () => ({
    data: workspacePageState.detail,
    error: workspacePageState.detailError,
    isFetching: false,
    dataUpdatedAt: 1_713_526_800_000,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-query-refresh", () => ({
  useQueryRefresh: () => ({
    refresh: workspacePageState.refresh,
    isRefreshing: false,
  }),
}));

vi.mock("@/lib/message-read-state", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/message-read-state")
  >("@/lib/message-read-state");

  return {
    ...actual,
    markMessageAsRead: vi.fn(),
  };
});

afterEach(() => {
  workspacePageState.meta = demoMeta;
  workspacePageState.metaError = null;
  workspacePageState.mailboxes = demoMailboxes;
  workspacePageState.mailboxesError = null;
  workspacePageState.allMessages = demoMessages;
  workspacePageState.allMessagesError = null;
  workspacePageState.mailboxMessages = demoMessages.filter(
    (message) => message.mailboxId === "mbx_alpha",
  );
  workspacePageState.mailboxMessagesError = null;
  workspacePageState.detail = undefined;
  workspacePageState.detailError = null;
  workspacePageState.refresh = vi.fn();
  workspacePropsState.mailboxesError = null;
  workspacePropsState.visibleMailboxAddresses = [];
  workspacePropsState.mailboxScope = null;
  workspacePropsState.allMessagesScope = null;
  workspacePropsState.selectedMailboxIds = [];
  workspacePropsState.selectedMessagesScope = null;
  localStorageState.getItem = vi.fn(() => null);
  localStorageState.setItem = vi.fn();
});

describe("workspace page", () => {
  it("keeps the mailbox rail usable when only aggregate counts fail", () => {
    workspacePageState.allMessages = undefined;
    workspacePageState.allMessagesError = new Error("aggregate unavailable");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageState,
    });

    render(
      <MemoryRouter
        initialEntries={["/workspace?mailbox=mbx_alpha&sort=recent"]}
      >
        <Routes>
          <Route path="/workspace" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("workspace-rail-error")).toHaveTextContent(
      "no-mailboxes-error",
    );
    expect(
      screen.getByText("build@alpha.relay.example.test"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("spec@ops.beta.mail.example.net"),
    ).toBeInTheDocument();
  });

  it("uses workspace-scoped mailbox and message queries", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageState,
    });

    render(
      <MemoryRouter
        initialEntries={["/workspace?mailbox=mbx_alpha&sort=recent"]}
      >
        <Routes>
          <Route path="/workspace" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(workspacePropsState.mailboxScope).toBe("workspace");
    expect(workspacePropsState.allMessagesScope).toBe("workspace");
    expect(workspacePropsState.selectedMessagesScope).toBe("workspace");
    expect(workspacePropsState.selectedMailboxIds).toEqual(["mbx_alpha"]);
  });
});
