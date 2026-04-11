const fallbackCopyText = async (value: string) => {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();

  const copied =
    typeof document.execCommand === "function" && document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard unavailable");
  }
};

export const writeClipboardText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the legacy execCommand path for insecure origins,
      // denied clipboard permissions, or embedded browser environments.
    }
  }

  await fallbackCopyText(value);
};
