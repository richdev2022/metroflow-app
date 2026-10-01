import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Idea, CreateIdeaInput } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Layout from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  Plus,
  Loader2,
  Lightbulb,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Inbox,
  ArrowUpDown,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Status design tokens                                                */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<
  string,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    stripClass: string;
    iconClass: string;
    tileClass: string;
    icon: React.ReactNode;
  }
> = {
  under_review: {
    label: "Under review",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    dotClass: "bg-amber-500",
    stripClass: "from-amber-400 via-orange-400 to-amber-300",
    iconClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    tileClass: "from-amber-500/15 to-orange-500/5 text-amber-700 dark:text-amber-400",
    icon: <Clock className="h-4 w-4" />,
  },
  executed: {
    label: "Executed",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
    stripClass: "from-emerald-400 via-teal-400 to-emerald-300",
    iconClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    tileClass: "from-emerald-500/15 to-teal-500/5 text-emerald-700 dark:text-emerald-400",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  rejected: {
    label: "Rejected",
    badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
    dotClass: "bg-rose-500",
    stripClass: "from-rose-400 via-red-400 to-rose-300",
    iconClass: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    tileClass: "from-rose-500/15 to-red-500/5 text-rose-700 dark:text-rose-400",
    icon: <XCircle className="h-4 w-4" />,
  },
};

const statusMeta = (status?: string) =>
  STATUS_META[status || "under_review"] ?? STATUS_META.under_review;

/* Deterministic avatar gradient per author — 7 palette pairs. */
const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-500",
  "from-violet-500 to-purple-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-sky-500",
  "from-fuchsia-500 to-violet-500",
];
const avatarGradient = (name?: string) => {
  const key = (name || "?").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};
const initialsOf = (name?: string) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

