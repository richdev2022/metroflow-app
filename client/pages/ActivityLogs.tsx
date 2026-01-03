import React, { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { ApiResponse, TeamMember } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import Layout from "@/components/layout";
import { Search, Filter, X } from "lucide-react";

interface ActivityLog {
  id: string;
  businessId: string;
  taskId?: string;
  userId: string;
  action: string;
  actionType?: string;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  userName?: string;
  taskTitle?: string;
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    action: "all",
    userId: "all"
  });
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    fetchActivityLogs();
  }, [page, filters]);

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

  const fetchActivityLogs = async () => {
    try {
      setLoading(true);
      
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(filters.action !== "all" && { action: filters.action }),
        ...(filters.userId !== "all" && { userId: filters.userId }),
      });

      const response = await api.get(`/activity-logs?${queryParams}`);
      const data = response.data as ApiResponse<{ logs: ActivityLog[]; total: number; page: number; totalPages: number }>;

      if (data.success && data.data) {
        setLogs(data.data.logs);
        setTotalPages(data.data.totalPages);
        setTotalLogs(data.data.total);
      } else {
        setError(data.error || "Failed to fetch activity logs");
      }
    } catch (err: any) {
      const message = err.message || "Failed to load activity logs";
      setError(message);
       // Only log unexpected errors
      if (!message.includes("Unable to connect")) {
         console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      startDate: "",
      endDate: "",
      action: "all",
      userId: "all"
    });
    setPage(1);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionBadgeColor = (action: string) => {
    switch (action.toLowerCase()) {
      case "create":
        return "bg-green-100 text-green-700";
      case "update":
        return "bg-blue-100 text-blue-700";
      case "delete":
        return "bg-red-100 text-red-700";
      case "login":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Activity Log</h1>
            <p className="text-muted-foreground mt-2">
              Track all activities and actions performed in the system
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, startDate: e.target.value }));
                    setPage(1);
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, endDate: e.target.value }));
                    setPage(1);
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Action</label>
                <Select
                  value={filters.action}
                  onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, action: value }));
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="login">Login</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">User</label>
                <Select
                  value={filters.userId}
                  onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, userId: value }));
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={clearFilters}
                >
                  <X className="mr-2 h-4 w-4" /> Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Activity Logs List */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle>Recent Activities ({totalLogs})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading activity logs...</p>
                </div>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No activity logs found matching your filters</p>
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge className={getActionBadgeColor(log.action)}>
                            {log.action}
                          </Badge>
                          {log.actionType && (
                            <Badge variant="outline">
                              {log.actionType}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground sm:hidden">
                            {formatDate(log.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground mb-2 font-medium">
                          {log.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold">User:</span> {log.userName || log.userId}
                          </div>
                          {log.taskTitle && (
                            <div className="flex items-center gap-1">
                              <span className="font-semibold">Task:</span> {log.taskTitle}
                            </div>
                          )}
                          <div className="hidden sm:block">
                            <span className="font-semibold">Time:</span> {formatDate(log.createdAt)}
                          </div>
                        </div>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <details>
                              <summary className="cursor-pointer hover:text-foreground">
                                Additional Details
                              </summary>
                              <pre className="mt-1 whitespace-pre-wrap bg-secondary p-2 rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => page > 1 && setPage(page - 1)}
                        className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .map((p, i, arr) => {
                        if (i > 0 && p - arr[i-1] > 1) {
                          return (
                            <PaginationItem key={`ellipsis-${p}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        }
                        return (
                          <PaginationItem key={p}>
                            <PaginationLink
                              isActive={page === p}
                              onClick={() => setPage(p)}
                              className="cursor-pointer"
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => page < totalPages && setPage(page + 1)}
                        className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
