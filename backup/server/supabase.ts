import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  UserProfile,
  PersonalAjo,
  PaymentRecord,
  GroupAjo,
  GroupMember,
  Contribution,
  PackTransaction,
  Commission
} from '../src/types/index.js';

let supabaseClient: SupabaseClient | null = null;

export function getMissingSupabaseEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) {
    missing.push('SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)');
  }
  return missing;
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key && url.startsWith('http'));
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL!;
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)!;
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabaseClient;
}

// Helper to run a Supabase operation safely with a strict 3000ms timeout
async function runWithTimeout<T>(promiseLike: PromiseLike<T>, timeoutMs = 3000): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  ]);
}

export async function syncProfileToSupabase(profile: UserProfile): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('profiles').upsert({
        id: profile.id,
        full_name: profile.full_name,
        phone: profile.phone,
        email: profile.email || null,
        bank_name: profile.bank_name,
        account_number: profile.account_number,
        verification_type: profile.verification_type,
        verification_number: profile.verification_number,
        created_at: profile.created_at
      })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncProfile warning (handled gracefully):', e);
    return false;
  }
}

export async function syncPersonalAjoToSupabase(personalAjo: PersonalAjo): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('personal_ajo').upsert({
        id: personalAjo.id,
        user_id: personalAjo.user_id,
        balance: personalAjo.balance,
        total_deposited: personalAjo.total_deposited,
        total_withdrawn: personalAjo.total_withdrawn,
        status: personalAjo.status,
        created_at: personalAjo.created_at
      })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncPersonalAjo warning (handled gracefully):', e);
    return false;
  }
}

export async function syncPaymentRecordToSupabase(payment: PaymentRecord): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('payment_records').upsert({
        user_id: payment.user_id,
        purpose: payment.purpose,
        amount_kobo: payment.amount_kobo,
        currency: payment.currency,
        reference: payment.reference,
        status: payment.status,
        gateway_response: payment.gateway_response || null,
        created_at: payment.created_at,
        updated_at: payment.updated_at || new Date().toISOString()
      }, { onConflict: 'reference' })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncPaymentRecord warning (handled gracefully):', e);
    return false;
  }
}

export async function syncGroupToSupabase(group: GroupAjo): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('groups').upsert({
        id: group.id,
        group_name: group.group_name,
        group_code: group.group_code,
        admin_id: group.admin_id,
        contribution_amount: group.contribution_amount,
        cycle_type: group.cycle_type,
        member_limit: group.member_limit,
        packing_amount: group.packing_amount,
        packing_fee: group.packing_fee ?? 3000,
        current_round: group.current_round,
        status: group.status,
        created_at: group.created_at,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncGroup warning (handled gracefully):', e);
    return false;
  }
}

export async function syncGroupMemberToSupabase(member: GroupMember): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('group_members').upsert({
        id: member.id,
        group_id: member.group_id,
        user_id: member.user_id,
        full_name: member.full_name,
        phone: member.phone,
        bank_name: member.bank_name,
        account_number: member.account_number,
        position: member.position,
        current_round_status: member.current_round_status,
        status: member.status,
        joined_at: member.joined_at,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncGroupMember warning (handled gracefully):', e);
    return false;
  }
}

export async function syncContributionToSupabase(contribution: Contribution): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('contributions').upsert({
        id: contribution.id,
        group_id: contribution.group_id,
        member_id: contribution.member_id,
        round_number: contribution.round_number,
        amount: contribution.amount,
        status: contribution.status,
        paystack_ref: contribution.reference || null,
        created_at: contribution.paid_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncContribution warning (handled gracefully):', e);
    return false;
  }
}

export async function syncPackTransactionToSupabase(transaction: PackTransaction): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('pack_transactions').upsert({
        id: transaction.id,
        group_id: transaction.group_id,
        member_id: transaction.member_id,
        user_id: transaction.user_id,
        round_number: transaction.round_number,
        packing_amount: transaction.packing_amount,
        packing_fee: transaction.packing_fee,
        member_amount: transaction.member_amount,
        status: transaction.status,
        bank_name: transaction.bank_name,
        account_number: transaction.account_number,
        created_at: transaction.created_at
      }, { onConflict: 'id' })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncPackTransaction warning (handled gracefully):', e);
    return false;
  }
}

