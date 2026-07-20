import { useState, useRef, useEffect, useCallback } from "react";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Download,
  Trash2,
  Loader2,
  FileVideo,
  Clock,
  HardDrive,
  Search,
  SortAsc,
  SortDesc,
  X,
  AlertCircle,
  Share2,
  Calendar,
  Video,
  Phone,
  RefreshCw,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useRecordings,
  useDeleteRecording,
} from "@/lib/meetings-chat-calls";
import { Recording } from "@shared/api";
import { getApiMessage } from "@/lib/api-response";
import { api } from "@/lib/api-client";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const getVideoUrl = (storageUrl?: string | null): string | null => {
  if (!storageUrl) return null;

  if (
    storageUrl.startsWith("data:") ||
    storageUrl.startsWith("http://") ||
    storageUrl.startsWith("https://") ||
    storageUrl.startsWith("blob:")
  ) {
    return storageUrl;
  }

  const apiBase = api.defaults.baseURL || import.meta.env.VITE_API_URL || "";
  const normalizedBase = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  const path = storageUrl.startsWith("/") ? storageUrl : `/${storageUrl}`;
  
  return `${normalizedBase}${path}`;
};

const downloadRecordingFile = async (
  storageUrl: string,
  filename: string,
  onError?: (msg: string) => void
) => {
  try {
    const url = getVideoUrl(storageUrl);
    if (!url) {
      onError?.("No download URL available");
      return;
    }

    let blobUrl: string;

    if (url.startsWith("data:")) {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch data URL");
      const blob = await res.blob();
      blobUrl = URL.createObjectURL(blob);
    } else {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
      } catch (fetchErr) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
    }

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename.endsWith(".webm") ? filename : `${filename}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 500);
  } catch (err) {
    console.error("Download error:", err);
    onError?.("Download failed. Try right-clicking the video and selecting 'Save As'.");
  }
};

const copyToClipboard = async (text: string, onSuccess?: () => void, onError?: (msg: string) => void) => {
  try {
    await navigator.clipboard.writeText(text);
    onSuccess?.();
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      onSuccess?.();
    } catch {
      onError?.("Failed to copy to clipboard");
    }
  }
};

// ─── Types ────────────────────────────────────────────────────────────────────

type SortField = "createdAt" | "duration" | "size";
type SortOrder = "asc" | "desc";

interface VideoState {
  isPlaying: boolean;
  isMuted: boolean;
  isFullscreen: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Recordings() {
  const {
    data: recordingsData,
    isLoading: recordingsLoading,
    error: recordingsError,
    refetch,
  } = useRecordings();
  const deleteRecording = useDeleteRecording();
  const { toast } = useToast();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPlayDialogOpen, setIsPlayDialogOpen] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [videoState, setVideoState] = useState<VideoState>({
    isPlaying: false,
    isMuted: false,
    isFullscreen: false,
    currentTime: 0,
    duration: 0,
    isLoading: true,
    hasError: false,
    errorMessage: "",
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // ─── Derived Data ─────────────────────────────────────────────────────────

  const recordings = (recordingsData?.recordings || []).map((r: Recording) => ({
    ...r,
    storageUrl: r.storageUrl ?? "",
  }));

  const filteredAndSortedRecordings = recordings
    .filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const searchableText = [
          r.recordedByName,
          r.meetingId ? "Meeting" : "Call",
          r.status,
          new Date(r.createdAt).toLocaleDateString(),
        ].join(" ").toLowerCase();
        return searchableText.includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "createdAt": comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
        case "duration": comparison = a.duration - b.duration; break;
        case "size": comparison = a.size - b.size; break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  const stats = {
    total: recordings.length,
    completed: recordings.filter((r) => r.status === "completed").length,
    failed: recordings.filter((r) => r.status === "failed").length,
    totalSize: recordings.reduce((acc, r) => acc + (r.size || 0), 0),
    totalDuration: recordings.reduce((acc, r) => acc + (r.duration || 0), 0),
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleDeleteRecording = async () => {
    if (!selectedRecording) return;
    setIsProcessing(true);
    try {
      await deleteRecording.mutateAsync(selectedRecording.id);
      setIsDeleteDialogOpen(false);
      setSelectedRecording(null);
      toast({ title: "Recording deleted", description: "The recording has been deleted successfully" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: getApiMessage(err, "Failed to delete recording") });
    } finally {
      setIsProcessing(false);
    }
  };

  const openPlayDialog = useCallback((recording: Recording) => {
    setSelectedRecording(recording);
    setVideoState({
      isPlaying: false,
      isMuted: false,
      isFullscreen: false,
      currentTime: 0,
      duration: recording.duration || 0,
      isLoading: true,
      hasError: false,
      errorMessage: "",
    });
    setIsPlayDialogOpen(true);
  }, []);

  const closePlayDialog = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
    setVideoState((prev) => ({ ...prev, isPlaying: false, isLoading: false }));
    setIsPlayDialogOpen(false);
    setTimeout(() => setSelectedRecording(null), 200);
  }, []);

  const openDeleteDialog = (recording: Recording) => {
    setSelectedRecording(recording);
    setIsDeleteDialogOpen(true);
  };

  const handleDownload = async (recording: Recording) => {
    if (!recording.storageUrl) {
      toast({ variant: "destructive", title: "Download unavailable", description: "This recording has no file to download." });
      return;
    }
    setIsDownloading(recording.id);
    const filename = `recording-${recording.id}-${new Date(recording.createdAt).toISOString().slice(0, 10)}`;
    await downloadRecordingFile(recording.storageUrl, filename, (msg) => {
      toast({ variant: "destructive", title: "Download failed", description: msg });
    });
    setIsDownloading(null);
  };

  const handleShareLink = async (recording: Recording) => {
    const fullUrl = getVideoUrl(recording.storageUrl);
    if (!fullUrl) {
      toast({ variant: "destructive", title: "Share unavailable", description: "This recording has no link to share." });
      return;
    }
    await copyToClipboard(
      fullUrl,
      () => toast({ title: "Link copied!", description: "Full recording URL copied to clipboard." }),
      (msg) => toast({ variant: "destructive", title: "Copy failed", description: msg })
    );
  };

  // ─── Video Player Controls ────────────────────────────────────────────────

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoState.isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {
        setVideoState((prev) => ({ ...prev, hasError: true, errorMessage: "Playback failed. The video format may not be supported." }));
      });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setVideoState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().then(() => setVideoState((p) => ({ ...p, isFullscreen: true }))).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setVideoState((p) => ({ ...p, isFullscreen: false }))).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setVideoState((prev) => ({ ...prev, currentTime: time }));
  };

  const skip = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration, videoRef.current.currentTime + seconds));
  };

  const handleVideoLoadStart = () => setVideoState((p) => ({ ...p, isLoading: true, hasError: false }));
  const handleVideoCanPlay = () => setVideoState((p) => ({ ...p, isLoading: false, hasError: false }));
  const handleVideoPlay = () => setVideoState((p) => ({ ...p, isPlaying: true }));
  const handleVideoPause = () => setVideoState((p) => ({ ...p, isPlaying: false }));
  
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    setVideoState((prev) => ({
      ...prev,
      currentTime: videoRef.current?.currentTime || 0,
      duration: videoRef.current?.duration || prev.duration,
    }));
  };

  const handleVideoEnded = () => setVideoState((p) => ({ ...p, isPlaying: false, currentTime: 0 }));

  const handleVideoError = () => {
    const video = videoRef.current;
    let message = "Failed to load video. The source might be unavailable.";
    if (video?.error) {
      switch (video.error.code) {
        case MediaError.MEDIA_ERR_NETWORK: message = "A network error occurred. Check your connection."; break;
        case MediaError.MEDIA_ERR_DECODE: message = "The video could not be decoded."; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: message = "Video format not supported or URL is incorrect."; break;
      }
    }
    setVideoState((prev) => ({ ...prev, isLoading: false, hasError: true, errorMessage: message, isPlaying: false }));
  };

  useEffect(() => {
    const handleFullscreenChange = () => setVideoState((p) => ({ ...p, isFullscreen: !!document.fullscreenElement }));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // ─── Formatters ───────────────────────────────────────────────────────────

  const formatDateTime = (dateStr: string) => new Date(dateStr).toLocaleString();
  
  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0m 0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  const formatDurationShort = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0:00";
    return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (Math.round((bytes / Math.pow(k, i)) * 100) / 100).toFixed(2) + " " + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "recording": return "default";
      case "completed": return "outline";
      case "failed": return "destructive";
      case "paused": return "secondary";
      default: return "outline";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "recording": return <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />;
      case "completed": return <span className="h-2 w-2 rounded-full bg-green-500" />;
      case "failed": return <AlertCircle className="h-3.5 w-3.5" />;
      case "paused": return <Pause className="h-3.5 w-3.5" />;
      default: return null;
    }
  };

  // ─── Loading / Error States ───────────────────────────────────────────────

  if (recordingsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (recordingsError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <FileVideo className="h-16 w-16 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Error loading recordings</h3>
          <p className="text-muted-foreground">{getApiMessage(recordingsError, "Failed to load recordings")}</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Try Again
          </Button>
        </div>
      </Layout>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Recordings</h1>
            <p className="text-muted-foreground mt-2">View and manage your recorded meetings and calls</p>
          </div>
          <Button variant="outline" onClick={() => refetch()} className="w-fit">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="pt-6 pb-4"><div className="text-2xl font-bold">{stats.total}</div><div className="text-sm text-muted-foreground">Total</div></CardContent></Card>
          <Card><CardContent className="pt-6 pb-4"><div className="text-2xl font-bold text-green-600">{stats.completed}</div><div className="text-sm text-muted-foreground">Completed</div></CardContent></Card>
          <Card><CardContent className="pt-6 pb-4"><div className="text-2xl font-bold text-red-600">{stats.failed}</div><div className="text-sm text-muted-foreground">Failed</div></CardContent></Card>
          <Card><CardContent className="pt-6 pb-4"><div className="text-2xl font-bold">{formatDuration(stats.totalDuration)}</div><div className="text-sm text-muted-foreground">Total Duration</div></CardContent></Card>
          <Card className="col-span-2 md:col-span-1"><CardContent className="pt-6 pb-4"><div className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</div><div className="text-sm text-muted-foreground">Total Size</div></CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search recordings..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="recording">Recording</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={`${sortField}-${sortOrder}`} onValueChange={(v) => { const [f, o] = v.split("-") as [SortField, SortOrder]; setSortField(f); setSortOrder(o); }}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt-desc"><span className="flex items-center gap-2"><SortDesc className="h-3.5 w-3.5" /> Newest First</span></SelectItem>
              <SelectItem value="createdAt-asc"><span className="flex items-center gap-2"><SortAsc className="h-3.5 w-3.5" /> Oldest First</span></SelectItem>
              <SelectItem value="duration-desc"><span className="flex items-center gap-2"><SortDesc className="h-3.5 w-3.5" /> Longest First</span></SelectItem>
              <SelectItem value="duration-asc"><span className="flex items-center gap-2"><SortAsc className="h-3.5 w-3.5" /> Shortest First</span></SelectItem>
              <SelectItem value="size-desc"><span className="flex items-center gap-2"><SortDesc className="h-3.5 w-3.5" /> Largest First</span></SelectItem>
              <SelectItem value="size-asc"><span className="flex items-center gap-2"><SortAsc className="h-3.5 w-3.5" /> Smallest First</span></SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(searchQuery || statusFilter !== "all") && (
          <div className="text-sm text-muted-foreground">Showing {filteredAndSortedRecordings.length} of {recordings.length} recordings</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedRecordings.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="pt-6 pb-6 text-center">
                <FileVideo className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                {searchQuery || statusFilter !== "all" ? (
                  <>
                    <p className="text-muted-foreground">No recordings match your filters</p>
                    <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}>Clear Filters</Button>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">No recordings yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Recordings from meetings and calls will appear here</p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            filteredAndSortedRecordings.map((recording) => {
              const videoUrl = getVideoUrl(recording.storageUrl);
              const canPlay = recording.status === "completed" && videoUrl;
              const isCurrentlyDownloading = isDownloading === recording.id;

              return (
                <Card key={recording.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {recording.meetingId ? <Video className="h-5 w-5 flex-shrink-0 text-blue-500" /> : <Phone className="h-5 w-5 flex-shrink-0 text-green-500" />}
                          <span className="truncate">{recording.meetingId ? "Meeting" : "Call"} Recording</span>
                        </CardTitle>
                        <CardDescription className="mt-1.5">by {recording.recordedByName}</CardDescription>
                      </div>
                      <Badge variant={getStatusColor(recording.status)} className="capitalize flex-shrink-0 flex items-center gap-1.5">
                        {getStatusIcon(recording.status)} {recording.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      <span>{formatDateTime(recording.createdAt)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span className="font-medium">{formatDuration(recording.duration)}</span></div>
                      <div className="flex items-center gap-2 text-sm"><HardDrive className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span className="font-medium">{formatFileSize(recording.size)}</span></div>
                    </div>
                    {recording.status === "failed" && (
                      <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3">
                        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-red-700 dark:text-red-400">
                          This recording failed to complete. The recording file may be corrupted or unavailable. You can try deleting it and recording again.
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2 mt-auto">
                      {canPlay && (
                        <>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => openPlayDialog(recording)}><Play className="h-4 w-4 mr-2" /> Play</Button>
                          <Button variant="outline" size="sm" onClick={() => handleDownload(recording)} disabled={isCurrentlyDownloading}>
                            {isCurrentlyDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </Button>
                          {videoUrl && <Button variant="outline" size="sm" onClick={() => handleShareLink(recording)}><Share2 className="h-4 w-4" /></Button>}
                        </>
                      )}
                      <Button variant="destructive" size="sm" className={canPlay ? "flex-1" : "w-full"} onClick={() => openDeleteDialog(recording)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Video Player Dialog ──────────────────────────────────────────────── */}
      {selectedRecording && (
        <Dialog open={isPlayDialogOpen} onOpenChange={(open) => { if (!open) closePlayDialog(); }}>
          <DialogContent className="max-w-5xl p-0 overflow-hidden gap-0">
            <div ref={videoContainerRef} className="relative bg-black aspect-video flex items-center justify-center">
              {videoState.isLoading && !videoState.hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                  <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
              )}
              {videoState.hasError ? (
                <div className="flex flex-col items-center gap-4 p-8 text-center">
                  <AlertCircle className="h-12 w-12 text-red-400" />
                  <div><p className="text-white font-medium">Playback Error</p><p className="text-zinc-400 text-sm mt-1 max-w-md">{videoState.errorMessage}</p></div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDownload(selectedRecording)}><Download className="h-4 w-4 mr-2" /> Download Instead</Button>
                    <Button variant="ghost" size="sm" onClick={closePlayDialog}>Close</Button>
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  src={getVideoUrl(selectedRecording.storageUrl) || undefined}
                  controls={false}
                  playsInline
                  className="w-full h-full object-contain"
                  onLoadStart={handleVideoLoadStart}
                  onCanPlay={handleVideoCanPlay}
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onEnded={handleVideoEnded}
                  onError={handleVideoError}
                  onClick={togglePlay}
                />
              )}
              {!videoState.isPlaying && !videoState.isLoading && !videoState.hasError && (
                <div className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20 opacity-0 hover:opacity-100 transition-opacity" onClick={togglePlay}>
                  <div className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"><Play className="h-8 w-8 text-white ml-1" /></div>
                </div>
              )}
            </div>
            {!videoState.hasError && (
              <div className="px-4 pt-3 pb-2 bg-zinc-900 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-12 text-right font-mono">{formatDurationShort(videoState.currentTime)}</span>
                  <input type="range" min={0} max={videoState.duration || 0} value={videoState.currentTime} onChange={handleSeek} className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0" />
                  <span className="text-xs text-zinc-400 w-12 font-mono">{formatDurationShort(videoState.duration)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => skip(-10)}><SkipBack className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-white hover:bg-white/10 rounded-full" onClick={togglePlay}>
                      {videoState.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => skip(10)}><SkipForward className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 ml-2" onClick={toggleMute}>
                      {videoState.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => handleDownload(selectedRecording)} disabled={isDownloading === selectedRecording.id}>
                      {isDownloading === selectedRecording.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={toggleFullscreen}><Maximize2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            )}
            <div className="px-4 py-3 bg-zinc-950 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-sm font-medium text-white">{selectedRecording.meetingId ? "Meeting" : "Call"} Recording</DialogTitle>
                  <DialogDescription className="text-xs text-zinc-400 mt-0.5">Recorded by {selectedRecording.recordedByName} on {formatDateTime(selectedRecording.createdAt)}</DialogDescription>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDuration(selectedRecording.duration)}</span>
                  <span className="flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" /> {formatFileSize(selectedRecording.size)}</span>
                  <Badge variant={getStatusColor(selectedRecording.status)} className="capitalize text-xs">{selectedRecording.status}</Badge>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Delete Dialog ────────────────────────────────────────────────────── */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recording</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The recording file will be permanently deleted and cannot be recovered.</AlertDialogDescription>
          </AlertDialogHeader>
          {selectedRecording && (
            <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{selectedRecording.meetingId ? "Meeting" : "Call"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Recorded by</span><span>{selectedRecording.recordedByName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{formatDuration(selectedRecording.duration)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{formatFileSize(selectedRecording.size)}</span></div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRecording} disabled={isProcessing} className="bg-red-600 hover:bg-red-700">
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}