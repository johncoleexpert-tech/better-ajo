import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  History as HistoryIcon,
  ShieldCheck,
  Building,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  LogOut,
  Clock,
  Edit2,
  Mail,
  Copy,
  Check
} from 'lucide-react';
import { UserProfile, PersonalAjo } from '../types/index.js';
import { formatNaira, formatPhone } from '../lib/formatters.js';
import { PaystackModal, PaymentBreakdown } from './PaystackModal.js';
import { OtpModal } from './OtpModal.js';
import { apiRequest } from '../lib/api.js';
import {
  subscribeToUserPersonalBalance,
  subscribeToPersonalAjoDoc,
  subscribeToUserPersonalPayments,
  db
} from '../lib/firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface PersonalDashboardProps {
  user: UserProfile;
  personalAjo: PersonalAjo;
  onUpdatePersonalAjo: (updated: PersonalAjo) => void;
  onLogout?: () => void;
}

export const PersonalDashboard: React.FC<PersonalDashboardProps> = ({
  user,
  personalAjo,
  onUpdatePersonalAjo,
  onLogout
}) => {
  // Modal states
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('5000');
  const [depositPaystack, setDepositPaystack] = useState<{
    reference: string;
    authorization_url?: string;
    amount?: number;
    breakdown?: PaymentBreakdown;
  } | null>(null);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('5000');
  const [showWithdrawOtp, setShowWithdrawOtp] = useState(false);
  const [testWithdrawOtp, setTestWithdrawOtp] = useState<string | undefined>();

  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState<boolean>(true);

  // FIX B: Contact Info state
  const [currentWhatsapp, setCurrentWhatsapp] = useState(user.whatsapp_number || user.phone || '');
  const [editingContact, setEditingContact] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState(user.whatsapp_number || user.phone || '');
  const [savingContact, setSavingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Moniepoint Virtual Account state
  const [copiedVA, setCopiedVA] = useState(false);
  const [showSimulateTransferModal, setShowSimulateTransferModal] = useState(false);
  const [simulateTransferAmount, setSimulateTransferAmount] = useState('10000');
  const [simulatingTransfer, setSimulatingTransfer] = useState(false);
  const [simulateSuccess, setSimulateSuccess] = useState<string | null>(null);

  // Durable real-time Firestore listeners for user personal balance and transaction history
  useEffect(() => {
    if (!user?.id) return;

    // 1. Direct endpoint fetch on mount
    apiRequest(`/api/user/${encodeURIComponent(user.id)}/balance`)
      .then((data) => {
        if (data && typeof data.personalBalance === 'number') {
          onUpdatePersonalAjo({
            ...personalAjo,
            balance: data.personalBalance
          });
        }
      })
      .catch(() => {});

    // 2. Real-time Firestore onSnapshot listener for users collection
    const unsubUser = subscribeToUserPersonalBalance(user.id, (freshBalance) => {
      onUpdatePersonalAjo({
        ...personalAjo,
        balance: freshBalance
      });
    });

    // 3. Real-time Firestore onSnapshot listener for personal_ajo doc
    // (Requirement: Personal Ajo dashboard: change get() to onSnapshot() for personal_ajo doc. Balance updates instantly)
    const unsubPersonalAjo = subscribeToPersonalAjoDoc(user.id, (pData) => {
      if (pData) {
        onUpdatePersonalAjo({
          ...personalAjo,
          balance: typeof pData.balance === 'number' ? pData.balance : personalAjo.balance,
          total_deposited: typeof pData.total_deposited === 'number' ? pData.total_deposited : personalAjo.total_deposited,
          total_withdrawn: typeof pData.total_withdrawn === 'number' ? pData.total_withdrawn : personalAjo.total_withdrawn,
          total_saved: typeof pData.total_saved === 'number' ? pData.total_saved : personalAjo.total_saved
        });
      }
    });

    // 4. Fetch and listen to personal transactions history (deposits & withdrawals)
    setLoadingTransactions(true);
    apiRequest(`/api/personal/payments/${encodeURIComponent(user.id)}`)
      .then((res) => {
        if (res?.payments && Array.isArray(res.payments)) {
          setTransactions(res.payments);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTransactions(false));

    const unsubPayments = subscribeToUserPersonalPayments(user.id, (freshPayments) => {
      setTransactions(freshPayments);
      setLoadingTransactions(false);
    });

    return () => {
      unsubUser();
      unsubPersonalAjo();
      unsubPayments();
    };
  }, [user?.id]);

  // Deposit flow
  const handleInitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(depositAmount);
    if (isNaN(amt) || amt < 500) {
      setError('Minimum deposit amount is ₦500.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/personal/deposit/init', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, amount: amt })
      });

      setDepositPaystack(data.paystack);
      setShowDepositModal(false);
    } catch (err: any) {
      setError(err.message || 'Deposit initialization failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDeposit = async () => {
    if (!depositPaystack) return;
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/personal/deposit/verify', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          reference: depositPaystack.reference,
          amount: Number(depositAmount)
        })
      });

      if (!data || !data.success) {
        throw new Error(data?.error || 'Transaction failed - not saved');
      }

      onUpdatePersonalAjo(data.personalAjo);
      setDepositPaystack(null);
      setSuccessMessage(`Successfully saved ${formatNaira(Number(depositAmount))} to your Personal Better Ajo!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      const errMsg = err.message?.includes('Transaction failed')
        ? err.message
        : `Transaction failed - not saved: ${err.message || 'Verification error'}`;
      setError(errMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Withdrawal flow - BUG 2 FIX: total_saved = total_saved - amount. Payout to user = amount - fee.
  const currentTotalSaved = Number(personalAjo.total_saved ?? personalAjo.balance ?? 0);
  const withdrawNum = Number(withdrawAmount) || 0;
  const withdrawFee = Math.round(withdrawNum * 0.016); // 1.6%
  const withdrawNet = Math.max(0, withdrawNum - withdrawFee);

  const handleOpenWithdrawAuthorization = (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawNum <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (withdrawNum > currentTotalSaved) {
      setError(`Insufficient balance. Your available savings balance is ${formatNaira(currentTotalSaved)}.`);
      return;
    }

    setError(null);
    setShowWithdrawModal(false);
    setShowWithdrawOtp(true);
  };

  const handleConfirmWithdrawal = async (password: string) => {
    if (isProcessing || loading) return;
    try {
      setIsProcessing(true);
      setLoading(true);
      setError(null);

      // Authoritative withdrawal transaction is committed atomically by the server in /api/personal/withdraw
      const data = await apiRequest('/api/personal/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          amount: withdrawNum,
          password
        })
      });

      if (!data || !data.success) {
        throw new Error(data?.error || 'Withdrawal failed');
      }

      setShowWithdrawOtp(false);
      if (data.personalAjo) {
        onUpdatePersonalAjo(data.personalAjo);
      }
      setSuccessMessage(data.message || `Withdrawal of ${formatNaira(withdrawNet)} completed!`);
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      setError(err?.message || 'Withdrawal failed');
      throw err;
    } finally {
      setLoading(false);
      setIsProcessing(false);
    }
  };

  // 1. SAFETY GUARD FIRST - Add this at top of ALL pages that use transactions to prevent Super Admin crash:
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeAjoGroups = Array.isArray((personalAjo as any)?.groups) ? (personalAjo as any).groups : [];

  // 3. Personal Ajo - Transaction History section:
  // BEFORE: const history = transactions.filter(t => t.type.includes('deposit'))
  // AFTER SAFE CODE:
  // const personalHistory = (safeTransactions || []).filter(t => t && t.userId === currentUser?.uid)
  // - Show BOTH deposit and withdraw
  // - For deposit: green arrow "Deposit - Pack Ajo"
  // - For withdraw: red arrow "Withdrawal - Earnings - Pack Ajo"
  // - Use t?.type, t?.gross_amount with optional chaining
  const currentUserUid = (user as any)?.uid || user?.id;
  const seenRefs = new Set<string>();
  const personalHistory = (safeTransactions || []).filter((t) => {
    if (!t) return false;
    const isUserMatch = t?.userId === currentUserUid || t?.user_id === currentUserUid || !t?.userId;
    if (!isUserMatch) return false;
    const refKey = t.reference || t.id || `${t.type}_${t.amount}_${t.created_at || t.timestamp}`;
    if (seenRefs.has(refKey)) return false;
    seenRefs.add(refKey);
    return true;
  });

  // FIX B: Handle updating Phone / WhatsApp Number
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = whatsappInput.replace(/\D/g, '');
    if (cleanNum.length !== 11) {
      setError('Phone / WhatsApp Number must be exactly 11 digits (e.g. 08012345678).');
      return;
    }
    try {
      setSavingContact(true);
      setError(null);
      await apiRequest('/api/user/contact-info', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, whatsappNumber: cleanNum })
      });
      setCurrentWhatsapp(cleanNum);
      setEditingContact(false);
      setContactSuccess('Phone / WhatsApp Number updated successfully!');
      setTimeout(() => setContactSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update contact info');
    } finally {
      setSavingContact(false);
    }
  };

  const userFullName = (user?.full_name || 'Member').trim().toUpperCase().replace(/[^A-Z\s]/g, '');
  const vaAccountName = user?.virtual_account_name || personalAjo?.virtual_account_name || `BETTERAJO-${userFullName}`;
  const vaAccountNumber = user?.virtual_account_number || personalAjo?.virtual_account_number || ('8152' + Math.abs((user?.id || 'user').split('').reduce((a, b) => a + b.charCodeAt(0), 123456)).toString().slice(0, 6).padStart(6, '0'));

  const handleCopyVa = () => {
    navigator.clipboard.writeText(vaAccountNumber);
    setCopiedVA(true);
    setTimeout(() => setCopiedVA(false), 2500);
  };

  const handleSimulateBankTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(simulateTransferAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid transfer amount.');
      return;
    }

    try {
      setSimulatingTransfer(true);
      setError(null);
      const res = await apiRequest('/api/virtual-account/transfer', {
        method: 'POST',
        body: JSON.stringify({
          account_number: vaAccountNumber,
          amount: amt,
          savings_amount: amt,
          fee: 60,
          total: amt + 60
        })
      });

      if (res.personalAjo) {
        onUpdatePersonalAjo(res.personalAjo);
      }
      setSimulateSuccess(`Transfer Confirmed! Savings: ₦${amt.toLocaleString()} credited in full (+ ₦60 platform fee paid to Super Admin). Total: ₦${(amt + 60).toLocaleString()}.`);
      
      // Refresh transactions from server
      apiRequest(`/api/personal/payments/${encodeURIComponent(user.id)}`)
        .then((pRes) => {
          if (pRes?.payments && Array.isArray(pRes.payments)) {
            setTransactions(pRes.payments);
          }
        })
        .catch(() => {});

      setTimeout(() => {
        setSimulateSuccess(null);
        setShowSimulateTransferModal(false);
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setSimulatingTransfer(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Success / Error Alerts */}
      {successMessage && (
        <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-900 text-sm font-semibold flex items-center space-x-3 shadow-xs">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {contactSuccess && (
        <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-900 text-sm font-semibold flex items-center space-x-3 shadow-xs">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{contactSuccess}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm font-semibold flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* DEDICATED PERMANENT VIRTUAL ACCOUNT CARD (BIG FONT) */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-6 sm:p-8 text-white shadow-xl border border-emerald-500/30 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#008751]/15 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              <Building className="h-3.5 w-3.5 text-emerald-400" />
              <span>YOUR PERSONAL AJO DEDICATED ACCOUNT - MONIEPOINT MFB</span>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                Bank: <strong className="text-white font-mono">Moniepoint MFB</strong> • Account Name
              </div>
              <div className="text-xl sm:text-2xl font-black text-white tracking-wide font-mono">
                {vaAccountName}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Account No (Moniepoint MFB - Transfer ANY Amount)
              </div>
              <div className="text-3xl sm:text-5xl font-black text-emerald-400 font-mono tracking-widest flex items-center flex-wrap gap-3">
                <span>{vaAccountNumber}</span>
                <button
                  onClick={handleCopyVa}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold font-sans transition-all active:scale-95 cursor-pointer"
                  title="Copy Account Number"
                >
                  {copiedVA ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-300">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copy Number</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-300 max-w-xl leading-relaxed pt-1">
              Transfer <strong className="text-white">ANY amount</strong> from any Nigerian bank app (GTBank, Zenith, OPay, PalmPay, Kuda, etc.) directly into this account. Bank: <strong className="text-emerald-300">Moniepoint MFB</strong>. Funds are automatically credited to your Personal Better Ajo savings!
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:self-center shrink-0">
            <button
              onClick={() => setShowSimulateTransferModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-[#008751] hover:bg-[#007345] text-white font-black text-xs shadow-lg shadow-[#008751]/25 active:scale-95 transition-all cursor-pointer"
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>Simulate Bank Transfer</span>
            </button>
            <div className="text-[11px] text-center text-slate-400">
              Bank: <strong className="text-slate-200">Moniepoint MFB</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden mb-6">
        {/* Top Balance Banner */}
        <div className="bg-slate-900 p-6 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#008751]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#008751] bg-[#E6F3ED] px-2.5 py-1 rounded-full w-fit mb-3">
                <Wallet className="h-3.5 w-3.5 text-[#008751]" />
                <span>Personal Better Ajo</span>
              </div>
              <div className="text-3xl sm:text-5xl font-black tracking-tight text-white">
                {formatNaira(currentTotalSaved)}
              </div>
              <div className="text-xs text-slate-400 mt-1.5 font-medium">
                Available Balance Ready For Instant Withdrawal
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap gap-2.5 pt-2 sm:pt-0">
              <button
                onClick={() => setShowDepositModal(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-5 py-3.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs shadow-lg shadow-[#008751]/20 active:scale-95 transition-all cursor-pointer"
              >
                <ArrowDownLeft className="h-4 w-4" />
                <span>SAVE MONEY</span>
              </button>

              <button
                onClick={() => setShowWithdrawModal(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-5 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <ArrowUpRight className="h-4 w-4 text-[#008751]" />
                <span>WITHDRAW</span>
              </button>

              <button
                onClick={() => setShowTransactionsModal(true)}
                className="inline-flex items-center justify-center space-x-1.5 px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer"
              >
                <HistoryIcon className="h-4 w-4" />
                <span>LOGS</span>
              </button>

              {onLogout && (
                <button
                  onClick={onLogout}
                  className="inline-flex items-center justify-center space-x-1.5 px-4 py-3.5 rounded-xl border border-rose-400/40 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-xs transition-colors cursor-pointer"
                  title="Log out of Personal Better Ajo"
                >
                  <LogOut className="h-4 w-4" />
                  <span>LOG OUT</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/50">
          <div className="p-5 text-left">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Total Saved
            </span>
            <span className="text-xl font-black text-slate-900 mt-1 block">
              {formatNaira(currentTotalSaved)}
            </span>
          </div>

          <div className="p-5 text-left">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Total Deposited
            </span>
            <span className="text-xl font-black text-[#008751] mt-1 block">
              {formatNaira(personalAjo.total_deposited)}
            </span>
          </div>

          <div className="p-5 text-left">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Total Withdrawn
            </span>
            <span className="text-xl font-black text-slate-700 mt-1 block">
              {formatNaira(personalAjo.total_withdrawn)}
            </span>
          </div>

          <div className="p-5 text-left">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Account Status
            </span>
            <span className="inline-flex items-center space-x-1.5 mt-1 px-3 py-1 rounded-full bg-[#E6F3ED] text-[#008751] text-xs font-bold">
              <span className="h-2 w-2 rounded-full bg-[#008751]" />
              <span>Active</span>
            </span>
          </div>
        </div>

        {/* User Account Info - Bank & Identity */}
        <div className="p-6 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center space-x-3.5">
            <div className="h-10 w-10 rounded-xl bg-[#E6F3ED] text-[#008751] flex items-center justify-center shrink-0">
              <Building className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Registered Bank Account
              </span>
              <span className="text-sm font-bold text-slate-900 block font-mono">
                {user.account_number} • {user.bank_name}
              </span>
              <span className="text-[11px] text-slate-500">{user.full_name}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3.5 sm:border-l sm:pl-6 border-slate-100">
            <div className="h-10 w-10 rounded-xl bg-[#E6F3ED] text-[#008751] flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Identity Verification
              </span>
              <span className="text-sm font-bold text-slate-900 block font-mono">
                {user?.verification_type || 'ID'}: {user?.verification_number ? `${user.verification_number.slice(0, 3)}***${user.verification_number.slice(-3)}` : 'Verified'}
              </span>
              <span className="text-[11px] text-[#008751] font-semibold">
                NIBSS Verified & Encrypted
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FIX B: Dedicated Contact Info Section */}
      <div className="mb-8 rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-[#008751] flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center space-x-2">
                <span>Contact Info & Alerts</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-[#008751] text-[10px] font-bold">
                  Verified
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Phone / WhatsApp Number used for real-time notifications and payment receipts
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setWhatsappInput(currentWhatsapp || user.phone || '');
              setEditingContact(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-[#008751] bg-slate-50 hover:bg-emerald-50/50 text-slate-700 hover:text-[#008751] font-bold text-xs transition cursor-pointer self-start sm:self-auto"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Update WhatsApp Number</span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100">
            <Smartphone className="h-4 w-4 text-[#008751] shrink-0" />
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Phone / WhatsApp Number
              </span>
              <span className="text-sm font-bold text-slate-900 font-mono">
                {formatPhone(currentWhatsapp || user.phone)}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100">
            <Mail className="h-4 w-4 text-[#008751] shrink-0" />
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Registered Email
              </span>
              <span className="text-sm font-bold text-slate-900 font-mono truncate max-w-[220px] block">
                {user.email || 'Not provided'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Personal Transaction History Table Section */}
      <div className="mt-8 rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E6F3ED] flex items-center justify-center text-[#008751]">
              <HistoryIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Personal Transaction History
              </h3>
              <p className="text-xs text-slate-500">
                Verified savings deposits and NUBAN bank withdrawals
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
              {(personalHistory || []).length} record{(personalHistory || []).length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {loadingTransactions ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-[#008751]" />
            <span className="text-xs font-medium">Loading transactions...</span>
          </div>
        ) : (personalHistory || []).length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Clock className="h-8 w-8 mx-auto text-slate-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-600">No transactions recorded yet</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Your deposits and withdrawals will appear here automatically with real-time Paystack and NUBAN confirmation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(personalHistory || []).map((tx: any) => {
                  const txType = (tx?.type || tx?.purpose || '').toString().toUpperCase();
                  const isFee = txType.includes('FEE') || tx?.category === 'ACTIVATION_FEE' || tx?.purpose === 'personal_registration';
                  const isDeposit = !isFee && (txType === 'DEPOSIT' || txType.includes('DEPOSIT') || tx?.purpose === 'personal_deposit' || tx?.purpose === 'personal_virtual_account_transfer');
                  const dateVal = tx?.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000) : (tx?.created_at || tx?.createdAt || tx?.paid_at || tx?.date);
                  const formattedDate = dateVal
                    ? new Date(dateVal).toLocaleString('en-NG', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })
                    : '—';
                  const displayAmount = Number(tx?.gross_amount ?? tx?.amount ?? tx?.savings_amount ?? 0);
                  const displayTitle = isFee
                    ? 'ACTIVATION FEE - PERSONAL AJO - Paid'
                    : isDeposit
                    ? 'DEPOSIT - PERSONAL AJO SAVINGS'
                    : 'WITHDRAWAL - PERSONAL AJO';

                  return (
                    <tr key={tx?.id || tx?.reference || Math.random().toString()} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                        {formattedDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isFee
                              ? 'bg-blue-100 text-blue-800'
                              : isDeposit
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isDeposit ? (
                            <ArrowDownLeft className="h-3 w-3 text-emerald-700" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3 text-rose-600" />
                          )}
                          {displayTitle}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {tx?.reference || tx?.id}
                      </td>
                      <td className="py-3 px-4 font-bold text-sm whitespace-nowrap">
                        <span className={isDeposit ? 'text-emerald-700' : isFee ? 'text-blue-700' : 'text-rose-600'}>
                          {isDeposit ? '+' : '-'}{formatNaira(displayAmount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            tx?.status === 'success' || tx?.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : tx?.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {tx?.status || 'completed'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Save Money (Deposit) Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-[#E6F3ED] flex items-center justify-center text-[#008751]">
                  <Wallet className="h-4 w-4" />
                </div>
                <h3 className="font-black text-slate-900 text-base">Save Into Personal Ajo</h3>
              </div>
              <button
                onClick={() => setShowDepositModal(false)}
                className="rounded-full p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleInitDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Deposit Amount (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">₦</span>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 text-xl font-bold font-mono outline-none text-slate-900 transition"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {['5000', '10000', '25000', '50000', '100000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDepositAmount(preset)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#E6F3ED] hover:text-[#008751] text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      +{formatNaira(Number(preset))}
                    </button>
                  ))}
                </div>
              </div>

              {/* Additive Fee Breakdown */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80 space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Savings:</span>
                  <span className="font-bold text-slate-900 text-sm">{formatNaira(Number(depositAmount) || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Platform Fee:</span>
                  <span className="font-bold text-amber-700 text-sm">+₦60</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
                  <span>Total to Pay:</span>
                  <span className="text-[#008751] text-base font-black">{formatNaira((Number(depositAmount) || 0) + 60)}</span>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50/70 p-3 text-xs text-emerald-800 border border-emerald-100 flex items-start space-x-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  The ₦60 platform fee is added on top. Exactly <strong>{formatNaira(Number(depositAmount) || 0)}</strong> will be credited directly to your savings balance.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Pay {formatNaira((Number(depositAmount) || 0) + 60)} via Paystack</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Paystack Deposit Modal */}
      {depositPaystack && (
        <PaystackModal
          isOpen={true}
          onClose={() => setDepositPaystack(null)}
          reference={depositPaystack.reference}
          amount={depositPaystack.amount || (Number(depositAmount) + 60)}
          purpose="Personal Better Ajo Savings Deposit"
          breakdown={depositPaystack.breakdown || {
            baseAmount: Number(depositAmount),
            baseLabel: 'Savings Amount',
            feeAmount: 60,
            feeLabel: 'Transaction Fee',
            totalAmount: Number(depositAmount) + 60
          }}
          authorizationUrl={depositPaystack.authorization_url}
          onVerified={handleVerifyDeposit}
        />
      )}

      {/* Withdraw Modal with 1.6% calculation */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-[#E6F3ED] flex items-center justify-center text-[#008751]">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <h3 className="font-black text-slate-900 text-base">Withdraw Funds</h3>
              </div>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="rounded-full p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOpenWithdrawAuthorization} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Withdrawal Amount (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">₦</span>
                  <input
                    type="number"
                    max={personalAjo.balance}
                    min={100}
                    required
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 text-xl font-bold font-mono outline-none text-slate-900 transition"
                  />
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Available: {formatNaira(personalAjo.balance)}
                </div>
              </div>

              {/* 1.6% Fee Calculation Breakdown */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Requested Withdrawal:</span>
                  <span className="font-bold text-slate-900">{formatNaira(withdrawNum)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>1.6% Better Ajo Fee:</span>
                  <span className="font-bold text-rose-600">- {formatNaira(withdrawFee)}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-black text-slate-900">
                  <span>You Receive (Net in Bank):</span>
                  <span className="text-[#008751]">{formatNaira(withdrawNet)}</span>
                </div>
                <div className="border-t border-slate-100 pt-1.5 flex justify-between text-[11px] text-slate-500">
                  <span>Remaining Savings Balance:</span>
                  <span className="font-mono font-semibold text-slate-700">{formatNaira(Math.max(0, currentTotalSaved - withdrawNum))}</span>
                </div>
              </div>

              <div className="rounded-xl bg-[#E6F3ED]/70 p-3.5 border border-[#008751]/20 text-[11px] text-slate-800">
                Payout will be transferred immediately to: <strong>{user.bank_name} ({user.account_number})</strong>. Authorization with your login password is required.
              </div>

              <button
                type="submit"
                disabled={loading || isProcessing || withdrawNum <= 0 || withdrawNum > currentTotalSaved}
                className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading || isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Authorize Withdrawal</span>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Withdrawal Password Authorization Modal */}
      <OtpModal
        isOpen={showWithdrawOtp}
        onClose={() => setShowWithdrawOtp(false)}
        title="Authorize Withdrawal"
        amountDisplay={formatNaira(withdrawNet)}
        description={`Enter your login password to authorize transfer of ${formatNaira(withdrawNet)}`}
        onSuccess={handleConfirmWithdrawal}
      />

      {/* Transactions Modal */}
      {showTransactionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-gray-100 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <HistoryIcon className="h-5 w-5 text-emerald-700" />
                <h3 className="font-extrabold text-gray-900 text-base">Transactions History</h3>
              </div>
              <button
                onClick={() => setShowTransactionsModal(false)}
                className="rounded-full p-1 text-gray-400 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 overflow-y-auto max-h-[60vh]">
              {(personalHistory || []).length === 0 ? (
                <div className="py-8 text-center text-slate-400 space-y-2">
                  <Clock className="h-7 w-7 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">No personal transactions recorded yet</p>
                </div>
              ) : (
                (personalHistory || []).map((tx: any) => {
                  const txType = (tx?.type || tx?.purpose || '').toString().toUpperCase();
                  const isFee = txType.includes('FEE') || tx?.category === 'ACTIVATION_FEE' || tx?.purpose === 'personal_registration';
                  const isDeposit = !isFee && (txType === 'DEPOSIT' || txType.includes('DEPOSIT') || tx?.purpose === 'personal_deposit' || tx?.purpose === 'personal_virtual_account_transfer');
                  const dateVal = tx?.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000) : (tx?.created_at || tx?.createdAt || tx?.paid_at || tx?.date);
                  const formattedDate = dateVal
                    ? new Date(dateVal).toLocaleString('en-NG', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })
                    : '—';
                  const displayAmount = Number(tx?.gross_amount ?? tx?.amount ?? tx?.savings_amount ?? 0);
                  const displayTitle = isFee
                    ? 'ACTIVATION FEE - PERSONAL AJO - Paid'
                    : isDeposit
                    ? 'DEPOSIT - PERSONAL AJO SAVINGS'
                    : 'WITHDRAWAL - PERSONAL AJO';

                  return (
                    <div
                      key={tx?.id || tx?.reference || Math.random().toString()}
                      className="p-3 rounded-xl bg-slate-50 flex items-center justify-between text-xs border border-slate-100"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            isFee ? 'bg-blue-100 text-blue-800' : isDeposit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isDeposit ? <ArrowDownLeft className="h-4 w-4 text-emerald-700" /> : <ArrowUpRight className="h-4 w-4 text-rose-600" />}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block">
                            {displayTitle}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {tx?.reference || tx?.id} • {formattedDate}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold block ${isDeposit ? 'text-emerald-700' : isFee ? 'text-blue-700' : 'text-rose-600'}`}>
                          {isDeposit ? '+' : '-'}{formatNaira(displayAmount)}
                        </span>
                        <span className="text-[9px] uppercase font-bold text-slate-400">
                          {tx?.status || 'completed'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 border-t border-gray-100 text-right">
              <button
                onClick={() => setShowTransactionsModal(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX B: Contact Info Edit Modal */}
      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#008751] flex items-center justify-center">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Contact Information</h3>
                  <p className="text-[11px] text-slate-500">Update your Phone / WhatsApp Number</p>
                </div>
              </div>
              <button
                onClick={() => setEditingContact(false)}
                className="rounded-full p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Phone / WhatsApp Number (11 digits) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={whatsappInput}
                    onChange={(e) => setWhatsappInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 08012345678"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 font-mono text-sm outline-none text-slate-900 transition"
                  />
                  <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Must be 11 digits (e.g. 08012345678) used for WhatsApp alerts & receipts.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Registered Email Address
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value={user.email || 'None'}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm font-mono cursor-not-allowed"
                  />
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingContact(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingContact || whatsappInput.replace(/\D/g, '').length !== 11}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-xs font-bold text-white shadow-md shadow-[#008751]/20 transition disabled:opacity-50 cursor-pointer"
                >
                  {savingContact ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Save Contact Info</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Simulate Bank Transfer Modal (Instant Moniepoint Transfer Simulation) */}
      {showSimulateTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#008751] flex items-center justify-center">
                  <Building className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Simulate Bank Transfer</h3>
                  <p className="text-[11px] text-slate-500">Test incoming Moniepoint MFB transfer</p>
                </div>
              </div>
              <button
                onClick={() => setShowSimulateTransferModal(false)}
                className="rounded-full p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {simulateSuccess ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h4 className="font-black text-slate-900 text-base">Transfer Confirmed!</h4>
                <p className="text-xs text-slate-600">{simulateSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleSimulateBankTransfer} className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Bank Name:</span>
                    <strong className="text-slate-900 font-bold">Moniepoint MFB</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Account Name:</span>
                    <strong className="text-slate-900 font-mono font-bold">{vaAccountName}</strong>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">Virtual Account No:</span>
                    <div className="flex items-center gap-2">
                      <strong className="text-emerald-700 font-mono text-sm font-black">{vaAccountNumber}</strong>
                      <button
                        type="button"
                        onClick={handleCopyVa}
                        className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold cursor-pointer"
                      >
                        {copiedVA ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Savings Amount (₦)
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    required
                    value={simulateTransferAmount}
                    onChange={(e) => setSimulateTransferAmount(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 font-mono text-base font-bold text-slate-900 outline-none transition"
                    placeholder="e.g. 5000"
                  />
                  <div className="flex gap-2 mt-2">
                    {['2000', '5000', '10000', '25000'].map((quickAmt) => (
                      <button
                        key={quickAmt}
                        type="button"
                        onClick={() => setSimulateTransferAmount(quickAmt)}
                        className="flex-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                      >
                        ₦{Number(quickAmt).toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Addition Fee Model Breakdown */}
                <div className="rounded-2xl bg-emerald-50/60 p-3.5 border border-emerald-200/80 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-medium">Savings (Full Credit):</span>
                    <span className="font-bold text-slate-900 text-sm">₦{Number(simulateTransferAmount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-medium">Platform Fee:</span>
                    <span className="font-bold text-amber-700 text-sm">+₦60</span>
                  </div>
                  <div className="border-t border-emerald-200 pt-1.5 flex justify-between items-center text-sm font-black text-slate-900">
                    <span>Total Transfer:</span>
                    <span className="text-[#008751] text-base font-black">₦{(Number(simulateTransferAmount || 0) + 60).toLocaleString()}</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 leading-relaxed">
                  ✓ <strong>Addition Model:</strong> ₦{Number(simulateTransferAmount || 0).toLocaleString()} is credited in full to your savings. ₦60 platform fee is credited to Super Admin platform wallet.
                </div>

                <div className="pt-2 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowSimulateTransferModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={simulatingTransfer}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-xs font-bold text-white shadow-md shadow-[#008751]/20 transition disabled:opacity-50 cursor-pointer"
                  >
                    {simulatingTransfer ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span>Simulate Bank Transfer (Total: ₦{(Number(simulateTransferAmount || 0) + 60).toLocaleString()})</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
