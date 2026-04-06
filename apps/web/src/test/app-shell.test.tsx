import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { projectMeta } from "@/lib/project-meta";
import { demoSessionUser, demoVersion } from "@/mocks/data";

describe("AppShell", () => {
  it("renders footer metadata links and removes duplicate runtime noise from the top bar", () => {
    const { container } = render(
      <MemoryRouter>
        <AppShell
          user={demoSessionUser}
          version={demoVersion}
          onLogout={vi.fn()}
        >
          <div>Short content</div>
        </AppShell>
      </MemoryRouter>,
    );

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
