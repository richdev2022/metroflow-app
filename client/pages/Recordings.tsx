import { useState } from "react";
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
  Play,
  Download,
  Trash2,
  Loader2,
  FileVideo,
  Clock,
  HardDrive,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  useRecordings,
  useDeleteRecording,
} from "@/lib/meetings-chat-calls";
import { Recording } from "@shared/api";
import { getApiMessage } from "@/lib/api-response";

export default function Recordings() {
  const {
    data: recordingsData,
    isLoading: recordingsLoading,
    error: recordingsError,
  } = useRecordings();
  const deleteRecording = useDeleteRecording();
  const { toast } = useToast();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPlayDialogOpen, setIsPlayDialogOpen] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDeleteRecording = async () => {
    if (!selectedRecording) return;
    setIsProcessing(true);
    try {
      await deleteRecording.mutateAsync(selectedRecording.id);
      setIsDeleteDialogOpen(false);
      setSelectedRecording(null);
      toast({
        title: "Recording deleted",
        description: "The recording has been deleted successfully",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: getApiMessage(err, "Failed to delete recording"),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openPlayDialog = (recording: Recording) => {
    setSelectedRecording(recording);
    setIsPlayDialogOpen(true);
  };

  const openDeleteDialog = (recording: Recording) => {
    setSelectedRecording(recording);
    setIsDeleteDialogOpen(true);
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "recording":
        return "default";
      case "completed":
        return "outline";
      case "failed":
        return "destructive";
      case "paused":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (recordingsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (recordingsError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-96">
          <FileVideo className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Error loading recordings</h3>
          <p className="text-muted-foreground mt-2">
            {getApiMessage(recordingsError, "Failed to load recordings")}
          </p>
        </div>
      </Layout>
    );
  }

  const recordings = recordingsData?.recordings || [];

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Recordings</h1>
          <p className="text-muted-foreground mt-2">
            View and manage your recorded meetings and calls
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recordings.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="pt-6 text-center">
                <FileVideo className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No recordings yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Recordings from meetings and calls will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            recordings.map((recording) => (
              <Card key={recording.id}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileVideo className="h-5 w-5 flex-shrink-0" />
                        <span className="truncate">
                          {recording.meetingId ? "Meeting" : "Call"} Recording
                        </span>
                      </CardTitle>
                      <CardDescription className="mt-2">
                        by {recording.recordedByName}
                      </CardDescription>
                    </div>
                    <Badge variant={getStatusColor(recording.status)} className="capitalize flex-shrink-0">
                      {recording.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      Created
                    </div>
                    <div className="text-sm">
                      {formatDateTime(recording.createdAt)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        Duration
                      </div>
                      <div className="text-sm font-medium">
                        {formatDuration(recording.duration)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <HardDrive className="h-4 w-4" />
                        Size
                      </div>
                      <div className="text-sm font-medium">
                        {formatFileSize(recording.size)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {recording.status === "completed" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => openPlayDialog(recording)}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Play
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            window.open(recording.storageUrl, "_blank");
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      className={recording.status === "completed" ? "flex-1" : "w-full"}
                      onClick={() => openDeleteDialog(recording)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {selectedRecording && (
        <Dialog open={isPlayDialogOpen} onOpenChange={setIsPlayDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {selectedRecording.meetingId ? "Meeting" : "Call"} Recording
              </DialogTitle>
              <DialogDescription>
                Recorded by {selectedRecording.recordedByName} on{" "}
                {formatDateTime(selectedRecording.createdAt)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
                <video
                  src={selectedRecording.storageUrl}
                  controls
                  className="w-full h-full rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Duration</div>
                  <div className="font-medium">
                    {formatDuration(selectedRecording.duration)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Size</div>
                  <div className="font-medium">
                    {formatFileSize(selectedRecording.size)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <Badge variant={getStatusColor(selectedRecording.status)} className="capitalize">
                    {selectedRecording.status}
                  </Badge>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recording</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The recording will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRecording}
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
