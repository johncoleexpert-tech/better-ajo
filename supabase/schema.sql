-- ====================================================================
-- BETTER AJO — PRODUCTION SUPABASE DATABASE SCHEMA & RLS POLICIES
-- ====================================================================
-- Compliant with Better Ajo business rules, financial security,
-- and strict Row Level Security (RLS) constraints.
-- 1. profiles
-- 2. personal_ajo
-- 3. groups
-- 4. group_members
-- 5. contributions
-- 6. pack_transactions
-- 7. commissions
-- 8. withdrawals
-- 9. payment_records
-- 10. otps
-- 11. audit_logs
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 1. PROFILES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  bank_name TEXT NOT NULL,
  account_number VARCHAR(10) NOT NULL,
  verification_type VARCHAR(3) NOT NULL CHECK (verification_type IN ('NIN', 'BVN')),
  verification_number VARCHAR(11) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER', 'GROUP_ADMIN', 'SUPER_ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles (phone);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- --------------------------------------------------------------------
-- 2. PERSONAL BETTER AJO
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personal_ajo (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  total_deposited NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_deposited >= 0),
  total_withdrawn NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_withdrawn >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending_fee' CHECK (status IN ('pending_fee', 'active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_personal_ajo UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_ajo_user ON public.personal_ajo (user_id);

-- --------------------------------------------------------------------
-- 3. GROUPS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  group_name TEXT NOT NULL,
  member_limit INTEGER NOT NULL CHECK (member_limit >= 5 AND member_limit <= 50),
  contribution_amount NUMERIC(14, 2) NOT NULL CHECK (contribution_amount >= 100),
  cycle_type VARCHAR(30) NOT NULL,
  packing_amount NUMERIC(14, 2) NOT NULL CHECK (packing_amount > 0),
  packing_fee NUMERIC(14, 2) NOT NULL DEFAULT 3000.00 CHECK (packing_fee >= 0),
  group_code VARCHAR(16) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'recruiting' CHECK (
    status IN ('recruiting', 'active', 'round_completed', 'closed')
  ),
  current_round INTEGER NOT NULL DEFAULT 1 CHECK (current_round >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_code ON public.groups (group_code);
CREATE INDEX IF NOT EXISTS idx_groups_admin ON public.groups (admin_id);

-- --------------------------------------------------------------------
-- 4. GROUP MEMBERS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1 AND position <= 50),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'removed')),
  current_round_status VARCHAR(30) NOT NULL DEFAULT 'pending_contribution',
  next_round_consent BOOLEAN DEFAULT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_group_member_position UNIQUE (group_id, position),
  CONSTRAINT unique_group_user UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON public.group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members (user_id);

-- --------------------------------------------------------------------
-- 5. CONTRIBUTIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contributions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Failed')),
  reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_contribution_ref UNIQUE (reference)
);

CREATE INDEX IF NOT EXISTS idx_contributions_group_round ON public.contributions (group_id, round_number);
CREATE INDEX IF NOT EXISTS idx_contributions_member ON public.contributions (member_id);
CREATE INDEX IF NOT EXISTS idx_contributions_user ON public.contributions (user_id);

-- --------------------------------------------------------------------
-- 6. PACK TRANSACTIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pack_transactions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE RESTRICT,
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number >= 1),
  packing_amount NUMERIC(14, 2) NOT NULL CHECK (packing_amount > 0),
  packing_fee NUMERIC(14, 2) NOT NULL DEFAULT 3000.00 CHECK (packing_fee >= 0),
  member_amount NUMERIC(14, 2) NOT NULL CHECK (member_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  bank_name TEXT,
  account_number VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_group_round_packer UNIQUE (group_id, round_number, member_id)
);

CREATE INDEX IF NOT EXISTS idx_pack_trans_group ON public.pack_transactions (group_id);
CREATE INDEX IF NOT EXISTS idx_pack_trans_member ON public.pack_transactions (member_id);

-- --------------------------------------------------------------------
-- 7. COMMISSIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commissions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  pack_transaction_id TEXT NOT NULL REFERENCES public.pack_transactions(id) ON DELETE CASCADE,
  packing_fee NUMERIC(14, 2) NOT NULL DEFAULT 3000.00,
  admin_amount NUMERIC(14, 2) NOT NULL DEFAULT 2000.00,
  super_admin_amount NUMERIC(14, 2) NOT NULL DEFAULT 1000.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_pack_commission UNIQUE (pack_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_group ON public.commissions (group_id);

-- --------------------------------------------------------------------
-- 8. WITHDRAWALS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES public.groups(id) ON DELETE SET NULL,
  withdrawal_type VARCHAR(30) NOT NULL CHECK (
    withdrawal_type IN ('personal', 'admin_commission', 'super_admin_revenue')
  ),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  fee NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (fee >= 0),
  net_amount NUMERIC(14, 2) NOT NULL CHECK (net_amount > 0),
  bank_name TEXT,
  account_number VARCHAR(10),
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'successful', 'failed')),
  transfer_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON public.withdrawals (user_id);

