import { 
  User, Business, 
  KycStatus, BusinessWallet, WalletInfo, 
  PayrollEmployee, Transfer, KycInitiateInput,
  CreateBusinessWalletInput, FundWalletInput, BulkTransferInput,
  PayrollConfig, PayrollConfigUpdateInput,
  BusinessProfile, UpdateBusinessProfileInput,
  RequestContactUpdateOtpInput, OtpPreferenceResponse, UpdateOtpPreferenceInput,
  FeeConfig, SingleTransferWithOtpInput, BulkTransferWithOtpInput,
  Epic, TransferItem,
  Meeting, CreateMeetingInput, UpdateMeetingInput,
  Conversation, CreateConversationInput,
  Message, SendMessageInput,
  Call, CreateCallInput, UpdateCallInput,
  Recording, CreateRecordingInput, UpdateRecordingInput,
  Task, TaskStatus, CreateTaskStatusInput, UpdateTaskStatusInput
} from "../shared/api";

export interface InsertUser {
  businessId: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "member";
  password?: string;
}

export interface InsertBusiness {
  name: string;
  email: string;
  industry?: string;
}

export interface IStorage {
  // Auth
  createUser(user: InsertUser): Promise<User>;
  createBusiness(business: InsertBusiness): Promise<Business>;
  validateUser(email: string, password: string): Promise<User | undefined>;
  
  // KYC
  getKycStatus(userId: string): Promise<KycStatus>;
  initiateKyc(userId: string, data: KycInitiateInput): Promise<string>; // returns otp
  verifyKycOtp(userId: string, otp: string): Promise<boolean>;

  // Wallet
  getWalletInfo(userId: string): Promise<WalletInfo>;
  fundWallet(userId: string, data: FundWalletInput): Promise<{ payment_url: string }>;
  createBusinessWallet(userId: string, data: CreateBusinessWalletInput): Promise<BusinessWallet>;
  createVirtualAccount(userId: string): Promise<void>;

  // Payroll
  getPayrollSummary(businessId: string): Promise<{success: boolean, payroll: PayrollEmployee[], pagination: any}>;
  updatePayrollDetails(userId: string, data: Partial<PayrollEmployee>): Promise<PayrollEmployee>;
  addPayrollAdjustment(userId: string, type: "bonus" | "deduction", amount: number, reason: string): Promise<any>;
  getPayrollAdjustments(userId: string): Promise<any[]>;
  deletePayrollAdjustment(adjustmentId: string): Promise<void>;
  getPayrollConfig(businessId: string): Promise<PayrollConfig>;
  updatePayrollConfig(businessId: string, config: PayrollConfigUpdateInput): Promise<PayrollConfig>;
  
  // Transfers
  initiateBulkTransfer(userId: string, data: BulkTransferInput): Promise<void>;
  getTransfers(userId: string): Promise<Transfer[]>;
  retryTransfer(transferId: string): Promise<void>;
  getBanks(): Promise<{code: string, name: string}[]>;
  resolveAccount(bankCode: string, accountNumber: string): Promise<{account_name: string, account_number: string}>;

  // Existing methods (mocked for context)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;

  // New Features
  // 1. Business Profile
  getBusinessProfile(businessId: string): Promise<BusinessProfile>;
  updateBusinessProfile(businessId: string, data: UpdateBusinessProfileInput): Promise<void>;

  // 2. Contact Updates
  requestContactUpdateOtp(userId: string, data: RequestContactUpdateOtpInput): Promise<string>;
  verifyContactUpdateOtp(userId: string, otp: string): Promise<boolean>;

  // 3. OTP Preferences
  getOtpPreference(businessId: string): Promise<OtpPreferenceResponse>;
  updateOtpPreference(businessId: string, data: UpdateOtpPreferenceInput): Promise<void>;

  // 4. Fees
  getFeeSchedule(): Promise<FeeConfig[]>;

  // 5. Transfer Authorization
  requestTransferOtp(userId: string, walletId?: string, otpMethod?: string): Promise<{ otp: string, fee_charged: number }>;
  initiateSingleTransferWithOtp(userId: string, data: SingleTransferWithOtpInput): Promise<void>;
  initiateBulkTransferWithOtp(userId: string, data: BulkTransferWithOtpInput): Promise<void>;
  
  // 6. Pre-Registration KYC
  submitBusinessKyc(data: any): Promise<string>; // Returns reference ID
  
  // Epics
  getEpics(businessId: string): Promise<Epic[]>;
  getEpicTransferItems(epicId: string): Promise<TransferItem[]>;

  // 7. OTP Enabled Status
  getOtpEnabledStatus(businessId: string): Promise<{ success: boolean; otpEnabled: boolean; pinCreated: boolean }>;
  updateOtpEnabledStatus(businessId: string, enabled: boolean): Promise<void>;

  // 8. Transaction PIN
  createPin(userId: string, pin: string): Promise<void>;
  verifyPin(userId: string, pin: string): Promise<boolean>;
  sendPinUpdateOtp(userId: string): Promise<string>;
  updatePin(userId: string, newPin: string, otp: string): Promise<void>;

  // 9. Meetings
  getMeetings(businessId: string, page?: number, limit?: number): Promise<{ meetings: Meeting[], total: number }>;
  getMeeting(meetingId: string): Promise<Meeting | undefined>;
  getMeetingByCode(code: string): Promise<Meeting | undefined>;
  createMeeting(userId: string, businessId: string, data: CreateMeetingInput): Promise<Meeting>;
  updateMeeting(meetingId: string, data: UpdateMeetingInput): Promise<Meeting | undefined>;
  deleteMeeting(meetingId: string): Promise<boolean>;
  verifyMeetingPassword(meetingId: string, password: string): Promise<boolean>;
  addWaitingRoomParticipant(meetingId: string, userId: string, userName: string): Promise<void>;
  admitWaitingRoomParticipant(meetingId: string, userId: string): Promise<boolean>;
  denyWaitingRoomParticipant(meetingId: string, userId: string): Promise<boolean>;
  getWaitingRoomParticipants(meetingId: string): Promise<Array<{ id: string; name: string }>>;

  // 10. Chat
  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(conversationId: string): Promise<Conversation | undefined>;
  createConversation(userId: string, businessId: string, data: CreateConversationInput): Promise<Conversation>;
  getMessages(conversationId: string, page?: number, limit?: number): Promise<{ messages: Message[], total: number }>;
  sendMessage(userId: string, conversationId: string, data: SendMessageInput): Promise<Message>;
  updateConversationLastRead(conversationId: string, userId: string): Promise<void>;

  // 11. Calls
  getCalls(businessId: string, page?: number, limit?: number): Promise<{ calls: Call[], total: number }>;
  getCall(callId: string): Promise<Call | undefined>;
  getCallByCode(code: string): Promise<Call | undefined>;
  createCall(userId: string, businessId: string, data: CreateCallInput): Promise<Call>;
  updateCall(callId: string, data: UpdateCallInput): Promise<Call | undefined>;
  joinCall(userId: string, callId: string): Promise<Call | undefined>;
  addCallParticipants(callId: string, participantIds: string[]): Promise<Call | undefined>;
  leaveCall(userId: string, callId: string): Promise<Call | undefined>;
  deleteCall(callId: string): Promise<boolean>;
  verifyCallPassword(callId: string, password: string): Promise<boolean>;

