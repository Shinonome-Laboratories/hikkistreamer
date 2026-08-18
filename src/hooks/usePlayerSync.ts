import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";
import type { PlayerState, PlayerStatus } from "../../shared/types";

// Only re-seek when the local player drifts beyond this many seconds from the
// room position, so playback doesn't constantly skip around.
export const PLAYER_SYNC_SLACK_SECONDS = 3;
// How often the player checks drift (and throttles heartbeat reports).
export const PLAYER_SYNC_CHECK_MS = 1000;
// Minimum gap between heartbeat reports to the server.
const PLAYER_HEARTBEAT_MS = 10_000;
// After a sync-driven seek, ignore locally emitted events for this long so we
// don't echo our own correction back to the server.
const ECHO_SUPPRESS_MS = 1500;
// Rate-limit control events (play/pause/seek) per client.
const CONTROL_COOLDOWN_MS = 400;

/** Minimal surface the sync logic needs from a Plyr player instance. */
export interface SyncPlayer {
  getCurrentTime(): number;
  setCurrentTime(time: number): void;
  isPaused(): boolean;
  /** True while the user is dragging the seek bar (skip corrections). */
  isSeeking(): boolean;
  isEnded(): boolean;
  play(): void;
  pause(): void;
}

interface Anchor {
  target: number;
  localAtMs: number;
  status: PlayerStatus;
  speed: number;
}

export interface PlayerSyncApi {
  /** Room playback status for the current item ("playing"/"paused"/...). */
  roomStatus: PlayerStatus;
  /** Attach the player adapter (call once the player is ready). */
  setPlayer(adapter: SyncPlayer | null): void;
  /** Compute the desired room position right now. */
  desiredPosition(): number;
  /** Seek to the room position if drift exceeds the slack. Returns true if it corrected. */
  applyCorrection(): boolean;
  /** Align a freshly loaded player to the room (initial seek + play/pause mirror). */
  syncToRoom(): void;
  /** Staff control reports. No-ops for non-staff. */
  reportPlay(): void;
  reportPause(): void;
  reportSeek(): void;
  reportEnded(): void;
  /** Reports accepted from any user. */
  reportReady(duration: number): void;
  reportHeartbeat(): void;
}

/**
 * Keeps a single client's player aligned with the server-authoritative room
 * position (`player:state`). Position is derived from the anchor + local
 * elapsed time (immune to wall-clock skew), and corrections only happen once
 * the drift exceeds `PLAYER_SYNC_SLACK_SECONDS`. Control events are only
 * emitted when `canControl` is true (staff).
 */
