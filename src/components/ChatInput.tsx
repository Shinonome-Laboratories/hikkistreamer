import { useState, useRef, type FormEvent, lazy, Suspense } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SendHorizontal, Smile } from "lucide-react";
import { EmojiStyle, Theme, type EmojiClickData } from "emoji-picker-react";
import type { CustomEmoji } from "../../shared/types";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  onRequestLogin?: () => void;
  customEmojis: CustomEmoji[];
}

export function ChatInput({ onSend, disabled, onRequestLogin, customEmojis }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const insertText = (text: string) => {
    const input = inputRef.current;
    if (!input) {
      setValue((v) => v + text);
      return;
    }
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const newValue = value.substring(0, start) + text + value.substring(end);
    setValue(newValue);
    setTimeout(() => {
      input.selectionStart = start + text.length;
      input.selectionEnd = start + text.length;
      input.focus();
    }, 0);
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    if (emojiData.isCustom) {
      const original = customEmojis.find(
        (e) => e.name.toLowerCase() === emojiData.unified.toLowerCase()
      );
      insertText(`:${original?.name ?? emojiData.unified}:`);
    } else {
      insertText(emojiData.emoji);
    }
    setPickerOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const customEmojisList = customEmojis.map((e) => ({
    id: e.name,
    names: [e.name],
    imgUrl: e.url,
  }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-1.5 p-2 border-t border-border">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
      <div className="flex-1" onClick={() => { if (disabled) onRequestLogin?.(); }}>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={disabled ? "Login to chat..." : "Type a message..."}
          disabled={disabled}
          maxLength={500}
          className="h-8 text-sm bg-secondary/50"
          autoComplete="off"
        />
      </div>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              title="Emoji picker"
            />
          }
          disabled={disabled}
        >
          <Smile className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="p-0 border-0 shadow-none bg-transparent w-auto"
        >
          <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Loading…</div>}>
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              customEmojis={customEmojisList}
              emojiStyle={EmojiStyle.TWITTER}
              theme={Theme.DARK}
              skinTonesDisabled
              searchPlaceholder="Search emojis…"
              height={380}
              width={320}
            />
          </Suspense>
        </PopoverContent>
      </Popover>
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        disabled={disabled || !value.trim()}
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </form>
  );
}
