export type VerificationType = 'NIN' | 'BVN';

export type PackingCycle = 
  | 'Daily'
  | 'Every Day'
  | 'Every 3 Days'
  | 'Every 4 Days'
  | 'Every 5 Days'
  | 'Every 7 Days'
  | 'Every 14 Days'
  | 'Every Month';

export interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  password?: string;
  role?: 'SUPER_ADMIN' | 'GROUP_ADMIN' | 'MEMBER' | 'superadmin' | 'groupadmin' | 'user' | string;
  bank_name: string;
  account_number: string;
  verification_type: VerificationType;
  verification_number: string;
  whatsapp_number?: string;
  whatsappNumber?: string;
  created_at: string;
}

export interface PersonalAjo {
  id: string;
  user_id: string;
  balance: number;
  total_deposited: number;
  total_withdrawn: number;
  status: 'pending_fee' | 'active';
  created_at: string;
}

export interface GroupAjo {
  id: string;
  admin_id: string;
  admin_name: string;
  group_name: string;
  member_limit: number;
  contribution_amount: number;
  cycle_type: PackingCycle;
  packing_amount: number;
  packing_fee: number;
  withdrawalFee?: number;
  group_code: string;
  whatsapp_number?: string;
  whatsappNumber?: string;
  status: 'recruiting' | 'active' | 'round_completed';
  current_round: number;
  currentRound?: number;
  created_at: string;
  round_started_at?: string;
  roundStartedAt?: string;
  nextPackDate?: string;
  next_packing_date?: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  full_name: string;
  phone: string;
  whatsapp_number?: string;
  whatsappNumber?: string;
  bank_name: string;
  account_number: string;
  position: number;
  status: 'active' | 'left' | 'completed';
  current_round_status: 'pending_contribution' | 'contributed' | 'packed';
  hasPackedThisRound?: boolean;
  joined_at: string;
  next_round_consent?: boolean;
}

export interface Contribution {
  id: string;
  group_id: string;
  member_id: string;
  user_id: string;
  round_number: number;
  cycle_number?: number;
  calendar_date?: string;
  amount: number;
  status: 'Paid' | 'Pending';
  reference?: string;
  paid_at?: string;
  created_at?: string;
}

export interface GroupCycleInfo {
  cycleNumber: number;
  intervalDays: number;
  todayDate: string;
  lastPackDate: string | null;
  lastPackMemberId: string | null;
  cycleOpenDate: string;
  scheduledPackDate: string;
  scheduledPackDateDisplay: string;
  nextPackDate?: string;
  nextPackDateDisplay?: string;
  isCycleOpen: boolean;
  hasPackedToday: boolean;
  totalPacked: number;
  allPacked: boolean;
}

export interface PackTransaction {
  id: string;
  group_id: string;
  member_id: string;
  user_id: string;
  member_name: string;
  round_number: number;
  packing_amount: number;
  packing_fee: number; // ₦3,000
  withdrawalFee?: number;
  member_amount: number; // ₦97,000
  memberPayout?: number;
  status: 'completed';
  bank_name: string;
  account_number: string;
  created_at: string;
}

export type UserRole = 'MEMBER' | 'GROUP_ADMIN' | 'SUPER_ADMIN';

export interface Commission {
  id: string;
  group_id: string;
  pack_transaction_id: string;
  packing_fee?: number;
  withdrawalFee?: number;
  admin_amount: number; // Group Admin share (e.g. ₦2,000 for ₦3,000 fee)
  groupAdminShare?: number;
  super_admin_amount: number; // Super Admin share (e.g. ₦1,000 for ₦3,000 fee)
  superAdminShare?: number;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  group_id?: string;
  withdrawal_type: 'personal' | 'admin_commission' | 'super_admin_revenue';
  amount: number;
  fee: number;
  net_amount: number;
  bank_name: string;
  account_number: string;
  account_name?: string;
  status: 'pending' | 'processing' | 'successful' | 'completed' | 'failed';
  reference?: string;
  paystack_transfer_code?: string;
  created_at: string;
}

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'ongoing' | 'abandoned' | 'reversed';

export interface PaymentRecord {
  id: string;
  user_id: string;
  purpose: string;
  amount: number; // in Naira (e.g. 600)
  amount_kobo: number; // in kobo (e.g. 60000)
  currency: string; // 'NGN'
  reference: string;
  status: PaymentStatus;
  gateway_response?: string;
  paid_at?: string;
  channel?: string;
  created_at: string;
  updated_at?: string;
  type?: string;
  paystack_reference?: string;
}

