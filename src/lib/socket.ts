import { io, type Socket } from "socket.io-client";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../../shared/types";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  SOCKET_URL,
  {
    autoConnect: false,
  }
);
