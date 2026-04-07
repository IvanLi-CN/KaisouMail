import { useEffect, useState } from "react";

const getInitialMatch = (query: string) => {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }

  return window.matchMedia(query).matches;
};

export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => getInitialMatch(query));

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const syncMatches = () => setMatches(mediaQuery.matches);

    syncMatches();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMatches);

      return () => {
        mediaQuery.removeEventListener("change", syncMatches);
      };
    }

    mediaQuery.addListener(syncMatches);

    return () => {
      mediaQuery.removeListener(syncMatches);
    };
  }, [query]);

  return matches;
};
