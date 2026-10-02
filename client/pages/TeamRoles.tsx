import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { ApiResponse } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Users,
} from "lucide-react";
import Layout from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Role Management — create workspace roles and assign their permissions
 * (business-team mirror of the platform admin's RoleManagement).
 *
 * Members can only perform what their role allows; enforcement happens on the
 * API (middleware/teamAuth.ts) so the UI is a management surface, not the gate.
 */

interface WorkspaceRole {
  id: string;
  name: string;
  description?: string | null;
  is_system?: boolean;
  permissions: string[];
  createdAt?: string;
  memberCount?: number | string;
}

interface PermissionMeta {
  id: string;
  name: string;
  description: string;
}

interface MyRole {
  role: string;
  roleId: string | null;
  isOwner: boolean;
  isSuper: boolean;
  permissions: string[];
  wildcard: boolean;
}

/** UI grouping of the flat permission catalog. */
const CATEGORY_OF = (id: string): { label: string; order: number } => {
  if (id.startsWith("rtc.")) return { label: "Calls & Meetings", order: 4 };
  const map: Record<string, [string, number]> = {
    view_dashboard: ["Overview", 0],
    manage_tasks: ["Workspace", 1],
    manage_epics: ["Workspace", 1],
    manage_ideas: ["Workspace", 1],
    view_activity: ["Workspace", 1],
    export_data: ["Workspace", 1],
    view_ranking: ["Team", 2],
    manage_team: ["Team", 2],
    use_meetings: ["Team", 2],
    use_chat: ["Team", 2],
    use_calls: ["Team", 2],
    manage_finance: ["Money", 3],
    manage_payment_links: ["Get Paid", 3],
    manage_invoices: ["Get Paid", 3],
    manage_store: ["Get Paid", 3],
    manage_subscriptions: ["Get Paid", 3],
    manage_growth: ["Growth", 5],
  };
  const hit = map[id];
  return hit ? { label: hit[0], order: hit[1] } : { label: "Other", order: 99 };
};

export default function TeamRoles() {
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionMeta[]>([]);
  const [myRole, setMyRole] = useState<MyRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<WorkspaceRole | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<WorkspaceRole | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState({ name: "", description: "", permissions: [] as string[] });

  const canManage = !!myRole && (myRole.isSuper || myRole.permissions.includes("manage_team"));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rolesRes, permsRes, meRes] = await Promise.all([
        api.get("/roles"),
        api.get("/roles/permissions"),
        api.get("/roles/me").catch(() => null),
      ]);

      const rolesData = rolesRes.data as ApiResponse<{ roles: WorkspaceRole[] }>;
      if (rolesData.success && rolesData.data) setRoles(rolesData.data.roles || []);
      else setError(rolesData.error || "Failed to load roles");

      const permsData = permsRes.data as ApiResponse<{ permissions: PermissionMeta[] }>;
      if (permsData.success && permsData.data) setCatalog(permsData.data.permissions || []);

      const meData = meRes?.data as ApiResponse<MyRole> | undefined;
      if (meData?.success && meData.data) setMyRole(meData.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || "Failed to load roles");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, { label: string; order: number; items: PermissionMeta[] }>();
    for (const perm of catalog) {
      const { label, order } = CATEGORY_OF(perm.id);
      if (!groups.has(label)) groups.set(label, { label, order, items: [] });
      groups.get(label)!.items.push(perm);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
  }, [catalog]);

  const permissionName = (id: string) => catalog.find((p) => p.id === id)?.name || id;

  const openCreate = () => {
    setForm({ name: "", description: "", permissions: [] });
    setEditRole(null);
    setIsCreateOpen(true);
  };

  const openEdit = (role: WorkspaceRole) => {
    setForm({
      name: role.name,
      description: role.description || "",
      permissions: [...(role.permissions || [])],
    });
    setEditRole(role);
    setIsCreateOpen(true);
  };

  const togglePermission = (id: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(id)
        ? prev.permissions.filter((p) => p !== id)
        : [...prev.permissions, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Role name is required");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        permissions: form.permissions,
      };
      if (editRole) {
        await api.put(`/roles/${editRole.id}`, payload);
        toast({ title: "Role updated", description: `"${payload.name}" was updated successfully.` });
      } else {
        await api.post("/roles", payload);
        toast({ title: "Role created", description: `"${payload.name}" is ready to assign to team members.` });
      }
      setIsCreateOpen(false);
      await fetchData();
    } catch (err: any) {
      const message = err.response?.data?.error || err.response?.data?.message || "Failed to save role";
      setError(message);
      toast({ title: "Could not save role", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;
    try {
      setDeleting(true);
      await api.delete(`/roles/${roleToDelete.id}`);
      toast({ title: "Role deleted", description: `Members using "${roleToDelete.name}" fall back to default roles.` });
      setRoleToDelete(null);
      await fetchData();
    } catch (err: any) {
      const message = err.response?.data?.error || err.response?.data?.message || "Failed to delete role";
      toast({ title: "Could not delete role", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading roles...</p>
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
            <h1 className="text-4xl font-bold text-foreground">Roles &amp; Permissions</h1>
            <p className="text-muted-foreground mt-2">
              Create roles, assign exactly what each role can do, then attach them to team members —
              enforced across the whole platform.
            </p>
          </div>
          {canManage && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Role
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* My role summary */}
        {myRole && (
          <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Your role: {myRole.role}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {myRole.wildcard
                  ? "You have full access — you can create roles, invite members and manage the workspace."
                  : `You can perform ${myRole.permissions.length} permission${myRole.permissions.length === 1 ? "" : "s"} assigned to your role. Ask an admin if you need more.`}
              </p>
              {!myRole.wildcard && myRole.permissions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {myRole.permissions.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[11px] font-normal">
                      {permissionName(p)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Roles table */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Workspace roles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roles.length === 0 ? (
              <div className="py-10 text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  No custom roles yet. Team members currently use the default roles
                  (Admin / Manager / Member). Create your first role to tailor exactly
                  what each person can do.
                </p>
                {canManage && (
                  <Button onClick={openCreate} className="gap-2 mt-4" variant="outline">
                    <Plus className="h-4 w-4" />
                    Create your first role
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role</TableHead>
                        <TableHead>Permissions</TableHead>
                        <TableHead className="text-center">Members</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((role) => (
                        <TableRow key={role.id}>
                          <TableCell>
                            <p className="font-medium">{role.name}</p>
                            {role.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                                {role.description}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {role.permissions.slice(0, 4).map((p) => (
                                <Badge key={p} variant="secondary" className="text-[10px] font-normal">
                                  {permissionName(p)}
                                </Badge>
                              ))}
                              {role.permissions.length > 4 && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{role.permissions.length - 4} more
                                </Badge>
                              )}
                              {role.permissions.length === 0 && (
                                <span className="text-xs text-muted-foreground">No permissions</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center gap-1 text-sm">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              {role.memberCount ?? 0}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canManage && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(role)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600"
                                    onClick={() => setRoleToDelete(role)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile list */}
                <div className="md:hidden space-y-3">
                  {roles.map((role) => {
                    const isOpen = !!expanded[role.id];
                    return (
                      <div key={role.id} className="rounded-xl border border-border p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{role.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                              {" · "}
                              {role.memberCount ?? 0} member{(role.memberCount ?? 0) === 1 ? "" : "s"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {canManage && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(role)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => setRoleToDelete(role)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {role.permissions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpanded((prev) => ({ ...prev, [role.id]: !prev[role.id] }))}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"
                          >
                            {isOpen ? "Hide permissions" : "View permissions"}
                            {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        )}
                        {isOpen && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {role.permissions.map((p) => (
                              <Badge key={p} variant="secondary" className="text-[10px] font-normal">
                                {permissionName(p)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editRole ? `Edit role — ${editRole.name}` : "Create role"}</DialogTitle>
              <DialogDescription>
                Pick exactly what members with this role can do across the workspace.
                Changes apply immediately.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="role-name">Role name *</Label>
                <Input
                  id="role-name"
                  placeholder="e.g. Sales, Support, Accountant"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="role-description">Description</Label>
                <Input
                  id="role-description"
                  placeholder="What is this role for?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Permissions ({form.permissions.length} selected)</Label>
                <div className="mt-2 space-y-3">
                  {groupedCatalog.map((group) => (
                    <div key={group.label} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.label}
                        </p>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-primary hover:underline"
                          onClick={() => {
                            const ids = group.items.map((i) => i.id);
                            const allOn = ids.every((id) => form.permissions.includes(id));
                            setForm((prev) => ({
                              ...prev,
                              permissions: allOn
                                ? prev.permissions.filter((p) => !ids.includes(p))
                                : [...new Set([...prev.permissions, ...ids])],
                            }));
                          }}
                        >
                          Toggle all
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {group.items.map((perm) => {
                          const checked = form.permissions.includes(perm.id);
                          return (
                            <label
                              key={perm.id}
                              className={cn(
                                "flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors",
                                checked ? "border-primary/40 bg-primary/5" : "border-border hover:bg-accent/50"
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => togglePermission(perm.id)}
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium leading-tight">{perm.name}</span>
                                <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
                                  {perm.description}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editRole ? "Save changes" : "Create role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!roleToDelete} onOpenChange={() => setRoleToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete role</AlertDialogTitle>
              <AlertDialogDescription>
                Delete <strong>{roleToDelete?.name}</strong>? Members currently on this role
                fall back to the default Member role. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete role"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
