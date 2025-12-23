import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { TeamMember, InviteTeamMemberInput, ApiResponse } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Mail, Plus, Check, AlertCircle, CheckCircle, MoreVertical, UserCheck, UserX, Trash2 } from "lucide-react";
import Layout from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Team() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: "admin" | "manager" | "member" | "";
  }>({
    name: "",
    email: "",
    role: "",
  });

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);
      const response = await api.get("/team");
      const data = response.data as ApiResponse<TeamMember[]>;

      if (data.success && data.data) {
        setTeamMembers(data.data);
      } else {
        setError(data.error || "Failed to fetch team members");
      }
    } catch (err) {
      setError("Failed to load team members");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!formData.name || !formData.email || !formData.role) {
      setError("Please fill in all required fields");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email address");
      return;
    }

    try {
      setInviting(true);
      const response = await api.post("/team/invite", {
        name: formData.name,
        email: formData.email,
        role: formData.role,
      });
      const data = response.data as ApiResponse<TeamMember>;

      if (data.success && data.data) {
        // Add to team list if new, or update if exists
        setTeamMembers((prev) => {
          const existing = prev.find((d) => d.email === formData.email);
          if (existing) {
            return prev.map((d) =>
              d.email === formData.email ? data.data : d,
            );
          }
          return [data.data, ...prev];
        });

        setFormData({ name: "", email: "", role: "" as any });
        setIsFormOpen(false);
        setError(null);
        toast({
          title: "Invitation sent",
          description: `Invitation sent to ${formData.email}`,
        });
      } else {
        setError(data.error || "Failed to send invitation");
      }
    } catch (err) {
      setError("Failed to send invitation");
      console.error(err);
    } finally {
      setInviting(false);
    }
  };

  const handleActivateDeactivate = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      const response = await api.put(`/team/${id}/status`, { status: newStatus });

      const data = response.data;
      if (data.success) {
        setTeamMembers(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));
        toast({
          title: `Team member ${newStatus}`,
          description: `Team member has been ${newStatus}d`,
        });
      } else {
        setError(data.error || "Failed to update status");
      }
    } catch (err) {
      setError("Failed to update status");
      console.error(err);
    }
  };

  const handleDeleteClick = (member: TeamMember) => {
    setMemberToDelete(member);
  };

  const handleDeleteConfirm = async () => {
    if (!memberToDelete) return;

    try {
      const response = await api.delete(`/team/${memberToDelete.id}`);
      const data = response.data;
      if (data.success) {
        setTeamMembers(prev => prev.filter(d => d.id !== memberToDelete.id));
        toast({
          title: "Team member deleted",
          description: "Team member has been removed",
        });
        setMemberToDelete(null);
      } else {
        setError(data.error || "Failed to delete team member");
      }
    } catch (err) {
      setError("Failed to delete team member");
      console.error(err);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading team members...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Team</h1>
            <p className="text-muted-foreground mt-2">
              Manage your team and send performance tracking invitations
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(!isFormOpen)} className="gap-2">
            <Plus className="h-4 w-4" />
            Invite Member
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Invite Form */}
        {isFormOpen && (
          <Card className="border border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>Invite Team Member</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="role">Role/Position *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) =>
                    setFormData({ ...formData, role: value as "admin" | "manager" | "member" })
                  }
                >
                  <SelectTrigger id="role" className="mt-1">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={inviting}
                  className="gap-2"
                >
                  <Mail className="h-4 w-4" />
                  {inviting ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Team Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teamMembers.length === 0 ? (
            <div className="col-span-3">
              <Card className="border border-border">
                <CardContent className="py-12">
                  <div className="text-center">
                    <p className="text-muted-foreground text-lg">
                      No team members yet
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Invite your first team member to get started
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            teamMembers.map((member) => (
              <Card key={member.id} className="border border-border">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{member.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {member.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.status === "active" && (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                           <DropdownMenuItem
                             onClick={() => handleActivateDeactivate(member.id, member.status)}
                           >
                             {member.status === "active" ? (
                               <>
                                 <UserX className="h-4 w-4 mr-2" />
                                 Deactivate
                               </>
                             ) : (
                               <>
                                 <UserCheck className="h-4 w-4 mr-2" />
                                 Activate
                               </>
                             )}
                           </DropdownMenuItem>
                           <DropdownMenuItem
                             onClick={() => handleDeleteClick(member)}
                             className="text-red-600"
                           >
                             <Trash2 className="h-4 w-4 mr-2" />
                             Delete
                           </DropdownMenuItem>
                         </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium break-all">{member.email}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize mt-1 ${
                        member.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {member.status === "active" ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <Mail className="h-3 w-3 mr-1" />
                          Invited
                        </>
                      )}
                    </span>
                  </div>

                  {member.joinedAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">Joined</p>
                      <p className="text-sm">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Team Member</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{memberToDelete?.name}</strong>?
                This action cannot be undone and will permanently remove the team member from your team.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
