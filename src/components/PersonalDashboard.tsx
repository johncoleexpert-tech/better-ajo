import React, { useState } from 'react';
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
  LogOut
} from 'lucide-react';
import { UserProfile, PersonalAjo } from '../types/index.js';
import { formatNaira, formatPhone } from '../lib/formatters.js';
import { PaystackModal, PaymentBreakdown } from './PaystackModal.js';
import { OtpModal } from './OtpModal.js';
import { apiRequest } from '../lib/api.js';

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
  const [depositAmount, setDepositAmount] = useState('10000');
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      const data = await apiRequest('/api/personal/deposit/verify', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          reference: depositPaystack.reference,
          amount: Number(depositAmount)
        })
      });

      onUpdatePersonalAjo(data.personalAjo);
      setDepositPaystack(null);
      setSuccessMessage(`Successfully saved ${formatNaira(Number(depositAmount))} to your Personal Better Ajo!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Verification error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Withdrawal flow
  const withdrawNum = Number(withdrawAmount) || 0;
  const withdrawFee = Math.round(withdrawNum * 0.016); // 1.6%
  const withdrawNet = Math.max(0, withdrawNum - withdrawFee);

  const handleOpenWithdrawAuthorization = (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawNum <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (withdrawNum > personalAjo.balance) {
      setError(`Insufficient balance. Your available balance is ${formatNaira(personalAjo.balance)}.`);
      return;
    }

    setError(null);
    setShowWithdrawModal(false);
    setShowWithdrawOtp(true);
  };

  const handleConfirmWithdrawal = async (password: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/personal/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          amount: withdrawNum,
          password
        })
      });

      setShowWithdrawOtp(false);
      onUpdatePersonalAjo(data.personalAjo);
      setSuccessMessage(data.message || `Withdrawal of ${formatNaira(withdrawNet)} completed!`);
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      throw err;
    } finally {
      setLoading(false);
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

      {error && (
        <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm font-semibold flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Card */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden mb-8">
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
                {formatNaira(personalAjo.balance)}
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
              {formatNaira(personalAjo.balance)}
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

        {/* User Account Info */}
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
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Registered Phone Number
              </span>
              <span className="text-sm font-bold text-slate-900 block font-mono">
                {formatPhone(user.phone)}
              </span>
              <span className="text-[11px] text-[#008751] font-semibold">
                Verified ({user?.verification_type || 'ID'}: {user?.verification_number ? `${user.verification_number.slice(0, 3)}***${user.verification_number.slice(-3)}` : 'Verified'})
              </span>
            </div>
          </div>
        </div>
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

              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-100">
                Payment is processed securely using Paystack. A standard ₦60 transaction fee applies at checkout. {formatNaira(Number(depositAmount) || 0)} goes directly into your savings balance.
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Proceed to Paystack (+ ₦60 fee)</span>}
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
                  <span>1.6% Withdrawal Fee:</span>
                  <span className="font-bold text-rose-600">- {formatNaira(withdrawFee)}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-black text-slate-900">
                  <span>You Receive (Net):</span>
                  <span className="text-[#008751]">{formatNaira(withdrawNet)}</span>
                </div>
              </div>

              <div className="rounded-xl bg-[#E6F3ED]/70 p-3.5 border border-[#008751]/20 text-[11px] text-slate-800">
                Payout will be transferred immediately to: <strong>{user.bank_name} ({user.account_number})</strong>. Authorization with your login password is required.
              </div>

              <button
                type="submit"
                disabled={loading || withdrawNum <= 0 || withdrawNum > personalAjo.balance}
                className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Authorize Withdrawal</span>}
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

            <div className="py-4 space-y-3 overflow-y-auto">
              <div className="p-3.5 rounded-xl bg-gray-50 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-gray-900 block">Personal Better Ajo Registration</span>
                  <span className="text-gray-400 text-[10px]">One-time Platform Fee</span>
                </div>
                <span className="font-bold text-gray-700">₦600</span>
              </div>

              {personalAjo.total_deposited > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-emerald-950 block">Cumulative Deposits</span>
                    <span className="text-emerald-700 text-[10px]">Paystack Gateway</span>
                  </div>
                  <span className="font-bold text-emerald-800">+{formatNaira(personalAjo.total_deposited)}</span>
                </div>
              )}

              {personalAjo.total_withdrawn > 0 && (
                <div className="p-3.5 rounded-xl bg-gray-50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-gray-900 block">Cumulative Withdrawals</span>
                    <span className="text-gray-500 text-[10px]">NUBAN Bank Transfer</span>
                  </div>
                  <span className="font-bold text-red-600">-{formatNaira(personalAjo.total_withdrawn)}</span>
                </div>
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
    </div>
  );
};
