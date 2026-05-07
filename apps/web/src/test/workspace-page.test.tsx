import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api";
import { demoMailboxes, demoMessages, demoMeta } from "@/mocks/data";
import { WorkspacePage } from "@/pages/workspace-page";

const workspacePageState: {
  meta: typeof demoMeta | undefined;
  metaError: Error | null;
  mailboxes: typeof demoMailboxes | undefined;
  expiredMailboxes: typeof demoMailboxes | undefined;
  mailboxesError: Error | null;
  allMessages: typeof demoMessages | undefined;
  allMessagesError: Error | null;
  mailboxMessages: typeof demoMessages | undefined;
  mailboxMessagesError: Error | null;
  mailboxMessagesIsFetching: boolean;
  detail: unknown;
  detailError: Error | null;
  createMailbox: ReturnType<typeof vi.fn>;
  ensureMailbox: ReturnType<typeof vi.fn>;
  resetMailboxTtl: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
} = {
  meta: demoMeta,
  metaError: null,
  mailboxes: demoMailboxes,
  expiredMailboxes: [
    {
      ...demoMailboxes[0],
      id: "mbx_expired",
      address: "expired@trash.example.test",
      status: "expired",
    },
  ],
  mailboxesError: null,
  allMessages: demoMessages,
  allMessagesError: null,
  mailboxMessages: demoMessages.filter(
    (message) => message.mailboxId === "mbx_alpha",
  ),
  mailboxMessagesError: null,
  mailboxMessagesIsFetching: false,
  detail: undefined,
  detailError: null,
  createMailbox: vi.fn(),
  ensureMailbox: vi.fn(),
  resetMailboxTtl: vi.fn(),
  refresh: vi.fn(),
};

const workspacePropsState = {
  createMailboxAction: null as null | {
    onSubmit: (values: {
      localPart?: string;
      subdomain?: string;
      rootDomain?: string;
      expiresInMinutes: number | null;
    }) => Promise<void>;
  },
  updateMailboxTtlAction: null as null | {
    onSubmit: (
      mailbox: { id: string },
      expiresInMinutes: number | null,
    ) => Promise<void>;
  },
  mailboxPrompt: null as null | { mailboxId: string; content: ReactNode },
  mailboxesError: null as null | { title: string },
  visibleMailboxAddresses: [] as string[],
  mailboxLatestVerificationCodes: new Map<string, string>(),
  mailboxMessageCounts: new Map<string, number>(),
  mailboxScope: null as string | null,
  allMessagesScope: null as string | null,
  allMessagesMailboxStatuses: [] as string[],
  selectedMailboxIds: [] as string[],
  selectedMailboxPropId: null as string | null,
  selectedMailboxResolvedId: null as string | null,
  selectedMessagesScope: null as string | null,
  renderedMessages: [] as Array<{ id: string; mailboxId: string }>,
};
const localStorageState = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
};

