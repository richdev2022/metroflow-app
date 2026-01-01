import React, { useEffect, useState } from 'react';
import { api } from "@/lib/api-client";
import { Idea, CreateIdeaInput, ApiResponse } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Layout from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import { Plus, MoreVertical, Loader2, Lightbulb } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newIdea, setNewIdea] = useState<CreateIdeaInput>({ title: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchIdeas();
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        // Try to parse token safely
        const payload = parseJwt(token);
        if (payload) {
          setCurrentUserRole(payload.role);
        }
      }
    } catch (e) {
      console.error("Failed to get current user info", e);
    }
  };

  const fetchIdeas = async () => {
    try {
      const response = await api.get("/ideas");
      const data = response.data as ApiResponse<Idea[]>;
      if (data.success && data.data) {
        setIdeas(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch ideas", error);
      toast({
        title: "Error",
        description: "Failed to load ideas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIdea = async () => {
    if (!newIdea.title || !newIdea.description) {
        toast({
            title: "Error",
            description: "Title and description are required",
            variant: "destructive",
        });
        return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post("/ideas", newIdea);
      const data = response.data as ApiResponse<Idea>;
      
      if (data.success && data.data) {
        setIdeas([data.data, ...ideas]);
        setNewIdea({ title: "", description: "" });
        setIsFormOpen(false);
        toast({
          title: "Success",
          description: "Idea created successfully",
        });
      } else {
        toast({
            title: "Error",
            description: data.error || "Failed to create idea",
            variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to create idea", error);
      toast({
        title: "Error",
        description: "Failed to create idea",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: "under_review" | "executed" | "rejected") => {
    try {
      const response = await api.put(`/ideas/${id}/status`, { status });
      const data = response.data as ApiResponse<Idea>;
      
      if (data.success && data.data) {
        setIdeas(ideas.map(idea => idea.id === id ? data.data! : idea));
        toast({
          title: "Success",
          description: `Idea status updated to ${status.replace('_', ' ')}`,
        });
      } else {
        toast({
            title: "Error",
            description: data.error || "Failed to update status",
            variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to update status", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "executed":
        return <Badge className="bg-green-500">Executed</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "under_review":
        return <Badge className="bg-yellow-500">Under Review</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Ideas</h1>
            <p className="text-muted-foreground mt-2">
              Share and track ideas for improvement.
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Idea
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Ideas</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : ideas.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <Lightbulb className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No ideas yet. Be the first to share one!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ideas.map((idea) => (
                    <TableRow key={idea.id}>
                      <TableCell>
                        <div className="font-medium">{idea.title}</div>
                        <div className="text-sm text-muted-foreground line-clamp-1">{idea.description}</div>
                      </TableCell>
                      <TableCell>{idea.userName || "Unknown"}</TableCell>
                      <TableCell>{getStatusBadge(idea.status)}</TableCell>
                      <TableCell>{new Date(idea.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => updateStatus(idea.id, "under_review")}>
                                Mark as Under Review
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateStatus(idea.id, "executed")}>
                                Mark as Executed
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateStatus(idea.id, "rejected")}>
                                Mark as Rejected
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share an Idea</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Short title for your idea"
                  value={newIdea.title}
                  onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your idea in detail..."
                  rows={5}
                  value={newIdea.description}
                  onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateIdea} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Idea
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
