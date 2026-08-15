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
} from "./auth.js";
import {
  createMessage,
  getRecentMessages,
  getMessagesBefore,
  deleteMessage,
  deleteUserMessages,
} from "./chat.js";
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

// --- settings helpers ---
function getStreamTitle(): string {
  const row = db.prepare("SELECT value FROM stream_settings WHERE key = 'title'").get() as { value: string } | undefined;
  return row?.value ?? "hikkistream";
}

function setStreamTitle(title: string): void {
  db.prepare("INSERT OR REPLACE INTO stream_settings (key, value) VALUES ('title', ?)").run(title);
}

function getCustomEmojis(): CustomEmoji[] {
  return db.prepare("SELECT name, url FROM custom_emojis ORDER BY created_at ASC").all() as CustomEmoji[];
}

function getBannedUsers(): { id: string; username: string }[] {
  return db.prepare(
    "SELECT id, username FROM users WHERE is_banned = 1 AND is_guest = 0 ORDER BY username COLLATE NOCASE ASC"
  ).all() as { id: string; username: string }[];
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
  res.json({ title: getStreamTitle(), emojis: getCustomEmojis() });
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

// --- admin: upload custom emoji ---
app.post("/api/admin/emoji", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = authenticateToken(auth.slice(7));
  if (!user || !user.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }
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
  if (!user || !user.is_admin) { res.status(403).json({ error: "Forbidden" }); return; }
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

io.on("connection", (socket) => {
  // Send current state on new connection
  socket.emit("stream:title", getStreamTitle());
  socket.emit("emojis:list", getCustomEmojis());
  socket.emit("chat:history", getRecentMessages(50));
  socket.emit("users:count", socketUsers.size);
  socket.emit("users:list", getConnectedUsers());

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
    if (!user || !user.is_admin) return;

    if (deleteMessage(data.messageId)) {
      io.emit("chat:delete", data.messageId);
    }
  });

  socket.on("mod:ban", (data) => {
    const user = socketUsers.get(socket.id);
    if (!user || !user.is_admin) return;

    const targetUser = getUserById(data.userId);
    if (!targetUser || targetUser.is_admin) return;

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
    socketUsers.delete(socket.id);
    broadcastUserCount();
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[hikkistream] server running on port ${PORT}`);
});
