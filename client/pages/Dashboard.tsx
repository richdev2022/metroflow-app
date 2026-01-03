import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Task, KPISummary, ApiResponse, TeamMember, Comment, CreateCommentInput, Epic } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, TrendingUp, Target, Clock, ArrowRight, Users, Trophy, Medal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Edit, X, Check, Loader2, Copy, MessageSquare, Smile, Send, ThumbsUp, Heart, Trash2 } from "lucide-react";
import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from 'emoji-picker-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [kpiSummary, setKpiSummary] = useState<KPISummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>("all");
  const [showEpicEditModal, setShowEpicEditModal] = useState(false);
  const [editingEpic, setEditingEpic] = useState<string | null>(null);
  const [isUpdatingEpic, setIsUpdatingEpic] = useState(false);
  const [epicEditForm, setEpicEditForm] = useState({
    epic: "",
    sprint: "",
    startDate: "",
    endDate: "",
    assignedTo: [] as string[],
  });
  
  // Task Detail Modal State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  
  // Comments State
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  
  // Epics State (for dropdown)
  const [epicsList, setEpicsList] = useState<Epic[]>([]);

  const { toast } = useToast();

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

  const businessId = localStorage.getItem("businessId");
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchTeamMembers();
    fetchTasksAndCalculateKPI();
    fetchEpics();
  }, []);

  useEffect(() => {
    fetchTasksAndCalculateKPI();
  }, [selectedMember]);

  // Fetch comments when a task is selected
  useEffect(() => {
    if (selectedTask) {
      fetchComments(selectedTask.id);
    }
  }, [selectedTask?.id]);

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
      }
    } catch (err) {
      console.error("Failed to fetch team members", err);
    }
  };

  const fetchTasksAndCalculateKPI = async () => {
    try {
      setLoading(true);
      const response = await api.get("/tasks?limit=10000");
      const data = response.data as any;

      if (data.success && data.data) {
        const fetchedTasks = Array.isArray(data.data) ? data.data : (data.data.tasks || []);
        setAllTasks(fetchedTasks);
        let filteredTasks = fetchedTasks;
        if (selectedMember !== "all") {
          filteredTasks = fetchedTasks.filter(task =>
            task.assignedTo && task.assignedTo.includes(selectedMember)
          );
        }
        setTasks(filteredTasks);
        calculateKPI(filteredTasks);
      } else {
        setError(data.error || "Failed to fetch tasks");
      }
    } catch (err) {
      setError("Failed to load dashboard data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setShowTaskDetailModal(true);
    setComments([]); // Clear comments initially
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    setIsUpdatingTask(true);
    try {
      const response = await api.put(`/tasks/${taskId}`, updates);

      const data = response.data as ApiResponse<Task>;

      if (data.success && data.data) {
        toast({
          title: "Task updated",
          description: "Task has been updated successfully",
        });
        setShowTaskDetailModal(false);
        fetchTasksAndCalculateKPI(); // Refresh dashboard
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "Failed to update task",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update task",
      });
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    setIsDeletingTask(true);
    try {
      const response = await api.delete(`/tasks/${taskId}`);
      const data = response.data;

      if (data.success) {
        toast({
          title: "Task deleted",
          description: "Task has been deleted successfully",
        });
        fetchTasksAndCalculateKPI(); // Refresh dashboard
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "Failed to delete task",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete task",
      });
    } finally {
      setIsDeletingTask(false);
    }
  };

  // Comment functions
  const fetchComments = async (taskId: string) => {
    setIsLoadingComments(true);
    try {
      const response = await api.get(`/comments/${taskId}`);
      const data = response.data;
      if (data.success) {
        setComments(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch comments", err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const addComment = async () => {
    if (!selectedTask || !newComment.trim()) return;

    setIsAddingComment(true);
    try {
      const payload: CreateCommentInput = {
        taskId: selectedTask.id,
        content: newComment,
        mentions: [] // Parse mentions if needed
      };

      const response = await api.post("/comments", payload);
      const data = response.data;
      if (data.success) {
        setComments([...comments, data.data]);
        setNewComment("");
        toast({ title: "Comment added" });
      }
    } catch (err) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: "Failed to add comment" 
      });
    } finally {
      setIsAddingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      const response = await api.delete(`/comments/${commentId}`);
      if (response.status === 200) {
        setComments(comments.filter(c => c.id !== commentId));
        toast({ title: "Comment deleted" });
      }
    } catch (err) {
      console.error("Failed to delete comment", err);
    }
  };

  const toggleReaction = async (commentId: string, type: 'like' | 'love' | 'laugh') => {
    try {
      const response = await api.post(`/comments/${commentId}/reaction`, { type });
      const data = response.data;
      if (data.success) {
        // Update comments state locally to reflect reaction
        setComments(comments.map(c => 
          c.id === commentId ? { ...c, reactions: data.data } : c
        ));
      }
    } catch (err) {
      console.error("Failed to toggle reaction", err);
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

  const handleMentionSelect = (name: string) => {
    const words = newComment.split(/\s+/);
    words.pop(); // Remove the partial mention
    setNewComment([...words, `@${name} `].join(" "));
    setShowMentionList(false);
  };

  const calculateKPI = (taskList: Task[]) => {
    const today = new Date();

    // Monthly tasks (all tasks are monthly now)
    const monthlyTasks = taskList;
    const completedMonthly = monthlyTasks.filter(
      (t) => t.status === "completed",
    ).length;

    // Current progress (real-time this month)
    const currentMonthStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    );
    const tasksThisMonth = monthlyTasks.filter((t) => {
      const taskStart = new Date(t.startDate);
      return taskStart >= currentMonthStart && taskStart <= today;
    });

    const completedThisMonth = tasksThisMonth.filter(
      (t) => t.status === "completed",
    ).length;

    // Overdue tasks
    const overdueTasks = monthlyTasks.filter(
      (t) => t.isOverdue && t.status !== "completed",
    );

    // Calculate epic-based KPIs
    const epicGroups = monthlyTasks.reduce((groups, task) => {
      const epic = task.epic || "No Epic";
      if (!groups[epic]) {
        groups[epic] = [];
      }
      groups[epic].push(task);
      return groups;
    }, {} as Record<string, Task[]>);

    const epicSummaries: Record<string, any> = {};
    let totalTarget = 0;
    let totalAccomplished = 0;

    Object.entries(epicGroups).forEach(([epicName, epicTasks]) => {
      const epicTarget = epicTasks.length; // Number of tasks in epic
      const epicAccomplished = epicTasks.filter(t => t.status === "completed").length;
      totalTarget += epicTarget;
      totalAccomplished += epicAccomplished;

      // Calculate start and end dates for the epic
      const startDates = epicTasks.map(t => new Date(t.startDate).getTime());
      const endDates = epicTasks.map(t => new Date(t.endDate).getTime());
      const minDate = startDates.length > 0 ? new Date(Math.min(...startDates)) : null;
      const maxDate = endDates.length > 0 ? new Date(Math.max(...endDates)) : null;
      
      const allAssignedIds = Array.from(new Set(epicTasks.flatMap(t => t.assignedTo || [])));

      epicSummaries[epicName] = {
        total: epicTarget,
        completed: epicAccomplished,
        percentageCompletion: epicTarget > 0 ? (epicAccomplished / epicTarget) * 100 : 0,
        startDate: minDate ? minDate.toISOString() : undefined,
        endDate: maxDate ? maxDate.toISOString() : undefined,
        assignedTo: allAssignedIds
      };
    });

    const summary: KPISummary = {
      current: {
        total: tasksThisMonth.length,
        completed: completedThisMonth,
        percentageCompletion:
          tasksThisMonth.length > 0
            ? (completedThisMonth / tasksThisMonth.length) * 100
            : 0,
      },
      monthly: {
        total: monthlyTasks.length,
        completed: completedMonthly,
        percentageCompletion:
          monthlyTasks.length > 0
            ? (completedMonthly / monthlyTasks.length) * 100
            : 0,
        targetVsAccomplishment: {
          target: totalTarget,
          accomplished: totalAccomplished,
        },
      },
      epics: epicSummaries,
      overdueTasks,
    };

    setKpiSummary(summary);
  };

  const openEpicEditModal = (epic: string) => {
    const epicTasks = allTasks.filter(t => t.epic === epic);
    const firstTask = epicTasks[0];

    if (firstTask) {
      // Calculate start and end dates for the epic (min start, max end)
      const startDates = epicTasks.map(t => new Date(t.startDate).getTime());
      const endDates = epicTasks.map(t => new Date(t.endDate).getTime());
      const minDate = startDates.length > 0 ? new Date(Math.min(...startDates)) : null;
      const maxDate = endDates.length > 0 ? new Date(Math.max(...endDates)) : null;

      setEditingEpic(epic);
      setEpicEditForm({
        epic: epic,
        sprint: firstTask.sprint || "",
        startDate: minDate ? minDate.toISOString().split('T')[0] : "",
        endDate: maxDate ? maxDate.toISOString().split('T')[0] : "",
        assignedTo: Array.from(new Set(epicTasks.flatMap(t => t.assignedTo || []))),
      });
      setShowEpicEditModal(true);
    }
  };

  const handleEpicEdit = async () => {
    const epicTasks = allTasks.filter(t => t.epic === editingEpic);
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

  const bulkUpdateTasks = async (taskIds: string[], updates: Partial<Task>) => {
    setIsUpdatingEpic(true);
    try {
      const response = await api.put("/tasks/bulk-update", { taskIds, updates });
      const data = response.data as ApiResponse<Task[]>;

      if (data.success && data.data) {
        toast({
          title: "Epic updated",
          description: "The epic details have been successfully updated",
        });
        setShowEpicEditModal(false);
        fetchTasksAndCalculateKPI();
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

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading KPI data...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">KPI Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Performance tracking summary and analytics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="member-filter" className="text-sm font-medium">
              Filter by Member:
            </label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Members</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Overdue Tasks Alert */}
        {kpiSummary && kpiSummary.overdueTasks.length > 0 && (
          <Alert className="bg-orange-50 border-orange-200">
            <Clock className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-700">
              You have {kpiSummary.overdueTasks.length} overdue task(s). Please
              review them!
            </AlertDescription>
          </Alert>
        )}

        {/* KPI Summary Cards */}
        {selectedMember !== "all" && kpiSummary?.epics ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Overall Summary for Team Member */}
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Overall Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Tasks</p>
                    <p className="text-3xl font-bold text-foreground">
                      {kpiSummary.monthly.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-primary">
                      {kpiSummary.monthly.completed}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Completion Rate
                    </p>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${kpiSummary.monthly.percentageCompletion}%`,
                        }}
                      ></div>
                    </div>
                    <p className="text-sm font-semibold text-primary mt-2">
                      {kpiSummary.monthly.percentageCompletion.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Epic Summaries */}
              {Object.entries(kpiSummary.epics).map(([epicName, epicData]) => {
                const assignedNames = epicData.assignedTo
                  ?.map((id: string) => teamMembers.find(d => d.id === id)?.name)
                  .filter(Boolean)
                  .join(", ");

                let diffDays = 0;
                let isOverdue = false;
                if (epicData.endDate) {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const end = new Date(epicData.endDate);
                  end.setHours(0, 0, 0, 0);
                  const diffTime = end.getTime() - today.getTime();
                  diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  isOverdue = diffDays < 0;
                }

                return (
                  <Card key={epicName} className="border border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        {epicName}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEpicEditModal(epicName)}
                        className="gap-1 h-6"
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>
                    </CardTitle>
                      <div className="flex flex-col gap-1 mt-2">
                        {assignedNames && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>{assignedNames}</span>
                          </div>
                        )}
                        {epicData.startDate && epicData.endDate && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(epicData.startDate).toLocaleDateString()} -{" "}
                            {new Date(epicData.endDate).toLocaleDateString()}
                          </p>
                        )}
                        {epicData.endDate && (
                          <div className={`text-sm font-medium ${isOverdue ? "text-red-500" : "text-green-500"}`}>
                            {diffDays > 0 ? `days left +${diffDays}` : `days overdue ${diffDays}`}
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Tasks
                        </p>
                        <p className="text-3xl font-bold text-foreground">
                          {epicData.total}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Completed</p>
                        <p className="text-2xl font-bold text-primary">
                          {epicData.completed}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Completion Rate
                        </p>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${epicData.percentageCompletion}%`,
                            }}
                          ></div>
                        </div>
                        <p className="text-sm font-semibold text-primary mt-2">
                          {epicData.percentageCompletion.toFixed(1)}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top 3 Members */}
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Top 3 Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const memberStats = teamMembers.map(member => {
                    const memberTasks = allTasks.filter(t => t.assignedTo && t.assignedTo.includes(member.id));
                    const total = memberTasks.length;
                    const completed = memberTasks.filter(t => t.status === "completed").length;
                    const rate = total > 0 ? (completed / total) * 100 : 0;
                    return { member, rate, completed, total };
                  });
                  
                  const top3 = memberStats
                    .filter(stat => stat.total > 0) // Only include members with tasks
                    .sort((a, b) => b.rate - a.rate)
                    .slice(0, 3);

                  if (top3.length === 0) {
                     return <p className="text-sm text-muted-foreground">No data available</p>;
                  }

                  return (
                    <div className="space-y-4">
                      {top3.map((stat, index) => (
                        <div key={stat.member.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                          <div className="flex items-center gap-3">
                             <div className="flex items-center justify-center w-6">
                                {index === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
                                {index === 1 && <Medal className="h-5 w-5 text-gray-400" />}
                                {index === 2 && <Medal className="h-5 w-5 text-amber-600" />}
                             </div>
                             <Avatar className="h-9 w-9 border border-border">
                                <AvatarFallback className="text-xs font-bold">
                                  {stat.member.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                             </Avatar>
                             <div>
                               <p className="text-sm font-bold">{stat.member.name}</p>
                               <div className="flex items-center gap-2">
                                  <div className="w-16 bg-secondary rounded-full h-1.5 mt-1">
                                    <div 
                                      className="bg-primary h-1.5 rounded-full" 
                                      style={{ width: `${stat.rate}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">{stat.rate.toFixed(0)}%</p>
                               </div>
                             </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className="text-xs">
                              {stat.completed}/{stat.total} Tasks
                            </Badge>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2">
                        <Link to="/ranking" className="flex items-center justify-center text-sm text-primary font-medium hover:underline gap-1">
                          View Full Ranking <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Monthly KPI */}
            {kpiSummary && (
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Overall Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Tasks</p>
                    <p className="text-3xl font-bold text-foreground">
                      {kpiSummary.monthly.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-primary">
                      {kpiSummary.monthly.completed}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Completion Rate
                    </p>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${kpiSummary.monthly.percentageCompletion}%`,
                        }}
                      ></div>
                    </div>
                    <p className="text-sm font-semibold text-primary mt-2">
                      {kpiSummary.monthly.percentageCompletion.toFixed(1)}%
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        Target
                      </span>
                      <span className="font-semibold">
                        {kpiSummary.monthly.targetVsAccomplishment.target.toFixed(
                          1,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Accomplished
                      </span>
                      <span className="font-semibold text-primary">
                        {kpiSummary.monthly.targetVsAccomplishment.accomplished.toFixed(
                          1,
                        )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Recent Tasks */}
        <div className="space-y-6">
          {selectedMember !== "all" && kpiSummary?.epics ? (
            Object.entries(kpiSummary.epics).map(([epicName, epicData]) => {
              const epicTasks = tasks
                .filter((t) => (t.epic || "No Epic") === epicName)
                .slice(0, 5);

              if (epicTasks.length === 0) return null;

              return (
                <Card key={epicName} className="border border-border">
                  <CardHeader>
                    <CardTitle>{epicName} - Recent Tasks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[800px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-3 px-4 font-semibold w-[100px]">
                              ID
                            </th>
                            <th className="text-left py-3 px-4 font-semibold">
                              Title
                            </th>
                            <th className="text-left py-3 px-4 font-semibold">
                              Assigned To
                            </th>
                            <th className="text-left py-3 px-4 font-semibold">
                              Status
                            </th>
                            <th className="text-left py-3 px-4 font-semibold">
                              Overdue
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {epicTasks.map((task) => (
                            <tr key={task.id} className="border-b border-border hover:bg-muted/50 cursor-pointer" onClick={() => openTaskDetail(task)}>
                              <td className="py-3 px-4">
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
                              <td className="py-3 px-4">
                                {task.assignedTo?.map(id => teamMembers.find(d => d.id === id)?.name).join(", ") || "-"}
                              </td>
                              <td className="py-3 px-4">
                                <Badge
                                  variant={
                                    task.status === "completed"
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {task.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                {task.isOverdue &&
                                task.status !== "completed" ? (
                                  <span className="text-destructive flex items-center gap-1">
                                    <AlertCircle className="h-4 w-4" />
                                    Overdue
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="border border-border">
              <CardHeader>
                <CardTitle>Recent Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                {!tasks || tasks.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No tasks found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create tasks to see them here
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 font-semibold w-[100px]">
                            ID
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Title
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Epic
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Assigned To
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Status
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">
                            Overdue
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.slice(0, 10).map((task) => (
                          <tr key={task.id} className="border-b border-border hover:bg-muted/50 cursor-pointer" onClick={() => openTaskDetail(task)}>
                            <td className="py-3 px-4">
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
                              <div className="truncate" title={task.title}>
                                {task.title}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {epicsList.find(e => e.id === task.epicId)?.name || "-"}
                            </td>
                            <td className="py-3 px-4">
                              {task.assignedTo?.map(id => teamMembers.find(d => d.id === id)?.name).join(", ") || "-"}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant={
                                  task.status === "completed"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {task.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              {task.isOverdue &&
                              task.status !== "completed" ? (
                                <span className="text-destructive flex items-center gap-1">
                                  <AlertCircle className="h-4 w-4" />
                                  Overdue
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  -
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center mt-6">
            <Link to="/tasks">
              <Button variant="outline" className="gap-2">
                View All Tasks <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Edit Epic Modal */}
        <Dialog open={showEpicEditModal} onOpenChange={setShowEpicEditModal}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Epic: {editingEpic}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="editEpic">Epic Name</Label>
                <Input
                  id="editEpic"
                  value={epicEditForm.epic}
                  onChange={(e) => setEpicEditForm({ ...epicEditForm, epic: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="editSprint">Sprint</Label>
                <Input
                  id="editSprint"
                  value={epicEditForm.sprint}
                  onChange={(e) => setEpicEditForm({ ...epicEditForm, sprint: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editStartDate">Start Date</Label>
                  <Input
                    id="editStartDate"
                    type="date"
                    value={epicEditForm.startDate}
                    onChange={(e) => setEpicEditForm({ ...epicEditForm, startDate: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="editEndDate">End Date</Label>
                  <Input
                    id="editEndDate"
                    type="date"
                    value={epicEditForm.endDate}
                    onChange={(e) => setEpicEditForm({ ...epicEditForm, endDate: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label>Assigned Team Members</Label>
                <div className="mt-2">
                  <TeamMemberMultiSelect
                    selected={epicEditForm.assignedTo}
                    onChange={(selected) => setEpicEditForm({ ...epicEditForm, assignedTo: selected })}
                    placeholder="Select team members for this epic..."
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setShowEpicEditModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEpicEdit} loading={isUpdatingEpic} className="gap-2">
                  <Check className="h-4 w-4" />
                  Update Epic
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Task Detail Modal */}
        <Dialog open={showTaskDetailModal} onOpenChange={setShowTaskDetailModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Task Details
              </DialogTitle>
            </DialogHeader>
            {selectedTask && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <Label htmlFor="taskTitle">Title</Label>
                      <Input
                        id="taskTitle"
                        value={selectedTask.title}
                        onChange={(e) => setSelectedTask({...selectedTask, title: e.target.value})}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="taskDescription">Description</Label>
                      <Textarea
                        id="taskDescription"
                        value={selectedTask.description || ""}
                        onChange={(e) => setSelectedTask({...selectedTask, description: e.target.value})}
                        rows={5}
                        className="mt-1"
                      />
                    </div>
                    
                    {/* Comments Section */}
                    <div className="border-t pt-6 mt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <MessageSquare className="h-5 w-5" />
                        <h3 className="text-lg font-semibold">Comments</h3>
                      </div>
                      
                      <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto p-2">
                        {isLoadingComments ? (
                          <div className="flex justify-center p-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : comments.length === 0 ? (
                          <p className="text-muted-foreground text-center py-4">No comments yet</p>
                        ) : (
                          comments.map((comment) => (
                            <div key={comment.id} className="bg-muted/30 p-4 rounded-lg border group relative">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarFallback className="text-xs">
                                      {teamMembers.find(d => d.id === comment.userId)?.name.charAt(0) || "U"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-semibold text-sm">
                                    {teamMembers.find(d => d.id === comment.userId)?.name || "Unknown"}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(comment.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => deleteComment(comment.id)}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                              <p className="text-sm whitespace-pre-wrap pl-8 mb-2">
                                {comment.content.split(' ').map((word, i) => {
                                  if (word.startsWith('@')) {
                                    return <span key={i} className="text-primary font-semibold">{word} </span>;
                                  }
                                  return word + ' ';
                                })}
                              </p>
                              <div className="pl-8 flex gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className={`h-6 px-2 gap-1 ${comment.reactions?.some(r => r.type === 'like') ? 'bg-primary/10 text-primary' : ''}`}
                                  onClick={() => toggleReaction(comment.id, 'like')}
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                  <span className="text-xs">{comment.reactions?.filter(r => r.type === 'like').length || 0}</span>
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className={`h-6 px-2 gap-1 ${comment.reactions?.some(r => r.type === 'love') ? 'bg-red-100 text-red-600' : ''}`}
                                  onClick={() => toggleReaction(comment.id, 'love')}
                                >
                                  <Heart className="h-3 w-3" />
                                  <span className="text-xs">{comment.reactions?.filter(r => r.type === 'love').length || 0}</span>
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className={`h-6 px-2 gap-1 ${comment.reactions?.some(r => r.type === 'laugh') ? 'bg-yellow-100 text-yellow-600' : ''}`}
                                  onClick={() => toggleReaction(comment.id, 'laugh')}
                                >
                                  <Smile className="h-3 w-3" />
                                  <span className="text-xs">{comment.reactions?.filter(r => r.type === 'laugh').length || 0}</span>
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="relative">
                        <Textarea
                          placeholder="Add a comment... (Type @ to mention)"
                          value={newComment}
                          onChange={handleCommentChange}
                          rows={3}
                          className="w-full pr-12"
                        />
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Smile className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <EmojiPicker onEmojiClick={onEmojiClick} />
                            </PopoverContent>
                          </Popover>
                          <Button 
                            onClick={addComment} 
                            disabled={!newComment.trim() || isAddingComment}
                            size="icon"
                            className="h-8 w-8"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                        {showMentionList && (
                          <div className="absolute bottom-full left-0 w-64 bg-popover border rounded-md shadow-md mb-2 max-h-48 overflow-y-auto z-50">
                            {teamMembers
                              .filter(d => d.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                              .map(dev => (
                                <div
                                  key={dev.id}
                                  className="p-2 hover:bg-muted cursor-pointer flex items-center gap-2"
                                  onClick={() => handleMentionSelect(dev.name)}
                                >
                                  <Avatar className="h-6 w-6">
                                    <AvatarFallback>{dev.name.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm">{dev.name}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-muted/20 rounded-lg space-y-4 border">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Properties</h3>
                      
                      <div>
                        <Label>Status</Label>
                        <Select
                          value={selectedTask.status}
                          onValueChange={(value) => setSelectedTask({...selectedTask, status: value as any})}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todo">To Do</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="blocked">Blocked</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Epic</Label>
                        <Select
                          value={selectedTask.epicId || "none"}
                          onValueChange={(value) => setSelectedTask({...selectedTask, epicId: value === "none" ? undefined : value})}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select Epic" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Epic</SelectItem>
                            {epicsList.map((epic) => (
                              <SelectItem key={epic.id} value={epic.id}>
                                {epic.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Assigned To</Label>
                        <div className="mt-1">
                          <TeamMemberMultiSelect
                            selected={selectedTask.assignedTo || []}
                            onChange={(selected) => setSelectedTask({...selectedTask, assignedTo: selected})}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Start Date</Label>
                          <Input
                            type="date"
                            value={selectedTask.startDate ? new Date(selectedTask.startDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => setSelectedTask({...selectedTask, startDate: new Date(e.target.value).toISOString()})}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>End Date</Label>
                          <Input
                            type="date"
                            value={selectedTask.endDate ? new Date(selectedTask.endDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => setSelectedTask({...selectedTask, endDate: new Date(e.target.value).toISOString()})}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-4">
                      <Button
                        onClick={() => {
                          if (selectedTask) {
                            updateTask(selectedTask.id, {
                              title: selectedTask.title,
                              description: selectedTask.description,
                              status: selectedTask.status,
                              epicId: selectedTask.epicId,
                              assignedTo: selectedTask.assignedTo,
                              startDate: selectedTask.startDate,
                              endDate: selectedTask.endDate
                            });
                          }
                        }}
                        loading={isUpdatingTask}
                        className="w-full gap-2"
                      >
                        <Check className="h-4 w-4" />
                        Update Task
                      </Button>
                      
                      <Button
                        variant="destructive"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this task?")) {
                            deleteTask(selectedTask.id);
                          }
                        }}
                        loading={isDeletingTask}
                        className="w-full gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Task
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
