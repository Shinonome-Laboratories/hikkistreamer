import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "../../shared/types";

interface CustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSave: (data: {
    avatar_url?: string | null;
    username_color?: string;
    message_color?: string;
  }) => void;
}

function CustomizeForm({
  user,
  onSave,
  onClose,
}: {
  user: User;
  onSave: CustomizeModalProps["onSave"];
  onClose: () => void;
}) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || "");
  const [usernameColor, setUsernameColor] = useState(user.username_color);
  const [messageColor, setMessageColor] = useState(user.message_color);

  const initials = user.username.slice(0, 2).toUpperCase();

  const handleSave = () => {
    onSave({
      avatar_url: avatarUrl || null,
      username_color: usernameColor,
      message_color: messageColor,
    });
    onClose();
  };

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/30">
        <Avatar className="h-8 w-8">
          {avatarUrl && <AvatarImage src={avatarUrl} />}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
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

      <div className="space-y-1.5">
        <Label className="text-xs">Avatar URL</Label>
        <Input
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://example.com/avatar.png"
          className="h-8 text-sm"
        />
      </div>

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

      <Button onClick={handleSave} className="w-full h-8 text-sm">
        Save
      </Button>
    </div>
  );
}

export function CustomizeModal({
  open,
  onOpenChange,
  user,
  onSave,
}: CustomizeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Customize</DialogTitle>
        </DialogHeader>
        <CustomizeForm
          key={`${user.avatar_url}-${user.username_color}-${user.message_color}`}
          user={user}
          onSave={onSave}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
