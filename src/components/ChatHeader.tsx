import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Settings, LogOut, Shield } from "lucide-react";
import type { User } from "../../shared/types";

interface ChatHeaderProps {
  user: User | null;
  userCount: number;
  onOpenUserList: () => void;
  onOpenCustomize: () => void;
  onLogout: () => void;
}

export function ChatHeader({
  user,
  userCount,
  onOpenUserList,
  onOpenCustomize,
  onLogout,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/50">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 gap-1">
          <Users className="h-3 w-3" />
          {userCount} User{userCount === 1 ? "" : "s"} Online
        </Badge>
      </div>
      <div className="flex items-center gap-0.5">
        {user && (
          <>
            <span
              className="text-xs font-medium mr-1 flex items-center gap-1"
              style={{ color: user.username_color }}
            >
              {user.is_admin ? (
                <Shield className="h-3 w-3 text-yellow-500" />
              ) : user.is_moderator ? (
                <Shield className="h-3 w-3 text-sky-500" />
              ) : null}
              {user.username}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onOpenUserList}
              title="User list"
            >
              <Users className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onOpenCustomize}
              title="Customize"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onLogout}
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