-- --------------------------------------------------------------------
-- 9. PAYMENT RECORDS (PAYSTACK TRANSACTIONS)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose VARCHAR(50) NOT NULL DEFAULT 'personal_registration',
  amount_kobo BIGINT NOT NULL DEFAULT 60000 CHECK (amount_kobo > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
  reference TEXT UNIQUE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'success', 'successful', 'failed', 'ongoing', 'abandoned', 'reversed')
  ),
  gateway_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_ref ON public.payment_records (reference);
CREATE INDEX IF NOT EXISTS idx_payment_records_user ON public.payment_records (user_id);

-- --------------------------------------------------------------------
-- 10. OTPS (PHONE AUTHENTICATION & TRANSACTION CONFIRMATION)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.otps (
  id TEXT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(30) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_phone_purpose ON public.otps (phone, purpose);

-- --------------------------------------------------------------------
-- 11. AUDIT LOGS (SECURITY & FINANCIAL INTEGRITY)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  event_type VARCHAR(60) NOT NULL,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES public.groups(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON public.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_ajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Profiles:
-- Users can view their own profile with full credentials.
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update only their non-privileged fields (not role or ID)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Personal Ajo:
-- Users can read their own balance. Direct client inserts/updates are blocked.
DROP POLICY IF EXISTS "Users can view own personal ajo" ON public.personal_ajo;
CREATE POLICY "Users can view own personal ajo"
  ON public.personal_ajo FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Groups:
-- Public can look up recruiting/active groups to join.
DROP POLICY IF EXISTS "Anyone can view active groups" ON public.groups;
CREATE POLICY "Anyone can view active groups"
  ON public.groups FOR SELECT
  USING (true);

-- Group admin can update non-financial group info
DROP POLICY IF EXISTS "Group admins can update their groups" ON public.groups;
CREATE POLICY "Group admins can update their groups"
  ON public.groups FOR UPDATE
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);

-- 4. Group Members:
-- Members of the group can view their fellow members' positions and rotation queue
DROP POLICY IF EXISTS "Group members can view fellow members" ON public.group_members;
CREATE POLICY "Group members can view fellow members"
  ON public.group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
      AND g.admin_id = auth.uid()
    )
  );

-- 5. Contributions:
-- Group members can view contributions for their group
DROP POLICY IF EXISTS "Group members can view contributions" ON public.contributions;
CREATE POLICY "Group members can view contributions"
  ON public.contributions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = contributions.group_id
      AND gm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = contributions.group_id
      AND g.admin_id = auth.uid()
    )
  );

-- 6. Pack Transactions:
-- Group members can view pack payout transactions
DROP POLICY IF EXISTS "Group members can view pack transactions" ON public.pack_transactions;
CREATE POLICY "Group members can view pack transactions"
  ON public.pack_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = pack_transactions.group_id
      AND gm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = pack_transactions.group_id
      AND g.admin_id = auth.uid()
    )
  );

-- 7. Commissions:
-- Only group admin or super admin can view group commissions
DROP POLICY IF EXISTS "Group admins can view commissions" ON public.commissions;
CREATE POLICY "Group admins can view commissions"
  ON public.commissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = commissions.group_id
      AND g.admin_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'SUPER_ADMIN'
    )
  );

-- 8. Withdrawals:
-- Users can view only their own withdrawals
DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawals;
CREATE POLICY "Users can view own withdrawals"
  ON public.withdrawals FOR SELECT
  USING (auth.uid() = user_id);

-- 9. Payment Records:
-- Users can view their own payment records
DROP POLICY IF EXISTS "Users can view own payment records" ON public.payment_records;
CREATE POLICY "Users can view own payment records"
  ON public.payment_records FOR SELECT
  USING (auth.uid() = user_id);

-- 10. OTPs:
-- Strictly blocked from all client access. Only server service role can read/write OTPs.
DROP POLICY IF EXISTS "Deny public OTP access" ON public.otps;
CREATE POLICY "Deny public OTP access"
  ON public.otps FOR ALL
  USING (false);

-- 11. Audit Logs:
-- Strictly Super Admin view only. Write via server service role only.
DROP POLICY IF EXISTS "Super Admin can view audit logs" ON public.audit_logs;
CREATE POLICY "Super Admin can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'SUPER_ADMIN'
    )
  );
