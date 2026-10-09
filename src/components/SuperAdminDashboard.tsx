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
  LogOut,
  PlusCircle,
  X
} from 'lucide-react';
import { SuperAdminFullData } from '../types/index.js';
import { formatNaira, formatPhone } from '../lib/formatters.js';
import { SupportSecretaryDashboard } from './SupportSecretaryDashboard.js';
import { doc, getDoc, setDoc, addDoc, deleteDoc, onSnapshot, collection, query, where, orderBy, runTransaction, getDocs, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth, getPlatformRevenueMain, subscribeToPlatformRevenue } from '../lib/firebase.js';
import { getRevenue } from '../lib/revenue.js';

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

  // Group creation modal state
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAmount, setNewGroupAmount] = useState('50000');
  const [newGroupMemberCount, setNewGroupMemberCount] = useState('5');
  const [newGroupCycle, setNewGroupCycle] = useState('3');
  const [newGroupCustomDays, setNewGroupCustomDays] = useState('4');
  const [newGroupPackingFee, setNewGroupPackingFee] = useState('3000');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Permanent Database Reset states
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetLogs, setResetLogs] = useState<string>('');

  // Real-time live collections state for instant Super Admin calculation (STEP 4)
  const [allContributions, setAllContributions] = useState<any[]>([]);
  const [allPackTransactions, setAllPackTransactions] = useState<any[]>([]);
  const [allWithdrawals, setAllWithdrawals] = useState<any[]>([]);
  const [allPlatformUsers, setAllPlatformUsers] = useState<any[]>([]);
  const [allPlatformTransactions, setAllPlatformTransactions] = useState<any[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>('all');

  // Super Admin Wallet state
  const [wallet, setWallet] = useState<{
    availableRevenue: number;
    stream1?: number;
    stream2?: number;
    stream3?: number;
    stream4?: number;
    totalGross?: number;
    withdrawn?: number;
  }>({
    availableRevenue: 0
  });

  const fetchSuperAdminWallet = async () => {
    try {
      const res = await fetch('/api/super-admin-wallet');
      const json = await res.json();
      if (json && (json.availableRevenue !== undefined || json.available_balance !== undefined || json.unifiedAvailable !== undefined)) {
        const rev = Number(json.availableRevenue ?? json.available_balance ?? json.unifiedAvailable ?? 0);
        setWallet(prev => ({
          ...prev,
          ...json,
          availableRevenue: rev
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch super admin wallet:', e);
    }
  };

  // Real-time transactions ledger from Firestore (single source of truth for all deposits & withdrawals)
  const [transactions, setTransactions] = useState<any[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
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
      setTransactions((prev) => {
        if (prev && prev.length > 0) return prev;
        const list: any[] = [];
        (json.withdrawals || []).forEach((w: any) => {
          list.push({ ...w, type: w?.type || 'withdrawal', createdAt: w?.date || w?.created_at });
        });
        (json.payments || []).forEach((p: any) => {
          list.push({ ...p, type: p?.type || 'deposit', createdAt: p?.date || p?.created_at });
        });
        list.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
        return list;
      });
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
          const { s1, s2, s3, s4, totalGross, totalWithdrawn, available } = getRevenue(rev);
          setRevenue({
            stream1: s1,
            stream2: s2,
            stream3: s3,
            stream4: s4,
            totalGross,
            totalWithdrawn,
            unifiedAvailable: available,
            lastUpdated: rev.lastUpdated
          });
          setWallet(prev => ({
            ...prev,
            availableRevenue: available,
            totalGross,
            stream1: s1,
            stream2: s2,
            stream3: s3,
            stream4: s4,
            withdrawn: totalWithdrawn
          }));
        }
      } catch (err) {
        console.warn('[Super Admin] Error loading platformRevenue/main doc:', err);
      }
    };
    loadRevenueDoc();

    // Direct listener to the permanent platformRevenue/main document
    const unsub = subscribeToPlatformRevenue((revStats) => {
      const { s1, s2, s3, s4, totalGross, totalWithdrawn, available } = getRevenue(revStats);
      setRevenue({
        stream1: s1,
        stream2: s2,
        stream3: s3,
        stream4: s4,
        totalGross,
        totalWithdrawn,
        unifiedAvailable: available
      });
      setWallet(prev => ({
        ...prev,
        availableRevenue: available,
        totalGross,
        stream1: s1,
        stream2: s2,
        stream3: s3,
        stream4: s4,
        withdrawn: totalWithdrawn
      }));
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

    // Real-time listener to transactions collection (single source of truth for all deposits & withdrawals)
    let unsubTransactions: (() => void) | null = null;
    try {
      const txQuery = query(
        collection(db, 'transactions'),
        orderBy('createdAt', 'desc')
      );
      unsubTransactions = onSnapshot(txQuery, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setTransactions(list);
      }, (err) => {
        console.warn('[Super Admin] transactions query with orderBy failed, falling back to simple query:', err);
        unsubTransactions = onSnapshot(
          collection(db, 'transactions'),
          (fallbackSnap) => {
            const list: any[] = [];
            fallbackSnap.forEach((d) => {
              list.push({ id: d.id, ...d.data() });
            });
            list.sort((a, b) => {
              const dateA = new Date(a?.createdAt || a?.created_at || 0).getTime();
              const dateB = new Date(b?.createdAt || b?.created_at || 0).getTime();
              return dateB - dateA;
            });
            setTransactions(list);
          }
        );
      });
    } catch (e) {
      console.warn('[Super Admin] Error setting up transactions listener:', e);
    }

    // Real-time collection listeners for instant Super Admin reflection (STEP 4)
    let unsubContrib: (() => void) | null = null;
    let unsubPack: (() => void) | null = null;
    let unsubWithdr: (() => void) | null = null;
    let unsubUsers: (() => void) | null = null;
    let unsubPlatformTx: (() => void) | null = null;
    try {
      unsubContrib = onSnapshot(collection(db, 'contributions'), (snap) => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setAllContributions(list);
        fetchSuperAdminWallet();
      });
      unsubPack = onSnapshot(collection(db, 'pack_transactions'), (snap) => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setAllPackTransactions(list);
        fetchSuperAdminWallet();
      });
      unsubWithdr = onSnapshot(collection(db, 'withdrawals'), (snap) => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setAllWithdrawals(list);
        fetchSuperAdminWallet();
      });
      unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setAllPlatformUsers(list);
        fetchSuperAdminWallet();
      });
      unsubPlatformTx = onSnapshot(collection(db, 'platform_transactions'), (snap) => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setAllPlatformTransactions(list);
        fetchSuperAdminWallet();
      });
    } catch (e) {
      console.warn('[Super Admin] Error setting up collection listeners:', e);
    }

    fetchSuperAdminData();
    fetchSuperAdminWallet();

    return () => {
      unsub();
      if (unsubStats) unsubStats();
      if (unsubTransactions) unsubTransactions();
      if (unsubContrib) unsubContrib();
      if (unsubPack) unsubPack();
      if (unsubWithdr) unsubWithdr();
      if (unsubUsers) unsubUsers();
      if (unsubPlatformTx) unsubPlatformTx();
    };
  }, [userPhone, userId]);

  // STEP 4 - FIX SUPER ADMIN AGGREGATE AND REVENUE (NO CARDS MIXING):
  // Personal Ajo Aggregate = SUM all personal savings deposits (NO group contributions!)
  const personalAjoAggregate = allContributions
    .filter((doc) => {
      const s = String(doc.status || '').toLowerCase();
      const isSuccess = s === 'success' || s === 'credited' || s === 'completed';
      const isPersonal = !doc.groupId && !doc.group_id && (!doc.round && !doc.round_number) &&
        (String(doc.type || '').toUpperCase().includes('PERSONAL') || String(doc.type || '').toUpperCase().includes('DEPOSIT') || doc.isPersonal);
      return isSuccess && isPersonal;
    })
    .reduce((sum, d) => sum + Number(d.amount || d.savingsAmount || 0), 0);

  // Group Contributions Collected = SUM all group contributions
  const groupContributionsCollected = allContributions
    .filter((doc) => {
      const s = String(doc.status || '').toLowerCase();
      const isPaid = s === 'paid' || s === 'success' || s === 'credited' || s === 'completed';
      const isGroup = Boolean(doc.groupId || doc.group_id || doc.round || doc.round_number || String(doc.type || '').toLowerCase().includes('group'));
      return isPaid && isGroup;
    })
    .reduce((sum, d) => sum + Number(d.amount || 0), 0);

  // Stream1 = users.filter(u => u.isActivated || u.activationFeePaid).length * 600
  const activatedUsersCount = allPlatformUsers.filter((u) => {
    const isAct = u.isActivated || u.activationFeePaid || u.personal_ajo_active || (u.personal_ajo_fee_paid && Number(u.personal_ajo_fee_paid) > 0) || u.personal_ajo_activated_at;
    const role = String(u.role || '').toLowerCase();
    return Boolean(isAct) && role !== 'super_admin' && role !== 'superadmin';
  }).length;
  const stream1Live = activatedUsersCount > 0 ? (activatedUsersCount * 600) : Number(revenue?.stream1 || wallet?.stream1 || 0);

  // Stream2 = contributions fee
  const depositDocsCount = allContributions.filter((doc) => {
    const s = String(doc.status || '').toLowerCase();
    const t = String(doc.type || '').toLowerCase();
    return (s === 'success' || s === 'credited' || s === 'completed') && (t.includes('deposit') || t.includes('savings') || Number(doc.amount) > 0);
  }).length;
  const stream2Live = depositDocsCount > 0 ? (depositDocsCount * 60) : Number(revenue?.stream2 || wallet?.stream2 || 0);

  // Stream3 = existing packing share
  const stream3Live = Number(revenue?.stream3 ?? wallet?.stream3 ?? (data as any)?.superAdminEarnings?.stream3_packing ?? (data as any)?.super_admin_wallet?.breakdown?.packing_33_total ?? 0);

  // Stream4 = sum of withdrawal fees
  const withdrawalFeesSum = allWithdrawals
    .filter((w) => {
      const s = String(w.status || '').toLowerCase();
      const t = String(w.type || w.withdrawal_type || '').toLowerCase();
      return (s === 'success' || s === 'completed' || s === 'approved') && !t.includes('super_admin');
    })
    .reduce((sum, w) => sum + Number(w.fee || 0), 0);
  const stream4Live = withdrawalFeesSum > 0 ? withdrawalFeesSum : Number(revenue?.stream4 || wallet?.stream4 || 0);

  // Aggregate real-time platform transactions by type (Section D)
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  const combinedFeeTxs = [
    ...(allPlatformTransactions || []),
    ...(Array.isArray(transactions) ? transactions : [])
  ];

  combinedFeeTxs.forEach((t) => {
    const amt = Number(t.amount || t.gross_amount || 0);
    const type = String(t.type || '').toLowerCase();
    if (type === 'registration_fee' || type === 'personal_ajo_fee' || type === 'activation_fee') {
      s1 += Math.floor(amt);
    } else if (type === 'platform_fee' || type === 'contribution_fee') {
      s2 += Math.floor(amt);
    } else if (type === 'super_admin_fee' || type === 'super_admin_commission' || type === 'stream3_packing') {
      s3 += Math.floor(amt);
    } else if (type === 'withdrawal_fee' || type === 'personal_withdrawal_fee') {
      s4 += Math.floor(amt);
    }
  });

  const stream1Total = s1 > 0 ? s1 : (revenue?.stream1 ?? (activatedUsersCount > 0 ? stream1Live : 0));
  const stream2Total = s2 > 0 ? s2 : (revenue?.stream2 ?? (depositDocsCount > 0 ? stream2Live : 0));
  const stream3Total = s3 > 0 ? s3 : (revenue?.stream3 ?? stream3Live);
  const stream4Total = s4 > 0 ? s4 : (revenue?.stream4 ?? stream4Live);

  // Total Gross = Stream1 + Stream2 + Stream3 + Stream4
  const computedGross = stream1Total + stream2Total + stream3Total + stream4Total;
  const totalGross = computedGross;

  // Total Withdrawn
  const totalWithdrawnSuperAdmin = Math.floor(Number(revenue?.totalWithdrawn ?? wallet?.withdrawn ?? (data as any)?.superAdminEarnings?.total_withdrawn ?? 0));

  // Unified Available
  const unifiedAvailable = Math.max(0, totalGross - totalWithdrawnSuperAdmin);
  const availableForWithdraw = unifiedAvailable;
  const availableRevenue = unifiedAvailable;

  const withdrawalAmount = withdrawAmount;
  const setWithdrawalAmount = setWithdrawAmount;
  const isWithdrawValid = Number(withdrawalAmount || 0) >= 100 && Number(withdrawalAmount || 0) <= availableForWithdraw;

  const handleWithdrawRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setWithdrawError(null);

    const amt = Number(withdrawAmount || 0);
    const valid = amt >= 100 && amt <= availableForWithdraw;
    if (!valid) {
      setWithdrawError(`Amount must be between ₦100 and available balance (₦${Number(availableForWithdraw).toLocaleString()})`);
      return;
    }

    const currentRef = withdrawRef || `wth_sa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (!withdrawRef) setWithdrawRef(currentRef);

    try {
      setIsWithdrawing(true);

      // Anti-double submission idempotency check
      const existingQuery = query(collection(db, 'platform_transactions'), where('reference', '==', currentRef));
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        throw new Error('This withdrawal transaction has already been processed.');
      }

      // STEP 3: Atomic transaction directly on platformRevenue/main
      await runTransaction(db, async (t) => {
        const revRef = doc(db, 'platformRevenue', 'main');
        const revDoc = await t.get(revRef);
        if (!revDoc.exists()) {
          throw new Error('Platform revenue document not found');
        }
        const revData = revDoc.data();
        const { s1, s2, s3, s4, totalGross, totalWithdrawn, available } = getRevenue(revData);

        if (amt > available) {
          throw new Error(`Insufficient revenue balance: Available is ${formatNaira(available)}`);
        }

        const newTotalWithdrawn = totalWithdrawn + amt;
        const newAvailable = Math.max(0, totalGross - newTotalWithdrawn);

        const saWithdrawalRef = doc(collection(db, 'super_admin_withdrawals'));
        const wDocRef = doc(collection(db, 'withdrawals'));
        const platformTxRef = doc(collection(db, 'platform_transactions'));
        const txDocRef = doc(collection(db, 'transactions'));
        const nowIso = new Date().toISOString();

        const wthPayload = {
          id: currentRef,
          reference: currentRef,
          amount: amt,
          gross_amount: amt,
          fee: 0,
          net_payout: amt,
          net_amount: amt,
          bankName,
          bank_name: bankName,
          accountNumber,
          account_number: accountNumber,
          accountName,
          account_name: accountName,
          userId: 'usr_superadmin_realheaven',
          user_id: 'usr_superadmin_realheaven',
          userName: 'Super Administrator',
          status: 'completed',
          type: 'super_admin_revenue',
          withdrawal_type: 'super_admin_revenue',
          timestamp: serverTimestamp(),
          createdAt: nowIso,
          created_at: nowIso
        };

        t.set(saWithdrawalRef, wthPayload);
        t.set(wDocRef, wthPayload);
        t.set(platformTxRef, {
          ...wthPayload,
          type: 'super_admin_withdrawal',
          description: `Super Admin Revenue Payout to ${bankName} (${accountNumber})`
        });
        t.set(txDocRef, {
          ...wthPayload,
          id: `tx_${currentRef}`,
          source: 'Platform Revenue',
          destination: `${accountName} (${bankName})`
        });

        t.update(revRef, {
          totalWithdrawn: newTotalWithdrawn,
          totalGross,
          unifiedAvailable: newAvailable,
          lastUpdated: serverTimestamp()
        });
      });

      // Background local sync to backend
      fetch('/api/superadmin/withdraw-earnings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-phone': userPhone || '08154267469'
        },
        body: JSON.stringify({
          phone: userPhone || '08154267469',
          amount: amt,
          bankName,
          accountNumber,
          accountName,
          reference: currentRef
        })
      }).catch((err) => console.warn('[Super Admin withdrawal sync warning]:', err));

      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawRef('');
      showToast(`Super Admin revenue of ${formatNaira(amt)} disbursed successfully to ${bankName}!`);
      fetchSuperAdminData();
      fetchSuperAdminWallet();
    } catch (err: any) {
      setWithdrawError(err.message || 'Failed to process revenue withdrawal');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      showToast('Please enter a group name');
      return;
    }
    try {
      setIsCreatingGroup(true);
      const name = newGroupName.trim().toUpperCase();
      const memberCount = parseInt(newGroupMemberCount, 10) || 5;
      const contributionAmount = parseInt(newGroupAmount, 10) || 50000;
      const cycleDays = newGroupCycle === 'custom' ? (parseInt(newGroupCustomDays, 10) || 4) : (parseInt(newGroupCycle, 10) || 3);
      const cycleLabel = `${cycleDays} days`;

      const newRef = doc(collection(db, 'groups'));
      const newGroupId = newRef.id;

      const membersList = Array.from({ length: memberCount }, (_, i) => {
        const pos = i + 1;
        const posSuffix = pos === 1 ? '1st' : pos === 2 ? '2nd' : pos === 3 ? '3rd' : `${pos}th`;
        return {
          id: `mem_${newGroupId}_${pos}`,
          name: `Member ${pos}`,
          fullName: `Member ${pos}`,
          full_name: `Member ${pos}`,
          position: pos,
          packingOrder: pos,
          packing_position: pos,
          packsLabel: `Packs ${posSuffix}`,
          phone: `0800000000${pos}`,
          virtualAccountNumber: `815${Math.floor(1000000 + Math.random() * 9000000)}`,
          virtual_account_number: `815${Math.floor(1000000 + Math.random() * 9000000)}`,
          virtualAccountName: `BETTERAJO-${name}-MEMBER${pos}`,
          virtual_account_name: `BETTERAJO-${name}-MEMBER${pos}`,
          status: 'PENDING',
          current_round_status: 'pending_contribution',
          credit_balance: 0,
          hasPackedThisRound: false,
          hasPacked: false,
          hasPaid: false,
          hasPaidCurrentCycle: false,
          isFullyPaid: false
        };
      });

      await setDoc(newRef, {
        id: newGroupId,
        groupId: newGroupId,
        name: name,
        group_name: name,
        nameLower: name.toLowerCase(),
        contributionAmount: contributionAmount,
        contribution_amount: contributionAmount,
        platformFeePerMember: 60,
        platformFee: 60,
        platformFeeTotal: memberCount * 60,
        totalWithFeePerMember: contributionAmount + 60,
        totalAmount: contributionAmount + 60,
        totalPackAmount: contributionAmount * memberCount,
        packing_amount: contributionAmount * memberCount,
        packingFee: parseInt(newGroupPackingFee, 10) || 3000,
        packing_fee: parseInt(newGroupPackingFee, 10) || 3000,
        memberCount: memberCount,
        member_limit: memberCount,
        packingIntervalDays: cycleDays,
        packingInterval: cycleLabel,
        cycle_type: `Every ${cycleDays} Days`,
        contributionFrequencyDays: cycleDays,
        contributionFrequency: cycleLabel,
        currentRound: 1,
        current_round: 1,
        status: 'active',
        owner_id: userId || 'super_admin',
        admin_id: userId || 'super_admin',
        admin_name: 'Super Administrator',
        members: membersList,
        packingStatus: 'NOT_STARTED',
        currentPackingOrder: 1,
        currentCycle: 1,
        createdAt: serverTimestamp(),
        created_at: new Date().toISOString()
      });

      // Save subcollection members and group_members
      for (const m of membersList) {
        await setDoc(doc(db, 'groups', newGroupId, 'members', m.id), {
          ...m,
          groupId: newGroupId,
          group_id: newGroupId
        }).catch(() => {});
        await setDoc(doc(db, 'group_members', `${newGroupId}_${m.id}`), {
          ...m,
          groupId: newGroupId,
          group_id: newGroupId,
          user_id: `usr_${m.id}`,
          status: 'active'
        }).catch(() => {});
      }

      showToast(`Group "${name}" created successfully with ${cycleDays}-day cycle!`);
      setShowCreateGroupModal(false);
      setNewGroupName('');
      fetchSuperAdminData();
    } catch (err: any) {
      showToast(err.message || 'Error creating group');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const currentSuperAdminUid = auth?.currentUser?.uid;
  const currentSuperAdminEmail = auth?.currentUser?.email;

  const handleResetEverythingPermanent = async () => {
    if (resetText.trim() !== "RESET") {
      alert("Type RESET capital");
      return;
    }
    const finalConfirm = window.confirm(
      "FINAL WARNING - PERMANENT DELETE ALL DATA FROM FIREBASE - This will delete ALL groups, members, contributions, transactions, savings, withdrawals, payouts - CANNOT BE UNDONE - Continue?"
    );
    if (!finalConfirm) return;

    setResetting(true);
    setResetLogs("Starting permanent reset...\n");

    try {
      console.log("Starting permanent reset...");
      const collectionsToDelete = [
        "groups", "ajo_groups", "ajoGroups",
        "contributions", "group_contributions", "groupContributions", "member_contributions", "contributions_old",
        "platform_transactions", "platformTransactions", "transactions", "platform_revenue", "recent_transactions", "transaction_logs",
        "personal_savings", "personalSavings", "savings", "ajo_savings", "personalAjos", "personal_ajo", "payments",
        "personal_withdrawals", "withdrawals", "personalWithdrawals", "super_admin_withdrawals", "admin_withdrawals", "group_admin_withdrawals",
        "payouts", "group_payouts", "groupPayouts", "packings", "packings_history", "packing_payouts", "packing_payouts_old",
        "members", "group_members", "groupMembers", "group_memberships", "group_members_old",
        "ledgers", "general_ledger", "central_ledger",
        "group_atme", "super_atme", "atme_payouts", "super_atme_ledger",
        "group_admin_earnings", "admin_earnings", "group_admin_fees", "groupAdminEarnings", "super_admin_revenue",
        "superAdminEarnings", "platformStats", "audit_logs"
      ];

      let totalDeletedAll = 0;
      let report = "";

      for (const colName of collectionsToDelete) {
        try {
          const snapshot = await getDocs(collection(db, colName));
          if (snapshot.empty) {
            console.log(`${colName}: 0 docs`);
            continue;
          }
          console.log(`Deleting ${colName}: ${snapshot.size} docs`);
          let colDeleted = 0;
          for (const docSnap of snapshot.docs) {
            try {
              await deleteDoc(docSnap.ref);
              colDeleted++;
              totalDeletedAll++;
            } catch (delErr) {
              console.error(`Failed delete ${colName}/${docSnap.id}`, delErr);
            }
          }
          const line = `${colName}: ${colDeleted}/${snapshot.size} deleted\n`;
          report += line;
          setResetLogs(prev => prev + line);
        } catch (err: any) {
          console.log(`Collection ${colName} error or no access:`, err?.message || err);
        }
      }

      // Delete profiles and users except Super Admin (08154267469)
      for (const userCol of ["profiles", "users"]) {
        try {
          const snap = await getDocs(collection(db, userCol));
          let count = 0;
          for (const u of snap.docs) {
            const data = u.data();
            const email = String(data.email || '');
            const phone = String(data.phone || data.phoneNumber || '');
            const role = String(data.role || '').toLowerCase();
            // Preserve Super Admin
            if (u.id === currentSuperAdminUid) continue;
            if (phone.includes("8154267469")) continue;
            if (currentSuperAdminEmail && email === currentSuperAdminEmail) continue;
            if (role.includes("super_admin") || role.includes("superadmin")) continue;

            try {
              await deleteDoc(u.ref);
              count++;
              totalDeletedAll++;
            } catch (e) {
              console.error(`Failed delete ${userCol}/${u.id}:`, e);
            }
          }
          const userLine = `${userCol} (test): ${count} deleted — super admin 08154267469 preserved\n`;
          report += userLine;
          setResetLogs(prev => prev + userLine);
        } catch (e: any) {
          console.warn(`Error deleting ${userCol}:`, e);
        }
      }

      // Reset platformRevenue and platformStats documents to zero
      try {
        await setDoc(doc(db, 'platformRevenue', 'main'), {
          stream1: 0,
          stream2: 0,
          stream3: 0,
          stream4: 0,
          totalGross: 0,
          totalWithdrawn: 0,
          unifiedAvailable: 0,
          lastUpdated: serverTimestamp()
        });
        await setDoc(doc(db, 'platformStats', 'main'), {
          totalPersonalSavings: 0,
          lastUpdated: serverTimestamp()
        });
      } catch (revErr) {
        console.warn('[Reset] platformRevenue/platformStats client setDoc warn:', revErr);
      }

      // Call server Admin SDK endpoint (bypasses any client security rules)
      try {
        setResetLogs(prev => prev + "Calling server Admin SDK reset...\n");
        const srvRes = await fetch('/api/admin/reset-database', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-phone': userPhone || '08154267469'
          }
        });
        const srvJson = await srvRes.json();
        const srvLine = `Server Admin SDK purge complete: ${JSON.stringify(srvJson.firestoreDeleted || {})}\n`;
        report += srvLine;
        setResetLogs(prev => prev + srvLine);
      } catch (srvErr: any) {
        console.warn('[Reset] Server Admin SDK reset warn:', srvErr);
      }

      localStorage.clear();
      sessionStorage.clear();
      setAllPackTransactions([]);
      setAllContributions([]);
      setAllWithdrawals([]);
      setTransactions([]);
      setResetDone(true);

      console.log("Reset complete", report);
      alert(
        `✅ PERMANENT RESET COMPLETE - DELETED ${totalDeletedAll} DOCUMENTS FROM FIREBASE:\n\n${report}\n\nNow check Super Admin — Everything should be 0 (Personal Ajo 0, Contributions 0, Packed 0, Group Atme 0, Super Atme 0, Recent Transactions empty, All groups gone, All members gone, Payouts gone, Withdrawals gone).`
      );

      window.location.reload();
    } catch (error: any) {
      console.error("Reset failed completely", error);
      alert(
        "Reset failed: " + (error?.message || error) +
        "\n\nOpen Browser Console F12 to see details."
      );
    } finally {
      setResetting(false);
      setShowResetConfirm(false);
      setResetText("");
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

  const lifetimeRevenue = totalGross;
  const withdrawnRevenue = totalWithdrawnSuperAdmin;

  // 1. SAFETY GUARD FIRST - Add this at top of ALL pages that use transactions to prevent Super Admin crash:
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeAjoGroups = Array.isArray(groups) ? groups : (Array.isArray((data as any)?.ajoGroups) ? (data as any).ajoGroups : []);

  // Real-time combined withdrawal history from collection('withdrawals') and safeTransactions (Requirement 6)
  const rawWithdrawals = [
    ...(allWithdrawals || []).map((w: any) => ({
      ...w,
      type: w.type || w.withdrawal_type || 'withdrawal',
      gross_amount: Number(w.amount || 0),
      amount: Number(w.amount || 0),
      net_payout: Number(w.net_amount ?? w.payout ?? w.amount ?? 0),
      fee: Number(w.fee || 0),
      userName: w.accountName || w.account_name || w.userName || 'Member',
      bankName: w.bankName || w.bank_name || 'Bank',
      accountNumber: w.accountNumber || w.account_number || ''
    })),
    ...(safeTransactions || []).filter((t: any) => t && t.type && t.type.toString().toLowerCase().includes('withdraw'))
  ];

  const seenWthKeys = new Set<string>();
  const withdrawalHistory = rawWithdrawals.filter((w: any) => {
    const key = w.id || w.reference;
    if (key && seenWthKeys.has(key)) return false;
    if (key) seenWthKeys.add(key);
    return true;
  }).sort((a: any, b: any) => {
    const secA = (typeof a?.timestamp?.seconds === 'number')
      ? a.timestamp.seconds
      : (new Date(a?.createdAt || a?.created_at || a?.date || 0).getTime() / 1000);
    const secB = (typeof b?.timestamp?.seconds === 'number')
      ? b.timestamp.seconds
      : (new Date(b?.createdAt || b?.created_at || b?.date || 0).getTime() / 1000);
    return secB - secA;
  });

  // Filtered withdrawals for Withdrawals tab status filter
  const filteredWithdrawals = (withdrawalHistory || []).filter((w) => {
    if (withdrawalStatusFilter === 'all') return true;
    const st = (w?.status || '').toLowerCase();
    if (withdrawalStatusFilter === 'successful') return st === 'successful' || st === 'success' || st === 'completed';
    return st === withdrawalStatusFilter;
  });

  // Group Admin Fees card: sum admin_commission dynamically (66.67% share: 10,000 for 15,000 fee or 2,000 for 3,000 fee)
  // Group Admin Fees must strictly be 0 when no groups exist
  const groupAdminCommissionsSum = (!groups || groups.length === 0)
    ? 0
    : (allPackTransactions || [])
        .filter((pt: any) => {
          const gid = pt.groupId || pt.group_id;
          const isPersonal = pt.type === 'personal_ajo_fee' || pt.type === 'personal_deposit' || pt.type === 'personal_withdraw' || pt.source === 'personal_ajo';
          return Boolean(gid && !isPersonal && groups.some((g: any) => g.id === gid));
        })
        .reduce((sum: number, pt: any) => {
          const pFee = Number(pt.packing_fee || pt.packingFee || 0);
          if (pFee <= 0) return sum + Number(pt.admin_commission || pt.groupAdminShare || 0);
          const split = pFee === 15000 ? 10000 : (pFee === 3000 ? 2000 : Math.round(pFee * (2 / 3)));
          return sum + Number(pt.admin_commission || pt.groupAdminShare || split);
        }, 0);
  const totalGroupAdminFees = (!groups || groups.length === 0)
    ? 0
    : (groupAdminCommissionsSum > 0 ? groupAdminCommissionsSum : Number(metrics?.totalGroupAdminEarnings || 0));

  // 6. Super Admin - Payments Page: Live union of deposits, packings & withdrawals from real-time Firestore collections
  const rawPayments = [
    ...(allContributions || []).map((c: any) => {
      const isGroup = Boolean(c.groupId || c.group_id || c.type === 'group_contribution' || c.source === 'group_contribution' || c.round || c.round_number);
      const g = (groups || []).find((grp: any) => grp.id === (c.groupId || c.group_id));
      const m = (members || []).find((mem: any) => mem.id === (c.memberId || c.member_id));
      const groupName = c.groupName || c.ajoName || g?.group_name || (isGroup ? 'Group Better Ajo' : 'Personal Better Ajo');
      const memberName = c.memberName || c.userName || m?.full_name || (m as any)?.name || c.full_name || (isGroup ? 'Group Member' : 'Personal Ajo Member');
      const amt = Number(c.amount || c.gross_amount || 0);

      return {
        ...c,
        isGroup,
        type: isGroup ? 'group_contribution' : (c.type || 'personal_deposit'),
        displayType: isGroup ? 'GROUP CONTRIBUTION' : 'PERSONAL AJO',
        gross_amount: amt,
        amount: amt,
        fee: Number(c.fee || 60),
        groupName,
        ajoName: groupName,
        memberName,
        userName: memberName,
        status: (c.status || 'COMPLETED').toUpperCase()
      };
    }),
    ...(allPackTransactions || []).filter((pt: any) => pt.type !== 'personal_ajo_fee').map((pt: any) => {
      const g = (groups || []).find((grp: any) => grp.id === (pt.groupId || pt.group_id));
      const groupName = pt.groupName || pt.ajoName || g?.group_name || 'Group Better Ajo';
      const memberName = pt.memberName || pt.member_name || pt.userName || 'Group Member';
      const amt = Number(pt.amount || pt.packing_amount || 0);
      return {
        ...pt,
        isGroup: true,
        type: 'pack_payout',
        displayType: 'PACK OUT',
        status: 'PACKED',
        gross_amount: amt,
        amount: amt,
        fee: Number(pt.fee || pt.packing_fee || 0),
        groupName,
        ajoName: groupName,
        memberName,
        userName: memberName
      };
    }),
    ...withdrawalHistory
  ];

  const seenPayKeys = new Set<string>();
  const paymentsHistory = rawPayments.filter((p: any) => {
    // Exclude internal platform fees / commissions from Recent Transactions table
    if (p.internal || p.type === 'platform_fee' || p.type === 'super_admin_fee' || p.type === 'admin_commission') {
      return false;
    }
    const key = p.reference || p.id;
    if (key) {
      if (seenPayKeys.has(key)) return false;
      seenPayKeys.add(key);
    }
    return true;
  }).sort((a: any, b: any) => {
    const secA = (typeof a?.timestamp?.seconds === 'number')
      ? a.timestamp.seconds
      : (new Date(a?.createdAt || a?.created_at || a?.date || 0).getTime() / 1000);
    const secB = (typeof b?.timestamp?.seconds === 'number')
      ? b.timestamp.seconds
      : (new Date(b?.createdAt || b?.created_at || b?.date || 0).getTime() / 1000);
    return secB - secA;
  });

  const paymentList = paymentsHistory;
  const withdrawalList = withdrawalHistory;
  const recentAll = paymentsHistory.slice(0, 50);

  // Filter recent platform transactions by groupFilter dropdown (Section 6)
  const filteredRecent = (recentAll || []).filter((tx: any) => {
    if (groupFilter === 'all') return true;
    if (groupFilter === 'personal') {
      return !tx.groupId && !tx.group_id && (!tx.round && !tx.round_number) &&
        (String(tx.type || '').toUpperCase().includes('PERSONAL') || String(tx.displayType || '').toUpperCase().includes('PERSONAL'));
    }
    return tx.groupId === groupFilter || tx.group_id === groupFilter;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast Notification with manual dismiss */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-slate-900 px-5 py-3.5 text-xs font-semibold text-white shadow-xl animate-fade-in border border-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="flex-1">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white transition font-bold text-sm cursor-pointer p-0.5"
          >
            ✕
          </button>
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

      {/* DANGER ZONE - Fresh Start - Permanent Database Reset */}
      <div className="mb-6 rounded-3xl bg-rose-50/80 border-2 border-rose-300 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-600/20">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-rose-950 flex items-center gap-2">
                DANGER ZONE — Fresh Start & Permanent Database Reset
              </h3>
              <p className="text-xs text-rose-700 mt-1 max-w-2xl leading-relaxed">
                Current data will be <strong>PERMANENTLY deleted</strong> from Firebase Firestore Database — NOT local storage.
                Will NOT come back after refresh. After reset: <strong>0 groups, 0 transactions, 0 members, 4 streams ₦0</strong> so you can test personal & group Ajo flows cleanly from scratch.
              </p>
              {resetDone && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>✅ Reset Complete — Database empty — Everything ZERO — Now register fresh to test 600, 60, 33.33%, 1.6%</span>
                </div>
              )}
              {resetLogs && (
                <div className="mt-3">
                  <div className="text-[11px] font-bold text-slate-700 mb-1">Reset Execution Log:</div>
                  <pre className="text-[10px] font-mono bg-slate-900 text-emerald-400 p-3 rounded-xl max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {resetLogs}
                  </pre>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              setResetText('');
              setShowResetConfirm(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs transition shadow-md shadow-rose-600/20 cursor-pointer whitespace-nowrap self-start sm:self-center"
          >
            RESET EVERYTHING TO ZERO — Delete All Data Permanently
          </button>
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
            {formatNaira(totalPersonalSavings > 0 ? totalPersonalSavings : (personalAjoAggregate > 0 ? personalAjoAggregate : Number(data?.metrics?.totalPersonalSavings || 0)))}
          </span>
          <span className="text-[10px] text-emerald-700/90 mt-1 block font-medium">
            Protected member vaults
          </span>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Total Contribution Collected
          </span>
          <span className="text-xl font-black text-slate-900 block">
            {formatNaira(groupContributionsCollected > 0 ? groupContributionsCollected : Number(metrics.totalContributionsAmount || 0))}
          </span>
          <span className="text-[10px] text-emerald-600 mt-1 block font-bold">Includes member credits</span>
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
            {formatNaira(totalGroupAdminFees)}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block font-medium">66.67% share</span>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950 p-4 text-white shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block mb-1">
            Super Admin Share
          </span>
          <span className="text-xl font-black text-white block">
            {formatNaira(totalGross)}
          </span>
          <span className="text-[10px] text-emerald-400 mt-1 block font-medium">
            {formatNaira(availableForWithdraw)} available
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
        {[
          { id: 'overview', label: 'Platform Overview' },
          { id: 'groups', label: `All Groups (${groups.length})` },
          { id: 'members', label: `All Members (${members.length})` },
          { id: 'payments', label: `Payments (${(paymentList || []).length})` },
          { id: 'packings', label: `Packing Payouts (${packings.length})` },
          { id: 'withdrawals', label: `Withdrawals (${(withdrawalList || []).length})` },
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Recent Platform Transactions ({filteredRecent.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live feed of the most recent transactions from the transactions ledger. Newest on top.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 cursor-pointer"
                >
                  <option value="all">All Groups ({recentAll.length})</option>
                  <option value="personal">Personal Ajo</option>
                  {(groups || []).map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.group_name || g.name} {g.contribution_amount ? `- ₦${Number(g.contribution_amount).toLocaleString()}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-4">Date / Time</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">User</th>
                    <th className="py-2.5 px-4">Ajo Name</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(filteredRecent || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    (filteredRecent || []).map((tx: any) => {
                      const isPackPayout = tx?.type === 'pack_payout' || tx?.source === 'pack_payout' || tx?.type === 'PACK_PAYOUT' || tx?.type === 'PACKING_PAYOUT' || tx?.displayType === 'PACK OUT';
                      const displayAmount = Math.floor(Number(tx.amount || tx.gross_amount || tx.packing_amount || 0));
                      const isGroup = Boolean(isPackPayout || tx.groupId || tx.group_id || tx.type === 'group_contribution' || tx.source === 'group_contribution' || tx.type === 'GROUP_CONTRIBUTION' || tx.displayType === 'GROUP CONTRIBUTION');
                      const isWithdraw = tx?.type?.toString().toLowerCase().includes('withdraw') || tx?.type === 'GROUP_ADMIN_WITHDRAWAL';
                      const dateVal = tx?.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000) : (tx?.createdAt || tx?.created_at || tx?.date);
                      const dateFormatted = dateVal ? new Date(dateVal).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' }) : '—';

                      let typeBadgeText = 'PERSONAL AJO';
                      let typeBadgeClass = 'bg-blue-100 text-blue-800 border border-blue-200';
                      let user = tx.memberName || tx.userName || tx.user_name || (isGroup ? 'Group Member' : 'Personal Ajo Member');
                      let ajoName = tx.groupName || tx.ajoName || (isGroup ? 'Group Better Ajo' : 'Personal Better Ajo');
                      let statusText = 'COMPLETED';
                      let statusBadgeClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';

                      if (isPackPayout) {
                        typeBadgeText = 'PACK OUT';
                        typeBadgeClass = 'bg-purple-100 text-purple-800 border border-purple-200';
                        statusText = 'PACKED';
                        statusBadgeClass = 'bg-purple-100 text-purple-800 border border-purple-200';
                      } else if (isWithdraw) {
                        typeBadgeText = 'WITHDRAWAL';
                        typeBadgeClass = 'bg-amber-100 text-amber-800 border border-amber-200';
                        user = tx.userName || tx.user_name || tx.destination || tx.accountName || user;
                        statusText = 'COMPLETED';
                      } else if (isGroup) {
                        typeBadgeText = 'GROUP CONTRIBUTION';
                        typeBadgeClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                        statusText = 'COMPLETED';
                      }

                      return (
                        <tr key={tx?.id || Math.random().toString()} className="hover:bg-slate-50/60 transition">
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {dateFormatted}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${typeBadgeClass}`}>
                              {typeBadgeText}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                            {user}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 font-medium whitespace-nowrap">
                            {ajoName}
                          </td>
                          <td className="py-2.5 px-4 font-black text-slate-900 whitespace-nowrap font-mono text-xs">
                            ₦{displayAmount.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusBadgeClass}`}>
                              {statusText}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Groups */}
      {activeTab === 'groups' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                All Groups Platform-Wide ({groups.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every Group Better Ajo created, rotation state, dynamic cycle interval, and admin details.
              </p>
            </div>
            <button
              onClick={() => setShowCreateGroupModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#008751] hover:bg-[#007345] text-white shadow-sm transition cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ Create New Group</span>
            </button>
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
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Platform Payment Transactions ({(paymentsHistory || []).length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Live single source of truth from transactions ledger. Showing both deposits and withdrawals.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
                Real-Time Synchronized
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">User Name</th>
                  <th className="py-3 px-4">Ajo Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Fee</th>
                  <th className="py-3 px-4">Net Payout</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {(paymentsHistory || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No payment transactions found.
                    </td>
                  </tr>
                ) : (
                  (paymentsHistory || []).map((p: any) => {
                    const displayAmount = Math.floor(Number(p.amount || p.gross_amount || 0));
                    const isPackPayout = p?.type === 'pack_payout' || p?.source === 'pack_payout' || p?.type === 'PACK_PAYOUT';
                    const isGroup = Boolean(isPackPayout || p.groupId || p.group_id || p.type === 'group_contribution' || p.source === 'group_contribution' || p.type === 'GROUP_CONTRIBUTION');
                    const isWithdraw = p?.type?.toString().toLowerCase().includes('withdraw');
                    const dateVal = p?.timestamp?.seconds ? new Date(p.timestamp.seconds * 1000) : (p?.createdAt || p?.created_at || p?.date);
                    const dateFormatted = dateVal ? new Date(dateVal).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                    const feeVal = Number(p?.fee ?? (isWithdraw ? Math.round(displayAmount * 0.016) : (isPackPayout ? 0 : 60)));
                    const netPayout = isWithdraw ? Number(p?.net_payout ?? p?.netPayout ?? p?.net_amount ?? (displayAmount - feeVal)) : displayAmount;
                    const userName = p?.memberName || p?.userName || p?.user_name || (isGroup ? 'Group Member' : 'Personal Ajo Member');
                    const ajoName = p?.groupName || p?.ajoName || (isGroup ? 'Group Better Ajo' : 'Personal Better Ajo');

                    return (
                      <tr key={p?.id || Math.random().toString()} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {dateFormatted}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {userName}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                          {ajoName}
                        </td>
                        <td className="py-3 px-4">
                          {isPackPayout ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 uppercase border border-purple-200">
                              Pack Payout
                            </span>
                          ) : isWithdraw ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase border border-amber-200">
                              Withdrawal
                            </span>
                          ) : isGroup ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase border border-emerald-200">
                              Group Contribution
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 uppercase border border-blue-200">
                              Deposit
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap font-mono text-xs">
                          {formatNaira(displayAmount)}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                          {feeVal > 0 ? (
                            <span className={isWithdraw ? "text-rose-600" : "text-slate-800"}>
                              {formatNaira(feeVal)}
                            </span>
                          ) : (
                            <span className="text-slate-400">₦0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                          {isWithdraw ? (
                            <span className="text-[#008751] font-black">{formatNaira(netPayout)}</span>
                          ) : (
                            <span className="text-slate-800 font-black">{formatNaira(displayAmount)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            p?.status === 'success' || p?.status === 'successful' || p?.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {p?.status || 'completed'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
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
                All Withdrawals ({(filteredWithdrawals || []).length})
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
                  <th className="py-3 px-4">User Name</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Ajo Group</th>
                  <th className="py-3 px-4">Gross</th>
                  <th className="py-3 px-4">Fee</th>
                  <th className="py-3 px-4">Net Payout</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {(filteredWithdrawals || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No withdrawals found.
                    </td>
                  </tr>
                ) : (
                  (filteredWithdrawals || []).map((w: any) => {
                    const wDate = w?.timestamp?.seconds ? new Date(w.timestamp.seconds * 1000) : (w?.date || w?.createdAt || w?.created_at);
                    const dateFormatted = wDate ? new Date(wDate).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : '—';
                    const userName = w?.userName || w?.user_name || w?.destination || w?.user_id || 'User';
                    const roleVal = w?.userRole || w?.role || (w?.type?.includes('personal') ? 'member' : 'member');
                    const groupName = w?.ajoName || w?.ajo_name || w?.group_name || w?.source || 'Personal Better Ajo';
                    const grossAmt = Number(w?.gross_amount ?? w?.amount ?? 0);
                    const feeAmt = Number(w?.fee ?? 0);
                    const netPayout = Number(w?.net_payout ?? w?.netPayout ?? w?.net_amount ?? (grossAmt - feeAmt));
                    const statusVal = w?.status || 'completed';

                    return (
                      <tr key={w?.id || Math.random().toString()} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">{userName}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            roleVal?.toString().toLowerCase().includes('super')
                              ? 'bg-purple-100 text-purple-800'
                              : roleVal?.toString().toLowerCase().includes('admin')
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {roleVal}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">{groupName}</td>
                        <td className="py-3 px-4 font-black text-slate-900">{formatNaira(grossAmt)}</td>
                        <td className="py-3 px-4 font-mono font-bold text-rose-600">
                          {feeAmt > 0 ? formatNaira(feeAmt) : '₦0'}
                        </td>
                        <td className="py-3 px-4 font-mono font-black text-[#008751]">{formatNaira(netPayout)}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {dateFormatted}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            statusVal === 'successful' || statusVal === 'completed' || statusVal === 'success'
                              ? 'bg-emerald-100 text-emerald-800'
                              : statusVal === 'processing' || statusVal === 'pending'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {statusVal}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
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
                    {formatNaira(availableForWithdraw)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Total Lifetime Earnings:</span>
                  <span className="font-bold text-slate-600">
                    {formatNaira(superAdminEarnings.total_earned || availableForWithdraw)}
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
                    max={availableForWithdraw}
                    value={withdrawalAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setWithdrawalAmount(val);
                      const currentVal = Number(val || 0);
                      if (!val) {
                        setWithdrawError(null);
                      } else if (currentVal < 100 || currentVal > availableForWithdraw) {
                        setWithdrawError(`Amount must be between ₦100 and available balance (₦${Number(availableForWithdraw).toLocaleString()})`);
                      } else {
                        setWithdrawError(null);
                      }
                    }}
                    placeholder={`Max ₦${Number(availableForWithdraw).toLocaleString()}`}
                    className="w-full pl-8 pr-20 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawalAmount(String(availableForWithdraw));
                      setWithdrawError(null);
                    }}
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
                  onClick={() => {
                    setShowWithdrawModal(false);
                    setWithdrawError(null);
                  }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWithdrawing || !isWithdrawValid}
                  className="flex-1 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-extrabold text-xs shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
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

      {/* Modal: Create Group with Dynamic Cycle */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-[#008751]">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Create New Group Ajo
                  </h3>
                  <p className="text-[11px] text-slate-500">Configure dynamic cycle, members & contributions</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. ADUGBO JAO, KARILE AJO"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Contribution (₦)
                  </label>
                  <input
                    type="number"
                    value={newGroupAmount}
                    onChange={(e) => setNewGroupAmount(e.target.value)}
                    placeholder="50000"
                    min="1000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Member Count
                  </label>
                  <select
                    value={newGroupMemberCount}
                    onChange={(e) => setNewGroupMemberCount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                  >
                    <option value="5">5 Members</option>
                    <option value="10">10 Members</option>
                    <option value="15">15 Members</option>
                    <option value="20">20 Members</option>
                    <option value="30">30 Members</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rotation Cycle (Dynamic)
                </label>
                <select
                  name="cycle"
                  value={newGroupCycle}
                  onChange={(e) => setNewGroupCycle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                >
                  <option value="3">3 Days</option>
                  <option value="4">4 Days</option>
                  <option value="7">7 Days</option>
                  <option value="15">15 Days</option>
                  <option value="30">30 Days</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {newGroupCycle === 'custom' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Custom Cycle Interval (in Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={newGroupCustomDays}
                    onChange={(e) => setNewGroupCustomDays(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Packing Commission Fee (₦)
                </label>
                <input
                  type="number"
                  value={newGroupPackingFee}
                  onChange={(e) => setNewGroupPackingFee(e.target.value)}
                  placeholder="3000"
                  min="0"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                />
              </div>

              {/* Dynamic Financial Overview */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Per Member Payment:</span>
                  <span className="font-extrabold text-slate-900">
                    ₦{(Number(newGroupAmount || 0) + 60).toLocaleString()} (₦{Number(newGroupAmount || 0).toLocaleString()} + ₦60 fee)
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Platform Fee Total:</span>
                  <span className="font-extrabold text-emerald-700">
                    ₦{(Number(newGroupMemberCount || 5) * 60).toLocaleString()} (₦60 × {newGroupMemberCount})
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Pot Per Round:</span>
                  <span className="font-extrabold text-slate-900">
                    ₦{(Number(newGroupAmount || 0) * Number(newGroupMemberCount || 5)).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cycle Interval:</span>
                  <span className="font-extrabold text-blue-700">
                    Every {newGroupCycle === 'custom' ? newGroupCustomDays : newGroupCycle} days
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingGroup}
                  className="flex-1 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-extrabold text-xs shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isCreatingGroup ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Group</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Confirmation for Permanent Database Reset */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-rose-200 animate-scale-in my-8">
            <div className="flex items-center justify-between pb-4 border-b border-rose-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-rose-950 text-base">
                    PERMANENT DELETE FROM FIREBASE DATABASE
                  </h3>
                  <p className="text-xs text-rose-600 font-medium">CANNOT BE UNDONE</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!resetting) setShowResetConfirm(false);
                }}
                disabled={resetting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed mb-6">
              <p className="font-semibold text-rose-900 bg-rose-50 p-3.5 rounded-2xl border border-rose-200">
                ⚠️ This will <strong>PERMANENTLY DELETE</strong> all groups (Olopa Ajo, ADUGBO JAO etc), all group admins, all members, all contributions (₦50,060/₦250k), all platform transactions (600/60/2000/1000), all personal savings and withdrawals from <strong>Firebase Firestore Database</strong> — NOT local storage.
              </p>
              <p>
                After delete, you will <strong>NOT</strong> find data again. Firebase Console will show 0 documents. Your Super Admin account (<code>{currentSuperAdminEmail || userPhone}</code>) will be preserved so you stay logged in.
              </p>
              <div>
                <label className="block text-slate-800 font-bold mb-1.5">
                  Type <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-rose-600 font-extrabold">RESET</span> to confirm:
                </label>
                <input
                  type="text"
                  value={resetText}
                  onChange={(e) => setResetText(e.target.value)}
                  placeholder="Type RESET"
                  disabled={resetting}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-rose-300 focus:border-rose-600 focus:outline-none font-mono font-bold text-sm tracking-wider uppercase text-slate-900"
                />
              </div>

              {resetLogs && (
                <div className="mt-3">
                  <label className="block text-slate-800 font-bold mb-1">Live Progress Output:</label>
                  <pre className="text-[10px] font-mono bg-slate-900 text-emerald-400 p-3 rounded-xl max-h-36 overflow-y-auto whitespace-pre-wrap">
                    {resetLogs}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetEverythingPermanent}
                disabled={resetText.trim() !== "RESET" || resetting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black text-xs transition shadow-md shadow-rose-600/20 flex items-center gap-2 cursor-pointer"
              >
                {resetting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Deleting permanently from Firebase...</span>
                  </>
                ) : (
                  <span>Yes, PERMANENTLY DELETE EVERYTHING FROM DATABASE</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
