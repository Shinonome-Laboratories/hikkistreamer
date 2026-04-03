import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SendHorizontal } from "lucide-react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-1.5 p-2 border-t border-border">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={disabled ? "Login to chat..." : "Type a message..."}
        disabled={disabled}
        maxLength={500}
        className="h-8 text-sm bg-secondary/50"
        autoComplete="off"
      />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        disabled={disabled || !value.trim()}
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </form>
  );
}
