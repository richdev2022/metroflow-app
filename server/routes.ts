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
const activeUsers = new Map<string, { userId: string; businessId: string; socketId: string }>();
// Store active recordings (roomId -> { id, startTime, userId, businessId, meetingId, callId })
const activeRecordings = new Map<string, { id: string; startTime: number; userId: string; businessId: string; meetingId?: string; callId?: string }>();

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

  app.put("/api/settings/otp-enabled", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const { enabled } = req.body;
      await storage.updateOtpEnabledStatus(businessId, enabled);
      res.json({ success: true, message: enabled ? "OTP enabled successfully" : "OTP disabled successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to update OTP status" });
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
        io.to(`conversation-${req.params.id}`).emit('message:created', message);
        io.to(`conversation-${req.params.id}`).emit('chat:message', message);
      }
      
      res.json({ success: true, data: message });
    } catch (err) {
      res.status(500).json({ error: "Failed to send message" });
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

      res.json({ success: true, data: call });
    } catch (err) {
      res.status(500).json({ error: "Failed to add call participants" });
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
    socket.on('user-online', (userId: string, businessId: string) => {
      activeUsers.set(userId, { userId, businessId, socketId: socket.id });
      
      // Notify all users in the same business that this user is online
      const usersInBusiness = Array.from(activeUsers.values()).filter(u => u.businessId === businessId);
      const onlineUserIds = usersInBusiness.map(u => u.userId);
      
      // Emit presence update
      io.to(businessId).emit('user-presence-updated', { userId, status: 'online' });
      
      // Join the business room
      socket.join(businessId);
      
      console.log(`User ${userId} online in business ${businessId}`);
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
    socket.on('call:invite', ({ callId, targetUserId, type }) => {
      const caller = Array.from(activeUsers.values()).find(user => user.socketId === socket.id);
      // Find target user and send invite
      for (const [userId, user] of activeUsers.entries()) {
        if (userId === targetUserId) {
          io.to(user.socketId).emit('call:incoming', {
            callId,
            from: caller?.userId || '',
            type,
            callCode: callId,
          });
          break;
        }
      }
    });

    socket.on('call:join', ({ roomId }) => {
      socket.join(roomId);
    });

    socket.on('call:accept', ({ callId }) => {
      io.emit('call:accepted', { callId });
    });

    socket.on('call:reject', ({ callId }) => {
      io.emit('call:rejected', { callId });
    });

    socket.on('call:end', ({ callId }) => {
      io.emit('call:ended', { callId });
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
      socket.to(roomId).emit('call:media-state', {
        userId: activeUser?.userId || socket.id,
        audioEnabled,
        videoEnabled,
        screenSharing,
      });
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

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      closePeer(socket.id);
      
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

  // Helper function to emit events (we'll use this from our route handlers)
  (global as any).io = io;

  return httpServer;
}
