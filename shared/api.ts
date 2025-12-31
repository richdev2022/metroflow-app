/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

// Business Types
export interface Business {
  id: string;
  name: string;
  email: string;
  industry?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// User Types (replaces Developer)
export interface User {
  id: string;
  businessId: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "member";
  status: "active" | "invited" | "inactive";
  emailVerified: boolean;
  verifiedAt?: string;
  joinedAt?: string;
  inviteToken?: string;
  inviteExpiresAt?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

// Team Member types (formerly Developer)
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "member";
  status: "active" | "invited" | "inactive";
  joinedAt?: string;
}

export interface InviteTeamMemberInput {
  name: string;
  email: string;
  role: "admin" | "manager" | "member";
}

// Task Types
export interface Task {
  id: string;
  businessId: string;
  createdBy: string;
  title: string;
  description?: string;
  epic?: string;
  epicId?: string;
  sprint?: string;
  targetValue: number;
  accomplishedValue: number;
  startDate: string;
  endDate: string;
  dueDate?: string;
  status: "pending" | "in_progress" | "completed";
  isOverdue: boolean;
  assignedTo?: string[];
  attachments?: Attachment[];
  comments?: Comment[];
  images?: string[]; // Array of image URLs
  createdAt: string;
  updatedAt: string;
}

// Attachment Types
export interface Attachment {
  id: string;
  taskId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  isImage: boolean;
  uploadedBy: string;
  createdAt: string;
}

// Epic Types
export interface Epic {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  status: "active" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface Reaction {
  userId: string;
  userName?: string;
  type: "like" | "love" | "laugh";
}

// Idea Types
export interface Idea {
  id: string;
  businessId: string;
  userId: string;
  userName?: string; // Populated from join
  title: string;
  description: string;
  status: "under_review" | "executed" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface CreateIdeaInput {
  title: string;
  description: string;
}

export interface UpdateIdeaStatusInput {
  status: "under_review" | "executed" | "rejected";
}

// Comment Types with threading
export interface Comment {
  id: string;
  taskId?: string;
  epicName?: string;
  epicId?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  parentCommentId?: string;
  content: string;
  mentions: Array<{ type: "user" | "task"; id: string }>;
  replies?: Comment[];
  reactions?: Reaction[];
  createdAt: string;
  updatedAt: string;
}

// Task Assignment
export interface TaskAssignment {
  id: string;
  taskId: string;
  userId: string;
  assignedBy: string;
  assignedAt: string;
}

// KPI Dashboard Types
export interface KPISummary {
  current: {
    total: number;
    completed: number;
    percentageCompletion: number;
  };
  monthly: {
    total: number;
    completed: number;
    percentageCompletion: number;
    targetVsAccomplishment: {
      target: number;
      accomplished: number;
    };
  };
  epics?: Record<string, {
    total: number;
    completed: number;
    percentageCompletion: number;
    startDate?: string;
    endDate?: string;
    assignedTo?: string[];
  }>;
  overdueTasks: Task[];
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Authentication Types
export interface RegisterBusinessInput {
  businessName: string;
  businessEmail: string;
  businessIndustry?: string;
  adminName: string;
  adminEmail: string;
  password: string;
  kycReferenceId?: string; // Link to pre-submitted KYC
  gtbAccount?: string; // New field
}

export interface BusinessKycInput {
  country: string;
  state: string;
  city: string;
  street: string;
  house_number: string;
  proof_of_address?: any; // File handling is usually separate or FormData
}

// KYC Types
export interface KycStatus {
  user_kyc_status: "none" | "pending" | "verified" | "rejected";
  business_kyc_status: "none" | "pending" | "verified" | "rejected";
  bvn_verified: boolean;
  nin_verified: boolean;
}

export interface KycInitiateInput {
  type: "bvn" | "nin";
  number: string;
}

export interface KycVerifyOtpInput {
  otp: string;
}

// Wallet Types
export interface Wallet {
  id: string;
  balance: number;
  currency: string;
  account_number: string;
  bank_name: string;
  type: "user" | "business";
}

export interface BusinessWallet extends Wallet {
  business_name: string;
}

export interface WalletInfo {
  user_wallet: Wallet;
  business_wallet?: BusinessWallet;
}

export interface FundWalletInput {
  amount: number;
  wallet_type: "business" | "user";
}

export interface CreateBusinessWalletInput {
  gtb_account_number: string;
  business_name: string;
  kycReferenceId?: string;
}

// Payroll Types
export interface PayrollEmployee {
  id: string; // User ID
  name: string;
  email: string;
  salary: number | string;
  salary_currency: string;
  bank_account_number?: string | null;
  bank_code?: string | null;
  account_name?: string | null;
  role: string;
  bonuses_total: number;
  deductions_total: number;
  net_salary: number;
  next_pay_date: string;
  salary_calculation_status: string;
  adjustments?: {
    bonuses: number;
    deductions: number;
    bonus_list: AdjustmentItem[];
    deduction_list: AdjustmentItem[];
  };
}

export interface PayrollConfig {
  salary_interval: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  salary_custom_date?: string | null;
}

export interface PayrollConfigUpdateInput {
  salary_interval: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  salary_custom_date?: string | null;
}

export interface AdjustmentItem {
  user_id: string;
  type: "bonus" | "deduction";
  amount: string;
  currency: string;
}

export interface PayrollAdjustment {
  id: string;
  business_id: string;
  user_id: string;
  type: "bonus" | "deduction";
  amount: string;
  currency: string;
  reason: string;
  status: "pending" | "processed";
  transfer_id?: string | null;
  created_at: string;
  updated_at: string;
  processed_at?: string | null;
  user_name?: string;
  user_email?: string;
}

export interface PayrollUpdateInput {
  salary: number;
  salary_currency: string;
  bank_code: string;
  account_number: string;
  account_name?: string;
}

export interface PayrollAdjustmentInput {
  userId: string;
  type: "bonus" | "deduction";
  amount: number;
  reason: string;
}

export interface BulkTransferInput {
  type: "salary" | "manual" | "sprint" | "task";
  source_wallet_id: string;
  data?: any;
}

export interface Transfer {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed";
  recipient_name: string;
  failure_reason?: string;
  created_at: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface OTPVerificationInput {
  email: string;
  otpCode: string;
}

export interface ResendOTPInput {
  email: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface VerifyResetOTPInput {
  email: string;
  otpCode: string;
}

export interface ResetPasswordInput {
  email: string;
  otpCode: string;
  newPassword: string;
}

export interface AuthResponse {
  success: boolean;
  userId?: string;
  businessId?: string;
  token?: string;
  requiresOtp?: boolean;
  message?: string;
}

// Task Creation with new fields
export interface CreateTaskInput {
  title: string;
  description?: string;
  epic?: string;
  epicId?: string;
  sprint?: string;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  assignedTo?: string[];
  images?: string[]; // Array of image URLs or base64 data
}

// Bulk Task Creation from Excel
export interface BulkTaskInput {
  tasks: CreateTaskInput[];
}

// User Invitation
export interface InviteUserInput {
  name: string;
  email: string;
  role: "admin" | "manager" | "developer";
}

// Legacy Developer invitation (for backward compatibility)
export interface InviteDeveloperInput {
  name: string;
  email: string;
  role: "admin" | "manager" | "developer";
}

// Comment Creation
export interface CreateCommentInput {
  taskId?: string;
  epicName?: string;
  epicId?: string;
  content: string;
  parentCommentId?: string;
  mentions?: Array<{ type: "user" | "task"; id: string }>;
}

// Task Assignment
export interface AssignTaskInput {
  taskIds: string[];
  userIds: string[];
}

// Epic Counts for pagination fix
export interface EpicCounts {
  [epic: string]: number;
}

export interface DemoResponse {
  message: string;
}

// Subscription Types
export interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  max_team_members: number;
  trial_days: number;
}

export interface Subscription {
  id: string;
  name: string;
  subscription_status: "active" | "cancelled" | "past_due";
  trial_ends_at: string | null;
  plan_id: string;
  plan_name: string;
  plan_price: string;
  max_team_members: number;
  features: string[];
  team_usage: number;
  next_due_subscription_date?: string;
}

export interface Card {
  id: string;
  last4: string;
  card_type: string;
  exp_month: string;
  exp_year: string;
  is_active: boolean;
}

export interface PaymentTransaction {
  id: string;
  business_id?: string;
  plan_id?: string;
  amount: number | string;
  currency: string;
  reference: string;
  status: string;
  gateway_response?: any;
  created_at: string;
  updated_at?: string;
  transaction_type?: string;
  plan_name?: string;
}

// --- New Features Types ---

// 1. Business Profile Management
export interface BusinessProfile {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  industry: string;
  logo_url: string;
  currency: string;
}

export interface UpdateBusinessProfileInput {
  name?: string;
  industry?: string;
  logo_url?: string;
  currency?: "NGN" | "USD";
}

// 2. Contact Information Updates
export interface RequestContactUpdateOtpInput {
  type: "email" | "phone";
  value: string;
}

export interface VerifyContactUpdateOtpInput {
  otp: string;
}

// 3. Transaction OTP Preferences
export interface OtpPreferenceResponse {
  preference: "email" | "sms" | "both";
}

export interface UpdateOtpPreferenceInput {
  preference: "email" | "sms" | "both";
}

// 4. Fee Transparency
export interface FeeConfig {
  id: string;
  name: string;
  fee_type: string;
  config_type: "flat" | "percentage_cap" | "flat_conditional" | "range";
  config: {
    amount?: number;
    percentage?: number;
    cap?: number;
    conditions?: Array<{
      fee: number;
      operator: string;
      threshold: number;
    }>;
    ranges?: Array<{
      min: number;
      max: number;
      fee: number;
    }>;
  };
  currency: string;
}

// 5. Transfer Authorization
export interface RequestTransferOtpInput {
  wallet_id?: string;
}

export interface SingleTransferWithOtpInput {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  remark: string;
  otp: string;
  wallet_id: string;
}

export interface BulkTransferWithOtpInput {
  type: "salary" | "manual" | "sprint" | "task";
  source_wallet_id: string;
  otp: string;
  data: {
    items: Array<{
      amount: number;
      bankCode: string;
      accountNumber: string;
    }>;
  };
}
