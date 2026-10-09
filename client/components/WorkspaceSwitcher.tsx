import { useCallback, useEffect, useState } from "react";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { getApiMessage, unwrapApiData } from "@/lib/api-response";
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";

/**
 * MULTI-WORKSPACE SWITCHER — the schema keeps one users row per business,
 * so a person invited into two workspaces exists as two memberships with
 * the same (verified) email. This switcher lists them (GET /auth/workspaces)
 * and swaps the whole session (POST /auth/switch-workspace → fresh token +
 * identity keys) without re-entering the password. Hidden entirely when the
 * user belongs to a single workspace.
 */

interface WorkspaceMembership {
  userId: string;
  businessId: string;
  businessName: string;
  businessLogo: string | null;
  workspaceCode: string | null;
  role: string;
  isCurrent: boolean;
}

export function WorkspaceSwitcher() {
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    let cancelled = false;
    api
      .get("/auth/workspaces")
      .then((res) => {
        if (cancelled) return;
        const data = unwrapApiData<{ workspaces: WorkspaceMembership[]; canSwitch: boolean }>(
          res.data,
          "Failed to load workspaces",
        );
        setWorkspaces(data.workspaces || []);
      })
      .catch(() => {
        if (!cancelled) setWorkspaces([]); // non-fatal — switcher stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = (workspaces || []).find((w) => w.isCurrent) || null;
  const others = (workspaces || []).filter((w) => !w.isCurrent);

  const switchTo = useCallback(
    async (w: WorkspaceMembership) => {
      setSwitching(w.businessId);
      try {
        const res = await api.post("/auth/switch-workspace", { businessId: w.businessId });
        const d = res?.data || {};
        if (!d.success) throw new Error(d.message || "Switch failed");
        localStorage.setItem("token", d.token);
        localStorage.setItem("userId", d.userId || "");
        localStorage.setItem("businessId", d.businessId || "");
        localStorage.setItem("userName", (d.name || "").trim() || d.email || "You");
        if (d.avatarUrl) localStorage.setItem("userAvatar", resolveMediaUrl(d.avatarUrl));
        toast({ title: `Switched to ${w.businessName}` });
        // Full reload: every cache (react-query, sockets, presence) rebinds
        // to the new workspace identity.
        window.setTimeout(() => window.location.reload(), 400);
      } catch (err) {
        setSwitching(null);
        toast({ variant: "destructive", title: "Could not switch", description: getApiMessage(err, "Switching workspace failed") });
      }
    },
    [toast],
  );

  // Hidden until we KNOW there is more than one membership.
  if (!workspaces || workspaces.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        data-testid="workspace-switcher"
        disabled={!!switching}
        className="group-data-[collapsible=icon]:hidden"
      >
        <button
          type="button"
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent"
          aria-label="Switch workspace"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {current?.businessLogo ? (
              <img src={resolveMediaUrl(current.businessLogo)} alt="" className="h-7 w-7 object-cover" />
            ) : (
              <Building2 className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-sidebar-foreground">
              {current?.businessName || "Workspace"}
            </span>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              {current?.workspaceCode || ""}
            </span>
          </span>
          {switching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-64">
        <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.businessId}
            disabled={w.isCurrent || !!switching}
            onSelect={() => {
              if (!w.isCurrent) switchTo(w);
            }}
            className={cn(w.isCurrent && "bg-accent/50")}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
              {w.businessLogo ? (
                <img src={resolveMediaUrl(w.businessLogo)} alt="" className="h-6 w-6 object-cover" />
              ) : (
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{w.businessName}</span>
              <span className="block text-[10px] text-muted-foreground">
                {w.role === "admin" ? "Admin" : w.role === "owner" ? "Owner" : "Member"} · {w.workspaceCode || w.businessId}
              </span>
            </span>
            {w.isCurrent && <Check className="h-4 w-4 shrink-0 text-primary" />}
            {switching === w.businessId && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
          </DropdownMenuItem>
        ))}
        {others.length === 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              You've been invited to other workspaces? Ask the admin to invite this same email.
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
