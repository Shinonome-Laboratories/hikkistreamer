import { StreamPlayer } from "@/components/StreamPlayer";
import { useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { useState } from "react";
import { readCommentsEnabled } from "@/lib/utils";
import { AdminSettingsModal } from "@/components/AdminSettingsModal";

export default function StreamPage() {
  const { user, streamTitle, titleFromPlaylist, customEmojis, banners, activeItem } = useChat();
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [commentsEnabled] = useState<boolean>(readCommentsEnabled);

  return (
    <div className="group relative h-dvh w-screen bg-background overflow-hidden">
      <div className="absolute inset-0">
        <StreamPlayer
          activeItem={activeItem}
          canControl={!!(user?.is_admin || user?.is_moderator)}
          commentsEnabled={commentsEnabled}
        />
      </div>
      <div className="absolute top-3 left-3 right-3 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-200">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {streamTitle}
          </h1>
          {(user?.is_admin || user?.is_moderator) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground pointer-events-auto"
              onClick={() => setAdminSettingsOpen(true)}
              title={user.is_admin ? "Admin settings" : "Moderator settings"}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          Live stream
        </p>
      </div>

      {(user?.is_admin || user?.is_moderator) && (
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
    </div>
  );
}