  // 12. Recordings
  getRecordings(businessId: string, page?: number, limit?: number): Promise<{ recordings: Recording[], total: number }>;
  getRecording(recordingId: string): Promise<Recording | undefined>;
  createRecording(userId: string, businessId: string, data: CreateRecordingInput): Promise<Recording>;
  updateRecording(recordingId: string, data: UpdateRecordingInput): Promise<Recording | undefined>;
  deleteRecording(recordingId: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private businesses: Map<string, Business>;
  private passwords: Map<string, string>; // userId -> password
  private kycStatus: Map<string, KycStatus>;
  private wallets: Map<string, WalletInfo>;
  private payrolls: Map<string, PayrollEmployee[]>;
  private payrollConfigs: Map<string, PayrollConfig>;
  private transfers: Map<string, Transfer[]>;
  private otps: Map<string, string>; // userId -> otp
  private kycPendingType: Map<string, 'bvn' | 'nin'>;
  private adjustments: Map<string, any[]>; // userId -> adjustments
  
  // New Maps
  private businessProfiles: Map<string, BusinessProfile>;
  private otpPreferences: Map<string, "email" | "sms" | "whatsapp" | "both">;
  private contactUpdateOtps: Map<string, { otp: string, type: "email" | "phone", value: string }>;
  private transferOtps: Map<string, string>;
  private tempKycData: Map<string, any>;
  private epics: Map<string, Epic[]>; // businessId -> epics
  private epicTransferItems: Map<string, TransferItem[]>; // epicId -> transfer items
  private otpEnabledStatus: Map<string, boolean>; // businessId -> otpEnabled
  private pins: Map<string, string>; // userId -> pin
  private pinUpdateOtps: Map<string, string>; // userId -> otp
  private tasks: Map<string, Task[]>; // businessId -> tasks
  private taskStatuses: Map<string, TaskStatus[]>; // businessId -> task statuses
  private meetings: Map<string, Meeting[]>; // businessId -> meetings
  private conversations: Map<string, Conversation[]>; // businessId -> conversations
  private messages: Map<string, Message[]>; // conversationId -> messages
  private calls: Map<string, Call[]>; // businessId -> calls
  private recordings: Map<string, Recording[]>; // businessId -> recordings
  private waitingRoomParticipants: Map<string, Array<{ id: string; name: string }>>; // meeting/callId -> participants
  private conversationLastRead: Map<string, Map<string, string>>; // conversationId -> userId -> timestamp

  constructor() {
    this.users = new Map();
    this.businesses = new Map();
    this.passwords = new Map();
    this.kycStatus = new Map();
    this.wallets = new Map();
    this.payrolls = new Map();
    this.payrollConfigs = new Map();
    this.transfers = new Map();
    this.otps = new Map();
    this.kycPendingType = new Map();
    this.adjustments = new Map();
    
    // New Maps Init
    this.businessProfiles = new Map();
    this.otpPreferences = new Map();
    this.contactUpdateOtps = new Map();
    this.transferOtps = new Map();
    this.tempKycData = new Map();
    this.epics = new Map();
    this.epicTransferItems = new Map();
    this.otpEnabledStatus = new Map();
    this.pins = new Map();
    this.pinUpdateOtps = new Map();
    this.tasks = new Map();
    this.taskStatuses = new Map();
    this.meetings = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.calls = new Map();
    this.recordings = new Map();
    this.waitingRoomParticipants = new Map();
    this.conversationLastRead = new Map();
    
    // Seed some data
    this.seed();
  }

  private seed() {
    // Seed a default business and user
    const businessId = "biz_123";
    const userId = "user_123";
    
    this.businesses.set(businessId, {
      id: businessId,
      name: "Metricorex Demo",
      email: "demo@Metricorex.com",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    this.users.set(userId, {
      id: userId,
      businessId: businessId,
      email: "demo@Metricorex.com",
      name: "Demo User",
      role: "admin",
      status: "active",
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    this.passwords.set(userId, "password123");

    // Seed some mock transfers for userId
    const now = new Date().toISOString();
    this.transfers.set(userId, [
      {
        id: "trf_1",
        business_id: "biz_123",
        reference: "REF-001",
        amount: 305000,
        currency: "NGN",
        status: "success",
        recipient_name: "Ogbonna Anthony Ezeoyili",
        recipient_account: "0123456789",
        recipient_bank: "000004",
        created_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        wallet_id: "w_demo_user_123"
      },
      {
        id: "trf_2",
        business_id: "biz_123",
        reference: "REF-002",
        amount: 150000,
        currency: "NGN",
        status: "pending",
        recipient_name: "Jane Doe",
        recipient_account: "9876543210",
        recipient_bank: "000001",
        created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        updated_at: new Date(Date.now() - 172800000).toISOString(),
        wallet_id: "w_demo_user_123"
      },
      {
        id: "trf_3",
        business_id: "biz_123",
        reference: "REF-003",
        amount: 75000,
        currency: "NGN",
        status: "failed",
        recipient_name: "John Smith",
        recipient_account: "1234567890",
        recipient_bank: "000013",
        failure_reason: "Insufficient funds",
        created_at: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
        updated_at: new Date(Date.now() - 259200000).toISOString(),
        wallet_id: "w_demo_user_123"
      }
    ]);

    // Seed mock epics
    this.epics.set(businessId, [
      {
        id: "epic_1",
        businessId,
        name: "Mobile Bug Issues",
        description: "Bug fixes for mobile app",
        status: "active",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "epic_2",
        businessId,
        name: "Web Redesign",
        description: "Complete website redesign",
        status: "active",
        createdAt: now,
        updatedAt: now
      }
    ]);

    // Seed mock transfer items for epics
    this.epicTransferItems.set("epic_1", [
      {
        recipient_account: "0123456789",
        recipient_bank: "000004",
        recipient_name: "Ogbonna Anthony Ezeoyili",
        amount: 50000,
        remark: "Bug fix 1"
      },
      {
        recipient_account: "9876543210",
        recipient_bank: "000001",
        recipient_name: "Jane Doe",
        amount: 30000,
        remark: "Bug fix 2"
      }
    ]);
    this.epicTransferItems.set("epic_2", [
      {
        recipient_account: "1234567890",
        recipient_bank: "000013",
        recipient_name: "John Smith",
        amount: 100000,
        remark: "Web redesign phase 1"
      }
    ]);

    // Seed task statuses
    this.taskStatuses.set(businessId, [
      {
        id: "pending",
        business_id: businessId,
        name: "pending",
        color: "#6b7280",
        is_default: true,
        sort_order: 0,
        created_at: now,
        updated_at: now
      },
      {
        id: "Production",
        business_id: businessId,
        name: "Production",
        color: "#22c55e",
        is_default: true,
        sort_order: 1,
        created_at: now,
        updated_at: now
      },
      {
        id: "in_progress",
        business_id: businessId,
        name: "in_progress",
        color: "#3b82f6",
        is_default: true,
        sort_order: 2,
        created_at: now,
        updated_at: now
      },
      {
        id: "completed",
        business_id: businessId,
        name: "completed",
        color: "#22c55e",
        is_default: true,
        sort_order: 3,
        created_at: now,
        updated_at: now
      }
    ]);

    // Seed mock tasks
    this.tasks.set(businessId, [
      {
        id: "479efb90-a0c4-40fb-8a06-d4a9af8c5658",
        title: "Testing",
        description: "Testing",
        epic: "Mobile Bug Issues",
        epicId: "e848755b-3635-488f-9384-123a2fe15616",
        sprint: "Sprint 1",
        targetValue: "0.00",
        accomplishedValue: "0.00",
        startDate: "2026-06-07T23:00:00.000Z",
        endDate: "2026-06-08T23:00:00.000Z",
        dueDate: null,
        status: "in_progress",
        isOverdue: true,
        createdAt: "2026-06-08T11:04:25.454Z",
        updatedAt: "2026-06-10T06:23:40.772Z",
        assignedTo: ["756f12b2-5969-4eae-8aa8-e4cc773cf824"]
      },
      {
        id: "fcef6c13-8ff4-41a3-ae36-9151654a56f7",
        title: "App logo isn't corresponding with the url",
        description: null,
        epic: "Version 1 app stabilization",
        epicId: null,
        sprint: "A1",
        targetValue: "0.00",
        accomplishedValue: "0.00",
        startDate: "2026-02-13T23:00:00.000Z",
        endDate: "2026-02-27T23:00:00.000Z",
        dueDate: null,
        status: "in_progress",
        isOverdue: true,
        createdAt: "2026-02-13T18:20:50.285Z",
        updatedAt: "2026-06-30T15:46:43.742Z",
        assignedTo: ["1847071f-3b48-4765-9801-e7eccc9f6e1c"]
      }
    ]);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = `user_${Math.random().toString(36).slice(2, 11)}`;
    const user: User = {
      id,
      businessId: insertUser.businessId,
      email: insertUser.email,
      name: insertUser.name,
      role: insertUser.role,
      status: "active",
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.users.set(id, user);
    if (insertUser.password) {
      this.passwords.set(id, insertUser.password);
    }
    return user;
  }

  async createBusiness(insertBusiness: InsertBusiness): Promise<Business> {
    const id = `biz_${Math.random().toString(36).slice(2, 11)}`;
    const business: Business = {
      id,
      name: insertBusiness.name,
      email: insertBusiness.email,
      industry: insertBusiness.industry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.businesses.set(id, business);
    return business;
  }

  async validateUser(email: string, password: string): Promise<User | undefined> {
    const user = await this.getUserByEmail(email);
    if (!user) return undefined;
    const storedPassword = this.passwords.get(user.id);
    if (storedPassword === password) return user;
    return undefined;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    return Array.from(this.users.values()).find(u => u.email.toLowerCase() === normalizedEmail);
  }

  // KYC
  async getKycStatus(userId: string): Promise<KycStatus> {
    if (!this.kycStatus.has(userId)) {
      this.kycStatus.set(userId, { 
        user_kyc_status: "none", 
        business_kyc_status: "none",
        bvn_verified: false,
        nin_verified: false
      });
    }
    return this.kycStatus.get(userId)!;
  }

  async initiateKyc(userId: string, data: KycInitiateInput): Promise<string> {
    const otp = "123456"; // Fixed OTP for testing
    this.otps.set(userId, otp);
    this.kycPendingType.set(userId, data.type);
    
    // Update status to pending
    const current = await this.getKycStatus(userId);
    this.kycStatus.set(userId, { ...current, user_kyc_status: "pending" });
    
    // otp_method is accepted but not used in this mock implementation
    // In real app, we would send OTP via the specified method
    
    return otp;
  }

  async verifyKycOtp(userId: string, otp: string): Promise<boolean> {
    const storedOtp = this.otps.get(userId);
    const pendingType = this.kycPendingType.get(userId);

    if (storedOtp === otp && pendingType) {
      const current = await this.getKycStatus(userId);
      const updated = { ...current };

      if (pendingType === 'bvn') updated.bvn_verified = true;
      if (pendingType === 'nin') updated.nin_verified = true;
      
      // Check if both are verified
      if (updated.bvn_verified && updated.nin_verified) {
        updated.user_kyc_status = "verified";
        // Create Wallet if verified
        await this.ensureWallet(userId);
      } else {
         // If partial verification, keep as pending or whatever logic fits
         // Current logic was "verified" on single OTP, now stricter
         updated.user_kyc_status = "pending"; 
      }
      
      this.kycStatus.set(userId, updated);
      this.otps.delete(userId);
      this.kycPendingType.delete(userId);
      
      return true;
    }
    return false;
  }

  private async ensureWallet(userId: string) {
    if (!this.wallets.has(userId)) {
      const now = new Date().toISOString();
      this.wallets.set(userId, {
        success: true,
        user_wallet: {
          id: `w_${userId}`,
          user_id: userId,
          balance: "0",
          currency: "NGN",
          account_number: "99" + Math.floor(Math.random() * 100000000),
          bank_name: "Metro Bank",
          type: "user",
          status: "active",
          created_at: now,
          updated_at: now,
          virtual_accounts: []
        }
      });
    }
  }

  // Wallet
  async getWalletInfo(userId: string): Promise<WalletInfo> {
    // For demo purposes, if wallet doesn't exist but user is verified (or for testing), create one
    // In real app, created after KYC
    const kyc = await this.getKycStatus(userId);
    if (kyc.user_kyc_status === 'verified' && !this.wallets.has(userId)) {
        await this.ensureWallet(userId);
    }
    const now = new Date().toISOString();
    return this.wallets.get(userId) || {
        success: true,
        user_wallet: { // Return a default one for demo if not strictly enforced yet
             id: `w_demo_${userId}`,
             user_id: userId,
             balance: "0",
             currency: "NGN",
             account_number: "Not Created",
             bank_name: "N/A",
             type: "user",
             status: "active",
             created_at: now,
             updated_at: now,
             virtual_accounts: []
        }
    };
  }

  async fundWallet(userId: string, data: FundWalletInput): Promise<{ payment_url: string }> {
    // Simulate funding
    await this.ensureWallet(userId);
    const wallet = this.wallets.get(userId)!;
    
    // Fund based on wallet_id
    if (wallet.user_wallet && wallet.user_wallet.id === data.wallet_id) {
        wallet.user_wallet.balance = String(Number(wallet.user_wallet.balance) + data.amount);
    } else if (wallet.business_wallet && wallet.business_wallet.id === data.wallet_id) {
        wallet.business_wallet.balance = String(Number(wallet.business_wallet.balance) + data.amount);
    }
    
    this.wallets.set(userId, wallet);

    const reference = `FUND-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const callbackUrl = new URL(data.redirect_url);
    callbackUrl.searchParams.set("paymentReference", reference);
    return { payment_url: `/api/wallet/verify?redirect_url=${encodeURIComponent(callbackUrl.toString())}` };
  }

  async createBusinessWallet(userId: string, data: CreateBusinessWalletInput): Promise<BusinessWallet> {
    await this.ensureWallet(userId);
    console.log("Creating business wallet with KYC ID:", data.kycReferenceId);
    const walletInfo = this.wallets.get(userId)!;
    const now = new Date().toISOString();
    const newBusinessWallet: BusinessWallet = {
      id: `bw_${userId}`,
      business_id: "biz_123",
      balance: "0",
      currency: "NGN",
      account_number: data.gtb_account_number,
      bank_name: "GTBank",
      type: "business",
      business_name: data.business_name,
      status: "active",
      created_at: now,
      updated_at: now,
      virtual_accounts: []
    };

    walletInfo.business_wallet = newBusinessWallet;
    this.wallets.set(userId, walletInfo);
    
    // Update KYC
    const kyc = await this.getKycStatus(userId);
    this.kycStatus.set(userId, { ...kyc, business_kyc_status: "verified" });

    return newBusinessWallet;
  }

  async createVirtualAccount(userId: string): Promise<void> {
    await this.ensureWallet(userId);
    const walletInfo = this.wallets.get(userId)!;
    // Force generate if it was "Not Created" (though ensureWallet generates it, 
    // getWalletInfo might return the fallback if we don't persist it properly or if ensureWallet wasn't called)
    // Actually ensureWallet puts it in the map.
    // So if we call ensureWallet, it is in the map.
    // But let's make sure we update it if it was somehow "Not Created" in the map.
    if (walletInfo.user_wallet.account_number === "Not Created") {
        walletInfo.user_wallet.account_number = "99" + Math.floor(Math.random() * 100000000);
        this.wallets.set(userId, walletInfo);
    }
  }

  // Payroll
  async getPayrollSummary(businessId: string): Promise<{success: boolean, payroll: PayrollEmployee[], pagination: any}> {
    // Return mock employees
    if (!this.payrolls.has(businessId)) {
      this.payrolls.set(businessId, [
        {
            id: "24692e94-dc8d-4a91-b296-c96e70454a89",
            name: "Osome - Frontend",
            email: "osomhe.aleogho@gmail.com",
            salary_currency: "NGN",
            bank_account_number: null,
            bank_code: null,
            account_name: null,
            role: "member",
            salary: "0.00",
            // contract_start_date: null,
            // currency: "NGN",
            bonuses_total: 0,
            deductions_total: 0,
            net_salary: 0,
            next_pay_date: "2025-12-30",
            adjustments: {
                bonuses: 0,
                deductions: 0,
                bonus_list: [],
                deduction_list: []
            },
            salary_calculation_status: "standard"
        },
        {
            id: "657428ac-8f70-4cc9-9387-7d64d488a3fc",
            name: "Ogbonna Anthony Ezeoyili",
            email: "tony@velobank.ng",
            salary_currency: "NGN",
            bank_account_number: null,
            bank_code: "000004",
            account_name: "Verifying...",
            role: "admin",
            salary: "300000.00",
            // contract_start_date: null,
            // currency: "NGN",
            bonuses_total: 10000,
            deductions_total: 5000,
            net_salary: 305000,
            next_pay_date: "2025-12-30",
            adjustments: {
                bonuses: 10000,
                deductions: 5000,
                bonus_list: [
                    {
                        user_id: "657428ac-8f70-4cc9-9387-7d64d488a3fc",
                        type: "bonus",
                        amount: "10000.00",
                        currency: "NGN"
                    }
                ],
                deduction_list: [
                    {
                        user_id: "657428ac-8f70-4cc9-9387-7d64d488a3fc",
                        type: "deduction",
                        amount: "5000.00",
                        currency: "NGN"
                    }
                ]
            },
            salary_calculation_status: "standard"
        }
      ]);
    }
    
    const payroll = this.payrolls.get(businessId)!;
    return {
        success: true,
        payroll,
        pagination: {
            total: payroll.length,
            page: 1,
            limit: 10,
            totalPages: 1
        }
    };
  }

  async getPayrollConfig(businessId: string): Promise<PayrollConfig> {
    if (!this.payrollConfigs.has(businessId)) {
        this.payrollConfigs.set(businessId, {
            salary_interval: "monthly",
            salary_custom_date: null
        });
    }
    return this.payrollConfigs.get(businessId)!;
  }

  async updatePayrollConfig(businessId: string, config: PayrollConfigUpdateInput): Promise<PayrollConfig> {
    this.payrollConfigs.set(businessId, config);
    return config;
  }

  async updatePayrollDetails(userId: string, data: Partial<PayrollEmployee>): Promise<PayrollEmployee> {
    // In a real app we'd need businessId context to find the employee
    // Here we just search all mock payrolls
    for (const [bid, employees] of this.payrolls.entries()) {
      const idx = employees.findIndex(e => e.id === userId);
      if (idx !== -1) {
        employees[idx] = { ...employees[idx], ...data };
        // Recalculate net
        employees[idx].net_salary = Number(employees[idx].salary) + employees[idx].bonuses_total - employees[idx].deductions_total;
        this.payrolls.set(bid, employees);
        return employees[idx];
      }
    }
    throw new Error("Employee not found");
  }

  async addPayrollAdjustment(userId: string, type: "bonus" | "deduction", amount: number, reason: string): Promise<any> {
    const adjustment = {
      id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      user_id: userId,
      type,
      amount,
      reason,
      created_at: new Date().toISOString()
    };

    if (!this.adjustments.has(userId)) {
      this.adjustments.set(userId, []);
    }
    this.adjustments.get(userId)!.push(adjustment);

    // Update employee's totals
    for (const [bid, employees] of this.payrolls.entries()) {
      const idx = employees.findIndex(e => e.id === userId);
      if (idx !== -1) {
        if (type === 'bonus') employees[idx].bonuses_total += amount;
        else employees[idx].deductions_total += amount;
        
        employees[idx].net_salary = Number(employees[idx].salary) + employees[idx].bonuses_total - employees[idx].deductions_total;
        this.payrolls.set(bid, employees);
        break;
      }
    }

    return adjustment;
  }

  async getPayrollAdjustments(userId: string): Promise<any[]> {
    return this.adjustments.get(userId) || [];
  }

  async deletePayrollAdjustment(adjustmentId: string): Promise<void> {
    // Find the adjustment and update employee totals
    for (const [userId, adjs] of this.adjustments.entries()) {
      const idx = adjs.findIndex(a => a.id === adjustmentId);
      if (idx !== -1) {
        const adj = adjs[idx];
        // Remove from adjustments
        adjs.splice(idx, 1);
        this.adjustments.set(userId, adjs);
        // Update employee totals
        for (const [bid, employees] of this.payrolls.entries()) {
          const empIdx = employees.findIndex(e => e.id === userId);
          if (empIdx !== -1) {
            if (adj.type === 'bonus') employees[empIdx].bonuses_total -= adj.amount;
            else employees[empIdx].deductions_total -= adj.amount;
            employees[empIdx].net_salary = Number(employees[empIdx].salary) + employees[empIdx].bonuses_total - employees[empIdx].deductions_total;
            this.payrolls.set(bid, employees);
            break;
          }
        }
        break;
      }
    }
  }

  // Transfers
  async initiateBulkTransfer(userId: string, data: BulkTransferInput): Promise<void> {
    const transfers = this.transfers.get(userId) || [];
    const now = new Date().toISOString();

    // For demo purposes, if no items, just create a bulk one, otherwise create individual
    if (data.data && data.data.items && Array.isArray(data.data.items)) {
      data.data.items.forEach((item: any, index: number) => {
        transfers.push({
          id: `trf_${Date.now()}_${index}`,
          business_id: "biz_123",
          reference: `REF-${Date.now()}-${index}`,
          recipient_name: item.recipient_name || "Unknown Recipient",
          recipient_account: item.recipient_account || "",
          recipient_bank: item.recipient_bank || "",
          amount: item.amount,
          currency: "NGN",
          status: "success",
          created_at: now,
          updated_at: now,
          wallet_id: data.source_wallet_id
        });
      });
    } else {
      // Fallback to single bulk transfer
      transfers.push({
        id: `trf_${Date.now()}`,
        business_id: "biz_123",
        reference: `REF-${Date.now()}`,
        amount: 650000, // Sum of mock salaries
        currency: "NGN",
        status: "success",
        recipient_name: "Bulk Payroll Run",
        created_at: now,
        updated_at: now,
        wallet_id: data.source_wallet_id
      });
    }

    this.transfers.set(userId, transfers);
  }

  async getTransfers(userId: string): Promise<Transfer[]> {
    return this.transfers.get(userId) || [];
  }

  async retryTransfer(transferId: string): Promise<void> {
    // Find transfer and set status to success
    for (const [uid, trfs] of this.transfers.entries()) {
        const t = trfs.find(t => t.id === transferId);
        if (t) {
            t.status = 'success';
            t.failure_reason = undefined;
            this.transfers.set(uid, trfs);
            return;
        }
    }
  }

  async getBanks(): Promise<{code: string, name: string}[]> {
    return [
      { code: "000001", name: "Sterling Bank" },
      { code: "000002", name: "Keystone Bank" },
      { code: "000003", name: "FCMB" },
      { code: "000013", name: "GTBank" },
      { code: "057", name: "Zenith Bank" },
      { code: "058", name: "Guaranty Trust Bank" }
    ];
  }

  async resolveAccount(_bankCode: string, accountNumber: string): Promise<{account_name: string, account_number: string}> {
    // Mock resolution
    if (accountNumber.length === 10) {
      return {
        account_name: "John Doe",
        account_number: accountNumber
      };
    }
    throw new Error("Invalid account details");
  }

  // --- New Features Implementation ---

  // 1. Business Profile
  async getBusinessProfile(businessId: string): Promise<BusinessProfile> {
    if (!this.businessProfiles.has(businessId)) {
      // Create default
      this.businessProfiles.set(businessId, {
        id: businessId,
        name: "My Business",
        email: "business@example.com",
        phone_number: "+2348012345678",
        industry: "Technology",
        logo_url: "https://example.com/logo.png",
        currency: "NGN"
      });
    }
    return this.businessProfiles.get(businessId)!;
  }

  async updateBusinessProfile(businessId: string, data: UpdateBusinessProfileInput): Promise<void> {
    const profile = await this.getBusinessProfile(businessId);
    const updated = { ...profile, ...data };
    this.businessProfiles.set(businessId, updated);
  }

  // 2. Contact Updates
  async requestContactUpdateOtp(userId: string, data: RequestContactUpdateOtpInput): Promise<string> {
    const otp = "123456"; // Fixed OTP
    this.contactUpdateOtps.set(userId, { otp, type: data.type, value: data.value });
    return otp;
  }

  async verifyContactUpdateOtp(userId: string, otp: string): Promise<boolean> {
    const pending = this.contactUpdateOtps.get(userId);
    if (pending && pending.otp === otp) {
      // Update the contact info - In real app, we would update the user or business record
      // For now, we just clear the pending OTP to signify success
      this.contactUpdateOtps.delete(userId);
      return true;
    }
    return false;
  }

  // 3. OTP Preferences
  async getOtpPreference(businessId: string): Promise<OtpPreferenceResponse> {
    if (!this.otpPreferences.has(businessId)) {
      this.otpPreferences.set(businessId, "email");
    }
    return { preference: this.otpPreferences.get(businessId)! };
  }

  async updateOtpPreference(businessId: string, data: UpdateOtpPreferenceInput): Promise<void> {
    this.otpPreferences.set(businessId, data.preference);
  }

  // 4. Fees
  async getFeeSchedule(): Promise<FeeConfig[]> {
    return [
      {
        id: "0e3d1287-68c1-492d-90da-4aa99c3eb718",
        name: "Stamp Duty",
        fee_type: "stamp_duty",
        config_type: "flat_conditional",
        config: {
          conditions: [
            { fee: 50, operator: ">=", threshold: 10000 }
          ]
        },
        currency: "NGN"
      },
      {
        id: "5e721db2-222f-49a5-a2e7-caf20e58b3fe",
        name: "OTP SMS Fee",
        fee_type: "otp_sms",
        config_type: "flat",
        config: { amount: 4 },
        currency: "NGN"
      },
      {
        id: "922eaa78-12f5-4f15-be39-2bdac230fab7",
        name: "Account Funding Fee",
        fee_type: "funding_account",
        config_type: "percentage_cap",
        config: { cap: 1000, percentage: 1 },
        currency: "NGN"
      },
      {
        id: "9463fcb7-6e49-478f-b2b3-9b6a22a5644e",
        name: "Card Funding Fee",
        fee_type: "funding_card",
        config_type: "percentage_cap",
        config: { cap: 2000, percentage: 1.5 },
        currency: "NGN"
      },
      {
        id: "18ef2ec8-de75-4530-805f-64a880537493",
        name: "Standard Transfer Fee",
        fee_type: "transfer",
        config_type: "range",
        config: {
          ranges: [
            { fee: 10, max: 5000, min: 0 },
            { fee: 25, max: 50000, min: 5001 },
            { fee: 50, max: 999999999, min: 50001 }
          ]
        },
        currency: "NGN"
      }
    ];
  }

  // 5. Transfer Authorization
  async requestTransferOtp(userId: string, walletId?: string, otpMethod?: string): Promise<{ otp: string, fee_charged: number }> {
    const otp = "123456";
    this.transferOtps.set(userId, otp);
    
    // Calculate fee based on otpMethod or preference (mock logic)
    const businessId = "biz_123"; 
    let fee = 0;
    
    if (otpMethod && otpMethod !== 'email') {
      fee = 4; // Mock SMS/WhatsApp fee
    } else if (!otpMethod) {
      const pref = await this.getOtpPreference(businessId);
      if (pref.preference !== 'email') {
          fee = 4;
      }
    }

    // Deduct fee from wallet if fee > 0
    if (fee > 0) {
      const walletInfo = await this.getWalletInfo(userId);
      let charged = false;

      // Check user wallet first
      if (walletInfo.user_wallet && (!walletId || walletInfo.user_wallet.id === walletId)) {
        const newBalance = Number(walletInfo.user_wallet.balance) - fee;
        if (newBalance < 0) {
          throw new Error("Insufficient funds in wallet for OTP fee");
        }
        walletInfo.user_wallet.balance = String(newBalance);
        charged = true;
      } 
      // Check business wallet
      else if (walletInfo.business_wallet && (!walletId || walletInfo.business_wallet.id === walletId)) {
        const newBalance = Number(walletInfo.business_wallet.balance) - fee;
        if (newBalance < 0) {
          throw new Error("Insufficient funds in wallet for OTP fee");
        }
        walletInfo.business_wallet.balance = String(newBalance);
        charged = true;
      }

      if (!charged) {
        throw new Error("No NGN wallet found to charge OTP fee");
      }

      this.wallets.set(userId, walletInfo);
    }

    return { otp, fee_charged: fee };
  }

  async initiateSingleTransferWithOtp(userId: string, data: SingleTransferWithOtpInput): Promise<void> {
    // Validate PIN first
    const isValidPin = await this.verifyPin(userId, data.pin);
    if (!isValidPin) {
      throw new Error("Invalid PIN");
    }

    // Get OTP enabled status
    const otpEnabled = await this.getOtpEnabledStatus("biz_123");
    
    // Validate OTP only if OTP is enabled
    if (otpEnabled.otpEnabled) {
      const storedOtp = this.transferOtps.get(userId);
      if (storedOtp !== data.otp) {
          throw new Error("Invalid OTP");
      }
      // Clear OTP
      this.transferOtps.delete(userId);
    }
    
    // Process transfer
    const transfers = this.transfers.get(userId) || [];
    const now = new Date().toISOString();
    transfers.push({
      id: `trf_${Date.now()}`,
      business_id: "biz_123",
      reference: `REF-${Date.now()}`,
      amount: data.amount,
      currency: "NGN",
      status: "success",
      recipient_name: data.accountName,
      recipient_account: data.accountNumber,
      recipient_bank: data.bankCode,
      remark: data.remark,
      created_at: now,
      updated_at: now,
      wallet_id: data.wallet_id
    });
    this.transfers.set(userId, transfers);
  }

  async initiateBulkTransferWithOtp(userId: string, data: BulkTransferWithOtpInput): Promise<void> {
    // Validate PIN first
    const isValidPin = await this.verifyPin(userId, data.pin);
    if (!isValidPin) {
      throw new Error("Invalid PIN");
    }

    // Get OTP enabled status
    const otpEnabled = await this.getOtpEnabledStatus("biz_123");
    
    // Validate OTP only if OTP is enabled
    if (otpEnabled.otpEnabled) {
      const storedOtp = this.transferOtps.get(userId);
      if (storedOtp !== data.otp) {
        throw new Error("Invalid OTP");
      }
      // Clear OTP
      this.transferOtps.delete(userId);
    }

    // Process bulk transfer: create individual transfers for each item
    const transfers = this.transfers.get(userId) || [];
    const now = new Date().toISOString();

    data.data.items.forEach((item, index) => {
      // Try to map bankCode/accountNumber to recipient_account/recipient_bank
      const recipientAccount = (item as any).accountNumber || (item as any).recipient_account || "";
      const recipientBank = (item as any).bankCode || (item as any).recipient_bank || "";

      transfers.push({
        id: `trf_${Date.now()}_${index}`,
        business_id: "biz_123",
        reference: `REF-${Date.now()}-${index}`,
        recipient_name: (item as any).accountName || (item as any).recipient_name || "Unknown Recipient",
        recipient_account: recipientAccount,
        recipient_bank: recipientBank,
        amount: item.amount,
        currency: "NGN",
        status: "success",
        remark: (item as any).remark,
        created_at: now,
        updated_at: now,
        wallet_id: data.source_wallet_id
      });
    });

    this.transfers.set(userId, transfers);
  }

  // 6. Pre-Registration KYC
  async submitBusinessKyc(data: any): Promise<string> {
    const kycId = `kyc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.tempKycData.set(kycId, {
      ...data,
      submittedAt: new Date().toISOString()
    });
    return kycId;
  }

  async getEpics(businessId: string): Promise<Epic[]> {
    return this.epics.get(businessId) || [];
  }

  async getEpicTransferItems(epicId: string): Promise<TransferItem[]> {
    return this.epicTransferItems.get(epicId) || [];
  }

  // 7. OTP Enabled Status
  async getOtpEnabledStatus(businessId: string): Promise<{ success: boolean; otpEnabled: boolean; pinCreated: boolean }> {
    if (!this.otpEnabledStatus.has(businessId)) {
      this.otpEnabledStatus.set(businessId, true);
    }
    const otpEnabled = this.otpEnabledStatus.get(businessId) ?? true;
    
    // Check if PIN is created (using mock userId for now)
    const userId = "user_123";
    const pinCreated = this.pins.has(userId);
    
    return {
      success: true,
      otpEnabled,
      pinCreated
    };
  }

  async updateOtpEnabledStatus(businessId: string, enabled: boolean): Promise<void> {
    this.otpEnabledStatus.set(businessId, enabled);
  }

  // 8. Transaction PIN
  async createPin(userId: string, pin: string): Promise<void> {
    this.pins.set(userId, pin);
  }

  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const storedPin = this.pins.get(userId);
    if (!storedPin) {
      throw new Error("PIN not created. Please create a PIN first.");
    }
    return storedPin === pin;
  }

  async sendPinUpdateOtp(userId: string): Promise<string> {
    const otp = "123456";
    this.pinUpdateOtps.set(userId, otp);
    return otp;
  }

  async updatePin(userId: string, newPin: string, otp: string): Promise<void> {
    const storedOtp = this.pinUpdateOtps.get(userId);
    if (storedOtp !== otp) {
      throw new Error("Invalid OTP");
    }
    this.pins.set(userId, newPin);
    this.pinUpdateOtps.delete(userId);
  }

  // New methods for tasks and task statuses
  async getTasks(businessId: string): Promise<Task[]> {
    return this.tasks.get(businessId) || [];
  }

  async getTaskStatuses(businessId: string): Promise<TaskStatus[]> {
    const statuses = this.taskStatuses.get(businessId) || [];
    return [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  }

  async createTaskStatus(businessId: string, data: CreateTaskStatusInput): Promise<TaskStatus> {
    const now = new Date().toISOString();
    const newStatus: TaskStatus = {
      id: `status_${Date.now()}`,
      business_id: businessId,
      name: data.name,
      color: data.color || "#6b7280",
      is_default: false,
      sort_order: (this.taskStatuses.get(businessId)?.length || 0),
      created_at: now,
      updated_at: now
    };
    const currentStatuses = this.taskStatuses.get(businessId) || [];
    this.taskStatuses.set(businessId, [...currentStatuses, newStatus]);
    return newStatus;
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | undefined> {
    for (const [businessId, tasks] of this.tasks.entries()) {
      const index = tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        tasks[index] = { ...tasks[index], ...updates, updatedAt: new Date().toISOString() };
        this.tasks.set(businessId, tasks);
        return tasks[index];
      }
    }
    return undefined;
  }

  async updateTaskStatus(businessId: string, statusId: string, updates: Partial<TaskStatus>): Promise<TaskStatus | undefined> {
    const statuses = this.taskStatuses.get(businessId);
    if (!statuses) return undefined;
    const index = statuses.findIndex(s => s.id === statusId);
    if (index === -1) return undefined;
    statuses[index] = { ...statuses[index], ...updates, updated_at: new Date().toISOString() };
    this.taskStatuses.set(businessId, statuses);
    return statuses[index];
  }

  async deleteTaskStatus(businessId: string, statusId: string): Promise<boolean> {
    const statuses = this.taskStatuses.get(businessId);
    if (!statuses) return false;
    const status = statuses.find(s => s.id === statusId);
    if (!status) return false;
    if (status.is_default) return false;
    const filtered = statuses.filter(s => s.id !== statusId);
    this.taskStatuses.set(businessId, filtered);
    return true;
  }

  async reorderTaskStatuses(businessId: string, statusIds: string[]): Promise<TaskStatus[]> {
    const statuses = this.taskStatuses.get(businessId);
    if (!statuses) return [];
    const ordered = statusIds.map((id, index) => {
      const status = statuses.find(s => s.id === id);
      if (status) {
        return { ...status, sort_order: index, updated_at: new Date().toISOString() };
      }
      return null;
    }).filter(Boolean) as TaskStatus[];
    this.taskStatuses.set(businessId, ordered);
    return ordered;
  }

  // --- Meetings Methods ---
  async getMeetings(businessId: string, page = 1, limit = 10): Promise<{ meetings: Meeting[], total: number }> {
    const allMeetings = this.meetings.get(businessId) || [];
    const total = allMeetings.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const meetings = allMeetings.slice(start, end);
    return { meetings, total };
  }

  async getMeeting(meetingId: string): Promise<Meeting | undefined> {
    for (const meetings of this.meetings.values()) {
      const meeting = meetings.find(m => m.id === meetingId);
      if (meeting) return meeting;
    }
    return undefined;
  }

  async getMeetingByCode(code: string): Promise<Meeting | undefined> {
    for (const meetings of this.meetings.values()) {
      const meeting = meetings.find(m => m.meetingCode === code);
      if (meeting) return meeting;
    }
    return undefined;
  }

  async createMeeting(userId: string, businessId: string, data: CreateMeetingInput): Promise<Meeting> {
    const now = new Date().toISOString();
    const meetingId = `meeting_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const meetingCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const newMeeting: Meeting = {
      id: meetingId,
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      timezone: data.timezone,
      createdById: userId,
      hostId: userId,
      status: 'scheduled',
      meetingCode,
      isInstant: data.isInstant,
      password: data.password,
      maxParticipants: data.maxParticipants,
      waitingRoomEnabled: data.waitingRoomEnabled,
      recordingEnabled: data.recordingEnabled,
      screenSharingEnabled: data.screenSharingEnabled,
      createdAt: now,
      updatedAt: now,
      attendees: data.attendeeIds.map(userId => ({
        id: `attendee_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        userId: userId,
        status: 'invited'
      }))
    };
    const currentMeetings = this.meetings.get(businessId) || [];
    this.meetings.set(businessId, [...currentMeetings, newMeeting]);
    return newMeeting;
  }

  async updateMeeting(meetingId: string, data: UpdateMeetingInput): Promise<Meeting | undefined> {
    for (const [businessId, meetings] of this.meetings.entries()) {
      const index = meetings.findIndex(m => m.id === meetingId);
      if (index !== -1) {
        const { attendeeIds, ...meetingUpdates } = data;
        let updatedMeeting: Meeting = {
          ...meetings[index],
          ...meetingUpdates,
          updatedAt: new Date().toISOString()
        };
        if (attendeeIds) {
          updatedMeeting.attendees = attendeeIds.map(userId => ({
            id: `attendee_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            userId: userId,
            status: 'invited'
          }));
        }
        meetings[index] = updatedMeeting;
        this.meetings.set(businessId, meetings);
        return updatedMeeting;
      }
    }
    return undefined;
  }

  async deleteMeeting(meetingId: string): Promise<boolean> {
    for (const [businessId, meetings] of this.meetings.entries()) {
      const filtered = meetings.filter(m => m.id !== meetingId);
      if (filtered.length !== meetings.length) {
        this.meetings.set(businessId, filtered);
        return true;
      }
    }
    return false;
  }

  // --- Chat Methods ---
  async getConversations(userId: string): Promise<Conversation[]> {
    const allConversations: Conversation[] = [];
    for (const conversations of this.conversations.values()) {
      for (const conversation of conversations) {
        const isParticipant = conversation.participants.some(p => p.userId === userId);
        if (isParticipant) {
          allConversations.push(conversation);
        }
      }
    }
    return allConversations;
  }

  async getConversation(conversationId: string): Promise<Conversation | undefined> {
    for (const conversations of this.conversations.values()) {
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation) return conversation;
    }
    return undefined;
  }

  async createConversation(userId: string, businessId: string, data: CreateConversationInput): Promise<Conversation> {
    const now = new Date().toISOString();
    const participantIds = (data as any).participantIds || (data as any).participant_ids || [];
    const uniqueParticipantIds = Array.from(new Set([userId, ...participantIds]));
    const newConversation: Conversation = {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: data.name,
      type: data.type,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      participants: uniqueParticipantIds.map(userId => ({
        id: `participant_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        userId: userId
      }))
    };
    const currentConversations = this.conversations.get(businessId) || [];
    this.conversations.set(businessId, [...currentConversations, newConversation]);
    return newConversation;
  }

  async getMessages(conversationId: string, page = 1, limit = 50): Promise<{ messages: Message[], total: number }> {
    const allMessages = this.messages.get(conversationId) || [];
    const total = allMessages.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const messages = allMessages.slice(start, end);
    return { messages, total };
  }

  async sendMessage(userId: string, conversationId: string, data: SendMessageInput): Promise<Message> {
    const now = new Date().toISOString();
    const user = await this.getUser(userId);
    const newMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      conversationId: conversationId,
      senderId: userId,
      content: data.content,
      attachmentUrl: data.attachmentUrl,
      attachmentType: data.attachmentType,
      createdAt: now,
      senderName: user?.name
    };
    const currentMessages = this.messages.get(conversationId) || [];
    this.messages.set(conversationId, [...currentMessages, newMessage]);

    // Update conversation's last message
    for (const [businessId, conversations] of this.conversations.entries()) {
      const index = conversations.findIndex(c => c.id === conversationId);
      if (index !== -1) {
        conversations[index] = {
          ...conversations[index],
          lastMessage: data.content,
          lastMessageAt: now,
          updatedAt: now
        };
        this.conversations.set(businessId, conversations);
        break;
      }
    }

    return newMessage;
  }

  // --- Calls Methods ---
  async getCalls(businessId: string, page = 1, limit = 10): Promise<{ calls: Call[], total: number }> {
    const allCalls = this.calls.get(businessId) || [];
    const total = allCalls.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const calls = allCalls.slice(start, end);
    return { calls, total };
  }

  async getCall(callId: string): Promise<Call | undefined> {
    for (const calls of this.calls.values()) {
      const call = calls.find(c => c.id === callId);
      if (call) return call;
    }
    return undefined;
  }

  async getCallByCode(code: string): Promise<Call | undefined> {
    for (const calls of this.calls.values()) {
      const call = calls.find(c => c.callCode === code);
      if (call) return call;
    }
    return undefined;
  }

  async createCall(userId: string, businessId: string, data: CreateCallInput): Promise<Call> {
    const now = new Date().toISOString();
    const callCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const participantIds = ((data as any).participantIds || (data as any).participant_ids || []) as string[];
    const invitedParticipantIds = Array.from(new Set(participantIds.filter(id => id !== userId)));
    const newCall: Call = {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: data.type,
      status: 'ringing',
      startedAt: now,
      createdById: userId,
      hostId: userId,
      callCode,
      isGroupCall: data.isGroupCall ?? invitedParticipantIds.length > 1,
      password: data.password,
      maxParticipants: data.maxParticipants || 10,
      waitingRoomEnabled: data.waitingRoomEnabled || false,
      recordingEnabled: data.recordingEnabled || false,
      createdAt: now,
      updatedAt: now,
      participants: [
        {
          id: `call_participant_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          userId: userId,
          status: 'joined',
          joinedAt: now
        },
        ...invitedParticipantIds.map(userId => ({
          id: `call_participant_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          userId: userId,
          status: 'invited' as const
        }))
      ]
    };
    const currentCalls = this.calls.get(businessId) || [];
    this.calls.set(businessId, [...currentCalls, newCall]);
    return newCall;
  }

  async updateCall(callId: string, data: UpdateCallInput): Promise<Call | undefined> {
    for (const [businessId, calls] of this.calls.entries()) {
      const index = calls.findIndex(c => c.id === callId);
      if (index !== -1) {
        let updatedCall = { ...calls[index], ...data, updatedAt: new Date().toISOString() };
        if (data.status === 'ongoing' && !updatedCall.startedAt) {
          updatedCall.startedAt = new Date().toISOString();
        }
        if (data.status === 'completed' && !updatedCall.endedAt) {
          updatedCall.endedAt = new Date().toISOString();
        }
        calls[index] = updatedCall;
        this.calls.set(businessId, calls);
        return updatedCall;
      }
    }
    return undefined;
  }

  async joinCall(userId: string, callId: string): Promise<Call | undefined> {
    for (const [businessId, calls] of this.calls.entries()) {
      const index = calls.findIndex(c => c.id === callId);
      if (index !== -1) {
        const now = new Date().toISOString();
        const updatedCall = { ...calls[index], updatedAt: now };
        const participantIndex = updatedCall.participants.findIndex(p => p.userId === userId);
        if (participantIndex !== -1) {
          updatedCall.participants[participantIndex] = {
            ...updatedCall.participants[participantIndex],
            status: 'joined',
            joinedAt: now
          };
        } else {
          updatedCall.participants.push({
            id: `call_participant_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            userId: userId,
            status: 'joined',
            joinedAt: now
          });
        }
        if (updatedCall.status === 'ringing') {
          updatedCall.status = 'ongoing';
          updatedCall.startedAt = updatedCall.startedAt || now;
        }
        calls[index] = updatedCall;
        this.calls.set(businessId, calls);
        return updatedCall;
      }
    }
    return undefined;
  }

  async addCallParticipants(callId: string, participantIds: string[]): Promise<Call | undefined> {
    for (const [businessId, calls] of this.calls.entries()) {
      const index = calls.findIndex(c => c.id === callId);
      if (index !== -1) {
        const now = new Date().toISOString();
        const updatedCall = { ...calls[index], updatedAt: now };
        const existingIds = new Set(updatedCall.participants.map(participant => participant.userId));

        const newParticipants = Array.from(new Set(participantIds))
          .filter(userId => !existingIds.has(userId))
          .map(userId => ({
            id: `call_participant_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            userId,
            status: 'invited' as const,
          }));

        updatedCall.participants = [...updatedCall.participants, ...newParticipants];
        calls[index] = updatedCall;
        this.calls.set(businessId, calls);
        return updatedCall;
      }
    }
    return undefined;
  }

  async leaveCall(userId: string, callId: string): Promise<Call | undefined> {
    for (const [businessId, calls] of this.calls.entries()) {
      const index = calls.findIndex(c => c.id === callId);
      if (index !== -1) {
        const now = new Date().toISOString();
        const updatedCall = { ...calls[index], updatedAt: now };
        const participantIndex = updatedCall.participants.findIndex(p => p.userId === userId);
        if (participantIndex !== -1) {
          updatedCall.participants[participantIndex] = {
            ...updatedCall.participants[participantIndex],
            status: 'left',
            leftAt: now
          };
        }
        const stillJoined = updatedCall.participants.some(p => p.status === 'joined');
        if (!stillJoined) {
          updatedCall.status = 'completed';
          updatedCall.endedAt = now;
        }
        calls[index] = updatedCall;
        this.calls.set(businessId, calls);
        return updatedCall;
      }
    }
    return undefined;
  }

  async deleteCall(callId: string): Promise<boolean> {
    for (const [businessId, calls] of this.calls.entries()) {
      const filtered = calls.filter(c => c.id !== callId);
      if (filtered.length !== calls.length) {
        this.calls.set(businessId, filtered);
        return true;
      }
    }
    return false;
  }

  // --- Recordings Methods ---
  async getRecordings(businessId: string, page = 1, limit = 10): Promise<{ recordings: Recording[], total: number }> {
    const allRecordings = this.recordings.get(businessId) || [];
    const total = allRecordings.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const recordings = allRecordings.slice(start, end);
    return { recordings, total };
  }

  async getRecording(recordingId: string): Promise<Recording | undefined> {
    for (const recordings of this.recordings.values()) {
      const recording = recordings.find(r => r.id === recordingId);
      if (recording) return recording;
    }
    return undefined;
  }

  async createRecording(userId: string, businessId: string, data: CreateRecordingInput): Promise<Recording> {
    const now = new Date().toISOString();
    const user = await this.getUser(userId);
    const newRecording: Recording = {
      id: `recording_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      businessId,
      meetingId: data.meetingId,
      callId: data.callId,
      recordedById: userId,
      recordedByName: user?.name || '',
      storageUrl: '',
      duration: 0,
      status: 'recording',
      size: 0,
      createdAt: now,
      updatedAt: now
    };
    const currentRecordings = this.recordings.get(businessId) || [];
    this.recordings.set(businessId, [...currentRecordings, newRecording]);
    return newRecording;
  }

  async updateRecording(recordingId: string, data: UpdateRecordingInput): Promise<Recording | undefined> {
    for (const [businessId, recordings] of this.recordings.entries()) {
      const index = recordings.findIndex(r => r.id === recordingId);
      if (index !== -1) {
        const updatedRecording: Recording = {
          ...recordings[index],
          ...data,
          updatedAt: new Date().toISOString()
        };
        recordings[index] = updatedRecording;
        this.recordings.set(businessId, recordings);
        return updatedRecording;
      }
    }
    return undefined;
  }

  async deleteRecording(recordingId: string): Promise<boolean> {
    for (const [businessId, recordings] of this.recordings.entries()) {
      const filtered = recordings.filter(r => r.id !== recordingId);
      if (filtered.length !== recordings.length) {
        this.recordings.set(businessId, filtered);
        return true;
      }
    }
    return false;
  }

  // --- Meeting Waiting Room & Password Methods ---
  async verifyMeetingPassword(meetingId: string, password: string): Promise<boolean> {
    const meeting = await this.getMeeting(meetingId);
    if (!meeting) return false;
    return !meeting.password || meeting.password === password;
  }

  async addWaitingRoomParticipant(meetingId: string, userId: string, userName: string): Promise<void> {
    const participants = this.waitingRoomParticipants.get(meetingId) || [];
    if (!participants.find(p => p.id === userId)) {
      participants.push({ id: userId, name: userName });
      this.waitingRoomParticipants.set(meetingId, participants);
    }
  }

  async admitWaitingRoomParticipant(meetingId: string, userId: string): Promise<boolean> {
    const participants = this.waitingRoomParticipants.get(meetingId);
    if (!participants) return false;
    const filtered = participants.filter(p => p.id !== userId);
    this.waitingRoomParticipants.set(meetingId, filtered);
    return true;
  }

  async denyWaitingRoomParticipant(meetingId: string, userId: string): Promise<boolean> {
    const participants = this.waitingRoomParticipants.get(meetingId);
    if (!participants) return false;
    const filtered = participants.filter(p => p.id !== userId);
    this.waitingRoomParticipants.set(meetingId, filtered);
    return true;
  }

  async getWaitingRoomParticipants(meetingId: string): Promise<Array<{ id: string; name: string }>> {
    return this.waitingRoomParticipants.get(meetingId) || [];
  }

  // --- Call Password Method ---
  async verifyCallPassword(callId: string, password: string): Promise<boolean> {
    const call = await this.getCall(callId);
    if (!call) return false;
    return !call.password || call.password === password;
  }

  // --- Chat Last Read Method ---
  async updateConversationLastRead(conversationId: string, userId: string): Promise<void> {
    let lastReadMap = this.conversationLastRead.get(conversationId);
    if (!lastReadMap) {
      lastReadMap = new Map();
      this.conversationLastRead.set(conversationId, lastReadMap);
    }
    lastReadMap.set(userId, new Date().toISOString());
  }
}

export const storage = new MemStorage();
