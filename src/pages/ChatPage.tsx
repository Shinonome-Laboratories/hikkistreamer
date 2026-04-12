import { useState, useEffect } from "react";
import { useChat } from "@/hooks/useChat";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { LoginModal } from "@/components/LoginModal";
import { CustomizeModal } from "@/components/CustomizeModal";
import { UserListModal } from "@/components/UserListModal";
import { AdminSettingsModal } from "@/components/AdminSettingsModal";

export default function ChatPage() {
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
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);

  useEffect(() => {
    if (user) setLoginModalOpen(false);
  }, [user]);

  const handleOpenUserList = () => {
    requestUserList();
    setUserListOpen(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 bg-card/30">
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
          customEmojis={customEmojis}
        />
        <ChatInput
          onSend={sendMessage}
          disabled={!user}
          onRequestLogin={() => setLoginModalOpen(true)}
          customEmojis={customEmojis}
        />
      </div>

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
