import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useChat } from "@/hooks/useChat";
import { StreamPlayer } from "@/components/StreamPlayer";
import { FooterBar } from "@/components/FooterBar";
import { Playlist } from "@/components/Playlist";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import {
  ChatPanelHandle,
  MAX_CHAT_HEIGHT,
  MIN_CHAT_HEIGHT,
} from "@/components/ChatPanelHandle";
import {
  CHAT_MODE_ORDER,
  TwitchChatEmbed,
  type ChatMode,
} from "@/components/TwitchChatEmbed";
import { LoginModal } from "@/components/LoginModal";
import { CustomizeModal } from "@/components/CustomizeModal";
import { UserListModal } from "@/components/UserListModal";
import { AdminSettingsModal } from "@/components/AdminSettingsModal";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { ListMusic } from "lucide-react";
import {
  CHAT_HEIGHT_KEY,
  CHAT_ONLY_KEY,
  COMMENTS_KEY,
  FOOTER_POSITION_KEY,
  TIMESTAMPS_KEY,
  readChatHeight,
  readChatOnly,
  readCommentsEnabled,
  readFooterPosition,
  readTimestampsEnabled,
  type FooterPosition,
} from "@/lib/utils";

export default function App() {
  const {
    user,
    messages,
    userCount,
    connectedUsers,
    authError,
    hasMoreHistory,
    loadingHistory,
    streamTitle,
    titleFromPlaylist,
    customEmojis,
    banners,
    playlistItems,
    playlistError,
    activeItem,
    registerUser,
    loginUser,
    guestLogin,
    sendMessage,
    uploadMedia,
    loadMoreHistory,
    deleteMsg,
    banUserAction,
    addPlaylistItem,
    removePlaylistItem,
    switchPlaylistItem,
    reorderPlaylistItem,
    requestUserList,
    customize,
    uploadAvatar,
    logout,
  } = useChat();

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [userListOpen, setUserListOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("hikkistream");
  const [commentsEnabled, setCommentsEnabled] = useState<boolean>(readCommentsEnabled);
  const [footerPosition, setFooterPosition] = useState<FooterPosition>(readFooterPosition);
  const [timestampsEnabled, setTimestampsEnabled] = useState<boolean>(readTimestampsEnabled);
  // Mobile-only: chat panel height (% of viewport) and full-screen chat mode.
  const [chatHeightPct, setChatHeightPct] = useState<number>(readChatHeight);
  const [chatOnly, setChatOnly] = useState<boolean>(readChatOnly);
  // True when the viewport is below the lg (64rem) breakpoint. Gates the
  // chat-only player teardown so a persisted chatOnly preference never
  // destroys the player on desktop.
  const [isMobile, setIsMobile] = useState<boolean>(
    () => window.matchMedia("(max-width: 63.99rem)").matches,
  );

  const toggleComments = useCallback(() => {
    setCommentsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COMMENTS_KEY, next ? "1" : "0");
      } catch {
        // Storage may be unavailable (private browsing, etc.).
      }
      return next;
    });
  }, []);

  const toggleFooterPosition = useCallback(() => {
    setFooterPosition((prev) => {
      const next = prev === "top" ? "bottom" : "top";
      try {
        localStorage.setItem(FOOTER_POSITION_KEY, next);
      } catch {
        // Storage may be unavailable (private browsing, etc.).
      }
      return next;
    });
  }, []);

  // Persist the show-timestamps preference (localStorage; default off).
  const setTimestamps = useCallback((enabled: boolean) => {
    setTimestampsEnabled(enabled);
    try {
      localStorage.setItem(TIMESTAMPS_KEY, enabled ? "1" : "0");
    } catch {
      // Storage may be unavailable (private browsing, etc.).
    }
  }, []);

  // Persist the mobile chat panel height (percent of viewport; mobile only).
  const setChatHeight = useCallback((pct: number) => {
    setChatHeightPct(pct);
    try {
      localStorage.setItem(CHAT_HEIGHT_KEY, String(pct));
    } catch {
      // Storage may be unavailable (private browsing, etc.).
    }
  }, []);

  // Persist the mobile chat-only mode (video hidden; mobile only).
  const toggleChatOnly = useCallback(() => {
    setChatOnly((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CHAT_ONLY_KEY, next ? "1" : "0");
      } catch {
        // Storage may be unavailable (private browsing, etc.).
      }
      return next;
    });
  }, []);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);

  // Maximum chat height (% of viewport) for the current layout: the chat may
  // grow until its top edge reaches the bottom of the video player, i.e. the
  // stream panel keeps the footer + banner + the video at its natural size.
  const chatMaxPct = useCallback((): number => {
    const root = rootRef.current;
    const rootH = root?.getBoundingClientRect().height;
    if (!rootH || rootH <= 0) return MAX_CHAT_HEIGHT;
    const stream = streamRef.current;
    const footer = stream?.querySelector<HTMLElement>("[data-footer]");
    const banner = stream?.querySelector<HTMLElement>("[data-banner]");
    const footerH = footer?.getBoundingClientRect().height ?? 0;
    const bannerH = banner?.getBoundingClientRect().height ?? 0;
    // The video player is a 16:9 box spanning the full width on mobile.
    const videoH = window.innerWidth * (9 / 16);
    const minStreamPx = footerH + bannerH + videoH;
    const max = 100 - (minStreamPx / rootH) * 100;
    return Math.max(MIN_CHAT_HEIGHT, Math.min(MAX_CHAT_HEIGHT, max));
  }, []);

  // Clamp the (possibly persisted) chat height to the current max after the
  // first layout, and re-clamp on resize/orientation changes. Skipped on
  // desktop (lg+) where the panel is fixed full-height. setState runs inside
  // the rAF/listener callbacks, not synchronously in the effect body.
  useEffect(() => {
    const refresh = () => {
      if (window.matchMedia("(min-width: 64rem)").matches) return;
      const max = chatMaxPct();
      setChatHeightPct((prev) => (prev > max ? max : prev));
    };
    const id = requestAnimationFrame(refresh);
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
    };
  }, [chatMaxPct]);

  // Track the mobile breakpoint (< lg) so chat-only mode can fully unmount the
  // stream player only on small screens. setState runs inside the matchMedia
  // change callback, never synchronously in the effect body.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 63.99rem)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
    };
  }, []);

  // The active Twitch channel, or null when a Twitch stream isn't playing.
  const twitchChannel =
    activeItem?.source === "twitch"
      ? (activeItem.channel ?? activeItem.label)
      : null;

  const cycleChatMode = () => {
    setChatMode((current) => {
      const next =
        CHAT_MODE_ORDER[
          (CHAT_MODE_ORDER.indexOf(current) + 1) % CHAT_MODE_ORDER.length
        ];
      return next;
    });
  };

  // Fall back to the app chat whenever the Twitch stream ends or is switched away.
  useEffect(() => {
    if (!twitchChannel) setChatMode("hikkistream");
  }, [twitchChannel]);

  // Close modal automatically once the user is authenticated
  useEffect(() => {
    if (user) setLoginModalOpen(false);
  }, [user]);

  const handleOpenUserList = () => {
    requestUserList();
    setUserListOpen(true);
  };

  // Footer bar + playlist popover; rendered above the video when the footer
  // position is "top", below it when "bottom".
  const footer = (
    <Popover open={playlistOpen} onOpenChange={setPlaylistOpen}>
      <FooterBar
        streamTitle={streamTitle}
        isAdmin={user?.is_admin ?? false}
        isModerator={user?.is_moderator ?? false}
        onOpenAdminSettings={() => setAdminSettingsOpen(true)}
        chatMode={chatMode}
        onCycleChatMode={cycleChatMode}
        twitchChannel={twitchChannel}
        commentsEnabled={commentsEnabled}
        onToggleComments={toggleComments}
        footerPosition={footerPosition}
        onToggleFooterPosition={toggleFooterPosition}
        playlistTrigger={
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="h-9 sm:h-6 gap-1"
                title="Playlist"
              >
                <ListMusic className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Playlist</span>
              </Button>
            }
          />
        }
      />
      <Playlist
        items={playlistItems}
        activeItem={activeItem}
        canManage={!!(user?.is_admin || user?.is_moderator)}
        error={playlistError}
        onAdd={addPlaylistItem}
        onRemove={removePlaylistItem}
        onSwitch={switchPlaylistItem}
        onReorder={reorderPlaylistItem}
      />
    </Popover>
  );

  return (
    <div
      ref={rootRef}
      className="h-dvh w-screen flex flex-col lg:flex-row bg-background overflow-hidden"
    >
      {/* Stream panel (hidden on mobile in chat-only mode). min-h-0 lets it
          collapse to its fixed content (footer) when the chat panel is dragged
          tall, so the chat never overflows the viewport. */}
      <div
        ref={streamRef}
        className={`min-w-0 flex flex-col flex-1 min-h-0 ${
          chatOnly ? "hidden lg:flex" : ""
        }`}
      >
        {footerPosition === "top" && footer}
        <div className="flex-1 min-h-0">
          {/* Unmount (destroy) the player entirely in mobile chat-only mode:
              HLS/WHEP/Plyr and the YouTube/Twitch embeds tear down in their
              effect cleanups, stopping downloads and audio. It is re-created
              fresh when chat-only is turned back off. */}
          {!(isMobile && chatOnly) && (
            <StreamPlayer
              activeItem={activeItem}
              canControl={!!(user?.is_admin || user?.is_moderator)}
              commentsEnabled={commentsEnabled}
              banners={banners}
            />
          )}
        </div>
        {footerPosition === "bottom" && footer}
      </div>

      {/* Chat panel */}
      <div
        className="chat-panel w-full lg:w-[360px] border-t lg:border-t-0 lg:border-l border-border flex flex-col bg-card/30"
        style={
          {
            "--chat-panel-height": `${chatOnly ? 100 : chatHeightPct}dvh`,
          } as CSSProperties
        }
      >
        <ChatPanelHandle
          heightPct={chatHeightPct}
          onHeightChange={setChatHeight}
          chatOnly={chatOnly}
          onToggleChatOnly={toggleChatOnly}
          measureMaxPct={chatMaxPct}
        />
        <ChatHeader
          user={user}
          userCount={userCount}
          onOpenUserList={handleOpenUserList}
          onOpenCustomize={() => setCustomizeOpen(true)}
          onLogout={logout}
        />
        {twitchChannel && chatMode !== "hikkistream" ? (
          chatMode === "twitch" ? (
            <div className="flex-1 min-h-0">
              <TwitchChatEmbed channel={twitchChannel} />
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="h-1/2 min-h-0 flex flex-col border-b border-border">
                <ChatMessages
                  messages={messages}
                  isAdmin={user?.is_admin ?? false}
                  isModerator={user?.is_moderator ?? false}
                  currentUserId={user?.id ?? null}
                  hasMoreHistory={hasMoreHistory}
                  loadingHistory={loadingHistory}
                  onLoadMore={loadMoreHistory}
                  onDelete={deleteMsg}
                  onBan={banUserAction}
                  customEmojis={customEmojis}
                  showTimestamps={timestampsEnabled}
                />
                <ChatInput
                  onSend={sendMessage}
                  onUploadMedia={uploadMedia}
                  disabled={!user}
                  onRequestLogin={() => setLoginModalOpen(true)}
                  customEmojis={customEmojis}
                />
              </div>
              <div className="h-1/2 min-h-0">
                <TwitchChatEmbed channel={twitchChannel} />
              </div>
            </div>
          )
        ) : (
          <>
            <ChatMessages
              messages={messages}
              isAdmin={user?.is_admin ?? false}
              isModerator={user?.is_moderator ?? false}
              currentUserId={user?.id ?? null}
              hasMoreHistory={hasMoreHistory}
              loadingHistory={loadingHistory}
              onLoadMore={loadMoreHistory}
              onDelete={deleteMsg}
              onBan={banUserAction}
              customEmojis={customEmojis}
              showTimestamps={timestampsEnabled}
            />
            <ChatInput
              onSend={sendMessage}
              onUploadMedia={uploadMedia}
              disabled={!user}
              onRequestLogin={() => setLoginModalOpen(true)}
              customEmojis={customEmojis}
            />
          </>
        )}
      </div>

      {/* Modals */}
      <LoginModal
        open={loginModalOpen && !user}
        onOpenChange={setLoginModalOpen}
        authError={authError}
        onRegister={registerUser}
        onLogin={loginUser}
        onGuest={guestLogin}
      />

      {user && (
        <>
          <CustomizeModal
            open={customizeOpen}
            onOpenChange={setCustomizeOpen}
            user={user}
            onSave={customize}
            onUploadAvatar={uploadAvatar}
            timestampsEnabled={timestampsEnabled}
            onToggleTimestamps={setTimestamps}
          />
          <UserListModal
            open={userListOpen}
            onOpenChange={setUserListOpen}
            users={connectedUsers}
          />
          {(user.is_admin || user.is_moderator) && (
            <AdminSettingsModal
              open={adminSettingsOpen}
              onOpenChange={setAdminSettingsOpen}
              user={user}
              streamTitle={streamTitle}
              titleFromPlaylist={titleFromPlaylist}
              customEmojis={customEmojis}
              banners={banners}
            />
          )}
        </>
      )}
    </div>
  );
}
