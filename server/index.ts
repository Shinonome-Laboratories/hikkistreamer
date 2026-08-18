import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";
import {
  register,
  login,
  guestLogin,
  authenticateToken,
  updateCustomization,
  banUser,
  unbanUser,
  getUserById,
  getRegisteredUsers,
  setModerator,
} from "./auth.js";
import {
  createMessage,
  getRecentMessages,
  getMessagesBefore,
  deleteMessage,
  deleteUserMessages,
  getMessageAuthor,
} from "./chat.js";
import {
  getPlaylistItems,
  getActiveItem,
  addPlaylistItem,
  removePlaylistItem,
  switchPlaylistItem,
  advancePlaylist,
  reorderPlaylistItem,
} from "./playlist.js";
import {
  initPlayerState,
  getPlayerState,
  startItem,
  setLive,
  setStopped,
  isCurrentItem,
  handlePlay,
  handlePause,
  handleSeek,
  handleEnded,
  handleReady,
  handleHeartbeat,
  shouldAutoAdvance,
} from "./player.js";
import { initTwitchBridge } from "./twitch.js";
import db from "./db.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  User,
  CustomEmoji,
  MediaType,
} from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const avatarsDir = path.join(__dirname, "..", "data", "avatars");
const emojisDir = path.join(__dirname, "..", "data", "emojis");
const uploadsDir = path.join(__dirname, "..", "data", "uploads");
fs.mkdirSync(avatarsDir, { recursive: true });
fs.mkdirSync(emojisDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

// --- chat media uploads ---
const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MEDIA: Record<string, MediaType> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/avif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
};

const uploadStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() ||
      (file.mimetype === "image/jpeg" ? ".jpg" : `.${file.mimetype.split("/")[1]}`);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_MEDIA_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MEDIA[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Allowed: jpeg, png, gif, webp, avif, mp4, webm, mov."));
    }
  },
});

// --- chat rate limiting ---
// The comment overlay turns chat into a firehose, so cap each user's send rate.
const CHAT_RATE_WINDOW_MS = 20_000;
const CHAT_RATE_MAX_MESSAGES = 8;
const chatRateMap = new Map<string, number[]>();

/** Returns true when the user is still within their message rate limit. */
function allowChatMessage(userId: string): boolean {
  const now = Date.now();
  const timestamps = (chatRateMap.get(userId) ?? []).filter(
    (t) => now - t < CHAT_RATE_WINDOW_MS
  );
  if (timestamps.length >= CHAT_RATE_MAX_MESSAGES) {
    chatRateMap.set(userId, timestamps);
    return false;
  }
  timestamps.push(now);
  chatRateMap.set(userId, timestamps);
  return true;
}

// --- settings helpers ---
function getStreamTitle(): string {
  const row = db.prepare("SELECT value FROM stream_settings WHERE key = 'title'").get() as { value: string } | undefined;
  return row?.value ?? "hikkistream";
}

function setStreamTitle(title: string): void {
  db.prepare("INSERT OR REPLACE INTO stream_settings (key, value) VALUES ('title', ?)").run(title);
}

function getTitleFromPlaylist(): boolean {
  const row = db.prepare(
    "SELECT value FROM stream_settings WHERE key = 'title_from_playlist'"
  ).get() as { value: string } | undefined;
  return row?.value === "1";
}

function setTitleFromPlaylist(enabled: boolean): void {
  db.prepare("INSERT OR REPLACE INTO stream_settings (key, value) VALUES ('title_from_playlist', ?)").run(enabled ? "1" : "0");
}

/**
 * When the auto-title setting is on and a non-hikkistream playlist item is
 * active, mirror its label into the stream title. The sticky hikkistream item
 * keeps the manual/default title. No-op when the title wouldn't change.
 */
function syncTitleFromActiveItem(): void {
  if (!getTitleFromPlaylist()) return;
  const active = getActiveItem();
  if (!active || active.source === "hikkistream") return;
  const next = active.label.trim().slice(0, 100);
  if (next && next !== getStreamTitle()) {
    setStreamTitle(next);
    io.emit("stream:title", next);
  }
}

function getCustomEmojis(): CustomEmoji[] {
  return db.prepare("SELECT name, url FROM custom_emojis ORDER BY created_at ASC").all() as CustomEmoji[];
}

function getBannedUsers(): { id: string; username: string }[] {
  return db.prepare(
    "SELECT id, username FROM users WHERE is_banned = 1 AND is_guest = 0 ORDER BY username COLLATE NOCASE ASC"
  ).all() as { id: string; username: string }[];
}

