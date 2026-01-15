import React, { useEffect, useState } from 'react';
import { api } from "@/lib/api-client";
import { Idea, CreateIdeaInput, ApiResponse, ProductDocumentation, UpdateIdeaInput } from "@shared/api";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
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
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import Layout from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import { Plus, MoreVertical, Loader2, Lightbulb, FileText, Trash2, Edit, Download, RefreshCw, Upload } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newIdea, setNewIdea] = useState<CreateIdeaInput>({ title: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  
  // Edit Idea State
  const [isEditingIdea, setIsEditingIdea] = useState(false);
  const [editIdeaData, setEditIdeaData] = useState<UpdateIdeaInput>({ title: "", description: "" });

  // Documentation State
  const [docs, setDocs] = useState<ProductDocumentation[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ProductDocumentation | null>(null);
  const [isEditDocOpen, setIsEditDocOpen] = useState(false);
  const [editDocContent, setEditDocContent] = useState("");
  const [editDocLogo, setEditDocLogo] = useState<File | null>(null);
  const [regenerateConcern, setRegenerateConcern] = useState("");
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false);
  
  // Delete State
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
  
  // View Document State
  const [isViewingDoc, setIsViewingDoc] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<ProductDocumentation | null>(null);

  useEffect(() => {
    fetchIdeas();
  }, []);

  useEffect(() => {
    if (selectedIdea) {
      fetchDocumentation(selectedIdea.id);
      setEditIdeaData({ title: selectedIdea.title, description: selectedIdea.description });
      setIsEditingIdea(false);
    } else {
      setDocs([]);
    }
  }, [selectedIdea]);

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
    setUpdatingId(id);
    try {
      const response = await api.put(`/ideas/${id}`, { status });
      const updatedIdea = response.data as Idea;
      
      if (updatedIdea) {
        setIdeas(ideas.map(idea => idea.id === id ? updatedIdea : idea));
        if (selectedIdea?.id === id) setSelectedIdea(updatedIdea);
        toast({
          title: "Success",
          description: `Idea status updated to ${status.replace('_', ' ')}`,
        });
      }
    } catch (error) {
      console.error("Failed to update status", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };
  
  // New Functions
  const handleUpdateIdea = async () => {
    if (!selectedIdea) return;
    setIsSubmitting(true);
    try {
        const response = await api.put(`/ideas/${selectedIdea.id}`, editIdeaData);
        if (response.data) {
            const updated = response.data as Idea;
            setIdeas(ideas.map(i => i.id === updated.id ? updated : i));
            setSelectedIdea(updated);
            setIsEditingIdea(false);
            toast({ title: "Success", description: "Idea updated successfully" });
        }
    } catch (error) {
        toast({ title: "Error", description: "Failed to update idea", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteIdea = async (id: string) => {
    if (!confirm("Are you sure you want to delete this idea?")) return;
    try {
        await api.delete(`/ideas/${id}`);
        setIdeas(ideas.filter(i => i.id !== id));
        if (selectedIdea?.id === id) setSelectedIdea(null);
        toast({ title: "Success", description: "Idea deleted successfully" });
    } catch (error) {
        toast({ title: "Error", description: "Failed to delete idea", variant: "destructive" });
    }
  };

  const fetchDocumentation = async (ideaId: string) => {
    setLoadingDocs(true);
    try {
        const response = await api.get(`/ideas/${ideaId}/documentation`);
        // Check for { success: true, data: [...] } structure first
        if (response.data && response.data.success && Array.isArray(response.data.data)) {
            setDocs(response.data.data);
        } else if (Array.isArray(response.data)) {
            setDocs(response.data);
        } else {
            console.error("Unexpected response format for docs:", response.data);
            setDocs([]);
        }
    } catch (error) {
        console.error("Failed to fetch docs", error);
        setDocs([]);
    } finally {
        setLoadingDocs(false);
    }
  };

  const handleGenerateDocumentation = async () => {
    if (!selectedIdea) return;
    setGeneratingDoc(true);
    try {
        const response = await api.post(`/ideas/${selectedIdea.id}/documentation`);
        if (response.data && response.data.success) {
            setDocs([...docs, response.data.data]);
            toast({ title: "Success", description: response.data.message || "Documentation generated" });
        } else {
            toast({ title: "Error", description: "Failed to generate documentation", variant: "destructive" });
        }
    } catch (error) {
        toast({ title: "Error", description: "Failed to generate documentation", variant: "destructive" });
    } finally {
        setGeneratingDoc(false);
    }
  };

  const handleUpdateDocumentation = async () => {
      if (!selectedDoc) return;
      setIsSubmitting(true);
      try {
        const formData = new FormData();
        formData.append('content', editDocContent);
        if (editDocLogo) {
            formData.append('logo', editDocLogo);
        }

        const response = await api.put(`/product-documentation/${selectedDoc.id}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        const updatedDoc = response.data as ProductDocumentation;
        setDocs(docs.map(d => d.id === updatedDoc.id ? updatedDoc : d));
        setIsEditDocOpen(false);
        toast({ title: "Success", description: "Documentation updated" });
      } catch (error) {
          toast({ title: "Error", description: "Failed to update documentation", variant: "destructive" });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleRegenerateDocumentation = async () => {
      if (!selectedDoc) return;
      setIsSubmitting(true);
      try {
          const response = await api.post(`/product-documentation/${selectedDoc.id}/regenerate`, {
              areasOfConcern: regenerateConcern
          });
          let updatedDoc: ProductDocumentation;
          let backendMessage: string | undefined;
          if (response.data && response.data.success && response.data.data) {
              updatedDoc = response.data.data as ProductDocumentation;
              backendMessage = response.data.message;
          } else {
              updatedDoc = response.data as ProductDocumentation;
          }
          setDocs(docs.map(d => d.id === updatedDoc.id ? updatedDoc : d));
          setIsRegenerateOpen(false);
          setRegenerateConcern("");
          toast({ title: "Success", description: backendMessage || "Documentation regenerated" });
      } catch (error) {
          toast({ title: "Error", description: "Failed to regenerate documentation", variant: "destructive" });
      } finally {
          setIsSubmitting(false);
      }
  };
  
  const downloadPdf = async (doc: ProductDocumentation) => {
    try {
      const response = await api.get(`/product-documentation/${doc.id}/pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${doc.title.replace(/\s+/g, '_')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error("Download failed", error);
      toast({ title: "Error", description: "Failed to download PDF", variant: "destructive" });
    }
  };

  const confirmDeleteDocumentation = async () => {
      if (!docToDelete) return;
      setIsDeletingDoc(true);
      try {
          await api.delete(`/product-documentation/${docToDelete}`);
          setDocs(docs.filter(d => d.id !== docToDelete));
          if (viewingDoc?.id === docToDelete) setIsViewingDoc(false);
          toast({ title: "Success", description: "Documentation deleted" });
          setDocToDelete(null);
      } catch (error) {
          toast({ title: "Error", description: "Failed to delete documentation", variant: "destructive" });
      } finally {
          setIsDeletingDoc(false);
      }
  };
  const openEditDoc = (doc: ProductDocumentation) => {
      setSelectedDoc(doc);
      setEditDocContent(doc.content);
      setEditDocLogo(null);
      setIsEditDocOpen(true);
  };
  
  const openViewDoc = (doc: ProductDocumentation) => {
      setViewingDoc(doc);
      setIsViewingDoc(true);
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
                        <div 
                          className="font-medium cursor-pointer hover:underline text-primary"
                          onClick={() => setSelectedIdea(idea)}
                        >
                          {idea.title}
                        </div>
                        <div className="text-sm text-muted-foreground line-clamp-1">{idea.description}</div>
                      </TableCell>
                      <TableCell>{idea.userName || "Unknown"}</TableCell>
                      <TableCell>{getStatusBadge(idea.status)}</TableCell>
                      <TableCell>{new Date(idea.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" disabled={updatingId === idea.id}>
                              {updatingId === idea.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedIdea(idea)}>
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                                setSelectedIdea(idea);
                                setIsEditingIdea(true);
                                setEditIdeaData({ title: idea.title, description: idea.description });
                            }}>
                                <Edit className="mr-2 h-4 w-4" /> Edit Idea
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteIdea(idea.id)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" /> Delete Idea
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
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

        <Dialog open={!!selectedIdea} onOpenChange={(open) => !open && setSelectedIdea(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {isEditingIdea ? (
                <>
                    <DialogHeader>
                        <DialogTitle>Edit Idea</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Title</Label>
                            <Input 
                                value={editIdeaData.title} 
                                onChange={(e) => setEditIdeaData({...editIdeaData, title: e.target.value})} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea 
                                rows={5}
                                value={editIdeaData.description} 
                                onChange={(e) => setEditIdeaData({...editIdeaData, description: e.target.value})} 
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditingIdea(false)}>Cancel</Button>
                        <Button onClick={handleUpdateIdea} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                        </Button>
                    </DialogFooter>
                </>
            ) : (
                <>
                    <DialogHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <DialogTitle className="text-2xl break-words pr-8">{selectedIdea?.title}</DialogTitle>
                                <div className="flex items-center gap-2 mt-2">
                                    {selectedIdea && getStatusBadge(selectedIdea.status)}
                                    <span className="text-sm text-muted-foreground">
                                    • {selectedIdea && new Date(selectedIdea.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => {
                                setIsEditingIdea(true);
                                setEditIdeaData({ title: selectedIdea!.title, description: selectedIdea!.description });
                            }}>
                                <Edit className="h-4 w-4" />
                            </Button>
                        </div>
                    </DialogHeader>
                    <div className="py-4 space-y-8">
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                            <div className="text-base whitespace-pre-wrap leading-relaxed">
                            {selectedIdea?.description}
                            </div>
                        </div>

                        {/* Product Documentation Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-lg font-semibold flex items-center gap-2">
                                    <FileText className="h-5 w-5" /> Product Documentation
                                </h4>
                                <Button size="sm" onClick={handleGenerateDocumentation} disabled={generatingDoc}>
                                    {generatingDoc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                    Generate AI Docs
                                </Button>
                            </div>

                            {loadingDocs ? (
                                <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                            ) : docs.length === 0 ? (
                                <div className="text-center p-4 border rounded-md border-dashed text-muted-foreground bg-muted/30">
                                    No documentation generated yet.
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {Array.isArray(docs) && docs.map(doc => (
                                        <Card key={doc.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => openViewDoc(doc)}>
                                            <CardContent className="p-4 flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    {(doc.logoUrl || doc.logo_url) ? (
                                                        <img src={doc.logoUrl || doc.logo_url} alt="Logo" className="h-10 w-10 object-contain rounded" />
                                                    ) : (
                                                        <div className="h-10 w-10 bg-primary/10 rounded flex items-center justify-center">
                                                            <FileText className="h-5 w-5 text-primary" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="font-medium">{doc.title}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            Version {doc.version} • {(doc.updatedAt || doc.updated_at) ? new Date(doc.updatedAt || doc.updated_at).toLocaleDateString() : 'Just now'}
                                                        </div>
                                                        <div className="mt-1">
                                                            {(doc as any).status && <Badge variant="secondary" className="capitalize">{(doc as any).status}</Badge>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openViewDoc(doc); }}>
                                                        View
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-2 pt-4 border-t">
                            <h4 className="text-sm font-medium text-muted-foreground">Submitted By</h4>
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                    {selectedIdea?.userName?.charAt(0).toUpperCase() || "U"}
                                </div>
                                <span>{selectedIdea?.userName || "Unknown User"}</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedIdea(null)}>Close</Button>
                    </DialogFooter>
                </>
            )}
          </DialogContent>
        </Dialog>

        {/* View Documentation Dialog */}
        <Dialog open={isViewingDoc} onOpenChange={setIsViewingDoc}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
                {viewingDoc && (
                    <>
                        <div className="flex items-center justify-between p-6 border-b bg-muted/10">
                            <div className="flex items-center gap-4">
                                {(viewingDoc.logoUrl || viewingDoc.logo_url) ? (
                                    <img src={viewingDoc.logoUrl || viewingDoc.logo_url} alt="Logo" className="h-12 w-12 object-contain rounded bg-card border p-1" />
                                ) : (
                                    <div className="h-12 w-12 bg-primary/10 rounded flex items-center justify-center">
                                        <FileText className="h-6 w-6 text-primary" />
                                    </div>
                                )}
                                <div>
                                    <DialogTitle className="text-xl mb-1">{viewingDoc.title}</DialogTitle>
                                    <div className="text-sm text-muted-foreground flex gap-2">
                                        <span>Version {viewingDoc.version}</span>
                                        <span>•</span>
                                        <span>Updated {(viewingDoc.updatedAt || viewingDoc.updated_at) ? new Date(viewingDoc.updatedAt || viewingDoc.updated_at).toLocaleDateString() : 'Just now'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => {
                                    setIsViewingDoc(false);
                                    openEditDoc(viewingDoc);
                                }}>
                                    <Edit className="h-4 w-4 mr-2" /> Edit
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => downloadPdf(viewingDoc)}>
                                    <Download className="h-4 w-4 mr-2" /> PDF
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => {
                                    setIsViewingDoc(false);
                                    setSelectedDoc(viewingDoc);
                                    setIsRegenerateOpen(true);
                                }}>
                                    <RefreshCw className="h-4 w-4 mr-2" /> Regenerate
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => setDocToDelete(viewingDoc.id)}>
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </Button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-8 bg-background">
                            <div className="max-w-4xl mx-auto">
                                {(viewingDoc.logoUrl || viewingDoc.logo_url) && (
                                    <div className="flex justify-center mb-6">
                                        <img src={viewingDoc.logoUrl || viewingDoc.logo_url} alt="Document Logo" className="h-20 object-contain" />
                                    </div>
                                )}
                                <MarkdownRenderer content={viewingDoc.content} />
                            </div>
                        </div>

                        <div className="p-4 border-t bg-muted/10 flex justify-end">
                            <Button variant="outline" onClick={() => setIsViewingDoc(false)}>Close</Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>

        {/* Edit Documentation Dialog */}
        <Dialog open={isEditDocOpen} onOpenChange={setIsEditDocOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Documentation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Content (Markdown)</Label>
                        <Textarea 
                            className="font-mono text-sm"
                            rows={15}
                            value={editDocContent} 
                            onChange={(e) => setEditDocContent(e.target.value)} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Logo Upload</Label>
                        <div className="flex items-center gap-4">
                            <Input 
                                type="file" 
                                accept="image/*"
                                onChange={(e) => setEditDocLogo(e.target.files?.[0] || null)}
                            />
                        </div>
                        {(selectedDoc?.logoUrl || selectedDoc?.logo_url) && !editDocLogo && (
                            <div className="text-sm text-muted-foreground mt-1">
                                Current logo: <a href={selectedDoc.logoUrl || selectedDoc.logo_url} target="_blank" className="underline">View</a>
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditDocOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateDocumentation} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Regenerate Documentation Dialog */}
        <Dialog open={isRegenerateOpen} onOpenChange={setIsRegenerateOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Regenerate Documentation</DialogTitle>
                    <DialogDescription>
                        Provide feedback or areas of concern for the AI to improve the documentation.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Areas of Concern</Label>
                        <Textarea 
                            placeholder="e.g., Please expand on the technical architecture..."
                            rows={4}
                            value={regenerateConcern} 
                            onChange={(e) => setRegenerateConcern(e.target.value)} 
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsRegenerateOpen(false)}>Cancel</Button>
                    <Button onClick={handleRegenerateDocumentation} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Regenerate
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && !isDeletingDoc && setDocToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the documentation.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletingDoc}>Cancel</AlertDialogCancel>
                    <Button variant="destructive" onClick={confirmDeleteDocumentation} disabled={isDeletingDoc}>
                        {isDeletingDoc && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
