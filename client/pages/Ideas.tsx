import React, { useEffect, useState } from 'react';
import { api } from "@/lib/api-client";
import { Idea, CreateIdeaInput } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import Layout from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import { Plus, Loader2, Lightbulb, CheckCircle2, XCircle, Clock } from "lucide-react";

const STATUS_META: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  under_review: {
    label: "Under review",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  executed: {
    label: "Executed",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [ideaData, setIdeaData] = useState<CreateIdeaInput>({
    title: "",
    description: "",
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/ideas", ideaData);
      setIsFormOpen(false);
      setIdeaData({ title: "", description: "" });
      toast({ title: "Idea created" });
      fetchIdeas();
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to create idea" });
    }
  };

  const handleStatusChange = async (ideaId: string, status: string) => {
    try {
      setUpdatingId(ideaId);
      // Route order on the backend: PUT /ideas/:id/status is registered before
      // PUT /ideas/:id, so this reaches the dedicated status handler.
      await api.put(`/ideas/${ideaId}/status`, { status });
      toast({ title: "Status updated", description: `Idea marked as "${STATUS_META[status]?.label || status}"` });
      await fetchIdeas();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to update status",
        description: error.response?.data?.error || error.response?.data?.message || "Only admins and managers can update idea status",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Ideas</h1>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Idea
          </Button>
        </div>

        {ideas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Lightbulb className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium">No ideas yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Capture your first idea and share it with your team.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {ideas.map((idea) => {
              const meta = STATUS_META[idea.status] || null;
              return (
                <Card key={idea.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-500" />
                      <span className="flex-1">{idea.title}</span>
                      {meta && (
                        <Badge className={`${meta.className} gap-1 border-transparent`}>
                          {meta.icon}
                          {meta.label}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">{idea.description}</p>
                    <div className="mt-4 flex items-center gap-2">
                      <Select
                        value={idea.status || undefined}
                        onValueChange={(value) => handleStatusChange(idea.id, value)}
                        disabled={updatingId === idea.id}
                      >
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                          {updatingId === idea.id ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" /> Updating…
                            </span>
                          ) : (
                            <SelectValue placeholder="Update status" />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="under_review">Under review</SelectItem>
                          <SelectItem value="executed">Executed</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Idea</DialogTitle>
              <DialogDescription>
                Create a new idea to share with your team.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={ideaData.title}
                    onChange={(e) =>
                      setIdeaData({ ...ideaData, title: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={ideaData.description}
                    onChange={(e) =>
                      setIdeaData({ ...ideaData, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Idea</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
