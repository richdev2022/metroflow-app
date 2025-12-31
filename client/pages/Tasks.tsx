import React, { useEffect, useState } from 'react';
import { api } from "@/lib/api-client";
import { Task, CreateTaskInput, ApiResponse, TeamMember, Comment, CreateCommentInput, EpicCounts, Epic } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Upload, Trash2, Check, AlertCircle, Download, X, Loader2, Edit, Users, MessageSquare, Send, Copy, Search, Smile, Link, Heart, ThumbsUp } from "lucide-react";
import EmojiPicker from 'emoji-picker-react';
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Layout from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Multi-select component for team members
  const TeamMemberMultiSelect = ({
    selected,
    onChange,
    placeholder = "Select team members..."
  }: {
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
  }) => { 
    const [open, setOpen] = useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <div className="flex flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selected.map((id) => {
                  const member = teamMembers.find((d) => d.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {member?.name}
                      <button
                        className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChange(selected.filter((s) => s !== id));
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ); 
                })
              )}
            </div>
            <Check className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput placeholder="Search team members..." />
            <CommandList>
              <CommandEmpty>No team members found.</CommandEmpty>
              <CommandGroup>
                {teamMembers.map((member) => (
                  <CommandItem
                    key={member.id}
                    onSelect={() => {
                      const newSelected = selected.includes(member.id)
                        ? selected.filter((s) => s !== member.id)
                        : [...selected, member.id];
                      onChange(newSelected);
                    }}
                  > 
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        selected.includes(member.id) ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    {member.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const [epicForm, setEpicForm] = useState({
    epic: "",
    sprint: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    assignedTo: [] as string[],
  });

  const [taskList, setTaskList] = useState<CreateTaskInput[]>([
    {
      title: "",
      description: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      assignedTo: [] as string[],
    },
  ]);

  // Sync task dates with epic dates
  useEffect(() => {
    setTaskList(prev => prev.map(task => ({
      ...task,
      startDate: epicForm.startDate,
      endDate: epicForm.endDate || task.endDate
    })));
  }, [epicForm.startDate, epicForm.endDate]);

  const [file, setFile] = useState<File | null>(null);
  const [taskPreview, setTaskPreview] = useState<{ count: number; message: string } | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [detectedTasks, setDetectedTasks] = useState<string[]>([]);
  const [pendingPasteText, setPendingPasteText] = useState<string>("");
  const [isDetectingPaste, setIsDetectingPaste] = useState(false);
  const [isCreatingTasks, setIsCreatingTasks] = useState(false);
  const [showPasteDetectionModal, setShowPasteDetectionModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [pendingPasteTaskIndex, setPendingPasteTaskIndex] = useState<number>(0);
  const [pasteTargetField, setPasteTargetField] = useState<'title' | 'description'>('title');
  const [pasteMode, setPasteMode] = useState<'single' | 'multiple' | 'existing'>('single');
  const [selectedExistingIndex, setSelectedExistingIndex] = useState<number>(0);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalTasks, setTotalTasks] = useState(0);
  const [epicCounts, setEpicCounts] = useState<EpicCounts>({});

  // Delete loader state
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Epic edit modal state
  const [showEpicEditModal, setShowEpicEditModal] = useState(false);
  const [editingEpic, setEditingEpic] = useState<string>("");
  const [epicEditForm, setEpicEditForm] = useState({
    epic: "",
    sprint: "",
    startDate: "",
    endDate: "",
    assignedTo: [] as string[],
  });
  const [isUpdatingEpic, setIsUpdatingEpic] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("");

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchId, setSearchId] = useState("");
  const [selectedEpicFilter, setSelectedEpicFilter] = useState<string>("all");
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({ start: "", end: "" });

  const [epicsList, setEpicsList] = useState<Epic[]>([]);

  useEffect(() => { 
    fetchTasks();
    fetchTeamMembers();
    fetchEpics();
  }, []);

  const fetchEpics = async () => {
    try {
      const response = await api.get("/epics");
      const data = response.data;
      if (data.success && data.data) {
        setEpicsList(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch epics", err);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await api.get("/team");
      const data = response.data as ApiResponse<TeamMember[]>;
      if (data.success && data.data) {
        setTeamMembers(data.data);
      } else {
        // Fallback mock team members for demo
        setTeamMembers([
          { id: "1", name: "John Doe", email: "john@example.com", role: "member", status: "active" },
          { id: "2", name: "Jane Smith", email: "jane@example.com", role: "member", status: "active" },
          { id: "3", name: "Bob Johnson", email: "bob@example.com", role: "manager", status: "active" },
        ]);
      }
    } catch (err) {
      console.error(err);
      // Fallback mock team members
      setTeamMembers([
        { id: "1", name: "John Doe", email: "john@example.com", role: "member", status: "active" },
        { id: "2", name: "Jane Smith", email: "jane@example.com", role: "member", status: "active" },
        { id: "3", name: "Bob Johnson", email: "bob@example.com", role: "manager", status: "active" },
      ]);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      // Fetch all tasks for client-side filtering
      const response = await api.get("/tasks?limit=10000");
      const data = response.data as ApiResponse<{ tasks: Task[]; total: number; epicCounts: EpicCounts }>;

      if (data.success && data.data) {
        setTasks(data.data.tasks);
        // We'll calculate total based on filters
        // setTotalTasks(data.data.total); 
        setEpicCounts(data.data.epicCounts);
        setCurrentPage(1);
      } else {
        setError(data.error || "Failed to fetch tasks");
      }
    } catch (err) {
      setError("Failed to load tasks");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateTasksFromRange = (formData: CreateTaskInput): CreateTaskInput[] => {
    // Since frequency is removed, create a single task for the date range
    return [formData];
  };

  const handleAddTask = async () => {
    const tasksToCreate: CreateTaskInput[] = [];

    for (const task of taskList) {
      if (!task.title) {
        setError("Please fill in title for each task");
        return;
      }

      const fullTask: CreateTaskInput = {
        ...task,
        epic: epicForm.epic || task.epic,
        sprint: epicForm.sprint || task.sprint,
        assignedTo: task.assignedTo && task.assignedTo.length > 0 ? task.assignedTo : epicForm.assignedTo,
        images: imageUrls, // Include uploaded images
      };

      const generated = generateTasksFromRange(fullTask);
      tasksToCreate.push(...generated);
    }

    if (tasksToCreate.length === 0) {
      setError("No tasks to create");
      return;
    }

    setIsCreatingTasks(true);
    setError(null);

    try {
      const response = await api.post("/tasks/bulk", { tasks: tasksToCreate });
      const data = response.data as ApiResponse<Task[]>;

      if (data.success && data.data) {
        setTasks((prev) => [...data.data, ...prev]);

        // Update epic counts
        const newEpicCounts = { ...epicCounts };
        data.data.forEach(task => {
          const epic = task.epic || "No Epic";
          newEpicCounts[epic] = (newEpicCounts[epic] || 0) + 1;
        });
        setEpicCounts(newEpicCounts);

        toast({
          title: `${tasksToCreate.length} tasks created`,
          description: "Your tasks have been added successfully",
        });

        // Reset form
        setEpicForm({
          epic: "",
          sprint: "",
          startDate: new Date().toISOString().split("T")[0],
          endDate: "",
          assignedTo: [],
        });
        setTaskList([
          {
            title: "",
            description: "",
            startDate: new Date().toISOString().split("T")[0],
            endDate: "",
            assignedTo: [],
          },
        ]);
        setImages([]);
        setImageUrls([]);
        setIsFormOpen(false);
        setError(null);
      } else {
        setError(data.error || "Failed to create tasks");
      }
    } catch (err) {
      setError("Failed to create tasks");
      console.error(err);
    } finally {
      setIsCreatingTasks(false);
    }
  };

  const downloadTemplate = () => {
    const data = [
      ["Title", "Description", "Epic", "Sprint", "Start Date", "End Date"],
      ["Sample Task", "Description here", "Epic 1", "Sprint 1", "2024-01-01", "2024-12-31"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    XLSX.writeFile(wb, "tasks_template.xlsx");
  };

  const handleBulkPaste = async () => {
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      const bulkTasks: CreateTaskInput[] = [];

      for (let i = 1; i < jsonData.length; i++) { // Skip header
        const row = jsonData[i];
        if (row.length >= 6) {
          bulkTasks.push({
            title: row[0]?.toString().trim() || "",
            description: row[1]?.toString().trim() || "",
            epic: row[2]?.toString().trim() || "",
            sprint: row[3]?.toString().trim() || "",
            startDate: row[4]?.toString().trim() || new Date().toISOString().split("T")[0],
            endDate: row[5]?.toString().trim() || new Date().toISOString().split("T")[0],
            assignedTo: [], // Can add if needed
          });
        }
      }

      if (bulkTasks.length === 0) {
        setError("No valid tasks found in the file");
        return;
      }

      // Set epic from first task
      const firstTask = bulkTasks[0];
      setEpicForm({
        epic: firstTask.epic || "",
        sprint: firstTask.sprint || "",
        startDate: firstTask.startDate,
        endDate: firstTask.endDate,
        assignedTo: [],
      });

      // Set task list
      setTaskList(bulkTasks.map(task => ({
        ...task,
        epic: undefined, // Remove epic from individual tasks
        sprint: undefined,
      })));

      setFile(null);
      setShowBulkPaste(false);
      setIsFormOpen(true); // Open the form to review
      setError(null);
      toast({
        title: `${bulkTasks.length} tasks imported`,
        description: "Review and create the tasks",
      });
    } catch (err) {
      setError("Failed to import tasks");
      console.error(err);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      setIsDeletingTask(true);
      const response = await api.delete(`/tasks/${id}`);
      const data = response.data as ApiResponse<null>;

      if (data.success) {
        const taskToDelete = tasks.find(t => t.id === id);
        setTasks((prev) => prev.filter((t) => t.id !== id));
        setTotalTasks(prev => prev - 1);

        // Update epic counts
        if (taskToDelete) {
          const epic = taskToDelete.epic || "No Epic";
          setEpicCounts(prev => ({
            ...prev,
            [epic]: Math.max(0, (prev[epic] || 0) - 1)
          }));
        }

        toast({
          title: "Task deleted",
          description: "The task has been successfully deleted",
        });
      } else {
        setError(data.error || "Failed to delete task");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to delete task");
    } finally {
      setIsDeletingTask(false);
    }
  };

  const bulkDeleteTasks = async () => {
    if (selectedTasks.length === 0) return;

    try {
      setIsBulkDeleting(true);
      const response = await api.delete("/tasks", {
        data: { taskIds: selectedTasks }
      });
      const data = response.data as ApiResponse<{ deletedCount: number }>;

      if (data.success && data.data) {
        const deletedTasks = tasks.filter(t => selectedTasks.includes(t.id));
        setTasks((prev) => prev.filter((t) => !selectedTasks.includes(t.id)));
        setSelectedTasks([]);
        setSelectAll(false);

        // Update epic counts
        const newEpicCounts = { ...epicCounts };
        deletedTasks.forEach(task => {
          const epic = task.epic || "No Epic";
          newEpicCounts[epic] = Math.max(0, (newEpicCounts[epic] || 0) - 1);
        });
        setEpicCounts(newEpicCounts);

        toast({
          title: `${data.data.deletedCount} tasks deleted`,
          description: "Selected tasks have been successfully deleted",
        });
      } else {
        setError(data.error || "Failed to delete tasks");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to delete tasks");
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    setIsUpdatingTask(true);
    try {
      const response = await api.put(`/tasks/${taskId}`, updates);
      const data = response.data as ApiResponse<Task>;

      if (data.success && data.data) {
        const oldTask = tasks.find(t => t.id === taskId);
        setTasks((prev) => prev.map((t) => t.id === taskId ? data.data! : t));
        setSelectedTask(data.data);

        // Update epic counts if epic changed
        if (oldTask && oldTask.epic !== data.data.epic) {
          const newEpicCounts = { ...epicCounts };
          const oldEpic = oldTask.epic || "No Epic";
          const newEpic = data.data.epic || "No Epic";

          if (oldEpic !== newEpic) {
            newEpicCounts[oldEpic] = Math.max(0, (newEpicCounts[oldEpic] || 0) - 1);
            newEpicCounts[newEpic] = (newEpicCounts[newEpic] || 0) + 1;
          }
          setEpicCounts(newEpicCounts);
        }

        toast({
          title: "Task updated",
          description: "The task has been successfully updated",
        });
      } else {
        setError(data.error || "Failed to update task");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update task");
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const bulkUpdateTasks = async (taskIds: string[], updates: Partial<Task>, successMessage?: { title: string; description: string }) => {
    setIsUpdatingEpic(true);
    try {
      const response = await api.put("/tasks/bulk-update", { taskIds, updates });
      const data = response.data as ApiResponse<Task[]>;

      if (data.success && data.data) {
        const oldEpicTasks = tasks.filter(t => taskIds.includes(t.id));
        setTasks((prev) => {
          const updatedTasks = prev.map((t) => {
            const updated = data.data!.find((ut) => ut.id === t.id);
            return updated || t;
          });
          return updatedTasks;
        });

        // Update epic counts if epic changed
        if (updates.epic && oldEpicTasks.length > 0) {
          const oldEpic = oldEpicTasks[0].epic || "No Epic";
          const newEpic = updates.epic || "No Epic";
          if (oldEpic !== newEpic) {
            setEpicCounts(prev => ({
              ...prev,
              [oldEpic]: Math.max(0, (prev[oldEpic] || 0) - oldEpicTasks.length),
              [newEpic]: (prev[newEpic] || 0) + oldEpicTasks.length
            }));
          }
        }

        if (successMessage) {
            toast({
                title: successMessage.title,
                description: successMessage.description,
            });
        } else {
            toast({
              title: "Tasks updated",
              description: "The selected tasks have been successfully updated",
            });
        }
        setShowEpicEditModal(false);
      } else {
        setError(data.error || "Failed to update epic");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update epic");
    } finally {
      setIsUpdatingEpic(false);
    }
  };

  const openEpicEditModal = (epic: string) => {
    const epicTasks = tasks.filter(t => t.epic === epic);
    if (epicTasks.length === 0) return;

    // Calculate start and end dates for the epic (min start, max end)
    const startDates = epicTasks.map(t => new Date(t.startDate).getTime());
    const endDates = epicTasks.map(t => new Date(t.endDate).getTime());
    const minDate = startDates.length > 0 ? new Date(Math.min(...startDates)) : null;
    const maxDate = endDates.length > 0 ? new Date(Math.max(...endDates)) : null;

    const firstTask = epicTasks[0];
    setEditingEpic(epic);
    setEpicEditForm({
      epic: firstTask.epic || "",
      sprint: firstTask.sprint || "",
      startDate: minDate ? minDate.toISOString().split('T')[0] : "",
      endDate: maxDate ? maxDate.toISOString().split('T')[0] : "",
      assignedTo: firstTask.assignedTo || [],
    });
    setComments([]); // Clear previous comments
    setShowEpicEditModal(true);
    fetchEpicComments(epic);
  };

  const fetchEpicComments = async (epicName: string) => {
    try {
      setIsLoadingComments(true);
      const response = await api.get(`/comments/epic/${encodeURIComponent(epicName)}`);
      const data = response.data as ApiResponse<Comment[]>;
      if (data.success && data.data) {
        setComments(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch epic comments:", err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const onEmojiClick = (emojiObject: any) => {
    setNewComment(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewComment(value);

    // Check for mention trigger
    const lastWord = value.split(/\s+/).pop();
    if (lastWord && lastWord.startsWith('@')) {
      setMentionQuery(lastWord.substring(1));
      setShowMentionList(true);
    } else {
      setShowMentionList(false);
    }
  };

  const handleMentionSelect = (userName: string) => {
    const words = newComment.split(/\s+/);
    words.pop(); // Remove the partial mention
    const newValue = words.join(" ") + (words.length > 0 ? " " : "") + `@${userName} `;
    setNewComment(newValue);
    setShowMentionList(false);
  };

  const addEpicComment = async () => {
    if (!editingEpic || !newComment.trim()) return;

    try {
      setIsAddingComment(true);
      const response = await api.post("/comments", {
        epicName: editingEpic,
        content: newComment.trim(),
      } as CreateCommentInput);
      const data = response.data as ApiResponse<Comment>;
      if (data.success && data.data) {
        setComments(prev => [...prev, data.data!]);
        setNewComment('');
        toast({
          title: "Comment added",
          description: "Your comment has been added successfully",
        });
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    } finally {
      setIsAddingComment(false);
    }
  };

  const toggleReaction = async (commentId: string, type: 'like' | 'love') => {
    try {
      const response = await api.post(`/comments/${commentId}/reaction`, { type });
      
      const data = response.data;
      if (data.success && data.data) {
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, reactions: data.data } : c));
      }
    } catch (err) {
      console.error("Failed to toggle reaction", err);
    }
  };

  const handleEpicEdit = async () => {
    const epicTasks = tasks.filter(t => t.epic === editingEpic);
    const taskIds = epicTasks.map(t => t.id);

    const updates: Partial<Task> = {};
    if (epicEditForm.epic !== editingEpic) {
      updates.epic = epicEditForm.epic;
    }
    updates.sprint = epicEditForm.sprint;
    updates.startDate = epicEditForm.startDate;
    updates.endDate = epicEditForm.endDate;
    updates.assignedTo = epicEditForm.assignedTo;

    await bulkUpdateTasks(taskIds, updates);
  };

  const groupTasksByEpic = (tasks: Task[]) => {
    const grouped: { [epic: string]: Task[] } = {};
    tasks.forEach(task => {
      const epic = task.epic || "No Epic";
      if (!grouped[epic]) {
        grouped[epic] = [];
      }
      grouped[epic].push(task);
    });
    return grouped;
  };

  const openTaskDetail = async (task: Task) => {
    setSelectedTask(task);
    setShowTaskDetailModal(true);
    await fetchComments(task.id);
  };

  const fetchComments = async (taskId: string) => {
    try {
      setIsLoadingComments(true);
      const response = await api.get(`/comments/${taskId}`);
      const data = response.data as ApiResponse<Comment[]>;
      if (data.success && data.data) {
        setComments(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const addComment = async () => {
    if (!selectedTask || !newComment.trim()) return;

    try {
      setIsAddingComment(true);
      const response = await api.post("/comments", {
        taskId: selectedTask.id,
        content: newComment.trim(),
      } as CreateCommentInput);
      const data = response.data as ApiResponse<Comment>;
      if (data.success && data.data) {
        setComments(prev => [...prev, data.data!]);
        setNewComment('');
        toast({
          title: "Comment added",
          description: "Your comment has been added successfully",
        });
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    } finally {
      setIsAddingComment(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent, field: 'title' | 'description', taskIndex: number) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Simple detection logic: if more than 1 line, suggest multiple tasks
    if (lines.length > 1) {
      e.preventDefault();
      setDetectedTasks(lines);
      setPendingPasteText(text);
      setPendingPasteTaskIndex(taskIndex);
      setPasteTargetField(field);
      setPasteMode('multiple');
      setShowPasteDetectionModal(true);
    }
  };

  const handlePasteAction = () => {
    if (pasteMode === 'multiple') {
      const newTasks: CreateTaskInput[] = detectedTasks.map(line => ({
        title: pasteTargetField === 'title' ? line : "",
        description: pasteTargetField === 'description' ? line : "",
        startDate: epicForm.startDate,
        endDate: epicForm.endDate,
        assignedTo: epicForm.assignedTo,
      }));

      // Replace the current task with the first new task, append the rest
      const updatedTaskList = [...taskList];
      updatedTaskList.splice(pendingPasteTaskIndex, 1, ...newTasks.map(t => ({
        ...t,
        epic: taskList[pendingPasteTaskIndex].epic,
        sprint: taskList[pendingPasteTaskIndex].sprint
      })));

      setTaskList([...updatedTaskList, ...newTasks]);
      toast({
        title: `${detectedTasks.length} tasks processed`,
        description: "Multiple tasks created from pasted content",
      });
    } else if (pasteMode === 'existing') {
      setTaskList(
        taskList.map((t, i) =>
          i === selectedExistingIndex ? { ...t, [pasteTargetField]: pendingPasteText } : t
        )
      );
      toast({
        title: "Pasted into existing task",
        description: `Updated ${pasteTargetField} of Task ${selectedExistingIndex + 1}`,
      });
    } else {
      // single
      setTaskList(
        taskList.map((t, i) =>
          i === pendingPasteTaskIndex ? { ...t, [pasteTargetField]: pendingPasteText } : t
        )
      );
    }

    setShowPasteDetectionModal(false);
    setDetectedTasks([]);
    setPendingPasteText("");
    setPendingPasteTaskIndex(0);
  };

  const { paginatedTasks, filteredTotal, allEpics, filteredTasks } = React.useMemo(() => {
    // 1. Sort by createdAt to establish stable order
    const sortedAll = [...tasks].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // 2. Assign stable IDs (1-based index)
    const withIds = sortedAll.map((task, index) => ({
      ...task,
      displayId: index + 1
    }));

    // 3. Filter
    const filtered = withIds.filter(task => {
      const matchesSearch = searchQuery === "" || 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesId = searchId === "" || task.displayId.toString() === searchId;
      
      const matchesEpic = selectedEpicFilter === "all" || (task.epic || "No Epic") === selectedEpicFilter;
      
      const matchesMember = selectedMemberFilter === "all" || 
        (task.assignedTo && task.assignedTo.includes(selectedMemberFilter));

      const matchesDate = (!dateFilter.start || new Date(task.startDate) >= new Date(dateFilter.start)) &&
                          (!dateFilter.end || new Date(task.endDate) <= new Date(dateFilter.end));

      return matchesSearch && matchesId && matchesEpic && matchesMember && matchesDate;
    });

    // Get unique epics for filter dropdown
    const epics = Array.from(new Set(tasks.map(t => t.epic || "No Epic"))).sort();

    // Get unique epics from FILTERED tasks for pagination
    const filteredEpics = Array.from(new Set(filtered.map(t => t.epic || "No Epic"))).sort();

    // 4. Paginate based on Epics
    const startIndex = (currentPage - 1) * pageSize;
    const visibleEpics = filteredEpics.slice(startIndex, startIndex + pageSize);
    
    // 5. Get tasks for visible Epics
    const paginated = filtered.filter(t => visibleEpics.includes(t.epic || "No Epic"));

    return { 
      paginatedTasks: paginated, 
      filteredTotal: filteredEpics.length, // Total count is now number of epics
      allEpics: epics,
      filteredTasks: filtered
    };
  }, [tasks, searchQuery, searchId, selectedEpicFilter, selectedMemberFilter, dateFilter, currentPage, pageSize]);

  const handleExportTasks = () => {
    if (!filteredTasks.length) {
      toast({
        title: "No tasks to export",
        description: "Try adjusting your filters",
        variant: "destructive",
      });
      return;
    }

    const exportData = filteredTasks.map(task => ({
      ID: (task as any).displayId || task.id,
      Title: task.title,
      Description: task.description,
      Epic: task.epic,
      Sprint: task.sprint,
      Status: task.status,
      "Start Date": new Date(task.startDate).toLocaleDateString(),
      "End Date": new Date(task.endDate).toLocaleDateString(),
      "Assigned To": task.assignedTo?.map(id => teamMembers.find(d => d.id === id)?.name).join(", ") || ""
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    XLSX.writeFile(wb, "tasks_export.xlsx");
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedTasks(paginatedTasks.map(t => t.id));
    } else {
      setSelectedTasks([]);
    }
  };

  const handleSelectTask = (taskId: string, checked: boolean) => {
    if (checked) {
      setSelectedTasks(prev => [...prev, taskId]);
    } else {
      setSelectedTasks(prev => prev.filter(id => id !== taskId));
      setSelectAll(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading tasks...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">Tasks</h1>
            <p className="text-muted-foreground mt-2">
              Manage and track team member performance tasks
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleExportTasks}
              variant="outline"
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              onClick={() => setShowBulkPaste(!showBulkPaste)}
              variant="outline"
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Excel
            </Button>
            <Button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Task
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Add Task Form */}
        {isFormOpen && (
          <Card className="border border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>Add Tasks to Epic</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Epic Level Fields */}
              <div className="border-b pb-4">
                <h3 className="text-lg font-semibold mb-4">Epic Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="epic">Epic</Label>
                    <Input
                      id="epic"
                      placeholder="Enter epic name"
                      value={epicForm.epic}
                      onChange={(e) =>
                        setEpicForm({ ...epicForm, epic: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sprint">Sprint</Label>
                    <Input
                      id="sprint"
                      placeholder="Enter sprint name"
                      value={epicForm.sprint}
                      onChange={(e) =>
                        setEpicForm({ ...epicForm, sprint: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="epicStartDate">Start Date</Label>
                    <Input
                      id="epicStartDate"
                      type="date"
                      value={epicForm.startDate}
                      onChange={(e) =>
                        setEpicForm({ ...epicForm, startDate: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="epicEndDate">End Date</Label>
                    <Input
                      id="epicEndDate"
                      type="date"
                      value={epicForm.endDate}
                      onChange={(e) =>
                        setEpicForm({ ...epicForm, endDate: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Label>Assign Team Members (Epic Level)</Label>
                  <div className="mt-2">
                    <TeamMemberMultiSelect
                      selected={epicForm.assignedTo}
                      onChange={(selected) => setEpicForm({ ...epicForm, assignedTo: selected })}
                      placeholder="Select team members for this epic..."
                    />
                  </div>
                </div>
              </div>

              {/* Tasks */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Tasks</h3>
                  <Button
                    onClick={() =>
                      setTaskList([
                          ...taskList,
                          {
                            title: "",
                            description: "",
                            startDate: epicForm.startDate,
                            endDate: epicForm.endDate,
                            assignedTo: [],
                          },
                        ])
                    }
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Task
                  </Button>
                </div>
                {taskList.map((task, index) => (
                  <Card key={index} className="mb-4 p-4">
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <h4 className="font-medium">Task {index + 1}</h4>
                        {taskList.length > 1 && (
                          <Button
                            onClick={() =>
                              setTaskList(taskList.filter((_, i) => i !== index))
                            }
                            variant="ghost"
                            size="sm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div>
                        <Label>Title</Label>
                        <Input
                          placeholder="Task title"
                          value={task.title}
                          onChange={(e) =>
                            setTaskList(
                              taskList.map((t, i) =>
                                i === index ? { ...t, title: e.target.value } : t
                              )
                            )
                          }
                          onPaste={(e) => handlePaste(e, 'title', index)}
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea
                          placeholder="Task description"
                          value={task.description}
                          onChange={(e) =>
                            setTaskList(
                              taskList.map((t, i) =>
                                i === index ? { ...t, description: e.target.value } : t
                              )
                            )
                          }
                          onPaste={(e) => handlePaste(e, 'description', index)}
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Start Date</Label>
                          <Input
                            type="date"
                            value={task.startDate}
                            onChange={(e) =>
                              setTaskList(
                                taskList.map((t, i) =>
                                  i === index ? { ...t, startDate: e.target.value } : t
                                )
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>End Date</Label>
                          <Input
                            type="date"
                            value={task.endDate}
                            onChange={(e) =>
                              setTaskList(
                                taskList.map((t, i) =>
                                  i === index ? { ...t, endDate: e.target.value } : t
                                )
                              )
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Assign Team Members (Override Epic Assignment)</Label>
                        <div className="mt-2">
                          <TeamMemberMultiSelect
                            selected={task.assignedTo}
                            onChange={(selected) =>
                              setTaskList(
                                taskList.map((t, i) =>
                                  i === index ? { ...t, assignedTo: selected } : t
                                )
                              )
                            }
                            placeholder="Select team members for this task..."
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Images (Optional)</Label>
                        <div className="mt-2">
                          <Input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              const newImages = [...images, ...files];
                              setImages(newImages);
                              // Create preview URLs
                              const newUrls = files.map(file => URL.createObjectURL(file));
                              setImageUrls([...imageUrls, ...newUrls]);
                            }}
                            className="mt-1"
                          />
                          {imageUrls.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {imageUrls.map((url, imgIndex) => (
                                <div key={imgIndex} className="relative">
                                  <img
                                    src={url}
                                    alt={`Preview ${imgIndex + 1}`}
                                    className="w-20 h-20 object-cover rounded border"
                                  />
                                  <button
                                    onClick={() => {
                                      const newUrls = imageUrls.filter((_, i) => i !== imgIndex);
                                      const newImages = images.filter((_, i) => i !== imgIndex);
                                      setImageUrls(newUrls);
                                      setImages(newImages);
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddTask} loading={isCreatingTasks} className="gap-2">
                  <Check className="h-4 w-4" />
                  Create Tasks
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Paste Detection Modal */}
        <Dialog open={showPasteDetectionModal} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Paste Options</DialogTitle>
            </DialogHeader>
            {isDetectingPaste ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-sm text-muted-foreground text-center">
                  Analyzing pasted content...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Where to paste:</Label>
                  <RadioGroup value={pasteTargetField} onValueChange={(value: 'title' | 'description') => setPasteTargetField(value)} className="mt-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="title" id="paste-title" />
                      <Label htmlFor="paste-title">Paste to Title</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="description" id="paste-description" />
                      <Label htmlFor="paste-description">Paste to Description</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <Label>How to paste:</Label>
                  <RadioGroup value={pasteMode} onValueChange={(value: 'single' | 'multiple' | 'existing') => setPasteMode(value)} className="mt-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="single" id="paste-single" />
                      <Label htmlFor="paste-single">Paste as single task</Label>
                    </div>
                    {detectedTasks.length > 0 && (
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="multiple" id="paste-multiple" />
                        <Label htmlFor="paste-multiple">Create multiple tasks</Label>
                      </div>
                    )}
                    {taskList.length > 1 && (
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="existing" id="paste-existing" />
                        <Label htmlFor="paste-existing">Paste into existing task</Label>
                      </div>
                    )}
                  </RadioGroup>
                </div>
                {pasteMode === 'existing' && (
                  <div>
                    <Label>Select existing task:</Label>
                    <Select value={selectedExistingIndex.toString()} onValueChange={(value) => setSelectedExistingIndex(parseInt(value))}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {taskList.map((task, index) => (
                          index !== pendingPasteTaskIndex && (
                            <SelectItem key={index} value={index.toString()}>
                              Task {index + 1}: {task.title || 'Untitled'}
                            </SelectItem>
                          )
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {pasteMode === 'multiple' && (
                  <div className="max-h-40 overflow-y-auto border rounded p-2 bg-muted/50">
                    <p className="text-sm font-medium mb-1">Detected Tasks ({detectedTasks.length}):</p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside">
                      {detectedTasks.map((task, i) => (
                        <li key={i} className="truncate">{task}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowPasteDetectionModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handlePasteAction}>
                    Confirm Paste
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Task Detail Modal */}
        <Dialog open={showTaskDetailModal} onOpenChange={setShowTaskDetailModal}>
          <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
            {selectedTask && (
              <>
                <DialogHeader className="p-6 pb-4 border-b">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-sm py-1 px-3 bg-muted/50">
                          #{selectedTask.id}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTask.id);
                            toast({ title: "Copied", description: "Task ID copied to clipboard" });
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                            value={selectedTask.status}
                            onValueChange={(value: any) =>
                              setSelectedTask({...selectedTask, status: value})
                            }
                        >
                            <SelectTrigger className="w-[140px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button 
                            onClick={() => updateTask(selectedTask.id, selectedTask)} 
                            loading={isUpdatingTask}
                        >
                            <Check className="h-4 w-4 mr-2" />
                            Save
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Input
                        value={selectedTask.title}
                        onChange={(e) => setSelectedTask({...selectedTask, title: e.target.value})}
                        className="text-xl md:text-2xl font-bold h-auto py-2 border-none shadow-none px-0 focus-visible:ring-0"
                        placeholder="Task Title"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">in</span>
                        <Select
                          value={selectedTask.epicId || epicsList.find(e => e.name === selectedTask.epic)?.id || "no-epic"}
                          onValueChange={(value) => {
                            const epic = epicsList.find(e => e.id === value);
                            setSelectedTask({
                              ...selectedTask,
                              epicId: value === "no-epic" ? undefined : value,
                              epic: epic ? epic.name : undefined
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 w-auto min-w-[200px] text-sm">
                            <SelectValue placeholder="Select Epic" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no-epic">No Epic</SelectItem>
                            {epicsList.map((epic) => (
                              <SelectItem key={epic.id} value={epic.id}>
                                {epic.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-muted/5">
                  {/* Left Column: Details */}
                  <div className="w-full md:w-2/3 p-6 overflow-y-auto border-r">
                    <div className="space-y-6">
                      {/* Description Card */}
                      <Card className="p-4 shadow-sm">
                        <Label className="text-base font-semibold mb-2 block">Description</Label>
                        <Textarea
                            value={selectedTask.description || ""}
                            onChange={(e) => setSelectedTask({...selectedTask, description: e.target.value})}
                            className="min-h-[120px] resize-none focus-visible:ring-1"
                            placeholder="Add a more detailed description..."
                        />
                      </Card>

                      {/* Details Card */}
                      <Card className="p-4 shadow-sm">
                        <Label className="text-base font-semibold mb-4 block">Details</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Sprint</Label>
                            <Input
                              value={selectedTask.sprint || ""}
                              onChange={(e) => setSelectedTask({...selectedTask, sprint: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Assigned To</Label>
                            <TeamMemberMultiSelect
                               selected={selectedTask.assignedTo || []}
                               onChange={(selected) => setSelectedTask({...selectedTask, assignedTo: selected})}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Start Date</Label>
                            <Input
                              type="date"
                              value={selectedTask.startDate ? new Date(selectedTask.startDate).toISOString().split('T')[0] : ""}
                              onChange={(e) => setSelectedTask({...selectedTask, startDate: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs uppercase tracking-wider">End Date</Label>
                            <Input
                              type="date"
                              value={selectedTask.endDate ? new Date(selectedTask.endDate).toISOString().split('T')[0] : ""}
                              onChange={(e) => setSelectedTask({...selectedTask, endDate: e.target.value})}
                            />
                          </div>
                        </div>
                      </Card>

                      {/* Images Card */}
                      {selectedTask.images && selectedTask.images.length > 0 && (
                        <Card className="p-4 shadow-sm">
                          <Label className="text-base font-semibold mb-4 block">Attachments</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {selectedTask.images.map((img, i) => (
                              <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="block relative aspect-video rounded-lg overflow-hidden border hover:opacity-90 transition-opacity">
                                <img src={img} alt={`Attachment ${i+1}`} className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </Card>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Comments & Activity */}
                  <div className="w-full md:w-1/3 flex flex-col bg-muted/10">
                    <div className="p-4 border-b bg-background">
                      <h3 className="font-semibold flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Comments
                      </h3>
                    </div>
                    
                    <ScrollArea className="flex-1 p-4">
                      {isLoadingComments ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : comments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No comments yet. Be the first to comment!
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {comments.map((comment) => (
                            <div key={comment.id} className="flex gap-3 group">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                                {comment.userName?.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">{comment.userName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(comment.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="text-sm bg-muted/50 p-2 rounded-lg">
                                  {comment.content}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => toggleReaction(comment.id, 'like')}
                                        className={`flex items-center gap-1 text-xs hover:text-primary transition-colors ${comment.reactions?.some(r => r.userId === localStorage.getItem("userId") && r.type === 'like') ? 'text-primary' : 'text-muted-foreground'}`}
                                    >
                                        <ThumbsUp className="h-3 w-3" />
                                        <span>{comment.reactions?.filter(r => r.type === 'like').length || 0}</span>
                                    </button>
                                    <button 
                                        onClick={() => toggleReaction(comment.id, 'love')}
                                        className={`flex items-center gap-1 text-xs hover:text-red-500 transition-colors ${comment.reactions?.some(r => r.userId === localStorage.getItem("userId") && r.type === 'love') ? 'text-red-500' : 'text-muted-foreground'}`}
                                    >
                                        <Heart className="h-3 w-3" />
                                        <span>{comment.reactions?.filter(r => r.type === 'love').length || 0}</span>
                                    </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                    <div className="p-4 border-t bg-background">
                      <div className="relative">
                        <Textarea
                          placeholder="Write a comment..."
                          value={newComment}
                          onChange={handleCommentChange}
                          className="min-h-[80px] pr-10 resize-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              addComment();
                            }
                          }}
                        />
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <Smile className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 border-none" align="end">
                              <EmojiPicker onEmojiClick={onEmojiClick} />
                            </PopoverContent>
                          </Popover>
                          <Button 
                            size="icon" 
                            className="h-8 w-8" 
                            onClick={addComment}
                            disabled={!newComment.trim() || isAddingComment}
                          >
                            {isAddingComment ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        
                        {/* Mention List */}
                        {showMentionList && (
                          <div className="absolute bottom-full left-0 w-full mb-2 bg-popover border rounded-md shadow-md max-h-40 overflow-y-auto z-50">
                            {teamMembers
                              .filter(d => d.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                              .map(member => (
                                <button
                                  key={member.id}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                                  onClick={() => handleMentionSelect(member.name)}
                                >
                                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs text-primary">
                                    {member.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  {member.name}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Epic Edit Modal */}
        <Dialog open={showEpicEditModal} onOpenChange={setShowEpicEditModal}>
         <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>Edit Epic: {editingEpic}</DialogTitle>
           </DialogHeader>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Edit Form */}
             <div className="space-y-4">
               <div>
                 <Label htmlFor="edit-epic">Epic Name</Label>
                 <Input
                   id="edit-epic"
                   value={epicEditForm.epic}
                   onChange={(e) => setEpicEditForm({ ...epicEditForm, epic: e.target.value })}
                 />
               </div>
               <div>
                 <Label htmlFor="edit-sprint">Sprint</Label>
                 <Input
                   id="edit-sprint"
                   value={epicEditForm.sprint}
                   onChange={(e) => setEpicEditForm({ ...epicEditForm, sprint: e.target.value })}
                 />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <Label htmlFor="edit-start">Start Date</Label>
                   <Input
                     id="edit-start"
                     type="date"
                     value={epicEditForm.startDate}
                     onChange={(e) => setEpicEditForm({ ...epicEditForm, startDate: e.target.value })}
                   />
                 </div>
                 <div>
                   <Label htmlFor="edit-end">End Date</Label>
                   <Input
                     id="edit-end"
                     type="date"
                     value={epicEditForm.endDate}
                     onChange={(e) => setEpicEditForm({ ...epicEditForm, endDate: e.target.value })}
                   />
                 </div>
               </div>
               <div>
                 <Label>Assigned To</Label>
                 <div className="mt-2">
                   <TeamMemberMultiSelect
                     selected={epicEditForm.assignedTo}
                     onChange={(selected) => setEpicEditForm({ ...epicEditForm, assignedTo: selected })}
                   />
                 </div>
               </div>
               <div className="pt-4">
                 <Button onClick={handleEpicEdit} disabled={isUpdatingEpic} className="w-full">
                   {isUpdatingEpic ? (
                     <Loader2 className="h-4 w-4 animate-spin mr-2" />
                   ) : (
                     <Check className="h-4 w-4 mr-2" />
                   )}
                   {isUpdatingEpic ? "Updating..." : "Update Epic"}
                 </Button>
               </div>
             </div>

             {/* Epic Comments */}
             <div className="border-l pl-6 flex flex-col h-[500px]">
               <h3 className="font-semibold mb-4 flex items-center gap-2">
                 <MessageSquare className="h-4 w-4" />
                 Epic Discussion
               </h3>
               
               <ScrollArea className="flex-1 pr-4">
                 {isLoadingComments ? (
                   <div className="flex justify-center py-4">
                     <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                   </div>
                 ) : comments.length === 0 ? (
                   <div className="text-center py-8 text-muted-foreground text-sm">
                     No comments yet. Start a discussion about this epic!
                   </div>
                 ) : (
                   <div className="space-y-4">
                     {comments.map((comment) => (
                       <div key={comment.id} className="flex gap-3">
                         <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                           {comment.userName?.substring(0, 2).toUpperCase()}
                         </div>
                         <div className="flex-1 space-y-1">
                           <div className="flex items-center justify-between">
                             <span className="text-sm font-medium">{comment.userName}</span>
                             <span className="text-xs text-muted-foreground">
                               {new Date(comment.createdAt).toLocaleDateString()}
                             </span>
                           </div>
                           <div className="text-sm bg-muted/50 p-2 rounded-lg">
                             {comment.content}
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </ScrollArea>

               <div className="pt-4 mt-auto">
                 <div className="relative">
                   <Textarea
                     placeholder="Write a comment..."
                     value={newComment}
                     onChange={(e) => setNewComment(e.target.value)}
                     className="min-h-[80px] pr-10 resize-none"
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         addEpicComment();
                       }
                     }}
                   />
                   <div className="absolute bottom-2 right-2">
                     <Button 
                       size="icon" 
                       className="h-8 w-8" 
                       onClick={addEpicComment}
                       disabled={!newComment.trim() || isAddingComment}
                     >
                       {isAddingComment ? (
                         <Loader2 className="h-4 w-4 animate-spin" />
                       ) : (
                         <Send className="h-4 w-4" />
                       )}
                     </Button>
                   </div>
                 </div>
               </div>
             </div>
           </div>
         </DialogContent>
       </Dialog>

        {/* Bulk Upload Form */}
        {showBulkPaste && (
          <Card className="border border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>Import Tasks from Excel</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Upload an Excel file with tasks. Format: Title (required), Description, Epic, Sprint, Start Date, End Date
              </p>
              <Button
                variant="link"
                className="p-0 h-auto text-sm"
                onClick={downloadTemplate}
              >
                <Download className="h-4 w-4 mr-1" />
                Download Excel Template
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="file">Select Excel File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="mt-1"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBulkPaste(false);
                    setFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleBulkPaste} className="gap-2" disabled={!file}>
                  <Upload className="h-4 w-4" />
                  Import Tasks
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="pl-8"
                />
              </div>

              {/* Search by ID */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID (e.g. 5)"
                  value={searchId}
                  onChange={(e) => { setSearchId(e.target.value); setCurrentPage(1); }}
                  className="pl-8"
                />
              </div>

              {/* Epic Filter */}
              <Select value={selectedEpicFilter} onValueChange={(v) => { setSelectedEpicFilter(v); setCurrentPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Epic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Epics</SelectItem>
                  {allEpics.map(epic => (
                    <SelectItem key={epic} value={epic}>{epic}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Team Member Filter */}
              <Select value={selectedMemberFilter} onValueChange={(v) => { setSelectedMemberFilter(v); setCurrentPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date Filter */}
              <div className="flex gap-2">
                 <Input
                   type="date"
                   placeholder="Start Date"
                   value={dateFilter.start}
                   onChange={(e) => { setDateFilter({...dateFilter, start: e.target.value}); setCurrentPage(1); }}
                   className="w-full"
                 />
                 <Input
                   type="date"
                   placeholder="End Date"
                   value={dateFilter.end}
                   onChange={(e) => { setDateFilter({...dateFilter, end: e.target.value}); setCurrentPage(1); }}
                   className="w-full"
                 />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks List */}
        <Card className="border border-border">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>All Tasks</CardTitle>
              <div className="flex gap-2 items-center">
                {selectedTasks.length > 0 && (
                  <>
                    <Select value={bulkStatus} onValueChange={setBulkStatus}>
                      <SelectTrigger className="w-[150px] h-8">
                        <SelectValue placeholder="Bulk Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    {bulkStatus && (
                        <Button
                            onClick={() => {
                                bulkUpdateTasks(selectedTasks, { status: bulkStatus as any }, {
                                    title: "Tasks Updated",
                                    description: `Status updated to ${bulkStatus.replace('_', ' ')} for ${selectedTasks.length} tasks`
                                });
                                setBulkStatus("");
                            }}
                            variant="default"
                            size="sm"
                            className="gap-2"
                        >
                            <Check className="h-4 w-4" />
                            Update
                        </Button>
                    )}
                    <Button
                      onClick={bulkDeleteTasks}
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Selected ({selectedTasks.length})
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {paginatedTasks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No tasks found matching your filters</p>
                {filteredTotal === 0 && tasks.length === 0 && (
                   <p className="text-sm text-muted-foreground mt-1">
                     Create your first task using the form above
                   </p>
                )}
              </div>
            ) : (
              <Accordion type="multiple" className="w-full" defaultValue={selectedEpicFilter !== "all" ? [selectedEpicFilter] : []}>
                {Object.entries(groupTasksByEpic(paginatedTasks)).map(([epic, epicTasks]) => {
                  // Derive Epic details: Start date is min of all tasks, End date is max of all tasks
                  const startDate = epicTasks.reduce((min, t) => t.startDate < min ? t.startDate : min, epicTasks[0].startDate);
                  const endDate = epicTasks.reduce((max, t) => t.endDate > max ? t.endDate : max, epicTasks[0].endDate);
                  
                  // Calculate days left
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const end = new Date(endDate);
                  end.setHours(0, 0, 0, 0);
                  const diffTime = end.getTime() - today.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  const isOverdue = diffDays < 0;
                  
                  // Get assigned team members for the epic (aggregate from all tasks or use first task's assignment if consistent)
                  const allAssignedIds = Array.from(new Set(epicTasks.flatMap(t => t.assignedTo || [])));
                  const assignedNames = allAssignedIds
                    .map(id => teamMembers.find(d => d.id === id)?.name)
                    .filter(Boolean)
                    .join(", ");

                  return (
                  <AccordionItem key={epic} value={epic}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full mr-4">
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex flex-wrap items-center gap-2 md:gap-4">
                            <h3 className="text-lg font-semibold break-all">{epic}</h3>
                            <Badge variant="secondary" className="whitespace-nowrap">{epicTasks.length} tasks</Badge>
                            {epic !== "No Epic" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEpicEditModal(epic);
                                }}
                                className="gap-1 h-6"
                              >
                                <Edit className="h-3 w-3" />
                                Edit Epic
                              </Button>
                            )}
                          </div>
                          
                          {epic !== "No Epic" && (
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{assignedNames || "Unassigned"}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span>{new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}</span>
                              </div>
                              <div className={`font-medium ${isOverdue ? "text-red-500" : "text-green-500"}`}>
                                {diffDays > 0 ? `days left +${diffDays}` : `days overdue ${diffDays}`}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[1000px]">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-3 px-4 font-semibold w-[50px]">
                                <Checkbox
                                  checked={selectAll}
                                  onCheckedChange={handleSelectAll}
                                />
                              </th>
                              <th className="text-left py-3 px-4 font-semibold w-[100px]">ID</th>
                              <th className="text-left py-3 px-4 font-semibold">
                                Title
                              </th>
                              <th className="text-left py-3 px-4 font-semibold">
                                Sprint
                              </th>
                              <th className="text-left py-3 px-4 font-semibold">
                                Status
                              </th>
                              <th className="text-left py-3 px-4 font-semibold">
                                Assigned To
                              </th>
                              <th className="text-left py-3 px-4 font-semibold">
                                Date Range
                              </th>
                              <th className="text-center py-3 px-4 font-semibold">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {epicTasks.map((task) => {
                              const assignedNames = task.assignedTo
                                ?.map((id) => teamMembers.find((d) => d.id === id)?.name)
                                .filter(Boolean)
                                .join(", ") || "-";
                              return (
                                <tr
                                  key={task.id}
                                  className="border-b border-border hover:bg-muted/50 cursor-pointer"
                                  onClick={() => openTaskDetail(task)}
                                >
                                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selectedTasks.includes(task.id)}
                                      onCheckedChange={(checked) => handleSelectTask(task.id, checked as boolean)}
                                    />
                                  </td>
                                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2 group">
                                      <span className="font-mono text-muted-foreground">#{(task as any).displayId}</span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText((task as any).displayId.toString());
                                          toast({ title: "Copied", description: "Task ID copied to clipboard" });
                                        }}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 font-medium max-w-[200px]">
                                    <div className="break-words whitespace-normal" title={task.title}>
                                      {task.title}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">{task.sprint || "-"}</td>
                                  <td className="py-3 px-4">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${
                                        task.status === "completed"
                                          ? "bg-green-100 text-green-700"
                                          : task.status === "in_progress"
                                            ? "bg-blue-100 text-blue-700"
                                            : "bg-yellow-100 text-yellow-700"
                                      }`}
                                    >
                                      {task.status.replace('_', ' ')}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">{assignedNames}</td>
                                  <td className="py-3 px-4">
                                    {new Date(task.startDate).toLocaleDateString()} - {new Date(task.endDate).toLocaleDateString()}
                                  </td>
                                  <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => openTaskDetail(task)}
                                        className="text-blue-500 hover:text-blue-700 transition-colors"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => deleteTask(task.id)}
                                        className="text-red-500 hover:text-red-700 transition-colors"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  );
                })}
              </Accordion>
            )}

            {/* Pagination */}
            {filteredTotal > pageSize && (
              <div className="flex justify-center mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>

                    {Array.from({ length: Math.ceil(filteredTotal / pageSize) }, (_, i) => i + 1)
                      .filter(page => {
                        const totalPages = Math.ceil(filteredTotal / pageSize);
                        return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                      })
                      .map((page, index, array) => {
                        if (index > 0 && page - array[index - 1] > 1) {
                          return (
                            <PaginationItem key={`ellipsis-${page}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        }
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={page === currentPage}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => currentPage < Math.ceil(filteredTotal / pageSize) && setCurrentPage(currentPage + 1)}
                        className={currentPage >= Math.ceil(filteredTotal / pageSize) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
