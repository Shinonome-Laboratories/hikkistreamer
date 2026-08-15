import { useCallback, useEffect, useRef, useState } from "react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import Hls from "hls.js";
import { MediaMTXWebRTCReader } from "@/lib/whep.ts";

type Protocol = "hls" | "webrtc";

const HLS_URL =
  import.meta.env.VITE_HLS_URL ?? "https://hls.futanari.stream/ys2/index.m3u8";
const WHEP_URL =
  import.meta.env.VITE_WHEP_URL ?? "https://webrtc.futanari.stream/ys2/whep";

const VOLUME_KEY = "hikkistream:volume";
const MUTED_KEY = "hikkistream:muted";
const MODE_KEY = "hikkistream:protocol";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private browsing, etc.).
  }
}

function readVolume(): number {
  const raw = safeGet(VOLUME_KEY);
  if (raw === null) {
    return 1;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function readMuted(): boolean {
  return safeGet(MUTED_KEY) === "true";
}

function readProtocol(): Protocol {
  return safeGet(MODE_KEY) === "webrtc" ? "webrtc" : "hls";
}

function createSwitchButton(onClick: () => void, mode: Protocol): HTMLButtonElement {
  const currentLabel = mode === "hls" ? "HLS" : "WebRTC";
  const tooltip = mode === "hls" ? "Switch to WebRTC" : "Switch to HLS";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "plyr__controls__item plyr__control";
  button.setAttribute("data-plyr", "switch-source");
  button.setAttribute("aria-label", tooltip);
  button.title = tooltip;
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
      <path d="M3 21v-5h5"></path>
    </svg>
    <span class="plyr__switch-label">${currentLabel}</span>
  `;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });

  return button;
}

interface PlayerCoreProps {
  mode: Protocol;
  onSwitch: () => void;
}

function PlayerCore({ mode, onSwitch }: PlayerCoreProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    // Create the media element imperatively so React never has to reconcile
    // against Plyr's DOM mutations. Plyr moves the element into its wrapper
    // and its destroy() swaps that wrapper for a *clone* of the element, which
    // would leave React's ref pointing at a detached node after StrictMode's
    // double-invoke in development.
    const video = document.createElement("video");
    video.className = "w-full h-full";
    video.playsInline = true;
    video.controls = true;
    container.appendChild(video);

    let disposed = false;
    let hls: Hls | null = null;
    let reader: MediaMTXWebRTCReader | null = null;

    const reportError = (message: string) => {
      if (!disposed) {
        setError(message);
      }
    };

    // HLS setup (hls.js with native Safari fallback).
    if (mode === "hls") {
      if (Hls.isSupported()) {
        const hlsInstance = new Hls({
          lowLatencyMode: true,
          backBufferLength: 30,
          liveSyncDurationCount: 3,
        });
        hls = hlsInstance;
        hlsInstance.loadSource(HLS_URL);
        hlsInstance.attachMedia(video);
        hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
          if (disposed || !data.fatal) {
            return;
          }
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsInstance.recoverMediaError();
              break;
            default:
              reportError(`Playback error: ${data.details}`);
              hlsInstance.destroy();
              break;
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = HLS_URL;
      } else {
        reportError("HLS playback is not supported in this browser.");
      }
    }

    const plyr = new Plyr(video, {
      controls: ["play-large", "play", "mute", "volume", "pip", "fullscreen"],
      autoplay: true,
      clickToPlay: true,
      hideControls: true,
      disableContextMenu: true,
    });

    // Volume persistence.
    plyr.on("ready", () => {
      if (disposed) {
        return;
      }
      plyr.volume = readVolume();
      plyr.muted = readMuted();
    });
    plyr.on("volumechange", () => {
      if (disposed) {
        return;
      }
      safeSet(VOLUME_KEY, String(plyr.volume));
      safeSet(MUTED_KEY, String(plyr.muted));
    });

    // WebRTC/WHEP reader management.
    const stopReader = () => {
      reader?.close();
      reader = null;
      const stream = video.srcObject;
      if (stream instanceof MediaStream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      video.srcObject = null;
    };

    const startReader = () => {
      if (disposed || reader !== null) {
        return;
      }
      reader = new MediaMTXWebRTCReader({
        url: WHEP_URL,
        onError: (err) => reportError(err),
        onTrack: (evt) => {
          const stream = evt.streams[0];
          if (stream !== undefined) {
            video.srcObject = stream;
          }
        },
        onDataChannel: () => {
          // Data channel not required for playback.
        },
      });
    };

    if (mode === "webrtc") {
      startReader();
    }

    // Pausing while in WebRTC mode disconnects the stream entirely so no data
    // keeps downloading while paused. Playing reconnects.
    const handlePause = () => {
      if (mode === "webrtc") {
        stopReader();
      }
    };
    const handlePlay = () => {
      if (mode === "webrtc") {
        startReader();
      }
    };

    plyr.on("pause", handlePause);
    plyr.on("play", handlePlay);

    // Inject the inline protocol-switch control into Plyr's controls bar.
    const switchButton = createSwitchButton(onSwitch, mode);
    const volumeInput = plyr.elements.controls?.querySelector(
      '[data-plyr="volume"]',
    );
    if (volumeInput !== null && volumeInput !== undefined) {
      volumeInput.insertAdjacentElement("afterend", switchButton);
    } else {
      plyr.elements.controls?.appendChild(switchButton);
    }

    return () => {
      disposed = true;
      reader?.close();
      reader = null;
      const stream = video.srcObject;
      if (stream instanceof MediaStream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      video.srcObject = null;
      hls?.destroy();
      plyr.destroy();
      // Plyr's destroy() leaves a clone of the media element in place of its
      // wrapper; clear the container entirely so each mount starts fresh.
      container.replaceChildren();
    };
  }, [mode, onSwitch]);

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      <div className="relative w-full max-w-full max-h-full aspect-video bg-black">
        <div ref={containerRef} className="w-full h-full" />
        {error !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4">
            <p className="text-sm text-white/90 text-center">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function StreamPlayer() {
  const [mode, setMode] = useState<Protocol>(readProtocol);

  const switchMode = useCallback(() => {
    setMode((current) => {
      const next: Protocol = current === "hls" ? "webrtc" : "hls";
      safeSet(MODE_KEY, next);
      return next;
    });
  }, []);

  // `key` forces a full teardown and re-initialization when the protocol
  // changes, avoiding any stale player/connection state.
  return <PlayerCore key={mode} mode={mode} onSwitch={switchMode} />;
}
