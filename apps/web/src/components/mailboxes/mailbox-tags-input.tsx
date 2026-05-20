import { maxMailboxTags } from "@kaisoumail/shared";
import { X } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useMemo,
  useState,
} from "react";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { parseMailboxTagInput } from "@/lib/mailbox-tags";
import { cn } from "@/lib/utils";

type MailboxTagsInputProps = {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: string[];
  className?: string;
  "aria-label"?: string;
};

const mergeMailboxTags = (currentTags: string[], rawValue: string) => {
  const nextTags = [...currentTags];
  for (const tag of parseMailboxTagInput(rawValue)) {
    if (nextTags.length >= maxMailboxTags) break;
    if (!nextTags.includes(tag)) {
      nextTags.push(tag);
    }
  }
  return nextTags;
};

export const MailboxTagsInput = ({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = "输入 tag 后按 Enter 添加",
  suggestions = [],
  className,
  "aria-label": ariaLabel,
}: MailboxTagsInputProps) => {
  const [draft, setDraft] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const normalizedTags = useMemo(
    () => mergeMailboxTags([], value.join(" ")),
    [value],
  );
  const suggestionOptions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    return mergeMailboxTags([], suggestions.join(" "))
      .filter((tag) => !normalizedTags.includes(tag))
      .filter((tag) => !query || tag.includes(query))
      .slice(0, 8);
  }, [draft, normalizedTags, suggestions]);
  const showSuggestions =
    isFocused && !disabled && suggestionOptions.length > 0;

  const commitDraft = (rawValue = draft) => {
    const nextTags = mergeMailboxTags(normalizedTags, rawValue);
    if (nextTags.length !== normalizedTags.length) {
      onChange(nextTags);
    }
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(normalizedTags.filter((currentTag) => currentTag !== tag));
  };

  const addTag = (tag: string) => {
    const nextTags = mergeMailboxTags(normalizedTags, tag);
    if (nextTags.length !== normalizedTags.length) {
      onChange(nextTags);
    }
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === " ") {
      if (draft.trim()) {
        event.preventDefault();
        commitDraft();
      }
      return;
    }

    if (event.key === "Backspace" && !draft && normalizedTags.length > 0) {
      event.preventDefault();
      onChange(normalizedTags.slice(0, -1));
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData("text");
    if (!/[,\s]/.test(pastedText)) return;
    event.preventDefault();
    commitDraft(`${draft} ${pastedText}`);
  };

  return (
    <Popover open={showSuggestions}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-muted/40 px-2 py-1.5 text-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
            disabled && "cursor-not-allowed opacity-60",
            className,
          )}
        >
          {normalizedTags.map((tag) => (
            <span
              className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 text-xs font-semibold text-primary"
              key={tag}
            >
              <span className="truncate">{tag}</span>
              <button
                aria-label={`移除 Tag ${tag}`}
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-primary/75 transition hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                disabled={disabled}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  removeTag(tag);
                }}
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
          <input
            aria-autocomplete="list"
            aria-controls={id ? `${id}-suggestions` : undefined}
            aria-expanded={showSuggestions}
            aria-label={ariaLabel}
            autoComplete="new-password"
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            disabled={disabled}
            id={id}
            name={id ? `${id}-tag-token` : "mailbox-tag-token"}
            placeholder={normalizedTags.length > 0 ? "" : placeholder}
            role="combobox"
            spellCheck={false}
            value={draft}
            onBlur={() => {
              setIsFocused(false);
              if (draft.trim()) {
                commitDraft();
              }
            }}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] rounded-xl p-1"
        hideArrow
        id={id ? `${id}-suggestions` : undefined}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandGroup className="[&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-wrap [&_[cmdk-group-items]]:gap-1.5">
              {suggestionOptions.map((tag) => (
                <CommandItem
                  aria-label={`添加 Tag ${tag}`}
                  className="h-7 w-fit max-w-full rounded-full border border-border bg-muted/60 px-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary data-[selected=true]:border-primary/40 data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"
                  key={tag}
                  value={tag}
                  onMouseDown={(event) => event.preventDefault()}
                  onSelect={() => addTag(tag)}
                >
                  {tag}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
