import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface LoginModalProps {
  open: boolean;
  authError: string | null;
  onRegister: (username: string, password: string) => void;
  onLogin: (username: string, password: string) => void;
  onGuest: (username: string) => void;
}

export function LoginModal({
  open,
  authError,
  onRegister,
  onLogin,
  onGuest,
}: LoginModalProps) {
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [guestName, setGuestName] = useState("");

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (username.trim() && password) onLogin(username.trim(), password);
  };

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    if (username.trim() && password) onRegister(username.trim(), password);
  };

  const handleGuest = (e: FormEvent) => {
    e.preventDefault();
    if (guestName.trim()) onGuest(guestName.trim());
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-[360px]"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-lg">
            hikkistream
          </DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1">
              Login
            </TabsTrigger>
            <TabsTrigger value="register" className="flex-1">
              Register
            </TabsTrigger>
            <TabsTrigger value="guest" className="flex-1">
              Guest
            </TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="login-user" className="text-xs">
                  Username
                </Label>
                <Input
                  id="login-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-8 text-sm"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-pass" className="text-xs">
                  Password
                </Label>
                <Input
                  id="login-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-8 text-sm"
                  autoComplete="current-password"
                />
              </div>
              {authError && (
                <p className="text-xs text-destructive">{authError}</p>
              )}
              <Button type="submit" className="w-full h-8 text-sm">
                Login
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="register">
            <form onSubmit={handleRegister} className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="reg-user" className="text-xs">
                  Username
                </Label>
                <Input
                  id="reg-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-8 text-sm"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-pass" className="text-xs">
                  Password
                </Label>
                <Input
                  id="reg-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-8 text-sm"
                  autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                First account gets admin privileges.
              </p>
              {authError && (
                <p className="text-xs text-destructive">{authError}</p>
              )}
              <Button type="submit" className="w-full h-8 text-sm">
                Register
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="guest">
            <form onSubmit={handleGuest} className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="guest-name" className="text-xs">
                  Display Name
                </Label>
                <Input
                  id="guest-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="Choose a name..."
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Guest accounts cannot be recovered.
              </p>
              {authError && (
                <p className="text-xs text-destructive">{authError}</p>
              )}
              <Button type="submit" className="w-full h-8 text-sm">
                Join as Guest
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
