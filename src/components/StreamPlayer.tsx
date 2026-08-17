import { useCallback, useEffect, useRef, useState } from "react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import Hls from "hls.js";
import { MediaMTXWebRTCReader } from "@/lib/whep.ts";
import type { PlaylistItem } from "../../shared/types";

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
    <svg viewBox="0 -6 46 46" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path d="M46,37H2a1,1,0,0,1-1-1V8A1,1,0,0,1,2,7H46a1,1,0,0,1,1,1V36A1,1,0,0,1,46,37ZM45,9H3V35H45ZM21,16a.975.975,0,0,1,.563.2l7.771,4.872a.974.974,0,0,1,.261,1.715l-7.974,4.981A.982.982,0,0,1,21,28a1,1,0,0,1-1-1V17A1,1,0,0,1,21,16ZM15,39H33a1,1,0,0,1,0,2H15a1,1,0,0,1,0-2Z" transform="translate(-1 -7)" fill-rule="evenodd"></path>
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

function createReloadButton(onClick: () => void): HTMLButtonElement {
  const tooltip = "Reload player";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "plyr__controls__item plyr__control";
  button.setAttribute("data-plyr", "reload");
  button.setAttribute("aria-label", tooltip);
  button.title = tooltip;
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M20.9844 10H17M20.9844 10V6M20.9844 10L17.6569 6.34315C14.5327 3.21895 9.46734 3.21895 6.34315 6.34315C3.21895 9.46734 3.21895 14.5327 6.34315 17.6569C9.46734 20.781 14.5327 20.781 17.6569 17.6569C18.4407 16.873 19.0279 15.9669 19.4184 15"></path>
    </svg>
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
  onReload: () => void;
}

function PlayerCore({ mode, onSwitch, onReload }: PlayerCoreProps) {
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

    // Inject the reload control right after the protocol switch.
    const reloadButton = createReloadButton(onReload);
    switchButton.insertAdjacentElement("afterend", reloadButton);

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
  }, [mode, onSwitch, onReload]);

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

interface StreamPlayerProps {
  /** The active playlist item; a Twitch item renders an embed instead of the hikkistream player. */
  activeItem?: PlaylistItem | null;
}

function TwitchEmbed({ channel }: { channel: string }) {
  // Twitch requires `parent` to match the page's hostname. This is `localhost`
  // in dev and the deployed domain in production.
  const parent = window.location.hostname;
  const src =
    `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}` +
    `&parent=${encodeURIComponent(parent)}&autoplay=true&muted=true`;

  // Match the hikkistream player's sizing: centered flex with an aspect-video
  // box that never exceeds the available width/height.
  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      <div className="relative w-full max-w-full max-h-full aspect-video bg-black">
        <iframe
          src={src}
          title={`Twitch: ${channel}`}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          scrolling="no"
        />
      </div>
    </div>
  );
}

export function StreamPlayer({ activeItem = null }: StreamPlayerProps) {
  const [mode, setMode] = useState<Protocol>(readProtocol);
  const [reloadKey, setReloadKey] = useState(0);

  const switchMode = useCallback(() => {
    setMode((current) => {
      const next: Protocol = current === "hls" ? "webrtc" : "hls";
      safeSet(MODE_KEY, next);
      return next;
    });
  }, []);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  // A Twitch playlist item plays through the official Twitch embed; the
  // hikkistream (and the default) uses the HLS/WebRTC video player below.
  if (activeItem?.source === "twitch") {
    return <TwitchEmbed channel={activeItem.channel ?? activeItem.label} />;
  }

  // `key` forces a full teardown and re-initialization when the protocol
  // changes or a reload is requested, avoiding any stale player/connection
  // state.
  return (
    <PlayerCore
      key={`${mode}-${reloadKey}`}
      mode={mode}
      onSwitch={switchMode}
      onReload={reload}
    />
  );
}
