const noAutofillDataAttributes = {
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
  "data-lpignore": "true",
  "data-protonpass-ignore": "true",
} as const;

export const noAutofillAttributes = (autoComplete = "off") => ({
  autoComplete,
  ...noAutofillDataAttributes,
});

export const applyNoAutofillAttributes = (
  element: HTMLInputElement,
  autoComplete = "off",
) => {
  element.setAttribute("autocomplete", autoComplete);
  for (const [name, value] of Object.entries(noAutofillDataAttributes)) {
    element.setAttribute(name, value);
  }
};
