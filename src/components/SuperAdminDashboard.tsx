import React, { useState, useEffect } from 'react';
import {
  Shield,
  ArrowLeft,
  Users,
  Wallet,
  Coins,
  TrendingUp,
  CreditCard,
  Building,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Lock,
  ArrowUpRight,
  Clock,
  Calendar,
  AlertCircle,
  Search,
  Filter,
  Layers,
  FileText,
  BadgeCheck,
  ChevronRight,
  Download,
  LogOut
} from 'lucide-react';
import { SuperAdminFullData } from '../types/index.js';
import { formatNaira, formatPhone } from '../lib/formatters.js';
import { SupportSecretaryDashboard } from './SupportSecretaryDashboard.js';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, getPlatformRevenueMain, subscribeToPlatformRevenue } from '../lib/firebase.js';

interface SuperAdminDashboardProps {
  onBack: () => void;
  onLogout?: () => void;
  userPhone?: string;
  userId?: string;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  onBack,
  onLogout,
  userPhone = '08154267469',
  userId
}) => {
  const [data, setData] = useState<SuperAdminFullData | null>(null);
  const [revenue, setRevenue] = useState<{
    stream1: number;
    stream2: number;
    stream3: number;
    stream4: number;
    totalGross: number;
    totalWithdrawn: number;
    unifiedAvailable: number;
    lastUpdated?: any;
  } | null>(null);
  const [totalPersonalSavings, setTotalPersonalSavings] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'overview' | 'groups' | 'members' | 'payments' | 'packings' | 'withdrawals' | 'admins' | 'earnings' | 'ledger' | 'live_support'
  >('overview');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [expandedAdminId, setExpandedAdminId] = useState<string | null>(null);
  const [memberViewType, setMemberViewType] = useState<'group' | 'personal'>('group');
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<'all' | 'pending' | 'processing' | 'successful' | 'failed'>('all');

  // Super Admin Withdrawal modal
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawRef, setWithdrawRef] = useState<string>('');
  const [bankName, setBankName] = useState('Guaranty Trust Bank (GTB)');
  const [accountNumber, setAccountNumber] = useState('0123456789');
  const [accountName, setAccountName] = useState('Super Administrator');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchSuperAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const phoneParam = encodeURIComponent(userPhone || '08154267469');
      const userIdParam = userId ? `&userId=${encodeURIComponent(userId)}` : '';
      const res = await fetch(`/api/superadmin/full-data?phone=${phoneParam}${userIdParam}`, {
        headers: {
          'x-user-phone': userPhone || '08154267469'
        }
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to authenticate Super Admin access');
      }

      setData(json);
      if (json.platformStats?.totalPersonalSavings !== undefined) {
        setTotalPersonalSavings(Number(json.platformStats.totalPersonalSavings || 0));
      }
    } catch (err: any) {
      setError(err.message || 'Access restricted to authorized Super Administrator.');
    } finally {
      setLoading(false);
    }
  };

  const [isAuditingWallet, setIsAuditingWallet] = useState(false);

  const handleAuditWallet = async () => {
    try {
      setIsAuditingWallet(true);
      const res = await fetch('/api/superadmin/audit-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-phone': userPhone || '08154267469'
        }
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to run real balance audit.');
      }
      const realBalance = json.wallet?.available_balance ?? json.audit?.real_balance ?? 0;
      showToast(`Audit Complete! Real Withdrawable Balance: ₦${Number(realBalance).toLocaleString()}`);
      await fetchSuperAdminData();
    } catch (err: any) {
      showToast(err.message || 'Audit failed');
    } finally {
      setIsAuditingWallet(false);
    }
  };

  useEffect(() => {
    // 3. Super Admin page should ONLY do ONE thing on load:
    // const doc = await getDoc(doc(db, 'platformRevenue', 'main'))
    // setRevenue(doc.data())
    // NO calculation, NO sum.
    const loadRevenueDoc = async () => {
      try {
        const snap = await getDoc(doc(db, 'platformRevenue', 'main'));
        if (snap.exists()) {
          const rev = snap.data();
          const s1 = Number(rev.stream1 || 0);
          const s2 = Number(rev.stream2 || 0);
          const s3 = Number(rev.stream3 || 0);
          const s4 = Number(rev.stream4 || 0);
          const gross = Number(rev.totalGross || 0);
          const withdrawn = Number(rev.totalWithdrawn || 0);
          const avail = Number(rev.unifiedAvailable ?? (gross - withdrawn) ?? 0);
          setRevenue({
            stream1: s1,
            stream2: s2,
            stream3: s3,
            stream4: s4,
            totalGross: gross,
            totalWithdrawn: withdrawn,
            unifiedAvailable: avail,
            lastUpdated: rev.lastUpdated
          });
        }
      } catch (err) {
        console.warn('[Super Admin] Error loading platformRevenue/main doc:', err);
      }
    };
    loadRevenueDoc();

    // Direct listener to the permanent platformRevenue/main document
    const unsub = subscribeToPlatformRevenue((revStats) => {
      setRevenue({
        stream1: revStats.stream1,
        stream2: revStats.stream2,
        stream3: revStats.stream3,
        stream4: revStats.stream4,
        totalGross: revStats.totalGross,
        totalWithdrawn: revStats.totalWithdrawn,
        unifiedAvailable: revStats.unifiedAvailable
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          superAdminEarnings: {
            ...prev.superAdminEarnings,
            stream1_registration: revStats.stream1,
            stream2_contribution: revStats.stream2,
            stream3_packing: revStats.stream3,
            stream4_withdrawal: revStats.stream4,
            total_gross: revStats.totalGross,
            total_withdrawn: revStats.totalWithdrawn,
            available_balance: revStats.unifiedAvailable
          },
          superAdminWallet: {
            ...prev.superAdminWallet,
            stream1_registration: revStats.stream1,
            stream2_contribution: revStats.stream2,
            stream3_packing: revStats.stream3,
            stream4_withdrawal: revStats.stream4,
            total_gross: revStats.totalGross,
            total_withdrawn: revStats.totalWithdrawn,
            available_balance: revStats.unifiedAvailable
          }
        };
      });
    });

    // Real-time listener to platformStats/main (Personal Ajo aggregate savings)
    let unsubStats: (() => void) | null = null;
    try {
      unsubStats = onSnapshot(doc(db, 'platformStats', 'main'), (snap) => {
        if (snap.exists()) {
          const stats = snap.data();
          setTotalPersonalSavings(Number(stats.totalPersonalSavings || 0));
        }
      }, (err) => console.warn('[Super Admin] platformStats/main listener error:', err));
    } catch (e) {}

    fetchSuperAdminData();

    return () => {
      unsub();
      if (unsubStats) unsubStats();
    };
  }, [userPhone, userId]);

  const handleWithdrawRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setWithdrawError(null);

    const amount = Number(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError('Please enter a valid amount.');
      return;
    }

    const maxAvailable = revenue?.unifiedAvailable ?? data.superAdminWallet?.available_balance ?? data.superAdminEarnings.available_balance ?? data.metrics?.superAdminAvailableBalance ?? 0;
    if (amount > maxAvailable) {
      setWithdrawError(`Amount cannot exceed available revenue balance of ${formatNaira(maxAvailable)}.`);
      return;
    }

    const currentRef = withdrawRef || `wth_sa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (!withdrawRef) setWithdrawRef(currentRef);

    try {
      setIsWithdrawing(true);
      const res = await fetch('/api/superadmin/withdraw-earnings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-phone': userPhone || '08154267469'
        },
        body: JSON.stringify({
          phone: userPhone || '08154267469',
          amount,
          bankName,
          accountNumber,
          accountName,
          reference: currentRef
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Revenue withdrawal failed');

      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawRef('');
      showToast(json.message || `Super Admin revenue of ${formatNaira(amount)} initiated successfully!`);
      fetchSuperAdminData();
    } catch (err: any) {
      setWithdrawError(err.message || 'Failed to process revenue withdrawal');
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-500">
        <Loader2 className="h-10 w-10 animate-spin text-[#008751] mb-4" />
        <p className="text-sm font-semibold">Loading Super Admin Data...</p>
        <span className="text-xs text-slate-400 mt-1">Verifying security token for 08154267469</span>
      </div>
    );
  }

  if (error || !data || !data.metrics || !data.superAdminEarnings) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-3xl bg-white border border-rose-100 p-8 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">Access Denied</h2>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            {error || 'This portal is strictly restricted to the authorized Super Administrator (08154267469).'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onBack}
              className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
            >
              Return Home
            </button>
            <button
              onClick={fetchSuperAdminData}
              className="px-6 py-2.5 rounded-xl bg-[#008751] text-white font-bold text-xs hover:bg-[#007345] transition cursor-pointer"
            >
              Retry Access
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    metrics,
    groups = [],
    members = [],
    payments = [],
    packings = [],
    withdrawals = [],
    groupAdmins = [],
    personalUsers = [],
    superAdminEarnings,
    superAdminWallet = (data as any)?.super_admin_wallet,
    adminRevenueLedger = (data as any)?.admin_revenue_ledger || [],
    ledger = []
  } = data;

  const availableRevenue = revenue?.unifiedAvailable ?? superAdminWallet?.available_balance ?? superAdminEarnings?.available_balance ?? metrics?.superAdminAvailableBalance ?? 0;
  const lifetimeRevenue = revenue?.totalGross ?? superAdminWallet?.total_gross_earnings ?? superAdminEarnings?.total_earned ?? superAdminEarnings?.totalEarnings ?? 0;
  const withdrawnRevenue = revenue?.totalWithdrawn ?? superAdminWallet?.total_withdrawn ?? superAdminEarnings?.total_withdrawn ?? metrics?.superAdminWithdrawnAmount ?? 0;

  const stream1Total = revenue?.stream1 ?? superAdminEarnings?.stream1_registration ?? superAdminWallet?.breakdown?.reg_600_total ?? metrics?.totalPersonalPlatformFees ?? 0;
  const stream2Total = revenue?.stream2 ?? superAdminEarnings?.stream2_contribution ?? superAdminWallet?.breakdown?.contrib_60_total ?? metrics?.totalContributionFees ?? 0;
  const stream3Total = revenue?.stream3 ?? superAdminEarnings?.stream3_packing ?? superAdminWallet?.breakdown?.packing_33_total ?? metrics?.superAdminCommission ?? 0;
  const stream4Total = revenue?.stream4 ?? superAdminEarnings?.stream4_withdrawal ?? superAdminWallet?.breakdown?.withdrawal_1_6_total ?? metrics?.totalPersonalWithdrawalFees ?? 0;

  // Filtered withdrawals
  const filteredWithdrawals = withdrawals.filter((w) => {
    if (withdrawalStatusFilter === 'all') return true;
    return w.status === withdrawalStatusFilter;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white shadow-xl animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-[#008751] transition mb-2 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Application</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#008751] text-white flex items-center justify-center font-black shadow-md shadow-[#008751]/20">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Super Admin Control Panel
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  Authorized 08154267469
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Full platform oversight, group administrators management, revenue ledger & settlements.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={fetchSuperAdminData}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#008751] hover:bg-slate-50 transition cursor-pointer shadow-sm"
            title="Refresh Platform Metrics"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={handleAuditWallet}
            disabled={isAuditingWallet}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition shadow-xs cursor-pointer"
            title="Run Real Balance Audit to verify available revenue against all 4 revenue streams"
          >
            {isAuditingWallet ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
            ) : (
              <BadgeCheck className="h-4 w-4 text-emerald-700" />
            )}
            <span>{isAuditingWallet ? 'Auditing Real Balance...' : 'Audit Real Balance'}</span>
          </button>

          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={availableRevenue <= 0}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition cursor-pointer ${
              availableRevenue > 0
                ? 'bg-[#008751] hover:bg-[#007345] text-white shadow-[#008751]/20'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Wallet className="h-4 w-4" />
            <span>Withdraw Revenue ({formatNaira(availableRevenue)})</span>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition shadow-xs cursor-pointer"
              title="Log out of Super Admin"
            >
              <LogOut className="h-4 w-4" />
              <span>LOG OUT</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Users
          </span>
          <span className="text-xl font-black text-slate-900 block">{metrics.totalUsers}</span>
          <span className="text-[10px] text-slate-500 mt-1 block font-medium">
            {metrics.groupMembersCount} in groups
          </span>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Groups
          </span>
          <span className="text-xl font-black text-slate-900 block">{metrics.groupsCount}</span>
          <span className="text-[10px] text-slate-500 mt-1 block font-medium">
            {metrics.groupMembersCount} active members
          </span>
        </div>

        {/* PERSONAL AJO SAVINGS Card (Aggregate Only from platformStats/main) */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/80 border border-emerald-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
              PERSONAL AJO SAVINGS
            </span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-200/80 text-emerald-900">
              Aggregate
            </span>
          </div>
          <span className="text-xl font-black text-emerald-950 block">
            {formatNaira(totalPersonalSavings)}
          </span>
          <span className="text-[10px] text-emerald-700/90 mt-1 block font-medium">
            Protected member vaults
          </span>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Contributions
          </span>
          <span className="text-xl font-black text-slate-900 block">
            {formatNaira(metrics.totalContributionsAmount)}
          </span>
          <span className="text-[10px] text-emerald-600 mt-1 block font-bold">100% collected</span>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Amount Packed
          </span>
          <span className="text-xl font-black text-emerald-700 block">
            {formatNaira(metrics.totalPackingAmount)}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block font-medium">Disbursed to date</span>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Group Admin Fees
          </span>
          <span className="text-xl font-black text-slate-900 block">
            {formatNaira(metrics.totalGroupAdminEarnings)}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block font-medium">66.67% share</span>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950 p-4 text-white shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block mb-1">
            Super Admin Share
          </span>
          <span className="text-xl font-black text-white block">
            {formatNaira(metrics.totalSuperAdminEarnings)}
          </span>
          <span className="text-[10px] text-emerald-400 mt-1 block font-medium">
            {formatNaira(metrics.superAdminAvailableBalance)} available
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
        {[
          { id: 'overview', label: 'Platform Overview' },
          { id: 'groups', label: `All Groups (${groups.length})` },
          { id: 'members', label: `All Members (${members.length})` },
          { id: 'payments', label: `Payments (${payments.length})` },
          { id: 'packings', label: `Packing Payouts (${packings.length})` },
          { id: 'withdrawals', label: `Withdrawals (${withdrawals.length})` },
          { id: 'admins', label: `Group Admins (${groupAdmins.length})` },
          { id: 'earnings', label: `Super Admin Revenue (${formatNaira(availableRevenue)})` },
          { id: 'ledger', label: `Central Ledger (${ledger.length})` },
          { id: 'live_support', label: '💬 Live Support & Secretary Desk' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-3 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
              activeTab === tab.id
                ? 'border-[#008751] text-[#008751]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Revenue Breakdown Card */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Platform Revenue Architecture
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unified available revenue from all 4 verified platform revenue streams.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAuditWallet}
                  disabled={isAuditingWallet}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition cursor-pointer"
                  title="Recalculate real balance from ledger"
                >
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-700" />
                  <span>{isAuditingWallet ? 'Auditing...' : 'Audit Real Balance'}</span>
                </button>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={availableRevenue <= 0}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    availableRevenue > 0
                      ? 'bg-[#008751] hover:bg-[#007345] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  <span>Withdraw ({formatNaira(availableRevenue)})</span>
                </button>
              </div>
            </div>

            {/* Hero Unified Available Balance Banner */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                    Unified Available Revenue
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <BadgeCheck className="h-3 w-3" /> Audited Real Balance
                  </span>
                </div>
                <span className="text-3xl sm:text-4xl font-black text-white block">
                  {formatNaira(availableRevenue)}
                </span>
                <span className="text-xs text-slate-300 mt-1 block">
                  Audited real balance: Total Gross ({formatNaira(lifetimeRevenue)}) minus Total Withdrawn ({formatNaira(withdrawnRevenue)})
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="bg-white/10 px-4 py-2.5 rounded-xl">
                  <span className="text-slate-400 text-[10px] block uppercase font-bold">Total Gross</span>
                  <span className="text-base font-black text-white">{formatNaira(lifetimeRevenue)}</span>
                </div>
                <div className="bg-white/10 px-4 py-2.5 rounded-xl">
                  <span className="text-slate-400 text-[10px] block uppercase font-bold">Total Withdrawn</span>
                  <span className="text-base font-black text-emerald-400">{formatNaira(withdrawnRevenue)}</span>
                </div>
              </div>
            </div>

            {/* 4 Separate Revenue Stream Breakdown Cards (Sum = Total Gross) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Registration */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Stream 1: Registration
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                    ₦600 Fixed
                  </span>
                </div>
                <span className="text-2xl font-black text-slate-900 block mt-1">
                  {formatNaira(stream1Total)}
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  Personal Ajo ₦600 activation fee per registered saver
                </span>
              </div>

              {/* Card 2: Contribution */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Stream 2: Contribution
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                    ₦60 / Contrib
                  </span>
                </div>
                <span className="text-2xl font-black text-slate-900 block mt-1">
                  {formatNaira(stream2Total)}
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  ₦60 platform fee on every group contribution
                </span>
              </div>

              {/* Card 3: Packing Share */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Stream 3: Packing Share
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                    33.33% Share
                  </span>
                </div>
                <span className="text-2xl font-black text-slate-900 block mt-1">
                  {formatNaira(stream3Total)}
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  1/3 share of group packing fees
                </span>
              </div>

              {/* Card 4: Withdrawal Fee */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Stream 4: Withdrawal Fee
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800">
                    1.6% Processing
                  </span>
                </div>
                <span className="text-2xl font-black text-slate-900 block mt-1">
                  {formatNaira(stream4Total)}
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  1.6% fee retained on personal savings withdrawals
                </span>
              </div>
            </div>
          </div>

          {/* Recent Platform Financial Events */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 mb-4 uppercase tracking-wider">
              Recent Platform Transactions
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4">User</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {ledger.slice(0, 10).map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                        {new Date(l.created_at).toLocaleDateString('en-NG')}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {l.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-800 font-medium">{l.description}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{l.user_name}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{formatNaira(l.amount)}</td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Groups */}
      {activeTab === 'groups' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                All Groups Platform-Wide ({groups.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every Group Better Ajo created, rotation state, and admin details.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Group Name</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Admin Name</th>
                  <th className="py-3 px-4">Admin Phone</th>
                  <th className="py-3 px-4">Members</th>
                  <th className="py-3 px-4">Contribution</th>
                  <th className="py-3 px-4">Payout</th>
                  <th className="py-3 px-4">Packing Fee</th>
                  <th className="py-3 px-4">Round</th>
                  <th className="py-3 px-4">Current Packer</th>
                  <th className="py-3 px-4">Next Packer</th>
                  <th className="py-3 px-4">Next Pack Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {groups.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{g.group_name}</td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">{g.group_code}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">{g.admin_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{formatPhone(g.admin_phone)}</td>
                    <td className="py-3 px-4">
                      {g.members_joined} / {g.member_limit}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{formatNaira(g.contribution_amount)}</td>
                    <td className="py-3 px-4 font-bold text-emerald-700">{formatNaira(g.packing_amount)}</td>
                    <td className="py-3 px-4 text-slate-700">{formatNaira(g.packing_fee)}</td>
                    <td className="py-3 px-4 font-bold">Round {g.current_round}</td>
                    <td className="py-3 px-4 text-slate-800">{g.current_packer_name || '—'}</td>
                    <td className="py-3 px-4 text-slate-800">{g.next_packer_name || '—'}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono">{g.next_packing_date}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                        {g.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Members */}
      {activeTab === 'members' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Platform Members Oversight
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verified member records, bank disbursement details, and participation statuses across all products.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700">
              Group Members ({members.length})
            </div>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Bank Name & Account</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4">Group Name</th>
                    <th className="py-3 px-4">Position</th>
                    <th className="py-3 px-4">Contribution Status</th>
                    <th className="py-3 px-4">Packing Status</th>
                    <th className="py-3 px-4">Total Contributed</th>
                    <th className="py-3 px-4">Total Packed</th>
                    <th className="py-3 px-4">Registration Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{m.full_name}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{formatPhone(m.phone)}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {m.bank_name && m.bank_name !== 'Not provided' ? (
                          <span>{m.bank_name} - <strong className="text-slate-900">{m.account_number}</strong></span>
                        ) : (
                          <span className="text-slate-400 italic">Not set</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {m.account_status || 'Active'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">{m.group_name}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">Position {m.position}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.contribution_status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {m.contribution_status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.has_packed ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {m.packing_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{formatNaira(m.total_contributed)}</td>
                      <td className="py-3 px-4 font-bold text-emerald-700">{formatNaira(m.total_packed)}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {new Date(m.registration_date).toLocaleDateString('en-NG')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>
      )}

      {/* Tab: Payments */}
      {activeTab === 'payments' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Platform Payment Transactions ({payments.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete incoming payment log via Paystack.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">User / Member</th>
                  <th className="py-3 px-4">Group Name</th>
                  <th className="py-3 px-4">Payment Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Paystack Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {new Date(p.date).toLocaleDateString('en-NG')}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.reference}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">{p.user_name}</td>
                    <td className="py-3 px-4 text-slate-700">{p.group_name || '—'}</td>
                    <td className="py-3 px-4 text-slate-700">{p.payment_type}</td>
                    <td className="py-3 px-4 font-black text-slate-900">{formatNaira(p.amount)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {p.paystack_reference || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Packings */}
      {activeTab === 'packings' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Packing Transactions & Commission Splits ({packings.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dynamic split breakdown (33.33% Super Admin / 66.67% Group Admin) for every completed pack payout.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Group Name</th>
                  <th className="py-3 px-4">Member Who Packed</th>
                  <th className="py-3 px-4">Packed Amount</th>
                  <th className="py-3 px-4">Packing Fee</th>
                  <th className="py-3 px-4">Super Admin (33.33%)</th>
                  <th className="py-3 px-4">Group Admin (66.67%)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {packings.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {new Date(p.date).toLocaleDateString('en-NG')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">{p.group_name}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {p.member_name} (Pos {p.position})
                    </td>
                    <td className="py-3 px-4 font-black text-slate-900">{formatNaira(p.packed_amount)}</td>
                    <td className="py-3 px-4 text-slate-700">{formatNaira(p.packing_fee)}</td>
                    <td className="py-3 px-4 font-black text-emerald-700">{formatNaira(p.super_admin_share)}</td>
                    <td className="py-3 px-4 font-black text-blue-700">{formatNaira(p.group_admin_share)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{p.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Withdrawals */}
      {activeTab === 'withdrawals' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                All Withdrawals ({filteredWithdrawals.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit trail of all disbursements across Super Admin, Group Admins, and Personal savers.
              </p>
            </div>

            {/* Status Filter buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'pending', 'processing', 'successful', 'failed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setWithdrawalStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
                    withdrawalStatusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Bank Name</th>
                  <th className="py-3 px-4">Account Number</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredWithdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {new Date(w.date).toLocaleDateString('en-NG')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{w.user_name}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        w.role === 'SUPER_ADMIN'
                          ? 'bg-purple-100 text-purple-800'
                          : w.role === 'GROUP_ADMIN'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {w.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{w.group_name || '—'}</td>
                    <td className="py-3 px-4 font-black text-slate-900">{formatNaira(w.amount)}</td>
                    <td className="py-3 px-4 text-slate-700">{w.bank_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{w.account_number}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        w.status === 'successful' || w.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : w.status === 'processing' || w.status === 'pending'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {w.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{w.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Group Admins Oversight */}
      {activeTab === 'admins' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Group Administrators Oversight ({groupAdmins.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Supervise all registered group creators, their managed groups, cycle frequencies, contribution settings, packing fees, and live group activity.
                </p>
              </div>

              {/* Admin Search */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by admin name, phone, or group..."
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008751]/30 transition"
                />
              </div>
            </div>
          </div>

          {/* Group Admins Detailed List */}
          <div className="space-y-4">
            {groupAdmins
              .filter((ga) => {
                if (!adminSearch.trim()) return true;
                const q = adminSearch.toLowerCase();
                return (
                  ga.admin_name.toLowerCase().includes(q) ||
                  ga.phone.includes(q) ||
                  ga.groups_list.some((g) => g.toLowerCase().includes(q))
                );
              })
              .map((ga) => {
                const isExpanded = expandedAdminId === ga.admin_id;
                const adminGroups = ga.groups_details || [];

                return (
                  <div
                    key={ga.admin_id}
                    className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm transition hover:shadow-md"
                  >
                    {/* Admin Header Row */}
                    <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-white via-slate-50/50 to-white">
                      <div className="flex items-start sm:items-center gap-3">
                        <div className="h-11 w-11 rounded-2xl bg-[#E6F3ED] text-[#008751] font-black flex items-center justify-center shrink-0 text-sm">
                          {ga.admin_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-black text-slate-900">{ga.admin_name}</h4>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {ga.account_status}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              {ga.groups_owned_count} {ga.groups_owned_count === 1 ? 'Group' : 'Groups'} Managed
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                            <span className="font-mono text-slate-700">{formatPhone(ga.phone)}</span>
                            <span>•</span>
                            <span className="font-mono text-[11px]">
                              Bank: <strong className="text-slate-800">{ga.bank_name || 'Not set'} ({ga.account_number || 'N/A'})</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Earnings & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Commission</span>
                          <span className="text-xs font-black text-slate-900">{formatNaira(ga.total_group_earnings)}</span>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Available</span>
                          <span className="text-xs font-black text-emerald-700">{formatNaira(ga.available_balance)}</span>
                        </div>
                        <button
                          onClick={() => setExpandedAdminId(isExpanded ? null : ga.admin_id)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <span>{isExpanded ? 'Hide Groups' : 'View Groups'}</span>
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Managed Groups Oversight */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 p-5 bg-slate-50/40">
                        <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3">
                          Groups Managed by {ga.admin_name} ({adminGroups.length})
                        </h5>

                        {adminGroups.length > 0 ? (
                          <div className="overflow-x-auto rounded-2xl bg-white border border-slate-200">
                            <table className="w-full text-left text-xs text-slate-600">
                              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                <tr>
                                  <th className="py-2.5 px-3">Group Name & Code</th>
                                  <th className="py-2.5 px-3">Status</th>
                                  <th className="py-2.5 px-3">Members (Joined / Limit)</th>
                                  <th className="py-2.5 px-3">Contribution Amount</th>
                                  <th className="py-2.5 px-3">Frequency / Cycle</th>
                                  <th className="py-2.5 px-3">Packing Fee</th>
                                  <th className="py-2.5 px-3">Created Date</th>
                                  <th className="py-2.5 px-3">Relevant Activity</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-medium">
                                {adminGroups.map((grp) => (
                                  <tr key={grp.group_id} className="hover:bg-slate-50/70 transition">
                                    <td className="py-3 px-3">
                                      <div className="font-bold text-slate-900">{grp.group_name}</div>
                                      <div className="font-mono text-[10px] text-emerald-700 font-bold tracking-wider">
                                        Code: {grp.group_code}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        grp.status === 'active'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : grp.status === 'round_completed'
                                          ? 'bg-purple-100 text-purple-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}>
                                        {grp.status === 'active' ? 'Active' : grp.status === 'round_completed' ? 'Round Completed' : 'Recruiting'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3">
                                      <span className="font-bold text-slate-800">{grp.members_joined}</span>
                                      <span className="text-slate-400 font-normal"> / {grp.member_limit} members</span>
                                    </td>
                                    <td className="py-3 px-3 font-bold text-slate-900">
                                      {formatNaira(grp.contribution_amount)}
                                    </td>
                                    <td className="py-3 px-3">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                        {grp.cycle_type}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 font-bold text-slate-800">
                                      {formatNaira(grp.packing_fee || 3000)}
                                    </td>
                                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                                      {new Date(grp.created_at).toLocaleDateString('en-NG')}
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="text-[11px] space-y-0.5">
                                        <div><span className="text-slate-400">Round:</span> <strong className="text-slate-800">Round {grp.current_round}</strong></div>
                                        {grp.current_packer_name && (
                                          <div><span className="text-slate-400">Current Packer:</span> <strong className="text-emerald-700">{grp.current_packer_name}</strong></div>
                                        )}
                                        {grp.next_packer_name && (
                                          <div><span className="text-slate-400">Next Packer:</span> <strong className="text-purple-700">{grp.next_packer_name}</strong></div>
                                        )}
                                        {grp.next_packing_date && (
                                          <div className="text-slate-500 text-[10px]">
                                            Next Pack: <span className="font-mono font-medium">{grp.next_packing_date}</span>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl bg-white border border-slate-200 text-center text-xs text-slate-400">
                            No groups found for this administrator.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

            {groupAdmins.length === 0 && (
              <div className="rounded-3xl bg-white border border-slate-200 p-8 text-center text-slate-400 text-xs">
                No Group Administrators found.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Super Admin Revenue */}
      {activeTab === 'earnings' && (
        <div className="space-y-6">
          {/* Unified Wallet Summary Card */}
          <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-6 text-white shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Unified Super Admin Revenue Wallet
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <BadgeCheck className="h-3 w-3" /> Audited Real Balance
                  </span>
                </div>
                <span className="text-3xl sm:text-4xl font-black text-white block tracking-tight">
                  {formatNaira(availableRevenue)}
                </span>
                <span className="text-xs text-slate-300 mt-1 block max-w-xl">
                  Unified available revenue from all 4 platform streams: Personal Ajo ₦600 registration, ₦60 contribution fee, 33.33% packing share, and 1.6% personal withdrawal fee.
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  onClick={handleAuditWallet}
                  disabled={isAuditingWallet}
                  className="px-4 py-3 rounded-xl border border-emerald-400/40 bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isAuditingWallet ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
                  ) : (
                    <BadgeCheck className="h-4 w-4 text-emerald-300" />
                  )}
                  <span>{isAuditingWallet ? 'Auditing...' : 'Audit Real Balance'}</span>
                </button>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={availableRevenue <= 0}
                  className={`px-6 py-3 rounded-xl text-xs font-extrabold shadow-lg transition cursor-pointer ${
                    availableRevenue > 0
                      ? 'bg-[#008751] hover:bg-[#007345] text-white shadow-emerald-900/40'
                      : 'bg-white/10 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Withdraw Payout ({formatNaira(availableRevenue)})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10 text-xs">
              <div>
                <span className="text-slate-400 block">Total Lifetime Earned:</span>
                <span className="text-lg font-black text-white mt-0.5 block">
                  {formatNaira(lifetimeRevenue)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Total Settled / Withdrawn:</span>
                <span className="text-lg font-black text-emerald-400 mt-0.5 block">
                  {formatNaira(withdrawnRevenue)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Wallet Architecture:</span>
                <span className="text-lg font-black text-emerald-300 mt-0.5 block">Unified 1-Wallet</span>
              </div>
              <div>
                <span className="text-slate-400 block">Last Balance Audit:</span>
                <span className="text-xs font-mono text-slate-300 mt-1 block">
                  {superAdminWallet?.last_audited_at
                    ? new Date(superAdminWallet.last_audited_at).toLocaleString('en-NG')
                    : 'Real-time'}
                </span>
              </div>
            </div>
          </div>

          {/* The 4 Super Admin Revenue Streams Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                My 4 Platform Revenue Streams
              </h3>
              <span className="text-xs text-slate-500 font-medium">All feed into Unified Available Balance</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stream 1 */}
              <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Stream 1: Registration
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                    ₦600 Fixed
                  </span>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatNaira(stream1Total)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Personal Ajo one-time activation fee per registered saver.
                </p>
              </div>

              {/* Stream 2 */}
              <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Stream 2: Contribution
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                    ₦60 / Contrib
                  </span>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatNaira(stream2Total)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Platform fee on every contribution made across all groups.
                </p>
              </div>

              {/* Stream 3 */}
              <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Stream 3: Packing Share
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                    33.33% Share
                  </span>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatNaira(stream3Total)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  1/3 share of packing fees retained on group payouts.
                </p>
              </div>

              {/* Stream 4 */}
              <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Stream 4: Withdrawal Fee
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800">
                    1.6% Processing
                  </span>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatNaira(stream4Total)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  1.6% fee retained on Personal Ajo member savings withdrawals.
                </p>
              </div>
            </div>
          </div>

          {/* Revenue Ledger Table */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Admin Revenue Double-Entry Ledger
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological transaction log tracking every Naira credited to or withdrawn from your wallet.
                </p>
              </div>
              <button
                onClick={handleAuditWallet}
                disabled={isAuditingWallet}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isAuditingWallet ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
                <span>Re-Audit Ledger</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Revenue Stream</th>
                    <th className="py-2.5 px-4">Source / Party</th>
                    <th className="py-2.5 px-4">Gross Amount</th>
                    <th className="py-2.5 px-4">Admin Revenue</th>
                    <th className="py-2.5 px-4">Balance After</th>
                    <th className="py-2.5 px-4">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {adminRevenueLedger.length > 0 ? (
                    adminRevenueLedger.map((entry: any, idx: number) => {
                      const typeBadge =
                        entry.type === 'registration_600'
                          ? { bg: 'bg-blue-100 text-blue-800', label: '₦600 Reg' }
                          : entry.type === 'contribution_60'
                          ? { bg: 'bg-amber-100 text-amber-800', label: '₦60 Contrib' }
                          : entry.type === 'packing_share_33'
                          ? { bg: 'bg-emerald-100 text-emerald-800', label: '33.33% Packing' }
                          : entry.type === 'personal_withdrawal_1_6'
                          ? { bg: 'bg-purple-100 text-purple-800', label: '1.6% Withdrawal' }
                          : { bg: 'bg-rose-100 text-rose-800', label: 'Admin Payout' };

                      return (
                        <tr key={entry.id || idx} className="hover:bg-slate-50/60 transition">
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString('en-NG') : '—'}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${typeBadge.bg}`}>
                              {typeBadge.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-800 font-medium">
                            {entry.group_or_user || entry.description || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                            {entry.gross_amount ? formatNaira(entry.gross_amount) : '—'}
                          </td>
                          <td className={`py-2.5 px-4 font-black ${entry.amount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {entry.amount < 0 ? `-${formatNaira(Math.abs(entry.amount))}` : `+${formatNaira(entry.amount)}`}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            {entry.balance_after != null ? formatNaira(entry.balance_after) : '—'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                            {entry.reference || '—'}
                          </td>
                        </tr>
                      );
                    })
                  ) : superAdminEarnings.breakdown.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No revenue recorded yet.
                      </td>
                    </tr>
                  ) : (
                    superAdminEarnings.breakdown.map((b, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                          {new Date(b.date).toLocaleDateString('en-NG')}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{b.source}</td>
                        <td className="py-2.5 px-4 text-slate-700">{b.description}</td>
                        <td className="py-2.5 px-4 text-slate-500">—</td>
                        <td className="py-2.5 px-4 font-black text-emerald-700">{formatNaira(b.amount)}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-400">—</td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">{b.reference}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Central Ledger */}
      {activeTab === 'ledger' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Unified Central Platform Ledger ({ledger.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live double-entry audit of all financial actions across Better Ajo.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Party</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {ledger.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {new Date(l.created_at).toLocaleString('en-NG')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {l.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium">{l.description}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{l.user_name}</td>
                    <td className="py-3 px-4 text-slate-700">{l.group_name || '—'}</td>
                    <td className="py-3 px-4 font-black text-slate-900">{formatNaira(l.amount)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                        {l.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{l.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Live Support & Secretary Desk */}
      {activeTab === 'live_support' && (
        <SupportSecretaryDashboard secretaryName="Super Admin Support Desk" />
      )}

      {/* Super Admin Revenue Withdrawal Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-[#E6F3ED] text-[#008751] flex items-center justify-center font-bold">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Withdraw Super Admin Revenue</h3>
                  <p className="text-[11px] text-slate-500">Instant Paystack transfer to designated bank</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleWithdrawRevenue} className="space-y-4 pt-4">
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-500 font-medium">Available Revenue:</span>
                  <span className="font-black text-slate-900 text-sm">
                    {formatNaira(superAdminEarnings.available_balance)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Total Lifetime Earnings:</span>
                  <span className="font-bold text-slate-600">
                    {formatNaira(superAdminEarnings.total_earned)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Withdrawal Amount (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                    ₦
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="100"
                    max={availableRevenue}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder={`Max ${availableRevenue}`}
                    className="w-full pl-8 pr-20 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(String(availableRevenue))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                  >
                    Max
                  </button>
                </div>
              </div>

              {withdrawError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{withdrawError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWithdrawing || !withdrawAmount || Number(withdrawAmount) <= 0}
                  className="flex-1 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-extrabold text-xs shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isWithdrawing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Disburse Revenue</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
