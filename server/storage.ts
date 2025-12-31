import { 
  User, Business, Task, KPISummary, TeamMember, Comment, 
  KycStatus, Wallet, BusinessWallet, WalletInfo, 
  PayrollEmployee, Transfer, KycInitiateInput, KycVerifyOtpInput,
  CreateBusinessWalletInput, FundWalletInput, BulkTransferInput,
  PayrollConfig, PayrollConfigUpdateInput,
  BusinessProfile, UpdateBusinessProfileInput,
  RequestContactUpdateOtpInput, OtpPreferenceResponse, UpdateOtpPreferenceInput,
  FeeConfig, SingleTransferWithOtpInput, BulkTransferWithOtpInput
} from "../shared/api";

export interface IStorage {
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
  addPayrollAdjustment(userId: string, type: "bonus" | "deduction", amount: number, reason: string): Promise<void>;
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
  requestTransferOtp(userId: string, walletId?: string): Promise<{ otp: string, fee_charged: number }>;
  initiateSingleTransferWithOtp(userId: string, data: SingleTransferWithOtpInput): Promise<void>;
  initiateBulkTransferWithOtp(userId: string, data: BulkTransferWithOtpInput): Promise<void>;
  
  // 6. Pre-Registration KYC
  submitBusinessKyc(data: any): Promise<string>; // Returns reference ID
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private kycStatus: Map<string, KycStatus>;
  private wallets: Map<string, WalletInfo>;
  private payrolls: Map<string, PayrollEmployee[]>;
  private payrollConfigs: Map<string, PayrollConfig>;
  private transfers: Map<string, Transfer[]>;
  private otps: Map<string, string>; // userId -> otp
  private kycPendingType: Map<string, 'bvn' | 'nin'>;
  
  // New Maps
  private businessProfiles: Map<string, BusinessProfile>;
  private otpPreferences: Map<string, "email" | "sms" | "both">;
  private contactUpdateOtps: Map<string, { otp: string, type: "email" | "phone", value: string }>;
  private transferOtps: Map<string, string>;
  private tempKycData: Map<string, any>;

  constructor() {
    this.users = new Map();
    this.kycStatus = new Map();
    this.wallets = new Map();
    this.payrolls = new Map();
    this.payrollConfigs = new Map();
    this.transfers = new Map();
    this.otps = new Map();
    this.kycPendingType = new Map();
    
    // New Maps Init
    this.businessProfiles = new Map();
    this.otpPreferences = new Map();
    this.contactUpdateOtps = new Map();
    this.transferOtps = new Map();
    this.tempKycData = new Map();
    
    // Seed some data
    this.seed();
  }