export type CentralLedgerType =
  | 'PERSONAL_DEPOSIT'
  | 'PERSONAL_WITHDRAWAL'
  | 'GROUP_CONTRIBUTION'
  | 'GROUP_PACKING'
  | 'GROUP_ADMIN_FEE'
  | 'SUPER_ADMIN_FEE'
  | 'GROUP_ADMIN_WITHDRAWAL'
  | 'SUPER_ADMIN_WITHDRAWAL';

export interface CentralLedgerEntry {
  id: string;
  reference: string;
  type: CentralLedgerType;
  amount: number;
  group_id?: string;
  group_name?: string;
  user_id?: string;
  user_name?: string;
  phone?: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'PROCESSING' | 'FAILED' | 'successful' | string;
  date: string;
  created_at?: string;
  description?: string;
  details?: string;
  paystack_reference?: string;
}

export interface GroupAdminMemberItem {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  position: number;
  status: 'active' | 'left' | 'completed' | 'replaced';
  current_round_status: 'pending_contribution' | 'contributed' | 'packed';
  hasContributed: boolean;
  hasPacked: boolean;
  scheduledPackDate?: string;
  scheduledPackDateDisplay?: string;
  totalContributed: number;
  bank_name?: string;
  account_number?: string;
  verification_type?: 'NIN' | 'BVN';
  verification_masked?: string;
  verification_status?: string;
  joined_at: string;
  next_round_consent?: boolean;
}

export interface GroupAdminEarningItem {
  id: string;
  date: string;
  group_name: string;
  group_id: string;
  member_name: string;
  member_position: number;
  packed_amount: number;
  packing_fee: number;
  super_admin_share: number;
  group_admin_share: number;
  status: 'SUCCESSFUL';
  reference: string;
}

export interface GroupAdminDashboardData {
  group: GroupAjo;
  currentPacker: GroupMember | null;
  nextPacker: GroupMember | null;
  nextPackingDate: string;
  nextPackingDateDisplay: string;
  totalMembersExpected: number;
  membersJoinedCount: number;
  totalContributionsAmount: number;
  totalPackedAmount: number;
  adminEarnings: {
    totalEarned: number;
    available: number;
    withdrawn: number;
  };
  members: GroupAdminMemberItem[];
  earningsHistory: GroupAdminEarningItem[];
  withdrawals: Withdrawal[];
  transactions: CentralLedgerEntry[];
  adminBankDetails: {
    bank_name: string;
    account_number: string;
    account_name: string;
  };
}

