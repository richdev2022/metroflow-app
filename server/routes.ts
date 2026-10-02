import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { Server as SocketIOServer } from "socket.io";
import type { CreateTaskStatusInput } from "../shared/api";
import {
  closePeer,
  connectWebRtcTransport,
  consume,
  createWebRtcTransport,
  getRoomProducers,
  getRouterRtpCapabilities,
  produce,
  resumeConsumer,
} from "./mediasoup-service";

const upload = multer({ storage: multer.memoryStorage() });

// Store active users
const activeUsers = new Map<string, { userId: string; businessId: string; socketId: string; userName?: string }>();
// Store active recordings (roomId -> { id, startTime, userId, businessId, meetingId, callId })
const activeRecordings = new Map<string, { id: string; startTime: number; userId: string; businessId: string; meetingId?: string; callId?: string }>();
// Store waiting room participants per room: roomId -> [{ userId, userName, requestedAt }]
const waitingRoomQueue = new Map<string, Array<{ userId: string; userName?: string; requestedAt: number }>>();
// Per-user per-conversation unread counts: `${userId}_${conversationId}` -> count
const unreadCounts = new Map<string, number>();

// --------- Duration & Room Manager (per FRONTEND_CALL_DURATION_GUIDE.md) ---------
interface SocketRoomParticipant {
  userId: string;
  userName?: string;
  isHost: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  joinedAt: string;
}
interface ManagedRoom {
  callId: string;               // UUID
  callCode: string;             // short code for display
  maxMeetingDuration: number | null; // plan limit in minutes
  endsAt: string | null;        // ISO when countdown will end (null until 2+ participants)
  startedAt: string | null;     // ISO when countdown began (just went from 1→2 participants)
  warned5: boolean;             // 5-min warning emitted
  warned1: boolean;             // 1-min warning emitted
  participants: Map<string, SocketRoomParticipant>; // socketId → participant (socket-level joined)
}
// roomId (socket room, matches UUID OR callCode) -> ManagedRoom
const roomManager = new Map<string, ManagedRoom>();
// Reverse maps: callId (UUID) → roomId, callCode → roomId
const callIdToRoomId = new Map<string, string>();
const callCodeToRoomId = new Map<string, string>();