type StatusFilter = "all" | "under_review" | "executed" | "rejected";
type SortKey = "newest" | "oldest" | "title";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [deleting, setDeleting] = useState<Idea | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [ideaData, setIdeaData] = useState<CreateIdeaInput>({ title: "", description: "" });

  // Search / filter / sort toolbar state.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  useEffect(() => {
    fetchIdeas();
  }, []);

  const fetchIdeas = async () => {
    try {
      const response = await api.get("/ideas");
      const data = response.data;
      // Tolerate both the {success, data} envelope and a raw array
      const list = Array.isArray(data) ? data : data?.data || [];
      setIdeas(list);
    } catch (error) {
      console.error("Failed to fetch ideas:", error);
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => setIdeaData({ title: "", description: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ideaData.title.trim()) {
      toast({ variant: "destructive", title: "Give your idea a title first" });
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/ideas", ideaData);
      setIsFormOpen(false);
      resetForm();
      toast({ title: "Idea created", description: "Your idea is now under review." });
      fetchIdeas();
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to create idea" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !ideaData.title.trim()) return;
    setSubmitting(true);
    try {
      await api.put(`/ideas/${editing.id}`, {
        title: ideaData.title,
        description: ideaData.description,
      });
      setEditing(null);
      resetForm();
      toast({ title: "Idea updated" });
      fetchIdeas();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to update idea",
        description: error?.response?.data?.error || "You may only edit your own ideas.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await api.delete(`/ideas/${deleting.id}`);
      toast({ title: "Idea deleted" });
      setDeleting(null);
      fetchIdeas();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to delete idea",
        description: error?.response?.data?.error || "You may only delete your own ideas.",
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleStatusChange = async (ideaId: string, status: string) => {
    try {
      setUpdatingId(ideaId);
      // Route order on the backend: PUT /ideas/:id/status is registered before
      // PUT /ideas/:id, so this reaches the dedicated status handler.
      await api.put(`/ideas/${ideaId}/status`, { status });
      toast({ title: "Status updated", description: `Idea marked as "${statusMeta(status).label}"` });
      await fetchIdeas();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to update status",
        description:
          error.response?.data?.error ||
          error.response?.data?.message ||
          "Only admins and managers can update idea status",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  /* ---------------- derived data: stats + search/filter/sort ------- */
  const stats = useMemo(() => {
    const s = { all: ideas.length, under_review: 0, executed: 0, rejected: 0 };
    for (const i of ideas) {
      const k = (i.status || "under_review") as keyof typeof s;
      if (k in s) s[k] += 1;
    }
    return s;
  }, [ideas]);

  const visibleIdeas = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = ideas.filter((i) => {
      if (statusFilter !== "all" && (i.status || "under_review") !== statusFilter) return false;
      if (!q) return true;
      return (
        i.title?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        i.userName?.toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sortKey === "title") return (a.title || "").localeCompare(b.title || "");
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return sortKey === "newest" ? tb - ta : ta - tb;
    });
    return list;
  }, [ideas, query, statusFilter, sortKey]);

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (idea: Idea) => {
    setEditing(idea);
    setIdeaData({ title: idea.title || "", description: idea.description || "" });
  };

  const hasActiveFilters = query.trim() !== "" || statusFilter !== "all";

  /* ---------------- render ----------------------------------------- */
  return (
    <Layout>
      <div className="container mx-auto max-w-7xl p-4 pb-10">
        {/* Hero header */}
        <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-6 shadow-lg shadow-blue-600/20 sm:p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
                <Lightbulb className="h-7 w-7 text-amber-200" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Ideas</h1>
                <p className="mt-0.5 text-sm text-blue-100/90">
                  Capture sparks, share them with your team, and track them to execution.
                </p>
              </div>
            </div>
            <Button
              onClick={openCreate}
              size="lg"
              className="w-full shrink-0 bg-white text-blue-700 shadow-lg hover:bg-blue-50 sm:w-auto"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              New Idea
            </Button>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              { key: "all", label: "All ideas", icon: <Inbox className="h-4 w-4" />, cls: "from-blue-500/15 to-indigo-500/5 text-blue-700 dark:text-blue-400" },
              { key: "under_review", label: "Under review", icon: <Clock className="h-4 w-4" />, cls: STATUS_META.under_review.tileClass },
              { key: "executed", label: "Executed", icon: <CheckCircle2 className="h-4 w-4" />, cls: STATUS_META.executed.tileClass },
              { key: "rejected", label: "Rejected", icon: <XCircle className="h-4 w-4" />, cls: STATUS_META.rejected.tileClass },
            ] as const
          ).map((tile) => {
            const active = statusFilter === tile.key;
            return (
              <button
                key={tile.key}
                onClick={() => setStatusFilter(tile.key as StatusFilter)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-gradient-to-br px-4 py-3 text-left transition-all hover:scale-[1.015] hover:shadow-md",
                  tile.cls,
                  active && "ring-2 ring-primary/60",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 shadow-sm dark:bg-white/10">
                  {tile.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-xl font-bold leading-tight">{loading ? "—" : stats[tile.key]}</span>
                  <span className="block truncate text-xs font-medium opacity-80">{tile.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Toolbar: search + filters + sort */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ideas by title, description or author…"
              className="pl-9 pr-9"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-full sm:w-[190px]">
              <span className="flex items-center gap-2 text-muted-foreground">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-card p-0">
                <Skeleton className="h-2 w-full rounded-b-none rounded-t-2xl" />
                <div className="space-y-3 p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-xl" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <div className="flex items-center gap-2 pt-2">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="ml-auto h-7 w-24 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : ideas.length === 0 ? (
          <EmptyState
            title="No ideas yet"
            body="Every great product started as an idea. Capture your first one and share it with your team."
            action={
              <Button onClick={openCreate} className="bg-gradient-to-r from-blue-600 to-violet-600 shadow-lg hover:from-blue-700 hover:to-violet-700">
                <Plus className="mr-2 h-4 w-4" />
                Capture your first idea
              </Button>
            }
          />
        ) : visibleIdeas.length === 0 ? (
          <EmptyState
            title="No matching ideas"
            body={hasActiveFilters ? "Nothing matches your search or filters. Try different keywords or clear the filters." : "Nothing here yet."}
            action={
              hasActiveFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleIdeas.map((idea, idx) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                index={idx}
                updating={updatingId === idea.id}
                onStatusChange={handleStatusChange}
                onEdit={() => openEdit(idea)}
                onDelete={() => setDeleting(idea)}
              />
            ))}
          </div>
        )}

        {/* Create dialog */}
        <IdeaFormDialog
          open={isFormOpen}
          onOpenChange={(open) => {
            setIsFormOpen(open);
            if (!open) resetForm();
          }}
          title="New Idea"
          description="Capture the spark — give it a clear title and enough detail for your team to run with it."
          submitLabel="Create Idea"
          busy={submitting}
          onSubmit={handleSubmit}
          ideaData={ideaData}
          setIdeaData={setIdeaData}
        />

        {/* Edit dialog */}
        <IdeaFormDialog
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
              resetForm();
            }
          }}
          title="Edit Idea"
          description="Refine the title or flesh out the description."
          submitLabel="Save changes"
          busy={submitting}
          onSubmit={handleEditSubmit}
          ideaData={ideaData}
          setIdeaData={setIdeaData}
        />

        {/* Delete confirmation */}
        <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this idea?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleting?.title}" and any product documentation generated from it will be
                permanently removed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                className="bg-rose-600 text-white hover:bg-rose-700"
                disabled={deletingBusy}
              >
                {deletingBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete idea
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/* Idea card                                                           */
/* ------------------------------------------------------------------ */

function IdeaCard({
  idea,
  index,
  updating,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  idea: Idea;
  index: number;
  updating: boolean;
  onStatusChange: (id: string, status: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = statusMeta(idea.status);
  const created = idea.createdAt ? new Date(idea.createdAt) : null;
  const validDate = created && !isNaN(created.getTime());

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card pt-0 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: "backwards" }}
    >
      {/* Status gradient strip */}
      <div className={cn("relative h-1.5 w-full bg-gradient-to-r", meta.stripClass)}>
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)",
            backgroundSize: "10px 10px",
          }}
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Title row */}
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
              meta.iconClass,
            )}
          >
            <Lightbulb className="h-5 w-5" />
          </span>
          <h3 className="line-clamp-2 flex-1 text-[15px] font-semibold leading-snug tracking-tight">
            {idea.title}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-1 h-8 w-8 shrink-0 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label="Idea actions"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" /> Edit idea
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        <p className="mt-2.5 line-clamp-3 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {idea.description}
        </p>

        {/* Status pill */}
        <div className="mt-3">
          <Badge className={cn("gap-1.5 border-transparent", meta.badgeClass)}>
            {meta.icon}
            {meta.label}
          </Badge>
        </div>

        {/* Footer: author + date + status select */}
        <div className="mt-4 flex items-center gap-2 border-t pt-3.5">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white shadow-sm",
              avatarGradient(idea.userName),
            )}
            title={idea.userName || "Unknown"}
          >
            {initialsOf(idea.userName)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {idea.userName || "Unknown"}
            {validDate && <span className="hidden sm:inline"> · {formatDistanceToNow(created, { addSuffix: true })}</span>}
          </span>
          <Select
            value={idea.status || "under_review"}
            onValueChange={(value) => onStatusChange(idea.id, value)}
            disabled={updating}
          >
            <SelectTrigger className="h-7 w-[128px] gap-1 border-dashed text-[11px] capitalize" aria-label="Change status">
              {updating ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              ) : (
                <SelectValue placeholder="Status" />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="under_review">Under review</SelectItem>
              <SelectItem value="executed">Executed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed py-16 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600/10 to-violet-600/10 ring-1 ring-blue-600/20">
        <Lightbulb className="h-8 w-8 text-blue-600/70 dark:text-blue-400/70" />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function IdeaFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  busy,
  onSubmit,
  ideaData,
  setIdeaData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  ideaData: CreateIdeaInput;
  setIdeaData: (data: CreateIdeaInput) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/10 to-violet-600/10 ring-1 ring-blue-600/20">
            <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="idea-title">
                Title <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="idea-title"
                autoFocus
                maxLength={120}
                placeholder="e.g. One-tap meeting summaries for guests"
                value={ideaData.title}
                onChange={(e) => setIdeaData({ ...ideaData, title: e.target.value })}
              />
              <p className="text-right text-[11px] text-muted-foreground">{ideaData.title.length}/120</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-description">Description</Label>
              <Textarea
                id="idea-description"
                rows={5}
                maxLength={2000}
                placeholder="What's the idea? Who is it for, and what problem does it solve?"
                value={ideaData.description}
                onChange={(e) => setIdeaData({ ...ideaData, description: e.target.value })}
                className="resize-none"
              />
              <p className="text-right text-[11px] text-muted-foreground">{ideaData.description.length}/2000</p>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !ideaData.title.trim()}
              className="bg-gradient-to-r from-blue-600 to-violet-600 shadow-lg hover:from-blue-700 hover:to-violet-700"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
