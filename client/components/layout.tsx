import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Users, ListTodo, LogOut, User, Moon, Sun, Activity, Target, Lightbulb, CreditCard, Wallet, Banknote, Loader2, Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { api } from "@/lib/api-client";
import { KycStatus } from "@shared/api";
import { normalizeKycStatus } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { KycModal } from "./KycModal";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  SidebarInset,
  SidebarSeparator,
} from "@/components/ui/sidebar";
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

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const userName = localStorage.getItem("userName") || "User";
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  
  const [showSubscriptionAlert, setShowSubscriptionAlert] = useState(false);
  const [alertType, setAlertType] = useState<'expired' | 'trial_ended'>('expired');

  // KYC State
  const [showKycModal, setShowKycModal] = useState(false);
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [kycCheckingPath, setKycCheckingPath] = useState<string | null>(null);

  const handleKycProtectedNavigation = async (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setKycCheckingPath(path);
    try {
      const response = await api.get('/kyc/status');
      const status = normalizeKycStatus(response.data);
      if (status.user_kyc_status === 'verified') {
        navigate(path);
      } else {
        setKycStatus(status);
        setShowKycModal(true);
      }
    } catch (error) {
       console.error("KYC check failed", error);
    } finally {
      setKycCheckingPath(null);
    }
  };

  useEffect(() => {
    const checkSubscription = async () => {
      // Skip check on subscription page or login
      if (location.pathname === '/subscription' || location.pathname === '/login') return;

      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const response = await api.get('/subscription/current');

        if (response.data.success) {
          const sub = response.data.subscription;
          const isTrial = sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date();
          const isPaid = sub.plan_price > 0 && sub.subscription_status === 'active';
          
          // Check if user is on Free plan (price 0) and trial has ended
          if (sub.plan_price === "0.00" || sub.plan_price === 0) {
             if (sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()) {
                setAlertType('trial_ended');
                setShowSubscriptionAlert(true);
             }
          }
          
          // Or if status is cancelled/expired for paid plans (though logic above covers plan_price > 0)
          // If status is not active and not trial
          if (sub.subscription_status !== 'active' && !isTrial && sub.plan_price > 0) {
              setAlertType('expired');
              setShowSubscriptionAlert(true);
          }
        }
      } catch (error) {
        console.error("Subscription check failed", error);
      }
    };

    checkSubscription();
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("businessId");
    localStorage.removeItem("userName");
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <SidebarProvider>
      <AlertDialog open={showSubscriptionAlert} onOpenChange={setShowSubscriptionAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Subscription Required</AlertDialogTitle>
            <AlertDialogDescription>
              {alertType === 'trial_ended' 
                ? "Your free trial has ended. Please subscribe to a plan to continue accessing features."
                : "Your subscription has expired. Please renew your subscription to continue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate('/subscription')}>
              View Plans
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {kycStatus && (
        <KycModal 
           open={showKycModal} 
           onOpenChange={setShowKycModal} 
           status={kycStatus}
           onSuccess={() => setShowKycModal(false)}
        />
      )}

      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
            <img src="/Assets/logo.png" alt="MetricFlow Logo" className="h-8 w-auto" />
            <span className="font-bold text-xl group-data-[collapsible=icon]:hidden truncate">MetricFlow</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/dashboard")} tooltip="Dashboard">
                <Link to="/dashboard">
                  <BarChart3 />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/tasks")} tooltip="Tasks">
                <Link to="/tasks">
                  <ListTodo />
                  <span>Tasks</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/backlog")} tooltip="Backlog">
                <Link to="/backlog">
                  <ListTodo className="opacity-70" /> 
                  <span>Backlog</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/ideas")} tooltip="Ideas">
                <Link to="/ideas">
                  <Lightbulb />
                  <span>Ideas</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/team")} tooltip="Team">
                <Link to="/team">
                  <Users />
                  <span>Team</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/ranking")} tooltip="Ranking">
                <Link to="/ranking">
                  <Target />
                  <span>Ranking</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/activity-logs")} tooltip="Activity Log">
                <Link to="/activity-logs">
                  <Activity />
                  <span>Activity Log</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/wallet")} tooltip="Wallet">
                <Link to="/wallet" onClick={(e) => handleKycProtectedNavigation(e, "/wallet")}>
                  {kycCheckingPath === "/wallet" ? <Loader2 className="animate-spin" /> : <Wallet />}
                  <span>Wallet</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/payroll")} tooltip="Payroll">
                <Link to="/payroll" onClick={(e) => handleKycProtectedNavigation(e, "/payroll")}>
                  {kycCheckingPath === "/payroll" ? <Loader2 className="animate-spin" /> : <Banknote />}
                  <span>Payroll</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/subscription")} tooltip="Subscription">
                <Link to="/subscription">
                  <CreditCard />
                  <span>Subscription</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings">
                <Link to="/settings">
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setTheme(theme === "dark" ? "light" : "dark")} tooltip="Toggle Theme">
                {theme === "dark" ? <Sun /> : <Moon />}
                <span>Toggle Theme</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarSeparator />
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={userName}>
                <User />
                <span>{userName}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} tooltip="Logout" className="text-destructive hover:text-destructive">
                <LogOut />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 flex-row">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-[1px] bg-border mx-2 hidden md:block" />
          {/* Breadcrumbs or Title could go here */}
        </header>
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 overflow-x-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
