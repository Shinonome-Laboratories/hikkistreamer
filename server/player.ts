import type { PlayerState, PlayerStatus, PlaylistItem } from "../shared/types.js";

// How far (seconds) the server clock may drift from real client playback
// before a heartbeat report is considered for re-anchoring.
const HEARTBEAT_REBASE_SLACK_SECONDS = 5;
// Minimum number of recent heartbeat reports required before re-anchoring, so
// a single laggy/buffering client can't yank everyone else around.
const HEARTBEAT_REBASE_MIN_SAMPLES = 3;
// Rolling window of heartbeat positions kept per item.
const HEARTBEAT_WINDOW_SIZE = 5;
// A playing video is considered finished when its computed position is within
// this many seconds of the reported duration.
const ENDED_EPSILON_SECONDS = 1;

interface InternalPlayerState {
  itemId: string | null;
  status: PlayerStatus;
  /** Position (seconds) at `startedAtMs` when playing; the pause/seek point otherwise. */
  startPosition: number;
  startedAtMs: number;
  speed: number;
  /** Known video duration (seconds), once reported by a client's player. */
  duration: number | null;
}

let state: InternalPlayerState = {
  itemId: null,
  status: "stopped",
  startPosition: 0,
  startedAtMs: Date.now(),
  speed: 1,
  duration: null,
};

// Rolling recent heartbeat positions per item id, used for robust re-anchoring.
const heartbeats = new Map<string, number[]>();

function resetState(itemId: string | null, status: PlayerStatus): void {
  state = {
    itemId,
    status,
    startPosition: 0,
    startedAtMs: Date.now(),
    speed: 1,
    duration: null,
  };
  heartbeats.clear();
}

/**
 * Initialize the authoritative state from the persisted active item on boot.
 * A YouTube item starts stopped (a staff "play" starts it); live sources are
 * marked "live" (no position sync applies).
 */
export function initPlayerState(active: PlaylistItem | null): void {
  if (active && active.source === "youtube") {
    resetState(active.id, "stopped");
  } else if (active) {
    resetState(active.id, "live");
  } else {
    resetState(null, "stopped");
  }
}

export function getComputedPosition(nowMs = Date.now()): number {
  if (state.status !== "playing") return state.startPosition;
  return state.startPosition + ((nowMs - state.startedAtMs) / 1000) * state.speed;
}

export function getPlayerState(nowMs = Date.now()): PlayerState {
  return {
    itemId: state.itemId,
    status: state.status,
    position: Math.max(0, getComputedPosition(nowMs)),
    at: nowMs,
    speed: state.speed,
    duration: state.duration,
  };
}

export function isCurrentItem(itemId: string): boolean {
  return state.itemId === itemId;
}

/** Begin playback of a newly selected YouTube item (position 0). */
export function startItem(itemId: string): void {
  console.log(`[player] startItem id=${itemId.slice(0, 8)}`);
  state = {
    itemId,
    status: "playing",
    startPosition: 0,
    startedAtMs: Date.now(),
    speed: 1,
    duration: null,
  };
  heartbeats.clear();
}

/** Mark a non-synced (Twitch/hikkistream) item as the active live source. */
export function setLive(itemId: string): void {
  console.log(`[player] setLive id=${itemId.slice(0, 8)}`);
  resetState(itemId, "live");
}

export function setStopped(itemId: string | null): void {
  console.log(`[player] setStopped id=${itemId ? itemId.slice(0, 8) : "null"}`);
  resetState(itemId, "stopped");
}

/**
 * Adopt a client play/resume. Returns whether the state actually changed (and
 * should be re-broadcast). Ignores plays while already playing or on a live
 * source, which stops the play/pause echo loop.
 */
export function handlePlay(itemId: string, position: number): boolean {
  if (state.itemId !== itemId) return false;
  if (state.status === "playing" || state.status === "live") return false;
  state.status = "playing";
  state.startPosition = Math.max(0, position);
  state.startedAtMs = Date.now();
  return true;
}

export function handlePause(itemId: string, position: number): boolean {
  if (state.itemId !== itemId) return false;
  if (state.status !== "playing") return false;
  state.status = "paused";
  state.startPosition = Math.max(0, position);
  state.startedAtMs = Date.now();
  return true;
}

export function handleSeek(itemId: string, position: number): boolean {
  if (state.itemId !== itemId) return false;
  if (state.status !== "playing" && state.status !== "paused") return false;
  state.startPosition = Math.max(0, position);
  state.startedAtMs = Date.now();
  return true;
}

/** Whether the current item is a synced video that has reached its end. */
export function handleEnded(itemId: string): boolean {
  const accepted =
    state.itemId === itemId &&
    (state.status === "playing" || state.status === "paused");
  if (accepted) {
    console.log(`[player] handleEnded accepted id=${itemId.slice(0, 8)} status=${state.status}`);
  } else {
    console.log(
      `[player] handleEnded REJECTED id=${itemId.slice(0, 8)} current=${state.itemId ? state.itemId.slice(0, 8) : "null"} status=${state.status}`
    );
  }
  return accepted;
}

/** Record the reported duration of the current video. */
export function handleReady(itemId: string, duration: number): boolean {
  if (state.itemId !== itemId) return false;
  if (!Number.isFinite(duration) || duration <= 0) return false;
  const changed = state.duration !== duration;
  state.duration = duration;
  return changed;
}

/**
 * Softly re-anchor the server clock to real playback. Ignores reports within
 * the slack; only rebases on the median of a rolling window once enough
 * independent reports agree the clock is off.
 */
export function handleHeartbeat(itemId: string, position: number): boolean {
  if (state.itemId !== itemId) return false;
  if (state.status !== "playing") return false;

  const nowMs = Date.now();
  const bucket = heartbeats.get(itemId) ?? [];
  bucket.push(position);
  while (bucket.length > HEARTBEAT_WINDOW_SIZE) bucket.shift();
  heartbeats.set(itemId, bucket);

  const drift = position - getComputedPosition(nowMs);
  if (Math.abs(drift) <= HEARTBEAT_REBASE_SLACK_SECONDS) return false;
  if (bucket.length < HEARTBEAT_REBASE_MIN_SAMPLES) return false;

  const sorted = [...bucket].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const medianDrift = median - getComputedPosition(nowMs);
  if (Math.abs(medianDrift) <= HEARTBEAT_REBASE_SLACK_SECONDS) return false;

  state.startPosition = Math.max(0, median);
  state.startedAtMs = nowMs;
  return true;
}

/** Whether the active synced video has reached its end (for server-side advance). */
export function shouldAutoAdvance(): boolean {
  if (state.status !== "playing" || state.duration === null || state.itemId === null) {
    return false;
  }
  const pos = getComputedPosition();
  const ended = pos >= state.duration - ENDED_EPSILON_SECONDS;
  if (ended) {
    console.log(
      `[player] shouldAutoAdvance TRUE id=${state.itemId.slice(0, 8)} pos=${pos.toFixed(1)} duration=${state.duration}`
    );
  }
  return ended;
}
