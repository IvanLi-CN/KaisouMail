import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { projectMeta } from "@/lib/project-meta";
import { demoSessionUser, demoVersion } from "@/mocks/data";

const renderAppShell = (props: Partial<ComponentProps<typeof AppShell>> = {}) =>
  render(
    <MemoryRouter initialEntries={["/workspace"]}>
      <AppShell
        user={demoSessionUser}
        version={demoVersion}
        onLogout={vi.fn()}
        {...props}
      >
        <section>
          <h1>Workspace overview</h1>
          <p>Messages and mailbox health</p>
        </section>
      </AppShell>
    </MemoryRouter>,
  );

const stubMatchMedia = (matches: boolean) => {
  const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  vi.stubGlobal("matchMedia", matchMediaMock);

  return matchMediaMock;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AppShell account trigger", () => {
  it("shows only the nickname in the header until preview is opened", () => {
    renderAppShell();

    const trigger = screen.getByRole("button", { name: demoSessionUser.name });

    expect(trigger).toBeInTheDocument();
    expect(screen.queryByText(demoSessionUser.email)).not.toBeInTheDocument();
    expect(screen.queryByText(/^admin$/i)).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger);

    expect(screen.getByText(demoSessionUser.email)).toBeInTheDocument();
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
  });

  it("supports focus preview plus pinned toggle and escape close", async () => {
    renderAppShell();

    const trigger = screen.getByRole("button", { name: demoSessionUser.name });

    fireEvent.focus(trigger);
    expect(screen.getByText(demoSessionUser.email)).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByText(demoSessionUser.email)).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(demoSessionUser.email)).toBeInTheDocument();

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
    expect(screen.queryByText(demoSessionUser.email)).not.toBeInTheDocument();
  });

  it("opens details via click on coarse pointers", async () => {
    const matchMediaMock = stubMatchMedia(true);

    renderAppShell();

    await waitFor(() => {
      expect(matchMediaMock).toHaveBeenCalled();
    });

    const trigger = screen.getByRole("button", { name: demoSessionUser.name });

    fireEvent.mouseEnter(trigger);
    expect(screen.queryByText(demoSessionUser.email)).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText(demoSessionUser.email)).toBeInTheDocument();
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
  });
});

describe("AppShell mobile navigation", () => {
  it("supports a controlled default-open mobile drawer state with user info inside", () => {
    renderAppShell({ defaultMobileNavOpen: true });

    const drawer = screen.getByRole("dialog", { name: "菜单" });
    const mobileNav = within(drawer).getByRole("navigation", {
      name: "移动主导航",
    });

    expect(drawer).toBeInTheDocument();
    expect(
      within(drawer).getAllByText(demoSessionUser.email).length,
    ).toBeGreaterThan(0);
    expect(within(drawer).getByText(/^admin$/i)).toBeInTheDocument();
    expect(
      within(mobileNav).getByRole("link", { name: /工作台/i }),
    ).toBeInTheDocument();
    expect(
      within(mobileNav).getByRole("link", { name: /用户/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "收起导航抽屉" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles the mobile drawer and exposes logout inside it", async () => {
    const onLogout = vi.fn();
    renderAppShell({ onLogout });

    const menuTrigger = screen.getByRole("button", { name: "打开导航抽屉" });
    fireEvent.click(menuTrigger);

    const drawer = screen.getByRole("dialog", { name: "菜单" });
    expect(drawer).toBeInTheDocument();
    expect(menuTrigger).toHaveAttribute("aria-expanded", "true");
    expect(
      within(drawer).getAllByText(demoSessionUser.email).length,
    ).toBeGreaterThan(0);

    fireEvent.click(within(drawer).getByRole("button", { name: "退出登录" }));
    expect(onLogout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "打开导航抽屉" }));
    expect(screen.getByRole("dialog", { name: "菜单" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭导航抽屉" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "菜单" }),
      ).not.toBeInTheDocument();
    });
  });
});

describe("AppShell footer metadata", () => {
  it("renders footer metadata links and removes duplicate runtime noise from the top bar", () => {
    const { container } = renderAppShell();

    expect(container.firstElementChild).toHaveClass(
      "flex",
      "min-h-screen",
      "flex-col",
    );
    expect(screen.getByRole("main")).toHaveClass("flex-1");

    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByText(projectMeta.projectName),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Manage inbox lifecycle, messages, and API access."),
    ).not.toBeInTheDocument();

    const repositoryLink = within(footer).getByRole("link", {
      name: projectMeta.repositoryLabel,
    });
    expect(repositoryLink).toHaveAttribute("href", projectMeta.repositoryUrl);
    expect(repositoryLink).toHaveAttribute("target", "_blank");
    expect(repositoryLink).toHaveAttribute("rel", "noreferrer");

    const developerLink = within(footer).getByRole("link", {
      name: projectMeta.developerName,
    });
    expect(developerLink).toHaveAttribute("href", projectMeta.developerUrl);
    expect(developerLink).toHaveAttribute("target", "_blank");
    expect(developerLink).toHaveAttribute("rel", "noreferrer");

    const versionLink = within(footer).getByRole("link", {
      name: `Version ${demoVersion.version}`,
    });
    expect(versionLink).toHaveAttribute("href", projectMeta.versionUrl);
    expect(versionLink).toHaveAttribute("target", "_blank");
    expect(versionLink).toHaveAttribute("rel", "noreferrer");

    expect(
      screen.queryByText(new RegExp(demoVersion.commitSha, "i")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(new RegExp(demoVersion.branch, "i")),
    ).not.toBeInTheDocument();
  });
});
