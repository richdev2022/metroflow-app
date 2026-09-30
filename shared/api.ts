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
  businessId?: string;
  createdBy?: string;
  title: string;
  description?: string | null;
  epic?: string;
  epicId?: string | null;
  sprint?: string;
  targetValue: number | string;
  accomplishedValue: number | string;
  startDate: string;
  endDate: string;
  dueDate?: string | null;
  status: string;
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
export interface VirtualAccount {
  id: string;
  wallet_id: string;
  payment_provider: string;
  virtual_account_number: string;
  bank_code: string;
  /** Human-readable bank name resolved by the backend (from provider metadata or bank-code lookup) */
  bank_name?: string | null;
  account_name: string;
  customer_identifier: string;
  beneficiary_account: string;
  provider_metadata: any;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface Wallet {
  id: string;
  business_id?: string | null;
  user_id?: string | null;
  balance: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  virtual_accounts: VirtualAccount[];
  // Keep old fields for backward compatibility
  account_number?: string;
  bank_name?: string;
  type?: "user" | "business";
}

export interface BusinessWallet extends Wallet {
  business_name?: string;
}

export interface WalletInfo {
  success: boolean;
  user_wallet?: Wallet;
  business_wallet?: Wallet;
}

export interface CreateVirtualAccountInput {
  accountType: "Personal" | "Business";
}

export interface FundWalletInput {
  amount: number;
  wallet_id: string;
  redirect_url: string;
}

// New types from Payroll docs

export interface TransferItem {
  recipient_account: string;
  recipient_bank: string;
  recipient_name: string;
  amount: number;
  remark?: string;
  source_type?: string;
  source_id?: string;
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
  account_number?: string | null;
  bank_code?: string | null;
  account_name?: string | null;
  role: string;
  bonuses_total: number;
  deductions_total: number;
  net_salary: number;
  next_pay_date: string;
  salary_calculation_status: string;
  contract_start_date?: string;
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

/**
 * Employee row from GET /payroll/employees (full directory with recipient +
 * verification details). Distinct from PayrollEmployee which is the
 * /payroll/summary shape.
 */
export interface PayrollDirectoryEmployee {
  id: string;
  name: string;
  email: string;
  role: string;
  job_title?: string | null;
  department?: string | null;
  phone_number?: string | null;
  status?: string;
  salary_amount?: number | string | null;
  salary_currency?: string | null;
  bank_code?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  bank_name?: string | null;
  bank_country?: string | null;
  swift_code?: string | null;
  routing_number?: string | null;
  beneficiary_address?: string | null;
  beneficiary_city?: string | null;
  beneficiary_country?: string | null;
  verification_status?: "unverified" | "verified" | "failed" | "pending" | string | null;
  verified_account_name?: string | null;
  verified_at?: string | null;
  verification_error?: string | null;
  avatar_url?: string | null;
  contract_start_date?: string | null;
  created_at?: string;
}

export interface PayrollDirectoryResponse {
  success: boolean;
  data: PayrollDirectoryEmployee[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface VerifyEmployeeResult {
  id: string;
  name: string;
  success: boolean;
  account_name?: string;
  error?: string;
}

export interface VerifyBulkResponse {
  success: boolean;
  data: {
    total: number;
    verified: number;
    failed: number;
    results: VerifyEmployeeResult[];
  };
}

export interface EmployeeImportRow {
  name: string;
  email: string;
  role?: string;
  phone_number?: string;
  department?: string;
  job_title?: string;
  salary?: number | string;
  salary_currency?: string;
  currency?: string;
  bank_code?: string;
  account_number?: string;
  account_name?: string;
  bank_name?: string;
  swift_code?: string;
  routing_number?: string;
  beneficiary_address?: string;
  beneficiary_city?: string;
  beneficiary_country?: string;
  contract_start_date?: string;
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

export interface BulkTransferItem {
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  remark?: string;
}

export interface BulkTransferInput {
  type: "Salary" | "Epic" | "manual" | "sprint" | "task";
  source_wallet_id: string;
  otp: string;
  data: {
    items: BulkTransferItem[];
  };
}

export interface BulkTransferResponseData {
  queued: number;
  type: string;
  walletId: string;
  totals: {
    amount: number;
    fee: number;
    total: number;
  };
  transfers: Transfer[];
  /** Salary payouts only: employees skipped because their account is not verified */
  unverified_employees?: Array<{
    id: string;
    name: string;
    verification_status?: string;
  }>;
}

export interface BulkTransferResponse {
  success: boolean;
  message: string;
  data: BulkTransferResponseData;
}

export interface Transfer {
  id: string;
  business_id: string;
  reference: string;
  recipient_account?: string | null;
  recipient_bank?: string | null;
  recipient_name: string | null;
  amount: number | string;
  currency: string;
  remark?: string | null;
  status: "pending" | "success" | "failed" | string;
  failure_reason?: string | null;
  source_type?: string;
  source_id?: string | null;
  meta_data?: any;
  created_at: string;
  updated_at: string;
  wallet_id: string;
  fee?: string | number | null;
  payment_provider?: string;
  provider_metadata?: any;
  /**
   * GET /transfers returns a merged ledger: outgoing payouts come from
   * transfer_queue (type === 'transfer', direction 'debit') while wallet
   * funding / refunds / fee credits come from transactions (type ===
   * 'transaction', direction 'credit').
   */
  type?: "transfer" | "transaction";
  direction?: "credit" | "debit" | string;
  transaction_type?: string;
  description?: string | null;
}

// Wallet ledger transaction (GET /wallet/history)
export interface WalletTransaction {
  id: string;
  business_id?: string | null;
  wallet_id: string | null;
  reference: string;
  direction: "credit" | "debit" | string;
  transaction_type: string;
  amount: number | string;
  currency?: string | null;
  wallet_currency?: string | null;
  status: string;
  fee?: number | string | null;
  description?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface WalletHistoryWallet {
  id: string;
  currency: string;
  balance: string | number;
}

export interface WalletHistoryResponse {
  success: boolean;
  data: WalletTransaction[];
  wallets: WalletHistoryWallet[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface WalletHistoryFilters {
  wallet_id?: string;
  direction?: "credit" | "debit" | "";
  type?: string;
  search?: string;
  min_amount?: string;
  max_amount?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
  format?: "json" | "csv";
}

// International payout quote (GET /transfers/quote)
export interface TransferQuote {
  source_currency: string;
  destination_currency: string;
  amount: number;
  live_rate: number;
  markup_percent: number;
  marked_up_rate: number;
  receiving_amount: number;
  fee: number;
  total_debit: number;
  provider?: string;
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
  /** Authenticated user's display name — clients greet the user by NAME,
   *  regardless of whether they logged in with password, OTP or Google. */
  name?: string;
  email?: string;
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
  discount?: string; // Discount Amount
  duration?: "monthly" | "yearly";
  currency?: string;
  description: string;
  features: string[];
  max_team_members: number;
  trial_days: number;
  // RTC / feature limits configured from admin
  max_meeting_duration?: number | null;
  max_participants?: number | null;
  max_recording_duration?: number | null;
  max_recording_storage?: number | null;
  waiting_room_enabled?: boolean;
  recording_enabled?: boolean;
  screen_sharing_enabled?: boolean;
  breakout_rooms_enabled?: boolean;
  virtual_backgrounds?: boolean;
  live_captions?: boolean;
}

export interface Subscription {
  id: string;
  name: string;
  subscription_status: "active" | "cancelled" | "past_due";
  trial_ends_at: string | null;
  plan_id: string;
  plan_name: string;
  plan_price: string;
  plan_discount?: string;
  max_team_members: number;
  features: string[];
  permissions?: string[] | null;
  trial_days?: number | null;
  duration?: string | null;
  max_meeting_duration?: number | null;
  max_participants?: number | null;
  max_recording_duration?: number | null;
  max_recording_storage?: number | null;
  waiting_room_enabled?: boolean;
  recording_enabled?: boolean;
  screen_sharing_enabled?: boolean;
  breakout_rooms_enabled?: boolean;
  virtual_backgrounds?: boolean;
  live_captions?: boolean;
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
  /** IANA timezone used to render dates/times across the app (default: UTC) */
  timezone?: string;
  /** Clock format used to render times across the app (default: "24h") */
  time_format?: "12h" | "24h";
}

export interface UpdateBusinessProfileInput {
  name?: string;
  industry?: string;
  logo_url?: string;
  currency?: "NGN" | "USD";
  timezone?: string;
  time_format?: "12h" | "24h";
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
  preference: "email" | "sms" | "whatsapp" | "both";
}

export interface UpdateOtpPreferenceInput {
  preference: "email" | "sms" | "whatsapp" | "both";
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

// 5. Settings - OTP Enabled & PIN Status
export interface OtpEnabledResponse {
  success: boolean;
  otpEnabled: boolean;
  pinCreated: boolean;
}

export interface UpdateOtpEnabledInput {
  enabled: boolean;
}

// 6. Transaction PIN Management
export interface CreatePinInput {
  pin: string;
}

export interface UpdatePinInput {
  newPin: string;
  otp: string;
}

// 7. Transfer Authorization
export interface RequestTransferOtpInput {
  otp_method?: "whatsapp" | "sms" | "email";
  wallet_id?: string;
}

export interface SingleTransferWithOtpInput {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  remark: string;
  otp?: string;
  pin: string;
  wallet_id: string;
}

export interface BulkTransferWithOtpInput {
  type: "Salary" | "Epic" | "salary" | "manual" | "sprint" | "task";
  source_wallet_id: string;
  otp?: string;
  pin: string;
  data: {
    items: Array<{
      amount: number;
      bankCode: string;
      accountNumber: string;
      accountName?: string;
      remark?: string;
    }>;
  };
}

// 8. KYC Initiate with OTP method
export interface KycInitiateInput {
  type: "bvn" | "nin";
  number: string;
  otp_method?: "whatsapp" | "sms" | "email";
}

// Task Status Types
export interface TaskStatus {
  id: string;
  business_id: string;
  name: string;
  color: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Board Types
export interface BoardColumn {
  id: string;
  business_id: string;
  name: string;
  color: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  tasks: Task[];
}

export interface CreateTaskStatusInput {
  name: string;
  color?: string;
  sort_order?: number;
}

export interface UpdateTaskStatusInput {
  name?: string;
  color?: string;
  sort_order?: number;
}

// --- Meetings, Chat & Calls Types ---

export type ValidateAccessState =
  | 'allowed'
  | 'password_required'
  | 'waiting_room'
  | 'not_started'
  | 'full'
  | 'ended'
  | 'completed'
  | 'cancelled'
  | 'missed';

export interface ValidateCallResponse {
  accessState: ValidateAccessState;
  call?: Call;
  callLink?: string;
  hasPassword: boolean;
  inWaitingRoom?: boolean;
  isHost?: boolean;
  message?: string;
  startsInMs?: number;
}

export interface ValidateMeetingResponse {
  accessState: ValidateAccessState;
  meeting?: Meeting;
  meetingLink?: string;
  hasPassword: boolean;
  inWaitingRoom?: boolean;
  isHost?: boolean;
  message?: string;
  startsInMs?: number;
}

// Meeting Types
export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string | null;
  timezone: string;
  createdById: string;
  hostId: string;
  coHostId?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  meetingCode: string;
  meetingLink?: string;
  isInstant: boolean;
  password?: string;
  hasPassword?: boolean;
  maxParticipants: number;
  maxMeetingDuration?: number | null;
  endedAt?: string | null;
  durationStartedAt?: string | null;
  waitingRoomEnabled: boolean;
  recordingEnabled: boolean;
  screenSharingEnabled: boolean;
  googleEventId?: string;
  createdAt: string;
  updatedAt: string;
  inWaitingRoom?: boolean;
  isHost?: boolean;
  attendees: Array<{
    id: string;
    userId: string;
    status: 'invited' | 'accepted' | 'declined' | 'tentative';
    userName?: string;
    isHost?: boolean;
    joinedAt?: string;
    leftAt?: string;
  }>;
  participants?: Array<{
    id: string;
    userId: string;
    status: 'invited' | 'joined' | 'left';
    userName?: string;
    isHost?: boolean;
    joinedAt?: string;
    leftAt?: string;
  }>;
}

export interface CreateMeetingInput {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timezone: string;
  isInstant: boolean;
  password?: string;
  maxParticipants: number;
  waitingRoomEnabled: boolean;
  recordingEnabled: boolean;
  screenSharingEnabled: boolean;
  attendeeIds: string[];
}

export interface UpdateMeetingInput {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  isInstant?: boolean;
  password?: string;
  maxParticipants?: number;
  waitingRoomEnabled?: boolean;
  recordingEnabled?: boolean;
  screenSharingEnabled?: boolean;
  attendeeIds?: string[];
  status?: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
}

// Chat Types
export interface Conversation {
  id: string;
  businessId?: string;
  name?: string;
  type: 'direct' | 'group';
  createdBy: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  participants: Array<{
    id: string;
    userId: string;
    lastReadAt?: string;
    lastSeen?: string | null;
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  }>;
  lastMessage?: string;
  lastmessage?: string;
  lastMessageAt?: string;
  lastmessageat?: string;
}

export interface CreateConversationInput {
  name?: string;
  type: 'direct' | 'group';
  participantIds: string[];
}

export interface MessageReplySnapshot {
  id: string;
  senderId?: string;
  senderName?: string | null;
  content?: string | null;
  messageType?: string | null;
  attachmentType?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  attachmentUrl?: string;
  attachmentType?: string;
  /**
   * WhatsApp-style attachment metadata (batch 3). `messageType` classifies the
   * bubble: text | image | video | audio | document | gif | sticker | voice.
   * The server reserves 'call-log' for system call summaries (content is a
   * JSON string of ChatCallLogMeta).
   */
  attachmentName?: string;
  attachment_name?: string;
  attachmentSize?: number;
  attachment_size?: number;
  messageType?: MessageTypeName | 'call-log' | string;
  message_type?: string;
  createdAt: string;
  senderName?: string;
  /** Present when the message body was edited (PATCH messages/:mid). */
  editedAt?: string | null;
  edited_at?: string | null;
  /** Tombstone flags (DELETE ?scope=everyone|me). */
  deletedForEveryone?: boolean | null;
  deleted_for_everyone?: boolean | null;
  deletedForMe?: boolean | null;
  deleted_for_me?: boolean | null;
  /** Quoted-parent snapshot when the message was sent as a reply. */
  replyTo?: MessageReplySnapshot | null;
  reply_to?: MessageReplySnapshot | null;
}

export type MessageTypeName =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'gif'
  | 'sticker'
  | 'voice';

/** Payload of a `messageType === 'call-log'` chat message (content is JSON). */
export interface ChatCallLogMeta {
  callType: 'audio' | 'video';
  status: 'completed' | 'missed' | 'cancelled' | 'declined' | 'no-answer';
  durationSeconds: number | null;
  initiatorName: string | null;
  callCode: string | null;
  /** Present on newer payloads — links the row to GET /calls/:id. */
  callId?: string | null;
  conversationId?: string | null;
  hasTranscript?: boolean | null;
  endedAt?: string | null;
}

export interface SendMessageInput {
  /** Caption / text body. Optional for pure-attachment messages. */
  content?: string;
  attachmentUrl?: string;
  attachmentType?: string;
  attachmentName?: string;
  attachmentSize?: number;
  messageType?: MessageTypeName;
  /** Id of the message being quoted/replied to. */
  replyToId?: string;
}

export interface CreateCallInput {
  type: 'audio' | 'video';
  isGroupCall: boolean;
  password?: string;
  maxParticipants: number;
  waitingRoomEnabled: boolean;
  recordingEnabled: boolean;
  participantIds: string[];
  /** Links the call to a chat conversation so a call-log message is posted. */
  conversation_id?: string;
  conversationId?: string;
}

// Call Types
export interface Call {
  id: string;
  name?: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'ongoing' | 'completed' | 'missed' | 'cancelled';
  startedAt?: string;
  endedAt?: string;
  durationStartedAt?: string | null;
  /** Talk-time in seconds (completed calls): endedAt - durationStartedAt|startedAt */
  duration?: number | null;
  createdById: string;
  hostId: string;
  coHostId?: string;
  callCode: string;
  callLink?: string;
  isGroupCall: boolean;
  password?: string;
  hasPassword?: boolean;
  maxParticipants: number;
  maxMeetingDuration: number | null;
  waitingRoomEnabled: boolean;
  recordingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  inWaitingRoom?: boolean;
  isHost?: boolean;
  participants: Array<{
    id: string;
    userId: string;
    status: 'invited' | 'joined' | 'left';
    userName?: string;
    isHost?: boolean;
    joinedAt?: string;
    leftAt?: string;
  }>;
}

export interface CreateCallInput {
  type: 'audio' | 'video';
  isGroupCall: boolean;
  password?: string;
  maxParticipants: number;
  waitingRoomEnabled: boolean;
  recordingEnabled: boolean;
  participantIds: string[];
}

export interface UpdateCallInput {
  status?: 'ringing' | 'ongoing' | 'completed' | 'missed' | 'cancelled';
  waitingRoomEnabled?: boolean;
  recordingEnabled?: boolean;
  coHostId?: string;
}

// Recording Types
export interface Recording {
  id: string;
  businessId: string;
  meetingId?: string;
  callId?: string;
  recordedById: string;
  recordedByName: string;
  storageUrl: string;
  duration: number;
  status: 'recording' | 'paused' | 'completed' | 'failed';
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecordingInput {
  meetingId?: string;
  callId?: string;
}

export interface UpdateRecordingInput {
  status?: 'recording' | 'paused' | 'completed' | 'failed';
  storageUrl?: string;
  duration?: number;
  size?: number;
}

// Notifications Types
export interface Notification {
  id: string;
  businessId: string;
  userId: string;
  type: 'meeting' | 'task' | 'chat' | 'call' | 'credit' | 'debit' | string;
  title: string;
  message: string;
  actionUrl: string | null;
  actionType: string | null;
  metadata: any | null;
  isRead: boolean;
  isActionable: boolean;
  actionTaken: string | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}

export interface GetNotificationsResponse {
  success: boolean;
  data: {
    notifications: Notification[];
    total: number;
  };
}

export interface GetNotificationsQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface TakeNotificationActionInput {
  action: string;
}

// Add Participants
export interface AddParticipantsInput {
  /** Business user ids to add (team-member path) */
  participantIds?: string[];
  /** External emails to invite (they join as guests via the public link) */
  emails?: string[];
}

export interface AddParticipantsResponse {
  success: boolean;
  message: string;
  data: {
    added: string[];
    invitedEmails?: string[];
  };
}

// ==========================================
// GIFs (Tenor proxy — GET /chat/gifs)
// ==========================================

export interface GifObject {
  id: string;
  description: string;
  /** Full-size GIF URL (sent as the message attachment). */
  url: string;
  /** Small preview used in the picker grid. */
  previewUrl: string;
}

export interface ChatGifsResult {
  /** false when TENOR_API_KEY is not configured server-side (hide the GIF tab). */
  configured: boolean;
  gifs: GifObject[];
}

// ==========================================
// MetricAi (GET/POST /ai/* — plan-gated)
// ==========================================

export interface MetricAiStatus {
  /** Plan includes MetricAi. */
  enabled: boolean;
  /** GLM_API_KEY configured server-side. */
  serverConfigured: boolean;
  /** enabled && serverConfigured — the flag the UI should gate on. */
  available: boolean;
  planName: string | null;
  chatModel: string | null;
  imageModel: string | null;
  /** Per-feature daily/monthly caps configured by admins for this plan (null = unlimited). */
  limits?: MetricAiLimits;
  /** Live usage vs the caps (drives the quota chips in the chat header). */
  usage?: Record<string, MetricAiFeatureUsage>;
  /** Error code, e.g. 'metric_ai_not_enabled' on 403. */
  code?: string;
  upgradeRequired?: boolean;
}

export interface MetricAiFeatureLimit {
  daily: number | null;
  monthly: number | null;
}

export interface MetricAiLimits {
  chat: MetricAiFeatureLimit;
  image: MetricAiFeatureLimit;
  video: MetricAiFeatureLimit;
}

export interface MetricAiFeatureUsage {
  daily: { used: number; limit: number | null; resetsAt: string };
  monthly: { used: number; limit: number | null; resetsAt: string };
}

export interface MetricAiUsageResult {
  usage: Record<string, MetricAiFeatureUsage>;
  limits: MetricAiLimits;
  planName: string | null;
}

export interface MetricAiAttachmentResult {
  url: string;
  filename: string | null;
  mimeType: string;
  size: number;
  attachmentType: 'image' | 'video' | 'file';
  storage?: string;
}

export interface MetricAiChatResult {
  id: string;
  reply: string;
  /** Present when the assistant generated an image (CogView/Pollinations) for the ask. */
  imageUrl: string | null;
  /** Echo of the user's attachment for optimistic rendering. */
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  /** Present when the ask started an async video job — poll GET /ai/video/{id}. */
  videoJob?: { id: string; status: string } | null;
  model: string;
  /** True when MetricAi couldn't help and suggests handing off to human support. */
  suggestHumanSupport: boolean;
  createdAt: string;
}

export interface MetricAiVideoJobResult {
  id: string;
  status: 'processing' | 'success' | 'failed';
  videoUrl: string | null;
  coverUrl: string | null;
  error: string | null;
  createdAt: string;
}

export interface MetricAiHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  videoCoverUrl?: string | null;
  /** User attachment (image paste/attach or video attach). */
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  createdAt: string;
}

export interface MetricAiHistoryResult {
  messages: MetricAiHistoryMessage[];
  total: number;
  page: number;
  limit: number;
}
