import { useEffect, useRef, useState } from "react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import { Play } from "lucide-react";
import {
  PLAYER_SYNC_CHECK_MS,
  usePlayerSync,
  type SyncPlayer,
} from "@/hooks/usePlayerSync";
import { useAspectFit } from "@/hooks/useAspectFit";
import type { PlaylistItem } from "../../shared/types";

const STAFF_CONTROLS = [
  "play-large",
  "play",
  "progress",
  "current-time",
  "mute",
  "volume",
  "pip",
  "fullscreen",
];

// Followers watch without transport controls; they join via the overlay when
// autoplay is blocked and their position is kept in sync by the room.
const FOLLOWER_CONTROLS = ["mute", "volume", "pip", "fullscreen"];

const CAPTIONS_KEY = "hikkistream:captions";

function readCaptions(): boolean {
  try {
    return localStorage.getItem(CAPTIONS_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCaptions(value: boolean): void {
  try {
    localStorage.setItem(CAPTIONS_KEY, String(value));
  } catch {
    // Storage may be unavailable (private browsing, etc.).
  }
}

const CAPTIONS_ICON = `
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>
  </svg>
`;

function createCaptionsButton(
  onToggle: () => void,
  isOn: boolean
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "plyr__controls__item plyr__control";
  button.dataset.plyr = "captions-toggle";
  button.setAttribute("aria-label", isOn ? "Disable captions" : "Enable captions");
  button.title = isOn ? "Disable captions" : "Enable captions";
  button.setAttribute("aria-pressed", String(isOn));
  if (isOn) button.classList.add("plyr__control--pressed");
  button.innerHTML = CAPTIONS_ICON;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  });
  return button;
}

interface YouTubePlayerProps {
  item: PlaylistItem;
  /** Staff get full transport controls and broadcast them to the room. */
  canControl: boolean;
}

/**
 * Plyr-backed YouTube player with cross-client sync. Staff can play/pause/seek
 * (broadcast to the room); followers watch synced with transport controls
 * hidden. Position is aligned to the server-authoritative `player:state` with
 * a slack window so the video doesn't constantly skip around.
 */
export function YouTubePlayer({ item, canControl }: YouTubePlayerProps) {
  // `containerRef` measures the outer sized container for the aspect fit; the
  // embed mounts into `mediaRef`.
  const { containerRef, maxWidth } = useAspectFit();
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const plyrRef = useRef<Plyr | null>(null);
  const durationReportedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [interacted, setInteracted] = useState(false);

  const {
    roomStatus,
    setPlayer,
    applyCorrection,
    syncToRoom,
    reportPlay,
    reportPause,
    reportSeek,
    reportEnded,
    reportReady,
    reportHeartbeat,
  } = usePlayerSync(item.id, canControl);

  const videoId = item.youtube_id ?? item.channel ?? item.label;

  useEffect(() => {
    const container = mediaRef.current;
    if (container === null) return;

    let disposed = false;

    // Build the embed div imperatively so React never reconciles against
    // Plyr's DOM mutations (same pattern as PlayerCore).
    const embed = document.createElement("div");
    embed.dataset.plyrProvider = "youtube";
    embed.dataset.plyrEmbedId = videoId;
    container.appendChild(embed);

    const plyr = new Plyr(embed, {
      controls: canControl ? STAFF_CONTROLS : FOLLOWER_CONTROLS,
      autoplay: true,
      clickToPlay: canControl,
      hideControls: true,
      disableContextMenu: true,
    });
    plyrRef.current = plyr;

    const adapter: SyncPlayer = {
      getCurrentTime: () => plyr.currentTime,
      setCurrentTime: (time) => {
        plyr.currentTime = time;
      },
      isPaused: () => plyr.paused,
      isSeeking: () => plyr.seeking,
      isEnded: () => plyr.ended,
      play: () => {
        void plyr.play();
      },
      pause: () => {
        plyr.pause();
      },
    };

    // --- captions toggle (local preference, via the YouTube IFrame API) ---
    // Plyr's built-in captions system skips YouTube, so we drive captions
    // through the raw embed API and only reveal the button when the video
    // actually has caption tracks.
    let captionsOn = readCaptions();
    let captionsAvailable = false;
    const captionsButton = createCaptionsButton(() => {
      captionsOn = !captionsOn;
      writeCaptions(captionsOn);
      const yt = plyr.embed;
      if (yt) {
        if (captionsOn) {
          yt.loadModule?.("captions");
          // Pick the first track so captions render immediately.
          const tracks = yt.getOption?.("captions", "tracklist");
          if (Array.isArray(tracks) && tracks.length > 0) {
            const track = tracks[0];
            yt.setOption?.("captions", "track", {
              languageCode: track.languageCode,
              kind: track.kind,
            });
          }
        } else {
          yt.unloadModule?.("captions");
        }
      }
      captionsButton.setAttribute("aria-pressed", String(captionsOn));
      captionsButton.setAttribute(
        "aria-label",
        captionsOn ? "Disable captions" : "Enable captions"
      );
      captionsButton.title = captionsOn ? "Disable captions" : "Enable captions";
      captionsButton.classList.toggle("plyr__control--pressed", captionsOn);
    }, captionsOn);

    // Reveal the captions button only once we confirm the video has tracks.
    const checkCaptions = () => {
      if (captionsAvailable || disposed) return;
      const yt = plyr.embed;
      if (!yt || typeof yt.getOption !== "function") return;
      try {
        const tracks = yt.getOption("captions", "tracklist");
        if (Array.isArray(tracks) && tracks.length > 0) {
          captionsAvailable = true;
          captionsButton.style.display = "";
          if (captionsOn) yt.loadModule?.("captions");
        }
      } catch {
        // Not queryable yet; retry on the next tick.
      }
    };

    // Insert the captions toggle right after the volume control.
    const volumeInput = plyr.elements.controls?.querySelector(
      '[data-plyr="volume"]',
    );
    if (volumeInput !== null && volumeInput !== undefined) {
      volumeInput.insertAdjacentElement("afterend", captionsButton);
    } else {
      plyr.elements.controls?.appendChild(captionsButton);
    }
    captionsButton.style.display = "none";

    const onReady = () => {
      if (disposed) return;
      setPlayer(adapter);
      setInteracted(false);
      setPaused(plyr.paused);
      const duration = Number.isFinite(plyr.duration) ? plyr.duration : 0;
      if (duration > 0) durationReportedRef.current = true;
      reportReady(duration);
      syncToRoom();
      checkCaptions();
    };

    const onPlay = () => {
      if (disposed) return;
      setPaused(false);
      reportPlay();
    };

    const onPause = () => {
      if (disposed) return;
      setPaused(true);
      reportPause();
    };

    const onSeeked = () => {
      if (disposed) return;
      reportSeek();
    };

    const onEnded = () => {
      if (disposed) return;
      reportEnded();
    };

    const onError = () => {
      if (disposed) return;
      setError("This video could not be played.");
    };

    plyr.on("ready", onReady);
    plyr.on("play", onPlay);
    plyr.on("pause", onPause);
    plyr.on("seeked", onSeeked);
    plyr.on("ended", onEnded);
    plyr.on("error", onError);

    // Periodic drift check (only corrects beyond the slack) + throttled
    // heartbeat so the server can re-anchor if its clock drifts. Also re-reports
    // the duration once it becomes known (YouTube can report 0 at `ready`).
    const interval = window.setInterval(() => {
      if (disposed) return;
      checkCaptions();
      if (!durationReportedRef.current) {
        const duration = Number.isFinite(plyr.duration) ? plyr.duration : 0;
        if (duration > 0) {
          durationReportedRef.current = true;
          reportReady(duration);
        }
      }
      applyCorrection();
      reportHeartbeat();
    }, PLAYER_SYNC_CHECK_MS);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      plyrRef.current = null;
      plyr.destroy();
      container.replaceChildren();
    };
  }, [
    videoId,
    canControl,
    setPlayer,
    applyCorrection,
    syncToRoom,
    reportPlay,
    reportPause,
    reportSeek,
    reportEnded,
    reportReady,
    reportHeartbeat,
  ]);

  // Followers get a "click to play" overlay when the room is playing but their
  // autoplay was blocked by the browser.
  const showJoinOverlay = !canControl && roomStatus === "playing" && paused;

  const handleJoin = () => {
    setInteracted(true);
    const plyr = plyrRef.current;
    if (!plyr) return;
    void plyr.play();
    reportPlay();
  };

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
      <div className="relative w-full max-w-full aspect-video bg-black" style={{ maxWidth }}>
        <div ref={mediaRef} className="w-full h-full" />
        {error !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4">
            <p className="text-sm text-white/90 text-center">{error}</p>
          </div>
        )}
        {!interacted && showJoinOverlay && (
          <button
            type="button"
            onClick={handleJoin}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 cursor-pointer"
            aria-label="Click to play"
          >
            <span className="flex items-center gap-2 rounded-full bg-black/70 px-5 py-2.5 text-sm font-medium text-white ring-1 ring-white/30">
              <Play className="h-4 w-4" />
              Click to play
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