export async function syncCommissionToSupabase(commission: Commission): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('commissions').upsert({
        id: commission.id,
        group_id: commission.group_id,
        pack_transaction_id: commission.pack_transaction_id,
        packing_fee: commission.packing_fee || 3000,
        super_admin_amount: commission.super_admin_amount,
        admin_amount: commission.admin_amount,
        created_at: commission.created_at
      }, { onConflict: 'id' })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncCommission warning (handled gracefully):', e);
    return false;
  }
}

export async function syncWithdrawalToSupabase(withdrawal: {
  id: string;
  user_id: string;
  group_id?: string;
  withdrawal_type: string;
  amount: number;
  fee?: number;
  net_amount?: number;
  bank_name?: string;
  account_number?: string;
  status: string;
  transfer_reference?: string;
  created_at: string;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('withdrawals').upsert({
        id: withdrawal.id,
        user_id: withdrawal.user_id,
        group_id: withdrawal.group_id || null,
        withdrawal_type: withdrawal.withdrawal_type,
        amount: withdrawal.amount,
        fee: withdrawal.fee || 0,
        net_amount: withdrawal.net_amount || withdrawal.amount,
        bank_name: withdrawal.bank_name || null,
        account_number: withdrawal.account_number || null,
        status: withdrawal.status || 'completed',
        transfer_reference: withdrawal.transfer_reference || null,
        created_at: withdrawal.created_at
      }, { onConflict: 'id' })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncWithdrawal warning (handled gracefully):', e);
    return false;
  }
}

export async function syncAuditLogToSupabase(audit: {
  id: string;
  event_type: string;
  user_id?: string;
  group_id?: string;
  details: Record<string, any>;
  ip_address?: string;
  created_at: string;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const result = await runWithTimeout(
      client.from('audit_logs').insert({
        id: audit.id,
        event_type: audit.event_type,
        user_id: audit.user_id || null,
        group_id: audit.group_id || null,
        details: audit.details || {},
        ip_address: audit.ip_address || null,
        created_at: audit.created_at
      })
    );
    return Boolean(result && !(result as any).error);
  } catch (e) {
    console.warn('Supabase syncAuditLog warning (handled gracefully):', e);
    return false;
  }
}

/**
 * Load all application data from Supabase tables to hydrate in-memory DB.
 * Safely handles missing tables or connection failure.
 */
export async function loadAllFromSupabase(): Promise<{
  profiles?: any[];
  personal_ajo?: any[];
  groups?: any[];
  group_members?: any[];
  contributions?: any[];
  pack_transactions?: any[];
  commissions?: any[];
  withdrawals?: any[];
  payments?: any[];
} | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const [
      profilesRes,
      personalAjoRes,
      groupsRes,
      membersRes,
      contribRes,
      packRes,
      commRes,
      withRes,
      payRes
    ] = await Promise.allSettled([
      runWithTimeout(client.from('profiles').select('*')),
      runWithTimeout(client.from('personal_ajo').select('*')),
      runWithTimeout(client.from('groups').select('*')),
      runWithTimeout(client.from('group_members').select('*')),
      runWithTimeout(client.from('contributions').select('*')),
      runWithTimeout(client.from('pack_transactions').select('*')),
      runWithTimeout(client.from('commissions').select('*')),
      runWithTimeout(client.from('withdrawals').select('*')),
      runWithTimeout(client.from('payment_records').select('*'))
    ]);

    return {
      profiles: profilesRes.status === 'fulfilled' && profilesRes.value && !(profilesRes.value as any).error ? (profilesRes.value as any).data : undefined,
      personal_ajo: personalAjoRes.status === 'fulfilled' && personalAjoRes.value && !(personalAjoRes.value as any).error ? (personalAjoRes.value as any).data : undefined,
      groups: groupsRes.status === 'fulfilled' && groupsRes.value && !(groupsRes.value as any).error ? (groupsRes.value as any).data : undefined,
      group_members: membersRes.status === 'fulfilled' && membersRes.value && !(membersRes.value as any).error ? (membersRes.value as any).data : undefined,
      contributions: contribRes.status === 'fulfilled' && contribRes.value && !(contribRes.value as any).error ? (contribRes.value as any).data : undefined,
      pack_transactions: packRes.status === 'fulfilled' && packRes.value && !(packRes.value as any).error ? (packRes.value as any).data : undefined,
      commissions: commRes.status === 'fulfilled' && commRes.value && !(commRes.value as any).error ? (commRes.value as any).data : undefined,
      withdrawals: withRes.status === 'fulfilled' && withRes.value && !(withRes.value as any).error ? (withRes.value as any).data : undefined,
      payments: payRes.status === 'fulfilled' && payRes.value && !(payRes.value as any).error ? (payRes.value as any).data : undefined
    };
  } catch (err) {
    console.warn('loadAllFromSupabase failed (handled gracefully):', err);
    return null;
  }
}

