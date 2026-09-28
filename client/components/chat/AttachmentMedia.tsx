import { useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { getApiMessage } from "@/lib/api-response";
import { cn } from "@/lib/utils";
import {
  attachmentDisplayName,
  downloadChatAttachment,
  formatFileSize,
  getFileIconMeta,
} from "@/lib/chat-media";

/**
 * WhatsApp-style attachment renderers for chat bubbles (batch 3).
 *
 * All URLs must already be resolved through resolveMediaUrl() by the caller —
 * these components render whatever absolute/blob URL they are given.
 *
 *  - ImageAttachment  : rounded image (max ~300px), click -> full-screen Lightbox
 *  - VideoAttachment  : inline <video controls> + Download pill
 *  - DocumentAttachment: file card (colored ext icon, name, size, Download)
 *  - StickerAttachment: large transparent GIF/sticker image (no bubble chrome)
 *
 * Download is CORS/auth-aware (client/lib/chat-media.ts): same-origin API
 * attachments are fetched as a blob WITH the Authorization header; external
 * (Cloudinary/R2) URLs fall back to a plain anchor download.
 */

// ------------------------------------------
// Shared download button
// ------------------------------------------

export function AttachmentDownloadButton({
  url,
  filename,
  isOwn,
  className,
}: {
  url: string;
  filename: string;
  isOwn?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    if (busy || !url) return;
    setBusy(true);
    try {
      await downloadChatAttachment(url, filename);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: getApiMessage(err, "Could not download the attachment."),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        handleDownload();
      }}
      disabled={busy}
      title={`Download ${filename}`}
      aria-label={`Download ${filename}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-60",
        isOwn
          ? "bg-white/20 text-white hover:bg-white/30"
          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
      {busy ? "Saving…" : "Download"}
    </button>
  );
}

// ------------------------------------------
// Full-screen lightbox
// ------------------------------------------

export function Lightbox({
  open,
  onOpenChange,
  url,
  filename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[96vw] max-w-[96vw] border-0 bg-black/95 p-2 sm:w-[92vw] sm:max-w-[900px] sm:rounded-2xl overflow-hidden [&>button]:text-white/80 [&>button]:hover:text-white"
        aria-describedby={undefined}
      >
        {/* Visually hidden title keeps the Radix dialog a11y-complete */}
        <DialogTitle className="sr-only">{filename}</DialogTitle>
        <div className="flex flex-col items-center gap-3">
          <img
            src={url}
            alt={filename}
            className="max-h-[78dvh] w-auto max-w-full rounded-lg object-contain"
            draggable={false}
          />
          <div className="flex items-center gap-2 pb-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </a>
            <AttachmentDownloadButton
              url={url}
              filename={filename}
              isOwn
              className="bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------
// Image
// ------------------------------------------

export function ImageAttachment({
  url,
  alt,
  isOwn,
  uploading,
  className,
}: {
  url: string;
  alt?: string;
  isOwn?: boolean;
  /** Optimistic upload in flight -> spinner overlay instead of click-to-zoom. */
  uploading?: boolean;
  className?: string;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const filename = attachmentDisplayName(alt, url);

  if (uploading) {
    return (
      <div
        className={cn(
          "relative flex h-40 w-56 max-w-full items-center justify-center overflow-hidden rounded-xl bg-black/25",
          className
        )}
      >
        {url && (
          <img src={url} alt={alt || "Uploading"} className="absolute inset-0 h-full w-full object-cover opacity-40 blur-[1px]" />
        )}
        <div className="relative flex flex-col items-center gap-1.5">
          <Loader2 className={cn("h-6 w-6 animate-spin", isOwn ? "text-white" : "text-primary")} />
          <span className={cn("text-[10px] font-medium", isOwn ? "text-white/90" : "text-muted-foreground")}>
            Uploading…
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <img
        src={url}
        alt={alt || "Shared image"}
        loading="lazy"
        draggable={false}
        onClick={(e) => {
          e.stopPropagation();
          setLightboxOpen(true);
        }}
        className={cn(
          "max-h-72 w-full max-w-[300px] cursor-zoom-in rounded-xl object-cover transition-transform hover:scale-[1.015]",
          className
        )}
      />
      {lightboxOpen && (
        <Lightbox open={lightboxOpen} onOpenChange={setLightboxOpen} url={url} filename={filename} />
      )}
    </>
  );
}

// ------------------------------------------
// Video
// ------------------------------------------

export function VideoAttachment({
  url,
  name,
  isOwn,
  uploading,
}: {
  url: string;
  name?: string;
  isOwn?: boolean;
  uploading?: boolean;
}) {
  const filename = attachmentDisplayName(name, url);

  if (uploading) {
    return (
      <div className="flex h-40 w-56 max-w-full items-center justify-center rounded-xl bg-black/25">
        <div className="flex flex-col items-center gap-1.5">
          <Loader2 className={cn("h-6 w-6 animate-spin", isOwn ? "text-white" : "text-primary")} />
          <span className={cn("text-[10px] font-medium", isOwn ? "text-white/90" : "text-muted-foreground")}>
            Uploading…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <video
        src={url}
        controls
        preload="metadata"
        playsInline
        className="max-h-72 w-full max-w-[320px] rounded-xl bg-black/40"
      />
      <div className={cn("flex items-center", isOwn ? "justify-end" : "justify-start")}>
        <AttachmentDownloadButton url={url} filename={filename} isOwn={isOwn} />
      </div>
    </div>
  );
}

// ------------------------------------------
// Document card
// ------------------------------------------

export function DocumentAttachment({
  url,
  name,
  size,
  isOwn,
  uploading,
}: {
  url: string;
  name?: string;
  size?: number | null;
  isOwn?: boolean;
  uploading?: boolean;
}) {
  const filename = attachmentDisplayName(name, url);
  const icon = getFileIconMeta(filename);

  return (
    <div
      className={cn(
        "flex w-full max-w-[300px] items-center gap-2.5 rounded-xl p-2.5",
        isOwn ? "bg-black/15 dark:bg-white/10" : "bg-muted/70"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isOwn ? "bg-white/25 text-white" : icon.tileClass
        )}
        title={icon.label}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="text-[9px] font-bold tracking-wide">{icon.label}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-xs font-semibold", isOwn ? "text-white" : "text-foreground")}>
          {filename}
        </p>
        <p className={cn("text-[10px]", isOwn ? "text-white/70" : "text-muted-foreground")}>
          {uploading ? "Uploading…" : formatFileSize(size) || "Tap to download"}
        </p>
      </div>
      {!uploading && url && <AttachmentDownloadButton url={url} filename={filename} isOwn={isOwn} className="shrink-0" />}
    </div>
  );
}

// ------------------------------------------
// GIF / Sticker (transparent, bubble-less)
// ------------------------------------------

export function StickerAttachment({
  url,
  alt,
  className,
}: {
  url: string;
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src={url}
      alt={alt || "Sticker"}
      loading="lazy"
      draggable={false}
      className={cn("w-[180px] max-w-full rounded-xl object-contain", className)}
    />
  );
}
