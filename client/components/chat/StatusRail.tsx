import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Heart, Eye, Trash2, Repeat2, X, Plus, Reply, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { AudioUtils } from "@/lib/audio-utils";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";
import { resolveMediaUrl } from "@/lib/media-url";
import { uploadChatMedia } from "@/lib/meetings-chat-calls";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * WhatsApp-style STATUS (24h stories) for the Chat sidebar.
 *
 * Self-contained: fetches GET /statuses, renders the rail (My status +
 * per-author avatars with seen/unseen rings), the composer dialog
 * (text + background colour + optional image) and the full-screen
 * viewer (auto-advance, view tracking, like, reply → DM, repost,
 * delete own, views/likes counters + who-liked for the poster).
 *
 * The only coupling to Chat.tsx is `onReplyToStatus(authorId, prefill)`:
 * replying opens (or creates) the DM with the author and prefills the
 * composer — the chat page owns conversations.
 */

const BG_COLORS = [
  "#1E3A8A", "#7C2D12", "#065F46", "#4C1D95", "#9D174D",
  "#0E7490", "#B45309", "#374151", "#B91C1C", "#1D4ED8",
] as const;
const MAX_TEXT = 700;
const SLIDE_MS = 7000;

interface StatusRow {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar: string | null;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  backgroundColor: string;
  repostedFrom: string | null;
  repostAuthor: string | null;
  createdAt: string;
  expiresAt: string;
  isMine: boolean;
  viewsCount: number;
  viewed: boolean;
  likesCount: number;
  liked: boolean;
}

interface StatusGroup {
  userId: string;
  authorName: string;
  authorAvatar: string | null;
  isMine: boolean;
  allViewed: boolean;
  statuses: StatusRow[];
}

