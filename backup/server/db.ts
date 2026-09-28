import fs from 'fs';
import path from 'path';
import {
  UserProfile,
  PersonalAjo,
  GroupAjo,
  GroupMember,
  Contribution,
  PackTransaction,
  Commission,
  Withdrawal,
  SuperAdminMetrics,
  PaymentRecord,
  PaymentStatus,
  GroupCycleInfo,
  CentralLedgerEntry,
  GroupAdminDashboardData,
  SuperAdminFullData,
  GroupAdminMemberItem,
  GroupAdminEarningItem,
  AuditLogEntry,
  SuperAdminWallet,
  AdminRevenueLedgerEntry
} from '../src/types/index.js';
import { PaystackTransferResult } from './paystack.js';
import {
  loadAllFromSupabase,
  syncProfileToSupabase,
  syncGroupToSupabase,
  syncGroupMemberToSupabase,
  syncContributionToSupabase,
  syncPackTransactionToSupabase,
  syncCommissionToSupabase,
  syncWithdrawalToSupabase,
  syncPaymentRecordToSupabase,
  syncPersonalAjoToSupabase
} from './supabase.js';
import {
  isFirebaseConfigured,
  fsUpsertProfile,
  fsUpsertPersonalAjo,
  fsUpsertGroup,
  fsUpsertGroupMember,
  fsUpsertContribution,
  fsUpsertPackTransaction,
  fsUpsertCommission,
  fsUpsertWithdrawal,
  fsUpsertPayment,
  fsLogAuditEvent,
  hydrateFromFirestore,
  addToSuperAdminEarnings as fsAddToSuperAdminEarnings,
  getSuperAdminEarningsFromFirestore,
  deductFromSuperAdminEarnings as fsDeductFromSuperAdminEarnings
} from './firebase.js';
import { INITIAL_DATABASE_SNAPSHOT } from './seedSnapshot.js';

interface DatabaseSchema {
  profiles: UserProfile[];
  personal_ajo: PersonalAjo[];
  groups: GroupAjo[];
  group_members: GroupMember[];
  contributions: Contribution[];
  pack_transactions: PackTransaction[];
  commissions: Commission[];
  withdrawals: Withdrawal[];
  payments: PaymentRecord[];
  otps: { phone: string; code: string; purpose: string; expires_at: number; attempts?: number }[];
  audit_logs?: AuditLogEntry[];
  group_notifications?: Array<{
    id: string;
    group_id: string;
    admin_id: string;
    message: string;
    recipient_type: string;
    member_id?: string;
    channel: string;
    created_at: string;
  }>;
  support_messages?: SupportMessage[];
  superAdminRevenue?: number;
  groupAdminRevenue?: number;
  super_admin_wallet?: {
    id?: string;
    total_gross_earnings: number;
    total_withdrawn: number;
    available_balance: number;
    breakdown: {
      reg_600_total: number;
      contrib_60_total: number;
      packing_33_total: number;
      withdrawal_1_6_total: number;
    };
    updated_at: string;
  };
  admin_revenue_ledger?: Array<{
    id: string;
    date: string;
    type: 'registration_600' | 'contribution_60' | 'packing_33' | 'withdrawal_1_6' | 'super_admin_withdrawal';
    group_or_user: string;
    user_id?: string;
    group_id?: string;
    gross_amount: number;
    fee_amount: number;
    balance_after: number;
    reference: string;
    description: string;
    created_at: string;
  }>;
  superAdminEarnings?: {
    totalEarnings: number;
    totalWithdrawn: number;
    lifetimeEarned: number;
    personalPlatformFeesMerged?: boolean;
    updated_at: string;
    available_balance?: number;
    total_earned?: number;
    total_withdrawn?: number;
    pending_withdrawals?: number;
    breakdown?: Array<{
      date: string;
      source: string;
      description: string;
      amount: number;
      reference: string;
    }>;
    history: Array<{
      id: string;
      amount: number;
      type: string;
      description: string;
      reference: string;
      user_id?: string;
      created_at: string;
      balance_after: number;
    }>;
  };
}

export interface SupportMessage {
  id: string;
  session_id: string;
  user_id?: string;
  user_name: string;
  user_phone?: string;
  sender: 'user' | 'support' | 'assistant';
  sender_name: string;
  text: string;
  created_at: string;
  read_by_support?: boolean;
}

const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'betterajo_data') : path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'packajo_db.json');

function getInitialData(): DatabaseSchema {
  return {
    profiles: [],
    personal_ajo: [],
    groups: [],
    group_members: [],
    contributions: [],
    pack_transactions: [],
    commissions: [],
    withdrawals: [],
    payments: [],
    otps: [],
    audit_logs: [],
    group_notifications: [],
    support_messages: []
  };
}

export function getNigeriaCalendarDate(dateInput?: Date | string | number): string {
  if (!dateInput) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

export function getCycleIntervalDays(cycleType?: string): number {
  if (!cycleType) return 1;
  const lower = cycleType.toLowerCase();
  if (lower.includes('month')) return 30;
  if (lower.includes('14')) return 14;
  if (lower.includes('7')) return 7;
  if (lower.includes('5')) return 5;
  if (lower.includes('4')) return 4;
  if (lower.includes('3')) return 3;
  if (lower.includes('day')) return 1;
  const match = cycleType.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

// Sequential date addition: mimics date-fns addDays, strictly adds, never uses minus
export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date.getTime());
  d.setDate(d.getDate() + Math.abs(days));
  return d;
}

export function addDaysToCalendarDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Math.abs(days), 12, 0, 0));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateNextRoundDate(previousRoundDate: string, intervalDays: number): string {
  const safeDays = Math.abs(intervalDays) || 1;
  return addDaysToCalendarDate(previousRoundDate, safeDays);
}

export function addCycleIntervalToCalendarDate(dateStr: string, cycleType?: string, steps: number = 1): string {
  if (!dateStr || steps === 0) return dateStr;
  const lower = (cycleType || '').toLowerCase();
  const [y, m, d] = dateStr.split('-').map(Number);

  if (lower.includes('month')) {
    // calendar month increment: e.g. Sep 4 -> Oct 4 -> Nov 4
    const dt = new Date(Date.UTC(y, m - 1 + steps, d, 12, 0, 0));
    const year = dt.getUTCFullYear();
    const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const intervalDays = getCycleIntervalDays(cycleType);
  return addDaysToCalendarDate(dateStr, intervalDays * steps);
}

export function formatCalendarDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

export function formatDisplayDate(dateStr: string): string {
  return formatCalendarDateDisplay(dateStr);
}

export function normalizeNigerianPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  let cleaned = String(phone).trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.startsWith('234')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.length === 10 && /^[789]/.test(cleaned)) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

class Database {
  private data: DatabaseSchema;
  private otpRequestTimes: Map<string, number[]> = new Map();
  private phoneLockouts: Map<string, number> = new Map();

  constructor() {
    this.data = this.load();
    this.seedDefaultsIfNeeded();
    this.ensureSuperAdminAndRoles();
    this.initSuperAdminEarnings();
  }

