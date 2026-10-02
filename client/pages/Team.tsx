import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { TeamMember, ApiResponse } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/alert-dialog";
import { Mail, Plus, Check, AlertCircle, CheckCircle, MoreVertical, UserCheck, UserX, Trash2, ShieldCheck, ChevronDown, ChevronUp, Settings2, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkspaceRole {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
  memberCount?: number | string;
}

interface PermissionMeta {
  id: string;
  name: string;
  description: string;
}

/** Select value encoding: legacy fixed roles vs workspace custom roles. */
const LEGACY_PREFIX = "legacy:";
const encodeRole = (kind: "legacy" | "custom", id: string) =>
  kind === "legacy" ? `${LEGACY_PREFIX}${id}` : `custom:${id}`;
const decodeRole = (value: string) =>
  value.startsWith(LEGACY_PREFIX)
    ? ({ kind: "legacy", id: value.slice(LEGACY_PREFIX.length) } as const)
    : ({ kind: "custom", id: value.slice("custom:".length) } as const);

export default function Team() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [permissionNames, setPermissionNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);
  const [expandedPermissions, setExpandedPermissions] = useState<Record<string, boolean>>({});
  // Change-member-role dialog (PATCH /team/:id/role — legacy role or roleId).
  const [roleMember, setRoleMember] = useState<TeamMember | null>(null);
  const [roleValue, setRoleValue] = useState<string>("");
  const [roleSaving, setRoleSaving] = useState(false);

  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: string; // encoded legacy/custom value
  }>({
    name: "",
    email: "",
    role: "",
  });

  useEffect(() => {
    fetchTeamMembers();
    fetchRoles();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/team');
      const data = response.data as ApiResponse<TeamMember[]>;

      if (data.success && data.data) {
        setTeamMembers(data.data);
      } else {
        setError(data.error || 'Failed to fetch team members');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load team members');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get("/roles"),
        api.get("/roles/permissions"),
      ]);
      const rolesData = rolesRes.data as ApiResponse<{ roles: WorkspaceRole[] }>;
      if (rolesData.success && rolesData.data) setRoles(rolesData.data.roles || []);

      const permsData = permsRes.data as ApiResponse<{ permissions: PermissionMeta[] }>;
      if (permsData.success && permsData.data) {
        const map: Record<string, string> = {};
        for (const p of permsData.data.permissions || []) map[p.id] = p.name;
        setPermissionNames(map);
      }
    } catch {
      // Roles are optional for this page (legacy roles still work) — stay quiet.
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

    const decoded = decodeRole(formData.role);
    const payload: Record<string, unknown> = {
      name: formData.name,
      email: formData.email,
    };
    if (decoded.kind === "custom") {
      payload.roleId = decoded.id;
      payload.role = "member";
    } else {
      payload.role = decoded.id;
    }

    try {
      setInviting(true);
      const invitedEmail = formData.email;
      const response = await api.post("/team/invite", payload);
      const data = response.data as ApiResponse<TeamMember> & {
        emailSent?: boolean;
        inviteLink?: string;
        message?: string;
      };

      if (data.success && data.data) {
        // Add to team list if new, or update if exists
        setTeamMembers((prev) => {
          const existing = prev.find((d) => d.email === invitedEmail);
          if (existing) {
            return prev.map((d) =>
              d.email === invitedEmail ? data.data : d,
            );
          }
          return [data.data, ...prev];
        });

        setFormData({ name: "", email: "", role: "" });
        setIsFormOpen(false);
        setError(null);

        if (data.emailSent === false && data.inviteLink) {
          // Email delivery failed (SMTP/Brevo outage) but the member WAS
          // invited — hand the admin the invite link to share manually.
          try {
            await navigator.clipboard.writeText(data.inviteLink);
          } catch { /* clipboard unavailable — link still shown in toast */ }
          toast({
            title: "Member invited — email delivery failed",
            description: `Invite link copied to your clipboard — share it with ${invitedEmail}: ${data.inviteLink}`,
            duration: 12000,
          });
        } else {
          toast({
            title: "Invitation sent",
            description: `Invitation sent to ${invitedEmail}`,
          });
        }
      } else {
        setError(data.error || "Failed to send invitation");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to send invitation');
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
        setTeamMembers(prev => prev.map(d => d.id === id ? { ...d, status: newStatus as any } : d));
        toast({
          title: `Team member ${newStatus}`,
          description: `Team member has been ${newStatus}d`,
        });
      } else {
        setError(data.error || "Failed to update status");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to update status');
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
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to delete team member');
      console.error(err);
    }
  };

  const memberRoleLabel = (member: TeamMember) => {
    if (member.roleId && member.roleName) return member.roleName;
    if (member.is_owner || (member.role || "").toLowerCase() === "owner") return "Owner";
    return member.role || "Member";
  };

  const openChangeRole = (member: TeamMember) => {
    // Preselect the member's current role (custom first, then legacy).
    setRoleValue(
      member.roleId
        ? encodeRole("custom", member.roleId)
        : encodeRole("legacy", (member.role || "member").toLowerCase()),
    );
    setRoleMember(member);
  };

  const handleChangeRoleConfirm = async () => {
    if (!roleMember || !roleValue) return;
    const decoded = decodeRole(roleValue);
    const payload: Record<string, unknown> =
      decoded.kind === "custom" ? { roleId: decoded.id } : { role: decoded.id };
    try {
      setRoleSaving(true);
      const response = await api.patch(`/team/${roleMember.id}/role`, payload);
      const data = response.data as ApiResponse<TeamMember>;
      if (data.success) {
        const customRole = decoded.kind === "custom" ? roles.find((r) => r.id === decoded.id) : null;
        setTeamMembers((prev) =>
          prev.map((d) =>
            d.id === roleMember.id
              ? {
                  ...d,
                  ...(decoded.kind === "custom"
                    ? { roleId: decoded.id, roleName: customRole?.name || d.roleName, role: ("member" as const) }
                    : { roleId: null, roleName: null, role: decoded.id as TeamMember["role"] }),
                  permissions: data.data?.permissions || d.permissions,
                }
              : d,
          ),
        );
        toast({
          title: "Role updated",
          description: `${roleMember.name} is now ${customRole?.name || decoded.id}.`,
        });
        setRoleMember(null);
        // Refresh so the card's resolved permission badges reflect the new role.
        fetchTeamMembers();
      } else {
        toast({
          title: "Could not update role",
          description: data.error || "Please try again",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Could not update role",
        description: err.response?.data?.error || err.response?.data?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setRoleSaving(false);
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
        <div className="flex flex-col gap-3 sm:flex-row justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Team</h1>
            <p className="text-muted-foreground mt-2">
              Manage your team and send performance tracking invitations
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/team/roles">
                <ShieldCheck className="h-4 w-4" />
                Roles &amp; Permissions
              </Link>
            </Button>
            <Button onClick={() => setIsFormOpen(!isFormOpen)} className="gap-2">
              <Plus className="h-4 w-4" />
              Invite Member
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="role">Role &amp; Permissions *</Label>
                  <Link
                    to="/team/roles"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Settings2 className="h-3 w-3" />
                    Manage roles
                  </Link>
                </div>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger id="role" className="mt-1">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Workspace roles
                        </div>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={encodeRole("custom", role.id)}>
                            {role.name} · {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                          </SelectItem>
                        ))}
                        <div className="px-2 py-1.5 mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t">
                          Default roles
                        </div>
                      </>
                    )}
                    <SelectItem value={encodeRole("legacy", "member")}>
                      Member — day-to-day work tools
                    </SelectItem>
                    <SelectItem value={encodeRole("legacy", "manager")}>
                      Manager — everything except team management
                    </SelectItem>
                    <SelectItem value={encodeRole("legacy", "admin")}>
                      Admin — full access
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  The member can only perform actions their role allows. Create tailored roles under Roles &amp; Permissions.
                </p>
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
            teamMembers.map((member) => {
              const permissions = member.permissions || [];
              const expanded = !!expandedPermissions[member.id];
              const visible = expanded ? permissions : permissions.slice(0, 6);
              return (
                <Card key={member.id} className="border border-border">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <CardTitle className="text-lg truncate">{member.name}</CardTitle>
                        {member.is_owner || (member.role || "").toLowerCase() === "owner" ? (
                          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                            Owner
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openChangeRole(member)}
                            className="text-sm font-medium text-primary mt-1 flex items-center gap-1.5 hover:underline"
                            title="Change role"
                          >
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                            {memberRoleLabel(member)}
                            <Pencil className="h-3 w-3 opacity-60" />
                          </button>
                        )}
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
                            {!member.is_owner && (member.role || "").toLowerCase() !== "owner" && (
                              <DropdownMenuItem onClick={() => openChangeRole(member)}>
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Change role
                              </DropdownMenuItem>
                            )}
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

                    {permissions.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            Permissions ({permissions.length})
                          </p>
                          {permissions.length > 6 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPermissions((prev) => ({
                                  ...prev,
                                  [member.id]: !prev[member.id],
                                }))
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                            >
                              {expanded ? "Show less" : "See all"}
                              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {visible.map((perm) => (
                            <Badge
                              key={perm}
                              variant="secondary"
                              className="text-[10px] font-normal"
                              title={permissionNames[perm] || perm}
                            >
                              {permissionNames[perm] || perm}
                            </Badge>
                          ))}
                          {permissions.length === 0 && (
                            <span className="text-xs text-muted-foreground">No permissions</span>
                          )}
                        </div>
                      </div>
                    )}

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
              );
            })
          )}
        </div>

        {/* Change Role Dialog */}
        <Dialog open={!!roleMember} onOpenChange={(open) => !open && setRoleMember(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Role</DialogTitle>
              <DialogDescription>
                Choose the role for <strong>{roleMember?.name}</strong>. Permissions apply immediately.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="change-role-select">Role &amp; Permissions</Label>
              <Select value={roleValue} onValueChange={setRoleValue}>
                <SelectTrigger id="change-role-select">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Workspace roles
                      </div>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={encodeRole("custom", role.id)}>
                          {role.name} · {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1.5 mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t">
                        Default roles
                      </div>
                    </>
                  )}
                  <SelectItem value={encodeRole("legacy", "member")}>
                    Member — day-to-day work tools
                  </SelectItem>
                  <SelectItem value={encodeRole("legacy", "manager")}>
                    Manager — everything except team management
                  </SelectItem>
                  <SelectItem value={encodeRole("legacy", "admin")}>
                    Admin — full access
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tailor what each role can do under Roles &amp; Permissions.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleMember(null)}>
                Cancel
              </Button>
              <Button onClick={handleChangeRoleConfirm} disabled={roleSaving || !roleValue || roleValue === (roleMember?.roleId ? encodeRole("custom", roleMember.roleId) : encodeRole("legacy", (roleMember?.role || "member").toLowerCase()))}>
                {roleSaving ? "Saving..." : "Save Role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