const CURRENT = {
  id: () => localStorage.getItem("userId") || "",
  name: () => localStorage.getItem("userName") || "You",
  avatar: () => localStorage.getItem("userAvatar") || "",
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function fetchStatuses(): Promise<StatusRow[]> {
  const res = await api.get("/statuses");
  return unwrapApiData<{ statuses: StatusRow[] }>(res.data, "Failed to load statuses").statuses || [];
}

export function StatusRail({ onReplyToStatus }: { onReplyToStatus: (authorId: string, prefill: string) => void }) {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerAuthor, setViewerAuthor] = useState<StatusGroup | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatuses(await fetchStatuses());
    } catch {
      /* rail is best-effort — chat must never break because of it */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const groups = useMemo<StatusGroup[]>(() => {
    const map = new Map<string, StatusGroup>();
    for (const s of statuses) {
      let g = map.get(s.userId);
      if (!g) {
        g = { userId: s.userId, authorName: s.authorName, authorAvatar: s.authorAvatar, isMine: s.isMine, allViewed: true, statuses: [] };
        map.set(s.userId, g);
      }
      g.statuses.push(s);
      if (!s.viewed) g.allViewed = false;
    }
    const list = [...map.values()];
    // Mine first, then unseen authors, then the rest; newest first inside.
    list.sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
      return new Date(b.statuses[0]?.createdAt || 0).getTime() - new Date(a.statuses[0]?.createdAt || 0).getTime();
    });
    for (const g of list) g.statuses.sort((x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime());
    return list;
  }, [statuses]);

  const myGroup = groups.find((g) => g.isMine) || null;

  const openViewerFor = (authorId: string) => {
    const g = groups.find((x) => x.userId === authorId);
    if (g) setViewerAuthor(g);
  };

  const patchStatus = (id: string, patch: Partial<StatusRow>) => {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <>
      <div className="px-3 py-2.5 border-b border-border/70">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setComposerOpen(true)}
          >
            Add status
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" data-testid="status-rail">
            {/* My status */}
            <button
              type="button"
              className="flex flex-col items-center gap-1 shrink-0 w-16"
              onClick={() => (myGroup ? openViewerFor(myGroup.userId) : setComposerOpen(true))}
              aria-label={myGroup ? "View my status" : "Add a status"}
            >
              <span className={cn("relative flex h-14 w-14 items-center justify-center rounded-full",
                myGroup ? (myGroup.allViewed ? "ring-2 ring-muted-foreground/30" : "ring-2 ring-green-500 ring-offset-2 ring-offset-background") : "ring-2 ring-dashed ring-muted-foreground/40")}>
                {CURRENT.avatar() ? (
                  <img src={CURRENT.avatar()} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {CURRENT.name().slice(0, 1).toUpperCase()}
                  </span>
                )}
                {!myGroup && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                    <Plus className="h-3 w-3" />
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">My status</span>
            </button>
            {/* Others */}
            {groups.filter((g) => !g.isMine).map((g) => (
              <button
                key={g.userId}
                type="button"
                className="flex flex-col items-center gap-1 shrink-0 w-16"
                onClick={() => openViewerFor(g.userId)}
                aria-label={`View ${g.authorName}'s status`}
              >
                <span className={cn("flex h-14 w-14 items-center justify-center rounded-full",
                  g.allViewed ? "ring-2 ring-muted-foreground/30" : "ring-2 ring-green-500 ring-offset-2 ring-offset-background")}>
                  {g.authorAvatar ? (
                    <img src={resolveMediaUrl(g.authorAvatar)} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {g.authorName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="w-full truncate text-center text-[11px] text-muted-foreground">{g.authorName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <StatusComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onPosted={() => refresh()}
      />
      {viewerAuthor && (
        <StatusViewer
          group={viewerAuthor}
          onClose={() => { setViewerAuthor(null); refresh(); }}
          onPatch={patchStatus}
          onReplyToStatus={(authorId, prefill) => {
            setViewerAuthor(null);
            onReplyToStatus(authorId, prefill);
          }}
          onToast={toast}
        />
      )}
    </>
  );
}

function StatusComposerDialog({ open, onOpenChange, onPosted }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPosted: () => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [bg, setBg] = useState<string>(BG_COLORS[0]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = () => { setText(""); setMediaUrl(""); setBg(BG_COLORS[0]); };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const r = await uploadChatMedia(f);
      setMediaUrl(r.url);
    } catch (err) {
      toast({ variant: "destructive", title: "Upload failed", description: getApiMessage(err, "Could not upload the image") });
    } finally {
      setUploading(false);
    }
  };

  const post = async () => {
    if (!text.trim() && !mediaUrl) {
      toast({ variant: "destructive", title: "Nothing to post", description: "Write something or attach an image" });
      return;
    }
    setPosting(true);
    try {
      await api.post("/statuses", { content: text.trim(), backgroundColor: bg, ...(mediaUrl ? { mediaUrl, mediaType: "image" } : {}) });
      AudioUtils.ensureInitialized().catch(() => {});
      AudioUtils.playStatusPublished().catch(() => {});
      toast({ title: "Status posted" });
      reset();
      onOpenChange(false);
      onPosted();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to post", description: getApiMessage(err, "Could not post the status") });
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New status</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div
            className="rounded-xl p-5 min-h-[140px] flex items-center justify-center text-center transition-colors"
            style={{ backgroundColor: mediaUrl ? undefined : bg }}
          >
            {mediaUrl ? (
              <img src={resolveMediaUrl(mediaUrl)} alt="" className="max-h-48 rounded-lg object-contain" />
            ) : (
              <Textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
                placeholder="What's on your mind?"
                className="min-h-[110px] resize-none border-0 bg-transparent text-center text-lg font-medium placeholder:text-white/60 focus-visible:ring-0"
                style={{ color: "#fff" }}
              />
            )}
          </div>
          {!mediaUrl && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1.5 flex-wrap">
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Background ${c}`}
                    onClick={() => setBg(c)}
                    className={cn("h-6 w-6 rounded-full border-2 transition-transform", bg === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">{text.length}/{MAX_TEXT}</span>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" type="button" disabled={uploading || posting} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {mediaUrl ? "Replace image" : "Add image"}
            </Button>
            {mediaUrl && (
              <Button variant="ghost" size="sm" type="button" onClick={() => setMediaUrl("")}>Remove image</Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={posting}>Cancel</Button>
          <Button onClick={post} disabled={posting || uploading || (!text.trim() && !mediaUrl)}>
            {posting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Post status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusViewer({ group, onClose, onPatch, onReplyToStatus, onToast }: {
  group: StatusGroup;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<StatusRow>) => void;
  onReplyToStatus: (authorId: string, prefill: string) => void;
  onToast: ReturnType<typeof useToast>["toast"];
}) {
  const [idx, setIdx] = useState(0);
  const [likesOpen, setLikesOpen] = useState(false);
  const [likeNames, setLikeNames] = useState<Array<{ userId: string; name: string }>>([]);
  const [deleting, setDeleting] = useState(false);
  const progressRef = useRef<number | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());
  const status = group.statuses[Math.min(idx, group.statuses.length - 1)];

  const next = useCallback(() => {
    setIdx((i) => (i + 1 < group.statuses.length ? i + 1 : -2));
  }, [group.statuses.length]);

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (idx === -2) { onClose(); return; }
  }, [idx, onClose]);

  // Auto-advance + view tracking per slide
  useEffect(() => {
    if (idx === -2 || !status) return;
    if (!status.isMine && !viewedRef.current.has(status.id)) {
      viewedRef.current.add(status.id);
      api.post(`/statuses/${status.id}/view`).then((res) => {
        const n = (res.data?.data as any)?.viewsCount;
        if (typeof n === "number") onPatch(status.id, { viewsCount: n, viewed: true });
      }).catch(() => {});
    }
    window.clearTimeout(progressRef.current ?? undefined);
    progressRef.current = window.setTimeout(next, SLIDE_MS);
    return () => window.clearTimeout(progressRef.current ?? undefined);
  }, [idx, status, next, onPatch]);

  const toggleLike = async () => {
    if (!status || status.isMine) return;
    const optimistic = !status.liked;
    onPatch(status.id, { liked: optimistic, likesCount: status.likesCount + (optimistic ? 1 : -1) });
    try {
      const res = await api.post(`/statuses/${status.id}/like`);
      const d = (res.data?.data as any) || {};
      onPatch(status.id, { liked: !!d.liked, likesCount: typeof d.likesCount === "number" ? d.likesCount : status.likesCount });
    } catch {
      onPatch(status.id, { liked: !optimistic, likesCount: status.likesCount });
      onToast({ variant: "destructive", title: "Could not update the like" });
    }
  };

  const repost = async () => {
    if (!status) return;
    try {
      await api.post(`/statuses/${status.id}/repost`);
      onToast({ title: "Status reposted to your rail" });
      onClose();
    } catch (err) {
      onToast({ variant: "destructive", title: "Repost failed", description: getApiMessage(err, "Could not repost the status") });
    }
  };

  const remove = async () => {
    if (!status) return;
    setDeleting(true);
    try {
      await api.delete(`/statuses/${status.id}`);
      onToast({ title: "Status deleted" });
      onClose();
    } catch (err) {
      onToast({ variant: "destructive", title: "Delete failed", description: getApiMessage(err, "Could not delete the status") });
    } finally {
      setDeleting(false);
    }
  };

  const showLikes = async () => {
    if (!status) return;
    try {
      const res = await api.get(`/statuses/${status.id}/likes`);
      const likes = unwrapApiData<{ likes: Array<{ userId: string; name: string }> }>(res.data, "Failed to load likes").likes || [];
      setLikeNames(likes);
      setLikesOpen(true);
    } catch (err) {
      onToast({ variant: "destructive", title: "Failed to load likes", description: getApiMessage(err, "Only the poster can see who liked") });
    }
  };

  if (!status) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" role="dialog" aria-modal="true" data-testid="status-viewer">
      <button type="button" aria-label="Close status viewer" className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={onClose}>
        <X className="h-5 w-5" />
      </button>

      <div className="relative w-full max-w-[420px] mx-4">
        {/* Progress bars */}
        <div className="flex gap-1 mb-3">
          {group.statuses.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 rounded-full bg-white/25 overflow-hidden">
              <div
                className={cn("h-full bg-white", i < idx && "w-full", i === idx && "statusbar-progress", i > idx && "w-0")}
                style={i === idx ? { animationDuration: `${SLIDE_MS}ms` } : undefined}
              />
            </div>
          ))}
        </div>

        {/* Author header */}
        <div className="flex items-center gap-3 mb-3">
          {group.authorAvatar ? (
            <img src={resolveMediaUrl(group.authorAvatar)} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/40" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
              {group.authorName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-white">{group.isMine ? "My status" : group.authorName}</p>
            <p className="text-[11px] text-white/60">{timeAgo(status.createdAt)} · expires {new Date(status.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>

        {/* Slide body */}
        <div
          className="relative rounded-2xl overflow-hidden select-none"
          style={{ backgroundColor: status.mediaUrl ? undefined : status.backgroundColor, minHeight: status.mediaUrl ? undefined : 420 }}
        >
          {status.mediaUrl ? (
            <img src={resolveMediaUrl(status.mediaUrl)} alt="status" className="max-h-[70vh] w-full object-contain" />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center p-8">
              <p className="whitespace-pre-wrap text-center text-xl font-semibold leading-relaxed text-white">{status.content}</p>
            </div>
          )}
          {status.repostedFrom && (
            <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-black/45 px-3 py-2 text-[11px] text-white/90 backdrop-blur">
              <Repeat2 className="mr-1 inline h-3.5 w-3.5" />Reposted from {status.repostAuthor || "a teammate"}
            </div>
          )}
        </div>

        {/* Nav arrows (desktop) */}
        {group.statuses.length > 1 && (
          <>
            <button type="button" aria-label="Previous" onClick={prev} className="absolute -left-12 top-1/2 hidden md:flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" aria-label="Next" onClick={next} className="absolute -right-12 top-1/2 hidden md:flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        {/* Tap zones (mobile) */}
        <button type="button" aria-label="Previous status" className="absolute inset-y-0 left-0 w-1/4 opacity-0 md:hidden" onClick={prev} />
        <button type="button" aria-label="Next status" className="absolute inset-y-0 right-0 w-1/4 opacity-0 md:hidden" onClick={next} />

        {/* Footer actions */}
        <div className="mt-4 flex items-center gap-2">
          {status.isMine ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white" data-testid="status-views">
                <Eye className="h-3.5 w-3.5" />{status.viewsCount} view{status.viewsCount === 1 ? "" : "s"}
              </span>
              <button type="button" onClick={showLikes} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20" data-testid="status-likes-count">
                <Heart className={cn("h-3.5 w-3.5", status.likesCount > 0 && "fill-red-500 text-red-500")} />{status.likesCount}
              </button>
              <div className="flex-1" />
              <Button variant="destructive" size="sm" onClick={remove} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}Delete
              </Button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleLike}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
                data-testid="status-like"
              >
                <Heart className={cn("h-4 w-4", status.liked ? "fill-red-500 text-red-500" : "text-white")} />
                {status.liked ? "Liked" : "Like"}
              </button>
              <button
                type="button"
                onClick={() => onReplyToStatus(group.userId, `Replied to ${group.authorName}'s status${status.content ? `: ${status.content.slice(0, 120)}` : ""}`)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
                data-testid="status-reply"
              >
                <Reply className="h-4 w-4" />Reply
              </button>
              <button
                type="button"
                onClick={repost}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
                data-testid="status-repost"
              >
                <Repeat2 className="h-4 w-4" />Repost
              </button>
              <div className="flex-1" />
              <span className="inline-flex items-center gap-1 text-[11px] text-white/60">
                <Eye className="h-3.5 w-3.5" />{status.viewsCount}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Who-liked sheet */}
      <Dialog open={likesOpen} onOpenChange={setLikesOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Liked by</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {likeNames.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No likes yet</p>
            ) : likeNames.map((l) => (
              <div key={l.userId} className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {(l.name || "?").slice(0, 1).toUpperCase()}
                </span>
                {l.name}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
