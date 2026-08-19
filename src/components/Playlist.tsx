import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
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
  PlaySquare,
  GripVertical,
} from "lucide-react";
import type { PlaylistItem } from "../../shared/types";

interface PlaylistProps {
  items: PlaylistItem[];
  activeItem: PlaylistItem | null;
  /** Staff (admin or moderator) can add/remove/reorder streams. */
  canManage: boolean;
  error: string | null;
  onAdd: (data: {
    source: string;
    label?: string;
    channel?: string;
    url?: string;
  }) => void;
  onRemove: (id: string) => void;
  onSwitch: (id: string) => void;
  /** Move an item to a new 0-based queue position. */
  onReorder: (id: string, position: number) => void;
}

interface PlaylistRowProps {
  item: PlaylistItem;
  index: number;
  isActive: boolean;
  canManage: boolean;
  onSwitch: (id: string) => void;
  onRemove: (id: string) => void;
}

/** A single sortable playlist row with queue number and optional drag handle. */
function PlaylistRow({
  item,
  index,
  isActive,
  canManage,
  onSwitch,
  onRemove,
}: PlaylistRowProps) {
  const isSticky = item.source === "hikkistream";
  const isYoutube = item.source === "youtube";
  const youtubeId = item.youtube_id ?? item.label;
  const canDrag = canManage && !isSticky;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canDrag });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
          : undefined,
        transition,
        zIndex: isDragging ? 40 : undefined,
      }}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm ${
        isActive ? "bg-primary/10 ring-1 ring-primary/30" : "bg-secondary/30"
      } ${isDragging ? "opacity-90 shadow-md" : ""}`}
    >
      <span className="w-4 shrink-0 text-center text-[10px] font-medium tabular-nums text-muted-foreground/70">
        {index + 1}
      </span>

      {canDrag && (
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          title="Drag to reorder"
          aria-label={`Reorder ${item.label}`}
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 hover:text-foreground active:cursor-grabbing shrink-0"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {isYoutube && (
        <img
          src={`https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`}
          alt=""
          className="h-7 w-11 shrink-0 rounded object-cover bg-black/40"
          loading="lazy"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isSticky && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-3.5 gap-0.5 shrink-0"
            >
              <Pin className="h-2.5 w-2.5" />
              sticky
            </Badge>
          )}
          <span className="truncate font-medium text-foreground">
            {item.label}
          </span>
          {isActive && <Radio className="h-3 w-3 text-red-500 shrink-0" />}
          {isYoutube && (
            <PlaySquare className="h-3 w-3 text-red-500 shrink-0" />
          )}
        </div>
        {!isSticky && (
          <p className="text-[10px] text-muted-foreground truncate">
            {isYoutube
              ? `youtube.com/watch?v=${youtubeId}`
              : `twitch.tv/${item.channel ?? item.label}`}
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
        {canManage && !isSticky && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(item.id)}
            title={isActive ? "Remove and play next" : "Remove from playlist"}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The playlist popover panel (anchored to the footer's playlist button).
 * Lists all items, highlights the active one, and lets staff add/remove/switch
 * and drag-to-reorder Twitch/YouTube streams. The hikkistream item is sticky
 * (pinned first) and cannot be removed or reordered.
 */
export function Playlist({
  items,
  activeItem,
  canManage,
  error,
  onAdd,
  onRemove,
  onSwitch,
  onReorder,
}: PlaylistProps) {
  const [urlInput, setUrlInput] = useState("");

  // Optimistic local order so a drop animates smoothly before the server
  // broadcast (`playlist:list`) reconciles everyone to the same order.
  const [ordered, setOrdered] = useState<PlaylistItem[]>(items);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) setOrdered(items);
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = () => {
    draggingRef.current = true;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    draggingRef.current = false;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((row) => row.id === active.id);
    const newIndex = ordered.findIndex((row) => row.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    onReorder(String(active.id), newIndex);
  };

  const handleAdd = () => {
    const value = urlInput.trim();
    if (!value) return;
    onAdd({ source: "auto", url: value });
    setUrlInput("");
  };

  return (
    <PopoverContent
      side="top"
      align="end"
      className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(440px,80dvh)]"
    >
      <div className="flex items-center gap-1.5 px-0.5">
        <ListMusic className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Playlist</h3>
        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">
          {items.length}
        </Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1 -mx-1.5 px-1.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            draggingRef.current = false;
          }}
        >
          <SortableContext
            items={ordered.map((row) => row.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1">
              {ordered.map((row, index) => (
                <PlaylistRow
                  key={row.id}
                  item={row}
                  index={index}
                  isActive={activeItem?.id === row.id}
                  canManage={canManage}
                  onSwitch={onSwitch}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive px-0.5">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}

      {canManage && (
        <div className="space-y-1.5 border-t border-border pt-2">
          <Label className="text-xs">Add stream or video</Label>
          <div className="flex gap-1.5">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              className="h-7 text-xs flex-1"
              placeholder="Paste a Twitch or YouTube URL"
              maxLength={200}
            />
            <Button
              size="sm"
              className="h-7 gap-1"
              onClick={handleAdd}
              disabled={!urlInput.trim()}
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
