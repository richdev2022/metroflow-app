import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { Task, ApiResponse, TeamMember, Comment, CreateCommentInput, Reaction, TaskStatus, CreateTaskStatusInput, BoardColumn } from '@shared/api';
import Layout from '@/components/layout';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Calendar, Users, Check, X, Copy, Smile, Heart, ThumbsUp, Edit2, Trash2, GripVertical, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import EmojiPicker from 'emoji-picker-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Column {
  id: string;
  title: string;
  color: string;
  status: TaskStatus;
}

/** Hex -> rgba tint (used for column header gradients and accent stripes). */
const hexToRgba = (hex: string, alpha: number): string => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
};

/** Deterministic avatar hue per user id (matches chat avatar gradient feel). */
const avatarHue = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
};

type DueTone = "overdue" | "soon" | "calm" | "none";
const getDueMeta = (dateStr?: string | null): { label: string; tone: DueTone } => {
  if (!dateStr) return { label: "", tone: "none" };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { label: "", tone: "none" };
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((due - startOfToday) / 86_400_000);
  const label = format(d, "MMM d");
  if (dayDiff < 0) return { label, tone: "overdue" };
  if (dayDiff === 0) return { label: "Today", tone: "soon" };
  if (dayDiff === 1) return { label: "Tomorrow", tone: "soon" };
  if (dayDiff <= 2) return { label, tone: "soon" };
  return { label, tone: "calm" };
};

const DUE_CHIP_STYLES: Record<DueTone, string> = {
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 font-semibold",
  soon: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  calm: "bg-muted/60 text-muted-foreground border-border/60",
  none: "",
};

