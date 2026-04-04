import { useEffect, useState } from "react";

const readDocumentVisibility = () => {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
};

const readOnlineStatus = () => {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
};

export const usePageActivity = () => {
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    readDocumentVisibility,
  );
  const [isOnline, setIsOnline] = useState(readOnlineStatus);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const handleVisibilityChange = () =>
      setIsDocumentVisible(readDocumentVisibility());
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isDocumentVisible, isOnline };
};
