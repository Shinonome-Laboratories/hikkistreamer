import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import type { User } from "../../shared/types";

interface CustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSave: (data: { username_color?: string; message_color?: string }) => void;
  onUploadAvatar: (dataUrl: string) => Promise<void>;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CustomizeForm({
  user,
  onSave,
  onUploadAvatar,
  onClose,
}: {
  user: User;
  onSave: CustomizeModalProps["onSave"];
  onUploadAvatar: CustomizeModalProps["onUploadAvatar"];
  onClose: () => void;
}) {
  const [usernameColor, setUsernameColor] = useState(user.username_color);
  const [messageColor, setMessageColor] = useState(user.message_color);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
      setUploadError("Unsupported format. Use jpeg, png, gif, or webp.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setUploadError("Image too large (max 2MB after processing).");
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setUploading(true);
    setUploadError(null);
    try {
      if (avatarFile) {
        const dataUrl = await readFileAsDataUrl(avatarFile);
        await onUploadAvatar(dataUrl);
      }
      onSave({ username_color: usernameColor, message_color: messageColor });
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  const previewSrc = avatarPreview ?? user.avatar_url ?? undefined;

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/30">
        <Avatar className="h-8 w-8">
          {previewSrc && <AvatarImage src={previewSrc} />}
        </Avatar>
        <div>
          <span className="text-sm font-semibold" style={{ color: usernameColor }}>
            {user.username}
          </span>{" "}
          <span className="text-sm" style={{ color: messageColor }}>
            Hello, world!
          </span>
        </div>
      </div>

      {/* Avatar upload — guests cannot upload */}
      {user.is_guest ? (
        <p className="text-xs text-muted-foreground">
          Guests cannot upload avatars. Register an account to set an avatar.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Avatar</Label>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {avatarFile ? "Change…" : "Upload Avatar"}
            </Button>
            {avatarFile && (
              <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                {avatarFile.name}
              </span>
            )}
          </div>
          {uploadError && (
            <p className="text-xs text-destructive">{uploadError}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Username Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={usernameColor}
              onChange={(e) => setUsernameColor(e.target.value)}
              className="h-8 w-8 rounded cursor-pointer border border-border bg-transparent"
            />
            <Input
              value={usernameColor}
              onChange={(e) => setUsernameColor(e.target.value)}
              className="h-8 text-sm font-mono"
              maxLength={7}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Message Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={messageColor}
              onChange={(e) => setMessageColor(e.target.value)}
              className="h-8 w-8 rounded cursor-pointer border border-border bg-transparent"
            />
            <Input
              value={messageColor}
              onChange={(e) => setMessageColor(e.target.value)}
              className="h-8 text-sm font-mono"
              maxLength={7}
            />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} className="w-full h-8 text-sm" disabled={uploading}>
        {uploading ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

export function CustomizeModal({
  open,
  onOpenChange,
  user,
  onSave,
  onUploadAvatar,
}: CustomizeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Customize</DialogTitle>
        </DialogHeader>
        <CustomizeForm
          key={`${user.username_color}-${user.message_color}`}
          user={user}
          onSave={onSave}
          onUploadAvatar={onUploadAvatar}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