/** True for admins and moderators (the "staff" ranks). */
function isStaff(user: User | null): boolean {
  return !!user && (user.is_admin || user.is_moderator);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use("/avatars", express.static(avatarsDir));
app.use("/emojis", express.static(emojisDir));
app.use("/uploads", express.static(uploadsDir));

app.post("/api/avatar", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  const user = authenticateToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  if (user.is_guest) {
    res.status(403).json({ error: "Guests cannot upload avatars" });
    return;
  }
  const { image } = req.body as { image?: string };
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "No image provided" });
    return;
  }
  const match = image.match(/^data:(image\/(?:jpeg|png|gif|webp|avif));base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "Invalid image format. Allowed: jpeg, png, gif, webp, avif." });
    return;
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    res.status(400).json({ error: "Image too large (max 2MB)" });
    return;
  }
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  // Use a unique filename per upload so historical messages keep their old avatar.
  // Never delete previous avatar files — they may still be referenced by scrollback.
  const filename = `${user.id}-${randomUUID()}.${ext}`;
  const filepath = path.join(avatarsDir, filename);
  fs.writeFileSync(filepath, buffer);
  const avatarUrl = `/avatars/${filename}`;
  updateCustomization(user.id, { avatar_url: avatarUrl });
  for (const [socketId, socketUser] of socketUsers.entries()) {
    if (socketUser.id === user.id) {
      socketUsers.set(socketId, { ...socketUser, avatar_url: avatarUrl });
    }
  }
  res.json({ avatar_url: avatarUrl });
});

// --- chat media upload (images/videos, max 10MB) ---
app.post("/api/upload", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = authenticateToken(auth.slice(7));
  if (!user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File too large (max 10MB)" });
      } else {
        res.status(400).json({ error: err.message || "Upload failed" });
      }
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const mediaType = ALLOWED_MEDIA[req.file.mimetype];
    if (!mediaType) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "Unsupported file type" });
      return;
    }
    res.json({ url: `/uploads/${req.file.filename}`, mediaType });
  });
});

// --- public settings endpoint ---
app.get("/api/settings", (_req, res) => {
  res.json({
    title: getStreamTitle(),
    titleFromPlaylist: getTitleFromPlaylist(),
    emojis: getCustomEmojis(),
  });
});

// --- admin: set stream title ---
app.post("/api/admin/title", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !user.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title } = req.body as { title?: string };
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Invalid title" }); return;
  }
  const clean = title.trim().slice(0, 100);
  setStreamTitle(clean);
  io.emit("stream:title", clean);
  res.json({ title: clean });
});

// --- admin: toggle auto-title from the active playlist item ---
app.post("/api/admin/title-auto", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !user.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const { enabled } = req.body as { enabled?: unknown };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "Invalid value" }); return;
  }
  setTitleFromPlaylist(enabled);
  io.emit("stream:auto-title", enabled);
  // Reflect the setting immediately if a non-hikkistream item is active.
  syncTitleFromActiveItem();
  res.json({ enabled });
});

// --- admin: upload custom emoji ---
app.post("/api/admin/emoji", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !isStaff(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, image } = req.body as { name?: string; image?: string };
  if (!name || typeof name !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    res.status(400).json({ error: "Invalid emoji name (1-32 alphanumeric, underscore, hyphen)" }); return;
  }
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "No image provided" }); return;
  }
  const match = image.match(/^data:(image\/(?:jpeg|png|gif|webp|avif));base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "Invalid image format. Allowed: jpeg, png, gif, webp, avif." }); return;
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > 1024 * 1024) {
    res.status(400).json({ error: "Image too large (max 1MB)" }); return;
  }
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  // Remove old file if exists with different extension
  for (const e of ["jpg", "png", "gif", "webp", "avif"]) {
    const p = path.join(emojisDir, `${name}.${e}`);
    if (fs.existsSync(p) && e !== ext) fs.unlinkSync(p);
  }
  const filename = `${name}.${ext}`;
  fs.writeFileSync(path.join(emojisDir, filename), buffer);
  const url = `/emojis/${filename}`;
  db.prepare("INSERT OR REPLACE INTO custom_emojis (name, url) VALUES (?, ?)").run(name, url);
  const emojis = getCustomEmojis();
  io.emit("emojis:list", emojis);
  res.json({ name, url });
});