  private load(): DatabaseSchema {
    let baseData: DatabaseSchema;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // 1. Check if DATA_FILE exists
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        baseData = JSON.parse(raw);
      } else {
        // 2. Check repo seed path
        const seedPath = path.join(process.cwd(), 'data', 'packajo_db.json');
        if (fs.existsSync(seedPath)) {
          const raw = fs.readFileSync(seedPath, 'utf-8');
          baseData = JSON.parse(raw);
          try {
            fs.writeFileSync(DATA_FILE, raw, 'utf-8');
          } catch {}
        } else {
          // 3. Fallback to bundled code snapshot
          baseData = JSON.parse(JSON.stringify(INITIAL_DATABASE_SNAPSHOT));
          try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(baseData, null, 2), 'utf-8');
          } catch {}
        }
      }
    } catch (e) {
      console.error('Error loading database, falling back to snapshot:', e);
      baseData = JSON.parse(JSON.stringify(INITIAL_DATABASE_SNAPSHOT));
    }

    // Guard: Merge any records from INITIAL_DATABASE_SNAPSHOT that might be absent
    const snap = INITIAL_DATABASE_SNAPSHOT as unknown as DatabaseSchema;
    if (snap.profiles && Array.isArray(snap.profiles)) {
      if (!baseData.profiles) baseData.profiles = [];
      for (const sp of snap.profiles) {
        const cleanPhone = normalizeNigerianPhone(sp.phone);
        if (!baseData.profiles.some(p => p.id === sp.id || (cleanPhone && normalizeNigerianPhone(p.phone) === cleanPhone))) {
          baseData.profiles.push(sp as any);
        }
      }
    }
    if (snap.groups && Array.isArray(snap.groups)) {
      if (!baseData.groups) baseData.groups = [];
      for (const sg of snap.groups) {
        if (!baseData.groups.some(g => g.id === sg.id || g.group_code === sg.group_code)) {
          baseData.groups.push(sg as any);
        }
      }
    }
    if (snap.group_members && Array.isArray(snap.group_members)) {
      if (!baseData.group_members) baseData.group_members = [];
      for (const sm of snap.group_members) {
        if (!baseData.group_members.some(m => m.id === sm.id)) {
          baseData.group_members.push(sm as any);
        }
      }
    }
    if (snap.personal_ajo && Array.isArray(snap.personal_ajo)) {
      if (!baseData.personal_ajo) baseData.personal_ajo = [];
      for (const spa of snap.personal_ajo) {
        if (!baseData.personal_ajo.some(pa => pa.id === spa.id || pa.user_id === spa.user_id)) {
          baseData.personal_ajo.push(spa as any);
        }
      }
    }
    if (snap.payments && Array.isArray(snap.payments)) {
      if (!baseData.payments) baseData.payments = [];
      for (const spay of snap.payments) {
        if (!baseData.payments.some(p => p.id === spay.id || (spay.reference && p.reference === spay.reference))) {
          baseData.payments.push(spay as any);
        }
      }
    }

    if (!baseData.payments) baseData.payments = [];
    if (!baseData.support_messages) baseData.support_messages = [];
    if (!baseData.group_notifications) baseData.group_notifications = [];
    if (!baseData.audit_logs) baseData.audit_logs = [];
    if (!baseData.withdrawals) baseData.withdrawals = [];
    if (!baseData.commissions) baseData.commissions = [];
    if (!baseData.pack_transactions) baseData.pack_transactions = [];
    if (!baseData.contributions) baseData.contributions = [];
    if (!baseData.otps) baseData.otps = [];

    if (baseData.groups) {
      baseData.groups.forEach((g: any) => {
        if (typeof g.packing_fee !== 'number') {
          g.packing_fee = 3000;
        }
        if (typeof g.withdrawalFee !== 'number') {
          g.withdrawalFee = g.packing_fee;
        }
        if (typeof g.currentRound !== 'number') {
          g.currentRound = g.current_round;
        }
      });
    }

    if (baseData.commissions) {
      baseData.commissions.forEach((c: any) => {
        const fee = Math.round(c.packing_fee || (c.admin_amount + c.super_admin_amount) || 3000);
        const packer = Math.round(fee * 0.6667);
        const admin = fee - packer;
        c.packing_fee = fee;
        c.withdrawalFee = fee;
        c.admin_amount = packer;
        c.groupAdminShare = packer;
        c.super_admin_amount = admin;
        c.superAdminShare = admin;
      });
    }

    if (baseData.group_members) {
      baseData.group_members.forEach((m: any) => {
        if (m.hasPackedThisRound === undefined) {
          const grp = baseData.groups?.find((g: any) => g.id === m.group_id);
          const round = grp ? grp.current_round : 1;
          const isPacked = baseData.pack_transactions?.some(
            (t: any) => t.group_id === m.group_id && t.member_id === m.id && t.round_number === round && t.status === 'completed'
          );
          m.hasPackedThisRound = Boolean(isPacked);
        }
      });
    }

    return baseData;
  }

  public save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      if (!IS_VERCEL) {
        const repoFile = path.join(process.cwd(), 'data', 'packajo_db.json');
        if (DATA_FILE !== repoFile) {
          try {
            fs.writeFileSync(repoFile, JSON.stringify(this.data, null, 2), 'utf-8');
          } catch {}
        }
      }
    } catch (e) {
      console.error('Error saving database:', e);
    }
  }

  /**
   * STEP 1 - AUDIT REAL BALANCE (NO UNREAL PAYMENT):
   * Calculates Total Gross Earnings Ever across the 4 genuine revenue streams:
   *   1. Personal Ajo Registration: ₦600 one-time per user
   *   2. Group Contribution Fee: ₦60 per every contribution by any member
   *   3. Group Packing Share: 33.33% of packing fee
   *   4. Personal Ajo Withdrawal Fee: 1.6% of withdrawal amount
   * Total Already Withdrawn by Super Admin (completed/successful withdrawals only).
   * Real Available Balance = total_gross - total_withdrawn.
   *
   * Updates:
   *   - super_admin_wallet (single object table)
   *   - admin_revenue_ledger (full double-entry historical ledger)
   *   - superAdminEarnings (unified compatibility)
   */
  public auditSuperAdminRealBalance(): {
    total_gross: number;
    total_withdrawn: number;
    real_balance: number;
    breakdown: {
      reg_600_total: number;
      contrib_60_total: number;
      packing_33_total: number;
      withdrawal_1_6_total: number;
    };
    ledgerCount: number;
  } {
    // 1. Personal Ajo Registration: ₦600 one-time per user
    const regSavers = new Set<string>();
    for (const pa of (this.data.personal_ajo || [])) {
      if (pa.user_id && (pa.status === 'active' || (pa as any).is_active || pa.created_at)) {
        regSavers.add(pa.user_id);
      }
    }
    for (const p of (this.data.payments || [])) {
      if (p.user_id && (p.status === 'success' || (p.status as string) === 'successful')) {
        if (p.purpose === 'personal_registration' || p.amount === 600 || p.amount_kobo === 60000) {
          regSavers.add(p.user_id);
        }
      }
    }
    const reg_600_count = regSavers.size;
    const reg_600_total = reg_600_count * 600;

    // 2. Group Contribution Fee = ₦60 per every contribution by any member
    const paidContribs = (this.data.contributions || []).filter(
      c => c.status === 'Paid' || (c.status as string) === 'success' || (c.status as string) === 'successful'
    );
    const contrib_60_count = paidContribs.length;
    const contrib_60_total = contrib_60_count * 60;

    // 3. Group Packing Share = 33.33% of packing fee
    const commissions = this.data.commissions || [];
    let packing_33_total = 0;
    for (const c of commissions) {
      const share = typeof c.super_admin_amount === 'number'
        ? c.super_admin_amount
        : Math.round((c.packing_fee || 3000) * 0.3333);
      packing_33_total += share;
    }

    // 4. Personal Ajo Withdrawal Fee = 1.6% of withdrawal amount
    const personalWithdrawals = (this.data.withdrawals || []).filter(
      w => w.withdrawal_type === 'personal' && (w.status === 'completed' || w.status === 'successful' || !w.status || w.status === 'pending')
    );
    let withdrawal_1_6_total = 0;
    for (const w of personalWithdrawals) {
      const fee = typeof w.fee === 'number' && w.fee > 0 ? w.fee : Math.round(w.amount * 0.016);
      withdrawal_1_6_total += fee;
    }

    const total_gross = reg_600_total + contrib_60_total + packing_33_total + withdrawal_1_6_total;

    // b) Calculate Total Already Withdrawn by Super Admin:
    const completedSaWithdrawals = (this.data.withdrawals || []).filter(
      w => w.withdrawal_type === 'super_admin_revenue' && (w.status === 'completed' || w.status === 'successful')
    );
    const total_withdrawn = completedSaWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    // c) Real Available Balance:
    const real_balance = Math.max(0, total_gross - total_withdrawn);

    // Build historical ledger entries chronologically
    const rawLedgerItems: Array<{
      id: string;
      date: string;
      type: 'registration_600' | 'contribution_60' | 'packing_33' | 'withdrawal_1_6' | 'super_admin_withdrawal';
      group_or_user: string;
      user_id?: string;
      group_id?: string;
      gross_amount: number;
      fee_amount: number;
      reference: string;
      description: string;
    }> = [];

    // 1. Registration items
    for (const uid of regSavers) {
      const u = this.getProfileById(uid);
      const pa = (this.data.personal_ajo || []).find(p => p.user_id === uid);
      const pay = (this.data.payments || []).find(p => p.user_id === uid && (p.purpose === 'personal_registration' || p.amount === 600));
      rawLedgerItems.push({
        id: `rev_reg_${uid}`,
        date: pa?.created_at || pay?.created_at || new Date().toISOString(),
        type: 'registration_600',
        group_or_user: u?.full_name || 'Personal Saver',
        user_id: uid,
        gross_amount: 600,
        fee_amount: 600,
        reference: pay?.reference || `pak_reg_${uid}`,
        description: `Personal Ajo Platform Registration Fee (₦600) - ${u?.full_name || 'Saver'}`
      });
    }

    // 2. Contribution items
    for (const c of paidContribs) {
      const g = this.getGroupById(c.group_id);
      const u = this.getProfileById(c.user_id);
      rawLedgerItems.push({
        id: `rev_cnt_${c.id}`,
        date: c.paid_at || c.id,
        type: 'contribution_60',
        group_or_user: `Group: ${g?.group_name || 'Group Ajo'} (${u?.full_name || 'Member'})`,
        user_id: c.user_id,
        group_id: c.group_id,
        gross_amount: c.amount,
        fee_amount: 60,
        reference: c.reference || c.id,
        description: `₦60 Contribution Processing Fee (Member: ${u?.full_name || 'Member'}, Round ${c.round_number})`
      });
    }

    // 3. Group packing share items
    for (const c of commissions) {
      const g = this.getGroupById(c.group_id);
      const grossAmt = c.packing_fee || (c.admin_amount + c.super_admin_amount);
      rawLedgerItems.push({
        id: `rev_pack_${c.id}`,
        date: c.created_at,
        type: 'packing_33',
        group_or_user: `Group: ${g?.group_name || 'Group Ajo'}`,
        group_id: c.group_id,
        gross_amount: grossAmt,
        fee_amount: c.super_admin_amount,
        reference: c.pack_transaction_id || c.id,
        description: `33.33% Share of Group Packing Fee (Total Fee: ₦${grossAmt.toLocaleString()})`
      });
    }

    // 4. Personal withdrawal fee items
    for (const w of personalWithdrawals) {
      const u = this.getProfileById(w.user_id);
      const fee = typeof w.fee === 'number' && w.fee > 0 ? w.fee : Math.round(w.amount * 0.016);
      rawLedgerItems.push({
        id: `rev_wthfee_${w.id}`,
        date: w.created_at,
        type: 'withdrawal_1_6',
        group_or_user: `Personal Saver: ${u?.full_name || 'User'}`,
        user_id: w.user_id,
        gross_amount: w.amount,
        fee_amount: fee,
        reference: w.reference || w.id,
        description: `1.6% Commission on Personal Ajo Withdrawal (₦${w.amount.toLocaleString()})`
      });
    }

    // 5. Super admin completed withdrawals (deductions)
    for (const w of completedSaWithdrawals) {
      rawLedgerItems.push({
        id: `rev_sawth_${w.id}`,
        date: w.created_at,
        type: 'super_admin_withdrawal',
        group_or_user: `Super Admin Payout (${w.bank_name || 'Bank'} ${w.account_number || ''})`,
        user_id: w.user_id,
        gross_amount: w.amount,
        fee_amount: -w.amount,
        reference: w.reference || w.id,
        description: `Super Admin Revenue Payout to ${w.bank_name || 'Bank'}`
      });
    }

    // Sort ascending by date to compute balance_after
    rawLedgerItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const admin_revenue_ledger = rawLedgerItems.map(item => {
      runningBalance = Number((runningBalance + item.fee_amount).toFixed(2));
      return {
        ...item,
        balance_after: runningBalance,
        created_at: item.date
      };
    });

    // Reverse so newest entries are first for display
    admin_revenue_ledger.reverse();

    // d) Update super_admin_wallet table
    this.data.super_admin_wallet = {
      total_gross_earnings: total_gross,
      total_withdrawn: total_withdrawn,
      available_balance: real_balance,
      breakdown: {
        reg_600_total,
        contrib_60_total,
        packing_33_total,
        withdrawal_1_6_total
      },
      updated_at: new Date().toISOString()
    };

    this.data.admin_revenue_ledger = admin_revenue_ledger;

    // Update superAdminEarnings for compatibility
    this.data.superAdminEarnings = {
      totalEarnings: real_balance,
      available_balance: real_balance,
      total_earned: total_gross,
      total_withdrawn: total_withdrawn,
      totalWithdrawn: total_withdrawn,
      lifetimeEarned: total_gross,
      personalPlatformFeesMerged: true,
      pending_withdrawals: this.data.withdrawals.filter(
        w => w.withdrawal_type === 'super_admin_revenue' && (w.status === 'pending' || w.status === 'processing')
      ).length,
      breakdown: admin_revenue_ledger.filter(l => l.type !== 'super_admin_withdrawal').map(l => ({
        date: l.date,
        source: l.group_or_user,
        description: l.description,
        amount: l.fee_amount,
        reference: l.reference
      })),
      history: admin_revenue_ledger.map(l => ({
        id: l.id,
        amount: l.fee_amount,
        type: l.type,
        description: l.description,
        reference: l.reference,
        user_id: l.user_id,
        created_at: l.date,
        balance_after: l.balance_after
      })),
      updated_at: new Date().toISOString()
    };

    console.log('[Super Admin Real Balance Audit] Gross:', total_gross, 'Withdrawn:', total_withdrawn, 'Real Balance:', real_balance);
    this.save();

    return {
      total_gross,
      total_withdrawn,
      real_balance,
      breakdown: {
        reg_600_total,
        contrib_60_total,
        packing_33_total,
        withdrawal_1_6_total
      },
      ledgerCount: admin_revenue_ledger.length
    };
  }

  public initSuperAdminEarnings(): void {
    if (!this.data.super_admin_wallet || !this.data.admin_revenue_ledger || this.data.admin_revenue_ledger.length === 0) {
      this.auditSuperAdminRealBalance();
    }
  }

  public getSuperAdminWallet(): SuperAdminWallet {
    if (!this.data.super_admin_wallet) {
      this.auditSuperAdminRealBalance();
    }
    return this.data.super_admin_wallet!;
  }

  public getAdminRevenueLedger(): AdminRevenueLedgerEntry[] {
    if (!this.data.admin_revenue_ledger || this.data.admin_revenue_ledger.length === 0) {
      this.auditSuperAdminRealBalance();
    }
    return this.data.admin_revenue_ledger!;
  }

  /**
   * STEP 2 - FORWARD REVENUE HOOK:
   * Records newly received revenue into super_admin_wallet and admin_revenue_ledger.
   * Enforces idempotency via transaction reference.
   */
  public recordAdminRevenue(entry: {
    type: 'registration_600' | 'contribution_60' | 'packing_33' | 'withdrawal_1_6';
    amount: number;
    reference: string;
    group_or_user?: string;
    user_id?: string;
    group_id?: string;
    gross_amount?: number;
    description?: string;
    date?: string;
  }): { wallet: any; ledgerEntry: any } {
    if (!this.data.super_admin_wallet || !this.data.admin_revenue_ledger) {
      this.auditSuperAdminRealBalance();
    }

    const numAmount = Math.round(Number(entry.amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      return { wallet: this.data.super_admin_wallet!, ledgerEntry: null };
    }

    // Idempotency: avoid double incrementing for the exact same reference and type
    if (entry.reference && Array.isArray(this.data.admin_revenue_ledger)) {
      const existing = this.data.admin_revenue_ledger.find(
        l => l.reference === entry.reference && l.type === entry.type
      );
      if (existing) {
        return { wallet: this.data.super_admin_wallet!, ledgerEntry: existing };
      }
    }

    // Increment wallet
    const wallet = this.data.super_admin_wallet!;
    wallet.available_balance += numAmount;
    wallet.total_gross_earnings += numAmount;

    if (entry.type === 'registration_600') {
      wallet.breakdown.reg_600_total += numAmount;
    } else if (entry.type === 'contribution_60') {
      wallet.breakdown.contrib_60_total += numAmount;
    } else if (entry.type === 'packing_33') {
      wallet.breakdown.packing_33_total += numAmount;
    } else if (entry.type === 'withdrawal_1_6') {
      wallet.breakdown.withdrawal_1_6_total += numAmount;
    }
    wallet.updated_at = new Date().toISOString();

    const newLedgerEntry = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      date: entry.date || new Date().toISOString(),
      type: entry.type,
      group_or_user: entry.group_or_user || 'Platform',
      user_id: entry.user_id,
      group_id: entry.group_id,
      gross_amount: entry.gross_amount || numAmount,
      fee_amount: numAmount,
      balance_after: wallet.available_balance,
      reference: entry.reference,
      description: entry.description || entry.type,
      created_at: entry.date || new Date().toISOString()
    };

    if (!Array.isArray(this.data.admin_revenue_ledger)) {
      this.data.admin_revenue_ledger = [];
    }
    this.data.admin_revenue_ledger.unshift(newLedgerEntry);

    // Sync legacy superAdminEarnings
    if (this.data.superAdminEarnings) {
      this.data.superAdminEarnings.totalEarnings = wallet.available_balance;
      this.data.superAdminEarnings.available_balance = wallet.available_balance;
      this.data.superAdminEarnings.total_earned = wallet.total_gross_earnings;
      this.data.superAdminEarnings.lifetimeEarned = wallet.total_gross_earnings;
    }

    this.save();
    return { wallet, ledgerEntry: newLedgerEntry };
  }

  /**
   * STEP 4 - WITHDRAWAL DEDUCTION:
   * Deducts from super_admin_wallet immediately upon withdrawal initiation.
   */
  public deductAdminRevenueWithdrawal(
    withdrawal: Withdrawal,
    payment?: PaymentRecord
  ): { wallet: any; ledgerEntry: any } {
    if (!this.data.super_admin_wallet || !this.data.admin_revenue_ledger) {
      this.auditSuperAdminRealBalance();
    }

    const numAmount = Math.round(Number(withdrawal.amount));

    // Idempotency: avoid duplicate deduction if reference already in ledger
    if (Array.isArray(this.data.admin_revenue_ledger)) {
      const existing = this.data.admin_revenue_ledger.find(
        l => (withdrawal.reference && l.reference === withdrawal.reference && l.type === 'super_admin_withdrawal') ||
             l.id === `wth_${withdrawal.id}`
      );
      if (existing) {
        return { wallet: this.data.super_admin_wallet!, ledgerEntry: existing };
      }
    }

    const wallet = this.data.super_admin_wallet!;
    wallet.available_balance = Math.max(0, wallet.available_balance - numAmount);
    wallet.total_withdrawn += numAmount;
    wallet.updated_at = new Date().toISOString();

    const ledgerEntry = {
      id: `wth_${withdrawal.id}`,
      date: withdrawal.created_at || new Date().toISOString(),
      type: 'super_admin_withdrawal' as const,
      group_or_user: `Super Admin Payout (${withdrawal.bank_name || 'Bank'} ${withdrawal.account_number || ''})`,
      user_id: withdrawal.user_id,
      gross_amount: numAmount,
      fee_amount: -numAmount,
      balance_after: wallet.available_balance,
      reference: withdrawal.reference || withdrawal.id,
      description: `Super Admin Revenue Payout to ${withdrawal.bank_name || 'Bank'}`,
      created_at: withdrawal.created_at || new Date().toISOString()
    };

    if (!Array.isArray(this.data.admin_revenue_ledger)) {
      this.data.admin_revenue_ledger = [];
    }
    this.data.admin_revenue_ledger.unshift(ledgerEntry);

    // Sync legacy superAdminEarnings
    if (this.data.superAdminEarnings) {
      this.data.superAdminEarnings.totalEarnings = wallet.available_balance;
      this.data.superAdminEarnings.available_balance = wallet.available_balance;
      this.data.superAdminEarnings.total_withdrawn = wallet.total_withdrawn;
      this.data.superAdminEarnings.totalWithdrawn = wallet.total_withdrawn;
    }

    this.save();
    return { wallet, ledgerEntry };
  }

  /**
   * Rollback a failed Super Admin withdrawal
   */
  public rollbackAdminRevenueWithdrawal(withdrawal: Withdrawal): void {
    if (!this.data.super_admin_wallet) return;
    const numAmount = Math.round(Number(withdrawal.amount));
    this.data.super_admin_wallet.available_balance += numAmount;
    this.data.super_admin_wallet.total_withdrawn = Math.max(0, this.data.super_admin_wallet.total_withdrawn - numAmount);
    this.data.super_admin_wallet.updated_at = new Date().toISOString();

    if (Array.isArray(this.data.admin_revenue_ledger)) {
      this.data.admin_revenue_ledger = this.data.admin_revenue_ledger.filter(
        l => !(l.reference === withdrawal.reference && l.type === 'super_admin_withdrawal') && l.id !== `wth_${withdrawal.id}`
      );
    }

    if (this.data.superAdminEarnings) {
      this.data.superAdminEarnings.totalEarnings = this.data.super_admin_wallet.available_balance;
      this.data.superAdminEarnings.available_balance = this.data.super_admin_wallet.available_balance;
      this.data.superAdminEarnings.total_withdrawn = this.data.super_admin_wallet.total_withdrawn;
      this.data.superAdminEarnings.totalWithdrawn = this.data.super_admin_wallet.total_withdrawn;
    }
    this.save();
  }

  /**
   * Adds earnings to the single unified superAdminEarnings wallet.
   * Updates local database and triggers async sync to Firestore.
   */
  public addToSuperAdminEarnings(
    amount: number,
    type: string,
    metadata?: { description?: string; reference?: string; userId?: string }
  ): { totalEarnings: number; entry: any } {
    this.initSuperAdminEarnings();
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { totalEarnings: this.data.superAdminEarnings!.totalEarnings, entry: null };
    }

    // Idempotency: prevent adding duplicate entry if reference matches
    if (metadata?.reference) {
      const existing = this.data.superAdminEarnings!.history?.find(
        h => h.reference === metadata.reference && h.type === type
      );
      if (existing) {
        return { totalEarnings: this.data.superAdminEarnings!.totalEarnings, entry: existing };
      }
    }

    const currentTotal = Number(this.data.superAdminEarnings!.totalEarnings || 0);
    const newTotal = Number((currentTotal + numAmount).toFixed(2));
    const newLifetime = Number(((this.data.superAdminEarnings!.lifetimeEarned || currentTotal) + numAmount).toFixed(2));

    const entry = {
      id: `sa_earn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: numAmount,
      type,
      description: metadata?.description || type,
      reference: metadata?.reference || '',
      user_id: metadata?.userId || '',
      created_at: new Date().toISOString(),
      balance_after: newTotal
    };

    if (!Array.isArray(this.data.superAdminEarnings!.history)) {
      this.data.superAdminEarnings!.history = [];
    }
    this.data.superAdminEarnings!.history.unshift(entry);
    if (this.data.superAdminEarnings!.history.length > 200) {
      this.data.superAdminEarnings!.history.length = 200;
    }

    this.data.superAdminEarnings!.totalEarnings = newTotal;
    this.data.superAdminEarnings!.lifetimeEarned = newLifetime;
    this.data.superAdminEarnings!.updated_at = new Date().toISOString();
    this.save();

    // Async sync to Firestore
    fsAddToSuperAdminEarnings(numAmount, type, metadata).catch(err =>
      console.warn('[Firestore fsAddToSuperAdminEarnings Warn]:', err?.message || err)
    );

    return { totalEarnings: newTotal, entry };
  }

  /**
   * Withdraws an amount from the single unified superAdminEarnings wallet.
   */
  public withdrawFromSuperAdminEarnings(
    amount: number,
    metadata?: { description?: string; reference?: string; withdrawalId?: string }
  ): { totalEarnings: number; totalWithdrawn: number } {
    this.initSuperAdminEarnings();
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Invalid withdrawal amount.');
    }

    const currentTotal = Number(this.data.superAdminEarnings!.totalEarnings || 0);
    const currentWithdrawn = Number(this.data.superAdminEarnings!.totalWithdrawn || 0);

    // Idempotency: avoid duplicate deduction if reference already in history
    const checkRef = metadata?.reference || metadata?.withdrawalId;
    if (checkRef && Array.isArray(this.data.superAdminEarnings!.history)) {
      const existing = this.data.superAdminEarnings!.history.find(
        h => h.type === 'super_admin_withdrawal' && (h.reference === checkRef || (metadata?.withdrawalId && h.reference === metadata.withdrawalId))
      );
      if (existing) {
        return { totalEarnings: currentTotal, totalWithdrawn: currentWithdrawn };
      }
    }

    if (numAmount > (currentTotal + 0.001)) {
      throw new Error(`Amount exceeds available totalEarnings of ₦${currentTotal.toFixed(2)}`);
    }

    const newTotal = Math.max(0, Number((currentTotal - numAmount).toFixed(2)));
    const newWithdrawn = Number((currentWithdrawn + numAmount).toFixed(2));

    const entry = {
      id: `sa_wth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: -numAmount,
      type: 'super_admin_withdrawal',
      description: metadata?.description || 'Super Admin Revenue Withdrawal',
      reference: metadata?.reference || metadata?.withdrawalId || '',
      created_at: new Date().toISOString(),
      balance_after: newTotal
    };

    if (!Array.isArray(this.data.superAdminEarnings!.history)) {
      this.data.superAdminEarnings!.history = [];
    }
    this.data.superAdminEarnings!.history.unshift(entry);
    if (this.data.superAdminEarnings!.history.length > 200) {
      this.data.superAdminEarnings!.history.length = 200;
    }

    this.data.superAdminEarnings!.totalEarnings = newTotal;
    this.data.superAdminEarnings!.totalWithdrawn = newWithdrawn;
    this.data.superAdminEarnings!.updated_at = new Date().toISOString();
    this.save();

    return { totalEarnings: newTotal, totalWithdrawn: newWithdrawn };
  }

  /**
   * Returns the single unified superAdminEarnings object.
   */
  public getSuperAdminEarnings(): {
    totalEarnings: number;
    totalWithdrawn: number;
    lifetimeEarned: number;
    history: Array<{
      id: string;
      amount: number;
      type: string;
      description: string;
      reference: string;
      user_id?: string;
      created_at: string;
      balance_after: number;
    }>;
  } {
    this.initSuperAdminEarnings();
    return {
      totalEarnings: Number(this.data.superAdminEarnings!.totalEarnings || 0),
      totalWithdrawn: Number(this.data.superAdminEarnings!.totalWithdrawn || 0),
      lifetimeEarned: Number(this.data.superAdminEarnings!.lifetimeEarned || 0),
      history: this.data.superAdminEarnings!.history || []
    };
  }

  /**
   * Syncs Firestore superAdminEarnings into local database if newer or different.
   */
  public syncSuperAdminEarnings(fsData: {
    totalEarnings: number;
    totalWithdrawn?: number;
    lifetimeEarned?: number;
    history?: any[];
  }): void {
    if (!fsData || typeof fsData.totalEarnings !== 'number') return;
    this.initSuperAdminEarnings();
    this.data.superAdminEarnings!.totalEarnings = fsData.totalEarnings;
    if (typeof fsData.totalWithdrawn === 'number') {
      this.data.superAdminEarnings!.totalWithdrawn = fsData.totalWithdrawn;
    }
    if (typeof fsData.lifetimeEarned === 'number') {
      this.data.superAdminEarnings!.lifetimeEarned = fsData.lifetimeEarned;
    }
    if (Array.isArray(fsData.history) && fsData.history.length > 0) {
      this.data.superAdminEarnings!.history = fsData.history;
    }
    this.save();
  }

  syncRemoteGroup(group: GroupAjo) {
    const idx = this.data.groups.findIndex(g => g.id === group.id || g.group_code === group.group_code);
    if (idx >= 0) {
      this.data.groups[idx] = { ...this.data.groups[idx], ...group };
    } else {
      this.data.groups.push(group);
    }
    this.save();
  }

  syncRemotePackTransaction(tx: PackTransaction) {
    const idx = this.data.pack_transactions.findIndex(t => t.id === tx.id);
    if (idx >= 0) {
      this.data.pack_transactions[idx] = { ...this.data.pack_transactions[idx], ...tx };
    } else {
      this.data.pack_transactions.push(tx);
    }
    this.save();
  }

  async syncWithSupabase(): Promise<boolean> {
    try {
      const remote = await loadAllFromSupabase();
      if (!remote) return false;

      let hasChanges = false;

      // 1. Profiles
      if (remote.profiles && remote.profiles.length > 0) {
        for (const rp of remote.profiles) {
          const cleanPhone = normalizeNigerianPhone(rp.phone);
          const idx = this.data.profiles.findIndex(
            p => p.id === rp.id || (cleanPhone && normalizeNigerianPhone(p.phone) === cleanPhone)
          );
          if (idx >= 0) {
            this.data.profiles[idx] = { ...this.data.profiles[idx], ...rp };
            hasChanges = true;
          } else {
            this.data.profiles.push(rp);
            hasChanges = true;
          }
        }
      }

      // 2. Groups
      if (remote.groups && remote.groups.length > 0) {
        for (const rg of remote.groups) {
          const idx = this.data.groups.findIndex(g => g.id === rg.id || g.group_code === rg.group_code);
          if (idx >= 0) {
            this.data.groups[idx] = { ...this.data.groups[idx], ...rg };
            hasChanges = true;
          } else {
            this.data.groups.push(rg);
            hasChanges = true;
          }
        }
      }

      // 3. Group Members
      if (remote.group_members && remote.group_members.length > 0) {
        for (const rm of remote.group_members) {
          const idx = this.data.group_members.findIndex(m => m.id === rm.id);
          if (idx >= 0) {
            this.data.group_members[idx] = { ...this.data.group_members[idx], ...rm };
            hasChanges = true;
          } else {
            this.data.group_members.push(rm);
            hasChanges = true;
          }
        }
      }

      // 4. Contributions
      if (remote.contributions && remote.contributions.length > 0) {
        for (const rc of remote.contributions) {
          const idx = this.data.contributions.findIndex(c => c.id === rc.id || (rc.reference && c.reference === rc.reference));
          if (idx >= 0) {
            this.data.contributions[idx] = { ...this.data.contributions[idx], ...rc };
            hasChanges = true;
          } else {
            this.data.contributions.push(rc);
            hasChanges = true;
          }
        }
      }

      // 5. Pack Transactions
      if (remote.pack_transactions && remote.pack_transactions.length > 0) {
        for (const rp of remote.pack_transactions) {
          const idx = this.data.pack_transactions.findIndex(p => p.id === rp.id);
          if (idx >= 0) {
            this.data.pack_transactions[idx] = { ...this.data.pack_transactions[idx], ...rp };
            hasChanges = true;
          } else {
            this.data.pack_transactions.push(rp);
            hasChanges = true;
          }
        }
      }

      // 6. Commissions
      if (remote.commissions && remote.commissions.length > 0) {
        for (const rcom of remote.commissions) {
          const idx = this.data.commissions.findIndex(c => c.id === rcom.id || (c.pack_transaction_id && c.pack_transaction_id === rcom.pack_transaction_id));
          if (idx >= 0) {
            this.data.commissions[idx] = { ...this.data.commissions[idx], ...rcom };
            hasChanges = true;
          } else {
            this.data.commissions.push(rcom);
            hasChanges = true;
          }
        }
      }

      // 7. Withdrawals
      if (remote.withdrawals && remote.withdrawals.length > 0) {
        for (const rw of remote.withdrawals) {
          const idx = this.data.withdrawals.findIndex(w => w.id === rw.id);
          if (idx >= 0) {
            this.data.withdrawals[idx] = { ...this.data.withdrawals[idx], ...rw };
            hasChanges = true;
          } else {
            this.data.withdrawals.push(rw);
            hasChanges = true;
          }
        }
      }

      // 8. Personal Ajo
      if (remote.personal_ajo && remote.personal_ajo.length > 0) {
        for (const rpa of remote.personal_ajo) {
          const idx = this.data.personal_ajo.findIndex(pa => pa.id === rpa.id || pa.user_id === rpa.user_id);
          if (idx >= 0) {
            this.data.personal_ajo[idx] = { ...this.data.personal_ajo[idx], ...rpa };
            hasChanges = true;
          } else {
            this.data.personal_ajo.push(rpa);
            hasChanges = true;
          }
        }
      }

      // 9. Payments
      if (remote.payments && remote.payments.length > 0) {
        if (!this.data.payments) this.data.payments = [];
        for (const rpay of remote.payments) {
          const idx = this.data.payments.findIndex(pay => pay.id === rpay.id || (rpay.reference && pay.reference === rpay.reference));
          if (idx >= 0) {
            this.data.payments[idx] = { ...this.data.payments[idx], ...rpay };
            hasChanges = true;
          } else {
            this.data.payments.push(rpay);
            hasChanges = true;
          }
        }
      }

      if (hasChanges) {
        this.save();
      }
      return true;
    } catch (e) {
      console.warn('Database syncWithSupabase notice:', e);
      return false;
    }
  }

  private seedDefaultsIfNeeded() {
    // If empty, create one demo group "Family Monthly Pack" with a few members so "JOIN AJO WITH CODE" is immediately testable!
    if (this.data.groups.length === 0) {
      const demoAdmin: UserProfile = {
        id: 'user_admin_demo',
        full_name: 'Babatunde Adeleke',
        phone: '08012345678',
        email: 'babatunde@example.com',
        bank_name: 'Access Bank',
        account_number: '0123456789',
        verification_type: 'BVN',
        verification_number: '22114455667',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString()
      };
      this.data.profiles.push(demoAdmin);

      const demoGroup: GroupAjo = {
        id: 'grp_family_demo',
        admin_id: demoAdmin.id,
        admin_name: demoAdmin.full_name,
        group_name: 'Family Monthly Pack',
        member_limit: 10,
        contribution_amount: 50000,
        cycle_type: 'Every Month',
        packing_amount: 500000,
        packing_fee: 3000,
        group_code: 'PAK-82K4M',
        status: 'recruiting',
        current_round: 1,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString()
      };
      this.data.groups.push(demoGroup);

      // Add admin as member #1
      const member1: GroupMember = {
        id: 'mem_1',
        group_id: demoGroup.id,
        user_id: demoAdmin.id,
        full_name: demoAdmin.full_name,
        phone: demoAdmin.phone,
        bank_name: demoAdmin.bank_name,
        account_number: demoAdmin.account_number,
        position: 1,
        status: 'active',
        current_round_status: 'contributed',
        joined_at: new Date(Date.now() - 86400000 * 3).toISOString()
      };

      // Add 2 more sample members to show rotation in action
      const user2: UserProfile = {
        id: 'user_2',
        full_name: 'Ngozi Okonjo',
        phone: '08098765432',
        bank_name: 'Guaranty Trust Bank (GTB)',
        account_number: '0234567891',
        verification_type: 'NIN',
        verification_number: '12345678901',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString()
      };
      this.data.profiles.push(user2);

      const member2: GroupMember = {
        id: 'mem_2',
        group_id: demoGroup.id,
        user_id: user2.id,
        full_name: user2.full_name,
        phone: user2.phone,
        bank_name: user2.bank_name,
        account_number: user2.account_number,
        position: 2,
        status: 'active',
        current_round_status: 'contributed',
        joined_at: new Date(Date.now() - 86400000 * 2).toISOString()
      };

      this.data.group_members.push(member1, member2);

      // Add sample contributions
      this.data.contributions.push(
        {
          id: 'cnt_1',
          group_id: demoGroup.id,
          member_id: member1.id,
          user_id: demoAdmin.id,
          round_number: 1,
          amount: 50000,
          status: 'Paid',
          paid_at: new Date(Date.now() - 86400000 * 2).toISOString()
        },
        {
          id: 'cnt_2',
          group_id: demoGroup.id,
          member_id: member2.id,
          user_id: user2.id,
          round_number: 1,
          amount: 50000,
          status: 'Paid',
          paid_at: new Date(Date.now() - 86400000).toISOString()
        }
      );

      this.save();
    }
  }

  ensureSuperAdminAndRoles() {
    const superAdminPhone = '08154267469';
    let superAdmin = this.data.profiles.find(
      p => (p.email && p.email.toLowerCase() === 'superadmin@packajo.ng') ||
           p.phone.replace(/\s+/g, '').replace(/^\+234/, '0') === superAdminPhone
    );
    if (!superAdmin) {
      superAdmin = {
        id: 'usr_superadmin_08154267469',
        full_name: 'Super Administrator',
        phone: superAdminPhone,
        email: 'superadmin@packajo.ng',
        password: 'admin123',
        bank_name: 'Guaranty Trust Bank (GTB)',
        account_number: '0123456789',
        verification_type: 'NIN',
        verification_number: '12345678901',
        role: 'SUPER_ADMIN',
        created_at: '2026-08-01T00:00:00.000Z'
      };
      this.data.profiles.push(superAdmin);
    } else {
      superAdmin.role = 'SUPER_ADMIN';
      if (!superAdmin.password) superAdmin.password = 'admin123';
      if (!superAdmin.email) superAdmin.email = 'superadmin@packajo.ng';
    }

    const groupAdminIds = new Set(this.data.groups.map(g => g.admin_id));
    for (const p of this.data.profiles) {
      const clean = normalizeNigerianPhone(p.phone);
      const emailLower = p.email ? p.email.toLowerCase() : '';
      if (clean === superAdminPhone || emailLower === 'superadmin@packajo.ng' || emailLower === 'paulakinyele54@gmail.com') {
        p.role = 'SUPER_ADMIN';
      } else if (groupAdminIds.has(p.id)) {
        p.role = 'GROUP_ADMIN';
      } else if (!p.role) {
        p.role = 'MEMBER';
      }
    }
    this.save();
  }

  // Profiles
  getProfileByEmail(email: string): UserProfile | undefined {
    if (!email) return undefined;
    const cleanEmail = email.trim().toLowerCase();
    return this.data.profiles.find(p => p.email && p.email.trim().toLowerCase() === cleanEmail);
  }

  getProfileByPhone(phone: string): UserProfile | undefined {
    const cleanPhone = normalizeNigerianPhone(phone);
    if (!cleanPhone) return undefined;
    let profile = this.data.profiles.find(p => normalizeNigerianPhone(p.phone) === cleanPhone);

    // If profile is not in profiles table, check if user exists as a group member and auto-link
    if (!profile) {
      const member = this.getMemberByPhone(cleanPhone);
      if (member) {
        profile = this.upsertProfile({
          id: member.user_id,
          full_name: member.full_name,
          phone: cleanPhone,
          bank_name: member.bank_name || 'Not provided',
          account_number: member.account_number || 'Not provided',
          verification_type: 'BVN',
          verification_number: '00000000000',
          role: 'MEMBER'
        });
      }
    }
    return profile;
  }

  getMemberByPhone(phone: string): GroupMember | undefined {
    const cleanPhone = normalizeNigerianPhone(phone);
    if (!cleanPhone) return undefined;
    return this.data.group_members.find(m => normalizeNigerianPhone(m.phone) === cleanPhone);
  }

  getProfileById(id: string): UserProfile | undefined {
    return this.data.profiles.find(p => p.id === id);
  }

  getProfiles(): UserProfile[] {
    return this.data.profiles;
  }

  upsertProfile(profile: Omit<UserProfile, 'id' | 'created_at'> & { id?: string }): UserProfile {
    const cleanPhone = profile.phone ? normalizeNigerianPhone(profile.phone) : '';
    const cleanEmail = profile.email ? profile.email.trim().toLowerCase() : '';
    const existingIndex = this.data.profiles.findIndex(
      p => (cleanEmail && p.email && p.email.trim().toLowerCase() === cleanEmail) ||
           (profile.id && p.id === profile.id) ||
           (cleanPhone && normalizeNigerianPhone(p.phone) === cleanPhone)
    );

    const superAdminPhone = '08154267469';
    const isSuperAdminEmail = cleanEmail === 'superadmin@packajo.ng' || cleanEmail === 'paulakinyele54@gmail.com';

    if (existingIndex >= 0) {
      const existing = this.data.profiles[existingIndex];
      // SECURITY: Disallow self-promotion to SUPER_ADMIN or unauthorized role tampering
      const safeRole = (cleanPhone === superAdminPhone || isSuperAdminEmail)
        ? 'SUPER_ADMIN'
        : (existing.role || profile.role || 'MEMBER');

      const updated: UserProfile = {
        ...existing,
        ...profile,
        role: safeRole,
        phone: cleanPhone || existing.phone || `080${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: cleanEmail || existing.email,
        id: existing.id,
        created_at: existing.created_at
      };
      this.data.profiles[existingIndex] = updated;
      this.save();
      syncProfileToSupabase(updated).catch(err => console.warn('[Supabase Profile Sync Warn]:', err?.message || err));
      fsUpsertProfile(updated).catch(err => console.warn('[Firestore Profile Sync Warn]:', err?.message || err));
      return updated;
    }

    const newProfile: UserProfile = {
      ...profile,
      role: (cleanPhone === superAdminPhone || isSuperAdminEmail) ? 'SUPER_ADMIN' : (profile.role || 'MEMBER'),
      id: profile.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      phone: cleanPhone || `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      email: cleanEmail || undefined,
      created_at: new Date().toISOString()
    };
    this.data.profiles.push(newProfile);
    this.save();
    syncProfileToSupabase(newProfile).catch(err => console.warn('[Supabase Profile Sync Warn]:', err?.message || err));
    fsUpsertProfile(newProfile).catch(err => console.warn('[Firestore Profile Sync Warn]:', err?.message || err));
    return newProfile;
  }

  // OTP Management & Hardening
  generateOtp(phone: string, purpose: string): string {
    const cleanPhone = normalizeNigerianPhone(phone);
    const now = Date.now();

    // 1. Check if phone is locked out due to excessive failed attempts
    const lockoutUntil = this.phoneLockouts.get(cleanPhone);
    if (lockoutUntil && now < lockoutUntil) {
      const waitSeconds = Math.ceil((lockoutUntil - now) / 1000);
      throw new Error(`Account temporarily locked due to repeated invalid attempts. Please try again in ${waitSeconds} seconds.`);
    }

    // 2. Rate-limit OTP requests: max 20 requests per 10 minutes
    const timestamps = (this.otpRequestTimes.get(cleanPhone) || []).filter(t => now - t < 10 * 60 * 1000);
    if (timestamps.length >= 20) {
      throw new Error('Too many OTP requests for this phone number. Please wait a few minutes before trying again.');
    }
    timestamps.push(now);
    this.otpRequestTimes.set(cleanPhone, timestamps);

    // Generate a 6-digit numeric OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = now + 10 * 60 * 1000; // strictly 10 minutes validity

    // Remove any previous active OTP for this phone & purpose
    this.data.otps = this.data.otps.filter(o => !(o.phone === cleanPhone && o.purpose === purpose));
    this.data.otps.push({ phone: cleanPhone, code, purpose, expires_at, attempts: 0 });
    this.save();
    return code;
  }

  verifyOtp(phone: string, code: string, purpose: string): boolean {
    const cleanPhone = normalizeNigerianPhone(phone);
    const trimmedCode = code.trim();
    const now = Date.now();

    // Check lockout
    const lockoutUntil = this.phoneLockouts.get(cleanPhone);
    if (lockoutUntil && now < lockoutUntil) {
      return false;
    }

    // Find active OTP record
    const otpIndex = this.data.otps.findIndex(
      o => o.phone === cleanPhone && o.purpose === purpose
    );

    if (otpIndex < 0) {
      return false;
    }

    const otpRecord = this.data.otps[otpIndex];

    // Check expiration
    if (now > otpRecord.expires_at) {
      this.data.otps.splice(otpIndex, 1);
      this.save();
      return false;
    }

    // In development mode, allow test master OTP '123456' ONLY for an active non-expired OTP record
    const isDev = process.env.NODE_ENV !== 'production';
    if (otpRecord.code === trimmedCode || (isDev && trimmedCode === '123456')) {
      // SUCCESS: Invalidate immediately (single-use OTP, cannot be reused)
      this.data.otps.splice(otpIndex, 1);
      this.phoneLockouts.delete(cleanPhone);
      this.save();
      return true;
    } else {
      // FAILED ATTEMPT: Track attempts
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      if (otpRecord.attempts >= 5) {
        // Invalidate OTP and lock phone for 5 minutes
        this.data.otps.splice(otpIndex, 1);
        this.phoneLockouts.set(cleanPhone, now + 5 * 60 * 1000);
        this.recordAudit({
          event_type: 'AUTH_OTP_LOCKOUT',
          details: { phone: cleanPhone, purpose, reason: 'Exceeded 5 failed OTP attempts' }
        });
      }
      this.save();
      return false;
    }
  }

  // Audit Logs
  recordAudit(entry: {
    event_type: string;
    user_id?: string;
    group_id?: string;
    details?: Record<string, any>;
    ip_address?: string;
  }): AuditLogEntry {
    if (!this.data.audit_logs) {
      this.data.audit_logs = [];
    }
    const audit: AuditLogEntry = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      event_type: entry.event_type,
      user_id: entry.user_id,
      group_id: entry.group_id,
      details: entry.details || {},
      ip_address: entry.ip_address,
      created_at: new Date().toISOString()
    };
    this.data.audit_logs.push(audit);
    // Keep max 5000 records in JSON storage
    if (this.data.audit_logs.length > 5000) {
      this.data.audit_logs = this.data.audit_logs.slice(-5000);
    }
    this.save();
    return audit;
  }

  getAuditLogs(filter?: { limit?: number; event_type?: string; user_id?: string; group_id?: string }): AuditLogEntry[] {
    let logs = this.data.audit_logs || [];
    if (filter?.event_type) {
      logs = logs.filter(l => l.event_type === filter.event_type);
    }
    if (filter?.user_id) {
      logs = logs.filter(l => l.user_id === filter.user_id);
    }
    if (filter?.group_id) {
      logs = logs.filter(l => l.group_id === filter.group_id);
    }
    const limit = filter?.limit || 100;
    return logs.slice(-limit).reverse();
  }

  // Personal Ajo
  getAllPersonalAjos(): PersonalAjo[] {
    return this.data.personal_ajo || [];
  }

  getPersonalAjoByUserId(userId: string): PersonalAjo | undefined {
    return this.data.personal_ajo.find(p => p.user_id === userId);
  }

  createPersonalAjo(userId: string): PersonalAjo {
    let existing = this.getPersonalAjoByUserId(userId);
    if (existing) return existing;

    const newPersonal: PersonalAjo = {
      id: `pajo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: userId,
      balance: 0,
      total_deposited: 0,
      total_withdrawn: 0,
      status: 'pending_fee',
      created_at: new Date().toISOString()
    };
    this.data.personal_ajo.push(newPersonal);
    this.save();
    syncPersonalAjoToSupabase(newPersonal).catch(err => console.warn('[Supabase Personal Ajo Sync Warn]:', err?.message || err));
    fsUpsertPersonalAjo(newPersonal).catch(err => console.warn('[Firestore Personal Ajo Sync Warn]:', err?.message || err));
    return newPersonal;
  }

  activatePersonalAjo(userId: string): PersonalAjo {
    let personal = this.getPersonalAjoByUserId(userId);
    if (!personal) {
      personal = this.createPersonalAjo(userId);
    }
    personal.status = 'active';
    this.save();
    syncPersonalAjoToSupabase(personal).catch(err => console.warn('[Supabase Personal Ajo Sync Warn]:', err?.message || err));
    fsUpsertPersonalAjo(personal).catch(err => console.warn('[Firestore Personal Ajo Sync Warn]:', err?.message || err));
    return personal;
  }

  // Payment Records (Paystack Transactions)
  createPendingPayment(
    userId: string,
    reference: string,
    amountKobo: number = 60000,
    purpose: string = 'personal_registration'
  ): PaymentRecord {
    // If payment already exists for this reference, return it
    const existing = this.getPaymentByReference(reference);
    if (existing) return existing;

    const newPayment: PaymentRecord = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      purpose,
      amount: amountKobo / 100,
      amount_kobo: amountKobo,
      currency: 'NGN',
      reference,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    this.data.payments.push(newPayment);
    this.save();
    syncPaymentRecordToSupabase(newPayment).catch(err => console.warn('[Supabase Payment Sync Warn]:', err?.message || err));
    fsUpsertPayment(newPayment).catch(err => console.warn('[Firestore Payment Sync Warn]:', err?.message || err));
    return newPayment;
  }

  getPaymentByReference(reference: string): PaymentRecord | undefined {
    return this.data.payments.find(p => p.reference === reference);
  }

  updatePaymentStatus(
    reference: string,
    status: PaymentStatus,
    gatewayResponse?: string
  ): PaymentRecord | undefined {
    const payment = this.getPaymentByReference(reference);
    if (payment) {
      payment.status = status;
      if (gatewayResponse) {
        payment.gateway_response = gatewayResponse;
      }
      payment.updated_at = new Date().toISOString();
      this.save();
      syncPaymentRecordToSupabase(payment).catch(err => console.warn('[Supabase Payment Sync Warn]:', err?.message || err));
      fsUpsertPayment(payment).catch(err => console.warn('[Firestore Payment Sync Warn]:', err?.message || err));
      return payment;
    }
    return undefined;
  }

  getPaymentsByUserId(userId: string): PaymentRecord[] {
    return this.data.payments.filter(p => p.user_id === userId);
  }

  getAllPayments(): PaymentRecord[] {
    return this.data.payments || [];
  }

  getAllWithdrawals(): Withdrawal[] {
    return this.data.withdrawals || [];
  }

  depositPersonalAjo(userId: string, amount: number): PersonalAjo {
    let personal = this.getPersonalAjoByUserId(userId);
    if (!personal) {
      personal = this.activatePersonalAjo(userId);
    }
    personal.balance += amount;
    personal.total_deposited += amount;
    this.save();
    syncPersonalAjoToSupabase(personal).catch(err => console.warn('[Supabase Personal Ajo Sync Warn]:', err?.message || err));
    fsUpsertPersonalAjo(personal).catch(err => console.warn('[Firestore Personal Ajo Sync Warn]:', err?.message || err));
    return personal;
  }

  withdrawPersonalAjo(userId: string, amount: number, fee: number, netAmount: number, bank_name: string, account_number: string): { personal: PersonalAjo; withdrawal: Withdrawal } {
    const personal = this.getPersonalAjoByUserId(userId);
    if (!personal) throw new Error('Personal Ajo not found');
    if (personal.balance < amount) throw new Error('Insufficient balance');

    personal.balance -= amount;
    personal.total_withdrawn += amount;

    const withdrawal: Withdrawal = {
      id: `wth_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: userId,
      withdrawal_type: 'personal',
      amount,
      fee,
      net_amount: netAmount,
      bank_name,
      account_number,
      status: 'completed',
      created_at: new Date().toISOString()
    };
    this.data.withdrawals.push(withdrawal);
    
    // STEP 2 - Record 1.6% withdrawal commission into admin revenue
    if (fee > 0) {
      const userProfile = this.getProfileById(userId);
      this.recordAdminRevenue({
        type: 'withdrawal_1_6',
        amount: fee,
        reference: withdrawal.id,
        group_or_user: `Personal Saver: ${userProfile?.full_name || 'User'}`,
        user_id: userId,
        gross_amount: amount,
        description: `1.6% Commission on Personal Ajo Withdrawal (₦${amount.toLocaleString()})`
      });
    }

    this.save();
    syncWithdrawalToSupabase(withdrawal).catch(err => console.warn('[Supabase Withdrawal Sync Warn]:', err?.message || err));
    fsUpsertWithdrawal(withdrawal).catch(err => console.warn('[Firestore Withdrawal Sync Warn]:', err?.message || err));
    syncPersonalAjoToSupabase(personal).catch(err => console.warn('[Supabase Personal Ajo Sync Warn]:', err?.message || err));
    fsUpsertPersonalAjo(personal).catch(err => console.warn('[Firestore Personal Ajo Sync Warn]:', err?.message || err));
    return { personal, withdrawal };
  }

  rollbackPersonalWithdrawal(userId: string, withdrawalId: string, amount: number): boolean {
    const personal = this.getPersonalAjoByUserId(userId);
    if (personal) {
      personal.balance += amount;
      personal.total_withdrawn = Math.max(0, personal.total_withdrawn - amount);
    }
    const idx = this.data.withdrawals.findIndex(w => w.id === withdrawalId);
    if (idx !== -1) {
      this.data.withdrawals.splice(idx, 1);
    }
    this.save();
    return true;
  }

  // Groups
  getAllGroups(): GroupAjo[] {
    return this.data.groups;
  }

  getGroupById(id: string): GroupAjo | undefined {
    return this.data.groups.find(g => g.id === id);
  }

  getGroupByCode(code: string): GroupAjo | undefined {
    const cleanCode = code.trim().toUpperCase();
    return this.data.groups.find(g => g.group_code.toUpperCase() === cleanCode);
  }

  createGroup(data: {
    admin_id: string;
    admin_name: string;
    group_name: string;
    member_limit: number;
    contribution_amount: number;
    cycle_type: GroupAjo['cycle_type'];
    packing_fee?: number;
    whatsapp_number?: string;
    whatsappNumber?: string;
  }): { group: GroupAjo; adminMember?: GroupMember; adminProfile?: UserProfile } {
    // Generate unique code e.g. PAK-82K4M
    let code = '';
    do {
      const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      let rand = '';
      for (let i = 0; i < 5; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      code = `PAK-${rand}`;
    } while (this.data.groups.some(g => g.group_code === code));

    const packingFee = data.packing_fee !== undefined ? data.packing_fee : 3000;
    const waNumber = data.whatsapp_number || data.whatsappNumber;

    const group: GroupAjo = {
      id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      admin_id: data.admin_id,
      admin_name: data.admin_name,
      group_name: data.group_name,
      member_limit: data.member_limit,
      contribution_amount: data.contribution_amount,
      cycle_type: data.cycle_type,
      packing_amount: data.contribution_amount * data.member_limit,
      packing_fee: packingFee,
      withdrawalFee: packingFee,
      whatsapp_number: waNumber,
      whatsappNumber: waNumber,
      group_code: code,
      status: 'recruiting',
      current_round: 1,
      currentRound: 1,
      created_at: new Date().toISOString()
    };
    this.data.groups.push(group);

    // Group Admin is NOT a contributor, does NOT occupy Position 1, and is NOT in group_members.
    // Contributors start at 0 and join dynamically via join order.

    // Register/update creator profile role as GROUP_ADMIN (unless already SUPER_ADMIN)
    const profile = this.getProfileById(data.admin_id) || this.getProfileByPhone(data.admin_id);
    if (profile) {
      if (profile.role !== 'SUPER_ADMIN') {
        profile.role = 'GROUP_ADMIN';
      }
      group.admin_id = profile.id;
      group.admin_name = profile.full_name || data.admin_name;
    }

    this.save();
    syncGroupToSupabase(group).catch(err => console.warn('[Supabase Group Sync Warn]:', err?.message || err));
    fsUpsertGroup(group).catch(err => console.warn('[Firestore Group Sync Warn]:', err?.message || err));
    if (profile) {
      syncProfileToSupabase(profile).catch(err => console.warn('[Supabase Profile Sync Warn]:', err?.message || err));
      fsUpsertProfile(profile).catch(err => console.warn('[Firestore Profile Sync Warn]:', err?.message || err));
    }
    return { group, adminProfile: profile };
  }

  updateGroupPackingFee(groupId: string, fee: number): GroupAjo {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    if (group.status !== 'recruiting') {
      throw new Error('Packing deduction can only be adjusted while the group is in recruiting status.');
    }

    const hasContributions = this.data.contributions.some(c => c.group_id === groupId && c.status === 'Paid');
    const hasPacks = this.data.pack_transactions.some(t => t.group_id === groupId && t.status === 'completed');
    if (hasContributions || hasPacks) {
      throw new Error('Packing deduction cannot be altered after contributions or pack payouts have commenced.');
    }

    if (isNaN(fee) || fee < 0) {
      throw new Error('Packing deduction must be a valid positive amount.');
    }

    if (fee > group.packing_amount * 0.20) {
      throw new Error('Packing deduction cannot exceed 20% of total group packing payout.');
    }

    group.packing_fee = fee;
    group.withdrawalFee = fee;
    this.save();
    return group;
  }

  getUserGroups(userIdOrPhone: string): {
    adminGroups: GroupAjo[];
    memberGroups: GroupAjo[];
    allGroups: GroupAjo[];
  } {
    const profile = this.getProfileById(userIdOrPhone) || this.getProfileByPhone(userIdOrPhone);
    const resolvedId = profile ? profile.id : userIdOrPhone;
    const cleanPhone = profile ? normalizeNigerianPhone(profile.phone) : normalizeNigerianPhone(userIdOrPhone);

    const adminGroups = this.data.groups.filter(
      g => g.admin_id === resolvedId || (profile && g.admin_id === profile.id) || (cleanPhone && g.admin_id === cleanPhone)
    );
    const memberGroupIds = new Set(
      this.data.group_members
        .filter(m => (m.user_id === resolvedId || (cleanPhone && normalizeNigerianPhone(m.phone) === cleanPhone)) && m.status === 'active')
        .map(m => m.group_id)
    );
    const memberGroups = this.data.groups.filter(g => memberGroupIds.has(g.id) && !adminGroups.some(ag => ag.id === g.id));

    const groupMap = new Map<string, GroupAjo>();
    for (const g of adminGroups) groupMap.set(g.id, g);
    for (const g of this.data.groups) {
      if (memberGroupIds.has(g.id)) groupMap.set(g.id, g);
    }

    return {
      adminGroups,
      memberGroups,
      allGroups: Array.from(groupMap.values())
    };
  }

  getGroupMembers(groupId: string): GroupMember[] {
    return this.data.group_members
      .filter(m => m.group_id === groupId && m.status === 'active')
      .sort((a, b) => a.position - b.position);
  }

  getAllGroupMemberships(userIdOrPhone: string): { group: GroupAjo; member: GroupMember }[] {
    const profile = this.getProfileById(userIdOrPhone) || this.getProfileByPhone(userIdOrPhone);
    const resolvedId = profile ? profile.id : userIdOrPhone;
    const cleanPhone = profile ? normalizeNigerianPhone(profile.phone) : normalizeNigerianPhone(userIdOrPhone);

    const results: { group: GroupAjo; member: GroupMember }[] = [];
    const members = this.data.group_members.filter(
      m => (m.user_id === resolvedId || (cleanPhone && normalizeNigerianPhone(m.phone) === cleanPhone)) && m.status === 'active'
    );
    for (const m of members) {
      const g = this.getGroupById(m.group_id);
      if (g) {
        results.push({ group: g, member: m });
      }
    }
    return results;
  }

  joinGroup(groupId: string, userProfile: UserProfile): GroupMember {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    const activeMembers = this.getGroupMembers(groupId);
    if (activeMembers.length >= group.member_limit) {
      throw new Error('This Better Ajo group is currently full.');
    }

    // Check if user already in group
    const existing = activeMembers.find(m => m.user_id === userProfile.id);
    if (existing) {
      return existing;
    }

    // Find first vacant position (1 to group.member_limit)
    const occupiedPositions = new Set(activeMembers.map(m => m.position));
    let nextPosition = 1;
    for (let p = 1; p <= group.member_limit; p++) {
      if (!occupiedPositions.has(p)) {
        nextPosition = p;
        break;
      }
    }

    const waNumber = userProfile.whatsapp_number || userProfile.whatsappNumber || userProfile.phone;

    const member: GroupMember = {
      id: `mem_${Date.now()}_${nextPosition}`,
      group_id: group.id,
      user_id: userProfile.id,
      full_name: userProfile.full_name,
      phone: userProfile.phone,
      whatsapp_number: waNumber,
      whatsappNumber: waNumber,
      bank_name: userProfile.bank_name,
      account_number: userProfile.account_number,
      position: nextPosition,
      status: 'active',
      current_round_status: 'pending_contribution',
      joined_at: new Date().toISOString()
    };
    this.data.group_members.push(member);

    // If reached capacity, update status
    if (activeMembers.length + 1 >= group.member_limit) {
      group.status = 'active';
    }

    // Create pending contribution for current round
    this.data.contributions.push({
      id: `cnt_${Date.now()}_${member.id}`,
      group_id: group.id,
      member_id: member.id,
      user_id: userProfile.id,
      round_number: group.current_round,
      amount: group.contribution_amount,
      status: 'Pending'
    });

    this.save();
    syncGroupMemberToSupabase(member).catch(err => console.warn('[Supabase Member Sync Warn]:', err?.message || err));
    fsUpsertGroupMember(member).catch(err => console.warn('[Firestore Member Sync Warn]:', err?.message || err));
    syncGroupToSupabase(group).catch(err => console.warn('[Supabase Group Sync Warn]:', err?.message || err));
    fsUpsertGroup(group).catch(err => console.warn('[Firestore Group Sync Warn]:', err?.message || err));
    return member;
  }

  // Completed packs and cycle helpers
  getCompletedPacks(groupId: string, roundNumber: number): PackTransaction[] {
    return this.data.pack_transactions.filter(
      t => t.group_id === groupId && t.round_number === roundNumber && t.status === 'completed'
    );
  }

  isMemberPacked(groupId: string, memberId: string, roundNumber: number): boolean {
    return this.data.pack_transactions.some(
      t => t.group_id === groupId && t.member_id === memberId && t.round_number === roundNumber && t.status === 'completed'
    );
  }

  getGroupCycleInfo(groupId: string, roundNumber: number, simulatedDate?: string): GroupCycleInfo {
    const group = this.getGroupById(groupId);
    const intervalDays = group ? getCycleIntervalDays(group.cycle_type) : 1;
    const todayDate = getNigeriaCalendarDate(simulatedDate);
    const completedPacks = this.getCompletedPacks(groupId, roundNumber);
    const totalPacked = completedPacks.length;
    const activeMembers = this.getGroupMembers(groupId);
    const allPacked = activeMembers.length > 0 && totalPacked >= activeMembers.length;

    let cycleNumber = totalPacked + 1;
    let cycleOpenDate = todayDate;
    let lastPackDate: string | null = null;
    let lastPackMemberId: string | null = null;

    if (completedPacks.length > 0) {
      const sorted = [...completedPacks].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const lastPack = sorted[sorted.length - 1];
      lastPackDate = getNigeriaCalendarDate(lastPack.created_at);
      lastPackMemberId = lastPack.member_id;

      if (!allPacked) {
        cycleOpenDate = addCycleIntervalToCalendarDate(lastPackDate, group?.cycle_type, 1);
      } else {
        cycleOpenDate = lastPackDate;
      }
    } else if (roundNumber > 1) {
      // MULTI-ROUND SEQUENTIAL CONTINUITY (BUG 1 FIX):
      // If interval is 3 days and start date is Sept 17, then:
      // Round 1 = Sept 17, Round 2 = Sept 20, Round 3 = Sept 23, etc.
      // nextRoundDate = previousRoundDate + intervalDays. Never use minus.
      const intervalDaysNum = group ? getCycleIntervalDays(group.cycle_type) : 3;
      const initialStartDate = group?.created_at
        ? getNigeriaCalendarDate(group.created_at)
        : todayDate;

      // Sequential target round date based on roundNumber
      const sequentialRoundDate = addDaysToCalendarDate(initialStartDate, intervalDaysNum * (roundNumber - 1));

      let effectiveRoundDate = group?.round_started_at
        ? getNigeriaCalendarDate(group.round_started_at)
        : sequentialRoundDate;

      // Auto-correct old corrupted historical dates that went backwards:
      if (effectiveRoundDate <= initialStartDate) {
        effectiveRoundDate = sequentialRoundDate;
      }

      cycleOpenDate = effectiveRoundDate;
    } else {
      cycleOpenDate = group ? getNigeriaCalendarDate(group.created_at) : todayDate;
    }

    const isCycleOpen = !allPacked && (todayDate >= cycleOpenDate);
    const scheduledPackDate = cycleOpenDate;
    const scheduledPackDateDisplay = formatCalendarDateDisplay(scheduledPackDate);
    const nextPackDate = addCycleIntervalToCalendarDate(cycleOpenDate, group?.cycle_type, 1);
    const nextPackDateDisplay = formatCalendarDateDisplay(nextPackDate);
    const hasPackedToday = completedPacks.some(t => getNigeriaCalendarDate(t.created_at) === todayDate);

    return {
      cycleNumber,
      intervalDays,
      todayDate,
      lastPackDate,
      lastPackMemberId,
      cycleOpenDate,
      scheduledPackDate,
      scheduledPackDateDisplay,
      nextPackDate,
      nextPackDateDisplay,
      isCycleOpen,
      hasPackedToday,
      totalPacked,
      allPacked
    };
  }

  getCurrentCycleNumber(groupId: string, roundNumber: number, simulatedDate?: string): number {
    return this.getGroupCycleInfo(groupId, roundNumber, simulatedDate).cycleNumber;
  }

  hasPackedToday(groupId: string, roundNumber: number, simulatedDate?: string): boolean {
    const todayStr = getNigeriaCalendarDate(simulatedDate);
    const completed = this.getCompletedPacks(groupId, roundNumber);
    return completed.some(t => getNigeriaCalendarDate(t.created_at) === todayStr);
  }

  getTodayPackedMember(groupId: string, roundNumber: number, simulatedDate?: string): GroupMember | null {
    const todayStr = getNigeriaCalendarDate(simulatedDate);
    const completed = this.getCompletedPacks(groupId, roundNumber);
    const todayPack = completed.find(t => getNigeriaCalendarDate(t.created_at) === todayStr);
    if (!todayPack) return null;
    return this.data.group_members.find(m => m.id === todayPack.member_id) || null;
  }

  // Contributions
  getGroupContributions(groupId: string, roundNumber: number): Contribution[] {
    return this.data.contributions.filter(c => c.group_id === groupId && c.round_number === roundNumber);
  }

  hasMemberPaidCurrentCycle(groupId: string, memberId: string, roundNumber: number, simulatedDate?: string): boolean {
    const group = this.getGroupById(groupId);
    if (!group) return false;

    const cycleInfo = this.getGroupCycleInfo(groupId, roundNumber, simulatedDate);

    // Find all verified Paid contributions by this member in this round
    const paidContributions = this.data.contributions.filter(
      c => c.group_id === groupId && c.member_id === memberId && c.round_number === roundNumber && c.status === 'Paid'
    );

    if (paidContributions.length === 0) return false;

    // If cycle is not open yet (interval has not elapsed since last pack),
    // no contribution is open or paid for this upcoming cycle.
    if (!cycleInfo.isCycleOpen) {
      return false;
    }

    // When the cycle is open, check if the member has paid specifically for this cycleNumber
    const hasCyclePayment = paidContributions.some(c => {
      if (typeof c.cycle_number === 'number') {
        return c.cycle_number === cycleInfo.cycleNumber;
      }
      if (c.paid_at && cycleInfo.cycleOpenDate) {
        const paidCalDate = getNigeriaCalendarDate(c.paid_at);
        return paidCalDate >= cycleInfo.cycleOpenDate;
      }
      return false;
    });

    return hasCyclePayment;
  }

  getCycleContributionStatus(groupId: string, roundNumber: number, simulatedDate?: string): {
    totalRequired: number;
    paidCount: number;
    allPaid: boolean;
    unpaidMemberIds: string[];
  } {
    const group = this.getGroupById(groupId);
    const activeMembers = this.getGroupMembers(groupId);
    const totalRequired = group ? group.member_limit : activeMembers.length;
    const cycleInfo = this.getGroupCycleInfo(groupId, roundNumber, simulatedDate);

    // If cycle is not open yet, packing cannot proceed today and contributions for this cycle are not collected yet
    if (!cycleInfo.isCycleOpen) {
      return {
        totalRequired,
        paidCount: 0,
        allPaid: false,
        unpaidMemberIds: activeMembers.map(m => m.id)
      };
    }

    const unpaidMemberIds: string[] = [];
    let paidCount = 0;

    for (const m of activeMembers) {
      if (this.hasMemberPaidCurrentCycle(groupId, m.id, roundNumber, simulatedDate)) {
        paidCount++;
      } else {
        unpaidMemberIds.push(m.id);
      }
    }

    const allPaid = totalRequired > 0 && activeMembers.length >= totalRequired && paidCount >= totalRequired && unpaidMemberIds.length === 0;

    return {
      totalRequired,
      paidCount,
      allPaid,
      unpaidMemberIds
    };
  }

  markContributionPaid(groupId: string, memberId: string, roundNumber: number, reference: string, simulatedDate?: string, authenticatedUserId?: string): Contribution {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    const member = this.data.group_members.find(m => m.id === memberId && m.group_id === groupId);
    if (!member) throw new Error('Member not found');

    if (authenticatedUserId && member.user_id !== authenticatedUserId) {
      throw new Error('Security violation: authenticated_user_id must match the member receiving credit for that contribution.');
    }

    const cycleInfo = this.getGroupCycleInfo(groupId, roundNumber, simulatedDate);
    const currentCycle = cycleInfo.cycleNumber;
    const todayStr = cycleInfo.todayDate;

    // Look for an existing contribution for this member in this round and cycle
    let contribution = this.data.contributions.find(
      c => c.group_id === groupId && 
           c.member_id === memberId && 
           c.round_number === roundNumber &&
           (c.cycle_number === currentCycle || (!c.cycle_number && currentCycle === 1))
    );

    const paidTimestamp = simulatedDate ? new Date(simulatedDate + 'T12:00:00.000Z').toISOString() : new Date().toISOString();

    if (!contribution) {
      contribution = {
        id: `cnt_${Date.now()}_${memberId}`,
        group_id: groupId,
        member_id: memberId,
        user_id: member.user_id,
        round_number: roundNumber,
        cycle_number: currentCycle,
        calendar_date: todayStr,
        amount: group.contribution_amount,
        status: 'Paid',
        reference,
        paid_at: paidTimestamp
      };
      this.data.contributions.push(contribution);
    } else {
      contribution.status = 'Paid';
      contribution.cycle_number = currentCycle;
      contribution.calendar_date = todayStr;
      contribution.reference = reference;
      contribution.paid_at = paidTimestamp;
      contribution.amount = group.contribution_amount;
    }

    // Update member current_round_status if not already packed
    if (member.current_round_status !== 'packed') {
      member.current_round_status = 'contributed';
    }

    this.save();
    syncContributionToSupabase(contribution).catch(err => console.warn('[Supabase Contribution Sync Warn]:', err?.message || err));
    fsUpsertContribution(contribution).catch(err => console.warn('[Firestore Contribution Sync Warn]:', err?.message || err));
    return contribution;
  }

  // Pack Rotation & Execution
  getCurrentPacker(groupId: string, roundNumber: number): GroupMember | null {
    const members = this.getGroupMembers(groupId);
    // Find earliest position member who has NOT packed in this round
    const packedMemberIds = new Set(
      this.data.pack_transactions
        .filter(t => t.group_id === groupId && t.round_number === roundNumber && t.status === 'completed')
        .map(t => t.member_id)
    );

    for (const m of members) {
      if (!packedMemberIds.has(m.id)) {
        return m;
      }
    }
    return null; // All have packed!
  }

  getNextPacker(groupId: string, roundNumber: number): GroupMember | null {
    const current = this.getCurrentPacker(groupId, roundNumber);
    if (!current) return null;

    const members = this.getGroupMembers(groupId);
    const packedMemberIds = new Set(
      this.data.pack_transactions
        .filter(t => t.group_id === groupId && t.round_number === roundNumber && t.status === 'completed')
        .map(t => t.member_id)
    );

    for (const m of members) {
      if (!packedMemberIds.has(m.id) && m.position > current.position) {
        return m;
      }
    }
    return null;
  }

  executePack(groupId: string, memberId: string, roundNumber: number, simulatedDate?: string): { transaction: PackTransaction; commission: Commission; roundCompleted: boolean } {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    const member = this.data.group_members.find(m => m.id === memberId && m.group_id === groupId);
    if (!member) throw new Error('Member not found');

    // 1. Confirm group is active and not round_completed
    if (group.status === 'round_completed') {
      throw new Error('This round is already completed.');
    }

    // 2. Confirm member is an active member
    if (member.status !== 'active') {
      throw new Error('You are not an active member of this group.');
    }

    // 3. Confirm member is the current packer in queue
    const currentPacker = this.getCurrentPacker(groupId, roundNumber);
    if (!currentPacker || currentPacker.id !== member.id) {
      throw new Error('It is not currently your turn to pack.');
    }

    // 4. Confirm member hasn't already packed this round
    const existingPack = this.data.pack_transactions.find(
      t => t.group_id === groupId && t.member_id === member.id && t.round_number === roundNumber && t.status === 'completed'
    );
    if (existingPack || member.current_round_status === 'packed') {
      throw new Error('Member has already packed in this round.');
    }

    // 5. Confirm cycle is eligible and open according to group's configured frequency
    const cycleInfo = this.getGroupCycleInfo(groupId, roundNumber, simulatedDate);
    if (!cycleInfo.isCycleOpen) {
      throw new Error(`Packing for this cycle is scheduled for ${cycleInfo.scheduledPackDateDisplay} (${cycleInfo.scheduledPackDate}).`);
    }

    // 6. Confirm no other member has already packed for this calendar day
    if (cycleInfo.hasPackedToday) {
      throw new Error(`Packing for today has already been completed. The next packing cycle opens on ${cycleInfo.scheduledPackDateDisplay}.`);
    }

    // 7. Confirm the packer's own contribution for this cycle has been paid
    const packerPaid = this.hasMemberPaidCurrentCycle(groupId, member.id, roundNumber, simulatedDate);
    if (!packerPaid) {
      throw new Error('Please pay your contribution for this cycle before you can pack.');
    }

    // 8. Confirm ALL required contributors have paid their contribution for this cycle
    const cycleStatus = this.getCycleContributionStatus(groupId, roundNumber, simulatedDate);
    if (!cycleStatus.allPaid) {
      throw new Error('Waiting for all members to complete their contribution before packing can proceed.');
    }

    // 8. Calculate amounts based on group's dynamic withdrawal fee / packing fee
    const amount = group.packing_amount;
    const fee = typeof (group as any).withdrawalFee === 'number'
      ? (group as any).withdrawalFee
      : (typeof group.packing_fee === 'number' ? group.packing_fee : 3000);

    // BUG 3 FIX: Whole Naira 66.67% / 33.33% split without decimals
    // const totalRounded = Math.round(totalAmount)
    // const packerShare = Math.round(totalRounded * 0.6667)
    // const adminShare = totalRounded - packerShare
    // Example: If total is 3000: Packer = 2000, Admin = 1000. If total is 5000: Packer = 3333, Admin = 1667.
    const rawFee = typeof (group as any).withdrawalFee === 'number'
      ? (group as any).withdrawalFee
      : (typeof group.packing_fee === 'number' ? group.packing_fee : 3000);
    const totalRounded = Math.round(rawFee);
    const packerShare = Math.round(totalRounded * 0.6667);
    const adminShare = totalRounded - packerShare;
    const groupAdminShare = packerShare;
    const superAdminShare = adminShare;
    const memberPayout = Math.round(amount) - totalRounded;

    (group as any).withdrawalFee = totalRounded;
    group.packing_fee = totalRounded;
    this.data.superAdminRevenue = (this.data.superAdminRevenue || 0) + superAdminShare;
    this.data.groupAdminRevenue = (this.data.groupAdminRevenue || 0) + groupAdminShare;
    (group as any).superAdminRevenue = ((group as any).superAdminRevenue || 0) + superAdminShare;
    (group as any).groupAdminRevenue = ((group as any).groupAdminRevenue || 0) + groupAdminShare;

    const isProd = process.env.NODE_ENV === 'production';
    const effectiveSimulatedDate = isProd ? undefined : simulatedDate;
    const packTimestamp = effectiveSimulatedDate ? new Date(effectiveSimulatedDate + 'T12:00:00.000Z').toISOString() : new Date().toISOString();

    // 9. Create pack transaction
    const transaction: PackTransaction = {
      id: `pck_${Date.now()}_${member.id}`,
      group_id: groupId,
      member_id: member.id,
      user_id: member.user_id,
      member_name: member.full_name,
      round_number: roundNumber,
      packing_amount: amount,
      packing_fee: totalRounded,
      withdrawalFee: totalRounded,
      member_amount: memberPayout,
      memberPayout: memberPayout,
      status: 'completed',
      bank_name: member.bank_name,
      account_number: member.account_number,
      created_at: packTimestamp
    };
    this.data.pack_transactions.push(transaction);

    // 10. Record commission
    const commission: Commission = {
      id: `com_${Date.now()}_${transaction.id}`,
      group_id: groupId,
      pack_transaction_id: transaction.id,
      packing_fee: totalRounded,
      withdrawalFee: totalRounded,
      admin_amount: groupAdminShare,
      groupAdminShare: groupAdminShare,
      super_admin_amount: superAdminShare,
      superAdminShare: superAdminShare,
      created_at: packTimestamp
    };
    this.data.commissions.push(commission);

    // STEP 2 - Record 33.33% packing share into admin revenue ledger
    if (superAdminShare > 0) {
      this.recordAdminRevenue({
        type: 'packing_33',
        amount: superAdminShare,
        reference: transaction.id,
        group_or_user: `Group: ${group.group_name}`,
        group_id: groupId,
        gross_amount: totalRounded,
        description: `33.33% Share of Group Packing Fee (Total Fee: ₦${totalRounded.toLocaleString()})`
      });
    }

    // 11. Update member status
    member.hasPackedThisRound = true;
    member.current_round_status = 'packed';

    // 12. Check if entire round is completed: MUST check group.members.every(m => m.hasPackedThisRound === true) NOT hasPaid
    const activeMembers = this.getGroupMembers(groupId);
    const roundCompleted = activeMembers.length > 0 && activeMembers.every(m => m.hasPackedThisRound === true);
    if (roundCompleted) {
      group.status = 'round_completed';
    }

    // 13. Record Audit Log for financial event
    this.recordAudit({
      event_type: 'GROUP_PACK_COMPLETED',
      user_id: member.user_id,
      group_id: groupId,
      details: {
        round_number: roundNumber,
        member_name: member.full_name,
        packing_amount: amount,
        packing_fee: fee,
        member_amount: memberPayout,
        admin_commission: groupAdminShare,
        super_admin_commission: superAdminShare,
        destination_bank: member.bank_name,
        destination_account: member.account_number
      }
    });

    this.save();
    syncPackTransactionToSupabase(transaction).catch(err => console.warn('[Supabase Pack Sync Warn]:', err?.message || err));
    fsUpsertPackTransaction(transaction).catch(err => console.warn('[Firestore Pack Sync Warn]:', err?.message || err));
    syncCommissionToSupabase(commission).catch(err => console.warn('[Supabase Commission Sync Warn]:', err?.message || err));
    fsUpsertCommission(commission).catch(err => console.warn('[Firestore Commission Sync Warn]:', err?.message || err));
    return { transaction, commission, roundCompleted };
  }

  rollbackPack(groupId: string, transactionId: string, commissionId: string | undefined, memberId: string, roundCompleted: boolean): boolean {
    const tIdx = this.data.pack_transactions.findIndex(t => t.id === transactionId);
    if (tIdx !== -1) {
      this.data.pack_transactions.splice(tIdx, 1);
    }
    if (commissionId) {
      const cIdx = this.data.commissions.findIndex(c => c.id === commissionId);
      if (cIdx !== -1) {
        this.data.commissions.splice(cIdx, 1);
      }
    }
    const member = this.data.group_members.find(m => m.id === memberId && m.group_id === groupId);
    if (member) {
      member.hasPackedThisRound = false;
      member.current_round_status = 'contributed';
    }
    if (roundCompleted) {
      const group = this.getGroupById(groupId);
      if (group && (group.status as string) === 'round_completed') {
        group.status = 'active';
      }
    }
    this.save();
    return true;
  }

  getPackTransactionByMember(groupId: string, memberId: string, roundNumber: number): PackTransaction | undefined {
    return this.data.pack_transactions.find(
      t => t.group_id === groupId && t.member_id === memberId && t.round_number === roundNumber && t.status === 'completed'
    );
  }

  getCommissionByPackTransactionId(packTransactionId: string): Commission | undefined {
    return this.data.commissions.find(c => c.pack_transaction_id === packTransactionId);
  }

  getPaymentById(paymentId: string): PaymentRecord | undefined {
    return this.data.payments?.find(p => p.id === paymentId);
  }

  // Admin Commission & Group Admin Dashboard
  getAdminCommissionBalance(groupId: string): { total: number; available: number; withdrawn: number } {
    const group = this.getGroupById(groupId);
    if (!group) return { total: 0, available: 0, withdrawn: 0 };

    // BUG 3 FIX: Live Calculation without reading old 50/50 or decimals from database
    // const totalRounded = Math.round(totalAmount)
    // const packerShare = Math.round(totalRounded * 0.6667)
    // const adminShare = totalRounded - packerShare
    const totalFeeAmount = typeof (group as any).withdrawalFee === 'number'
      ? (group as any).withdrawalFee
      : (typeof group.packing_fee === 'number' ? group.packing_fee : 3000);
    const totalRounded = Math.round(totalFeeAmount);
    const packerShare = Math.round(totalRounded * 0.6667); // Whole Naira: 2000 for 3000 fee, 3333 for 5000 fee

    const packTxs = this.data.pack_transactions.filter(
      t => t.group_id === groupId && t.status === 'completed'
    );
    const total = packTxs.length * packerShare;

    const adminId = group.admin_id;
    const withdrawals = this.data.withdrawals.filter(
      w => w.user_id === adminId &&
        (w.group_id === groupId || w.withdrawal_type === 'admin_commission') &&
        w.status !== 'failed'
    );
    const withdrawn = withdrawals.reduce((sum, w) => sum + Math.round(w.amount), 0);
    const available = Math.max(0, total - withdrawn);

    return {
      total: Math.round(total),
      available: Math.round(available),
      withdrawn: Math.round(withdrawn)
    };
  }

  getGroupAdminDashboardData(groupId: string, userId: string): GroupAdminDashboardData {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    // Strict Backend Authorization: Group Admin can ONLY access the administration of their own group!
    if (group.admin_id !== userId) {
      throw new Error('Unauthorized: You can only access the administration of your own group.');
    }

    const adminProfile = this.getProfileById(userId);
    const members = this.getGroupMembers(groupId);
    const currentPacker = this.getCurrentPacker(groupId, group.current_round);
    const nextPacker = this.getNextPacker(groupId, group.current_round);
    const cycleInfo = this.getGroupCycleInfo(groupId, group.current_round);

    const totalMembersExpected = group.member_limit;
    const membersJoinedCount = members.length;

    const totalContributionsAmount = this.data.contributions
      .filter(c => c.group_id === groupId && c.status === 'Paid')
      .reduce((sum, c) => sum + c.amount, 0);

    const totalPackedAmount = this.data.pack_transactions
      .filter(t => t.group_id === groupId && t.status === 'completed')
      .reduce((sum, t) => sum + t.packing_amount, 0);

    const balance = this.getAdminCommissionBalance(groupId);
    const totalEarned = balance.total;
    const available = balance.available;
    const withdrawn = balance.withdrawn;
    const withdrawals = this.data.withdrawals.filter(
      w => w.user_id === userId &&
        (w.group_id === groupId || w.withdrawal_type === 'admin_commission')
    );

    // Members list for this group only
    const memberItems: GroupAdminMemberItem[] = members.map(m => {
      const hasContributed = this.hasMemberPaidCurrentCycle(groupId, m.id, group.current_round);
      const hasPacked = this.isMemberPacked(groupId, m.id, group.current_round);
      const current_round_status = hasPacked ? 'packed' : (hasContributed ? 'contributed' : 'pending_contribution');
      const totalContributed = this.data.contributions
        .filter(c => c.group_id === groupId && c.member_id === m.id && c.status === 'Paid')
        .reduce((sum, c) => sum + c.amount, 0);

      // Estimated pack date based on position
      const posDiff = m.position - (currentPacker?.position || 1);
      const estDate = new Date();
      if (posDiff > 0) {
        let intervalDays = 30;
        if (group.cycle_type === 'Every 3 Days') intervalDays = 3;
        else if (group.cycle_type === 'Every 5 Days') intervalDays = 5;
        else if (group.cycle_type === 'Every 7 Days') intervalDays = 7;
        else if (group.cycle_type === 'Every 14 Days') intervalDays = 14;
        estDate.setDate(estDate.getDate() + posDiff * intervalDays);
      }

      const userProf = this.getProfileById(m.user_id);
      const maskedV = userProf?.verification_number
        ? `${userProf.verification_type || 'BVN'}: ••••••${userProf.verification_number.slice(-4)}`
        : 'Verified (NDPR)';

      return {
        id: m.id,
        user_id: m.user_id,
        full_name: m.full_name || userProf?.full_name || 'Member',
        phone: m.phone || userProf?.phone || '',
        position: m.position,
        status: m.status,
        current_round_status,
        hasContributed,
        hasPacked,
        next_round_consent: m.next_round_consent,
        scheduledPackDate: estDate.toISOString().split('T')[0],
        scheduledPackDateDisplay: formatDisplayDate(estDate.toISOString().split('T')[0]),
        totalContributed,
        bank_name: m.bank_name || userProf?.bank_name || 'Not provided',
        account_number: m.account_number || userProf?.account_number || 'Not provided',
        verification_type: userProf?.verification_type || 'BVN',
        verification_masked: maskedV,
        verification_status: 'Verified',
        joined_at: m.joined_at
      };
    });

    // Earnings History for this group
    const packTxs = this.data.pack_transactions
      .filter(t => t.group_id === groupId && t.status === 'completed')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const earningsHistory: GroupAdminEarningItem[] = packTxs.map(p => {
      const com = this.data.commissions.find(c => c.pack_transaction_id === p.id);
      const member = members.find(m => m.id === p.member_id);

      // BUG 3 FIX: Live whole number calculation without decimals or old 50/50 from db
      const rawFee = typeof (group as any)?.withdrawalFee === 'number'
        ? (group as any).withdrawalFee
        : (typeof p.packing_fee === 'number' ? p.packing_fee : (typeof group.packing_fee === 'number' ? group.packing_fee : 3000));
      const totalRounded = Math.round(rawFee);
      const packerShare = Math.round(totalRounded * 0.6667);
      const adminShare = totalRounded - packerShare;

      return {
        id: com?.id || `com_${p.id}`,
        date: p.created_at,
        group_name: group.group_name,
        group_id: group.id,
        member_name: p.member_name,
        member_position: member?.position || 0,
        packed_amount: p.packing_amount,
        packing_fee: totalRounded,
        super_admin_share: adminShare,
        group_admin_share: packerShare,
        status: 'SUCCESSFUL',
        reference: p.id
      };
    });

    // Central ledger entries for this group
    const transactions: CentralLedgerEntry[] = [
      ...this.data.contributions
        .filter(c => c.group_id === groupId && c.status === 'Paid')
        .map(c => ({
          id: c.id,
          reference: c.reference || c.id,
          type: 'GROUP_CONTRIBUTION' as const,
          description: `Contribution for Round ${c.round_number}`,
          user_id: c.user_id,
          user_name: members.find(m => m.id === c.member_id)?.full_name || 'Member',
          group_id: groupId,
          group_name: group.group_name,
          amount: c.amount,
          status: 'successful' as const,
          date: c.paid_at || c.id,
          created_at: c.paid_at || c.id
        })),
      ...packTxs.map(p => ({
        id: p.id,
        reference: p.id,
        type: 'GROUP_PACKING' as const,
        description: `Pack Payout Round ${p.round_number} to ${p.member_name}`,
        user_id: p.user_id,
        user_name: p.member_name,
        group_id: groupId,
        group_name: group.group_name,
        amount: p.packing_amount,
        status: 'successful' as const,
        date: p.created_at,
        created_at: p.created_at
      })),
      ...withdrawals.map(w => ({
        id: w.id,
        reference: w.reference || w.id,
        type: 'GROUP_ADMIN_WITHDRAWAL' as const,
        description: `Admin Commission Payout to ${w.bank_name}`,
        user_id: w.user_id,
        user_name: group.admin_name,
        group_id: groupId,
        group_name: group.group_name,
        amount: w.amount,
        status: (w.status === 'completed' || w.status === 'successful' ? 'successful' : w.status === 'failed' ? 'failed' : 'pending') as any,
        date: w.created_at,
        created_at: w.created_at
      }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      group,
      currentPacker,
      nextPacker,
      nextPackingDate: cycleInfo.scheduledPackDate,
      nextPackingDateDisplay: cycleInfo.scheduledPackDateDisplay,
      totalMembersExpected,
      membersJoinedCount,
      totalContributionsAmount,
      totalPackedAmount,
      adminEarnings: {
        totalEarned,
        available,
        withdrawn
      },
      members: memberItems,
      earningsHistory,
      withdrawals,
      transactions,
      adminBankDetails: {
        bank_name: adminProfile?.bank_name || '',
        account_number: adminProfile?.account_number || '',
        account_name: adminProfile?.full_name || group.admin_name
      }
    };
  }

  prepareGroupAdminWithdrawal(
    groupId: string,
    userId: string,
    amount: number,
    transferResult: PaystackTransferResult,
    customReference?: string
  ): { withdrawal: Withdrawal; payment: PaymentRecord } {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    if (group.admin_id !== userId) {
      throw new Error('Unauthorized: You can only withdraw from groups you created.');
    }

    const roundedAmount = Math.round(amount);
    const balance = this.getAdminCommissionBalance(groupId);
    if (roundedAmount <= 0 || roundedAmount > balance.available) {
      throw new Error(`Insufficient available earnings. Available: ₦${balance.available.toLocaleString()}`);
    }

    const admin = this.getProfileById(userId);
    if (!admin) throw new Error('Admin profile not found');

    const withdrawalStatus = ((transferResult.status as string) === 'successful' || (transferResult.status as string) === 'completed')
      ? 'completed'
      : (transferResult.status === 'processing' ? 'processing' : transferResult.status === 'failed' ? 'failed' : 'pending');

    const effectiveReference = customReference || transferResult.reference;
    const withdrawalId = `wth_ga_${groupId}_${userId}_${Math.round(roundedAmount * 100)}`;
    const withdrawal: Withdrawal = {
      id: withdrawalId,
      user_id: userId,
      group_id: groupId,
      withdrawal_type: 'admin_commission',
      amount: roundedAmount,
      fee: 0,
      net_amount: roundedAmount,
      bank_name: transferResult.bank_name || admin.bank_name,
      account_number: transferResult.account_number || admin.account_number,
      account_name: transferResult.account_name || admin.full_name,
      status: withdrawalStatus,
      reference: effectiveReference,
      paystack_transfer_code: transferResult.transfer_code,
      created_at: new Date().toISOString()
    };

    const payment: PaymentRecord = {
      id: `pay_${withdrawal.id}`,
      user_id: userId,
      purpose: 'Group Admin Commission Withdrawal',
      reference: effectiveReference,
      amount: roundedAmount,
      amount_kobo: Math.round(roundedAmount * 100),
      currency: 'NGN',
      type: 'Group Admin Withdrawal',
      status: (withdrawalStatus === 'completed' ? 'success' : 'pending') as any,
      created_at: withdrawal.created_at,
      paystack_reference: transferResult.transfer_code
    };

    return { withdrawal, payment };
  }

  withdrawGroupAdminEarnings(
    groupId: string,
    userId: string,
    amount: number,
    transferResult: PaystackTransferResult
  ): Withdrawal {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    if (group.admin_id !== userId) {
      throw new Error('Unauthorized: You can only withdraw from groups you created.');
    }

    const roundedAmount = Math.round(amount);
    const balance = this.getAdminCommissionBalance(groupId);
    if (roundedAmount <= 0 || roundedAmount > balance.available) {
      throw new Error(`Insufficient available earnings. Available: ₦${balance.available.toLocaleString()}`);
    }

    const admin = this.getProfileById(userId);
    if (!admin) throw new Error('Admin profile not found');

    const withdrawalStatus = ((transferResult.status as string) === 'successful' || (transferResult.status as string) === 'completed')
      ? 'completed'
      : (transferResult.status === 'processing' ? 'processing' : transferResult.status === 'failed' ? 'failed' : 'pending');

    const withdrawal: Withdrawal = {
      id: `wth_grp_${Date.now()}`,
      user_id: userId,
      group_id: groupId,
      withdrawal_type: 'admin_commission',
      amount: roundedAmount,
      fee: 0,
      net_amount: roundedAmount,
      bank_name: transferResult.bank_name || admin.bank_name,
      account_number: transferResult.account_number || admin.account_number,
      account_name: transferResult.account_name || admin.full_name,
      status: withdrawalStatus,
      reference: transferResult.reference,
      paystack_transfer_code: transferResult.transfer_code,
      created_at: new Date().toISOString()
    };

    this.data.withdrawals.push(withdrawal);

    // Record payment record in system
    if (!this.data.payments) this.data.payments = [];
    this.data.payments.push({
      id: `pay_${withdrawal.id}`,
      user_id: userId,
      purpose: 'Group Admin Commission Withdrawal',
      reference: transferResult.reference,
      amount: roundedAmount,
      amount_kobo: Math.round(roundedAmount * 100),
      currency: 'NGN',
      type: 'Group Admin Withdrawal',
      status: (withdrawalStatus === 'completed' ? 'success' : 'pending') as any,
      created_at: withdrawal.created_at,
      paystack_reference: transferResult.transfer_code
    });

    this.save();
    return withdrawal;
  }

  recordGroupNotification(
    groupId: string,
    adminId: string,
    message: string,
    recipientType: string,
    memberId?: string,
    channel: string = 'whatsapp_handoff'
  ) {
    if (!this.data.group_notifications) this.data.group_notifications = [];
    const record = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      group_id: groupId,
      admin_id: adminId,
      message,
      recipient_type: recipientType,
      member_id: memberId,
      channel,
      created_at: new Date().toISOString()
    };
    this.data.group_notifications.push(record);
    this.save();
    return record;
  }

  // Personal Ajo fee calculation from real successful payments
  getSuccessfulPersonalFees(): { payments: PaymentRecord[]; totalAmount: number } {
    const seenRefs = new Set<string>();
    const seenUserIds = new Set<string>();
    const validPayments: PaymentRecord[] = [];

    // 1. First, check all explicit successful personal registration payments
    for (const p of (this.data.payments || [])) {
      const isSuccess = p.status === 'success' || (p.status as string) === 'successful';
      const isPersonalFee =
        p.purpose === 'personal_registration' ||
        p.purpose === 'Personal Ajo Activation' ||
        p.purpose === 'Personal Ajo Registration' ||
        (p as any).type === 'Personal Ajo Registration Fee' ||
        p.amount === 600 ||
        p.amount_kobo === 60000;

      // Strictly ignore pending, failed, abandoned, reversed, or refunded payments
      if (!isSuccess || !isPersonalFee) continue;

      const refKey = p.reference || p.id;
      if (seenRefs.has(refKey)) continue;
      seenRefs.add(refKey);

      validPayments.push(p);
      if (p.user_id) seenUserIds.add(p.user_id);
    }

    // 2. Also check active Personal Ajo accounts (status === 'active')
    // Each successfully activated Personal Ajo represents a verified ₦600 registration fee.
    // If an active account has no payment record in validPayments yet, record it so historical fees are counted.
    for (const pa of (this.data.personal_ajo || [])) {
      if (pa.status !== 'active') continue;
      if (seenUserIds.has(pa.user_id)) continue;

      const ref = `pak_reg_${pa.id}`;
      if (!seenRefs.has(ref)) {
        seenRefs.add(ref);
        seenUserIds.add(pa.user_id);
        const feePayment: PaymentRecord = {
          id: `pay_reg_${pa.id}`,
          user_id: pa.user_id,
          purpose: 'personal_registration',
          amount: 600,
          amount_kobo: 60000,
          currency: 'NGN',
          reference: ref,
          status: 'success',
          created_at: pa.created_at || new Date().toISOString(),
          gateway_response: 'Successful (Personal Ajo Activation)'
        };
        validPayments.push(feePayment);
        if (!this.data.payments) this.data.payments = [];
        if (!this.data.payments.some(p => p.reference === ref || p.id === feePayment.id)) {
          this.data.payments.push(feePayment);
          this.save();
          syncPaymentRecordToSupabase(feePayment).catch(() => {});
        }
      }
    }

    const totalAmount = Number(
      validPayments.reduce((sum, p) => {
        const amt = p.amount || (p.amount_kobo ? p.amount_kobo / 100 : 600);
        return sum + amt;
      }, 0).toFixed(2)
    );

    return { payments: validPayments, totalAmount };
  }

  // Super Admin Full Data
  getSuperAdminFullData(userId?: string, phone?: string): SuperAdminFullData {
    const superAdminPhone = '08154267469';
    const profile = (userId ? this.getProfileById(userId) : null) || (phone ? this.getProfileByPhone(phone) : null);
    
    // Strict backend/database authorization:
    const isAuthorized = profile && (
      profile.role === 'SUPER_ADMIN' ||
      normalizeNigerianPhone(profile.phone) === superAdminPhone
    );

    if (!isAuthorized) {
      throw new Error('Unauthorized: Access restricted to authorized Super Administrator.');
    }

    // 1. Metrics from real database
    const totalUsers = this.data.profiles.length;
    const personalAjoAccounts = this.data.personal_ajo.length;
    const groupsCount = this.data.groups.length;
    const groupMembersCount = this.data.group_members.filter(m => m.status === 'active').length;

    const totalContributionsAmount = this.data.contributions
      .filter(c => c.status === 'Paid')
      .reduce((sum, c) => sum + c.amount, 0);

    const totalPackingAmount = this.data.pack_transactions
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + t.packing_amount, 0);

    this.initSuperAdminEarnings();
    const wallet = this.getSuperAdminWallet();
    const superAdminAvailableBalance = wallet.available_balance;
    const superAdminWithdrawnAmount = wallet.total_withdrawn;
    const totalSuperAdminEarnings = wallet.total_gross_earnings;
    const totalPersonalPlatformFees = wallet.breakdown.reg_600_total;
    const totalContributionFees = wallet.breakdown.contrib_60_total;
    const totalSuperAdminCommission = wallet.breakdown.packing_33_total;
    const totalPersonalWithdrawalFees = wallet.breakdown.withdrawal_1_6_total;
    const totalGroupPackingFees = Number((this.data.commissions.reduce((sum, c) => sum + Math.round((c.admin_amount + c.super_admin_amount) * 100), 0) / 100).toFixed(2));
    const totalGroupAdminEarnings = Number((this.data.commissions.reduce((sum, c) => sum + Math.round(c.admin_amount * 100), 0) / 100).toFixed(2));
    const totalPlatformEarnings = totalPersonalPlatformFees + totalGroupPackingFees + totalContributionFees;

    const allCompletedWithdrawals = this.data.withdrawals.filter(w => w.status === 'completed' || w.status === 'successful');
    const totalWithdrawalsAmount = Number(allCompletedWithdrawals.reduce((sum, w) => sum + w.amount, 0).toFixed(2));
    const pendingWithdrawalsCount = this.data.withdrawals.filter(w => w.status === 'pending' || w.status === 'processing').length;

    // 2. Groups list
    const groups = this.data.groups.map(g => {
      const gMembers = this.getGroupMembers(g.id);
      const currentPacker = this.getCurrentPacker(g.id, g.current_round);
      const nextPacker = this.getNextPacker(g.id, g.current_round);
      const cycleInfo = this.getGroupCycleInfo(g.id, g.current_round);
      const adminProf = this.getProfileById(g.admin_id);

      return {
        id: g.id,
        group_name: g.group_name,
        group_code: g.group_code,
        admin_name: g.admin_name,
        admin_phone: adminProf?.phone || '',
        member_limit: g.member_limit,
        members_joined: gMembers.length,
        contribution_amount: g.contribution_amount,
        packing_amount: g.packing_amount,
        packing_fee: g.packing_fee || 3000,
        cycle_type: g.cycle_type,
        current_round: g.current_round,
        current_packer_name: currentPacker?.full_name || null,
        next_packer_name: nextPacker?.full_name || null,
        next_packing_date: cycleInfo.scheduledPackDate,
        status: g.status,
        created_at: g.created_at
      };
    });

    // 3. Members list
    const members = this.data.group_members.map(m => {
      const g = this.getGroupById(m.group_id);
      const totalContributed = this.data.contributions
        .filter(c => c.group_id === m.group_id && c.member_id === m.id && c.status === 'Paid')
        .reduce((sum, c) => sum + c.amount, 0);
      const packTx = this.data.pack_transactions.find(
        t => t.group_id === m.group_id && t.member_id === m.id && t.status === 'completed'
      );
      const totalPacked = packTx ? packTx.packing_amount : 0;

      return {
        id: m.id,
        full_name: m.full_name,
        phone: m.phone,
        bank_name: m.bank_name || 'Not provided',
        account_number: m.account_number || 'Not provided',
        account_status: m.status || 'Active',
        group_id: m.group_id,
        group_name: g?.group_name || 'Unknown Group',
        position: m.position,
        contribution_status: m.current_round_status === 'contributed' ? 'Paid' : (m.current_round_status === 'packed' ? 'Packed' : 'Pending'),
        packing_status: m.current_round_status === 'packed' ? 'Packed' : 'Awaiting Turn',
        registration_date: m.joined_at,
        total_contributed: totalContributed,
        total_packed: totalPacked,
        has_packed: m.current_round_status === 'packed'
      };
    });

    // 4. Payments list (accurate status, no duplicates, DB is source of truth)
    const payments: SuperAdminFullData['payments'] = [];
    const seenRefs = new Set<string>();

    if (this.data.payments && this.data.payments.length > 0) {
      for (const p of this.data.payments) {
        const u = this.getProfileById(p.user_id);
        seenRefs.add(p.reference);
        payments.push({
          id: p.id,
          reference: p.reference,
          user_name: u?.full_name || 'User',
          amount: p.amount,
          payment_type: p.type || p.purpose || 'Deposit',
          date: p.created_at,
          status: p.status === 'success' ? 'successful' : p.status,
          paystack_reference: p.paystack_reference
        });
      }
    }
    // Also include completed contributions as payments if not already tracked
    for (const c of this.data.contributions.filter(c => c.status === 'Paid')) {
      const ref = c.reference || c.id;
      if (seenRefs.has(ref)) {
        const existing = payments.find(p => p.reference === ref);
        if (existing) existing.status = 'successful';
        continue;
      }
      seenRefs.add(ref);
      const g = this.getGroupById(c.group_id);
      const u = this.getProfileById(c.user_id);
      payments.push({
        id: c.id,
        reference: ref,
        user_name: u?.full_name || 'Member',
        group_name: g?.group_name,
        amount: c.amount,
        payment_type: `Group Contribution (Round ${c.round_number})`,
        date: c.paid_at || c.id,
        status: 'successful'
      });
    }

    // 5. Packings list
    const packings = this.data.pack_transactions.map(p => {
      const g = this.getGroupById(p.group_id);
      const com = this.data.commissions.find(c => c.pack_transaction_id === p.id);
      const feeKobo = Math.round((p.packing_fee || (com ? com.admin_amount + com.super_admin_amount : 3000)) * 100);
      const superShareKobo = com ? Math.round(com.super_admin_amount * 100) : Math.round(feeKobo * 0.3333);
      const adminShareKobo = com ? Math.round(com.admin_amount * 100) : (feeKobo - superShareKobo);
      const fee = Number((feeKobo / 100).toFixed(2));
      const superShare = Number((superShareKobo / 100).toFixed(2));
      const adminShare = Number((adminShareKobo / 100).toFixed(2));
      const m = this.data.group_members.find(gm => gm.id === p.member_id);

      return {
        id: p.id,
        group_name: g?.group_name || 'Unknown Group',
        member_name: p.member_name,
        position: m?.position || 0,
        packed_amount: p.packing_amount,
        packing_fee: fee,
        super_admin_share: superShare,
        group_admin_share: adminShare,
        date: p.created_at,
        status: p.status,
        reference: p.id
      };
    });

    // 6. Withdrawals list
    const withdrawals = this.data.withdrawals.map(w => {
      const u = this.getProfileById(w.user_id);
      const g = w.group_id ? this.getGroupById(w.group_id) : undefined;
      const role = w.withdrawal_type === 'super_admin_revenue' ? 'SUPER_ADMIN' : (g ? 'GROUP_ADMIN' : 'MEMBER');

      return {
        id: w.id,
        user_name: u?.full_name || 'User',
        role,
        group_name: g?.group_name,
        amount: w.amount,
        bank_name: w.bank_name,
        account_number: w.account_number,
        account_name: w.account_name || u?.full_name,
        date: w.created_at,
        status: (w.status === 'completed' ? 'successful' : w.status) as any,
        reference: w.reference || w.id
      };
    });

    // 7. Group Admins list with full group details & activity
    const groupAdminMap = new Map<string, {
      admin_id: string;
      admin_name: string;
      phone: string;
      email?: string;
      bank_name: string;
      account_number: string;
      groups_owned_count: number;
      groups_list: string[];
      groups_details: Array<{
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
    }>();

    for (const g of this.data.groups) {
      const adminProf = this.getProfileById(g.admin_id);
      if (!groupAdminMap.has(g.admin_id)) {
        const adminWithdrawals = this.data.withdrawals.filter(
          w => w.user_id === g.admin_id && w.withdrawal_type === 'admin_commission' && w.status !== 'failed'
        );
        const withdrawnTotalKobo = adminWithdrawals.reduce((s, w) => s + Math.round(w.amount * 100), 0);
        const withdrawnTotal = Number((withdrawnTotalKobo / 100).toFixed(2));
        const ownedGroups = this.data.groups.filter(grp => grp.admin_id === g.admin_id);
        const totalEarningsKobo = this.data.commissions
          .filter(c => ownedGroups.some(grp => grp.id === c.group_id))
          .reduce((s, c) => s + Math.round(c.admin_amount * 100), 0);
        const totalEarnings = Number((totalEarningsKobo / 100).toFixed(2));
        const availableBalance = Math.max(0, Number(((totalEarningsKobo - withdrawnTotalKobo) / 100).toFixed(2)));

        const groupsDetails = ownedGroups.map(grp => {
          const membersCount = this.data.group_members.filter(m => m.group_id === grp.id).length;
          const cycleInfo = this.getGroupCycleInfo(grp.id, grp.current_round);
          const currentPacker = this.getCurrentPacker(grp.id, grp.current_round);
          const nextPacker = this.getNextPacker(grp.id, grp.current_round);
          return {
            group_id: grp.id,
            group_name: grp.group_name,
            group_code: grp.group_code,
            status: grp.status,
            member_limit: grp.member_limit,
            members_joined: membersCount,
            contribution_amount: grp.contribution_amount,
            cycle_type: grp.cycle_type,
            packing_fee: grp.packing_fee || 3000,
            created_at: grp.created_at,
            current_round: grp.current_round,
            current_packer_name: currentPacker?.full_name || null,
            next_packer_name: nextPacker?.full_name || null,
            next_packing_date: cycleInfo.scheduledPackDate
          };
        });

        groupAdminMap.set(g.admin_id, {
          admin_id: g.admin_id,
          admin_name: g.admin_name,
          phone: adminProf?.phone || '',
          email: adminProf?.email,
          bank_name: adminProf?.bank_name || '',
          account_number: adminProf?.account_number || '',
          groups_owned_count: ownedGroups.length,
          groups_list: ownedGroups.map(grp => grp.group_name),
          groups_details: groupsDetails,
          total_group_earnings: totalEarnings,
          total_withdrawn: withdrawnTotal,
          available_balance: availableBalance,
          account_status: 'Active'
        });
      }
    }
    const groupAdmins = Array.from(groupAdminMap.values());

    // Platform Personal Ajo members
    const personalUsers = (this.data.personal_ajo || []).map(pa => {
      const u = this.getProfileById(pa.user_id);
      return {
        id: pa.id,
        user_id: pa.user_id,
        full_name: u?.full_name || 'Personal Saver',
        phone: u?.phone || '',
        email: u?.email,
        bank_name: u?.bank_name || 'Not provided',
        account_number: u?.account_number || 'Not provided',
        account_status: pa.status === 'active' ? 'Active' : 'Pending Fee',
        balance: pa.balance,
        total_deposited: pa.total_deposited,
        total_withdrawn: pa.total_withdrawn,
        created_at: pa.created_at
      };
    });

    // 8. Super Admin Earnings Breakdown (Unified Wallet Streams)
    // Stream 1: Personal Ajo ₦600 Platform Registration Fees
    const personalFeeBreakdowns = (this.data.personal_ajo || []).map(pa => {
      const u = this.getProfileById(pa.user_id);
      const existingPay = this.data.payments?.find(p => p.user_id === pa.user_id && p.purpose === 'personal_registration');
      return {
        date: pa.created_at,
        source: `Personal Ajo: ${u?.full_name || 'Personal Saver'}`,
        description: `Personal Ajo Platform Registration Fee (₦600)`,
        amount: 600,
        reference: existingPay?.reference || `pak_reg_${pa.id}`
      };
    });

    // Stream 2: 1.6% Commission on Personal Ajo Withdrawals
    const personalWithdrawalFeeBreakdowns = (this.data.withdrawals || [])
      .filter(w => w.withdrawal_type === 'personal' && (w.status === 'completed' || w.status === 'successful' || !w.status || w.status === 'pending'))
      .map(w => {
        const u = this.getProfileById(w.user_id);
        const fee = w.fee || Math.round(w.amount * 0.016 * 100) / 100;
        return {
          date: w.created_at,
          source: `Personal Ajo: ${u?.full_name || 'Personal Saver'}`,
          description: `1.6% Commission on Personal Withdrawal (₦${w.amount.toLocaleString()})`,
          amount: fee,
          reference: w.reference || w.id
        };
      });

    // Stream 3: Group Super Admin Share (33.33% of packing fee)
    const groupPackingBreakdowns = this.data.commissions.map(c => {
      const g = this.getGroupById(c.group_id);
      return {
        date: c.created_at,
        source: `Group: ${g?.group_name || 'Group Ajo'}`,
        description: `33.33% Share of Group Packing Fee (Fee: ₦${(c.packing_fee || (c.admin_amount + c.super_admin_amount)).toLocaleString()})`,
        amount: c.super_admin_amount,
        reference: c.pack_transaction_id
      };
    });

    // Stream 4: ₦60 Group Contribution Processing Fees
    const contributionFeeBreakdowns = (this.data.contributions || [])
      .filter(c => c.status === 'Paid')
      .map(c => {
        const g = this.getGroupById(c.group_id);
        const u = this.getProfileById(c.user_id);
        return {
          date: c.paid_at || c.id,
          source: `Group: ${g?.group_name || 'Group Ajo'}`,
          description: `₦60 Contribution Processing Fee (Member: ${u?.full_name || 'Saver'}, Round ${c.round_number})`,
          amount: 60,
          reference: c.reference || c.id
        };
      });

    const superAdminEarningsBreakdown = [
      ...personalFeeBreakdowns,
      ...personalWithdrawalFeeBreakdowns,
      ...groupPackingBreakdowns,
      ...contributionFeeBreakdowns
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const superAdminEarnings = {
      totalEarnings: superAdminAvailableBalance,
      total_earned: totalSuperAdminEarnings,
      available_balance: superAdminAvailableBalance,
      total_withdrawn: superAdminWithdrawnAmount,
      pending_withdrawals: this.data.withdrawals.filter(
        w => w.withdrawal_type === 'super_admin_revenue' && (w.status === 'pending' || w.status === 'processing')
      ).length,
      breakdown: superAdminEarningsBreakdown
    };

    // 9. Central Ledger
    const ledger: CentralLedgerEntry[] = [
      ...this.data.contributions.filter(c => c.status === 'Paid').map(c => {
        const g = this.getGroupById(c.group_id);
        const u = this.getProfileById(c.user_id);
        return {
          id: c.id,
          reference: c.reference || c.id,
          type: 'GROUP_CONTRIBUTION' as const,
          description: `Group contribution for Round ${c.round_number}`,
          user_id: c.user_id,
          user_name: u?.full_name || 'Member',
          group_id: c.group_id,
          group_name: g?.group_name,
          amount: c.amount,
          status: 'successful' as const,
          date: c.paid_at || c.id,
          created_at: c.paid_at || c.id
        };
      }),
      ...this.data.pack_transactions.filter(p => p.status === 'completed').map(p => {
        const g = this.getGroupById(p.group_id);
        return {
          id: p.id,
          reference: p.id,
          type: 'GROUP_PACKING' as const,
          description: `Payout to ${p.member_name} (Round ${p.round_number})`,
          user_id: p.user_id,
          user_name: p.member_name,
          group_id: p.group_id,
          group_name: g?.group_name,
          amount: p.packing_amount,
          status: 'successful' as const,
          date: p.created_at,
          created_at: p.created_at
        };
      }),
      ...this.data.commissions.map(c => {
        const g = this.getGroupById(c.group_id);
        return {
          id: `fee_${c.id}`,
          reference: c.pack_transaction_id,
          type: 'GROUP_ADMIN_FEE' as const,
          description: `Group Admin Share (66.67%) from ${g?.group_name}`,
          user_id: g?.admin_id || '',
          user_name: g?.admin_name || 'Admin',
          group_id: c.group_id,
          group_name: g?.group_name,
          amount: c.admin_amount,
          status: 'successful' as const,
          date: c.created_at,
          created_at: c.created_at
        };
      }),
      ...this.data.commissions.map(c => {
        const g = this.getGroupById(c.group_id);
        return {
          id: `sa_fee_${c.id}`,
          reference: c.pack_transaction_id,
          type: 'SUPER_ADMIN_FEE' as const,
          description: `Super Admin Share (33.33%) from ${g?.group_name}`,
          user_id: 'super_admin',
          user_name: 'Super Admin',
          group_id: c.group_id,
          group_name: g?.group_name,
          amount: c.super_admin_amount,
          status: 'successful' as const,
          date: c.created_at,
          created_at: c.created_at
        };
      }),
      ...this.data.withdrawals.map(w => {
        const u = this.getProfileById(w.user_id);
        const g = w.group_id ? this.getGroupById(w.group_id) : undefined;
        let type: CentralLedgerEntry['type'] = 'PERSONAL_WITHDRAWAL';
        if (w.withdrawal_type === 'super_admin_revenue') type = 'SUPER_ADMIN_WITHDRAWAL';
        else if (w.withdrawal_type === 'admin_commission') type = 'GROUP_ADMIN_WITHDRAWAL';

        return {
          id: w.id,
          reference: w.reference || w.id,
          type,
          description: `Withdrawal to ${w.bank_name} (${w.account_number})`,
          user_id: w.user_id,
          user_name: u?.full_name || 'User',
          group_id: w.group_id,
          group_name: g?.group_name,
          amount: w.amount,
          status: (w.status === 'completed' || w.status === 'successful' ? 'successful' : w.status === 'failed' ? 'failed' : 'pending') as any,
          date: w.created_at,
          created_at: w.created_at
        };
      })
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      metrics: {
        totalUsers,
        personalAjoAccounts,
        groupsCount,
        groupMembersCount,
        totalContributionsAmount,
        totalPackingAmount,
        totalPlatformEarnings,
        totalGroupAdminEarnings,
        totalSuperAdminEarnings,
        totalWithdrawalsAmount,
        pendingWithdrawalsCount,
        superAdminAvailableBalance,
        superAdminWithdrawnAmount,
        totalPersonalPlatformFees,
        totalPersonalWithdrawalFees,
        superAdminCommission: totalSuperAdminCommission,
        totalContributionFees
      },
      groups,
      members,
      payments,
      packings,
      withdrawals,
      groupAdmins,
      personalUsers,
      superAdminEarnings,
      superAdminWallet: wallet,
      super_admin_wallet: wallet,
      adminRevenueLedger: this.data.admin_revenue_ledger || [],
      admin_revenue_ledger: this.data.admin_revenue_ledger || [],
      ledger,
      auditLogs: this.getAuditLogs({ limit: 100 })
    };
  }

  withdrawSuperAdminEarnings(
    userId: string,
    amount: number,
    transferResult: PaystackTransferResult
  ): Withdrawal {
    const superAdminPhone = '08154267469';
    const profile = this.getProfileById(userId);
    if (!profile || (profile.role !== 'SUPER_ADMIN' && normalizeNigerianPhone(profile.phone) !== superAdminPhone)) {
      throw new Error('Unauthorized: Only the authorized Super Admin can withdraw super admin earnings.');
    }

    const fullData = this.getSuperAdminFullData(profile.id);
    const available = fullData.superAdminEarnings.available_balance;
    // Tolerance for optical rounding from UI (e.g. 5267 when available is 5266.50)
    const effectiveAmount = (amount > available && amount <= Math.ceil(available) && (amount - available) <= 1)
      ? available
      : amount;

    if (effectiveAmount <= 0 || effectiveAmount > (available + 0.001)) {
      throw new Error(`Amount must be between ₦100 and available balance (₦${available.toFixed(2)})`);
    }

    const withdrawalStatus = ((transferResult.status as string) === 'successful' || (transferResult.status as string) === 'completed')
      ? 'completed'
      : (transferResult.status === 'processing' ? 'processing' : transferResult.status === 'failed' ? 'failed' : 'pending');

    const withdrawal: Withdrawal = {
      id: `wth_sa_${Date.now()}`,
      user_id: profile.id,
      withdrawal_type: 'super_admin_revenue',
      amount: effectiveAmount,
      fee: 0,
      net_amount: effectiveAmount,
      bank_name: transferResult.bank_name || profile.bank_name,
      account_number: transferResult.account_number || profile.account_number,
      account_name: transferResult.account_name || profile.full_name,
      status: withdrawalStatus,
      reference: transferResult.reference,
      paystack_transfer_code: transferResult.transfer_code,
      created_at: new Date().toISOString()
    };

    const payment: PaymentRecord = {
      id: `pay_${withdrawal.id}`,
      user_id: profile.id,
      purpose: 'Super Admin Revenue Withdrawal',
      reference: transferResult.reference,
      amount: effectiveAmount,
      amount_kobo: Math.round(effectiveAmount * 100),
      currency: 'NGN',
      type: 'Super Admin Withdrawal',
      status: (withdrawalStatus === 'completed' ? 'success' : 'pending') as any,
      created_at: withdrawal.created_at,
      paystack_reference: transferResult.transfer_code
    };

    this.recordConfirmedWithdrawal(withdrawal, payment);
    return withdrawal;
  }

  prepareSuperAdminWithdrawal(
    userId: string,
    amount: number,
    transferResult: PaystackTransferResult,
    customId?: string
  ): { withdrawal: Withdrawal; payment: PaymentRecord } {
    const superAdminPhone = '08154267469';
    const profile = this.getProfileById(userId);
    if (!profile || (profile.role !== 'SUPER_ADMIN' && normalizeNigerianPhone(profile.phone) !== superAdminPhone)) {
      throw new Error('Unauthorized: Profile not found for Super Admin.');
    }

    const fullData = this.getSuperAdminFullData(profile.id);
    const available = fullData.superAdminEarnings.available_balance;
    const effectiveAmount = (amount > available && amount <= Math.ceil(available) && (amount - available) <= 1)
      ? available
      : amount;

    if (effectiveAmount <= 0 || effectiveAmount > (available + 0.001)) {
      throw new Error(`Amount must be between ₦100 and available balance (₦${available.toFixed(2)})`);
    }

    const withdrawalStatus = ((transferResult.status as string) === 'successful' || (transferResult.status as string) === 'completed')
      ? 'completed'
      : (transferResult.status === 'processing' ? 'processing' : transferResult.status === 'failed' ? 'failed' : 'pending');

    const withdrawalId = customId || `wth_sa_${Date.now()}`;
    const withdrawal: Withdrawal = {
      id: withdrawalId,
      user_id: profile.id,
      withdrawal_type: 'super_admin_revenue',
      amount: effectiveAmount,
      fee: 0,
      net_amount: effectiveAmount,
      bank_name: transferResult.bank_name || profile.bank_name,
      account_number: transferResult.account_number || profile.account_number,
      account_name: transferResult.account_name || profile.full_name,
      status: withdrawalStatus,
      reference: transferResult.reference,
      paystack_transfer_code: transferResult.transfer_code,
      created_at: new Date().toISOString()
    };

    const payment: PaymentRecord = {
      id: `pay_${withdrawal.id}`,
      user_id: profile.id,
      purpose: 'Super Admin Revenue Withdrawal',
      reference: transferResult.reference,
      amount: effectiveAmount,
      amount_kobo: Math.round(effectiveAmount * 100),
      currency: 'NGN',
      type: 'Super Admin Withdrawal',
      status: (withdrawalStatus === 'completed' ? 'success' : 'pending') as any,
      created_at: withdrawal.created_at,
      paystack_reference: transferResult.transfer_code
    };

    return { withdrawal, payment };
  }

  recordConfirmedWithdrawal(withdrawal: Withdrawal, payment: PaymentRecord): void {
    if (!this.data.withdrawals) this.data.withdrawals = [];
    const wIdx = this.data.withdrawals.findIndex(w => w.id === withdrawal.id || (withdrawal.reference && w.reference === withdrawal.reference));
    if (wIdx >= 0) {
      this.data.withdrawals[wIdx] = withdrawal;
    } else {
      this.data.withdrawals.push(withdrawal);
    }

    if (!this.data.payments) this.data.payments = [];
    const pIdx = this.data.payments.findIndex(p => p.id === payment.id || (payment.reference && p.reference === payment.reference));
    if (pIdx >= 0) {
      this.data.payments[pIdx] = payment;
    } else {
      this.data.payments.push(payment);
    }

    this.recordAudit({
      event_type: withdrawal.withdrawal_type === 'admin_commission' ? 'FINANCIAL_GROUP_ADMIN_WITHDRAWAL' : 'FINANCIAL_SUPER_ADMIN_WITHDRAWAL',
      user_id: withdrawal.user_id,
      group_id: withdrawal.group_id,
      details: {
        amount: withdrawal.amount,
        status: withdrawal.status,
        bank: withdrawal.bank_name,
        account: withdrawal.account_number,
        reference: withdrawal.reference
      }
    });

    if (withdrawal.withdrawal_type === 'super_admin_revenue') {
      this.deductAdminRevenueWithdrawal(withdrawal, payment);
    }

    this.save();
  }

  // Round Management (Start Second, Third, etc. Round)
  setNextRoundConsent(groupId: string, userId: string, consent: boolean): { consent: boolean; member: GroupMember } {
    const member = this.data.group_members.find(m => m.group_id === groupId && m.user_id === userId);
    if (!member) throw new Error('Member not found in group');

    member.next_round_consent = consent;
    if (!consent) {
      // Member chooses not to continue
      member.status = 'left';
    }
    this.save();
    return { consent, member };
  }

  startNextRound(groupId: string, options?: { simulatedDate?: string; today?: string }): { group: GroupAjo; members: GroupMember[]; contributions: Contribution[] } {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    const effectiveDate = options?.simulatedDate || options?.today;
    const todayCalendarDate = getNigeriaCalendarDate(effectiveDate);
    const intervalDays = getCycleIntervalDays(group.cycle_type);

    // BUG 2 FIX: Sequential next round: nextRound = currentRound + 1 always
    // No modulo, no resetting to 1: 1 -> 2 -> 3 -> 4...
    const currentRound = typeof group.current_round === 'number' && group.current_round >= 1
      ? group.current_round
      : (typeof group.currentRound === 'number' && group.currentRound >= 1 ? group.currentRound : 1);
    const nextRound = currentRound + 1;

    // BUG 1 FIX: nextRoundDate = previousRoundDate + intervalDays. Never use minus.
    // If interval is 3 days and start date is Sept 17, then Round 1 = Sept 17, Round 2 = Sept 20, Round 3 = Sept 23 etc.
    const previousRoundDate = group.round_started_at
      ? getNigeriaCalendarDate(group.round_started_at)
      : (group.created_at ? getNigeriaCalendarDate(group.created_at) : todayCalendarDate);

    let nextRoundDate = calculateNextRoundDate(previousRoundDate, intervalDays);

    // Auto-correct old corrupted historical dates that went backwards:
    if (nextRoundDate < todayCalendarDate && previousRoundDate < todayCalendarDate) {
      nextRoundDate = calculateNextRoundDate(todayCalendarDate, intervalDays);
    }

    const roundStartedIso = new Date(nextRoundDate + 'T12:00:00.000Z').toISOString();
    const nextPackDate = nextRoundDate;

    group.current_round = nextRound;
    group.currentRound = nextRound;
    group.status = 'active';
    group.round_started_at = roundStartedIso;
    group.roundStartedAt = roundStartedIso;
    group.nextPackDate = nextPackDate;
    group.next_packing_date = nextPackDate;

    // On start, reset hasPackedThisRound = false for all members!
    const activeMembers = this.getGroupMembers(groupId);
    const newContributions: Contribution[] = [];

    for (const m of activeMembers) {
      m.current_round_status = 'pending_contribution';
      m.hasPackedThisRound = false;
      m.next_round_consent = undefined;

      // Add pending contribution for new round, cycle 1
      const contrib: Contribution = {
        id: `cnt_${Date.now()}_${m.id}_r${nextRound}`,
        group_id: groupId,
        member_id: m.id,
        user_id: m.user_id,
        round_number: nextRound,
        cycle_number: 1,
        calendar_date: nextRoundDate,
        amount: group.contribution_amount,
        status: 'Pending',
        created_at: roundStartedIso
      };
      this.data.contributions.push(contrib);
      newContributions.push(contrib);
    }

    this.save();
    return { group, members: activeMembers, contributions: newContributions };
  }

  startRound2(groupId: string, options?: { simulatedDate?: string; today?: string }): { group: GroupAjo; members: GroupMember[]; contributions: Contribution[] } {
    return this.startNextRound(groupId, options);
  }

  rollbackNextRound(
    groupId: string,
    previousRound: number,
    previousStatus: GroupAjo['status'],
    previousRoundStartedAt: string | undefined,
    previousMembers: GroupMember[],
    createdContributionIds: string[]
  ): void {
    const group = this.getGroupById(groupId);
    if (group) {
      group.current_round = previousRound;
      group.currentRound = previousRound;
      group.status = previousStatus;
      group.round_started_at = previousRoundStartedAt;
      group.roundStartedAt = previousRoundStartedAt;
    }

    for (const pm of previousMembers) {
      const idx = this.data.group_members.findIndex(m => m.id === pm.id);
      if (idx !== -1) {
        this.data.group_members[idx] = { ...pm };
      }
    }

    if (createdContributionIds && createdContributionIds.length > 0) {
      this.data.contributions = this.data.contributions.filter(
        c => !createdContributionIds.includes(c.id)
      );
    }

    this.save();
  }

  // Super Admin Metrics
  getSuperAdminMetrics(): SuperAdminMetrics {
    const totalUsers = this.data.profiles.length;
    const personalAjoAccounts = this.data.personal_ajo.length;
    const groupsCount = this.data.groups.length;
    const groupMembersCount = this.data.group_members.filter(m => m.status === 'active').length;

    const totalContributionsAmount = this.data.contributions
      .filter(c => c.status === 'Paid')
      .reduce((sum, c) => sum + c.amount, 0);

    const totalPackingTransactionsCount = this.data.pack_transactions.length;
    const wallet = this.getSuperAdminWallet();
    const totalPersonalPlatformFees = wallet.breakdown.reg_600_total;
    const totalPersonalWithdrawalFees = wallet.breakdown.withdrawal_1_6_total;
    const totalContributionFees = wallet.breakdown.contrib_60_total;
    const totalSuperAdminCommission = wallet.breakdown.packing_33_total;
    const totalGroupPackingFees = Number((this.data.commissions.reduce((sum, c) => sum + Math.round((c.admin_amount + c.super_admin_amount) * 100), 0) / 100).toFixed(2));
    const totalSuperAdminEarnings = wallet.total_gross_earnings;
    const superAdminCommission = totalSuperAdminEarnings;
    const superAdminAvailableBalance = wallet.available_balance;
    const superAdminWithdrawnAmount = wallet.total_withdrawn;

    const groupAdminCommissionTotalKobo = this.data.commissions.reduce((sum, c) => sum + Math.round(c.admin_amount * 100), 0);
    const groupAdminCommissionTotal = Number((groupAdminCommissionTotalKobo / 100).toFixed(2));

    const totalWithdrawalsAmountKobo = this.data.withdrawals.reduce((sum, w) => sum + Math.round(w.amount * 100), 0);
    const totalWithdrawalsAmount = Number((totalWithdrawalsAmountKobo / 100).toFixed(2));

    const recentTransactions = [
      ...this.data.pack_transactions.map(p => ({
        id: p.id,
        type: 'Pack Payout',
        description: `Group Pack to ${p.member_name} (Fee: ₦${(p.packing_fee || 0).toLocaleString()})`,
        amount: p.packing_amount,
        date: p.created_at
      })),
      ...this.data.withdrawals.map(w => ({
        id: w.id,
        type: `Withdrawal (${w.withdrawal_type})`,
        description: `Transfer to ${w.bank_name} ${w.account_number}`,
        amount: w.amount,
        date: w.created_at
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

    return {
      totalUsers,
      personalAjoAccounts,
      groupsCount,
      groupMembersCount,
      totalContributionsAmount,
      totalPackingTransactionsCount,
      totalPersonalPlatformFees,
      totalGroupPackingFees,
      superAdminCommission,
      totalSuperAdminEarnings,
      superAdminAvailableBalance,
      superAdminWithdrawnAmount,
      totalPersonalWithdrawalFees,
      totalContributionFees,
      groupAdminCommissionTotal,
      totalWithdrawalsAmount,
      recentTransactions
    };
  }

  // ----------------------------------------------------
  // LIVE SUPPORT & SECRETARY CHAT ENGINE
  // ----------------------------------------------------

  addSupportMessage(data: {
    session_id: string;
    user_id?: string;
    user_name: string;
    user_phone?: string;
    sender: 'user' | 'support' | 'assistant';
    sender_name?: string;
    text: string;
  }): SupportMessage {
    if (!this.data.support_messages) this.data.support_messages = [];
    const msg: SupportMessage = {
      id: `smsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      session_id: data.session_id,
      user_id: data.user_id,
      user_name: data.user_name || 'Customer',
      user_phone: data.user_phone,
      sender: data.sender,
      sender_name: data.sender_name || (data.sender === 'user' ? (data.user_name || 'Customer') : 'Better Ajo Support'),
      text: data.text,
      created_at: new Date().toISOString(),
      read_by_support: data.sender === 'support' || data.sender === 'assistant'
    };
    this.data.support_messages.push(msg);
    this.save();
    return msg;
  }

  getSupportMessages(sessionId: string): SupportMessage[] {
    if (!this.data.support_messages) return [];
    return this.data.support_messages.filter(m => m.session_id === sessionId);
  }

  getAllSupportConversations(): Array<{
    session_id: string;
    user_name: string;
    user_phone?: string;
    user_id?: string;
    last_message: string;
    last_message_time: string;
    unread_count: number;
    messages_count: number;
  }> {
    if (!this.data.support_messages) return [];
    const map = new Map<string, SupportMessage[]>();
    for (const msg of this.data.support_messages) {
      const list = map.get(msg.session_id) || [];
      list.push(msg);
      map.set(msg.session_id, list);
    }

    const conversations: Array<{
      session_id: string;
      user_name: string;
      user_phone?: string;
      user_id?: string;
      last_message: string;
      last_message_time: string;
      unread_count: number;
      messages_count: number;
    }> = [];

    for (const [sessionId, msgs] of map.entries()) {
      msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const lastMsg = msgs[msgs.length - 1];
      const userMsg = msgs.find(m => m.sender === 'user') || lastMsg;
      const unread = msgs.filter(m => m.sender === 'user' && !m.read_by_support).length;

      conversations.push({
        session_id: sessionId,
        user_name: userMsg?.user_name || 'Customer',
        user_phone: userMsg?.user_phone,
        user_id: userMsg?.user_id,
        last_message: lastMsg?.text || '',
        last_message_time: lastMsg?.created_at || new Date().toISOString(),
        unread_count: unread,
        messages_count: msgs.length
      });
    }

    conversations.sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());
    return conversations;
  }

  markSupportConversationRead(sessionId: string): void {
    if (!this.data.support_messages) return;
    let modified = false;
    for (const msg of this.data.support_messages) {
      if (msg.session_id === sessionId && !msg.read_by_support) {
        msg.read_by_support = true;
        modified = true;
      }
    }
    if (modified) {
      this.save();
    }
  }

  replySupportMessage(sessionId: string, text: string, supportName?: string): SupportMessage {
    const messages = this.getSupportMessages(sessionId);
    const lastUserMsg = [...messages].reverse().find(m => m.sender === 'user');
    return this.addSupportMessage({
      session_id: sessionId,
      user_id: lastUserMsg?.user_id,
      user_name: lastUserMsg?.user_name || 'Customer',
      user_phone: lastUserMsg?.user_phone,
      sender: 'support',
      sender_name: supportName || 'Better Ajo Support Secretary',
      text
    });
  }

  getSnapshotData(): DatabaseSchema {
    return JSON.parse(JSON.stringify(this.data));
  }

  async syncWithFirestore(): Promise<{ success: boolean; counts: Record<string, number> }> {
    if (!isFirebaseConfigured()) {
      return { success: false, counts: {} };
    }
    try {
      const res = await hydrateFromFirestore();
      if (!res.hydrated || !res.data) {
        return { success: false, counts: res.counts };
      }

      let modified = false;

      // 1. Profiles: merge missing or newer
      if (res.data.profiles && res.data.profiles.length > 0) {
        for (const fp of res.data.profiles) {
          const idx = this.data.profiles.findIndex(p => p.id === fp.id);
          if (idx >= 0) {
            const curTime = new Date(this.data.profiles[idx].created_at || 0).getTime();
            const remoteTime = new Date(fp.created_at || 0).getTime();
            if (remoteTime > curTime) {
              this.data.profiles[idx] = { ...this.data.profiles[idx], ...fp };
              modified = true;
            }
          } else {
            this.data.profiles.push(fp);
            modified = true;
          }
        }
      }

      // 2. Personal Ajo
      if (res.data.personal_ajo && res.data.personal_ajo.length > 0) {
        for (const fpa of res.data.personal_ajo) {
          const idx = this.data.personal_ajo.findIndex(pa => pa.id === fpa.id);
          if (idx >= 0) {
            this.data.personal_ajo[idx] = { ...this.data.personal_ajo[idx], ...fpa };
            modified = true;
          } else {
            this.data.personal_ajo.push(fpa);
            modified = true;
          }
        }
      }

      // 3. Groups
      if (res.data.groups && res.data.groups.length > 0) {
        for (const fg of res.data.groups) {
          const idx = this.data.groups.findIndex(g => g.id === fg.id);
          if (idx >= 0) {
            this.data.groups[idx] = { ...this.data.groups[idx], ...fg };
            modified = true;
          } else {
            this.data.groups.push(fg);
            modified = true;
          }
        }
      }

      // 4. Group Members
      if (res.data.group_members && res.data.group_members.length > 0) {
        for (const fm of res.data.group_members) {
          const idx = this.data.group_members.findIndex(m => m.id === fm.id);
          if (idx >= 0) {
            this.data.group_members[idx] = { ...this.data.group_members[idx], ...fm };
            modified = true;
          } else {
            this.data.group_members.push(fm);
            modified = true;
          }
        }
      }

      // 5. Contributions
      if (res.data.contributions && res.data.contributions.length > 0) {
        for (const fc of res.data.contributions) {
          const idx = this.data.contributions.findIndex(c => c.id === fc.id);
          if (idx >= 0) {
            this.data.contributions[idx] = { ...this.data.contributions[idx], ...fc };
            modified = true;
          } else {
            this.data.contributions.push(fc);
            modified = true;
          }
        }
      }

      // 6. Pack Transactions
      if (res.data.pack_transactions && res.data.pack_transactions.length > 0) {
        for (const fpt of res.data.pack_transactions) {
          const idx = this.data.pack_transactions.findIndex(pt => pt.id === fpt.id);
          if (idx >= 0) {
            this.data.pack_transactions[idx] = { ...this.data.pack_transactions[idx], ...fpt };
            modified = true;
          } else {
            this.data.pack_transactions.push(fpt);
            modified = true;
          }
        }
      }

      // 7. Commissions
      if (res.data.commissions && res.data.commissions.length > 0) {
        for (const fcom of res.data.commissions) {
          const idx = this.data.commissions.findIndex(com => com.id === fcom.id);
          if (idx >= 0) {
            this.data.commissions[idx] = { ...this.data.commissions[idx], ...fcom };
            modified = true;
          } else {
            this.data.commissions.push(fcom);
            modified = true;
          }
        }
      }

      // 8. Withdrawals
      if (res.data.withdrawals && res.data.withdrawals.length > 0) {
        for (const fw of res.data.withdrawals) {
          const idx = this.data.withdrawals.findIndex(w => w.id === fw.id);
          if (idx >= 0) {
            this.data.withdrawals[idx] = { ...this.data.withdrawals[idx], ...fw };
            modified = true;
          } else {
            this.data.withdrawals.push(fw);
            modified = true;
          }
        }
      }

      // 9. Payments
      if (res.data.payments && res.data.payments.length > 0) {
        for (const fpay of res.data.payments) {
          const idx = this.data.payments.findIndex(pay => (pay.id && pay.id === fpay.id) || pay.reference === fpay.reference);
          if (idx >= 0) {
            this.data.payments[idx] = { ...this.data.payments[idx], ...fpay };
            modified = true;
          } else {
            this.data.payments.push(fpay);
            modified = true;
          }
        }
      }

      if (modified) {
        this.save();
      }

      return { success: true, counts: res.counts };
    } catch (err) {
      console.warn('syncWithFirestore error:', err);
      return { success: false, counts: {} };
    }
  }
}

export const db = new Database();
