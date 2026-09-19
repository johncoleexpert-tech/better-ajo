import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  ArrowLeft,
  Wallet,
  TrendingUp,
  CreditCard,
  Copy,
  CheckCircle2,
  PlayCircle,
  Clock,
  Calendar,
  AlertCircle,
  Building,
  RefreshCw,
  Loader2,
  ChevronRight,
  UserCheck,
  Share2,
  ArrowUpRight,
  History,
  Lock,
  Download,
  MessageSquare,
  Send,
  ExternalLink,
  X,
  Phone,
  ShieldCheck,
  Eye,
  Check,
  LogOut
} from 'lucide-react';
import { GroupAdminDashboardData, GroupAdminMemberItem, UserProfile } from '../types/index.js';
import { formatNaira, formatPhone } from '../lib/formatters.js';

interface GroupAdminDashboardProps {
  groupId: string;
  currentUser: UserProfile;
  onBack: () => void;
  onLogout?: () => void;
  onOpenGroupView?: () => void;
}

export const GroupAdminDashboard: React.FC<GroupAdminDashboardProps> = ({
  groupId,
  currentUser,
  onBack,
  onLogout,
  onOpenGroupView
}) => {
  const [data, setData] = useState<GroupAdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'earnings' | 'withdrawals' | 'ledger'>('overview');

  // Withdrawal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Member Notification & Details states
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [selectedMemberForNotify, setSelectedMemberForNotify] = useState<GroupAdminMemberItem | null>(null);
  const [notifyRecipientType, setNotifyRecipientType] = useState<'all' | 'single'>('all');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [selectedMemberDetails, setSelectedMemberDetails] = useState<GroupAdminMemberItem | null>(null);
  const [isStartingNextRound, setIsStartingNextRound] = useState(false);

  const handleStartNextRound = async () => {
    try {
      setIsStartingNextRound(true);
      const res = await fetch(`/api/groups/${groupId}/start-next-round`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ adminId: currentUser.id })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to start next round');
      }
      showToast(json.message || `Round ${json.group?.current_round || ''} has started!`);
      await fetchDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Error starting next round');
    } finally {
      setIsStartingNextRound(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/groups/${groupId}/admin-dashboard?userId=${currentUser.id}`, {
        headers: {
          'x-user-id': currentUser.id
        }
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load group admin dashboard');
      }
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error connecting to group admin dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [groupId, currentUser.id]);

  const handleCopyCode = () => {
    if (!data?.group?.group_code) return;
    navigator.clipboard.writeText(data.group.group_code);
    setCopiedCode(true);
    showToast(`Invite code ${data.group.group_code} copied!`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!data?.group?.group_code) return;
    const url = `${window.location.origin}?joinCode=${data.group.group_code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('Group invitation link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleInitiateWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setWithdrawError(null);

    const amount = Math.round(Number(withdrawAmount));
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError('Please enter a valid withdrawal amount.');
      return;
    }

    if (amount > data.adminEarnings.available) {
      setWithdrawError(`Amount exceeds your available commission balance of ${formatNaira(data.adminEarnings.available)}.`);
      return;
    }

    if (!data.adminBankDetails?.account_number || !data.adminBankDetails?.bank_name) {
      setWithdrawError('Please ensure your payout bank details are registered.');
      return;
    }

    try {
      setIsWithdrawing(true);
      const res = await fetch(`/api/groups/${groupId}/withdraw-admin-earnings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          userId: currentUser.id,
          amount,
          bankName: data.adminBankDetails.bank_name,
          accountNumber: data.adminBankDetails.account_number,
          accountName: data.adminBankDetails.account_name
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Withdrawal failed');
      }

      setShowWithdrawModal(false);
      setWithdrawAmount('');
      showToast(json.message || `Commission of ${formatNaira(amount)} initiated successfully!`);
      fetchDashboardData();
    } catch (err: any) {
      setWithdrawError(err.message || 'Error processing commission payout');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const getWhatsAppLink = (phone: string, memberName: string, customMsg?: string) => {
    if (!data?.group) return '#';
    const digitsOnly = phone.replace(/\D/g, '');
    let intlPhone = digitsOnly;
    if (intlPhone.startsWith('0')) {
      intlPhone = '234' + intlPhone.slice(1);
    } else if (!intlPhone.startsWith('234')) {
      intlPhone = '234' + intlPhone;
    }

    const baseMessage = customMsg?.trim() || `Hello ${memberName}, this is a message from the admin of ${data.group.group_name} on Better Ajo.`;
    return `https://wa.me/${intlPhone}?text=${encodeURIComponent(baseMessage)}`;
  };

  const handleSendNotification = async () => {
    if (!data?.group || !notifyMessage.trim()) return;
    try {
      setIsSendingNotification(true);
      const res = await fetch(`/api/groups/${groupId}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          userId: currentUser.id,
          message: notifyMessage.trim(),
          recipientType: notifyRecipientType,
          memberId: notifyRecipientType === 'single' ? selectedMemberForNotify?.id : undefined,
          channel: 'whatsapp_handoff'
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to record notification');
      }

      showToast(json.message || 'Notification recorded successfully!');
      setShowNotifyModal(false);
      setNotifyMessage('');
    } catch (err: any) {
      showToast(err.message || 'Error processing notification');
    } finally {
      setIsSendingNotification(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-500">
        <Loader2 className="h-10 w-10 animate-spin text-[#008751] mb-4" />
        <p className="text-sm font-semibold">Loading Group Admin Dashboard...</p>
        <span className="text-xs text-slate-400 mt-1">Verifying administrative credentials</span>
      </div>
    );
  }

  if (error || !data || !data.group || !data.adminEarnings) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-3xl bg-white border border-rose-100 p-8 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">Access Restricted</h2>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            {error || 'You do not have administrative access to this group. Only the authorized group creator can access this dashboard.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onBack}
              className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
            >
              Go Back
            </button>
            <button
              onClick={fetchDashboardData}
              className="px-6 py-2.5 rounded-xl bg-[#008751] text-white font-bold text-xs hover:bg-[#007345] transition cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    group,
    currentPacker,
    nextPacker,
    nextPackingDateDisplay,
    adminEarnings,
    members = [],
    earningsHistory = [],
    withdrawals = [],
    transactions = [],
    adminBankDetails
  } = data;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white shadow-xl animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation & Status */}
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
            <div className="h-10 w-10 rounded-2xl bg-[#E6F3ED] text-[#008751] flex items-center justify-center font-black">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {group.group_name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  Group Admin Portal
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Admin: <strong className="text-slate-700">{group.admin_name}</strong> • Managed exclusively by creator (Non-contributor position)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setSelectedMemberForNotify(null);
              setNotifyRecipientType('all');
              setNotifyMessage(`Hello, this is a message from the admin of ${group.group_name} on Better Ajo. Please ensure your contribution for Round ${group.current_round} is completed so our rotation proceeds on schedule.`);
              setShowNotifyModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-200 bg-[#E6F3ED] text-[#008751] hover:bg-[#d8ece2] text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Notify Members</span>
          </button>

          {onOpenGroupView && (
            <button
              onClick={onOpenGroupView}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <span>View Group Rotation</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          )}

          <button
            onClick={fetchDashboardData}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#008751] hover:bg-slate-50 transition cursor-pointer shadow-sm"
            title="Refresh dashboard data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={adminEarnings.available <= 0}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition cursor-pointer ${
              adminEarnings.available > 0
                ? 'bg-[#008751] hover:bg-[#007345] text-white shadow-[#008751]/20'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Wallet className="h-4 w-4" />
            <span>Withdraw Commission ({formatNaira(adminEarnings.available)})</span>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition shadow-xs cursor-pointer"
              title="Log out of Group Admin Portal"
            >
              <LogOut className="h-4 w-4" />
              <span>LOG OUT</span>
            </button>
          )}
        </div>
      </div>

      {/* Hero Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Card 1: Group Identity & Code */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Group Code & Invite</span>
            <Share2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {group.group_code}
            </span>
            <button
              onClick={handleCopyCode}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition cursor-pointer"
              title="Copy group code"
            >
              {copiedCode ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">Frequency:</span>
            <span className="font-extrabold text-slate-800">{group.cycle_type}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 text-xs">
            <span className="text-slate-500 font-medium">Packing Fee:</span>
            <span className="font-extrabold text-emerald-700">{formatNaira(group.packing_fee || 3000)}</span>
          </div>
        </div>

        {/* Card 2: Members & Capacity */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Members & Capacity</span>
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-black text-slate-900">
              {data.membersJoinedCount} <span className="text-sm font-semibold text-slate-400">/ {data.totalMembersExpected}</span>
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              data.membersJoinedCount >= data.totalMembersExpected
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {data.membersJoinedCount >= data.totalMembersExpected ? 'Full' : `${data.totalMembersExpected - data.membersJoinedCount} spots left`}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">Contribution:</span>
            <span className="font-extrabold text-slate-800">{formatNaira(group.contribution_amount)}/person</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 text-xs">
            <span className="text-slate-500 font-medium">Total Payout:</span>
            <span className="font-extrabold text-emerald-700">{formatNaira(group.packing_amount)}</span>
          </div>
        </div>

        {/* Card 3: Rotation & Active Round */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Current Rotation</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-black text-slate-900">
              Round {group.current_round}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              ({group.status})
            </span>
          </div>
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">Current Packer:</span>
            <span className="font-extrabold text-slate-800 truncate max-w-[120px]">
              {currentPacker ? `${currentPacker.full_name} (Pos ${currentPacker.position})` : 'Waiting to Start'}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1.5 text-xs">
            <span className="text-slate-500 font-medium">Next Pack Date:</span>
            <span className="font-extrabold text-emerald-700">{nextPackingDateDisplay || 'Pending'}</span>
          </div>
        </div>

        {/* Card 4: Admin Commission Earnings */}
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-5 text-white shadow-md">
          <div className="flex items-center justify-between text-emerald-300 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Admin Earnings</span>
            <Wallet className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-black tracking-tight text-white">
              {formatNaira(adminEarnings.available)}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Available
            </span>
          </div>
          <div className="flex items-center justify-between pt-2.5 border-t border-white/10 text-xs">
            <span className="text-slate-400">Total Earned:</span>
            <span className="font-extrabold text-white">{formatNaira(adminEarnings.totalEarned)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 text-xs">
            <span className="text-slate-400">Total Withdrawn:</span>
            <span className="font-extrabold text-emerald-400">{formatNaira(adminEarnings.withdrawn)}</span>
          </div>
        </div>
      </div>

      {/* Round Completion & Start Next Round Action Banner */}
      {(group.status === 'round_completed' || (members.length > 0 && members.every((m: any) => m.hasPackedThisRound === true))) && (
        <div className="mb-6 rounded-3xl bg-slate-900 p-6 sm:p-7 text-white shadow-lg border border-slate-800">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950 text-xs font-bold text-emerald-300 border border-emerald-800 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Round {group.current_round} Completed</span>
              </div>
              <h3 className="text-xl font-black text-white">All Members Have Successfully Packed! Round {group.current_round} Completed</h3>
              <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                Every member has received their rotating payout for Round {group.current_round}. Members retain their original rotation positions. Click below to launch Round {group.current_round + 1} and open Cycle 1 contributions.
              </p>
            </div>
            <button
              onClick={handleStartNextRound}
              disabled={isStartingNextRound}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#008751] hover:bg-[#007345] text-white font-black text-xs shadow-lg transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isStartingNextRound ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>STARTING ROUND {group.current_round + 1}...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  <span>START ROUND {group.current_round + 1} NOW</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-3 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'overview'
              ? 'border-[#008751] text-[#008751]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Group Overview
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-3 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'members'
              ? 'border-[#008751] text-[#008751]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Members List ({members.length})
        </button>
        <button
          onClick={() => setActiveTab('earnings')}
          className={`px-4 py-3 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'earnings'
              ? 'border-[#008751] text-[#008751]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Commission History ({earningsHistory.length})
        </button>
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-4 py-3 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'withdrawals'
              ? 'border-[#008751] text-[#008751]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Withdrawal History ({withdrawals.length})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-3 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'ledger'
              ? 'border-[#008751] text-[#008751]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Group Ledger ({transactions.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Administrative Overview Detail Box */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 mb-4 uppercase tracking-wider">
              Group Administration Summary
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Total Contributions Collected
                </span>
                <span className="text-xl font-black text-slate-900 block">
                  {formatNaira(data.totalContributionsAmount)}
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Across all active member contributions
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Total Payouts Packed
                </span>
                <span className="text-xl font-black text-emerald-700 block">
                  {formatNaira(data.totalPackedAmount)}
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Disbursed directly to members in rotation
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Packing Fee Split Model
                </span>
                <span className="text-sm font-extrabold text-slate-800 block">
                  Fee: {formatNaira(group.packing_fee || 3000)} per pack
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold mt-1 block">
                  Group Admin: 66.67% ({formatNaira(Number(((group.packing_fee || 3000) - (group.packing_fee || 3000) * 0.3333).toFixed(2)))})
                  <br />
                  Super Admin: 33.33% ({formatNaira(Number(((group.packing_fee || 3000) * 0.3333).toFixed(2)))})
                </span>
              </div>
            </div>
          </div>

          {/* Quick Member Rotation Preview */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Upcoming Rotation Packers
                </h3>
                <p className="text-xs text-slate-500">Next members queued for pack payouts</p>
              </div>
              <button
                onClick={() => setActiveTab('members')}
                className="text-xs font-bold text-[#008751] hover:underline"
              >
                View All Members →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Current Packer */}
              <div className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Current Packer
                  </span>
                  <span className="text-xs font-bold text-emerald-800">Round {group.current_round}</span>
                </div>
                {currentPacker ? (
                  <div>
                    <h4 className="text-base font-black text-slate-900">{currentPacker.full_name}</h4>
                    <p className="text-xs text-slate-600 mt-0.5">Phone: {formatPhone(currentPacker.phone)}</p>
                    <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-emerald-100/80">
                      <span className="text-slate-500 font-medium">Position:</span>
                      <span className="font-extrabold text-slate-900">Position {currentPacker.position}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Status:</span>
                      <span className="font-extrabold text-emerald-700 capitalize">
                        {currentPacker.current_round_status === 'packed' ? 'Packed ✓' : 'Awaiting Pack Now'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-4">No packer active for this round yet.</p>
                )}
              </div>

              {/* Next Packer */}
              <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">
                    Next Packer
                  </span>
                  <span className="text-xs font-bold text-blue-800">Upcoming Turn</span>
                </div>
                {nextPacker ? (
                  <div>
                    <h4 className="text-base font-black text-slate-900">{nextPacker.full_name}</h4>
                    <p className="text-xs text-slate-600 mt-0.5">Phone: {formatPhone(nextPacker.phone)}</p>
                    <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-blue-100/80">
                      <span className="text-slate-500 font-medium">Position:</span>
                      <span className="font-extrabold text-slate-900">Position {nextPacker.position}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Estimated Date:</span>
                      <span className="font-extrabold text-blue-900">{nextPackingDateDisplay || 'Scheduled'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-4">No next packer scheduled in this cycle.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Members List */}
      {activeTab === 'members' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Group Members ({members.length} / {data.totalMembersExpected})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                All registered contributors in rotation order. The group admin is not a contributor.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedMemberForNotify(null);
                  setNotifyRecipientType('all');
                  setNotifyMessage(`Hello, this is a message from the admin of ${group.group_name} on Better Ajo. Please ensure your contribution for Round ${group.current_round} is completed so our rotation proceeds on schedule.`);
                  setShowNotifyModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#E6F3ED] text-[#008751] hover:bg-[#d8ece2] transition cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Notify Members</span>
              </button>
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Group Link</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Pos</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Bank Details</th>
                  <th className="py-3 px-4">Verification</th>
                  <th className="py-3 px-4">Round Contribution</th>
                  <th className="py-3 px-4">Total Contributed</th>
                  <th className="py-3 px-4">Packing Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No members have joined this group yet. Share the code <strong>{group.group_code}</strong> to invite members!
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-slate-800 font-mono text-xs">
                          {m.position}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {m.full_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatPhone(m.phone)}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        {m.bank_name ? `${m.bank_name} • ${m.account_number}` : 'Not provided'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-100">
                          <ShieldCheck className="h-3 w-3 text-[#008751]" />
                          <span>{m.verification_masked || 'Verified'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          m.hasContributed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {m.hasContributed ? 'Paid ✓' : 'Pending'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatNaira(m.totalContributed)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          m.hasPacked
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {m.hasPacked ? 'Packed ✓' : 'Awaiting Turn'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <a
                          href={getWhatsAppLink(m.phone, m.full_name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#008751] font-bold text-[11px] transition"
                          title="Open WhatsApp chat with member"
                        >
                          <Phone className="h-3 w-3" />
                          <span>WhatsApp</span>
                        </a>
                        <button
                          onClick={() => setSelectedMemberDetails(m)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                          title="View member full details"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Commission History */}
      {activeTab === 'earnings' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Group Admin Commission History
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every completed group pack earns you 66.67% of the dynamic packing fee.
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
              Total Commission: {formatNaira(adminEarnings.totalEarned)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Packer Name</th>
                  <th className="py-3 px-4">Packed Amount</th>
                  <th className="py-3 px-4">Packing Fee</th>
                  <th className="py-3 px-4">Super Admin Share (33.33%)</th>
                  <th className="py-3 px-4">Group Admin Share (66.67%)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {earningsHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No packing transactions have occurred yet. Once members pack, your commission will appear here.
                    </td>
                  </tr>
                ) : (
                  earningsHistory.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {new Date(e.date).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {e.member_name} (Pos {e.member_position})
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatNaira(e.packed_amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {formatNaira(e.packing_fee)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {formatNaira(e.super_admin_share)}
                      </td>
                      <td className="py-3 px-4 font-extrabold text-emerald-700">
                        {formatNaira(e.group_admin_share)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {e.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {e.reference}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Withdrawal History */}
      {activeTab === 'withdrawals' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Admin Earnings Withdrawal History
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                History of commission payouts sent to your registered bank account.
              </p>
            </div>
            <button
              onClick={() => setShowWithdrawModal(true)}
              disabled={adminEarnings.available <= 0}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                adminEarnings.available > 0
                  ? 'bg-[#008751] hover:bg-[#007345] text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              New Withdrawal
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Bank Name</th>
                  <th className="py-3 px-4">Account Number</th>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No withdrawals recorded yet.
                    </td>
                  </tr>
                ) : (
                  withdrawals.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {new Date(w.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatNaira(w.amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {w.bank_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {w.account_number}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {w.account_name || group.admin_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          w.status === 'completed' || w.status === 'successful'
                            ? 'bg-emerald-100 text-emerald-800'
                            : w.status === 'processing' || w.status === 'pending'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {w.reference || w.id}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Central Ledger */}
      {activeTab === 'ledger' && (
        <div className="rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Group Central Transaction Ledger
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Unified chronological audit record of all financial events in this group.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Transaction Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Member / User</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No ledger transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(t.created_at).toLocaleString('en-NG')}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.type === 'GROUP_CONTRIBUTION'
                            ? 'bg-emerald-50 text-emerald-800'
                            : t.type === 'GROUP_PACKING'
                            ? 'bg-purple-50 text-purple-800'
                            : 'bg-blue-50 text-blue-800'
                        }`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {t.description}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {t.user_name}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatNaira(t.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {t.reference}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Withdrawal Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-50 text-[#008751] flex items-center justify-center font-bold">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Withdraw Commission</h3>
                  <p className="text-[11px] text-slate-500">Direct Paystack transfer to your bank</p>
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

            <form onSubmit={handleInitiateWithdrawal} className="space-y-4 pt-4">
              {/* Balance Card */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-500 font-medium">Available Balance:</span>
                  <span className="font-black text-slate-900 text-sm">
                    {formatNaira(adminEarnings.available)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Accumulated Total:</span>
                  <span className="font-bold text-slate-600">
                    {formatNaira(adminEarnings.totalEarned)}
                  </span>
                </div>
              </div>

              {/* Registered Bank Account Confirmation */}
              <div className="rounded-2xl bg-emerald-50/60 p-4 border border-emerald-100 text-xs text-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] block mb-1">
                  Destination Bank Account
                </span>
                <div className="font-bold text-slate-900">{adminBankDetails.bank_name || 'Bank Not Set'}</div>
                <div className="font-mono text-slate-600">{adminBankDetails.account_number || 'No Account Number'}</div>
                <div className="text-slate-500 text-[11px] mt-0.5">{adminBankDetails.account_name || group.admin_name}</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Amount to Withdraw (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                    ₦
                  </span>
                  <input
                    type="number"
                    min="100"
                    max={adminEarnings.available}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder={`Max ${adminEarnings.available}`}
                    className="w-full pl-8 pr-20 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(String(adminEarnings.available))}
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
                    <span>Confirm Payout</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Notify Members */}
      {showNotifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-[#E6F3ED] text-[#008751] flex items-center justify-center">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Notify Group Members
                  </h3>
                  <p className="text-xs text-slate-500">
                    {group.group_name} • Code: <strong className="text-slate-800">{group.group_code}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowNotifyModal(false);
                  setSelectedMemberForNotify(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 pt-4">
              {/* Recipient Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Select Recipient(s)
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyRecipientType('all');
                      setSelectedMemberForNotify(null);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      notifyRecipientType === 'all'
                        ? 'border-[#008751] bg-[#E6F3ED] text-[#008751]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>All Members ({members.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyRecipientType('single');
                      if (members.length > 0 && !selectedMemberForNotify) {
                        setSelectedMemberForNotify(members[0]);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      notifyRecipientType === 'single'
                        ? 'border-[#008751] bg-[#E6F3ED] text-[#008751]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Specific Member</span>
                  </button>
                </div>

                {notifyRecipientType === 'single' && (
                  <select
                    value={selectedMemberForNotify?.id || ''}
                    onChange={(e) => {
                      const found = members.find(m => m.id === e.target.value);
                      setSelectedMemberForNotify(found || null);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#008751] bg-white"
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>
                        Pos {m.position}: {m.full_name} ({formatPhone(m.phone)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Quick Template Buttons */}
              <div>
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Quick Message Templates
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNotifyMessage(`Reminder: Round ${group.current_round} contribution of ${formatNaira(group.contribution_amount)} for ${group.group_name} is due. Please pay to keep rotation moving!`)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                  >
                    Due Reminder
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyMessage(`Hello, it is your turn to pack for Round ${group.current_round} in ${group.group_name}! Once all contributions are verified, your payout will be unlocked.`)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                  >
                    Turn to Pack Notice
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyMessage(`Announcement for ${group.group_name}: Thank you for your active participation. Our ${group.cycle_type} rotation is on track.`)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                  >
                    General Announcement
                  </button>
                </div>
              </div>

              {/* Message Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Message Content
                </label>
                <textarea
                  rows={4}
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder="Type your announcement or reminder for your group members..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#008751] focus:ring-1 focus:ring-[#008751]"
                />
              </div>

              {/* WhatsApp Handoff Action Section */}
              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100 p-3.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900 mb-1">
                  <Phone className="h-3.5 w-3.5 text-[#008751]" />
                  <span>WhatsApp Direct Handoff</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed mb-3">
                  This opens WhatsApp directly with the member's registered phone number and your pre-composed message ready to send.
                </p>

                {notifyRecipientType === 'single' && selectedMemberForNotify ? (
                  <a
                    href={getWhatsAppLink(selectedMemberForNotify.phone, selectedMemberForNotify.full_name, notifyMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open WhatsApp for {selectedMemberForNotify.full_name}</span>
                  </a>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-2 rounded-xl bg-white border border-emerald-100 text-xs">
                        <div>
                          <span className="font-bold text-slate-900">Pos {m.position}: {m.full_name}</span>
                          <span className="text-[11px] text-slate-500 ml-2 font-mono">{formatPhone(m.phone)}</span>
                        </div>
                        <a
                          href={getWhatsAppLink(m.phone, m.full_name, notifyMessage)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#008751] text-white font-bold text-[11px] hover:bg-[#007345] transition"
                        >
                          <Phone className="h-3 w-3" />
                          <span>Chat</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNotifyModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSendNotification}
                  disabled={isSendingNotification || !notifyMessage.trim()}
                  className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSendingNotification ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving Log...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Record in Group Log</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Member Details View */}
      {selectedMemberDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-full bg-[#008751] text-white font-bold flex items-center justify-center text-sm">
                  {selectedMemberDetails.full_name?.charAt(0) || 'M'}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {selectedMemberDetails.full_name}
                  </h3>
                  <span className="text-[11px] font-bold text-[#008751] bg-[#E6F3ED] px-2 py-0.5 rounded-full">
                    Position {selectedMemberDetails.position} in Rotation
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedMemberDetails(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
              {/* Phone & Status */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[11px] text-slate-500 font-medium block">Phone Number</span>
                  <span className="font-mono font-bold text-slate-800">{formatPhone(selectedMemberDetails.phone)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-medium block">Membership Status</span>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    <span>Active Member</span>
                  </span>
                </div>
              </div>

              {/* Bank Payout Details */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-500 font-medium block mb-1">Bank Payout Destination</span>
                {selectedMemberDetails.bank_name ? (
                  <div>
                    <div className="font-bold text-slate-900">{selectedMemberDetails.bank_name}</div>
                    <div className="font-mono text-slate-700 font-bold">{selectedMemberDetails.account_number}</div>
                    <div className="text-[11px] text-slate-500">{selectedMemberDetails.full_name}</div>
                  </div>
                ) : (
                  <div className="text-slate-400 italic">No bank payout account provided yet.</div>
                )}
              </div>

              {/* Identity Verification */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-500 font-medium block mb-1">Identity Verification (NDPR Compliant)</span>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#008751]" />
                  <span className="font-bold text-slate-800">
                    {selectedMemberDetails.verification_type ? `${selectedMemberDetails.verification_type}: ` : ''}
                    {selectedMemberDetails.verification_masked || 'Verified ID On File'}
                  </span>
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {selectedMemberDetails.verification_status || 'Verified'}
                  </span>
                </div>
              </div>

              {/* Cycle Contribution & Packing Status */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[11px] text-slate-500 font-medium block">Round Contribution</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                    selectedMemberDetails.hasContributed
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedMemberDetails.hasContributed ? 'Paid ✓' : 'Pending'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-medium block">Packing Status</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                    selectedMemberDetails.hasPacked
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {selectedMemberDetails.hasPacked ? 'Packed ✓' : 'Awaiting Turn'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <a
                  href={getWhatsAppLink(selectedMemberDetails.phone, selectedMemberDetails.full_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>Contact via WhatsApp</span>
                </a>
                <button
                  onClick={() => setSelectedMemberDetails(null)}
                  className="px-5 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
