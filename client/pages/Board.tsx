import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { Task, ApiResponse, TeamMember, Comment, CreateCommentInput, Reaction } from '@shared/api';
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
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Calendar, Users, Check, X, Copy, Smile, Heart, ThumbsUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import EmojiPicker from 'emoji-picker-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Column {
  id: 'pending' | 'in_progress' | 'completed';
  title: string;
  color: string;
}

const columns: Column[] = [
  { id: 'pending', title: 'To Do', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { id: 'completed', title: 'Done', color: 'bg-green-100 text-green-800' },
];

const SortableTask = ({
  task,
  onOpenDetail,
  teamMembers,
  updateTask,
}: {
  task: Task;
  onOpenDetail: (task: Task) => void;
  teamMembers: TeamMember[];
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold text-gray-900 dark:text-white truncate flex-1" onClick={(e) => { e.stopPropagation(); onOpenDetail(task); }}>
          {task.title}
        </h4>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" title="Assign team members">
              <Users className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0">
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
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2" onClick={(e) => { e.stopPropagation(); onOpenDetail(task); }}>
          {task.description}
        </p>
      )}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-gray-400" />
          <span className="text-gray-500 dark:text-gray-400">
            {format(new Date(task.endDate), 'MMM d')}
          </span>
        </div>
        {task.assignedTo && task.assignedTo.length > 0 && (
          <div className="flex -space-x-2">
            {task.assignedTo.slice(0, 3).map(userId => {
              const member = teamMembers.find(m => m.id === userId);
              return (
                <div
                  key={userId}
                  className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium border-2 border-background"
                >
                  {member?.name.charAt(0).toUpperCase()}
                </div>
              );
            })}
            {task.assignedTo.length > 3 && (
              <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium border-2 border-background">
                +{task.assignedTo.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
      {task.epic && (
        <Badge variant="secondary" className="mt-2 text-xs">
          {task.epic}
        </Badge>
      )}
    </div>
  );
};

const TaskColumn = ({
  column,
  tasks,
  onOpenDetail,
  teamMembers,
  updateTask,
}: {
  column: Column;
  tasks: Task[];
  onOpenDetail: (task: Task) => void;
  teamMembers: TeamMember[];
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={column.color}>{column.title}</Badge>
          <span className="text-sm text-muted-foreground">({tasks.length})</span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-4 min-h-[500px] transition-colors ${
          isOver ? 'bg-gray-100 dark:bg-gray-800 ring-2 ring-primary' : ''
        }`}
      >
        <SortableContext
          items={tasks.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {tasks.map((task) => (
              <SortableTask
                key={task.id}
                task={task}
                onOpenDetail={onOpenDetail}
                teamMembers={teamMembers}
                updateTask={updateTask}
              />
            ))}
          </div>
        </SortableContext>
        {tasks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No tasks in {column.title}
          </div>
        )}
      </div>
    </div>
  );
};

export default function Board() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  
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

  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status);
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await api.get('/tasks?limit=10000');
      const data = response.data as ApiResponse<{ tasks: Task[] }>;
      if (data.success && data.data) {
        setTasks(data.data.tasks);
      }
    } catch (error: any) {
      console.error('Failed to fetch tasks:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to fetch tasks',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
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
      // Fallback mock team members for demo
      setTeamMembers([
        { id: '1', name: 'John Doe', email: 'john@example.com', role: 'member', status: 'active' },
        { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'member', status: 'active' },
        { id: '3', name: 'Bob Johnson', email: 'bob@example.com', role: 'manager', status: 'active' },
      ]);
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    setIsUpdatingTask(true);
    try {
      const response = await api.put(`/tasks/${taskId}`, updates);
      const data = response.data as ApiResponse<Task>;
      if (data.success && data.data) {
        setTasks(prev => prev.map(task => task.id === taskId ? data.data! : task));
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

  const updateTaskStatus = async (taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    try {
      const response = await api.put(`/tasks/${taskId}`, { status: newStatus });
      const data = response.data as ApiResponse<Task>;
      if (data.success && data.data) {
        setTasks(prev => prev.map(task => task.id === taskId ? data.data! : task));
        if (selectedTask?.id === taskId) {
          setSelectedTask(data.data);
        }
        toast({
          title: 'Task status updated',
          description: `Task moved to ${newStatus.replace('_', ' ')}`,
        });
      }
    } catch (error: any) {
      console.error('Failed to update task status:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.message || 'Failed to update task status',
        variant: 'destructive',
      });
      fetchTasks(); // Refresh tasks to revert the local state
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTaskItem = tasks.find(t => t.id === activeId);
    if (!activeTaskItem) return;

    // Determine target column
    let targetColumn: Column | undefined;
    
    // Check if over is a column
    targetColumn = columns.find(col => col.id === overId);
    
    // If over is a task, find its column
    if (!targetColumn) {
      const overTaskItem = tasks.find(t => t.id === overId);
      if (overTaskItem) {
        targetColumn = columns.find(col => col.id === overTaskItem.status);
      }
    }

    if (targetColumn && activeTaskItem.status !== targetColumn.id) {
      // Update local state immediately for visual feedback
      setTasks(prev => prev.map(t => 
        t.id === activeId ? { ...t, status: targetColumn.id } : t
      ));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeTaskId = active.id as string;
    const overId = over.id as string;

    // Find the task
    const task = tasks.find(t => t.id === activeTaskId);
    if (!task) return;

    // Determine target column
    let targetColumn: Column | undefined;
    
    // Check if over is a column
    targetColumn = columns.find(col => col.id === overId);
    
    // If over is a task, find its column
    if (!targetColumn) {
      const overTaskItem = tasks.find(t => t.id === overId);
      if (overTaskItem) {
        targetColumn = columns.find(col => col.id === overTaskItem.status);
      }
    }

    // Handle moving between columns
    if (targetColumn && task.status !== targetColumn.id) {
      updateTaskStatus(task.id, targetColumn.id);
      return;
    }

    // Check if we're sorting within the same column
    const activeColumn = columns.find(col => col.id === task.status);
    if (activeColumn) {
      const activeItems = getTasksByStatus(activeColumn.id);
      const fromIndex = activeItems.findIndex(t => t.id === activeTaskId);
      const toIndex = activeItems.findIndex(t => t.id === overId);

      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        // For simplicity, we'll just reorder locally without persisting to backend
        const newItems = arrayMove(activeItems, fromIndex, toIndex);
        const otherTasks = tasks.filter(t => t.status !== activeColumn.id);
        setTasks([...otherTasks, ...newItems]);
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

  useEffect(() => { 
    fetchTasks();
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Board</h1>
            <p className="text-muted-foreground mt-2">Drag and drop tasks to update their status</p>
          </div>
          <Button onClick={() => window.location.href = '/tasks'}>
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {columns.map((column) => (
              <TaskColumn
                key={column.id}
                column={column}
                tasks={getTasksByStatus(column.id)}
                onOpenDetail={openTaskDetail}
                teamMembers={teamMembers}
                updateTask={updateTask}
              />
            ))}
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
          </DragOverlay>
        </DndContext>
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
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
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
    </Layout>
  );
}
