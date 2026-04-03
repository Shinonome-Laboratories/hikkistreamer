import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import type { User } from "../../shared/types";

interface UserListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: User[];
}

export function UserListModal({
  open,
  onOpenChange,
  users,
}: UserListModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Users Online
            <Badge variant="secondary" className="text-xs">
              {users.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/30"
            >
              <Avatar className="h-6 w-6">
                {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                <AvatarFallback className="text-[10px]">
                  {user.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span
                className="text-sm font-medium flex items-center gap-1"
                style={{ color: user.username_color }}
              >
                {user.is_admin && (
                  <Shield className="h-3 w-3 text-yellow-500" />
                )}
                {user.username}
              </span>
              {user.is_guest && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 ml-auto">
                  guest
                </Badge>
              )}
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No users connected
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
