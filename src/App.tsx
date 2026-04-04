import { useState, useEffect } from "react";
import { useChat } from "@/hooks/useChat";
import { StreamPlayer } from "@/components/StreamPlayer";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { LoginModal } from "@/components/LoginModal";
import { CustomizeModal } from "@/components/CustomizeModal";
import { UserListModal } from "@/components/UserListModal";

export default function App() {
  const {
    user,
    messages,
    userCount,
    connectedUsers,
    authError,
    hasMoreHistory,
    loadingHistory,
    registerUser,
    loginUser,
    guestLogin,
    sendMessage,
    loadMoreHistory,
    deleteMsg,
    banUserAction,
    requestUserList,
    customize,
    uploadAvatar,
    logout,
  } = useChat();

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [userListOpen, setUserListOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

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
        <div className="p-2 pb-0 lg:p-3 lg:pb-0">
          <StreamPlayer />
        </div>
        <div className="flex-1 p-2 lg:p-3">
          <h1 className="text-sm font-semibold text-foreground">hikkistream</h1>
          <p className="text-xs text-muted-foreground">Live stream</p>
        </div>
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
        <ChatMessages
          messages={messages}
          isAdmin={user?.is_admin ?? false}
          currentUserId={user?.id ?? null}
          hasMoreHistory={hasMoreHistory}
          loadingHistory={loadingHistory}
          onLoadMore={loadMoreHistory}
          onDelete={deleteMsg}
          onBan={banUserAction}
        />
        <ChatInput onSend={sendMessage} disabled={!user} onRequestLogin={() => setLoginModalOpen(true)} />
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
        </>
      )}
    </div>
  );
}