const SortableTask = ({
  task,
  onOpenDetail,
  teamMembers,
  updateTask,
  accentColor,
}: {
  task: Task;
  onOpenDetail: (task: Task) => void;
  teamMembers: TeamMember[];
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  /** Column status color used for the card's left accent stripe. */
  accentColor?: string;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const handleAssign = (userId: string) => {
    const currentAssigned = task.assignedTo || [];
    const newAssigned = currentAssigned.includes(userId)
      ? currentAssigned.filter(id => id !== userId)
      : [...currentAssigned, userId];
    updateTask(task.id, { assignedTo: newAssigned });
  };

  const due = getDueMeta(task.endDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm hover:shadow-md hover:border-border transition-all cursor-grab active:cursor-grabbing"
    >
      {/* Status accent stripe */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 shrink-0"
        style={{ backgroundColor: accentColor || '#6b7280' }}
      />
      <div className="p-3 pl-4">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <h4
            className="font-semibold text-sm text-foreground leading-snug line-clamp-2 flex-1 min-w-0"
            onClick={(e) => { e.stopPropagation(); onOpenDetail(task); }}
          >
            {task.title}
          </h4>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                title="Assign team members"
                onClick={(e) => e.stopPropagation()}
              >
                <Users className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" onClick={(e) => e.stopPropagation()}>
              <Command>
                <CommandInput placeholder="Search members..." />
                <CommandList>
                  <CommandEmpty>No members found.</CommandEmpty>
                  <CommandGroup>
                    {teamMembers.map((member) => (
                      <CommandItem
                        key={member.id}
                        onSelect={() => handleAssign(member.id)}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            (task.assignedTo || []).includes(member.id) ? 'opacity-100' : 'opacity-0'
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
        </div>
        {task.description && (
          <p
            className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed"
            onClick={(e) => { e.stopPropagation(); onOpenDetail(task); }}
          >
            {task.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {due.label && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${DUE_CHIP_STYLES[due.tone]}`}
              >
                {due.tone === 'overdue' && <AlertTriangle className="h-2.5 w-2.5" />}
                {due.tone !== 'overdue' && <Calendar className="h-2.5 w-2.5" />}
                {due.label}
              </span>
            )}
            {task.epic && (
              <span className="truncate rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-medium max-w-[110px]">
                {task.epic}
              </span>
            )}
          </div>
          {task.assignedTo && task.assignedTo.length > 0 && (
            <div className="flex -space-x-1.5 shrink-0">
              {task.assignedTo.slice(0, 3).map(userId => {
                const member = teamMembers.find(m => m.id === userId);
                return (
                  <div
                    key={userId}
                    title={member?.name || userId}
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white border-2 border-background"
                    style={{ backgroundColor: `hsl(${avatarHue(userId)} 62% 45%)` }}
                  >
                    {(member?.name || userId).charAt(0).toUpperCase()}
                  </div>
                );
              })}
              {task.assignedTo.length > 3 && (
                <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-semibold border-2 border-background">
                  +{task.assignedTo.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SortableTaskColumn = ({
  column,
  tasks,
  onOpenDetail,
  teamMembers,
  updateTask,
  onEditStatus,
  onDeleteStatus,
}: {
  column: Column;
  tasks: Task[];
  onOpenDetail: (task: Task) => void;
  teamMembers: TeamMember[];
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onEditStatus: (status: TaskStatus) => void;
  onDeleteStatus: (status: TaskStatus) => void;
}) => {
  const { setNodeRef, isOver, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="space-y-0 flex flex-col h-full min-w-[300px] w-full"
    >
      {/* Column card: gradient header + task well */}
      <div
        className="flex flex-col h-full rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden"
      >
        <div
          className="flex items-center justify-between flex-shrink-0 gap-2 px-3 py-2.5 border-b border-border/60"
          style={{ background: `linear-gradient(135deg, ${hexToRgba(column.color, 0.14)} 0%, ${hexToRgba(column.color, 0.04)} 100%)` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing shrink-0 p-0.5 -m-0.5">
              <GripVertical className="h-4 w-4 text-muted-foreground/70" />
            </div>
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white/20"
              style={{ backgroundColor: column.color }}
            />
            <span className="font-semibold text-sm text-foreground truncate">{column.title}</span>
            <span className="shrink-0 rounded-full bg-muted/80 text-muted-foreground text-[11px] font-semibold px-1.5 py-0.5 min-w-[22px] text-center">
              {tasks.length}
            </span>
          </div>
          <div className="flex gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditStatus(column.status)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            {!column.status.is_default && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => onDeleteStatus(column.status)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div
          className={`flex-1 p-3 overflow-y-auto transition-colors bg-muted/30 dark:bg-muted/10 ${
            isOver ? 'bg-primary/5 ring-2 ring-inset ring-primary/60' : ''
          }`}
        >
          <SortableContext
            items={tasks.map(t => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2.5">
              {tasks.map((task) => (
                <SortableTask
                  key={task.id}
                  task={task}
                  onOpenDetail={onOpenDetail}
                  teamMembers={teamMembers}
                  updateTask={updateTask}
                  accentColor={column.color}
                />
              ))}
            </div>
          </SortableContext>
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="h-10 w-10 rounded-xl border-2 border-dashed border-border flex items-center justify-center mb-2">
                <Plus className="h-4 w-4 text-muted-foreground/60" />
              </div>
              <p className="text-xs text-muted-foreground">Drop tasks into {column.title}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function Board() {
  const [boardData, setBoardData] = useState<BoardColumn[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<TaskStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeStatus, setActiveStatus] = useState<TaskStatus | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [_isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showCreateColumnModal, setShowCreateColumnModal] = useState(false);
  const [showEditColumnModal, setShowEditColumnModal] = useState(false);
  const [showDeleteColumnModal, setShowDeleteColumnModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#6b7280');
  const [editColumnName, setEditColumnName] = useState('');
  const [editColumnColor, setEditColumnColor] = useState('#6b7280');
  const [showStatusOverview, setShowStatusOverview] = useState(false);
  
  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchBoardData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/board');
      const data = response.data as ApiResponse<BoardColumn[]>;
      console.log('Fetched board data:', data);
      if (data.success && data.data) {
        setBoardData(data.data);
        // Extract task statuses from board data
        setTaskStatuses(data.data.map(col => ({
          id: col.id,
          business_id: col.business_id,
          name: col.name,
          color: col.color,
          is_default: col.is_default,
          sort_order: col.sort_order,
          created_at: col.created_at,
          updated_at: col.updated_at
        })));
      }
    } catch (error: any) {
      console.error('Failed to fetch board data:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to fetch board',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getTasksByStatus = (statusId: string) => {
    const column = boardData.find(col => col.id === statusId);
    return column?.tasks || [];
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await api.get('/team');
      if (Array.isArray(response.data)) {
        setTeamMembers(response.data);
      } else if (response.data?.success && response.data?.data) {
        setTeamMembers(response.data.data);
      }
    } catch (error) {
      console.error(error);
      // Real backend unreachable — leave the member list empty instead of
      // showing fake demo users that could be assigned to real tasks.
      setTeamMembers([]);
    }
  };

  const handleCreateColumn = async () => {
    try {
      const response = await api.post('/task-statuses', {
        name: newColumnName,
        color: newColumnColor,
      } as CreateTaskStatusInput);
      const data = response.data as ApiResponse<TaskStatus>;
      if (data.success && data.data) {
        await fetchBoardData();
        setShowCreateColumnModal(false);
        setNewColumnName('');
        setNewColumnColor('#6b7280');
        toast({ title: 'Column created', description: 'New status column added successfully' });
      }
    } catch (error: any) {
      console.error('Failed to create column:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to create column',
        variant: 'destructive',
      });
    }
  };

  const handleEditStatus = async () => {
    if (!selectedStatus) return;
    try {
      const response = await api.put(`/task-statuses/${selectedStatus.id}`, {
        name: editColumnName,
        color: editColumnColor,
      });
      const data = response.data as ApiResponse<TaskStatus>;
      if (data.success && data.data) {
        await fetchBoardData();
        setShowEditColumnModal(false);
        setSelectedStatus(null);
        toast({ title: 'Column updated', description: 'Status column updated successfully' });
      }
    } catch (error: any) {
      console.error('Failed to update column:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to update column',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteStatus = async () => {
    if (!selectedStatus) return;
    try {
      const response = await api.delete(`/task-statuses/${selectedStatus.id}`);
      const data = response.data as ApiResponse<boolean>;
      if (data.success) {
        await fetchBoardData();
        setShowDeleteColumnModal(false);
        setSelectedStatus(null);
        toast({ title: 'Column deleted', description: 'Status column deleted successfully' });
      }
    } catch (error: any) {
      console.error('Failed to delete column:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to delete column',
        variant: 'destructive',
      });
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    setIsUpdatingTask(true);
    try {
      const response = await api.put(`/tasks/${taskId}`, updates);
      const data = response.data as ApiResponse<Task>;
      if (data.success && data.data) {
        // Update the task in board data
        setBoardData(prev => prev.map(column => ({
          ...column,
          tasks: column.tasks.map(task => 
            task.id === taskId ? { ...task, ...data.data! } : task
          )
        })));
        if (selectedTask?.id === taskId) {
          setSelectedTask(data.data);
        }
        toast({
          title: 'Task updated',
          description: 'The task has been successfully updated',
        });
      }
    } catch (error: any) {
      console.error('Failed to update task:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to update task',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatusId: string) => {
    try {
      const response = await api.put(`/tasks/${taskId}`, { status: newStatusId });
      const data = response.data as ApiResponse<Task>;
      if (data.success && data.data) {
        // Refresh board data
        fetchBoardData();
        toast({
          title: 'Task status updated',
          description: 'Task moved successfully',
        });
      }
    } catch (error: any) {
      console.error('Failed to update task status:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to update task status',
        variant: 'destructive',
      });
      fetchBoardData(); // Refresh board data to revert
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    // Check if we're dragging a task or a status
    let task: Task | undefined;
    for (const column of boardData) {
      task = column.tasks.find(t => t.id === event.active.id);
      if (task) break;
    }
    const status = taskStatuses.find(s => s.id === event.active.id);
    setActiveTask(task || null);
    setActiveStatus(status || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // If dragging a status
    const activeStatusItem = taskStatuses.find(s => s.id === activeId);
    if (activeStatusItem) {
      const overStatusItem = taskStatuses.find(s => s.id === overId);
      if (overStatusItem && activeId !== overId) {
        const oldIndex = taskStatuses.findIndex(s => s.id === activeId);
        const newIndex = taskStatuses.findIndex(s => s.id === overId);
        const newStatuses = arrayMove(taskStatuses, oldIndex, newIndex);
        setTaskStatuses(newStatuses);
      }
      return;
    }

    // If dragging a task
    let activeTaskItem: Task | undefined;
    let currentColumnId: string | undefined;
    for (const column of boardData) {
      const found = column.tasks.find(t => t.id === activeId);
      if (found) {
        activeTaskItem = found;
        currentColumnId = column.id;
        break;
      }
    }
    if (!activeTaskItem || !currentColumnId) return;

    // Determine target column
    let targetColumn: Column | undefined;
    
    // Check if over is a column
    targetColumn = columns.find(col => col.id === overId);
    
    // If over is a task, find its column
    if (!targetColumn) {
      for (const column of boardData) {
        const overTaskItem = column.tasks.find(t => t.id === overId);
        if (overTaskItem) {
          targetColumn = columns.find(col => col.id === column.id);
          break;
        }
      }
    }

    if (targetColumn && currentColumnId !== targetColumn.id) {
      // Update local state immediately for visual feedback
      setBoardData(prev => {
        return prev.map(col => {
          if (col.id === currentColumnId) {
            return {
              ...col,
              tasks: col.tasks.filter(t => t.id !== activeId)
            };
          }
          if (col.id === targetColumn!.id) {
            return {
              ...col,
              tasks: [...col.tasks, { ...activeTaskItem!, status: targetColumn!.id }]
            };
          }
          return col;
        });
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setActiveStatus(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // If dragging a status
    const activeStatusItem = taskStatuses.find(s => s.id === activeId);
    if (activeStatusItem) {
      const oldIndex = taskStatuses.findIndex(s => s.id === activeId);
      const newIndex = taskStatuses.findIndex(s => s.id === overId);
      
      if (oldIndex !== newIndex) {
        const newStatuses = arrayMove(taskStatuses, oldIndex, newIndex);
        // Update sort_order and persist
        const statusIds = newStatuses.map(s => s.id);
        try {
          const response = await api.put('/task-statuses/reorder', { statusIds });
          const data = response.data as ApiResponse<TaskStatus[]>;
          if (data.success && data.data) {
            setTaskStatuses(data.data);
            // Refresh board data
            fetchBoardData();
            toast({ title: 'Columns reordered', description: 'Column order updated successfully' });
          }
        } catch (error) {
          console.error('Failed to reorder statuses:', error);
          toast({ title: 'Error', description: 'Failed to reorder columns', variant: 'destructive' });
        }
      }
      return;
    }

    // If dragging a task
    // Find the task and its current column
    let task: Task | undefined;
    let currentColumnId: string | undefined;
    for (const column of boardData) {
      const found = column.tasks.find(t => t.id === activeId);
      if (found) {
        task = found;
        currentColumnId = column.id;
        break;
      }
    }
    if (!task || !currentColumnId) return;

    // Determine target column
    let targetColumn: Column | undefined;
    
    // Check if over is a column
    targetColumn = columns.find(col => col.id === overId);
    
    // If over is a task, find its column
    if (!targetColumn) {
      for (const column of boardData) {
        const overTaskItem = column.tasks.find(t => t.id === overId);
        if (overTaskItem) {
          targetColumn = columns.find(col => col.id === column.id);
          break;
        }
      }
    }

    // Handle moving between columns
    if (targetColumn && currentColumnId !== targetColumn.id) {
      updateTaskStatus(task.id, targetColumn.id);
      return;
    }

    // Check if we're sorting within the same column
    const activeColumn = columns.find(col => col.id === currentColumnId);
    if (activeColumn) {
      const activeItems = getTasksByStatus(activeColumn.id);
      const fromIndex = activeItems.findIndex(t => t.id === activeId);
      const toIndex = activeItems.findIndex(t => t.id === overId);

      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        // For simplicity, we'll just reorder locally without persisting to backend
        const newItems = arrayMove(activeItems, fromIndex, toIndex);
        setBoardData(prev => prev.map(col => {
          if (col.id === currentColumnId) {
            return { ...col, tasks: newItems };
          }
          return col;
        }));
      }
    }
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
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const addComment = async () => {
    if (!selectedTask || !newComment.trim()) return;

    try {
      setIsAddingComment(true);
      const response = await api.post('/comments', {
        taskId: selectedTask.id,
        content: newComment.trim(),
      } as CreateCommentInput);
      const data = response.data as ApiResponse<Comment>;
      if (data.success && data.data) {
        setComments(prev => [...prev, data.data!]);
        setNewComment('');
        toast({
          title: 'Comment added',
          description: 'Your comment has been added successfully',
        });
      }
    } catch (error: any) {
      console.error('Failed to add comment:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to add comment',
        variant: 'destructive',
      });
    } finally {
      setIsAddingComment(false);
    }
  };

  const toggleReaction = async (commentId: string, type: 'like' | 'love') => {
    try {
      const response = await api.post(`/comments/${commentId}/reaction`, { type });
      const data = response.data as ApiResponse<Reaction[]>;
      if (data.success && data.data) {
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, reactions: data.data } : c));
      }
    } catch (error) {
      console.error('Failed to toggle reaction', error);
    }
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
    const newValue = words.join(' ') + (words.length > 0 ? ' ' : '') + `@${userName} `;
    setNewComment(newValue);
    setShowMentionList(false);
  };

  // Multi-select component for team members
  const TeamMemberMultiSelect = ({
    selected,
    onChange,
    placeholder = 'Select team members...',
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
                        type="button"
                        title={`Remove ${member?.name}`}
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
                        selected.includes(member.id) ? 'opacity-100' : 'opacity-0'
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

  const taskStatusToColumn = (status: TaskStatus): Column => {
    // Convert hex color to Tailwind classes (simplified)
    // For simplicity, let's use a default or create a custom style
    return {
      id: status.id,
      title: status.name,
      color: status.color,
      status,
    };
  };

  const columns: Column[] = taskStatuses.map(taskStatusToColumn);

  // Mobile (<768px): render a single column with a chip switcher instead of
  // the horizontal kanban strip. Task drag within the column keeps working;
  // cross-column moves go through the task detail status selector.
  const isMobile = useIsMobile();
  const [activeMobileColumnId, setActiveMobileColumnId] = useState('');
  useEffect(() => {
    if (!columns.length) return;
    if (!columns.some(c => c.id === activeMobileColumnId)) {
      setActiveMobileColumnId(columns[0].id);
    }
  }, [columns, activeMobileColumnId]);
  const visibleColumns = isMobile
    ? columns.filter(c => c.id === activeMobileColumnId)
    : columns;

  useEffect(() => { 
    fetchBoardData();
    fetchTeamMembers();
  }, []);

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading board...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-[calc(100vh-120px)] flex flex-col space-y-4 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Board</h1>
            <p className="text-muted-foreground mt-1 sm:mt-2 text-sm">Drag and drop tasks to update their status</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowStatusOverview(!showStatusOverview)} variant="outline" size="sm" className="rounded-xl h-9">
              {showStatusOverview ? 'Show Board' : 'Status Overview'}
            </Button>
            <Button onClick={() => setShowCreateColumnModal(true)} variant="outline" size="sm" className="rounded-xl h-9">
              <Plus className="h-4 w-4 mr-1.5" />
              Column
            </Button>
            <Button onClick={() => window.location.href = '/tasks'} size="sm" className="rounded-xl h-9 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Task
            </Button>
          </div>
        </div>

        {showStatusOverview ? (
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {columns.map((column) => (
                <Card key={column.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: column.color }}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{column.title}</h3>
                      <p className="text-3xl font-bold">{getTasksByStatus(column.id).length}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {/* Mobile: column switcher chips (single-column view) */}
            {isMobile && (
              <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {columns.map((column) => {
                  const isActive = column.id === activeMobileColumnId;
                  return (
                    <button
                      key={column.id}
                      type="button"
                      onClick={() => setActiveMobileColumnId(column.id)}
                      aria-pressed={isActive}
                      className={cn(
                        'flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                        isActive
                          ? 'border-transparent text-white shadow-md'
                          : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/60'
                      )}
                      style={isActive ? { backgroundColor: column.color } : undefined}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.85)' : column.color }}
                      />
                      {column.title}
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-[10px] font-semibold',
                          isActive ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {getTasksByStatus(column.id).length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex-1 overflow-x-auto overflow-y-hidden snap-x snap-mandatory [scrollbar-width:thin]">
              <SortableContext
                items={taskStatuses.map(s => s.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex gap-4 sm:gap-6 h-full pb-4">
                  {visibleColumns.map((column) => (
                    <div
                      key={column.id}
                      className={
                        isMobile
                          ? "w-full min-w-0 h-full flex flex-col"
                          : "min-w-[280px] sm:min-w-[300px] w-[85vw] sm:w-auto sm:flex-1 sm:min-w-0 h-full flex flex-col snap-start"
                      }
                    >
                      <SortableTaskColumn
                        column={column}
                        tasks={getTasksByStatus(column.id)}
                        onOpenDetail={openTaskDetail}
                        teamMembers={teamMembers}
                        updateTask={updateTask}
                        onEditStatus={(status) => {
                          setSelectedStatus(status);
                          setEditColumnName(status.name);
                          setEditColumnColor(status.color);
                          setShowEditColumnModal(true);
                        }}
                        onDeleteStatus={(status) => {
                          setSelectedStatus(status);
                          setShowDeleteColumnModal(true);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </SortableContext>
            </div>

          <DragOverlay dropAnimation={dropAnimation}>
            {activeTask ? (
              <div className="opacity-90">
                <SortableTask
                  task={activeTask}
                  onOpenDetail={() => {}}
                  teamMembers={teamMembers}
                  updateTask={updateTask}
                />
              </div>
            ) : null}
            {activeStatus ? (
              <div className="opacity-90 min-w-[300px]">
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge style={{ backgroundColor: activeStatus.color }}>{activeStatus.name}</Badge>
                  </div>
                </Card>
              </div>
            ) : null}
          </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Task Detail Modal - Full implementation from Tasks page */}
      <Dialog open={showTaskDetailModal} onOpenChange={setShowTaskDetailModal}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
          {selectedTask && (
            <>
              <DialogHeader className="p-6 pb-4 border-b">
                <DialogTitle className="sr-only">Task Details</DialogTitle>
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
                          toast({ title: 'Copied', description: 'Task ID copied to clipboard' });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                          value={selectedTask.status}
                          onValueChange={(value: any) =>
                            updateTask(selectedTask.id, { status: value })
                          }
                      >
                          <SelectTrigger className="w-[140px]">
                              <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                              {taskStatuses.map((status) => (
                                <SelectItem key={status.id} value={status.id}>
                                  {status.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Input
                      value={selectedTask.title}
                      onChange={(e) => setSelectedTask({ ...selectedTask, title: e.target.value })}
                      onBlur={() => updateTask(selectedTask.id, { title: selectedTask.title })}
                      className="text-2xl font-bold border-none shadow-none p-0 h-auto focus-visible:ring-0"
                    />
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1">
                <div className="p-6 pt-4 space-y-8">
                  {/* Description */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">Description</h3>
                    </div>
                    <Textarea
                      value={selectedTask.description || ''}
                      onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                      onBlur={() => updateTask(selectedTask.id, { description: selectedTask.description })}
                      placeholder="Add a description..."
                      className="min-h-[100px]"
                    />
                  </div>

                  <Separator />

                  {/* Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Epic</Label>
                        <Input
                          value={selectedTask.epic || ''}
                          onChange={(e) => setSelectedTask({ ...selectedTask, epic: e.target.value })}
                          onBlur={() => updateTask(selectedTask.id, { epic: selectedTask.epic })}
                          placeholder="Epic name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Sprint</Label>
                        <Input
                          value={selectedTask.sprint || ''}
                          onChange={(e) => setSelectedTask({ ...selectedTask, sprint: e.target.value })}
                          onBlur={() => updateTask(selectedTask.id, { sprint: selectedTask.sprint })}
                          placeholder="Sprint name"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input
                          type="date"
                          value={selectedTask.startDate.split('T')[0]}
                          onChange={(e) => setSelectedTask({ ...selectedTask, startDate: e.target.value })}
                          onBlur={() => updateTask(selectedTask.id, { startDate: selectedTask.startDate })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input
                          type="date"
                          value={selectedTask.endDate.split('T')[0]}
                          onChange={(e) => setSelectedTask({ ...selectedTask, endDate: e.target.value })}
                          onBlur={() => updateTask(selectedTask.id, { endDate: selectedTask.endDate })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Assign Team Members</Label>
                    <TeamMemberMultiSelect
                      selected={selectedTask.assignedTo || []}
                      onChange={(assigned) => {
                        setSelectedTask({ ...selectedTask, assignedTo: assigned });
                        updateTask(selectedTask.id, { assignedTo: assigned });
                      }}
                    />
                  </div>

                  <Separator />

                  {/* Comments */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-foreground">Comments</h3>
                    
                    {isLoadingComments ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {comments.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No comments yet. Be the first to comment!
                          </div>
                        ) : (
                          comments.map((comment) => (
                            <Card key={comment.id} className="p-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                                      {comment.userName?.charAt(0).toUpperCase() || 'U'}
                                    </div>
                                    <div>
                                      <p className="font-medium text-sm">{comment.userName || 'User'}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {format(new Date(comment.createdAt), 'MMM d, yyyy h:mm a')}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <p className="text-foreground">{comment.content}</p>
                                <div className="flex items-center gap-2 pt-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => toggleReaction(comment.id, 'like')}
                                  >
                                    <Heart className="h-3 w-3 mr-1" />
                                    {comment.reactions?.filter(r => r.type === 'like').length || 0}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => toggleReaction(comment.id, 'love')}
                                  >
                                    <ThumbsUp className="h-3 w-3 mr-1" />
                                    {comment.reactions?.filter(r => r.type === 'love').length || 0}
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))
                        )}
                      </div>
                    )}

                    {/* Add Comment */}
                    <div className="space-y-2">
                      <div className="relative">
                        <Textarea
                          value={newComment}
                          onChange={handleCommentChange}
                          placeholder="Add a comment... @mention team members"
                          className="min-h-[80px] pr-12"
                        />
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          >
                            <Smile className="h-4 w-4" />
                          </Button>
                        </div>
                        {showEmojiPicker && (
                          <div className="absolute bottom-12 right-2 z-50">
                            <EmojiPicker
                              onEmojiClick={(emojiObject) => {
                                setNewComment(prev => prev + emojiObject.emoji);
                                setShowEmojiPicker(false);
                              }}
                            />
                          </div>
                        )}
                        {showMentionList && (
                          <div className="absolute bottom-12 left-2 z-50 bg-background border rounded-lg shadow-lg p-2 w-64">
                            {teamMembers
                              .filter(member => 
                                member.name.toLowerCase().includes(mentionQuery.toLowerCase())
                              )
                              .map(member => (
                                <Button
                                  key={member.id}
                                  variant="ghost"
                                  className="w-full justify-start text-left"
                                  onClick={() => handleMentionSelect(member.name)}
                                >
                                  {member.name}
                                </Button>
                              ))}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={addComment}
                        disabled={!newComment.trim() || isAddingComment}
                        className="gap-2"
                      >
                        {isAddingComment && <Loader2 className="h-4 w-4 animate-spin" />}
                        Send Comment
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Column Modal */}
      <Dialog open={showCreateColumnModal} onOpenChange={setShowCreateColumnModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="column-name">Column Name</Label>
              <Input
                id="column-name"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Enter column name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="column-color">Column Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="column-color"
                  title="Choose column color"
                  value={newColumnColor}
                  onChange={(e) => setNewColumnColor(e.target.value)}
                  className="h-10 w-20 cursor-pointer rounded border-0 p-0"
                />
                <div className="flex-1">
                  <Input
                    id="column-color-hex"
                    value={newColumnColor}
                    onChange={(e) => setNewColumnColor(e.target.value)}
                    placeholder="#000000"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateColumnModal(false)}>Cancel</Button>
            <Button onClick={handleCreateColumn}>Create Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Column Modal */}
      <Dialog open={showEditColumnModal} onOpenChange={setShowEditColumnModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-column-name">Column Name</Label>
              <Input
                id="edit-column-name"
                value={editColumnName}
                onChange={(e) => setEditColumnName(e.target.value)}
                placeholder="Enter column name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-column-color">Column Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="edit-column-color"
                  title="Choose column color"
                  value={editColumnColor}
                  onChange={(e) => setEditColumnColor(e.target.value)}
                  className="h-10 w-20 cursor-pointer rounded border-0 p-0"
                />
                <div className="flex-1">
                  <Input
                    id="edit-column-color-hex"
                    value={editColumnColor}
                    onChange={(e) => setEditColumnColor(e.target.value)}
                    placeholder="#000000"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEditColumnModal(false)}>Cancel</Button>
            <Button onClick={handleEditStatus}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Column Modal */}
      <Dialog open={showDeleteColumnModal} onOpenChange={setShowDeleteColumnModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Column</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this column? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteColumnModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteStatus}>Delete Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
