import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, CornerUpLeft, Pencil, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/pages/Chat";

/**
 * Floating context menu for a chat message (reply / copy / edit / delete).
 * Rendered in a fixed position near the triggering pointer — works for both
 * the desktop hover "⋯" button and the mobile long-press gesture.
 */
export function MessageActionMenu({
  target,
  isOwn,
  canCopy,
  canEdit,
  canDeleteEveryone,
  onReply,
  onCopy,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onClose,
}: {
  /** The message the menu is open for + the anchor point (viewport coords). */
  target: { message: ChatMessage; x: number; y: number } | null;
  isOwn: boolean;
  canCopy: boolean;
  canEdit: boolean;
  canDeleteEveryone: boolean;
  onReply: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDeleteForMe: (message: ChatMessage) => void;
  onDeleteForEveryone: (message: ChatMessage) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Clamp the menu into the viewport after mount (flip above/left as needed).
  useLayoutEffect(() => {
    if (!target) return;
    const el = ref.current;
    const w = el?.offsetWidth || 200;
    const h = el?.offsetHeight || 220;
    let x = target.x + 4;
    let y = target.y + 4;
    if (x + w > window.innerWidth - 8) x = Math.max(8, target.x - w - 4);
    if (y + h > window.innerHeight - 8) y = Math.max(8, target.y - h - 4);
    setPos({ x, y });
  }, [target]);

  useEffect(() => {
    if (!target) {
      setPos(null);
      return;
    }
    const close = (e: Event) => {
      if (e instanceof PointerEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("touchstart", close as EventListener, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("touchstart", close as EventListener, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [target, onClose]);

  if (!target || !pos) return null;
  const { message } = target;

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Message actions"
      className="fixed z-[90] min-w-[190px] rounded-xl border border-border bg-popover p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" role="menuitem" className={item} onClick={() => onReply(message)}>
        <CornerUpLeft className="h-4 w-4 text-muted-foreground" /> Reply
      </button>
      {canCopy && (
        <button type="button" role="menuitem" className={item} onClick={() => onCopy(message)}>
          <Copy className="h-4 w-4 text-muted-foreground" /> Copy
        </button>
      )}
      {isOwn && canEdit && (
        <button type="button" role="menuitem" className={item} onClick={() => onEdit(message)}>
          <Pencil className="h-4 w-4 text-muted-foreground" /> Edit
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={`${item} text-red-600 hover:bg-red-500/10 focus-visible:bg-red-500/10 dark:text-red-400`}
        onClick={() => onDeleteForMe(message)}
      >
        <Trash2 className="h-4 w-4" /> Delete for me
      </button>
      {isOwn && canDeleteEveryone && (
        <button
          type="button"
          role="menuitem"
          className={`${item} text-red-600 hover:bg-red-500/10 focus-visible:bg-red-500/10 dark:text-red-400`}
          onClick={() => onDeleteForEveryone(message)}
        >
          <Trash2 className="h-4 w-4" /> Delete for everyone
        </button>
      )}
    </div>
  );
}
