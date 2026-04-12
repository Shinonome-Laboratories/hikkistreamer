import { StreamPlayer } from "@/components/StreamPlayer";
import { useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { useState } from "react";
import { AdminSettingsModal } from "@/components/AdminSettingsModal";

export default function StreamPage() {
  const { user, streamTitle, customEmojis } = useChat();
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col p-3">
        <StreamPlayer />
        <div className="flex items-center gap-2 mt-2">
          <h1 className="text-sm font-semibold text-foreground">{streamTitle}</h1>
          {user?.is_admin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={() => setAdminSettingsOpen(true)}
              title="Admin settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Live stream</p>
      </div>

      {user?.is_admin && (
        <AdminSettingsModal
          open={adminSettingsOpen}
          onOpenChange={setAdminSettingsOpen}
          streamTitle={streamTitle}
          customEmojis={customEmojis}
        />
      )}
    </div>
  );
}
