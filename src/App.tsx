import { useCallback, useEffect, useState } from "react";
import { useChat } from "@/hooks/useChat";
import { StreamPlayer } from "@/components/StreamPlayer";
import { FooterBar } from "@/components/FooterBar";
import { Playlist } from "@/components/Playlist";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
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
  COMMENTS_KEY,
  FOOTER_POSITION_KEY,
  TIMESTAMPS_KEY,
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
                className="h-6 gap-1"
                title="Playlist"
              >
                <ListMusic className="h-3.5 w-3.5" />
                <span>Playlist</span>
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
    <div className="h-screen w-screen flex flex-col lg:flex-row bg-background overflow-hidden">
      {/* Stream panel */}
      <div className="flex-1 min-w-0 flex flex-col">
        {footerPosition === "top" && footer}
        <div className="flex-1 min-h-0">
          <StreamPlayer
            activeItem={activeItem}
            canControl={!!(user?.is_admin || user?.is_moderator)}
            commentsEnabled={commentsEnabled}
            banners={banners}
          />
        </div>
        {footerPosition === "bottom" && footer}
      </div>

      {/* Chat panel */}
      <div className="w-full lg:w-[360px] h-[50vh] lg:h-screen border-t lg:border-t-0 lg:border-l border-border flex flex-col bg-card/30">
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