export interface SuperAdminFullData {
  metrics: {
    totalUsers: number;
    personalAjoAccounts: number;
    groupsCount: number;
    groupMembersCount: number;
    totalContributionsAmount: number;
    totalPackingAmount: number;
    totalPlatformEarnings: number;
    totalGroupAdminEarnings: number;
    totalSuperAdminEarnings: number;
    totalWithdrawalsAmount: number;
    pendingWithdrawalsCount: number;
    superAdminAvailableBalance: number;
    superAdminWithdrawnAmount: number;
    totalPersonalPlatformFees?: number;
    totalPersonalWithdrawalFees?: number;
    superAdminCommission?: number;
    totalContributionFees?: number;
  };
  groups: Array<{
    id: string;
    group_name: string;
    group_code: string;
    admin_name: string;
    admin_phone: string;
    member_limit: number;
    members_joined: number;
    contribution_amount: number;
    packing_amount: number;
    packing_fee: number;
    cycle_type: string;
    current_round: number;
    current_packer_name: string | null;
    next_packer_name: string | null;
    next_packing_date: string;
    status: string;
    created_at: string;
  }>;
  members: Array<{
    id: string;
    full_name: string;
    phone: string;
    bank_name?: string;
    account_number?: string;
    account_status?: string;
    group_id: string;
    group_name: string;
    position: number;
    contribution_status: string;
    packing_status: string;
    registration_date: string;
    total_contributed: number;
    total_packed: number;
    has_packed: boolean;
  }>;
  payments: Array<{
    id: string;
    reference: string;
    user_name: string;
    group_name?: string;
    amount: number;
    payment_type: string;
    date: string;
    status: string;
    paystack_reference?: string;
  }>;
  packings: Array<{
    id: string;
    group_name: string;
    member_name: string;
    position: number;
    packed_amount: number;
    packing_fee: number;
    super_admin_share: number;
    group_admin_share: number;
    date: string;
    status: string;
    reference: string;
  }>;
  withdrawals: Array<{
    id: string;
    user_name: string;
    role: string;
    group_name?: string;
    amount: number;
    bank_name: string;
    account_number: string;
    account_name?: string;
    date: string;
    status: 'pending' | 'processing' | 'successful' | 'completed' | 'failed';
    reference?: string;
  }>;
  groupAdmins: Array<{
    admin_id: string;
    admin_name: string;
    phone: string;
    email?: string;
    bank_name: string;
    account_number: string;
    groups_owned_count: number;
    groups_list: string[];
    groups_details?: Array<{
      group_id: string;
      group_name: string;
      group_code: string;
      status: string;
      member_limit: number;
      members_joined: number;
      contribution_amount: number;
      cycle_type: string;
      packing_fee: number;
      created_at: string;
      current_round: number;
      current_packer_name: string | null;
      next_packer_name: string | null;
      next_packing_date: string;
    }>;
    total_group_earnings: number;
    total_withdrawn: number;
    available_balance: number;
    account_status: string;
  }>;
  personalUsers?: Array<{
    id: string;
    user_id: string;
    full_name: string;
    phone: string;
    email?: string;
    bank_name: string;
    account_number: string;
    account_status: string;
    balance: number;
    total_deposited: number;
    total_withdrawn: number;
    created_at: string;
  }>;
  superAdminWallet?: SuperAdminWallet;
  adminRevenueLedger?: AdminRevenueLedgerEntry[];
  super_admin_wallet?: SuperAdminWallet;
  admin_revenue_ledger?: AdminRevenueLedgerEntry[];
  superAdminEarnings: {
    totalEarnings: number;
    total_earned: number;
    available_balance: number;
    total_withdrawn: number;
    pending_withdrawals: number;
    stream1_registration?: number;
    stream2_contribution?: number;
    stream3_packing?: number;
    stream4_withdrawal?: number;
    total_gross?: number;
    lifetimeEarned?: number;
    unifiedAvailable?: number;
    breakdown: Array<{
      date: string;
      source: string;
      description: string;
      amount: number;
      reference: string;
    }>;
  };
  ledger: CentralLedgerEntry[];
  auditLogs?: AuditLogEntry[];
}

export interface SuperAdminWallet {
  id?: string;
  total_gross_earnings: number;
  total_withdrawn: number;
  available_balance: number;
  stream1_registration?: number;
  stream2_contribution?: number;
  stream3_packing?: number;
  stream4_withdrawal?: number;
  total_gross?: number;
  unifiedAvailable?: number;
  breakdown: {
    reg_600_total: number;
    contrib_60_total: number;
    packing_33_total: number;
    withdrawal_1_6_total: number;
  };
  updated_at: string;
}

export interface AdminRevenueLedgerEntry {
  id: string;
  date: string;
  type: 'registration_600' | 'contribution_60' | 'packing_33' | 'withdrawal_1_6' | 'super_admin_withdrawal';
  group_or_user: string;
  user_id?: string;
  group_id?: string;
  gross_amount: number;
  fee_amount: number; // Your Fee
  balance_after: number;
  reference: string;
  description: string;
  created_at: string;
}

export interface SuperAdminMetrics {
  totalUsers: number;
  personalAjoAccounts: number;
  groupsCount: number;
  groupMembersCount: number;
  totalContributionsAmount: number;
  totalPackingTransactionsCount: number;
  totalPersonalPlatformFees: number; // ₦600 each
  totalPersonalWithdrawalFees?: number; // 1.6% each
  totalContributionFees?: number; // ₦60 each
  totalGroupPackingFees: number; // ₦3,000 each
  superAdminCommission: number; // 33.33%
  totalSuperAdminEarnings?: number; // Unified total
  superAdminAvailableBalance?: number; // Withdrawable
  superAdminWithdrawnAmount?: number;
  groupAdminCommissionTotal: number; // 66.67%
  totalWithdrawalsAmount: number;
  recentTransactions: Array<{
    id: string;
    type: string;
    description: string;
    amount: number;
    date: string;
  }>;
}

export interface AuditLogEntry {
  id: string;
  event_type: string;
  user_id?: string;
  group_id?: string;
  details: Record<string, any>;
  ip_address?: string;
  created_at: string;
}
