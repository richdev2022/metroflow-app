import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Middleware to simulate auth (get userId from header or token)
  // For this demo, we'll assume a fixed userId if not provided or handle it in handlers
  const getUserId = (req: any) => {
    // In real app, extract from JWT
    // For now, let's use a mock ID or rely on client sending a specific header if we implemented that
    // But since we are using localStorage in client, let's look for Authorization header mock
    return "user_123"; // Mock User ID
  };
  
  const getBusinessId = (req: any) => "biz_123"; // Mock Business ID

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
      const user = await storage.validateUser(email, password);
      
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
    const { email, otp } = req.body;
    if (otp === "123456") {
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
      const { wallet_id } = req.body;
      const result = await storage.requestTransferOtp(userId, wallet_id);
      res.json({ 
        success: true, 
        message: "OTP sent successfully", 
        fee_charged: result.fee_charged 
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to request OTP" });
    }
  });

  app.post("/api/transfers/single", async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.initiateSingleTransferWithOtp(userId, req.body);
      res.json({ success: true, message: "Transfer initiated successfully" });
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
      const { type, number } = req.body;
      const otp = await storage.initiateKyc(userId, { type, number });
      // In real world, SMS/Email is sent. Here we return success message.
      // We might return OTP in dev mode for convenience, but requirements say "Response: OTP sent message"
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
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: "Failed to get payroll summary" });
    }
  });

  app.get("/api/payroll/config", async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      const config = await storage.getPayrollConfig(businessId);
      res.json({ success: true, config });
    } catch (err) {
      res.status(500).json({ error: "Failed to get payroll config" });
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

  app.post("/api/payroll/adjustments", async (req, res) => {
    try {
      const { userId, type, amount, reason } = req.body;
      await storage.addPayrollAdjustment(userId, type, amount, reason);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to add adjustment" });
    }
  });

  app.post("/api/transfers/bulk", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (req.body.otp) {
        // New OTP based flow
        await storage.initiateBulkTransferWithOtp(userId, req.body);
        res.json({ success: true, message: "Queued " + req.body.data.items.length + " transfers for processing" });
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
      res.json(transfers);
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

  // --- Epics Routes (Mock) ---
  app.get("/api/epics", async (req, res) => {
    try {
      res.json({ success: true, data: [] });
    } catch (err) {
      res.status(500).json({ error: "Failed to get epics" });
    }
  });

  // --- Tasks Routes (Mock) ---
  app.get("/api/tasks", async (req, res) => {
    try {
       res.json({ success: true, data: [] });
    } catch (err) {
       res.status(500).json({ error: "Failed to get tasks" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
