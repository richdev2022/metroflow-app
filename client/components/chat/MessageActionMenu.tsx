import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, CornerUpLeft, Download, Forward, ImageDown, Languages, ListChecks, Pencil, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/pages/Chat";

/**
 * Floating context menu for a chat message (reply / copy / edit / delete /
 * forward / select / image actions / MetricAi translate). Rendered in a fixed
 * position near the triggering pointer — works for both the desktop hover "⋯"
 * button and the mobile long-press gesture.
 */
export function MessageActionMenu({
  target,
  isOwn,
  canCopy,
  canEdit,
  canDeleteEveryone,
  canForward = true,
  hasImageAttachment = false,
  hasDownloadableAttachment = false,
  canTranslate = false,
  onReply,
  onCopy,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onForward,
  onSelect,
  onCopyImage,
  onDownloadAttachment,
  onTranslate,
  onClose,
}: {
  /** The message the menu is open for + the anchor point (viewport coords). */
  target: { message: ChatMessage; x: number; y: number } | null;
  isOwn: boolean;
  canCopy: boolean;
  canEdit: boolean;
  canDeleteEveryone: boolean;
  /** Forwarding is available for every non-tombstone message. */
  canForward?: boolean;
  /** Message carries an image — enables "Copy image". */
  hasImageAttachment?: boolean;
  /** Message carries any downloadable attachment (image/video/doc/audio). */
  hasDownloadableAttachment?: boolean;
  /** MetricAi available — enables "Translate". */
  canTranslate?: boolean;
  onReply: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDeleteForMe: (message: ChatMessage) => void;
  onDeleteForEveryone: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  onSelect?: (message: ChatMessage) => void;
  onCopyImage?: (message: ChatMessage) => void;
  onDownloadAttachment?: (message: ChatMessage) => void;
  onTranslate?: (message: ChatMessage) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Clamp the menu into the viewport after mount (flip above/left as needed).
  useLayoutEffect(() => {
    if (!target) return;
    const el = ref.current;
    const w = el?.offsetWidth || 200;
    const h = el?.offsetHeight || 260;
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
  const divider = "my-1 h-px bg-border/70";

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
      {canForward && onForward && (
        <button type="button" role="menuitem" className={item} onClick={() => onForward(message)}>
          <Forward className="h-4 w-4 text-muted-foreground" /> Forward
        </button>
      )}
      {canCopy && (
        <button type="button" role="menuitem" className={item} onClick={() => onCopy(message)}>
          <Copy className="h-4 w-4 text-muted-foreground" /> Copy
        </button>
      )}
      {hasImageAttachment && onCopyImage && (
        <button type="button" role="menuitem" className={item} onClick={() => onCopyImage(message)}>
          <ImageDown className="h-4 w-4 text-muted-foreground" /> Copy image
        </button>
      )}
      {hasDownloadableAttachment && onDownloadAttachment && (
        <button type="button" role="menuitem" className={item} onClick={() => onDownloadAttachment(message)}>
          <Download className="h-4 w-4 text-muted-foreground" /> Download
        </button>
      )}
      {isOwn && canEdit && (
        <button type="button" role="menuitem" className={item} onClick={() => onEdit(message)}>
          <Pencil className="h-4 w-4 text-muted-foreground" /> Edit
        </button>
      )}
      {onSelect && (
        <button type="button" role="menuitem" className={item} onClick={() => onSelect(message)}>
          <ListChecks className="h-4 w-4 text-muted-foreground" /> Select messages
        </button>
      )}
      {canTranslate && onTranslate && (
        <>
          <div className={divider} />
          <button type="button" role="menuitem" className={item} onClick={() => onTranslate(message)}>
            <Languages className="h-4 w-4 text-violet-500" /> Translate
          </button>
        </>
      )}
      <div className={divider} />
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
