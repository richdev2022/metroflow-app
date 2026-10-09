import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api-client";
import { Task, KPISummary, ApiResponse, TeamMember, Comment, CreateCommentInput, Epic, WalletInfo } from "@shared/api";
import { normalizeKycStatus } from "@/lib/kyc-utils";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, TrendingUp, Target, Clock, ArrowRight, ArrowUpRight, Users, Plus, Wallet, Banknote, Link2, FileText, Store, Repeat, History, ShoppingBag, Video, ListTodo, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { StatCard } from "@/components/dashboard/StatCard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { CompletedTrendChart } from "@/components/dashboard/CompletedTrendChart";
import { LeaderboardCard } from "@/components/dashboard/LeaderboardCard";
import type { LeaderboardEntry } from "@/components/dashboard/LeaderboardCard";
import { RecentTaskTable } from "@/components/dashboard/RecentTaskTable";
import TransactionLimitHint from "@/components/TransactionLimitHint";
import { formatDateLong } from "@/lib/datetime";

const fmtMoney = (v: unknown, currency = "NGN") => {
  const n = Number(v) || 0;
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "₦";
  return `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

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

  // Money signals — wallet strip + Get Paid hub (independent silent-fail fetchers,
  // so one broken surface never blanks the whole home page).
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [payLinkStats, setPayLinkStats] = useState<{ active: number; collected: number } | null>(null);
  const [invoiceStats, setInvoiceStats] = useState<{ open: number; outstanding: number } | null>(null);
  const [storeCounts, setStoreCounts] = useState<{ products: number; pendingOrders: number } | null>(null);
  const [recurringCounts, setRecurringCounts] = useState<{ plans: number; activeSubscribers: number } | null>(null);

  // "Choose wallet to fund" picker — opened by the +Fund pill and the Fund
  // Wallet tile, then hands off to /wallet?fund=<walletId> which auto-opens
  // the wallet page's fund dialog with that wallet preselected.
  const [fundPickOpen, setFundPickOpen] = useState(false);
  const [fundPickWalletId, setFundPickWalletId] = useState("");

  /** Wallets available for funding — nulls stripped, business gated by role.
   *  HOOK ORDER: this useMemo MUST live above the `if (loading)` early return
   *  below — a hook after a conditional return throws React error #310
   *  ("Rendered more hooks than during the previous render") the moment the
   *  dashboard finishes loading. */
  const fundWalletOptions = useMemo(() => {
    const options: { id: string; label: string; currency: string; balance: string }[] = [];
    if (walletInfo?.user_wallet) {
      options.push({
        id: walletInfo.user_wallet.id,
        label: "Personal",
        currency: walletInfo.user_wallet.currency || "NGN",
        balance: walletInfo.user_wallet.balance,
      });
    }
    if (walletInfo?.canManageBusinessWallet && walletInfo.business_wallet) {
      options.push({
        id: walletInfo.business_wallet.id,
        label: "Business",
        currency: walletInfo.business_wallet.currency || "NGN",
        balance: walletInfo.business_wallet.balance,
      });
    }
    return options;
  }, [walletInfo]);

  const { toast } = useToast();
  const navigate = useNavigate();

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

  // Get Paid hub + wallet strip — every fetcher fails silently on its own.
  useEffect(() => {
    api.get("/wallet").then((res) => setWalletInfo(res.data as WalletInfo)).catch(() => {});
    api.get("/payment-links").then((res) => {
      const links: any[] = res.data?.links || [];
      setPayLinkStats({
        active: links.filter((l) => l.is_active).length,
        collected: links.reduce((s, l) => s + (Number(l.total_collected) || 0), 0),
      });
    }).catch(() => {});
    api.get("/invoices").then((res) => {
      const invoices: any[] = res.data?.invoices || [];
      const open = invoices.filter((i) => i.status === "pending");
      setInvoiceStats({
        open: open.length,
        outstanding: open.reduce((s, i) => s + ((Number(i.total) || 0) - (Number(i.amount_paid) || 0)), 0),
      });
    }).catch(() => {});
    Promise.all([api.get("/store/products"), api.get("/store/orders")]).then(([p, o]) => {
      setStoreCounts({
        products: (p.data?.products || []).filter((x: any) => x.status === "active").length,
        pendingOrders:
          o.data?.stats?.pending_orders ??
          (o.data?.orders || []).filter((x: any) => x.status === "pending").length,
      });
    }).catch(() => {});
    Promise.all([api.get("/recurring/plans"), api.get("/recurring/subscribers")]).then(([p, s]) => {
      setRecurringCounts({
        plans: (p.data?.plans || []).length,
        activeSubscribers: (s.data?.subscribers || []).filter((x: any) => x.status === "active").length,
      });
    }).catch(() => {});
  }, []);

  // Money surfaces are KYC-protected — mirror the sidebar gate before navigating.
  const navigateWithKyc = async (path: string) => {
    try {
      const res = await api.get("/kyc/status");
      const status = normalizeKycStatus(res.data);
      navigate(status.user_kyc_status === "verified" ? path : "/kyc");
    } catch {
      navigate(path);
    }
  };
  const kycLinkProps = (path: string) => ({
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      navigateWithKyc(path);
    },
  });

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
            <p className="text-muted-foreground">Loading your dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Greeting context
  const userName = localStorage.getItem("userName") || "there";
  const firstName = userName.trim().split(/\s+/)[0] || "there";
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening";

  // View mode (member filter) - mirrors the original branching
  const isMemberView = selectedMember !== "all" && !!kpiSummary?.epics;

  // Top-3 leaderboard entries (computed from all tasks, same logic as before)
  const leaderboardEntries: LeaderboardEntry[] = teamMembers
    .map((member) => {
      const memberTasks = allTasks.filter((t) => t.assignedTo && t.assignedTo.includes(member.id));
      const total = memberTasks.length;
      const completed = memberTasks.filter((t) => t.status === "completed").length;
      const rate = total > 0 ? (completed / total) * 100 : 0;
      return { member, rate, completed, total };
    })
    .filter((stat) => stat.total > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);

  const copyTaskId = (displayId: string | number) => {
    navigator.clipboard.writeText(displayId.toString());
    toast({ title: "Copied", description: "Task ID copied to clipboard" });
  };

  const primaryWallet =
    walletInfo?.canManageBusinessWallet && walletInfo.business_wallet
      ? walletInfo.business_wallet
      : walletInfo?.user_wallet;

  const openFundWalletPicker = () => {
    setFundPickWalletId(primaryWallet?.id || fundWalletOptions[0]?.id || "");
    setFundPickOpen(true);
  };

  const confirmFundWallet = () => {
    if (!fundPickWalletId) return;
    setFundPickOpen(false);
    navigateWithKyc(`/wallet?fund=${fundPickWalletId}`);
  };

  const quickActions: { to: string; label: string; icon: LucideIcon; chip: string; kyc?: boolean }[] = [
    { to: "/tasks", label: "New Task", icon: ListTodo, chip: "bg-primary/10 text-primary" },
    { to: "/meetings", label: "Start Meeting", icon: Video, chip: "bg-violet-500/10 text-violet-600" },
    { to: "/chat", label: "New Chat", icon: MessageSquare, chip: "bg-blue-500/10 text-blue-600" },
    { to: "/invoices", label: "New Invoice", icon: FileText, chip: "bg-sky-500/10 text-sky-600", kyc: true },
    { to: "/payment-links", label: "Payment Link", icon: Link2, chip: "bg-indigo-500/10 text-indigo-600", kyc: true },
    { to: "/store", label: "Add Product", icon: ShoppingBag, chip: "bg-amber-500/10 text-amber-600", kyc: true },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        {/* Business KYC tier banner — hidden entirely for verified businesses */}
        <TransactionLimitHint />
        {/* Elegant page header */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{formatDateLong(new Date())}</p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {greeting}, <span className="text-primary">{firstName}</span>
                </h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                  The pulse of your business — work, money and everything you're owed, in one place.
                </p>
              </div>
              {/* Wallet balance strip — business wallet preferred, personal fallback */}
              <button
                type="button"
                onClick={() => navigateWithKyc("/wallet")}
                className="group/wallet flex w-full max-w-md items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Wallet className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {walletInfo?.canManageBusinessWallet && walletInfo.business_wallet
                      ? "Business balance"
                      : "Personal balance"}
                  </span>
                  <span className="block truncate text-lg font-semibold tracking-tight text-foreground">
                    {primaryWallet ? fmtMoney(primaryWallet.balance, primaryWallet.currency) : "—"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openFundWalletPicker();
                    }}
                    className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-transform group-hover/wallet:scale-[1.04]"
                  >
                    + Fund
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover/wallet:translate-x-0.5" />
                </span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="member-filter" className="sr-only">Filter by member</label>
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger id="member-filter" className="w-[150px] bg-background sm:w-[190px]">
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
              <Link to="/tasks">
                <Button className="gap-2 shadow-sm">
                  <Plus className="h-4 w-4" />
                  New Task
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Overdue Tasks Alert */}
        {kpiSummary && kpiSummary.overdueTasks.length > 0 && (
          <Alert className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-500/20 dark:from-amber-500/10 dark:to-orange-500/10">
            <Clock className="h-4 w-4 text-amber-600" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-amber-800 dark:text-amber-300">
              <span>
                You have <strong>{kpiSummary.overdueTasks.length}</strong> overdue task(s). Please review them!
              </span>
              <Link to="/tasks" className="text-sm font-medium underline-offset-2 hover:underline">
                Review tasks
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* Quick actions — the daily work + money mix */}
        <section className="space-y-3">
          <SectionHeader title="Quick actions" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {quickActions.map((qa) => (
              <Link
                key={qa.label}
                to={qa.to}
                onClick={qa.kyc ? (e) => { e.preventDefault(); navigateWithKyc(qa.to); } : undefined}
                className="group flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${qa.chip}`}>
                  <qa.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-foreground">{qa.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Get Paid hub — every way the business collects money */}
        <section className="space-y-4">
          <SectionHeader
            title="Get paid, every way"
            subtitle="Links, invoices, your storefront and customer subscriptions — all settling into your wallets."
            action={
              <Link to="/subscription" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Plans & pricing <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GetPaidTile
              to="/payment-links"
              icon={Link2}
              chip="bg-indigo-500/10 text-indigo-600"
              label="Payment Links"
              onClick={kycLinkProps("/payment-links").onClick}
              lines={payLinkStats
                ? [`${payLinkStats.active} active link${payLinkStats.active === 1 ? "" : "s"}`, `${fmtMoney(payLinkStats.collected)} collected`]
                : null}
            />
            <GetPaidTile
              to="/invoices"
              icon={FileText}
              chip="bg-sky-500/10 text-sky-600"
              label="Invoices"
              onClick={kycLinkProps("/invoices").onClick}
              lines={invoiceStats
                ? [`${invoiceStats.open} awaiting payment`, `${fmtMoney(invoiceStats.outstanding)} outstanding`]
                : null}
            />
            <GetPaidTile
              to="/store"
              icon={Store}
              chip="bg-amber-500/10 text-amber-600"
              label="Storefront"
              onClick={kycLinkProps("/store").onClick}
              lines={storeCounts
                ? [`${storeCounts.products} product${storeCounts.products === 1 ? "" : "s"} live`, `${storeCounts.pendingOrders} order${storeCounts.pendingOrders === 1 ? "" : "s"} to fulfil`]
                : null}
            />
            <GetPaidTile
              to="/subscriptions"
              icon={Repeat}
              chip="bg-emerald-500/10 text-emerald-600"
              label="Subscriptions"
              onClick={kycLinkProps("/subscriptions").onClick}
              lines={recurringCounts
                ? [`${recurringCounts.plans} plan${recurringCounts.plans === 1 ? "" : "s"}`, `${recurringCounts.activeSubscribers} active subscriber${recurringCounts.activeSubscribers === 1 ? "" : "s"}`]
                : null}
            />
          </div>
        </section>

        {/* Money row — wallets, payroll, transfers */}
        <section className="space-y-4">
          <SectionHeader title="Money" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MoneyTile
              to="/transfer-history"
              icon={History}
              chip="bg-cyan-500/10 text-cyan-600"
              label="Transfers"
              description="Send money & track every movement"
            />
            <MoneyTile
              to="/payroll"
              icon={Banknote}
              chip="bg-emerald-500/10 text-emerald-600"
              label="Payroll"
              description="Pay your team in a few clicks"
              onClick={kycLinkProps("/payroll").onClick}
            />
            <MoneyTile
              to="/wallet"
              icon={Wallet}
              chip="bg-primary/10 text-primary"
              label="Fund Wallet"
              description="Card or bank transfer top-ups"
              onClick={openFundWalletPicker}
            />
          </div>
        </section>

        {/* KPI stat cards */}
        {kpiSummary && (
          <section className="space-y-4">
            <SectionHeader
              title="Key metrics"
              subtitle={
                isMemberView
                  ? `Filtered by ${teamMembers.find((m) => m.id === selectedMember)?.name || "member"}`
                  : "Across the whole team"
              }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total Tasks"
                value={kpiSummary.monthly.total}
                icon={Target}
                delta={`${kpiSummary.current.total} this month`}
                deltaTone="neutral"
                tooltip="Every task created across the selected period — for the whole team or the member you picked above."
              />
              <StatCard
                label="Completed"
                value={kpiSummary.monthly.completed}
                icon={Check}
                iconClassName="bg-emerald-500/10 text-emerald-600"
                delta={`${kpiSummary.monthly.percentageCompletion.toFixed(1)}% completion`}
                deltaTone="up"
                footer={`${kpiSummary.current.completed} completed this month`}
                tooltip="Tasks marked done this month. Keep this climbing — it's the heartbeat of your team's delivery."
              />
              <StatCard
                label="Completion Rate"
                value={`${kpiSummary.monthly.percentageCompletion.toFixed(1)}%`}
                icon={TrendingUp}
                delta="all tasks"
                deltaTone="neutral"
                footer={
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500"
                      style={{ width: `${Math.min(100, kpiSummary.monthly.percentageCompletion)}%` }}
                    />
                  </div>
                }
              />
              <StatCard
                label="Overdue"
                value={kpiSummary.overdueTasks.length}
                icon={Clock}
                iconClassName="bg-red-500/10 text-red-600"
                delta={kpiSummary.overdueTasks.length > 0 ? "needs attention" : "all on track"}
                deltaTone={kpiSummary.overdueTasks.length > 0 ? "down" : "up"}
                tooltip="Tasks past their due date. Hover a task on the list below to reassign, reschedule or close it out."
              />
            </div>
          </section>
        )}

        {/* Performance overview: trend chart + overall summary */}
        <section className="space-y-4">
          <SectionHeader title="Performance overview" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <CompletedTrendChart tasks={tasks} className="lg:col-span-2" />
            {kpiSummary && (
              <Card className="rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Target className="h-4 w-4 text-primary" />
                    Overall Summary
                  </CardTitle>
                  <CardDescription>Monthly target vs accomplishment</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Tasks</p>
                      <p className="text-3xl font-semibold tracking-tight">{kpiSummary.monthly.total}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Completed</p>
                      <p className="text-2xl font-semibold text-primary">{kpiSummary.monthly.completed}</p>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Completion rate</span>
                      <span className="font-semibold text-primary">
                        {kpiSummary.monthly.percentageCompletion.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500"
                        style={{ width: `${Math.min(100, kpiSummary.monthly.percentageCompletion)}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-border pt-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target</span>
                      <span className="font-semibold">
                        {kpiSummary.monthly.targetVsAccomplishment.target.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accomplished</span>
                      <span className="font-semibold text-primary">
                        {kpiSummary.monthly.targetVsAccomplishment.accomplished.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* Epic breakdown (member view) */}
        {isMemberView && kpiSummary?.epics && (
          <section className="space-y-4">
            <SectionHeader title="Epic breakdown" subtitle="Progress for each epic assigned to this member" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(kpiSummary.epics).map(([epicName, epicData]) => {
                const assignedNames = epicData.assignedTo
                  ?.map((id: string) => teamMembers.find((d) => d.id === id)?.name)
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
                  <Card
                    key={epicName}
                    className="group relative overflow-hidden rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <TrendingUp className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate text-base font-semibold">{epicName}</CardTitle>
                            {epicData.startDate && epicData.endDate && (
                              <p className="text-xs text-muted-foreground">
                                {new Date(epicData.startDate).toLocaleDateString()} -{" "}
                                {new Date(epicData.endDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEpicEditModal(epicName)}
                          className="h-7 gap-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                        >
                          <Edit className="h-3 w-3" />
                          Edit
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {assignedNames && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {assignedNames}
                          </span>
                        )}
                        {epicData.endDate && (
                          <span className={isOverdue ? "font-medium text-red-500" : "font-medium text-emerald-600"}>
                            {diffDays > 0 ? `${diffDays} days left` : `${Math.abs(diffDays)} days overdue`}
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Completed</p>
                          <p className="text-2xl font-semibold tracking-tight">
                            {epicData.completed}
                            <span className="text-base font-normal text-muted-foreground">
                              /{epicData.total}
                            </span>
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-primary">
                          {epicData.percentageCompletion.toFixed(1)}%
                        </p>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500"
                          style={{ width: `${epicData.percentageCompletion}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Leaderboard (all-members view) */}
        {!isMemberView && (
          <section className="space-y-4">
            <SectionHeader title="Leaderboard" subtitle="Top 3 members by completion rate" />
            <LeaderboardCard entries={leaderboardEntries} />
          </section>
        )}

        {/* Recent tasks */}
        <section className="space-y-4">
          <SectionHeader
            title="Recent tasks"
            action={
              <Link to="/tasks" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {isMemberView && kpiSummary?.epics ? (
            <div className="space-y-6">
              {Object.entries(kpiSummary.epics).map(([epicName]) => {
                const epicTasks = tasks
                  .filter((t) => (t.epic || "No Epic") === epicName)
                  .slice(0, 5);

                if (epicTasks.length === 0) return null;

                return (
                  <Card key={epicName} className="rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base font-semibold">{epicName}</CardTitle>
                      <CardDescription>Latest {epicTasks.length} task(s) in this epic</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                      <RecentTaskTable
                        tasks={epicTasks}
                        teamMembers={teamMembers}
                        onOpenTask={openTaskDetail}
                        onCopyId={copyTaskId}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="rounded-2xl border-0 bg-card shadow-sm ring-1 ring-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Recent Tasks</CardTitle>
                <CardDescription>Latest 10 tasks across all epics</CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {!tasks || tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
                    <Target className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="font-medium">No tasks yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create tasks to see them here
                    </p>
                  </div>
                ) : (
                  <RecentTaskTable
                    tasks={tasks.slice(0, 10)}
                    teamMembers={teamMembers}
                    epicsList={epicsList}
                    showEpicColumn
                    onOpenTask={openTaskDetail}
                    onCopyId={copyTaskId}
                  />
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center pt-2">
            <Link to="/tasks">
              <Button variant="outline" className="gap-2">
                View All Tasks <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

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

        {/* Choose wallet to fund — +Fund pill and Fund Wallet tile hand-off */}
        <Dialog open={fundPickOpen} onOpenChange={setFundPickOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Choose wallet to fund</DialogTitle>
              <DialogDescription>
                Pick the wallet you want to top up — you'll continue on the wallet page.
              </DialogDescription>
            </DialogHeader>
            {fundWalletOptions.length > 0 ? (
              <RadioGroup
                value={fundPickWalletId}
                onValueChange={setFundPickWalletId}
                className="gap-2"
              >
                {fundWalletOptions.map((wallet) => (
                  <Label
                    key={wallet.id}
                    htmlFor={`fund-wallet-${wallet.id}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                      fundPickWalletId === wallet.id
                        ? "border-primary/60 bg-primary/5"
                        : "hover:bg-accent/40"
                    )}
                  >
                    <RadioGroupItem value={wallet.id} id={`fund-wallet-${wallet.id}`} />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{wallet.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {wallet.currency} · {fmtMoney(wallet.balance, wallet.currency)}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No wallets are available yet. Wallets appear here once they are created.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setFundPickOpen(false)}>
                Cancel
              </Button>
              <Button onClick={confirmFundWallet} disabled={!fundPickWalletId}>
                Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Home building blocks — Get Paid hub + Money row tiles
// ---------------------------------------------------------------------------

interface HubTileProps {
  to: string;
  icon: LucideIcon;
  chip: string;
  label: string;
  description?: string;
  /** Two live-count lines; null renders a loading pulse. */
  lines?: [string, string] | null;
  onClick?: (e: React.MouseEvent) => void;
}

/** Get Paid hub card: icon chip, label and two live-count lines. */
function GetPaidTile({ to, icon: Icon, chip, label, lines, onClick }: HubTileProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="group relative block overflow-hidden rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${chip}`}>
          <Icon className="h-4 w-4" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
      {lines ? (
        <div className="mt-1 space-y-0.5">
          <p className="truncate text-xs text-muted-foreground">{lines[0]}</p>
          <p className="truncate text-xs font-medium text-foreground/80">{lines[1]}</p>
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        </div>
      )}
    </Link>
  );
}

/** Money row tile: horizontal icon + label + one-liner. */
function MoneyTile({ to, icon: Icon, chip, label, description, onClick }: HubTileProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${chip}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}
