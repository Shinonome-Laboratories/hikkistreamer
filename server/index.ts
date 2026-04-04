import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
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
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  User,
} from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const avatarsDir = path.join(__dirname, "..", "data", "avatars");
fs.mkdirSync(avatarsDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use("/avatars", express.static(avatarsDir));

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
  const match = image.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "Invalid image format. Allowed: jpeg, png, gif, webp." });
    return;
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    res.status(400).json({ error: "Image too large (max 2MB)" });
    return;
  }
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const filename = `${user.id}.${ext}`;
  const filepath = path.join(avatarsDir, filename);
  // Remove any previous avatar file with a different extension
  for (const e of ["jpg", "png", "gif", "webp"]) {
    const p = path.join(avatarsDir, `${user.id}.${e}`);
    if (p !== filepath && fs.existsSync(p)) fs.unlinkSync(p);
  }
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

    const message = createMessage(
      user.id,
      user.username,
      data.content,
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
