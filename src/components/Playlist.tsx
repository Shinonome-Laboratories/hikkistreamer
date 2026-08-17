import { useState } from "react";
import { PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ListMusic,
  Play,
  Trash2,
  Pin,
  Plus,
  Radio,
  AlertCircle,
} from "lucide-react";
import type { PlaylistItem } from "../../shared/types";

interface PlaylistProps {
  items: PlaylistItem[];
  activeItem: PlaylistItem | null;
  isAdmin: boolean;
  error: string | null;
  onAdd: (data: { source: string; label?: string; channel?: string }) => void;
  onRemove: (id: string) => void;
  onSwitch: (id: string) => void;
}

/**
 * The playlist popover panel (anchored to the footer's playlist button).
 * Lists all items, highlights the active one, and lets admins add/remove/switch
 * Twitch streams. The hikkistream item is sticky and cannot be removed.
 */
export function Playlist({
  items,
  activeItem,
  isAdmin,
  error,
  onAdd,
  onRemove,
  onSwitch,
}: PlaylistProps) {
  const [channelInput, setChannelInput] = useState("");

  const handleAdd = () => {
    const value = channelInput.trim();
    if (!value) return;
    onAdd({ source: "twitch", channel: value });
    setChannelInput("");
  };

  return (
    <PopoverContent side="top" align="end" className="w-80">
      <div className="flex items-center gap-1.5 px-0.5">
        <ListMusic className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Playlist</h3>
        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">
          {items.length}
        </Badge>
      </div>

      <ScrollArea className="max-h-64">
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const isActive = activeItem?.id === item.id;
            const isSticky = item.source === "hikkistream";
            return (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  isActive ? "bg-primary/10 ring-1 ring-primary/30" : "bg-secondary/30"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">
                      {item.label}
                    </span>
                    {isActive && <Radio className="h-3 w-3 text-red-500 shrink-0" />}
                    {isSticky && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 h-3.5 gap-0.5 shrink-0"
                      >
                        <Pin className="h-2.5 w-2.5" />
                        sticky
                      </Badge>
                    )}
                  </div>
                  {!isSticky && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      twitch.tv/{item.channel ?? item.label}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {!isActive && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6"
                      onClick={() => onSwitch(item.id)}
                      title={`Play ${item.label}`}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  )}
                  {isAdmin && !isSticky && !isActive && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(item.id)}
                      title="Remove from playlist"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive px-0.5">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}

      {isAdmin && (
        <div className="space-y-1.5 border-t border-border pt-2">
          <Label className="text-xs">Add Twitch stream</Label>
          <div className="flex gap-1.5">
            <Input
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              className="h-7 text-xs flex-1"
              placeholder="Channel name or twitch.tv URL"
              maxLength={100}
            />
            <Button
              size="sm"
              className="h-7 gap-1"
              onClick={handleAdd}
              disabled={!channelInput.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      )}
    </PopoverContent>
  );
}
