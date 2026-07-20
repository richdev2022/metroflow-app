import React, { useState, useEffect } from "react";
import "./global.css";
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPasswordOtp from "./pages/ResetPasswordOtp";
import ResetPassword from "./pages/ResetPassword";
import Kyc from "./pages/Kyc";
import KycPrompt from "./pages/KycPrompt";
import KycBusiness from "./pages/KycBusiness";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Ranking from "./pages/Ranking";
import Team from "./pages/Team";
import ActivityLogs from "./pages/ActivityLogs";
import Backlog from "./pages/Backlog";
import Ideas from "./pages/Ideas";
import Subscription from "./pages/Subscription";
import PaymentCallback from "./pages/PaymentCallback";
import AcceptInvite from "./pages/AcceptInvite";
import Wallet from "./pages/Wallet";
import Payroll from "./pages/Payroll";
import TransferHistory from "./pages/TransferHistory";
import Settings from "./pages/Settings";
import Board from "./pages/Board";
import NotFound from "./pages/NotFound";
import Meetings from "./pages/Meetings";
import Chat from "./pages/Chat";
import Calls from "./pages/Calls";
import Recordings from "./pages/Recordings";
import JoinMeeting from "./pages/JoinMeeting";
import JoinCall from "./pages/JoinCall";
import { SessionTimeoutProvider } from "./components/SessionTimeoutProvider";
import { api } from "@/lib/api-client";
import { KycStatus } from "@shared/api";
import { normalizeKycStatus } from "@/lib/kyc-utils";

const queryClient = new QueryClient();

// First: basic token protected route
function TokenProtectedRoute({ element }: { element: JSX.Element }) {
  const token = localStorage.getItem("token");
  return token ? <>{element}</> : <Navigate to="/login" replace />;
}

// Second: full KYC-protected route (token + KYC verified)
function KycProtectedRoute({ element }: { element: JSX.Element }) {
  const [loading, setLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    const checkKyc = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get("/kyc/status");
        const status = normalizeKycStatus(response.data);
        setIsVerified(status.user_kyc_status === "verified");
      } catch (error) {
        console.error("KYC check failed:", error);
        setIsVerified(false);
      } finally {
        setLoading(false);
      }
    };
    checkKyc();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }
  return isVerified ? <>{element}</> : <Navigate to="/kyc" replace />;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionTimeoutProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password-otp" element={<ResetPasswordOtp />} />
            <Route path="/reset-password" element={<ResetPassword />} />
                            <Route path="/kyc" element={<TokenProtectedRoute element={<Kyc />} />} />
                            <Route path="/kyc/prompt" element={<TokenProtectedRoute element={<KycPrompt />} />} />
                            <Route path="/kyc/business" element={<TokenProtectedRoute element={<KycBusiness />} />} />
            <Route
              path="/dashboard"
              element={<TokenProtectedRoute element={<Dashboard />} />}
            />
            <Route
              path="/tasks"
              element={<TokenProtectedRoute element={<Tasks />} />}
            />
            <Route
              path="/ranking"
              element={<TokenProtectedRoute element={<Ranking />} />}
            />
            <Route
              path="/team"
              element={<TokenProtectedRoute element={<Team />} />}
            />
            <Route
              path="/activity-logs"
              element={<TokenProtectedRoute element={<ActivityLogs />} />}
            />
            <Route
              path="/backlog"
              element={<TokenProtectedRoute element={<Backlog />} />}
            />
            <Route
              path="/ideas"
              element={<TokenProtectedRoute element={<Ideas />} />}
            />
            <Route
              path="/subscription"
              element={<TokenProtectedRoute element={<Subscription />} />}
            />
            <Route
              path="/payment/callback"
              element={<TokenProtectedRoute element={<PaymentCallback />} />}
            />
            <Route
              path="/wallet"
              element={<KycProtectedRoute element={<Wallet />} />}
            />
            <Route
              path="/payroll"
              element={<KycProtectedRoute element={<Payroll />} />}
            />
            <Route
              path="/transfer-history"
              element={<KycProtectedRoute element={<TransferHistory />} />}
            />
            <Route
              path="/settings"
              element={<TokenProtectedRoute element={<Settings />} />}
            />
            <Route
              path="/board"
              element={<TokenProtectedRoute element={<Board />} />}
            />
            <Route
              path="/meetings"
              element={<TokenProtectedRoute element={<Meetings />} />}
            />
            <Route
              path="/meetings/:meetingCode"
              element={<TokenProtectedRoute element={<JoinMeeting />} />}
            />
            <Route
              path="/calls/:callCode"
              element={<TokenProtectedRoute element={<JoinCall />} />}
            />
            <Route
              path="/chat"
              element={<TokenProtectedRoute element={<Chat />} />}
            />
            <Route
              path="/calls"
              element={<TokenProtectedRoute element={<Calls />} />}
            />
            <Route
              path="/recordings"
              element={<TokenProtectedRoute element={<Recordings />} />}
            />
            <Route path="/accept-invite/:token" element={<AcceptInvite />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionTimeoutProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
