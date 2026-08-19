import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Ban,
  Image,
  Loader2,
  Radio,
  Shield,
  ShieldCheck,
  Smile,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { socket } from "@/lib/socket";
import type { Banner, CustomEmoji, RegisteredUser, User } from "../../shared/types";

interface AdminSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  streamTitle: string;
  titleFromPlaylist: boolean;
  customEmojis: CustomEmoji[];
  banners: Banner[];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getToken(): string | null {
  return localStorage.getItem("hikkistream_token");
}

// ─── Stream Title Tab ────────────────────────────────────────────────────────
function StreamTitleTab({
  currentTitle,
  titleFromPlaylist,
}: {
  currentTitle: string;
  titleFromPlaylist: boolean;
}) {
  const [title, setTitle] = useState(currentTitle);
  const [saving, setSaving] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setTitle(currentTitle);
  }, [currentTitle]);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json() as { error: string };
        throw new Error(data.error || "Failed to update title");
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAuto = async (enabled: boolean) => {
    setTogglingAuto(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/title-auto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const data = await res.json() as { error: string };
        throw new Error(data.error || "Failed to update setting");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setTogglingAuto(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="text-xs">Auto-set from playlist</Label>
          <p className="text-[11px] text-muted-foreground">
            Follows the active playlist item&apos;s title (YouTube video or Twitch channel).
          </p>
        </div>
        <Switch
          checked={titleFromPlaylist}
          onCheckedChange={(enabled) => handleToggleAuto(enabled)}
          disabled={togglingAuto}
          aria-label="Auto-set title from active playlist item"
        />
      </div>
      <Separator />
      <div className="space-y-1.5">
        <Label className="text-xs">Stream Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          className="h-8 text-sm"
          placeholder="Enter stream title…"
        />
      </div>
      {titleFromPlaylist && (
        <p className="text-xs text-muted-foreground">
          This manual title is used while the hikkistream item is active or auto-title is off.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        size="sm"
        className="h-8"
        onClick={handleSave}
        disabled={saving || !title.trim() || title.trim() === currentTitle}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
        {success ? "Saved!" : "Save Title"}
      </Button>
    </div>
  );
}

// ─── Custom Emojis Tab ───────────────────────────────────────────────────────
function CustomEmojisTab({ emojis }: { emojis: CustomEmoji[] }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    if (!["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"].includes(f.type)) {
      setError("Unsupported format. Use jpeg, png, gif, webp, or avif.");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setError("Image too large (max 1MB).");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    // Auto-fill emoji name from the filename (without extension)
    const baseName = f.name.replace(/\.[^.]+$/, "");
    const cleanName = baseName.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    if (cleanName) setName(cleanName);
  };

  const handleAdd = async () => {
    const cleanName = name.trim();
    if (!cleanName || !file) return;
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(cleanName)) {
      setError("Name must be 1-32 characters: letters, numbers, underscore, hyphen.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/admin/emoji", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ name: cleanName, image: dataUrl }),
      });
      if (!res.ok) {
        const data = await res.json() as { error: string };
        throw new Error(data.error || "Upload failed");
      }
      setName("");
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (emojiName: string) => {
    setDeletingName(emojiName);
    try {
      await fetch(`/api/admin/emoji/${encodeURIComponent(emojiName)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    } catch {
      // ignore
    } finally {
      setDeletingName(null);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Custom emojis are used with <code className="bg-secondary px-0.5 rounded">:name:</code> syntax in chat.
        </p>
        <div className="flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              maxLength={32}
              className="h-8 text-sm w-36"
              placeholder="PogScared"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Image</Label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
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
                {preview ? (
                  <img src={preview} alt="preview" className="h-4 w-4 object-contain mr-1" />
                ) : null}
                {file ? "Change…" : "Choose File"}
              </Button>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8"
            onClick={handleAdd}
            disabled={uploading || !name.trim() || !file}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Add
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {emojis.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No custom emojis yet.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
          {emojis.map((emoji) => (
            <div
              key={emoji.name}
              className="flex flex-col items-center gap-1 p-2 rounded-md bg-secondary/40 group relative"
            >
              <img
                src={emoji.url}
                alt={`:${emoji.name}:`}
                className="h-8 w-8 object-contain"
              />
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                {emoji.name}
              </span>
              <button
                onClick={() => handleDelete(emoji.name)}
                disabled={deletingName === emoji.name}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                title="Delete emoji"
              >
                {deletingName === emoji.name ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Banners Tab ─────────────────────────────────────────────────────────────
function BannersTab({ banners }: { banners: Banner[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    if (!["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"].includes(f.type)) {
      setError("Unsupported format. Use jpeg, png, gif, webp, or avif.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Image too large (max 5MB).");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleAdd = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/admin/banner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) {
        const data = await res.json() as { error: string };
        throw new Error(data.error || "Upload failed");
      }
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (bannerId: string) => {
    setDeletingId(bannerId);
    try {
      await fetch(`/api/admin/banner/${encodeURIComponent(bannerId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Banners are shown above the video. A random one is picked on every page load.
        </p>
        <div className="flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Image</Label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
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
                {preview ? (
                  <img src={preview} alt="preview" className="h-4 w-4 object-contain mr-1" />
                ) : null}
                {file ? "Change…" : "Choose File"}
              </Button>
              <Button
                size="sm"
                className="h-8"
                onClick={handleAdd}
                disabled={uploading || !file}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Add
              </Button>
            </div>
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {banners.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No banners yet.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className="flex flex-col items-center gap-1 p-2 rounded-md bg-secondary/40 group relative"
            >
              <img
                src={banner.url}
                alt="Banner"
                className="h-12 w-full object-cover rounded"
              />
              <button
                onClick={() => handleDelete(banner.id)}
                disabled={deletingId === banner.id}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                title="Delete banner"
              >
                {deletingId === banner.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Banned Users Tab ────────────────────────────────────────────────────────
interface BannedUser { id: string; username: string }

function BannedUsersTab() {
  const [users, setUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/banned", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as BannedUser[];
      setUsers(data);
    } catch {
      setError("Failed to load banned users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUnban = async (userId: string) => {
    setUnbanningId(userId);
    try {
      socket.emit("mod:unban", { userId });
      // Optimistically remove from list
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      setError("Failed to unban user.");
    } finally {
      setUnbanningId(null);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Registered accounts that are currently banned.
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loading && users.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No banned users.</p>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between px-2 py-1.5 rounded-md bg-secondary/40"
            >
              <div className="flex items-center gap-2">
                <UserX className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span className="text-sm font-medium">{u.username}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => handleUnban(u.id)}
                disabled={unbanningId === u.id}
                title="Unban user"
              >
                {unbanningId === u.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5 mr-1" />
                    Unban
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Moderators Tab (admin only) ─────────────────────────────────────────────
function ModeratorsTab() {
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim().toLowerCase();
  const filteredUsers = trimmedQuery
    ? users.filter((u) => u.username.toLowerCase().includes(trimmedQuery))
    : users;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/moderators", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as RegisteredUser[];
      setUsers(data);
    } catch {
      setError("Failed to load registered users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (u: RegisteredUser) => {
    setTogglingId(u.id);
    setError(null);
    try {
      const promote = !u.is_moderator;
      const res = await fetch(
        promote
          ? "/api/admin/moderator"
          : `/api/admin/moderator/${encodeURIComponent(u.id)}`,
        {
          method: promote ? "POST" : "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: promote ? JSON.stringify({ userId: u.id }) : undefined,
        }
      );
      if (!res.ok) {
        const data = await res.json() as { error: string };
        throw new Error(data.error || "Failed to update moderator");
      }
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, is_moderator: promote } : x))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Moderators can manage streams, delete regular-user messages, and manage
          emojis. Search for a registered account to promote.
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8 text-sm"
        placeholder="Search users to add as moderator…"
      />
      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
        {filteredUsers.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between px-2 py-1.5 rounded-md bg-secondary/40"
          >
            <div className="flex items-center gap-2 min-w-0">
              {u.is_admin ? (
                <Shield className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
              ) : u.is_moderator ? (
                <Shield className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              ) : (
                <UserX className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-medium truncate">{u.username}</span>
              {u.is_admin && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                  admin
                </Badge>
              )}
              {u.is_moderator && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                  mod
                </Badge>
              )}
            </div>
            {!u.is_admin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => handleToggle(u)}
                disabled={togglingId === u.id}
              >
                {togglingId === u.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : u.is_moderator ? (
                  "Demote"
                ) : (
                  "Promote"
                )}
              </Button>
            )}
          </div>
        ))}
        {!loading && filteredUsers.length === 0 && (
          users.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No registered users.</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No users match “{query.trim()}”.
            </p>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────
export function AdminSettingsModal({
  open,
  onOpenChange,
  user,
  streamTitle,
  titleFromPlaylist,
  customEmojis,
  banners,
}: AdminSettingsModalProps) {
  const isAdmin = user.is_admin;
  const isStaff = user.is_admin || user.is_moderator;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[720px] max-w-[95vw] sm:max-w-[720px] min-h-[560px] max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm">
            {isAdmin ? "Admin Settings" : "Moderator Settings"}
          </DialogTitle>
        </DialogHeader>
        <Tabs
          defaultValue={isStaff ? "stream" : "emojis"}
          orientation="vertical"
          className="min-h-0 flex-1"
        >
          <TabsList variant="line" className="w-40 shrink-0 flex-col items-stretch">
            {isStaff && (
              <TabsTrigger value="stream" className="justify-start gap-2 px-2 text-xs">
                <Radio className="h-4 w-4 shrink-0" />
                Stream
              </TabsTrigger>
            )}
            <TabsTrigger value="emojis" className="justify-start gap-2 px-2 text-xs">
              <Smile className="h-4 w-4 shrink-0" />
              Custom Emojis
            </TabsTrigger>
            <TabsTrigger value="banners" className="justify-start gap-2 px-2 text-xs">
              <Image className="h-4 w-4 shrink-0" />
              Banners
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="banned" className="justify-start gap-2 px-2 text-xs">
                <Ban className="h-4 w-4 shrink-0" />
                Banned Users
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="moderators" className="justify-start gap-2 px-2 text-xs">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Moderators
              </TabsTrigger>
            )}
          </TabsList>
          {isStaff && (
            <TabsContent value="stream" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <StreamTitleTab
                currentTitle={streamTitle}
                titleFromPlaylist={titleFromPlaylist}
              />
            </TabsContent>
          )}
          <TabsContent value="emojis" className="min-h-0 flex-1 overflow-y-auto pr-1">
            <CustomEmojisTab emojis={customEmojis} />
          </TabsContent>
          <TabsContent value="banners" className="min-h-0 flex-1 overflow-y-auto pr-1">
            <BannersTab banners={banners} />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="banned" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <BannedUsersTab />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="moderators" className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ModeratorsTab />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
