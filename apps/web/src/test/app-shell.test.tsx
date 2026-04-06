import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { demoSessionUser, demoVersion } from "@/mocks/data";

const renderAppShell = () =>
  render(
    <MemoryRouter initialEntries={["/workspace"]}>
      <AppShell user={demoSessionUser} version={demoVersion} onLogout={vi.fn()}>
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
