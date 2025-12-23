import React from "react";
import "./global.css";
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPasswordOtp from "./pages/ResetPasswordOtp";
import ResetPassword from "./pages/ResetPassword";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ element }: { element: JSX.Element }) {
  const token = localStorage.getItem("token");
  return token ? <>{element}</> : <Navigate to="/login" replace />;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password-otp" element={<ResetPasswordOtp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/dashboard"
            element={<ProtectedRoute element={<Dashboard />} />}
          />
          <Route
            path="/tasks"
            element={<ProtectedRoute element={<Tasks />} />}
          />
          <Route
            path="/ranking"
            element={<ProtectedRoute element={<Ranking />} />}
          />
          <Route
            path="/team"
            element={<ProtectedRoute element={<Team />} />}
          />
          <Route
            path="/activity-logs"
            element={<ProtectedRoute element={<ActivityLogs />} />}
          />
          <Route
            path="/backlog"
            element={<ProtectedRoute element={<Backlog />} />}
          />
          <Route
            path="/ideas"
            element={<ProtectedRoute element={<Ideas />} />}
          />
          <Route
            path="/subscription"
            element={<ProtectedRoute element={<Subscription />} />}
          />
          <Route
            path="/payment/callback"
            element={<ProtectedRoute element={<PaymentCallback />} />}
          />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