export function usePlayerSync(itemId: string, canControl: boolean): PlayerSyncApi {
  const [roomStatus, setRoomStatus] = useState<PlayerStatus>("stopped");

  const playerRef = useRef<SyncPlayer | null>(null);
  const anchorRef = useRef<Anchor | null>(null);
  const statusRef = useRef<PlayerStatus>("stopped");
  const suppressUntilRef = useRef(0);
  const lastHeartbeatAtRef = useRef(0);
  const lastControlAtRef = useRef(0);

  // Keep the latest props available to stable callbacks. Synced in an effect
  // (never during render) to satisfy the react-hooks refs lint rule.
  const itemIdRef = useRef(itemId);
  const canControlRef = useRef(canControl);
  useEffect(() => {
    itemIdRef.current = itemId;
    canControlRef.current = canControl;
  });

  const desiredAt = useCallback((anchor: Anchor): number => {
    if (anchor.status !== "playing") return anchor.target;
    const elapsed = (performance.now() - anchor.localAtMs) / 1000;
    return anchor.target + elapsed * anchor.speed;
  }, []);

  const setPlayer = useCallback((adapter: SyncPlayer | null) => {
    playerRef.current = adapter;
  }, []);

  const desiredPosition = useCallback((): number => {
    const anchor = anchorRef.current;
    return anchor ? desiredAt(anchor) : 0;
  }, [desiredAt]);

  const applyCorrection = useCallback((): boolean => {
    const player = playerRef.current;
    const anchor = anchorRef.current;
    if (!player || !anchor || anchor.status !== "playing") return false;
    if (player.isSeeking()) return false;
    const now = performance.now();
    if (now < suppressUntilRef.current) return false;
    const desired = desiredAt(anchor);
    if (Math.abs(player.getCurrentTime() - desired) <= PLAYER_SYNC_SLACK_SECONDS) return false;
    suppressUntilRef.current = now + ECHO_SUPPRESS_MS;
    player.setCurrentTime(Math.max(0, desired));
    return true;
  }, [desiredAt]);

  const syncToRoom = useCallback(() => {
    const player = playerRef.current;
    const anchor = anchorRef.current;
    if (!player || !anchor) return;

    const now = performance.now();
    if (anchor.status === "playing" && !player.isSeeking()) {
      const desired = desiredAt(anchor);
      if (Math.abs(player.getCurrentTime() - desired) > PLAYER_SYNC_SLACK_SECONDS) {
        suppressUntilRef.current = now + ECHO_SUPPRESS_MS;
        player.setCurrentTime(Math.max(0, desired));
      }
    }
    if (anchor.status === "playing" && player.isPaused() && !player.isEnded()) {
      player.play();
    } else if (anchor.status === "paused" && !player.isPaused()) {
      player.pause();
    }
  }, [desiredAt]);

  // Subscribe to the authoritative room state.
  useEffect(() => {
    function onPlayerState(state: PlayerState) {
      if (state.itemId !== itemIdRef.current) return;
      statusRef.current = state.status;
      setRoomStatus(state.status);
      anchorRef.current = {
        target: state.position,
        localAtMs: performance.now(),
        status: state.status,
        speed: state.speed || 1,
      };

      const player = playerRef.current;
      if (!player) return;
      const now = performance.now();
      if (state.status === "playing" && !player.isSeeking()) {
        const desired = desiredAt(anchorRef.current);
        if (Math.abs(player.getCurrentTime() - desired) > PLAYER_SYNC_SLACK_SECONDS) {
          suppressUntilRef.current = now + ECHO_SUPPRESS_MS;
          player.setCurrentTime(Math.max(0, desired));
        }
      }
      if (state.status === "playing" && player.isPaused() && !player.isEnded()) {
        player.play();
      } else if (state.status === "paused" && !player.isPaused()) {
        player.pause();
      }
    }

    socket.on("player:state", onPlayerState);
    return () => {
      socket.off("player:state", onPlayerState);
    };
  }, [desiredAt]);

  const reportPlay = useCallback(() => {
    if (!canControlRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const now = performance.now();
    if (now - lastControlAtRef.current < CONTROL_COOLDOWN_MS) return;
    lastControlAtRef.current = now;
    socket.emit("player:play", { itemId: itemIdRef.current, position: player.getCurrentTime() });
  }, []);

  const reportPause = useCallback(() => {
    if (!canControlRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const now = performance.now();
    if (now - lastControlAtRef.current < CONTROL_COOLDOWN_MS) return;
    lastControlAtRef.current = now;
    socket.emit("player:pause", { itemId: itemIdRef.current, position: player.getCurrentTime() });
  }, []);

  const reportSeek = useCallback(() => {
    if (!canControlRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const now = performance.now();
    if (now < suppressUntilRef.current) return; // this seek was a sync correction
    if (now - lastControlAtRef.current < CONTROL_COOLDOWN_MS) return;
    lastControlAtRef.current = now;
    // Adopt locally so we don't fight the room while awaiting the broadcast.
    anchorRef.current = {
      target: player.getCurrentTime(),
      localAtMs: now,
      status: statusRef.current,
      speed: anchorRef.current?.speed ?? 1,
    };
    socket.emit("player:seek", { itemId: itemIdRef.current, position: player.getCurrentTime() });
  }, []);

  const reportEnded = useCallback(() => {
    if (!canControlRef.current) return;
    socket.emit("player:ended", { itemId: itemIdRef.current });
  }, []);

  const reportReady = useCallback((duration: number) => {
    socket.emit("player:ready", { itemId: itemIdRef.current, duration });
  }, []);

  const reportHeartbeat = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const now = performance.now();
    if (now - lastHeartbeatAtRef.current < PLAYER_HEARTBEAT_MS) return;
    lastHeartbeatAtRef.current = now;
    socket.emit("player:heartbeat", {
      itemId: itemIdRef.current,
      position: player.getCurrentTime(),
    });
  }, []);

  return {
    roomStatus,
    setPlayer,
    desiredPosition,
    applyCorrection,
    syncToRoom,
    reportPlay,
    reportPause,
    reportSeek,
    reportEnded,
    reportReady,
    reportHeartbeat,
  };
}