// --- admin: delete custom emoji ---
app.delete("/api/admin/emoji/:name", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !isStaff(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name } = req.params as { name: string };
  if (!name || !/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    res.status(400).json({ error: "Invalid emoji name" }); return;
  }
  db.prepare("DELETE FROM custom_emojis WHERE name = ?").run(name);
  // Remove file
  for (const e of ["jpg", "png", "gif", "webp", "avif"]) {
    const p = path.join(emojisDir, `${name}.${e}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const emojis = getCustomEmojis();
  io.emit("emojis:list", emojis);
  res.json({ ok: true });
});

// --- admin: list banned users ---
app.get("/api/admin/banned", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !user.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(getBannedUsers());
});

// --- admin: moderator management ---
app.get("/api/admin/moderators", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !user.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(getRegisteredUsers());
});

app.post("/api/admin/moderator", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !user.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const { userId } = req.body as { userId?: string };
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "Invalid user" }); return;
  }
  const updated = setModerator(userId, true);
  if (!updated) {
    res.status(400).json({ error: "Cannot promote this user." }); return;
  }
  syncModeratorRole(updated);
  res.json(updated);
});

app.delete("/api/admin/moderator/:userId", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !user.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }
  const { userId } = req.params as { userId: string };
  const updated = setModerator(userId, false);
  if (!updated) {
    res.status(400).json({ error: "Cannot demote this user." }); return;
  }
  syncModeratorRole(updated);
  res.json(updated);
});

// Serve frontend static files in production
const distPath = path.join(__dirname, "..", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// --- synced playback state ---

// Initialize the authoritative player state from the persisted active item.
initPlayerState(getActiveItem());
// Sync the stream title to the active playlist item (when auto-title is on).
syncTitleFromActiveItem();

// Bridge Twitch chat into the app's chat stream when a Twitch item is active.
const twitchBridge = initTwitchBridge(io);

/**
 * Remove an item from the playlist. If it was the active item, advance to the
 * next one in the queue and start/flag its playback accordingly.
 */
function handleItemFinished(finishedId: string): { ok: true } | { error: string } {
  const removed = removePlaylistItem(finishedId);
  if ("error" in removed) {
    console.log(`[index] handleItemFinished ERROR for ${finishedId.slice(0, 8)}: ${removed.error}`);
    return { error: removed.error };
  }
  console.log(
    `[index] handleItemFinished removed "${removed.removed.label}" (${removed.removed.source}, pos ${removed.removed.position}, wasActive=${removed.removed.is_active})`
  );
  if (removed.removed.is_active) {
    const next = advancePlaylist(removed.removed.position);
    if (next) {
      console.log(`[index] handleItemFinished -> now active "${next.label}" (${next.source})`);
      if (next.source === "youtube") startItem(next.id);
      else setLive(next.id);
    } else {
      console.log("[index] handleItemFinished -> nothing left, stopping");
      setStopped(null);
    }
    syncTitleFromActiveItem();
  }
  // Keep the Twitch chat bridge following whatever channel is now active.
  twitchBridge.syncTwitchBridge();
  io.emit("playlist:list", getPlaylistItems());
  io.emit("player:state", getPlayerState());
  return { ok: true };
}

// Track authenticated sockets
const socketUsers = new Map<string, User>();

function broadcastUserCount() {
  io.emit("users:count", socketUsers.size);
}

function getConnectedUsers(): User[] {
  const seen = new Set<string>();
  const users: User[] = [];
  for (const user of socketUsers.values()) {
    if (!seen.has(user.id)) {
      seen.add(user.id);
      users.push(user);
    }
  }
  return users;
}

/** After a role change, refresh that user's connected sockets so their UI updates live. */
function syncModeratorRole(updated: User): void {
  for (const [socketId, socketUser] of socketUsers.entries()) {
    if (socketUser.id === updated.id) {
      const refreshed = { ...socketUser, is_moderator: updated.is_moderator };
      socketUsers.set(socketId, refreshed);
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        targetSocket.emit("auth:success", { user: refreshed, token: "" });
      }
    }
  }
}

io.on("connection", (socket) => {
  // Send current state on new connection
  socket.emit("stream:title", getStreamTitle());
  socket.emit("stream:auto-title", getTitleFromPlaylist());
  socket.emit("emojis:list", getCustomEmojis());
  socket.emit("playlist:list", getPlaylistItems());
  socket.emit("chat:history", getRecentMessages(50));
  socket.emit("users:count", socketUsers.size);
  socket.emit("users:list", getConnectedUsers());
  socket.emit("player:state", getPlayerState());

  socket.on("auth:register", (data) => {
    const result = register(data.username, data.password);
    if ("error" in result) {
      socket.emit("auth:error", { message: result.error });
      return;
    }
    socketUsers.set(socket.id, result.user);
    socket.emit("auth:success", result);

    // Send recent messages
    const messages = getRecentMessages(50);
    socket.emit("chat:history", messages);
    broadcastUserCount();
  });

  socket.on("auth:login", (data) => {
    const result = login(data.username, data.password);
    if ("error" in result) {
      socket.emit("auth:error", { message: result.error });
      return;
    }
    socketUsers.set(socket.id, result.user);
    socket.emit("auth:success", result);

    const messages = getRecentMessages(50);
    socket.emit("chat:history", messages);
    broadcastUserCount();
  });

  socket.on("auth:guest", (data) => {
    const result = guestLogin(data.username);
    if ("error" in result) {
      socket.emit("auth:error", { message: result.error });
      return;
    }
    socketUsers.set(socket.id, result.user);
    socket.emit("auth:success", result);

    const messages = getRecentMessages(50);
    socket.emit("chat:history", messages);
    broadcastUserCount();
  });

  socket.on("auth:token", (data) => {
    const user = authenticateToken(data.token);
    if (!user) {
      socket.emit("auth:error", { message: "Invalid or expired session." });
      return;
    }
    socketUsers.set(socket.id, user);
    socket.emit("auth:success", { user, token: data.token });

    const messages = getRecentMessages(50);
    socket.emit("chat:history", messages);
    broadcastUserCount();
  });

  socket.on("chat:send", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user) return;

    if (!allowChatMessage(user.id)) {
      console.log(`[index] chat rate-limited ${user.username} (${user.id.slice(0, 8)})`);
      return;
    }

    // Only allow media that was uploaded through /api/upload (starts with /uploads/)
    const mediaUrl =
      typeof data.mediaUrl === "string" && /^\/uploads\/[a-zA-Z0-9.-]+$/.test(data.mediaUrl)
        ? data.mediaUrl
        : null;
    const mediaType: MediaType | null =
      mediaUrl && (data.mediaType === "image" || data.mediaType === "video")
        ? data.mediaType
        : null;

    const message = createMessage(
      user.id,
      user.username,
      typeof data.content === "string" ? data.content : "",
      mediaUrl,
      mediaType,
      user.avatar_url,
      user.username_color,
      user.message_color
    );
    if (message) {
      io.emit("chat:message", message);
    }
  });

  socket.on("chat:history", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user) return;

    const messages = getMessagesBefore(data.before, data.limit || 50);
    socket.emit("chat:history", messages);
  });

  socket.on("users:request_list", () => {
    const user = socketUsers.get(socket.id);
    if (!user) return;
    socket.emit("users:list", getConnectedUsers());
  });

  socket.on("mod:delete", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user || !isStaff(user)) return;

    const author = getMessageAuthor(data.messageId);
    if (!author) return;

    // Admins can delete any message. Moderators can delete messages from
    // regular (non-staff) users, plus their own messages.
    const canDelete =
      user.is_admin ||
      author.user_id === user.id ||
      (!author.is_admin && !author.is_moderator);

    if (canDelete && deleteMessage(data.messageId)) {
      io.emit("chat:delete", data.messageId);
    }
  });

  socket.on("mod:ban", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user || !user.is_admin) return;

    const targetUser = getUserById(data.userId);
    if (!targetUser || targetUser.is_admin || targetUser.is_moderator) return;

    banUser(data.userId);
    deleteUserMessages(data.userId);

    // Disconnect all sockets for this user and notify
    for (const [socketId, sUser] of socketUsers.entries()) {
      if (sUser.id === data.userId) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.emit("mod:banned");
          targetSocket.disconnect(true);
        }
        socketUsers.delete(socketId);
      }
    }
    broadcastUserCount();
  });

  socket.on("mod:unban", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user || !user.is_admin) return;
    unbanUser(data.userId);
  });

  // --- playlist (admin only) ---
  function assertCanManagePlaylist(): boolean {
    const user = socketUsers.get(socket.id);
    if (!user || !isStaff(user)) {
      socket.emit("playlist:error", {
        message: "You do not have permission to manage the playlist.",
      });
      return false;
    }
    return true;
  }

  socket.on("playlist:add", async (data) => {
    if (!assertCanManagePlaylist()) return;
    const user = socketUsers.get(socket.id);
    const result = await addPlaylistItem({ ...data, addedBy: user?.username ?? "" });
    if ("error" in result) {
      socket.emit("playlist:error", { message: result.error });
      return;
    }
    io.emit("playlist:list", getPlaylistItems());
  });

  socket.on("playlist:remove", (data) => {
    if (!assertCanManagePlaylist()) return;
    const result = handleItemFinished(data.id);
    if ("error" in result) {
      socket.emit("playlist:error", { message: result.error });
    }
  });

  socket.on("playlist:switch", (data) => {
    if (!assertCanManagePlaylist()) return;
    const result = switchPlaylistItem(data.id);
    if ("error" in result) {
      socket.emit("playlist:error", { message: result.error });
      return;
    }
    if (result.source === "youtube") startItem(result.id);
    else setLive(result.id);
    io.emit("playlist:list", getPlaylistItems());
    io.emit("player:state", getPlayerState());
    syncTitleFromActiveItem();
    // Keep the Twitch chat bridge following whatever channel is now active.
    twitchBridge.syncTwitchBridge();
  });

  socket.on("playlist:reorder", (data) => {
    if (!assertCanManagePlaylist()) return;
    if (
      typeof data?.id !== "string" ||
      typeof data?.position !== "number" ||
      !Number.isFinite(data.position)
    ) {
      return;
    }
    const result = reorderPlaylistItem(data.id, data.position);
    if ("error" in result) {
      socket.emit("playlist:error", { message: result.error });
      return;
    }
    io.emit("playlist:list", getPlaylistItems());
  });

  // --- synced playback control (staff only) ---
  function assertCanControlPlayback(): boolean {
    const user = socketUsers.get(socket.id);
    return !!user && isStaff(user);
  }

  socket.on("player:play", (data) => {
    if (!assertCanControlPlayback()) return;
    if (!isCurrentItem(data.itemId)) return;
    if (handlePlay(data.itemId, typeof data.position === "number" ? data.position : 0)) {
      io.emit("player:state", getPlayerState());
    }
  });

  socket.on("player:pause", (data) => {
    if (!assertCanControlPlayback()) return;
    if (!isCurrentItem(data.itemId)) return;
    if (handlePause(data.itemId, typeof data.position === "number" ? data.position : 0)) {
      io.emit("player:state", getPlayerState());
    }
  });

  socket.on("player:seek", (data) => {
    if (!assertCanControlPlayback()) return;
    if (!isCurrentItem(data.itemId)) return;
    if (handleSeek(data.itemId, typeof data.position === "number" ? data.position : 0)) {
      io.emit("player:state", getPlayerState());
    }
  });

  socket.on("player:ended", (data) => {
    if (!assertCanControlPlayback()) {
      console.log("[index] player:ended ignored (not staff)");
      return;
    }
    console.log(`[index] player:ended received for id=${data.itemId.slice(0, 8)}`);
    if (!isCurrentItem(data.itemId)) return;
    if (!handleEnded(data.itemId)) return;
    handleItemFinished(data.itemId);
  });

  // Duration and position reports are accepted from any authenticated user.
  socket.on("player:ready", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user) return;
    if (handleReady(data.itemId, typeof data.duration === "number" ? data.duration : 0)) {
      io.emit("player:state", getPlayerState());
    }
    // The video may have already ended before anyone loaded it; advance now.
    if (shouldAutoAdvance()) {
      const active = getActiveItem();
      console.log(`[index] player:ready triggered auto-advance for "${active?.label}"`);
      if (active) handleItemFinished(active.id);
    }
  });

  socket.on("player:heartbeat", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user) return;
    if (handleHeartbeat(data.itemId, typeof data.position === "number" ? data.position : 0)) {
      io.emit("player:state", getPlayerState());
    }
  });

  socket.on("user:customize", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user) return;

    const updated = updateCustomization(user.id, data);
    if (updated) {
      socketUsers.set(socket.id, updated);
      // Just update local state; client already has the token
      socket.emit("auth:success", {
        user: updated,
        token: "", // client ignores empty token re-emits
      });
    }
  });

  socket.on("disconnect", () => {
    const user = socketUsers.get(socket.id);
    if (user) chatRateMap.delete(user.id);
    socketUsers.delete(socket.id);
    broadcastUserCount();
  });
});

// Periodically re-anchor all clients and auto-advance when the active video
// reaches its reported duration (belt-and-suspenders to the client `ended`
// report, which also covers the case where the reporting client disconnected).
setInterval(() => {
  io.emit("player:state", getPlayerState());
  // Belt-and-suspenders: keep the Twitch bridge in sync with the active item.
  twitchBridge.syncTwitchBridge();
  if (shouldAutoAdvance()) {
    const active = getActiveItem();
    console.log(`[index] interval triggered auto-advance for "${active?.label}"`);
    if (active) handleItemFinished(active.id);
  }
}, 10_000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[hikkistream] server running on port ${PORT}`);
});
