import { useState, useEffect } from "react";
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
    customEmojis,
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

  return (
    <div className="h-screen w-screen flex flex-col lg:flex-row bg-background overflow-hidden">
      {/* Stream panel */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 pt-2 pb-0 lg:pt-3 lg:pb-0">
          <StreamPlayer activeItem={activeItem} />
        </div>
        <Popover open={playlistOpen} onOpenChange={setPlaylistOpen}>
          <FooterBar
            streamTitle={streamTitle}
            isAdmin={user?.is_admin ?? false}
            onOpenAdminSettings={() => setAdminSettingsOpen(true)}
            chatMode={chatMode}
            onCycleChatMode={cycleChatMode}
            twitchChannel={twitchChannel}
            playlistTrigger={
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6"
                    title="Playlist"
                    aria-label="Playlist"
                  >
                    <ListMusic className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            }
          />
          <Playlist
            items={playlistItems}
            activeItem={activeItem}
            isAdmin={user?.is_admin ?? false}
            error={playlistError}
            onAdd={addPlaylistItem}
            onRemove={removePlaylistItem}
            onSwitch={switchPlaylistItem}
          />
        </Popover>
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
                  currentUserId={user?.id ?? null}
                  hasMoreHistory={hasMoreHistory}
                  loadingHistory={loadingHistory}
                  onLoadMore={loadMoreHistory}
                  onDelete={deleteMsg}
                  onBan={banUserAction}
                  customEmojis={customEmojis}
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
              currentUserId={user?.id ?? null}
              hasMoreHistory={hasMoreHistory}
              loadingHistory={loadingHistory}
              onLoadMore={loadMoreHistory}
              onDelete={deleteMsg}
              onBan={banUserAction}
              customEmojis={customEmojis}
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
          />
          <UserListModal
            open={userListOpen}
            onOpenChange={setUserListOpen}
            users={connectedUsers}
          />
          {user.is_admin && (
            <AdminSettingsModal
              open={adminSettingsOpen}
              onOpenChange={setAdminSettingsOpen}
              streamTitle={streamTitle}
              customEmojis={customEmojis}
            />
          )}
        </>
      )}
    </div>
  );
}
