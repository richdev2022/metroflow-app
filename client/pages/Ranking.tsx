import React, { useEffect, useState } from "react";
import { Task, ApiResponse, TeamMember } from "@shared/api";
import { api } from "@/lib/api-client";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Trophy, Medal, AlertCircle } from "lucide-react";

interface TeamMemberStats {
  teamMember: TeamMember;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

export default function Ranking() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rankings, setRankings] = useState<TeamMemberStats[]>([]);

  const businessId = localStorage.getItem("businessId");
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch team members
      const teamResponse = await api.get("/team");
      const teamData = teamResponse.data as ApiResponse<TeamMember[]>;
      
      // Fetch tasks
      const taskResponse = await api.get("/tasks?limit=10000");
      const taskData = taskResponse.data as ApiResponse<{ tasks: Task[]; total: number }>;

      if (teamData.success && teamData.data && taskData.success && taskData.data) {
        calculateRankings(teamData.data, taskData.data.tasks);
      } else {
        setError("Failed to fetch data");
      }
    } catch (err: any) {
      const message = err.message || "Failed to load ranking data";
      setError(message);
      // Only log unexpected errors
      if (!message.includes("Unable to connect")) {
         console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateRankings = (teamMembers: TeamMember[], tasks: Task[]) => {
    const stats: TeamMemberStats[] = teamMembers
      .filter(member => member.role !== 'admin')
      .map(member => {
      const memberTasks = tasks.filter(t => t.assignedTo && t.assignedTo.includes(member.id));
      const totalTasks = memberTasks.length;
      const completedTasks = memberTasks.filter(t => t.status === "completed").length;
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      return {
        teamMember: member,
        totalTasks,
        completedTasks,
        completionRate
      };
    });

    // Sort by completion rate descending
    stats.sort((a, b) => b.completionRate - a.completionRate);

    setRankings(stats);
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-6 w-6 text-yellow-500" />;
      case 1:
        return <Medal className="h-6 w-6 text-gray-400" />;
      case 2:
        return <Medal className="h-6 w-6 text-amber-600" />;
      default:
        return <span className="font-bold text-muted-foreground w-6 text-center">{index + 1}</span>;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading Rankings...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Team Rankings</h1>
          <p className="text-muted-foreground mt-2">
            Performance ranking based on task completion rates
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Performance Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Rank</TableHead>
                  <TableHead>Team Member</TableHead>
                  <TableHead className="text-right">Tasks Assigned</TableHead>
                  <TableHead className="text-right">Tasks Completed</TableHead>
                  <TableHead className="text-right">Completion Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings.map((stat, index) => (
                  <TableRow key={stat.teamMember.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center justify-center w-8">
                        {getRankIcon(index)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {stat.teamMember.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{stat.teamMember.name}</p>
                          <p className="text-sm text-muted-foreground">{stat.teamMember.role}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{stat.totalTasks}</TableCell>
                    <TableCell className="text-right">{stat.completedTasks}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={stat.completionRate >= 80 ? "default" : stat.completionRate >= 50 ? "secondary" : "destructive"}>
                        {stat.completionRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