/**
 * Direct lookup helpers for serverless environments when local cache misses
 */
export async function fetchProfileByPhoneFromSupabase(phone: string): Promise<UserProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const result = await runWithTimeout(
      client.from('profiles').select('*').eq('phone', phone).maybeSingle(),
      3000
    );
    if (result && !(result as any).error && (result as any).data) {
      return (result as any).data as UserProfile;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchProfileByIdFromSupabase(id: string): Promise<UserProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const result = await runWithTimeout(
      client.from('profiles').select('*').eq('id', id).maybeSingle(),
      3000
    );
    if (result && !(result as any).error && (result as any).data) {
      return (result as any).data as UserProfile;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchGroupByIdFromSupabase(groupId: string): Promise<GroupAjo | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const result = await runWithTimeout(
      client.from('groups').select('*').eq('id', groupId).maybeSingle(),
      3000
    );
    if (result && !(result as any).error && (result as any).data) {
      return (result as any).data as GroupAjo;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchGroupByCodeFromSupabase(code: string): Promise<GroupAjo | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const result = await runWithTimeout(
      client.from('groups').select('*').ilike('group_code', code.trim()).maybeSingle(),
      3000
    );
    if (result && !(result as any).error && (result as any).data) {
      return (result as any).data as GroupAjo;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchGroupsForAdminFromSupabase(adminId: string): Promise<GroupAjo[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  try {
    const result = await runWithTimeout(
      client.from('groups').select('*').eq('admin_id', adminId),
      3000
    );
    if (result && !(result as any).error && Array.isArray((result as any).data)) {
      return (result as any).data as GroupAjo[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchPersonalAjoByUserIdFromSupabase(userId: string): Promise<PersonalAjo | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const result = await runWithTimeout(
      client.from('personal_ajo').select('*').eq('user_id', userId).maybeSingle(),
      3000
    );
    if (result && !(result as any).error && (result as any).data) {
      return (result as any).data as PersonalAjo;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Diagnostic health check for Supabase connection.
 */
export async function checkSupabaseHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  urlHost?: string;
  keyType?: 'service_role' | 'anon' | 'none';
  error?: string;
  missingEnv: string[];
}> {
  const missingEnv = getMissingSupabaseEnv();
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || (!serviceKey && !anonKey)) {
    return {
      configured: false,
      reachable: false,
      missingEnv,
      keyType: 'none',
      error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be defined.'
    };
  }

  let urlHost: string | undefined;
  try {
    urlHost = new URL(url).host;
  } catch {
    return {
      configured: true,
      reachable: false,
      urlHost: url,
      missingEnv,
      keyType: serviceKey ? 'service_role' : 'anon',
      error: `Invalid SUPABASE_URL format: "${url}"`
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      configured: true,
      reachable: false,
      urlHost,
      missingEnv,
      keyType: serviceKey ? 'service_role' : 'anon',
      error: 'Could not initialize Supabase client.'
    };
  }

  try {
    const testResult = await runWithTimeout(client.from('profiles').select('id').limit(1), 4000);
    if ((testResult as any)?.error) {
      const err = (testResult as any).error;
      return {
        configured: true,
        reachable: false,
        urlHost,
        missingEnv,
        keyType: serviceKey ? 'service_role' : 'anon',
        error: `Supabase returned error: ${err.message || err.code || 'Query failed'}`
      };
    }
    return {
      configured: true,
      reachable: true,
      urlHost,
      missingEnv,
      keyType: serviceKey ? 'service_role' : 'anon'
    };
  } catch (err: any) {
    return {
      configured: true,
      reachable: false,
      urlHost,
      missingEnv,
      keyType: serviceKey ? 'service_role' : 'anon',
      error: err?.message || 'Connection timed out or DNS resolution failed (ENOTFOUND).'
    };
  }
}