const getRoomByAnyId = (roomIdOrCallIdOrCode: string): ManagedRoom | undefined => {
  const direct = roomManager.get(roomIdOrCallIdOrCode);
  if (direct) return direct;
  const viaCallId = callIdToRoomId.get(roomIdOrCallIdOrCode);
  if (viaCallId) return roomManager.get(viaCallId);
  const viaCode = callCodeToRoomId.get(roomIdOrCallIdOrCode);
  if (viaCode) return roomManager.get(viaCode);
  return undefined;
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Middleware to simulate auth (get userId from header or token)
  // For this demo, we'll assume a fixed userId if not provided or handle it in handlers
  const getUserId = (req: any) => {
    const headerUserId = req.headers["x-user-id"];
    if (typeof headerUserId === "string" && headerUserId.trim()) {
      return headerUserId.trim();
    }

    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer mock_token_")) {
      return authHeader.replace("Bearer mock_token_", "").trim();
    }

    return "user_123"; // Mock User ID
  };
  
  const getBusinessId = (req: any) => {
    const headerBusinessId = req.headers["x-business-id"];
    if (typeof headerBusinessId === "string" && headerBusinessId.trim()) {
      return headerBusinessId.trim();
    }

    return "biz_123"; // Mock Business ID
  };

  // --- Auth Routes ---
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { businessName, businessEmail, businessIndustry, adminName, adminEmail, password } = req.body;
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(adminEmail);
      if (existingUser) {
        return res.status(400).json({ success: false, message: "Email already registered" });
      }

      // Create Business
      const business = await storage.createBusiness({
        name: businessName,
        email: businessEmail,
        industry: businessIndustry
      });

      // Create Admin User
      const user = await storage.createUser({
        businessId: business.id,
        email: adminEmail,
        name: adminName,
        role: "admin",
        password: password
      });
      
      res.json({ success: true, message: "Registration successful. Please verify OTP." });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ success: false, message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await storage.validateUser(String(email || "").trim(), password);
      
      if (!user) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }
      
      res.json({ 
        success: true, 
        token: "mock_token_" + user.id,
        userId: user.id,
        businessId: user.businessId,
        message: "Login successful"
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ success: false, message: "Login failed" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    // Mock verification
    const { email, otp, otpCode } = req.body;
    const submittedOtp = otp ?? otpCode;
    if (submittedOtp === "123456") {
       const user = await storage.getUserByEmail(email);
       if (user) {
         res.json({ 
            success: true, 
            token: "mock_token_" + user.id,
            userId: user.id,
            businessId: user.businessId,
            message: "OTP verified" 
         });
       } else {
         res.status(400).json({ success: false, message: "User not found" });
       }
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  });

  app.post("/api/auth/resend-otp", async (_req, res) => {
    res.json({ success: true, message: "OTP sent successfully" });
  });

  // --- New Features Routes ---

  // 1. Business Profile Management
  app.get("/api/settings", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const settings = await storage.getBusinessProfile(businessId);
      res.json({ success: true, settings });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      await storage.updateBusinessProfile(businessId, req.body);
      res.json({ success: true, message: "Settings updated successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to update settings" });
    }
  });

  // 2. Contact Information Updates (OTP Verified)
  app.post("/api/settings/update-contact/request-otp", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { type, value } = req.body;
      await storage.requestContactUpdateOtp(userId, { type, value });
      res.json({ success: true, message: `OTP sent to ${value}` });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to request OTP" });
    }
  });

  app.post("/api/settings/update-contact/verify-otp", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { otp } = req.body;
      const success = await storage.verifyContactUpdateOtp(userId, otp);
      if (success) {
        res.json({ success: true, message: "Contact information updated successfully" });
      } else {
        res.status(400).json({ success: false, message: "Invalid OTP" });
      }
    } catch (err) {
      res.status(500).json({ success: false, message: "Verification failed" });
    }
  });

  // 3. Transaction OTP Preferences
  app.get("/api/settings/otp-preference", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const preference = await storage.getOtpPreference(businessId);
      res.json({ success: true, preference: preference.preference });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to fetch preference" });
    }
  });

  app.put("/api/settings/otp-preference", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      await storage.updateOtpPreference(businessId, req.body);
      res.json({ success: true, message: "OTP preference updated" });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to update preference" });
    }
  });

  // 4. Fee Transparency
  app.get("/api/fees", async (req, res) => {
    try {
      const fees = await storage.getFeeSchedule();
      res.json({ success: true, data: fees });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to fetch fees" });
    }
  });

  // 5. Transfer Authorization (OTP Required)
  app.post("/api/transfers/otp/request", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { wallet_id, otp_method } = req.body;
      const result = await storage.requestTransferOtp(userId, wallet_id, otp_method);
      res.json({ 
        success: true, 
        message: "OTP sent successfully", 
        fee_charged: result.fee_charged 
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Failed to request OTP" });
    }
  });

  // 6. OTP Enabled Status
  app.get("/api/settings/otp-enabled", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const result = await storage.getOtpEnabledStatus(businessId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to get OTP enabled status" });
    }
  });

  app.post("/api/settings/otp-enabled/send-otp", async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.sendOtpToggleOtp(userId);
      res.json({ success: true, message: "OTP sent successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to send OTP" });
    }
  });

  app.put("/api/settings/otp-enabled", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const { enabled, otp } = req.body;
      await storage.updateOtpEnabledStatus(businessId, enabled, otp);
      res.json({ success: true, message: enabled ? "OTP enabled successfully" : "OTP disabled successfully" });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || "Failed to update OTP status" });
    }
  });

  // 7. Transaction PIN
  app.post("/api/settings/pin", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { pin } = req.body;
      await storage.createPin(userId, pin);
      res.json({ success: true, message: "Transaction PIN created successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to create PIN" });
    }
  });

  app.post("/api/settings/pin/send-otp", async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.sendPinUpdateOtp(userId);
      res.json({ success: true, message: "OTP sent successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to send OTP" });
    }
  });

  app.put("/api/settings/pin", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { newPin, otp } = req.body;
      await storage.updatePin(userId, newPin, otp);
      res.json({ success: true, message: "Transaction PIN updated successfully" });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || "Failed to update PIN" });
    }
  });

  app.post("/api/transfers/single", async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.initiateSingleTransferWithOtp(userId, req.body);
      const transfers = await storage.getTransfers(userId);
      const newTransfer = transfers[transfers.length - 1];
      res.json({ 
        success: true, 
        message: "Transfer initiated successfully",
        data: newTransfer
      });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message || "Transfer failed" });
    }
  });

  // Overwrite existing bulk transfer route to include OTP check if provided, 
  // or add new logic. The prompt specifies POST /api/transfers/bulk with OTP.
  // The existing route was:
  // app.post("/api/transfers/bulk", async (req, res) => { ... });
  // We need to support the new payload which includes OTP.
  // Let's modify the existing route to handle OTP if present, or redirect to new logic.
  // Actually, since I can't easily conditionally replace the *existing* route block without knowing its exact content in full context easily 
  // (though I read it earlier), I will replace the previous definition of /api/transfers/bulk.

  // Let's find the previous definition and replace it.
  // It was around line 150.
  
  // --- KYC Routes ---

  app.post("/api/kyc/business", upload.single("proof_of_address"), async (req, res) => {
    try {
      const { country, state, city, street, house_number } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "Proof of address file is required" });
      }

      console.log("KYC Received:", { 
        country, state, city, street, house_number, 
        file: file.originalname, 
        size: file.size 
      });

      const kycId = await storage.submitBusinessKyc({
        country, state, city, street, house_number,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype
      });

      res.json({ 
        success: true, 
        message: "Business KYC submitted",
        kycId
      });
    } catch (err) {
      console.error("KYC Submission Error:", err);
      res.status(500).json({ message: "Failed to submit KYC" });
    }
  });
  
  app.post("/api/kyc/initiate", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { type, number, otp_method } = req.body;
      const otp = await storage.initiateKyc(userId, { type, number, otp_method });
      // In real world, SMS/Email/WhatsApp is sent. Here we return success message.
      res.json({ message: "OTP sent successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to initiate KYC" });
    }
  });

  app.post("/api/kyc/verify-otp", async (req, res) => {
    try {
      const userId = getUserId(req);
      const { otp } = req.body;
      const success = await storage.verifyKycOtp(userId, otp);
      if (success) {
        res.json({ message: "Verification successful", success: true });
      } else {
        res.status(400).json({ error: "Invalid OTP" });
      }
    } catch (err) {
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.get("/api/kyc/status", async (req, res) => {
    try {
      const userId = getUserId(req);
      const status = await storage.getKycStatus(userId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  // --- Wallet Routes ---

  app.get("/api/wallet", async (req, res) => {
    try {
      const userId = getUserId(req);
      const info = await storage.getWalletInfo(userId);
      res.json(info);
    } catch (err) {
      res.status(500).json({ error: "Failed to get wallet info" });
    }
  });

  app.post("/api/wallet/fund/card", async (req, res) => {
    try {
      const userId = getUserId(req);
      const result = await storage.fundWallet(userId, req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Funding failed" });
    }
  });

  app.get("/api/wallet/verify", async (req, res) => {
    const rawRedirectUrl = typeof req.query.redirect_url === "string" ? req.query.redirect_url : "";
    let reference =
      (typeof req.query.reference === "string" && req.query.reference) ||
      (typeof req.query.paymentReference === "string" && req.query.paymentReference) ||
      (typeof req.query.transaction_reference === "string" && req.query.transaction_reference) ||
      "";
    let redirectUrl = rawRedirectUrl;

    if (rawRedirectUrl) {
      try {
        const parsedRedirect = new URL(rawRedirectUrl);
        reference =
          reference ||
          parsedRedirect.searchParams.get("reference") ||
          parsedRedirect.searchParams.get("paymentReference") ||
          parsedRedirect.searchParams.get("transaction_reference") ||
          "";
        redirectUrl = parsedRedirect.toString();
      } catch {
        // Keep the original value and fall back to the default callback below.
      }
    }

    if (!reference) {
      res.status(400).send("Transaction reference is required");
      return;
    }

    try {
      const callbackUrl = new URL(redirectUrl || `${req.protocol}://${req.get("host")}/payment-callback`);
      callbackUrl.searchParams.set("reference", reference);
      callbackUrl.searchParams.delete("paymentReference");
      callbackUrl.searchParams.delete("transaction_reference");
      res.redirect(callbackUrl.toString());
    } catch {
      res.redirect(`/payment-callback?reference=${encodeURIComponent(reference)}`);
    }
  });

  app.post("/api/wallet/business/create", async (req, res) => {
    try {
      const userId = getUserId(req);
      const result = await storage.createBusinessWallet(userId, req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to create business wallet" });
    }
  });

  app.post("/api/wallet/create-virtual-account", async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.createVirtualAccount(userId);
      res.json({ message: "Virtual Account created successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to create virtual account" });
    }
  });

  // --- Payroll Routes ---

  app.get("/api/payroll/summary", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const summary = await storage.getPayrollSummary(businessId);
      // Map "payroll" to "data" as expected by the client
      res.json({
        success: summary.success,
        data: summary.payroll,
        pagination: summary.pagination
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get payroll summary" });
    }
  });

  app.get("/api/payroll/config", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const config = await storage.getPayrollConfig(businessId);
      res.json({ success: true, data: config });
    } catch (err) {
      res.status(500).json({ error: "Failed to get payroll config" });
    }
  });

  // Add /api/transfers/account-lookup endpoint (used by client)
  app.post("/api/transfers/account-lookup", async (req, res) => {
    try {
      const { bank_code, account_number } = req.body;
      const account = await storage.resolveAccount(bank_code, account_number);
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(500).json({ error: "Failed to resolve account" });
    }
  });

  app.put("/api/payroll/config", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const updated = await storage.updatePayrollConfig(businessId, req.body);
      res.json({ success: true, message: "Configuration updated", config: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update payroll config" });
    }
  });

  app.put("/api/payroll/user/:id", async (req, res) => {
    try {
      const updated = await storage.updatePayrollDetails(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update payroll" });
    }
  });

  app.get("/api/payroll/adjustments", async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const adjustments = await storage.getPayrollAdjustments(userId as string);
      res.json({ success: true, data: adjustments });
    } catch (err) {
      res.status(500).json({ error: "Failed to get adjustments" });
    }
  });

  app.post("/api/payroll/adjustments", async (req, res) => {
    try {
      const { userId, type, amount, reason } = req.body;
      const adjustment = await storage.addPayrollAdjustment(userId, type, amount, reason);
      res.json({ success: true, data: adjustment });
    } catch (err) {
      res.status(500).json({ error: "Failed to add adjustment" });
    }
  });

  app.delete("/api/payroll/adjustments/:id", async (req, res) => {
    try {
      await storage.deletePayrollAdjustment(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete adjustment" });
    }
  });

  app.post("/api/transfers/bulk", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (req.body.otp) {
        // New OTP based flow
        await storage.initiateBulkTransferWithOtp(userId, req.body);
        const transfers = await storage.getTransfers(userId);
        // Get the latest transfers (the ones we just added)
        const newTransfers = transfers.slice(-req.body.data.items.length);
        // Calculate totals
        const totalAmount = req.body.data.items.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
        const totalFee = 0; // Mock fee calculation
        
        res.json({ 
          success: true, 
          message: "Queued " + req.body.data.items.length + " transfers for processing",
          data: {
            queued: req.body.data.items.length,
            type: req.body.type,
            walletId: req.body.source_wallet_id,
            totals: {
              amount: totalAmount,
              fee: totalFee,
              total: totalAmount + totalFee
            },
            transfers: newTransfers
          }
        });
      } else {
        // Existing flow (fallback)
        await storage.initiateBulkTransfer(userId, req.body);
        res.json({ success: true, message: "Bulk transfer initiated" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to initiate transfer" });
    }
  });

  app.get("/api/transfers", async (req, res) => {
    try {
      const userId = getUserId(req);
      const transfers = await storage.getTransfers(userId);
      res.json({
        success: true,
        data: transfers,
        pagination: {
          total: transfers.length,
          page: 1,
          limit: 10
        }
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get transfers" });
    }
  });

  app.post("/api/transfers/:id/retry", async (req, res) => {
    try {
      await storage.retryTransfer(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Retry failed" });
    }
  });

  app.get("/api/transfers/banks", async (req, res) => {
    try {
      const banks = await storage.getBanks();
      res.json({ success: true, data: banks });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch banks" });
    }
  });

  app.post("/api/transfers/lookup", async (req, res) => {
    try {
      const { bankCode, accountNumber } = req.body;
      const account = await storage.resolveAccount(bankCode, accountNumber);
      res.json({ success: true, data: account });
    } catch (err) {
      res.status(500).json({ error: "Failed to resolve account" });
    }
  });

  // --- Subscription Route Mock (for layout check) ---
  app.get("/api/subscription/current", (req, res) => {
    res.json({ 
        success: true, 
        subscription: {
            plan_price: 0,
            subscription_status: 'active',
            trial_ends_at: new Date(Date.now() + 1000000000).toISOString()
        } 
    });
  });

  // --- Team Routes (Mock) ---
  app.get("/api/team", async (req, res) => {
    try {
      // Mock team members
      const members = [
        { id: "user_123", name: "Current User", role: "admin", email: "user@example.com", avatar: "" },
        { id: "emp1", name: "John Doe", role: "member", email: "john@example.com", avatar: "" },
        { id: "emp2", name: "Jane Smith", role: "member", email: "jane@example.com", avatar: "" }
      ];
      // Return just the array to match what the client likely expects if it's not wrapped
      // Or if the client expects { success: true, data: [] }, ensure the client handles it.
      // Looking at the error "Request failed with status code 500", it usually means server threw exception.
      // But the code above looks safe. 
      // Let's add logging to see what's happening.
      console.log("Fetching team members...");
      res.json(members);
    } catch (err) {
      console.error("Error fetching team:", err);
      res.status(500).json({ error: "Failed to get team members" });
    }
  });

  // --- Epics Routes ---
  app.get("/api/epics", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const epics = await storage.getEpics(businessId);
      res.json({ success: true, data: epics });
    } catch (err) {
      res.status(500).json({ error: "Failed to get epics" });
    }
  });

  app.get("/api/epics/:epicId/transfer-items", async (req, res) => {
    try {
      const items = await storage.getEpicTransferItems(req.params.epicId);
      res.json({ success: true, data: items });
    } catch (err) {
      res.status(500).json({ error: "Failed to get epic transfer items" });
    }
  });

  // --- Tasks Routes ---
  app.get("/api/tasks", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const tasks = await storage.getTasks(businessId);
      res.json({ success: true, data: { tasks } });
    } catch (err) {
       res.status(500).json({ error: "Failed to get tasks" });
    }
  });

  app.get("/api/task-statuses", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const statuses = await storage.getTaskStatuses(businessId);
      res.json({ success: true, data: statuses });
    } catch (err) {
      res.status(500).json({ error: "Failed to get task statuses" });
    }
  });

  app.post("/api/task-statuses", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const status = await storage.createTaskStatus(businessId, req.body as CreateTaskStatusInput);
      res.json({ success: true, data: status });
    } catch (err) {
      res.status(500).json({ error: "Failed to create task status" });
    }
  });

  app.put("/api/tasks/:taskId", async (req, res) => {
    try {
      const task = await storage.updateTask(req.params.taskId, req.body);
      if (task) {
        res.json({ success: true, data: task });
      } else {
        res.status(404).json({ success: false, error: "Task not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.put("/api/task-statuses/:id", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const status = await storage.updateTaskStatus(businessId, req.params.id, req.body);
      if (status) {
        res.json({ success: true, data: status });
      } else {
        res.status(404).json({ success: false, error: "Task status not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to update task status" });
    }
  });

  app.delete("/api/task-statuses/:id", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const deleted = await storage.deleteTaskStatus(businessId, req.params.id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: "Cannot delete default status or status not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to delete task status" });
    }
  });

  app.put("/api/task-statuses/reorder", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const { statusIds } = req.body;
      const statuses = await storage.reorderTaskStatuses(businessId, statusIds);
      res.json({ success: true, data: statuses });
    } catch (err) {
      res.status(500).json({ error: "Failed to reorder task statuses" });
    }
  });

  // --- Meetings Routes ---
  app.get("/api/meetings", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const { meetings, total } = await storage.getMeetings(businessId, page, limit);
      res.json({ success: true, data: { meetings, total } });
    } catch (err) {
      res.status(500).json({ error: "Failed to get meetings" });
    }
  });

  app.get("/api/meetings/code/:code", async (req, res) => {
    try {
      const meeting = await storage.getMeetingByCode(req.params.code);
      if (meeting) {
        res.json({ success: true, data: meeting });
      } else {
        res.status(404).json({ success: false, error: "Meeting not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to get meeting" });
    }
  });

  app.get("/api/meetings/:id", async (req, res) => {
    try {
      const meeting = await storage.getMeeting(req.params.id);
      if (meeting) {
        res.json({ success: true, data: meeting });
      } else {
        res.status(404).json({ success: false, error: "Meeting not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to get meeting" });
    }
  });

  app.get("/api/meetings/code/:code", async (req, res) => {
    try {
      const meeting = await storage.getMeetingByCode(req.params.code);
      if (meeting) {
        res.json({ success: true, data: meeting });
      } else {
        res.status(404).json({ success: false, error: "Meeting not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to get meeting" });
    }
  });

  app.post("/api/meetings", async (req, res) => {
    try {
      const userId = getUserId(req);
      const businessId = getBusinessId(req);
      const meeting = await storage.createMeeting(userId, businessId, req.body);
      
      // Emit real-time event
      const io = (global as any).io;
      if (io) {
        io.to(businessId).emit('meeting:created', meeting);
      }
      
      res.json({ success: true, data: meeting });
    } catch (err) {
      res.status(500).json({ error: "Failed to create meeting" });
    }
  });

  app.put("/api/meetings/:id", async (req, res) => {
    try {
      const meeting = await storage.updateMeeting(req.params.id, req.body);
      if (meeting) {
        // Emit real-time event
        const io = (global as any).io;
        const businessId = getBusinessId(req);
        if (io) {
          io.to(businessId).emit('meeting:updated', meeting);
        }
        
        res.json({ success: true, data: meeting });
      } else {
        res.status(404).json({ success: false, error: "Meeting not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to update meeting" });
    }
  });

  app.delete("/api/meetings/:id", async (req, res) => {
    try {
      const success = await storage.deleteMeeting(req.params.id);
      if (success) {
        // Emit real-time event
        const io = (global as any).io;
        const businessId = getBusinessId(req);
        if (io) {
          io.to(businessId).emit('meeting:deleted', req.params.id);
        }
        
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: "Meeting not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to delete meeting" });
    }
  });

  // --- Chat Routes ---
  app.get("/api/chat/conversations", async (req, res) => {
    try {
      const userId = getUserId(req);
      const conversations = await storage.getConversations(userId);
      res.json({ success: true, data: conversations });
    } catch (err) {
      res.status(500).json({ error: "Failed to get conversations" });
    }
  });

  app.post("/api/chat/conversations", async (req, res) => {
    try {
      const userId = getUserId(req);
      const businessId = getBusinessId(req);
      const conversation = await storage.createConversation(userId, businessId, req.body);
      
      // Emit real-time event
      const io = (global as any).io;
      if (io) {
        io.to(businessId).emit('conversation:created', conversation);
      }
      
      res.json({ success: true, data: conversation });
    } catch (err) {
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.get("/api/chat/conversations/:id/messages", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const { messages, total } = await storage.getMessages(req.params.id, page, limit);
      res.json({ success: true, data: { messages, total } });
    } catch (err) {
      res.status(500).json({ error: "Failed to get messages" });
    }
  });

  app.post("/api/chat/conversations/:id/messages", async (req, res) => {
    try {
      const userId = getUserId(req);
      const message = await storage.sendMessage(userId, req.params.id, req.body);
      
      // Emit real-time event
      const io = (global as any).io;
      if (io) {
        const conv = await storage.getConversation(req.params.id);
        if (conv) {
          const otherParticipants = conv.participants.filter(p => p.userId !== userId);
          otherParticipants.forEach(p => {
            const targetUser = activeUsers.get(p.userId);
            if (targetUser) {
              io.to(targetUser.socketId).emit('chat:new-message-notification', {
                conversationId: req.params.id,
                message,
              });
            }
          });
        }
        io.to(`conversation-${req.params.id}`).emit('message:created', message);
        io.to(`conversation-${req.params.id}`).emit('chat:message', message);
      }
      
      res.json({ success: true, data: message });
    } catch (err) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/chat/conversations/:id/read", async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.markConversationRead(userId, req.params.id);
      const io = (global as any).io;
      if (io) {
        io.emit('chat:read-updated', { conversationId: req.params.id, userId });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // --- Calls Routes ---
  app.get("/api/calls", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const { calls, total } = await storage.getCalls(businessId, page, limit);
      res.json({ success: true, data: { calls, total } });
    } catch (err) {
      res.status(500).json({ error: "Failed to get calls" });
    }
  });

  app.get("/api/calls/code/:code", async (req, res) => {
    try {
      const call = await storage.getCallByCode(req.params.code);
      if (call) {
        res.json({ success: true, data: call });
      } else {
        res.status(404).json({ success: false, error: "Call not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to get call" });
    }
  });

  app.get("/api/calls/:id", async (req, res) => {
    try {
      const call = await storage.getCall(req.params.id);
      if (call) {
        res.json({ success: true, data: call });
      } else {
        res.status(404).json({ success: false, error: "Call not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to get call" });
    }
  });

  app.post("/api/calls", async (req, res) => {
    try {
      const userId = getUserId(req);
      const businessId = getBusinessId(req);
      const call = await storage.createCall(userId, businessId, req.body);
      
      // Emit real-time event
      const io = (global as any).io;
      if (io) {
        io.to(businessId).emit('call:created', call);
      }
      
      res.json({ success: true, data: call });
    } catch (err) {
      res.status(500).json({ error: "Failed to create call" });
    }
  });

  app.put("/api/calls/:id", async (req, res) => {
    try {
      const call = await storage.updateCall(req.params.id, req.body);
      if (call) {
        // Emit real-time event
        const io = (global as any).io;
        const businessId = getBusinessId(req);
        if (io) {
          io.to(businessId).emit('call:updated', call);
        }
        
        res.json({ success: true, data: call });
      } else {
        res.status(404).json({ success: false, error: "Call not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to update call" });
    }
  });

  app.get("/api/meetings/code/:code", async (req, res) => {
    try {
      const meeting = await storage.getMeetingByCode(req.params.code);
      if (meeting) {
        res.json({ success: true, data: meeting });
      } else {
        res.status(404).json({ success: false, error: "Meeting not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to get meeting" });
    }
  });

  app.get("/api/calls/code/:code", async (req, res) => {
    try {
      const call = await storage.getCallByCode(req.params.code);
      if (call) {
        res.json({ success: true, data: call });
      } else {
        res.status(404).json({ success: false, error: "Call not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to get call" });
    }
  });

  app.delete("/api/calls/:id", async (req, res) => {
    try {
      const success = await storage.deleteCall(req.params.id);
      if (success) {
        // Emit real-time event
        const io = (global as any).io;
        const businessId = getBusinessId(req);
        if (io) {
          io.to(businessId).emit('call:deleted', req.params.id);
        }
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: "Call not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to delete call" });
    }
  });

  app.post("/api/calls/:id/participants", async (req, res) => {
    try {
      const { participantIds = [] } = req.body;
      if (!Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ success: false, error: "participantIds is required" });
      }

      const call = await storage.addCallParticipants(req.params.id, participantIds);
      if (!call) {
        return res.status(404).json({ success: false, error: "Call not found" });
      }

      const io = (global as any).io;
      const businessId = getBusinessId(req);
      if (io) {
        io.to(businessId).emit('call:updated', call);
        for (const targetUserId of participantIds) {
          const activeUser = activeUsers.get(targetUserId);
          if (activeUser) {
            io.to(activeUser.socketId).emit('call:incoming', {
              callId: call.id,
              from: call.hostId,
              type: call.type,
              callCode: call.callCode,
            });
          }
        }
      }

      res.json({ 
        success: true, 
        message: `${participantIds.length} participant(s) added`,
        data: { added: participantIds }
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to add call participants" });
    }
  });

  app.post("/api/meetings/:id/participants", async (req, res) => {
    try {
      const { participantIds = [] } = req.body;
      if (!Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ success: false, error: "participantIds is required" });
      }

      const meeting = await storage.addMeetingParticipants(req.params.id, participantIds);
      if (!meeting) {
        return res.status(404).json({ success: false, error: "Meeting not found" });
      }

      const io = (global as any).io;
      const businessId = getBusinessId(req);
      if (io) {
        io.to(businessId).emit('meeting:updated', meeting);
      }

      res.json({ 
        success: true, 
        message: `${participantIds.length} participant(s) added`,
        data: { added: participantIds }
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to add meeting participants" });
    }
  });

  // --- Recordings Endpoints ---
  app.get("/api/recordings", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const { recordings, total } = await storage.getRecordings(businessId, page, limit);
      res.json({ success: true, data: { recordings, total } });
    } catch (err) {
      res.status(500).json({ error: "Failed to get recordings" });
    }
  });

  app.post("/api/recordings", async (req, res) => {
    try {
      const userId = getUserId(req);
      const businessId = getBusinessId(req);
      const recording = await storage.createRecording(userId, businessId, req.body);
      
      const io = (global as any).io;
      if (io) {
        io.to(businessId).emit('recording:started', recording);
      }
      
      res.json({ success: true, data: recording });
    } catch (err) {
      res.status(500).json({ error: "Failed to create recording" });
    }
  });

  app.put("/api/recordings/:id", async (req, res) => {
    try {
      const recording = await storage.updateRecording(req.params.id, req.body);
      if (recording) {
        const io = (global as any).io;
        const businessId = getBusinessId(req);
        if (io) {
          if (recording.status === 'paused') {
            io.to(businessId).emit('recording:paused', recording);
          } else if (recording.status === 'completed') {
            io.to(businessId).emit('recording:stopped', recording);
          }
        }
        
        res.json({ success: true, data: recording });
      } else {
        res.status(404).json({ success: false, error: "Recording not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to update recording" });
    }
  });

  app.delete("/api/recordings/:id", async (req, res) => {
    try {
      const success = await storage.deleteRecording(req.params.id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: "Recording not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to delete recording" });
    }
  });

  // --- Update join call to accept password ---
  app.post("/api/calls/:id/join", async (req, res) => {
    try {
      const userId = getUserId(req);
      const existingCall = await storage.getCall(req.params.id);
      if (!existingCall) {
        return res.status(404).json({ success: false, error: "Call not found" });
      }

      const isHost = existingCall.hostId === userId || existingCall.createdById === userId;
      if (existingCall.password && !isHost) {
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        if (!password) {
          return res.status(403).json({
            success: false,
            error: "Password required",
            code: "PASSWORD_REQUIRED",
          });
        }

        const passwordIsValid = await storage.verifyCallPassword(req.params.id, password);
        if (!passwordIsValid) {
          return res.status(403).json({
            success: false,
            error: "Invalid password",
            code: "INVALID_PASSWORD",
          });
        }
      }

      const call = await storage.joinCall(userId, req.params.id);
      if (call) {
        // Emit real-time event
        const io = (global as any).io;
        const businessId = getBusinessId(req);
        if (io) {
          io.to(businessId).emit('call:participantJoined', { callId: req.params.id, userId });
        }
        
        res.json({ success: true, data: call });
      } else {
        res.status(404).json({ success: false, error: "Call not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to join call" });
    }
  });

  app.post("/api/calls/:id/leave", async (req, res) => {
    try {
      const userId = getUserId(req);
      const call = await storage.leaveCall(userId, req.params.id);
      if (call) {
        // Emit real-time event
        const io = (global as any).io;
        const businessId = getBusinessId(req);
        if (io) {
          io.to(businessId).emit('call:participantLeft', { callId: req.params.id, userId });
        }
        
        res.json({ success: true, data: call });
      } else {
        res.status(404).json({ success: false, error: "Call not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to leave call" });
    }
  });

  const httpServer = createServer(app);

  // Set up Socket.io
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    path: '/socket.io'
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Handle user going online
    socket.on('user-online', (userId: string, businessId: string, userName?: string) => {
      activeUsers.set(userId, { userId, businessId, socketId: socket.id, userName });
      
      // Notify all users in the same business that this user is online
      const usersInBusiness = Array.from(activeUsers.values()).filter(u => u.businessId === businessId);
      const onlineUserIds = usersInBusiness.map(u => u.userId);
      
      // Emit presence update
      io.to(businessId).emit('user-presence-updated', { userId, status: 'online' });
      
      // Join the business room
      socket.join(businessId);
      
      console.log(`User ${userId} (${userName || 'N/A'}) online in business ${businessId}`);
    });

    // Handle user keep-alive
    socket.on('user-keep-alive', (userId: string, businessId: string) => {
      if (!activeUsers.has(userId)) {
        activeUsers.set(userId, { userId, businessId, socketId: socket.id });
        socket.join(businessId);
      }
    });

    // Handle user presence status update
    socket.on('user-presence', (status: string) => {
      for (const [userId, user] of activeUsers.entries()) {
        if (user.socketId === socket.id) {
          io.to(user.businessId).emit('user-presence-updated', { userId, status });
          break;
        }
      }
    });

    // --- Call Events ---
    socket.on('call:invite', ({ callId, targetUserId, type, callerName, roomId }) => {
      const caller = Array.from(activeUsers.values()).find(user => user.socketId === socket.id);
      const callerNameResolved = callerName || caller?.userName || '';
      // Find target user and send invite
      for (const [userId, user] of activeUsers.entries()) {
        if (userId === targetUserId) {
          io.to(user.socketId).emit('call:incoming', {
            callId,
            from: caller?.userId || '',
            fromName: callerNameResolved,
            callerName: callerNameResolved,
            type,
            callCode: callId,
            roomId: roomId || callId,
          });
          break;
        }
      }
    });

    // --- Duration-aware call:join (per FRONTEND_CALL_DURATION_GUIDE.md §3.1, §3.2, §4, §8) ---
    socket.on('call:join', async (payload: any, ackCb?: (resp: any) => void) => {
      const roomIdRaw: string = payload?.roomId || payload || '';
      const userId: string = payload?.userId || '';
      const userName: string = payload?.userName || '';
      const isHost: boolean = Boolean(payload?.isHost);
      const audioEnabled: boolean = payload?.audioEnabled !== false;
      const videoEnabled: boolean = payload?.videoEnabled !== false;
      const roomId = String(roomIdRaw);
      if (!roomId || !userId) {
        ackCb?.({ error: 'Missing roomId or userId', participantsList: [], endsAt: null, maxMeetingDuration: null });
        return;
      }
      socket.join(roomId);

      // Resolve call from storage by UUID (roomId === UUID) OR by callCode
      let call = await storage.getCall(roomId);
      if (!call) {
        call = await storage.getCallByCode(roomId);
      }
      if (!call) {
        // Call doesn't exist in DB yet — rare but defensively still allow socket room to function with default 60min
        const existingRoom = getRoomByAnyId(roomId);
        if (!existingRoom) {
          const fresh: ManagedRoom = {
            callId: roomId,
            callCode: roomId,
            maxMeetingDuration: 60,
            endsAt: null,
            startedAt: null,
            warned5: false,
            warned1: false,
            participants: new Map(),
          };
          roomManager.set(roomId, fresh);
          callIdToRoomId.set(roomId, roomId);
          callCodeToRoomId.set(roomId, roomId);
        }
      } else {
        // Ensure ManagedRoom exists, keyed by call.id (UUID) for consistency
        const managedKey = call.id; // UUID room key is the canonical one
        if (!roomManager.has(managedKey)) {
          const fresh: ManagedRoom = {
            callId: call.id,
            callCode: call.callCode,
            maxMeetingDuration: (call as any).maxMeetingDuration ?? null,
            endsAt: (call as any).endsAt ?? null,
            startedAt: null,
            warned5: false,
            warned1: false,
            participants: new Map(),
          };
          roomManager.set(managedKey, fresh);
          callIdToRoomId.set(call.id, managedKey);
          callCodeToRoomId.set(call.callCode, managedKey);
        }
        // If socket joined by callCode, also join the canonical UUID room so broadcasts work
        if (roomId === call.callCode && roomId !== call.id) {
          socket.join(call.id);
        }
      }

      const managedKeyFinal = call ? call.id : roomId;
      const room = roomManager.get(managedKeyFinal)!;
      if (!room) {
        ackCb?.({ error: 'Room init failed' });
        return;
      }

      // Check if this socket's user is already present via another socket (multi-tab)
      // → don't double count unique users for the "2+ participants" rule.
      const prevUniqueJoinerIds = new Set(Array.from(room.participants.values()).map(p => p.userId));
      const wasAlready = prevUniqueJoinerIds.has(userId);

      // Register (or update) this socket in the room
      room.participants.set(socket.id, {
        userId,
        userName,
        isHost,
        audioEnabled,
        videoEnabled,
        screenSharing: false,
        joinedAt: new Date().toISOString(),
      });

      // Count unique users present (distinct userId across all sockets in room)
      const uniqueJoinedIds = new Set(Array.from(room.participants.values()).map(p => p.userId));
      const uniqueCount = uniqueJoinedIds.size;

      const maxMeetingDuration = room.maxMeetingDuration;
      const justTransitionedFrom1to2 = !wasAlready && uniqueCount === 2 && room.endsAt == null;

      // Transition: countdown START (primary duration trigger per guide §3.2)
      if (justTransitionedFrom1to2 && maxMeetingDuration) {
        const startsAtIso = new Date().toISOString();
        const endsAtIso = new Date(Date.now() + maxMeetingDuration * 60_000).toISOString();
        room.endsAt = endsAtIso;
        room.startedAt = startsAtIso;
        room.warned5 = false;
        room.warned1 = false;
        // Persist to DB for REST response consistency
        if (call) {
          try { await storage.updateCall(call.id, { status: 'ongoing' }); } catch {}
        }
        // Broadcast to everyone (including host who just was joined by 2nd participant)
        const startedPayload = {
          endsAt: endsAtIso,
          startedAt: startsAtIso,
          maxMeetingDuration: room.maxMeetingDuration,
          callId: room.callId,
        };
        io.to(managedKeyFinal).emit('call:duration-started', startedPayload);
        // Also emit to callCode joiners if different
        if (call?.callCode && call.callCode !== managedKeyFinal) {
          io.to(call.callCode).emit('call:duration-started', startedPayload);
        }
      }

      // Build participants-list for socket ack + broadcast update
      const participantsBroadcastList = Array.from(room.participants.values()).map(p => ({
        id: p.userId,
        userId: p.userId,
        name: p.userName,
        userName: p.userName,
        isHost: p.isHost,
        audioEnabled: p.audioEnabled,
        videoEnabled: p.videoEnabled,
        screenSharing: p.screenSharing,
        joinedAt: p.joinedAt,
      }));

      // Ack to joining socket with authoritative state
      const ack = {
        participantsList: participantsBroadcastList,
        participants: participantsBroadcastList,
        endsAt: room.endsAt,
        maxMeetingDuration: room.maxMeetingDuration,
        callId: room.callId,
        callCode: room.callCode,
      };
      ackCb?.(ack);
      socket.emit('call:participants-list', ack);

      // If countdown already running (we are a late joiner): emit duration-active too (guide §3.2)
      if (room.endsAt != null && !justTransitionedFrom1to2) {
        socket.emit('call:duration-active', {
          endsAt: room.endsAt,
          maxMeetingDuration: room.maxMeetingDuration,
          remainingMs: Math.max(0, new Date(room.endsAt).getTime() - Date.now()),
        });
      }

      // Waiting state (≤1 unique participants, not running)
      if (uniqueCount <= 1 && room.endsAt == null) {
        socket.emit('call:waiting-for-participants', {
          message: 'Waiting for more participants. Timer will start when 2+ people join the call.',
          maxMeetingDuration: room.maxMeetingDuration,
        });
      }

      // Tell others in the room: "a participant joined" and re-send updated participants-list to all
      if (!wasAlready) {
        socket.to(managedKeyFinal).emit('call:participant-joined', {
          userId,
          userName,
          isHost,
        });
        if (call?.callCode && call.callCode !== managedKeyFinal) {
          socket.to(call.callCode).emit('call:participant-joined', {
            userId,
            userName,
            isHost,
          });
        }
        // Broadcast updated participants-list so all clients' countdown/waiting state syncs
        const broadcastAck = {
          participantsList: participantsBroadcastList,
          participants: participantsBroadcastList,
          endsAt: room.endsAt,
          maxMeetingDuration: room.maxMeetingDuration,
        };
        socket.to(managedKeyFinal).emit('call:participants-list', broadcastAck);
        if (call?.callCode && call.callCode !== managedKeyFinal) {
          socket.to(call.callCode).emit('call:participants-list', broadcastAck);
        }
      }
    });

    // Explicit leave (vs disconnect) — duration keeps running per guide §9.1
    socket.on('call:leave', ({ roomId, userId, userName }: any) => {
      if (!roomId) return;
      const room = getRoomByAnyId(roomId);
      socket.leave(roomId);
      if (room) {
        room.participants.delete(socket.id);
        const broadcast = { userId, userName };
        socket.to(room.callId).emit('call:participant-left', broadcast);
        if (room.callCode && room.callCode !== room.callId) socket.to(room.callCode).emit('call:participant-left', broadcast);
        if (room.participants.size === 0) {
          roomManager.delete(room.callId);
          callIdToRoomId.delete(room.callId);
          callCodeToRoomId.delete(room.callCode);
        }
      }
    });

    // call:get-participants — ack with the authoritative list + duration state
    socket.on('call:get-participants', ({ roomId }: any, ackCb?: (resp: any) => void) => {
      if (!roomId) { ackCb?.({ participants: [], endsAt: null, maxMeetingDuration: null }); return; }
      const room = getRoomByAnyId(roomId);
      if (!room) { ackCb?.({ participants: [], endsAt: null, maxMeetingDuration: null }); return; }
      const participantsBroadcastList = Array.from(room.participants.values()).map(p => ({
        id: p.userId,
        userId: p.userId,
        name: p.userName,
        userName: p.userName,
        isHost: p.isHost,
        audioEnabled: p.audioEnabled,
        videoEnabled: p.videoEnabled,
        screenSharing: p.screenSharing,
        joinedAt: p.joinedAt,
      }));
      ackCb?.({
        participantsList: participantsBroadcastList,
        participants: participantsBroadcastList,
        endsAt: room.endsAt,
        maxMeetingDuration: room.maxMeetingDuration,
        callId: room.callId,
        callCode: room.callCode,
      });
    });

    socket.on('call:accept', ({ callId }) => {
      io.emit('call:accepted', { callId });
    });

    socket.on('call:reject', ({ callId }) => {
      io.emit('call:rejected', { callId });
    });

    // --- Waiting Room Events ---
    socket.on('waiting-room:request', ({ roomId, userId, userName }) => {
      const queue = waitingRoomQueue.get(roomId) || [];
      if (!queue.find(p => p.userId === userId)) {
        queue.push({ userId, userName, requestedAt: Date.now() });
        waitingRoomQueue.set(roomId, queue);
      }
      const activeUser = Array.from(activeUsers.values()).find(u => u.socketId === socket.id);
      const businessId = activeUser?.businessId || '';
      // Notify host(s) in room or business about waiting participant
      io.to(businessId).emit('waiting-room:pending', {
        roomId,
        userId,
        userName: userName || activeUser?.userName,
      });
      // Also emit directly to room for host UI
      socket.to(roomId).emit('waiting-room:pending', {
        roomId,
        userId,
        userName: userName || activeUser?.userName,
      });
      // Send queue to requester
      const queueList = waitingRoomQueue.get(roomId) || [];
      socket.emit('waiting-room:queue', { roomId, queue: queueList });
    });

    socket.on('waiting-room:admit', ({ meetingId, participantId, roomId }) => {
      const room = roomId || meetingId;
      const queue = waitingRoomQueue.get(room) || [];
      const remaining = queue.filter(p => p.userId !== participantId);
      waitingRoomQueue.set(room, remaining);

      // Find participant socket and emit admitted
      const target = activeUsers.get(participantId);
      if (target) {
        io.to(target.socketId).emit('waiting-room:admitted', { roomId: room });
      }

      const activeUser = Array.from(activeUsers.values()).find(u => u.socketId === socket.id);
      socket.to(room).emit('waiting-room:admitted', {
        roomId: room,
        userId: participantId,
        admittedBy: activeUser?.userId,
      });
      io.to(socket.id).emit('waiting-room:queue', { roomId: room, queue: remaining });
    });

    socket.on('waiting-room:deny', ({ meetingId, participantId, roomId }) => {
      const room = roomId || meetingId;
      const queue = waitingRoomQueue.get(room) || [];
      const remaining = queue.filter(p => p.userId !== participantId);
      waitingRoomQueue.set(room, remaining);

      const target = activeUsers.get(participantId);
      if (target) {
        io.to(target.socketId).emit('waiting-room:denied', { roomId: room });
      }
      io.to(socket.id).emit('waiting-room:queue', { roomId: room, queue: remaining });
    });

    socket.on('waiting-room:admit-all', ({ roomId, meetingId }) => {
      const room = roomId || meetingId;
      const queue = waitingRoomQueue.get(room) || [];
      queue.forEach(p => {
        const target = activeUsers.get(p.userId);
        if (target) io.to(target.socketId).emit('waiting-room:admitted', { roomId: room });
      });
      waitingRoomQueue.set(room, []);
      io.to(socket.id).emit('waiting-room:queue', { roomId: room, queue: [] });
    });

    socket.on('waiting-room:get-queue', ({ roomId }) => {
      const queue = waitingRoomQueue.get(roomId) || [];
      io.to(socket.id).emit('waiting-room:queue', { roomId, queue });
    });

    // --- Chat Read Events ---
    socket.on('chat:mark-read', ({ conversationId, userId }) => {
      const key = `${userId}_${conversationId}`;
      unreadCounts.set(key, 0);
      socket.join(`conversation-${conversationId}`);
      socket.to(`conversation-${conversationId}`).emit('chat:read-updated', { conversationId, userId, unreadCount: 0 });
    });

    socket.on('join-conversation', (conversationId: string) => {
      socket.join(`conversation-${conversationId}`);
    });

    socket.on('call:end', ({ callId, roomId }: any) => {
      const room = getRoomByAnyId(roomId || callId);
      const endedPayload = {
        callId: (room?.callId || callId),
        reason: 'ended_by_host',
      };
      if (room) {
        io.to(room.callId).emit('call:ended', endedPayload);
        if (room.callCode && room.callCode !== room.callId) io.to(room.callCode).emit('call:ended', endedPayload);
        // Clean up room
        roomManager.delete(room.callId);
        callIdToRoomId.delete(room.callId);
        callCodeToRoomId.delete(room.callCode);
      } else {
        io.emit('call:ended', endedPayload);
      }
      // Update DB status
      (async () => {
        try {
          if (callId) await storage.updateCall(callId, { status: 'completed' });
        } catch (e) {
        }
      })();
    });

    socket.on('call:audio-level', ({ roomId, isTalking, userName }) => {
      const activeUser = Array.from(activeUsers.values()).find(user => user.socketId === socket.id);
      socket.to(roomId).emit('call:audio-level', {
        userId: activeUser?.userId || socket.id,
        userName,
        isTalking: Boolean(isTalking),
      });
    });

    socket.on('call:media-state', ({ roomId, audioEnabled, videoEnabled, screenSharing }) => {
      const activeUser = Array.from(activeUsers.values()).find(user => user.socketId === socket.id);
      // Keep roomManager participant records in sync so participants-list broadcasts are accurate
      const room = getRoomByAnyId(roomId);
      if (room && room.participants.has(socket.id)) {
        const prior = room.participants.get(socket.id)!;
        room.participants.set(socket.id, {
          ...prior,
          audioEnabled: audioEnabled ?? prior.audioEnabled,
          videoEnabled: videoEnabled ?? prior.videoEnabled,
          screenSharing: screenSharing ?? prior.screenSharing,
        });
      }
      socket.to(roomId).emit('call:media-state', {
        userId: activeUser?.userId || socket.id,
        audioEnabled,
        videoEnabled,
        screenSharing,
      });
    });

    // call:participant-media-state — keep participant-level badges accurate in room manager
    socket.on('call:participant-media-state', ({ roomId, userId, audioEnabled, videoEnabled, screenSharing, isTalking }: any) => {
      const room = getRoomByAnyId(roomId);
      if (room) {
        for (const [sockId, p] of room.participants.entries()) {
          if (p.userId === userId) {
            room.participants.set(sockId, {
              ...p,
              audioEnabled: audioEnabled ?? p.audioEnabled,
              videoEnabled: videoEnabled ?? p.videoEnabled,
              screenSharing: screenSharing ?? p.screenSharing,
            });
          }
        }
      }
      socket.to(roomId).emit('call:participant-media-state', { userId, audioEnabled, videoEnabled, screenSharing, isTalking });
    });

    // --- Meeting Events ---
    socket.on('meeting:join', ({ meetingId }) => {
      socket.join(meetingId);
      socket.join(`meeting-${meetingId}`);
      for (const [userId, user] of activeUsers.entries()) {
        if (user.socketId === socket.id) {
          io.to(user.businessId).emit('meeting:participantJoined', { meetingId, userId });
          break;
        }
      }
    });

    socket.on('meeting:leave', ({ meetingId }) => {
      socket.leave(meetingId);
      socket.leave(`meeting-${meetingId}`);
      for (const [userId, user] of activeUsers.entries()) {
        if (user.socketId === socket.id) {
          io.to(user.businessId).emit('meeting:participantLeft', { meetingId, userId });
          break;
        }
      }
    });

    socket.on('meeting:end', ({ meetingId }) => {
      io.emit('meeting:ended', { meetingId });
    });

    // --- WebRTC Signaling (Mediasoup) ---
    socket.on('mediasoup:getRouterRtpCapabilities', async (payload = {}, callback) => {
      const responseCallback = typeof payload === "function" ? payload : callback;
      const roomId = typeof payload === "function" ? socket.id : payload?.roomId;

      try {
        const rtpCapabilities = await getRouterRtpCapabilities(roomId || socket.id);
        responseCallback?.({ rtpCapabilities, routerRtpCapabilities: rtpCapabilities });
      } catch (error: any) {
        responseCallback?.({ error: error.message || "Failed to get router RTP capabilities" });
      }
    });

    socket.on('mediasoup:createWebRtcTransport', async ({ roomId }, callback) => {
      try {
        const activeUser = Array.from(activeUsers.values()).find(user => user.socketId === socket.id);
        const transport = await createWebRtcTransport(roomId, {
          socketId: socket.id,
          userId: activeUser?.userId,
        });
        callback(transport);
      } catch (error: any) {
        callback({ error: error.message || "Failed to create WebRTC transport" });
      }
    });

    socket.on('mediasoup:connectWebRtcTransport', async ({ transportId, dtlsParameters, roomId }, callback) => {
      try {
        await connectWebRtcTransport(roomId, transportId, dtlsParameters);
        callback();
      } catch (error: any) {
        callback({ error: error.message || "Failed to connect WebRTC transport" });
      }
    });

    socket.on('mediasoup:produce', async ({ transportId, kind, rtpParameters, appData, roomId }, callback) => {
      try {
        const activeUser = Array.from(activeUsers.values()).find(user => user.socketId === socket.id);
        const createdProducer = await produce(roomId, transportId, kind, rtpParameters, {
          ...appData,
          userId: activeUser?.userId,
        });
        socket.to(roomId).emit('mediasoup:newProducer', {
          producerId: createdProducer.id,
          kind: createdProducer.kind,
          peerId: createdProducer.peer.userId || createdProducer.peer.socketId,
          peerName: createdProducer.appData?.userName,
          appData: createdProducer.appData,
        });
        callback({ id: createdProducer.id });
      } catch (error: any) {
        callback({ error: error.message || "Failed to produce media" });
      }
    });

    socket.on('mediasoup:consume', async ({ transportId, producerId, rtpCapabilities, roomId }, callback) => {
      try {
        const consumer = await consume(roomId, transportId, producerId, rtpCapabilities);
        callback(consumer);
      } catch (error: any) {
        callback({ error: error.message || "Failed to consume media" });
      }
    });

    socket.on('mediasoup:resume', async ({ consumerId, roomId }, callback) => {
      try {
        await resumeConsumer(roomId, consumerId);
        callback();
      } catch (error: any) {
        callback({ error: error.message || "Failed to resume consumer" });
      }
    });

    socket.on('mediasoup:getProducers', async ({ roomId }, callback) => {
      try {
        const producers = await getRoomProducers(roomId, socket.id);
        callback({ producers });
      } catch (error: any) {
        callback({ error: error.message || "Failed to get room producers" });
      }
    });

    // --- Recording Events ---
    socket.on('recording:start', ({ meetingId }) => {
      io.to(`meeting-${meetingId}`).emit('recording:started', { meetingId });
    });

    socket.on('recording:stop', ({ meetingId }) => {
      io.to(`meeting-${meetingId}`).emit('recording:stopped', { meetingId });
    });

    // --- Screen Sharing ---
    socket.on('screen-share:start', ({ roomId }) => {
      for (const [userId, user] of activeUsers.entries()) {
        if (user.socketId === socket.id) {
          io.to(roomId).emit('screen-share:started', { userId, userName: user.userId });
          break;
        }
      }
    });

    socket.on('screen-share:stop', ({ roomId }) => {
      for (const [userId, user] of activeUsers.entries()) {
        if (user.socketId === socket.id) {
          io.to(roomId).emit('screen-share:stopped', { userId });
          break;
        }
      }
    });

    // --- In-Meeting/Chat ---
    socket.on('meeting-chat:message', ({ roomId, message }) => {
      for (const [userId, user] of activeUsers.entries()) {
        if (user.socketId === socket.id) {
          io.to(roomId).emit('meeting-chat:message', { 
            userId, 
            message, 
            timestamp: new Date().toISOString() 
          });
          break;
        }
      }
    });

    // Handle joining conversation room
    socket.on('join-conversation', (conversationId: string) => {
      socket.join(`conversation-${conversationId}`);
      console.log(`User joined conversation ${conversationId}`);
    });

    // Handle disconnection — clean up room participant entries so duration still counts them as gone
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      closePeer(socket.id);
      
      // Clean up participant entries from all rooms that contained this socket
      for (const [roomId, room] of roomManager.entries()) {
        if (room.participants.has(socket.id)) {
          const leaving = room.participants.get(socket.id)!;
          room.participants.delete(socket.id);
          socket.to(roomId).emit('call:participant-left', {
            userId: leaving.userId,
            userName: leaving.userName,
          });
          // After socket leaves
          if (room.participants.size === 0) {
            roomManager.delete(roomId);
            callIdToRoomId.delete(room.callId);
            callCodeToRoomId.delete(room.callCode);
          }
        }
      }

      // Find and remove user from activeUsers
      for (const [userId, user] of activeUsers.entries()) {
        if (user.socketId === socket.id) {
          activeUsers.delete(userId);
          // Notify others this user went offline
          io.to(user.businessId).emit('user-presence-updated', { userId, status: 'offline' });
          console.log(`User ${userId} offline`);
          break;
        }
      }
    });
  });

  // ---------- Duration Enforcement Cron (per FRONTEND_CALL_DURATION_GUIDE.md §3.2, §6, 10-sec tick + 5min/1min warnings + auto-end
  const durationCronId = setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of roomManager.entries()) {
      if (!room.endsAt) continue;
      const endsAtMs = new Date(room.endsAt).getTime();
      const remainingMs = Math.max(0, endsAtMs - now);

      // 5-minute warning (exactly once per room)
      if (!room.warned5 && remainingMs <= 5 * 60_000 && remainingMs > 60_000) {
        room.warned5 = true;
        io.to(roomId).emit('call:countdown-warning', {
          callId: room.callId,
          remainingMs,
          remainingMinutes: 5,
          message: '5 minutes remaining. This call will end automatically when the time limit is reached.',
        });
      }
      // 1-minute warning
      if (!room.warned1 && remainingMs <= 60_000) {
        room.warned1 = true;
        io.to(roomId).emit('call:countdown-warning', {
          callId: room.callId,
          remainingMs,
          remainingMinutes: 1,
          message: '⚠ 1 minute remaining. Please wrap up — this call will end shortly.',
        });
      }
      // Auto-end: remainingMs reached 0 or past, emit call:ended and close everything
      if (remainingMs <= 0) {
        console.log(`[duration-cron] ending room ${roomId} (call ${room.callId}) — duration_limit`);
        io.to(roomId).emit('call:ended', {
          callId: room.callId,
          reason: 'duration_limit',
        });
        // Update DB status
        (async () => {
          try {
            await storage.updateCall(room.callId, { status: 'completed' });
          } catch (e) {
          }
        })();
        roomManager.delete(roomId);
        callIdToRoomId.delete(room.callId);
        callCodeToRoomId.delete(room.callCode);
      }
    }
  }, 10_000);
  // Best-effort: keep Node alive only while server is running
  if ((durationCronId as any).unref) {
    (durationCronId as any).unref();
  }

  // Helper function to emit events (we'll use this from our route handlers)
  (global as any).io = io;

  return httpServer;
}