  private seed() {
    // Mock user will be handled dynamically or assumed via middleware
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.email === email);
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
      this.wallets.set(userId, {
        user_wallet: {
          id: `w_${userId}`,
          balance: 0,
          currency: "NGN",
          account_number: "99" + Math.floor(Math.random() * 100000000),
          bank_name: "Metro Bank",
          type: "user"
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
    
    return this.wallets.get(userId) || {
        user_wallet: { // Return a default one for demo if not strictly enforced yet
             id: `w_demo_${userId}`,
             balance: 0,
             currency: "NGN",
             account_number: "Not Created",
             bank_name: "N/A",
             type: "user"
        }
    };
  }

  async fundWallet(userId: string, data: FundWalletInput): Promise<{ payment_url: string }> {
    // Simulate funding
    await this.ensureWallet(userId);
    const wallet = this.wallets.get(userId)!;
    
    if (data.wallet_type === 'user') {
        wallet.user_wallet.balance += data.amount;
    } else if (wallet.business_wallet) {
        wallet.business_wallet.balance += data.amount;
    }
    
    this.wallets.set(userId, wallet);
    return { payment_url: "https://checkout.squadco.com/test-payment" };
  }

  async createBusinessWallet(userId: string, data: CreateBusinessWalletInput): Promise<BusinessWallet> {
    await this.ensureWallet(userId);
    console.log("Creating business wallet with KYC ID:", data.kycReferenceId);
    const walletInfo = this.wallets.get(userId)!;
    
    const newBusinessWallet: BusinessWallet = {
      id: `bw_${userId}`,
      balance: 0,
      currency: "NGN",
      account_number: data.gtb_account_number,
      bank_name: "GTBank",
      type: "business",
      business_name: data.business_name
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
        employees[idx].net_salary = employees[idx].salary + employees[idx].bonuses_total - employees[idx].deductions_total;
        this.payrolls.set(bid, employees);
        return employees[idx];
      }
    }
    throw new Error("Employee not found");
  }

  async addPayrollAdjustment(userId: string, type: "bonus" | "deduction", amount: number, reason: string): Promise<void> {
     for (const [bid, employees] of this.payrolls.entries()) {
      const idx = employees.findIndex(e => e.id === userId);
      if (idx !== -1) {
        if (type === 'bonus') employees[idx].bonuses_total += amount;
        else employees[idx].deductions_total += amount;
        
        employees[idx].net_salary = employees[idx].salary + employees[idx].bonuses_total - employees[idx].deductions_total;
        this.payrolls.set(bid, employees);
        return;
      }
    }
  }

  // Transfers
  async initiateBulkTransfer(userId: string, data: BulkTransferInput): Promise<void> {
    const transfers = this.transfers.get(userId) || [];
    
    // Simulate creating transfers based on payroll
    // In real app, this would use data.source_wallet_id to debit
    
    // Just create a mock transfer record
    transfers.push({
      id: `trf_${Date.now()}`,
      amount: 650000, // Sum of mock salaries
      currency: "NGN",
      status: "success",
      recipient_name: "Bulk Payroll Run",
      created_at: new Date().toISOString()
    });
    
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

  async resolveAccount(bankCode: string, accountNumber: string): Promise<{account_name: string, account_number: string}> {
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
  async requestTransferOtp(userId: string, walletId?: string): Promise<{ otp: string, fee_charged: number }> {
    const otp = "123456";
    this.transferOtps.set(userId, otp);
    
    // Calculate fee based on preference (mock logic)
    // We need businessId, but storage method signature only has userId.
    // In real app we'd lookup businessId from userId.
    // Assuming mock businessId
    const businessId = "biz_123"; 
    const pref = await this.getOtpPreference(businessId);
    let fee = 0;
    if (pref.preference !== 'email') {
        fee = 4; // Mock SMS fee
    }

    return { otp, fee_charged: fee };
  }

  async initiateSingleTransferWithOtp(userId: string, data: SingleTransferWithOtpInput): Promise<void> {
    const storedOtp = this.transferOtps.get(userId);
    if (storedOtp !== data.otp) {
        throw new Error("Invalid OTP");
    }
    
    // Process transfer
    const transfers = this.transfers.get(userId) || [];
    transfers.push({
      id: `trf_${Date.now()}`,
      amount: data.amount,
      currency: "NGN",
      status: "success",
      recipient_name: data.accountName,
      created_at: new Date().toISOString()
    });
    this.transfers.set(userId, transfers);
    
    // Clear OTP
    this.transferOtps.delete(userId);
  }

  async initiateBulkTransferWithOtp(userId: string, data: BulkTransferWithOtpInput): Promise<void> {
    const storedOtp = this.transferOtps.get(userId);
    if (storedOtp !== data.otp) {
        throw new Error("Invalid OTP");
    }

    // Process bulk transfer
    const transfers = this.transfers.get(userId) || [];
    const totalAmount = data.data.items.reduce((sum, item) => sum + item.amount, 0);
    
    transfers.push({
        id: `trf_bulk_${Date.now()}`,
        amount: totalAmount,
        currency: "NGN",
        status: "success",
        recipient_name: `Bulk Transfer (${data.data.items.length} items)`,
        created_at: new Date().toISOString()
    });
    this.transfers.set(userId, transfers);
    
    this.transferOtps.delete(userId);
  }

  // 6. Pre-Registration KYC
  async submitBusinessKyc(data: any): Promise<string> {
    const kycId = `kyc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.tempKycData.set(kycId, {
      ...data,
      submittedAt: new Date().toISOString()
    });
    return kycId;
  }
}

export const storage = new MemStorage();