vi.mock("@/components/workspace/mail-workspace", () => ({
  MailWorkspace: (props: {
    createMailboxAction: {
      onSubmit: (values: {
        localPart?: string;
        subdomain?: string;
        rootDomain?: string;
        expiresInMinutes: number | null;
      }) => Promise<void>;
    };
    updateMailboxTtlAction: {
      onSubmit: (
        mailbox: { id: string },
        expiresInMinutes: number | null,
      ) => Promise<void>;
    };
    mailboxPrompt?: { mailboxId: string; content: ReactNode } | null;
    mailboxesError?: { title: string } | null;
    visibleMailboxes: Array<{ address: string }>;
    mailboxMessageCounts: Map<string, number>;
    mailboxLatestVerificationCodes: Map<string, string>;
    selectedMailboxId: string;
    selectedMailbox: { id: string } | null;
    messages: Array<{ id: string; mailboxId: string }>;
  }) => {
    workspacePropsState.createMailboxAction = props.createMailboxAction;
    workspacePropsState.updateMailboxTtlAction = props.updateMailboxTtlAction;
    workspacePropsState.mailboxPrompt = props.mailboxPrompt ?? null;
    workspacePropsState.mailboxesError = props.mailboxesError ?? null;
    workspacePropsState.visibleMailboxAddresses = props.visibleMailboxes.map(
      (mailbox) => mailbox.address,
    );
    workspacePropsState.mailboxMessageCounts = props.mailboxMessageCounts;
    workspacePropsState.mailboxLatestVerificationCodes =
      props.mailboxLatestVerificationCodes;
    workspacePropsState.selectedMailboxPropId = props.selectedMailboxId;
    workspacePropsState.selectedMailboxResolvedId =
      props.selectedMailbox?.id ?? null;
    workspacePropsState.renderedMessages = props.messages;

    return (
      <div>
        <div data-testid="workspace-rail-error">
          {props.mailboxesError?.title ?? "no-mailboxes-error"}
        </div>
        <div data-testid="workspace-mailbox-prompt">
          {props.mailboxPrompt?.mailboxId ?? "no-prompt"}
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
  useMailboxesQuery: (options?: { scope?: string; status?: string }) => {
    if (options?.scope === "workspace") {
      workspacePropsState.mailboxScope = options.scope;
    }
    return {
      data:
        options?.status === "expired"
          ? workspacePageState.expiredMailboxes
          : workspacePageState.mailboxes,
      error: workspacePageState.mailboxesError,
      isLoading: false,
      isFetching: false,
      dataUpdatedAt: 1_713_526_800_000,
    };
  },
  useCreateMailboxMutation: () => ({
    isPending: false,
    mutateAsync: workspacePageState.createMailbox,
  }),
  useEnsureMailboxMutation: () => ({
    isPending: false,
    mutateAsync: workspacePageState.ensureMailbox,
  }),
  useResetMailboxTtlMutation: () => ({
    isPending: false,
    mutateAsync: workspacePageState.resetMailboxTtl,
  }),
  useDestroyMailboxMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
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
    options?: {
      enabled?: boolean;
      mailboxIds?: string[];
      mailboxStatuses?: string[];
      scope?: string;
    },
  ) => {
    if (options?.enabled === false) {
      return {
        data: undefined,
        error: null,
        isLoading: false,
        isFetching: false,
        dataUpdatedAt: 0,
      };
    }

    if ((options?.mailboxIds?.length ?? 0) > 0) {
      workspacePropsState.selectedMessagesScope = options?.scope ?? "default";
      workspacePropsState.selectedMailboxIds = options?.mailboxIds ?? [];
      return {
        data: workspacePageState.mailboxMessages,
        error: workspacePageState.mailboxMessagesError,
        isLoading: false,
        isFetching: workspacePageState.mailboxMessagesIsFetching,
        dataUpdatedAt: 1_713_526_800_000,
      };
    }

    if (mailboxes.length === 0) {
      workspacePropsState.allMessagesScope = options?.scope ?? "default";
      workspacePropsState.allMessagesMailboxStatuses =
        options?.mailboxStatuses ?? [];
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
      isFetching: workspacePageState.mailboxMessagesIsFetching,
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
  workspacePageState.expiredMailboxes = [
    {
      ...demoMailboxes[0],
      id: "mbx_expired",
      address: "expired@trash.example.test",
      status: "expired",
    },
  ];
  workspacePageState.mailboxesError = null;
  workspacePageState.allMessages = demoMessages;
  workspacePageState.allMessagesError = null;
  workspacePageState.mailboxMessages = demoMessages.filter(
    (message) => message.mailboxId === "mbx_alpha",
  );
  workspacePageState.mailboxMessagesError = null;
  workspacePageState.mailboxMessagesIsFetching = false;
  workspacePageState.detail = undefined;
  workspacePageState.detailError = null;
  workspacePageState.createMailbox = vi.fn();
  workspacePageState.ensureMailbox = vi.fn();
  workspacePageState.resetMailboxTtl = vi.fn();
  workspacePageState.refresh = vi.fn();
  workspacePropsState.createMailboxAction = null;
  workspacePropsState.updateMailboxTtlAction = null;
  workspacePropsState.mailboxPrompt = null;
  workspacePropsState.mailboxesError = null;
  workspacePropsState.visibleMailboxAddresses = [];
  workspacePropsState.mailboxMessageCounts = new Map();
  workspacePropsState.mailboxLatestVerificationCodes = new Map();
  workspacePropsState.mailboxScope = null;
  workspacePropsState.allMessagesScope = null;
  workspacePropsState.allMessagesMailboxStatuses = [];
  workspacePropsState.selectedMailboxIds = [];
  workspacePropsState.selectedMailboxPropId = null;
  workspacePropsState.selectedMailboxResolvedId = null;
  workspacePropsState.selectedMessagesScope = null;
  workspacePropsState.renderedMessages = [];
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
      <MemoryRouter initialEntries={["/workspace?mailbox=all&sort=recent"]}>
        <Routes>
          <Route path="/workspace" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(workspacePropsState.mailboxScope).toBe("workspace");
    expect(workspacePropsState.allMessagesScope).toBe("workspace");
  });

  it("keeps selected mailbox messages scoped to the selected mailbox", () => {
    workspacePageState.mailboxMessages = [
      ...demoMessages.filter((message) => message.mailboxId === "mbx_alpha"),
      {
        ...demoMessages[1],
        id: "msg_stale_beta",
        mailboxId: "mbx_beta",
      },
    ];
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

    expect(workspacePropsState.selectedMailboxPropId).toBe("mbx_alpha");
    expect(workspacePropsState.selectedMailboxResolvedId).toBe("mbx_alpha");
    expect(workspacePropsState.renderedMessages.length).toBeGreaterThan(0);
    expect(
      workspacePropsState.renderedMessages.map((message) => message.mailboxId),
    ).toEqual(["mbx_alpha"]);
  });

  it("keeps rail metadata backed by aggregate messages while a mailbox is selected", () => {
    workspacePageState.allMessages = [
      ...demoMessages,
      {
        ...demoMessages[1],
        id: "msg_beta_newer",
        mailboxId: "mbx_beta",
        receivedAt: "2026-04-02T09:45:00.000Z",
        verification: {
          code: "772244",
          source: "subject",
          method: "ai",
        },
      },
    ];
    workspacePageState.mailboxMessages = demoMessages.filter(
      (message) => message.mailboxId === "mbx_alpha",
    );
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

    expect(
      workspacePropsState.renderedMessages.every(
        (message) => message.mailboxId === "mbx_alpha",
      ),
    ).toBe(true);
    expect(workspacePropsState.mailboxMessageCounts.get("mbx_beta")).toBe(2);
    expect(
      workspacePropsState.mailboxLatestVerificationCodes.get("mbx_beta"),
    ).toBe("772244");
  });

  it("keeps selected mailbox loading fallback scoped to the selected mailbox", () => {
    workspacePageState.mailboxMessages = undefined;
    workspacePageState.mailboxMessagesIsFetching = true;
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

    expect(workspacePropsState.renderedMessages.length).toBeGreaterThan(0);
    expect(
      workspacePropsState.renderedMessages.every(
        (message) => message.mailboxId === "mbx_alpha",
      ),
    ).toBe(true);
  });

  it("treats empty selected mailbox results as authoritative", () => {
    workspacePageState.mailboxMessages = [];
    workspacePageState.mailboxMessagesIsFetching = false;
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

    expect(workspacePropsState.renderedMessages).toEqual([]);
  });

  it("uses a server-side mailbox status filter for trash aggregate messages", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageState,
    });

    render(
      <MemoryRouter
        initialEntries={["/workspace?view=trash&mailbox=all&sort=recent"]}
      >
        <Routes>
          <Route path="/workspace" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(workspacePropsState.allMessagesScope).toBe("default");
    expect(workspacePropsState.allMessagesMailboxStatuses).toEqual(["expired"]);
    expect(workspacePropsState.selectedMailboxIds).toEqual([]);
  });

  it("derives the latest verification code for each mailbox from aggregate messages", () => {
    workspacePageState.allMessages = [
      ...demoMessages,
      {
        ...demoMessages[0],
        id: "msg_alpha_newer",
        receivedAt: "2026-04-02T08:45:00.000Z",
        verification: {
          code: "551177",
          source: "subject",
          method: "ai",
        },
      },
    ];
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageState,
    });

    render(
      <MemoryRouter initialEntries={["/workspace?mailbox=all&sort=recent"]}>
        <Routes>
          <Route path="/workspace" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      workspacePropsState.mailboxLatestVerificationCodes.get("mbx_alpha"),
    ).toBe("551177");
  });

  it("selects the existing mailbox and opens the extension prompt on create conflict", async () => {
    const existingMailbox = demoMailboxes[1];
    if (!existingMailbox) {
      throw new Error("expected mailbox fixture");
    }

    workspacePageState.createMailbox.mockRejectedValue(
      new ApiClientError(
        "Mailbox already exists",
        {
          code: "mailbox_exists",
          mailbox: existingMailbox,
        },
        409,
      ),
    );
    workspacePageState.ensureMailbox.mockResolvedValue({
      ...existingMailbox,
      expiresAt: null,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageState,
    });

    render(
      <MemoryRouter initialEntries={["/workspace?mailbox=all&sort=recent"]}>
        <Routes>
          <Route path="/workspace" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    if (!workspacePropsState.createMailboxAction) {
      throw new Error("expected create mailbox action");
    }

    await workspacePropsState.createMailboxAction.onSubmit({
      localPart: existingMailbox.localPart,
      subdomain: existingMailbox.subdomain,
      rootDomain: existingMailbox.rootDomain,
      expiresInMinutes: demoMeta.defaultMailboxTtlMinutes,
    });

    await waitFor(() => {
      expect(screen.getByTestId("workspace-mailbox-prompt")).toHaveTextContent(
        existingMailbox.id,
      );
    });

    expect(workspacePropsState.mailboxPrompt?.mailboxId).toBe(
      existingMailbox.id,
    );
    expect(screen.getByText(existingMailbox.address)).toBeInTheDocument();
  });

  it("selects a newly created mailbox after workspace creation", async () => {
    const createdMailbox = {
      ...demoMailboxes[0],
      id: "mbx_created",
      address: "created@alpha.relay.example.test",
      localPart: "created",
      expiresAt: "2026-04-02T08:05:00.000Z",
    };
    workspacePageState.createMailbox.mockResolvedValue(createdMailbox);
    workspacePageState.mailboxes = [createdMailbox, ...demoMailboxes];
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageState,
    });

    render(
      <MemoryRouter initialEntries={["/workspace?mailbox=all&q=old"]}>
        <Routes>
          <Route path="/workspace" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    if (!workspacePropsState.createMailboxAction) {
      throw new Error("expected create mailbox action");
    }

    await workspacePropsState.createMailboxAction.onSubmit({
      localPart: "created",
      subdomain: "alpha",
      rootDomain: "relay.example.test",
      expiresInMinutes: demoMeta.defaultMailboxTtlMinutes,
    });

    await waitFor(() => {
      expect(workspacePropsState.selectedMailboxIds).toEqual(["mbx_created"]);
    });
    expect(screen.getByText(createdMailbox.address)).toBeInTheDocument();
  });

  it("submits current mailbox TTL resets from the workspace action", async () => {
    const selectedMailbox = demoMailboxes[0];
    workspacePageState.resetMailboxTtl.mockResolvedValue({
      ...selectedMailbox,
      expiresAt: "2026-04-02T10:05:00.000Z",
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageState,
    });

    render(
      <MemoryRouter
        initialEntries={[
          "/workspace?mailbox=mbx_alpha&message=msg_alpha&sort=recent",
        ]}
      >
        <Routes>
          <Route
            path="/workspace"
            element={
              <>
                <WorkspacePage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    if (!workspacePropsState.updateMailboxTtlAction) {
      throw new Error("expected ttl action");
    }

    await workspacePropsState.updateMailboxTtlAction.onSubmit(
      selectedMailbox,
      120,
    );

    expect(workspacePageState.resetMailboxTtl).toHaveBeenCalledWith({
      mailboxId: "mbx_alpha",
      expiresInMinutes: 120,
    });
    await waitFor(() => {
      expect(screen.getByTestId("location-search")).toHaveTextContent(
        "message=msg_alpha",
      );
    });
  });
});
