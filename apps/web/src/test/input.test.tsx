import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";

const expectNoAutofillAttributes = (input: HTMLElement) => {
  expect(input).toHaveAttribute("autocomplete", "off");
  expect(input).toHaveAttribute("data-1p-ignore", "true");
  expect(input).toHaveAttribute("data-bwignore", "true");
  expect(input).toHaveAttribute("data-form-type", "other");
  expect(input).toHaveAttribute("data-lpignore", "true");
  expect(input).toHaveAttribute("data-protonpass-ignore", "true");
};

describe("Input", () => {
  it("disables browser and password-manager autofill by default", () => {
    render(<Input aria-label="Search" />);

    expectNoAutofillAttributes(screen.getByLabelText("Search"));
  });

  it("allows explicit autofill opt-in", () => {
    render(<Input allowAutoFill aria-label="Email" autoComplete="email" />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(input).not.toHaveAttribute("data-1p-ignore");
    expect(input).not.toHaveAttribute("data-bwignore");
    expect(input).not.toHaveAttribute("data-lpignore");
  });
});
