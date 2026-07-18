export const AUTH_NAVIGATION_DWELL_MS = 200;

export const waitForAuthNavigationDwell = () =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, AUTH_NAVIGATION_DWELL_MS);
  });

export const handOffAuthNavigation = async (performNavigation: () => void) => {
  await waitForAuthNavigationDwell();
  performNavigation();
  return new Promise<void>(() => undefined);
};
