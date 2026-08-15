import { useState, useRef, type FormEvent, type ChangeEvent, type ClipboardEvent, lazy, Suspense } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SendHorizontal, Smile, Paperclip, X, Loader2 } from "lucide-react";
import { EmojiStyle, Theme, type EmojiClickData } from "emoji-picker-react";
import type { CustomEmoji, MediaType } from "../../shared/types";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadedMedia {
  url: string;
  type: MediaType;
}

interface ChatInputProps {
  onSend: (content: string, media?: UploadedMedia) => void;
  onUploadMedia: (
    file: File,
    onProgress: (pct: number) => void
  ) => { promise: Promise<UploadedMedia>; cancel: () => void };
  disabled: boolean;
  onRequestLogin?: () => void;
  customEmojis: CustomEmoji[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeToExt(mime: string): string {
  const ext: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/bmp": "bmp",
  };
  return ext[mime] ?? "png";
}

export function ChatInput({
  onSend,
  onUploadMedia,
  disabled,
  onRequestLogin,
  customEmojis,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelUploadRef = useRef<(() => void) | null>(null);

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

  const clearUpload = () => {
    cancelUploadRef.current = null;
    setSelectedFile(null);
    setUploadProgress(0);
    setUploading(false);
    setUploadedMedia(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startUpload = (file: File) => {
    setUploadError(null);
    setUploadedMedia(null);
    setUploadProgress(0);

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setUploadError("Only images and videos are allowed.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("File too large (max 10MB).");
      return;
    }

    setSelectedFile(file);
    setUploading(true);

    let handle: { promise: Promise<UploadedMedia>; cancel: () => void };
    try {
      handle = onUploadMedia(file, setUploadProgress);
    } catch (err) {
      setUploading(false);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      return;
    }
    const { promise, cancel } = handle;
    cancelUploadRef.current = cancel;
    promise
      .then((media) => {
        setUploadedMedia(media);
        setUploading(false);
      })
      .catch((err: Error) => {
        setUploading(false);
        if (err.message === "Upload cancelled") {
          setSelectedFile(null);
          setUploadProgress(0);
        } else {
          setUploadError(err.message || "Upload failed");
        }
      });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value so selecting the same file again re-triggers change
    e.target.value = "";
    if (!file) return;
    startUpload(file);
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (!blob) return;
        e.preventDefault();
        const name = blob.name || `pasted-${Date.now()}.${mimeToExt(blob.type)}`;
        startUpload(new File([blob], name, { type: blob.type }));
        return;
      }
    }
  };

  const cancelUpload = () => {
    cancelUploadRef.current?.();
    clearUpload();
  };

  const doSend = () => {
    if (uploading) return;
    const trimmed = value.trim();
    if (!trimmed && !uploadedMedia) return;
    onSend(trimmed, uploadedMedia ?? undefined);
    setValue("");
    clearUpload();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSend();
  };

  const canSend = !disabled && !uploading && (value.trim().length > 0 || Boolean(uploadedMedia));

  return (
    <form onSubmit={handleSubmit} className="border-t border-border">
      {uploadError && (
        <div className="px-2 pt-2">
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-destructive">
              {uploadError}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={clearUpload}
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      {uploading && selectedFile && (
        <div className="px-2 pt-2">
          <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-2 py-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">
                  {selectedFile.name} · {formatBytes(selectedFile.size)}
                </span>
                <span className="shrink-0 text-muted-foreground">{uploadProgress}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={cancelUpload}
              title="Cancel upload"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      {uploadedMedia && selectedFile && (
        <div className="px-2 pt-2">
          <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-2 py-2">
            {uploadedMedia.type === "video" ? (
              <video
                src={uploadedMedia.url}
                className="h-14 w-20 shrink-0 rounded object-cover"
                muted
                preload="metadata"
              />
            ) : (
              <img
                src={uploadedMedia.url}
                alt="attachment preview"
                className="h-14 w-20 shrink-0 rounded object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted-foreground">
                {selectedFile.name} · {formatBytes(selectedFile.size)}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs"
              onClick={cancelUpload}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 text-xs"
              onClick={doSend}
              disabled={!canSend}
            >
              Send
            </Button>
          </div>
        </div>
      )}
      <div className="flex gap-1.5 p-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          title="Attach image or video (max 10MB) — or paste an image from clipboard"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              onRequestLogin?.();
              return;
            }
            fileInputRef.current?.click();
          }}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div className="flex-1" onClick={() => { if (disabled) onRequestLogin?.(); }}>
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPaste={handlePaste}
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
          disabled={!canSend}
          title={uploading ? "Upload in progress…" : "Send"}
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
