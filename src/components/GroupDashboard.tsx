import React, { useState, useEffect } from 'react';
import {
  Users,
  Calendar,
  Clock,
  Coins,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Share2,
  ArrowRight,
  RefreshCw,
  Wallet,
  Building,
  Smartphone,
  CreditCard,
  Loader2,
  ChevronRight,
  UserCheck,
  AlertTriangle,
  LogOut,
  Lock
} from 'lucide-react';
import { UserProfile, GroupAjo, GroupMember, Contribution } from '../types/index.js';
import { formatNaira, formatPhone } from '../lib/formatters.js';
import { PaystackModal, PaymentBreakdown } from './PaystackModal.js';
import { OtpModal } from './OtpModal.js';
import { apiRequest } from '../lib/api.js';
import { db } from '../lib/firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface GroupDashboardProps {
  groupId: string;
  currentUser: UserProfile;
  onNavigateHome: () => void;
  onLogout?: () => void;
  onGroupUpdated?: () => void;
  onOpenGroupAdminDashboard?: (groupId: string) => void;
}

export const GroupDashboard: React.FC<GroupDashboardProps> = ({
  groupId,
  currentUser,
  onNavigateHome,
  onLogout,
  onGroupUpdated,
  onOpenGroupAdminDashboard
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Paystack contribution state
  const [paystackContrib, setPaystackContrib] = useState<{
    reference: string;
    authorization_url?: string;
    amount?: number;
    breakdown?: PaymentBreakdown;
  } | null>(null);
  const [isProcessingContrib, setIsProcessingContrib] = useState(false);

  // Pack Now confirmation & OTP state
  const [showPackConfirmModal, setShowPackConfirmModal] = useState(false);
  const [showPackOtpModal, setShowPackOtpModal] = useState(false);
  const [testPackOtp, setTestPackOtp] = useState<string | undefined>();
  const [isPacking, setIsPacking] = useState(false);

  // Commission withdrawal state
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [commissionWithdrawAmount, setCommissionWithdrawAmount] = useState('');
  const [isWithdrawingCommission, setIsWithdrawingCommission] = useState(false);

  // Group Admin Packing Fee Adjustment state
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [newPackingFee, setNewPackingFee] = useState<number>(3000);
  const [isUpdatingFee, setIsUpdatingFee] = useState(false);

  // Copied indicator
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Calendar date state (defaults to real date, can be simulated)
  const [simulatedDate, setSimulatedDate] = useState<string>('');

  const getSimulatedHeaders = () => {
    const headers: Record<string, string> = {
      'x-user-id': currentUser.id
    };
    if (simulatedDate) {
      headers['x-simulated-date'] = simulatedDate;
    }
    return headers;
  };

  const fetchGroupData = async (activeDate?: string) => {
    try {
      setLoading(true);
      setError(null);
      const dateToUse = activeDate !== undefined ? activeDate : simulatedDate;
      const url = `/api/groups/${groupId}/dashboard?userId=${currentUser.id}${dateToUse ? `&simulatedDate=${dateToUse}` : ''}`;
      const json = await apiRequest(url, {
        headers: getSimulatedHeaders()
      });
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error loading group dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupData();
  }, [groupId, currentUser.id, simulatedDate]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Copy Group Code (Admin only)
  const handleCopyCode = () => {
    if (!data?.group?.group_code || data.group.admin_id !== currentUser.id) return;
    navigator.clipboard.writeText(data.group.group_code);
    setCopiedCode(true);
    showToast(`Group code ${data.group.group_code} copied!`);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Copy Join Link (Admin only)
  const handleCopyLink = () => {
    if (!data?.group?.group_code || data.group.admin_id !== currentUser.id) return;
    const link = `${window.location.origin}/?code=${data.group.group_code}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    showToast('Group join link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Pay contribution via Paystack (strictly for the logged-in member themselves)
  const handleInitContribution = async () => {
    if (!data?.userMember) return;
    try {
      setIsProcessingContrib(true);
      const resJson = await apiRequest(`/api/groups/${groupId}/contribute/init`, {
        method: 'POST',
        headers: getSimulatedHeaders(),
        body: JSON.stringify({
          memberId: data.userMember.id,
          userId: currentUser.id,
          simulatedDate: simulatedDate || undefined
        })
      });

      setPaystackContrib(resJson.paystack);
    } catch (err: any) {
      showToast(err.message || 'Payment initiation failed');
    } finally {
      setIsProcessingContrib(false);
    }
  };

  const handleVerifyContribution = async () => {
    if (!paystackContrib || !data?.userMember) return;
    try {
      await apiRequest(`/api/groups/${groupId}/contribute/verify`, {
        method: 'POST',
        headers: getSimulatedHeaders(),
        body: JSON.stringify({
          memberId: data.userMember.id,
          userId: currentUser.id,
          reference: paystackContrib.reference,
          simulatedDate: simulatedDate || undefined
        })
      });

      setPaystackContrib(null);
      showToast('Contribution paid successfully!');
      fetchGroupData();
    } catch (err: any) {
      showToast(err.message || 'Payment verification failed');
      throw err;
    }
  };

  // Pack Now flow
  const handleOpenPackConfirm = () => {
    if (!data) return;
    const userPaid = Boolean(data.members?.find((m: any) => m.id === data.userMember?.id)?.hasContributed);
    const cycleAllPaid = Boolean(data.cycleStatus?.allPaid);
    const isTurn = Boolean(data.currentPacker && data.userMember && data.currentPacker.id === data.userMember.id);
    const hasPackedToday = Boolean(data.hasPackedToday);
    const canPack = Boolean(data.canPackNow ?? (isTurn && cycleAllPaid && userPaid && !hasPackedToday && data.userMember?.current_round_status !== 'packed'));

    if (!canPack) {
      if (hasPackedToday) {
        showToast("Packing for today has already been completed. The next member can pack on the next calendar day.");
      } else if (!userPaid) {
        showToast("Please pay your contribution for today before you can pack.");
      } else if (!cycleAllPaid) {
        showToast("Waiting for all members to complete their contribution before packing can proceed.");
      }
      return;
    }
    setShowPackConfirmModal(true);
  };

  const handleRequestPackOtp = async () => {
    if (!data) return;
    const userPaid = Boolean(data.members?.find((m: any) => m.id === data.userMember?.id)?.hasContributed);
    const cycleAllPaid = Boolean(data.cycleStatus?.allPaid);
    const isTurn = Boolean(data.currentPacker && data.userMember && data.currentPacker.id === data.userMember.id);
    const hasPackedToday = Boolean(data.hasPackedToday);
    const canPack = Boolean(data.canPackNow ?? (isTurn && cycleAllPaid && userPaid && !hasPackedToday && data.userMember?.current_round_status !== 'packed'));

    if (!canPack) {
      if (hasPackedToday) {
        showToast("Packing for today has already been completed. The next member can pack on the next calendar day.");
      } else if (!userPaid) {
        showToast("Please pay your contribution for today before you can pack.");
      } else if (!cycleAllPaid) {
        showToast("Waiting for all members to complete their contribution before packing can proceed.");
      }
      return;
    }

    setShowPackConfirmModal(false);
    setShowPackOtpModal(true);
  };

  const handleConfirmPackWithPassword = async (password: string) => {
    if (!data?.userMember) return;
    try {
      setIsPacking(true);

      // Requirement 2: Save to Firestore FIRST before API / wallet balance update
      try {
        if (db && data?.group) {
          const userName = currentUser.full_name || (currentUser as any).displayName || currentUser.phone || currentUser.email || 'Member';
          const groupName = data.group.group_name || 'Ajo Group';
          const fullAmount = Number((data.group.contribution_amount || 0) * (data.group.total_members || data.members?.length || 1));
          const fee = Number(data.group.packing_fee || 0);
          const netPayout = fullAmount - fee;

          await addDoc(collection(db, 'transactions'), {
            userId: currentUser.id,
            userName,
            userRole: 'member',
            ajoId: groupId,
            ajoName: groupName,
            type: 'withdraw_pack',
            gross_amount: fullAmount,
            fee,
            net_payout: netPayout,
            source: groupName,
            destination: userName,
            timestamp: serverTimestamp(),
            status: 'completed',
            createdAt: new Date().toISOString()
          });
        }
      } catch (fsErr) {
        console.warn('Could not write pack withdrawal document to Firestore transactions:', fsErr);
      }

      const resJson = await apiRequest(`/api/groups/${groupId}/pack`, {
        method: 'POST',
        headers: getSimulatedHeaders(),
        body: JSON.stringify({
          memberId: data.userMember.id,
          password,
          simulatedDate: simulatedDate || undefined
        })
      });

      setShowPackOtpModal(false);
      showToast(resJson.message || 'Pack payout sent to your registered bank account!');
      fetchGroupData();
      if (onGroupUpdated) onGroupUpdated();
    } catch (err: any) {
      throw err;
    } finally {
      setIsPacking(false);
    }
  };

  // Next Round Consent
  const handleSetRoundConsent = async (consent: boolean) => {
    try {
      const resJson = await apiRequest(`/api/groups/${groupId}/round-consent`, {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id, consent })
      });
      showToast(resJson.message);
      fetchGroupData();
    } catch (err: any) {
      showToast(err.message || 'Error updating round preference');
    }
  };

  // Start Next Round (Admin only)
  const handleStartNextRound = async () => {
    try {
      const resJson = await apiRequest(`/api/groups/${groupId}/start-next-round`, {
        method: 'POST',
        body: JSON.stringify({ adminId: currentUser.id })
      });
      showToast(resJson.message);
      fetchGroupData();
    } catch (err: any) {
      showToast(err.message || 'Error starting next round');
    }
  };

  // Withdraw Admin Commission
  const handleWithdrawCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.round(Number(commissionWithdrawAmount));
    if (isNaN(amt) || amt <= 0 || amt > (data?.commission?.available || 0)) {
      showToast('Enter a valid amount within available balance');
      return;
    }

    try {
      setIsWithdrawingCommission(true);
      const resJson = await apiRequest(`/api/groups/${groupId}/withdraw-commission`, {
        method: 'POST',
        body: JSON.stringify({ amount: amt })
      });

      setShowCommissionModal(false);
      showToast(resJson.message);
      fetchGroupData();
    } catch (err: any) {
      showToast(err.message || 'Withdrawal failed');
    } finally {
      setIsWithdrawingCommission(false);
    }
  };

  const handleUpdatePackingFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPackingFee < 0) {
      showToast('Packing fee cannot be negative');
      return;
    }
    if (newPackingFee >= (data?.group?.packing_amount || 0)) {
      showToast('Packing fee must be less than total packing amount');
      return;
    }
    try {
      setIsUpdatingFee(true);
      await apiRequest(`/api/groups/${groupId}/packing-fee`, {
        method: 'PATCH',
        body: JSON.stringify({ packing_fee: newPackingFee, admin_id: currentUser.id })
      });
      setShowFeeModal(false);
      showToast(`Packing fee successfully updated to ₦${newPackingFee.toLocaleString()}`);
      fetchGroupData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update packing fee');
    } finally {
      setIsUpdatingFee(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
        <p className="text-sm font-semibold">Loading Group Better Ajo...</p>
      </div>
    );
  }

  if (error || !data || !data.group) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <div className="rounded-2xl bg-red-50 p-6 border border-red-200">
          <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <h3 className="font-bold text-red-900 text-base">Unable to load group</h3>
          <p className="text-xs text-red-700 mt-1">{error || 'Group details could not be retrieved.'}</p>
          <div className="mt-4 flex gap-3 justify-center">
            <button
              onClick={() => fetchGroupData()}
              className="px-4 py-2 bg-[#008751] text-white text-xs font-bold rounded-xl hover:bg-[#007345] transition cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={onNavigateHome}
              className="px-4 py-2 bg-white text-gray-800 text-xs font-bold rounded-xl border border-gray-200 hover:bg-gray-50 transition cursor-pointer"
            >
              Return to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    group,
    members = [],
    currentPacker,
    nextPacker,
    userMember,
    userStatus,
    commission,
    allPacked,
    hasPackedToday,
    todayPackedMember,
    currentCalendarDate,
    currentCycleNumber,
    cycleInfo
  } = data;
  const isAdmin = Boolean(group?.admin_id && currentUser?.id && group.admin_id === currentUser.id);
  // BUG 3 FIX: Live Calculation on group detail page without reading old 50/50 or decimals from database
  // const totalRounded = Math.round(totalAmount)
  // const packerShare = Math.round(totalRounded * 0.6667)
  // const adminShare = totalRounded - packerShare
  const rawFee = typeof (group as any)?.withdrawalFee === 'number'
    ? (group as any).withdrawalFee
    : (typeof group?.packing_fee === 'number' ? group.packing_fee : 3000);
  const totalRoundedFee = Math.round(rawFee);
  const groupPackingFee = totalRoundedFee;
  const packerShare = Math.round(totalRoundedFee * 0.6667);
  const adminShare = totalRoundedFee - packerShare;
  const memberReceivesAmount = Math.max(0, Math.round(group?.packing_amount || 0) - totalRoundedFee);
  const adminCommissionPerTurn = packerShare;

  const isCycleOpen = cycleInfo ? cycleInfo.isCycleOpen : true;
  const cycleStatus = data.cycleStatus || { totalRequired: group?.member_limit || 10, paidCount: 0, allPaid: false };
  const userContribution = Array.isArray(data.contributions) ? data.contributions.find((c: Contribution) => c.member_id === userMember?.id) : undefined;
  const hasUserContributed = userMember ? Boolean(members?.find((m: any) => m.id === userMember.id)?.hasContributed) : false;
  const isUserTurnToPack = Boolean(currentPacker && userMember && currentPacker.id === userMember.id);
  const canPackNow = Boolean(data?.canPackNow);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-slate-900 border border-slate-800 px-5 py-3 text-white text-xs font-bold shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Breadcrumb & Share Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="inline-flex items-center space-x-2 text-xs font-bold text-[#008751] bg-[#E6F3ED] px-3.5 py-1 rounded-full">
              <Users className="h-3.5 w-3.5" />
              <span>Group Better Ajo • Round {group.current_round}</span>
              {isAdmin && <span className="bg-[#008751] text-white px-2.5 py-0.5 rounded-full text-[10px]">Group Admin</span>}
            </div>

            {/* Calendar Day Indicator (WAT Nigeria) & Day Simulation for testing */}
            <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-2xs">
              <Calendar className="h-3.5 w-3.5 text-[#008751]" />
              <span>
                Today: <strong className="font-mono text-slate-900">{currentCalendarDate || 'Current'}</strong>
              </span>
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {group.group_name}
          </h1>
        </div>

        {/* Top Actions: Admin Invite & Share (Admin ONLY) + Clear LOGOUT Button */}
        <div className="flex items-center space-x-2">
          {isAdmin && (
            <>
              <button
                onClick={handleCopyCode}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-[#008751] text-xs font-bold text-slate-800 transition shadow-xs cursor-pointer"
                title="Copy Group Code"
              >
                <Copy className="h-3.5 w-3.5 text-[#008751]" />
                <span>Code: <strong className="font-mono text-[#008751]">{group.group_code}</strong></span>
              </button>

              <button
                onClick={handleCopyLink}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#008751] hover:bg-[#007345] text-xs font-bold text-white transition shadow-sm cursor-pointer"
                title="Share Join Link"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Link</span>
              </button>
            </>
          )}

          {/* Clearly visible LOGOUT button for Group Member & Admin */}
          <button
            onClick={onLogout || onNavigateHome}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-bold transition shadow-xs cursor-pointer"
            title="Log out and return to homepage"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>LOGOUT</span>
          </button>
        </div>
      </div>

      {/* Main Status & Rotation Queue Hero */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden mb-8">
        {/* Group Admin Access Strip */}
        {isAdmin && (
          <div className="bg-emerald-800 text-white px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-700">
            <div className="flex items-center gap-2 text-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-300 shrink-0" />
              <span>
                You are the <strong>Group Admin</strong>. You earn 66.67% commission ({formatNaira(adminCommissionPerTurn)}) per pack.
              </span>
            </div>
            {onOpenGroupAdminDashboard && (
              <button
                onClick={() => onOpenGroupAdminDashboard(groupId)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white text-[#008751] hover:bg-emerald-50 text-xs font-black shadow-xs transition cursor-pointer self-start sm:self-auto"
              >
                <span>Open Group Admin Dashboard</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Top Summary Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950 p-6 sm:p-8 text-white">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 block">
                Total Packing Amount
              </span>
              <span className="text-2xl sm:text-3xl font-black tracking-tight mt-1 block">
                {formatNaira(group.packing_amount)}
              </span>
              <span className="text-[11px] text-emerald-400">
                {group.member_limit} members × {formatNaira(group.contribution_amount)}
              </span>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 block">
                Contribution Cycle
              </span>
              <span className="text-lg sm:text-xl font-extrabold mt-1 block">
                {group.cycle_type}
              </span>
              <span className="text-[11px] text-emerald-400">
                {formatNaira(group.contribution_amount)} per cycle
              </span>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 block">
                {isAdmin ? 'My Role' : 'My Position'}
              </span>
              <span className="text-lg sm:text-xl font-extrabold mt-1 block">
                {isAdmin
                  ? 'Group Admin'
                  : userMember
                  ? `Position ${userMember.position} of ${group.member_limit}`
                  : 'Contributor Guest'}
              </span>
              <span className="text-[11px] text-emerald-400">
                {isAdmin
                  ? 'Separate from rotation (Organizer)'
                  : 'Determined by join order'}
              </span>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 block">
                {isAdmin ? 'Admin Earning Status' : 'My Turn Status'}
              </span>
              <div className="mt-1.5">
                <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-extrabold ${
                  isAdmin
                    ? 'bg-[#E6F3ED] text-[#008751]'
                    : userMember?.isPacked || userMember?.current_round_status === 'packed'
                    ? 'bg-white/20 text-white'
                    : canPackNow
                    ? 'bg-[#008751] text-white animate-pulse'
                    : isUserTurnToPack
                    ? (!isCycleOpen ? 'bg-blue-100 text-blue-900' : 'bg-amber-100 text-amber-800')
                    : userStatus === 'You are next'
                    ? 'bg-[#E6F3ED] text-[#008751]'
                    : 'bg-emerald-800 text-white'
                }`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>
                    {isAdmin
                      ? `66.67% Commission (${formatNaira(adminCommissionPerTurn)}/turn)`
                      : userMember?.isPacked || userMember?.current_round_status === 'packed'
                      ? '✓ PACKED'
                      : canPackNow
                      ? 'READY TO PACK NOW'
                      : isUserTurnToPack
                      ? (!isCycleOpen ? `YOU ARE NEXT TO PACK • ${cycleInfo?.scheduledPackDateDisplay}` : 'YOUR TURN TO PACK')
                      : userStatus === 'You are next'
                      ? 'YOU ARE NEXT TO PACK'
                      : userStatus}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scheduled Cycle Notice when waiting for next cycle date */}
        {!isCycleOpen && cycleInfo && (
          <div className="px-6 py-3.5 bg-emerald-50/90 border-b border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-950 font-medium">
            <span className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-[#008751] shrink-0" />
              <span>
                Cycle {cycleInfo.cycleNumber - 1} completed. Next contribution & packing cycle ({group.cycle_type}) opens on <strong>{cycleInfo.scheduledPackDateDisplay} ({cycleInfo.scheduledPackDate})</strong>.
              </span>
            </span>
            <span className="text-[11px] font-mono text-[#008751] font-bold bg-white px-2.5 py-1 rounded-md border border-[#008751]/20 self-start sm:self-auto">
              Frequency: {group.cycle_type}
            </span>
          </div>
        )}

        {/* Calendar Day Notice: Has Packed Today */}
        {hasPackedToday && todayPackedMember && (
          <div className="px-6 py-3.5 bg-blue-50/90 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-900 font-medium">
            <span className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>
                Today&apos;s pack has been claimed by <strong>{todayPackedMember.full_name}</strong> (Position {todayPackedMember.position}). The next member will pack on the <strong>next calendar day</strong>.
              </span>
            </span>
            <span className="text-[11px] font-mono text-blue-700 font-bold bg-blue-100/70 px-2.5 py-1 rounded-md self-start sm:self-auto">
              1 Pack Per Calendar Day
            </span>
          </div>
        )}

        {/* Current Packer & Next In Queue */}
        <div className="p-6 bg-slate-50/80 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Current Packer (Round {group.current_round})
              </span>
              {currentPacker ? (
                <div className="flex items-center space-x-2 mt-1">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#008751] text-white">
                    Pos {currentPacker.position}
                  </span>
                  <span className="text-sm font-black text-slate-900">{currentPacker.full_name}</span>
                </div>
              ) : (
                <span className="text-sm font-bold text-[#008751] mt-1 block">
                  Round completed!
                </span>
              )}
            </div>

            {nextPacker && (
              <div className="border-l border-slate-200 pl-6 hidden sm:block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Next To Pack
                </span>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                    Pos {nextPacker.position}
                  </span>
                  <span className="text-sm font-bold text-slate-700">{nextPacker.full_name}</span>
                  {nextPacker.scheduledPackDateDisplay && (
                    <span className="text-[11px] font-bold text-[#008751] bg-[#E6F3ED] px-2 py-0.5 rounded">
                      {nextPacker.scheduledPackDateDisplay}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Cycle Contribution Progress */}
            <div className="border-l border-slate-200 pl-4 sm:pl-6">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                {isCycleOpen ? 'Cycle Contributions' : `Cycle ${cycleInfo?.cycleNumber || 1} Status`}
              </span>
              <div className="flex items-center space-x-2 mt-1">
                {isCycleOpen ? (
                  <>
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-900 text-white">
                      {cycleStatus.paidCount}/{cycleStatus.totalRequired} PAID
                    </span>
                    <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 ${
                      canPackNow
                        ? 'bg-[#E6F3ED] text-[#008751]'
                        : hasPackedToday
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {canPackNow ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-[#008751] animate-pulse" />
                          <span>PACK NOW ACTIVE</span>
                        </>
                      ) : hasPackedToday ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-blue-700" />
                          <span>TODAY&apos;S PACK COMPLETE</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-3 w-3 text-amber-700" />
                          <span>PACK NOW LOCKED</span>
                        </>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#E6F3ED] text-[#008751]">
                      ALL CONTRIBUTIONS COMPLETED
                    </span>
                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded">
                      NEXT: {cycleInfo?.scheduledPackDateDisplay}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Button: Pay Contribution or Pack Now */}
          <div className="flex flex-col sm:flex-row items-end sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
            {userMember && !hasUserContributed && group.status !== 'round_completed' && isCycleOpen && (
              <button
                onClick={() => handleInitContribution()}
                disabled={isProcessingContrib}
                className="flex flex-col items-center justify-center px-6 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-black shadow-md shadow-[#008751]/15 transition disabled:opacity-50 cursor-pointer text-center"
              >
                <div className="flex items-center space-x-1.5 text-xs">
                  <CreditCard className="h-4 w-4" />
                  <span>PAY YOUR CONTRIBUTION TODAY</span>
                </div>
                <span className="text-emerald-200 text-[11px] font-mono font-black mt-0.5">
                  {formatNaira(group.contribution_amount)} (+ ₦60 fee)
                </span>
              </button>
            )}

            {userMember && hasUserContributed && (
              <div className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-[#E6F3ED] text-[#008751] font-bold text-xs border border-[#008751]/20">
                <CheckCircle2 className="h-4 w-4 text-[#008751]" />
                <span>✓ CONTRIBUTION PAID</span>
              </div>
            )}

            {isUserTurnToPack && userMember?.current_round_status !== 'packed' && !userMember?.isPacked && group.status !== 'round_completed' && (
              canPackNow ? (
                <button
                  onClick={handleOpenPackConfirm}
                  className="flex items-center space-x-2 px-6 py-3.5 rounded-xl bg-[#008751] hover:bg-[#007043] text-white font-black text-sm shadow-lg shadow-[#008751]/30 active:scale-95 transition cursor-pointer animate-pulse"
                >
                  <Coins className="h-5 w-5" />
                  <span>PACK NOW</span>
                </button>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center space-x-1.5 text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100/90 px-2.5 py-0.5 rounded-md border border-amber-200">
                    <Lock className="h-3 w-3 text-amber-700" />
                    <span>YOUR TURN TO PACK • WAITING FOR ALL CONTRIBUTIONS</span>
                  </div>
                  <button
                    disabled
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-slate-200 text-slate-500 font-bold text-xs cursor-not-allowed border border-slate-300"
                    title={
                      !hasUserContributed
                        ? "Please pay your contribution before packing"
                        : !cycleStatus.allPaid
                        ? `Waiting for all members to contribute (${cycleStatus.paidCount}/${cycleStatus.totalRequired} paid)`
                        : !isCycleOpen
                        ? `Packing opens on ${cycleInfo?.scheduledPackDateDisplay}`
                        : "Packing is locked"
                    }
                  >
                    <Lock className="h-4 w-4 text-slate-400" />
                    <span>PACK NOW (INACTIVE)</span>
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        {/* Member Action Alerts */}
        {userMember && !hasUserContributed && group.status !== 'round_completed' && isCycleOpen && (
          <div className="px-6 py-3.5 bg-amber-50/80 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900 font-medium">
            <span>Your contribution of <strong>{formatNaira(group.contribution_amount)}</strong> for Round {group.current_round} is currently <strong>Pending</strong>.</span>
            <button
              onClick={handleInitContribution}
              className="text-xs font-bold text-amber-950 underline hover:text-black cursor-pointer self-start sm:self-auto"
            >
              PAY YOUR CONTRIBUTION TODAY
            </button>
          </div>
        )}
      </div>

      {/* Dedicated Group Member Contribution Section */}
      <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 shadow-sm mb-8">
        {userMember ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="flex items-center space-x-2 mb-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Group Member Contribution
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  • Round {group.current_round} ({group.cycle_type})
                </span>
              </div>

              {!isCycleOpen ? (
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    NEXT CONTRIBUTION
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1 font-mono">
                    {cycleInfo?.scheduledPackDateDisplay}
                  </div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-3">
                    NEXT PACKING
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-[#008751] tracking-tight mt-0.5 font-mono">
                    {cycleInfo?.scheduledPackDateDisplay}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Cycle {cycleInfo?.cycleNumber ? cycleInfo.cycleNumber - 1 : 1} completed. The next contribution of <strong>{formatNaira(group.contribution_amount)}</strong> will open on <strong>{cycleInfo?.scheduledPackDateDisplay}</strong> according to the <strong>{group.cycle_type}</strong> group frequency.
                  </p>
                </div>
              ) : !hasUserContributed ? (
                <div>
                  <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                    YOUR CONTRIBUTION TODAY
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight mt-1">
                    {formatNaira(group.contribution_amount)}
                  </div>
                  <p className="text-xs text-amber-800 font-medium mt-1.5 flex items-center space-x-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>Your required contribution for the current cycle has not been paid.</span>
                  </p>
                </div>
              ) : (
                <div>
                  <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#E6F3ED] text-[#008751] font-black text-sm mb-1.5">
                    <CheckCircle2 className="h-4 w-4 text-[#008751]" />
                    <span>✓ CONTRIBUTION PAID</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                    {formatNaira(group.contribution_amount)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Verified on server • Confirmed for Round {group.current_round} rotation pool.
                    {userContribution?.paid_at && (
                      <span className="block text-[11px] text-slate-400 font-mono mt-0.5">
                        Paid on {new Date(userContribution.paid_at).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center">
              {!isCycleOpen ? (
                <div className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span>Next Cycle: {cycleInfo?.scheduledPackDateDisplay}</span>
                </div>
              ) : !hasUserContributed ? (
                <button
                  onClick={() => handleInitContribution()}
                  disabled={isProcessingContrib || group.status === 'round_completed'}
                  className="w-full sm:w-auto flex flex-col items-center justify-center px-8 py-4 rounded-2xl bg-[#008751] hover:bg-[#007345] active:scale-[0.98] text-white font-black text-sm sm:text-base shadow-lg shadow-[#008751]/20 transition disabled:opacity-50 cursor-pointer text-center"
                >
                  {isProcessingContrib ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Connecting to Paystack...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center space-x-2">
                        <CreditCard className="h-5 w-5" />
                        <span>PAY YOUR CONTRIBUTION TODAY</span>
                      </div>
                      <span className="text-emerald-200 font-mono text-xs sm:text-sm font-bold mt-0.5">
                        {formatNaira(group.contribution_amount)}
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-[#E6F3ED] border border-[#008751]/30 text-[#008751] text-xs font-bold">
                  <CheckCircle2 className="h-4 w-4 text-[#008751]" />
                  <span>Contribution Complete for this Cycle</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="flex items-center space-x-2 mb-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Group Contribution Overview
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  • Round {group.current_round} ({group.cycle_type})
                </span>
              </div>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                {isCycleOpen ? "CURRENT CONTRIBUTION CYCLE IS OPEN" : "NEXT CYCLE SCHEDULED"}
              </div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight mt-1">
                {formatNaira(group.contribution_amount)}
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                {isCycleOpen
                  ? `${cycleStatus.paidCount} of ${cycleStatus.totalRequired} members have contributed for this cycle.`
                  : `Next contribution and packing cycle opens on ${cycleInfo?.scheduledPackDateDisplay} according to the ${group.cycle_type} group frequency.`}
              </p>
            </div>
            <div className="flex items-center">
              {!isCycleOpen ? (
                <div className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span>Next Cycle: {cycleInfo?.scheduledPackDateDisplay}</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-[#E6F3ED] border border-[#008751]/30 text-[#008751] text-xs font-bold">
                  <Clock className="h-4 w-4 text-[#008751]" />
                  <span>{cycleStatus.paidCount}/{cycleStatus.totalRequired} Paid for Cycle {cycleInfo?.cycleNumber}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Financial Breakdown (Contribution, Members, Packing Amount, Packing Fee, Member Receives) */}
      <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm mb-8">
        <div className="text-xs font-bold uppercase tracking-wider text-[#008751] mb-4 flex items-center justify-between">
          <span>Group Financial Breakdown</span>
          <span className="text-[11px] font-semibold text-slate-500 lowercase">per packing cycle</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[11px] font-bold uppercase text-slate-500 block">Contribution</span>
            <span className="text-base sm:text-lg font-black text-slate-900 font-mono mt-0.5 block">
              {formatNaira(group.contribution_amount)}
            </span>
            <span className="text-[10px] text-slate-400">per member</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[11px] font-bold uppercase text-slate-500 block">Members</span>
            <span className="text-base sm:text-lg font-black text-slate-900 font-mono mt-0.5 block">
              {group.member_limit}
            </span>
            <span className="text-[10px] text-slate-400">{members.length} registered</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[11px] font-bold uppercase text-slate-500 block">Packing Amount</span>
            <span className="text-base sm:text-lg font-black text-slate-900 font-mono mt-0.5 block">
              {formatNaira(group.packing_amount)}
            </span>
            <span className="text-[10px] text-slate-400">total rotation pool</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-100 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-rose-600 block">Packing Fee</span>
              {isAdmin && (
                <button
                  onClick={() => {
                    setNewPackingFee(groupPackingFee);
                    setShowFeeModal(true);
                  }}
                  className="text-[10px] text-rose-700 hover:text-rose-900 font-bold underline cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>
            <span className="text-base sm:text-lg font-black text-rose-700 font-mono mt-0.5 block">
              {formatNaira(groupPackingFee)}
            </span>
            <span className="text-[10px] text-rose-500">deduction on payout</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#E6F3ED] border border-[#008751]/20 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold uppercase text-[#008751] block">Member Receives</span>
            <span className="text-base sm:text-lg font-black text-[#008751] font-mono mt-0.5 block">
              {formatNaira(memberReceivesAmount)}
            </span>
            <span className="text-[10px] text-[#008751]">net lump sum payout</span>
          </div>
        </div>
      </div>

      {/* Round Completion & Start Second Round View (Prompt Section 29-33) */}
      {(group.status === 'round_completed' || (members.length > 0 && members.every((m: any) => m.hasPackedThisRound === true))) && (
        <div className="mb-8 rounded-3xl bg-slate-900 p-6 sm:p-8 text-white shadow-lg border border-slate-800">
          <div className="max-w-2xl">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-950 text-xs font-bold text-emerald-300 border border-emerald-800 mb-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Round {group.current_round} Successfully Completed!</span>
            </span>
            <h2 className="text-2xl sm:text-3xl font-black mb-2">
              All Members Have Successfully Packed! Round {group.current_round} Completed
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mb-6 leading-relaxed">
              Every member in this group has received their rotating payout. The group does not start another round automatically — members choose whether they want to continue into the next round.
            </p>

            {/* Member Choice */}
            {userMember && userMember.status === 'active' && (
              <div className="bg-slate-950/70 p-5 rounded-2xl border border-slate-800 mb-6">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2.5">
                  Your Participation For Round {group.current_round + 1}:
                </div>
                {userMember.next_round_consent === undefined ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleSetRoundConsent(true)}
                      className="flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-[#008751] text-white font-black text-xs hover:bg-[#007345] transition shadow-md cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>START ROUND {group.current_round + 1} (CONTINUE)</span>
                    </button>
                    <button
                      onClick={() => handleSetRoundConsent(false)}
                      className="flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition cursor-pointer"
                    >
                      <span>I Do Not Wish to Continue</span>
                    </button>
                  </div>
                ) : userMember.next_round_consent ? (
                  <div className="text-xs text-emerald-300 font-bold flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>You chose to continue! You retain your Position {userMember.position} with ₦0 fees.</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 font-medium">
                    You chose not to continue. Your position has been released for a replacement member.
                  </div>
                )}
              </div>
            )}

            {/* Group Admin Next Round Launch */}
            {isAdmin && (
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="text-xs text-slate-300">
                  <span>Members confirmed: </span>
                  <strong className="text-white font-mono">
                    {members.filter((m: GroupMember) => m.next_round_consent !== false).length} / {group.member_limit}
                  </strong>
                </div>
                <button
                  onClick={handleStartNextRound}
                  className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-black text-xs shadow-md transition cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>START ROUND {group.current_round + 1} NOW</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Group Admin Commission Card (Prompt Section 35 & 36) */}
      {isAdmin && (
        <div className="mb-8 rounded-3xl bg-white border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#008751]">
                Group Admin Commission
              </span>
              <span className="text-[10px] bg-[#E6F3ED] text-[#008751] font-bold px-2.5 py-0.5 rounded-full">
                66.67% of each {formatNaira(groupPackingFee)} fee ({formatNaira(adminCommissionPerTurn)} per packed turn)
              </span>
            </div>
            <div className="flex items-baseline space-x-5 mt-2.5">
              <div>
                <span className="text-xs text-slate-500">Available to Withdraw:</span>
                <div className="text-xl font-black text-[#008751] font-mono">
                  {formatNaira(commission?.available || 0)}
                </div>
              </div>
              <div className="border-l border-slate-200 pl-5">
                <span className="text-xs text-slate-500">Total Earned:</span>
                <div className="text-sm font-bold text-slate-700 font-mono">
                  {formatNaira(commission?.total || 0)}
                </div>
              </div>
              <div className="border-l border-slate-200 pl-5">
                <span className="text-xs text-slate-500">Withdrawn:</span>
                <div className="text-sm font-bold text-slate-700 font-mono">
                  {formatNaira(commission?.withdrawn || 0)}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowCommissionModal(true)}
            disabled={(commission?.available || 0) <= 0}
            className="flex items-center justify-center space-x-1.5 px-5 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs transition shadow-md shadow-[#008751]/15 disabled:opacity-50 cursor-pointer"
          >
            <Wallet className="h-4 w-4" />
            <span>WITHDRAW COMMISSION</span>
          </button>
        </div>
      )}

      {/* Member List & Contribution Status Table (Prompt Section 23 & 38) */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-900 text-base">
              Group Rotation Queue & Contribution Tracking
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict join order defines each member's packing turn in every cycle.
            </p>
          </div>
          <div className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl">
            {members.length} / {group.member_limit} Members
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Position</th>
                <th className="py-3.5 px-4">Member</th>
                <th className="py-3.5 px-4">Contribution</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Rotation Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m: any) => {
                const isPacker = currentPacker?.id === m.id;
                const isUser = m.user_id === currentUser.id;
                return (
                  <tr
                    key={m.id}
                    className={`transition ${isUser ? 'bg-[#E6F3ED]/30 font-semibold' : 'hover:bg-slate-50/50'}`}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs ${
                        isPacker
                          ? 'bg-[#008751] text-white font-black'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {m.position}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-900 font-bold">{m.full_name}</span>
                        {isUser && (
                          <span className="text-[10px] bg-[#E6F3ED] text-[#008751] px-2 py-0.5 rounded font-bold">
                            You
                          </span>
                        )}
                        {group.admin_id === m.user_id && (
                          <span className="text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded font-medium">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      {formatNaira(group.contribution_amount)}
                    </td>
                    <td className="py-3.5 px-4">
                      {m.hasContributed ? (
                        <span className="inline-flex items-center space-x-1 text-[#008751] font-bold bg-[#E6F3ED] px-2.5 py-1 rounded-md text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#008751]" />
                          <span>✓ PAID</span>
                        </span>
                      ) : isCycleOpen ? (
                        <span className="inline-flex items-center space-x-1 text-amber-800 font-bold bg-amber-50 border border-amber-200/60 px-2.5 py-1 rounded-md text-xs">
                          <Clock className="h-3.5 w-3.5 text-amber-600" />
                          <span>WAITING FOR PAYMENT</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-md text-xs">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>OPENS {cycleInfo?.scheduledPackDateDisplay}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {m.isPacked || m.current_round_status === 'packed' ? (
                        <span className="inline-flex items-center space-x-1 text-slate-700 font-bold bg-slate-100 px-2.5 py-1 rounded-md">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#008751]" />
                          <span>✓ Packed{m.scheduledPackDateDisplay ? ` (${m.scheduledPackDateDisplay})` : ''}</span>
                        </span>
                      ) : isPacker ? (
                        canPackNow ? (
                          <span className="text-[#008751] font-black flex items-center space-x-1 bg-[#E6F3ED] px-2.5 py-1 rounded-md">
                            <span className="h-2 w-2 rounded-full bg-[#008751] animate-pulse" />
                            <span>Pack Now (Ready)</span>
                          </span>
                        ) : !isCycleOpen ? (
                          <span className="text-blue-800 font-bold flex items-center space-x-1 bg-blue-50 px-2.5 py-1 rounded-md">
                            <Clock className="h-3.5 w-3.5 text-blue-600" />
                            <span>Next: {m.scheduledPackDateDisplay || cycleInfo?.scheduledPackDateDisplay}</span>
                          </span>
                        ) : (
                          <span className="text-amber-800 font-bold flex items-center space-x-1 bg-amber-50 px-2.5 py-1 rounded-md">
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            <span>Packing Turn (Waiting)</span>
                          </span>
                        )
                      ) : (
                        <span className="text-slate-500 font-medium">
                          {m.scheduledPackDateDisplay ? `In Queue (${m.scheduledPackDateDisplay})` : `In Queue (Pos ${m.position})`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Vacant slots indication */}
              {Array.from({ length: Math.max(0, group.member_limit - members.length) }).map((_, i) => (
                <tr key={`vacant-${i}`} className="bg-slate-50/20 text-slate-400">
                  <td className="py-3.5 px-4 font-mono">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-slate-400 text-xs">
                      {members.length + i + 1}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 italic">Available Vacant Position</td>
                  <td className="py-3.5 px-4 font-mono">{formatNaira(group.contribution_amount)}</td>
                  <td className="py-3.5 px-4">-</td>
                  <td className="py-3.5 px-4 text-[11px]">
                    {isAdmin ? (
                      <button
                        onClick={handleCopyLink}
                        className="text-[#008751] font-bold hover:underline cursor-pointer"
                      >
                        Invite Replacement
                      </button>
                    ) : (
                      <span className="text-slate-400">Open Slot</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paystack Contribution Modal */}
      {paystackContrib && (
        <PaystackModal
          isOpen={true}
          onClose={() => setPaystackContrib(null)}
          reference={paystackContrib.reference}
          amount={paystackContrib.amount || (group.contribution_amount + 60)}
          purpose={`Group Contribution: ${group.group_name} (Round ${group.current_round})`}
          breakdown={paystackContrib.breakdown || {
            baseAmount: group.contribution_amount,
            baseLabel: 'Contribution Amount',
            feeAmount: 60,
            feeLabel: 'Transaction Fee',
            totalAmount: group.contribution_amount + 60
          }}
          authorizationUrl={paystackContrib.authorization_url}
          onVerified={handleVerifyContribution}
        />
      )}

      {/* PACK NOW Confirmation Modal with strict ₦3,000 fee breakdown (Prompt Section 24 & 26) */}
      {showPackConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="flex items-center space-x-2 text-[#008751] mb-3">
              <Coins className="h-6 w-6" />
              <h3 className="font-black text-slate-900 text-lg">Confirm Pack Payout</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              It is your turn in the rotation! Confirm your lump sum payout breakdown:
            </p>

            {/* Calculations Breakdown */}
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 space-y-2.5 text-xs mb-4">
              <div className="flex justify-between text-slate-600">
                <span>Packing Amount:</span>
                <span className="font-extrabold text-slate-900">{formatNaira(group.packing_amount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Packing Fee:</span>
                <span className="font-extrabold text-rose-600">- {formatNaira(groupPackingFee)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2.5 flex justify-between text-base font-black text-slate-900">
                <span>Amount You Receive:</span>
                <span className="text-[#008751] font-mono">{formatNaira(memberReceivesAmount)}</span>
              </div>
            </div>

            {/* Bank Account Details locked as required by prompt Section 28 */}
            <div className="rounded-2xl bg-[#E6F3ED]/70 p-3.5 text-[11px] text-slate-800 mb-6 border border-[#008751]/20">
              <span className="font-bold text-[#008751] block mb-1">Payout Destination (Locked Account):</span>
              <div className="font-mono text-xs font-bold text-slate-900">
                {currentUser.bank_name} • {currentUser.account_number}
              </div>
              <div className="text-slate-500 text-[10px] mt-0.5">
                Recipient: {currentUser.full_name}
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowPackConfirmModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestPackOtp}
                disabled={isPacking}
                className="flex-1 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white text-xs font-black shadow-lg shadow-[#008751]/20 transition disabled:opacity-50 cursor-pointer"
              >
                {isPacking ? 'Processing...' : 'CONFIRM PACK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Packing Password Authorization Modal */}
      <OtpModal
        isOpen={showPackOtpModal}
        onClose={() => setShowPackOtpModal(false)}
        title="Authorize Packing Payout"
        amountDisplay={formatNaira(memberReceivesAmount)}
        description={`Enter your login password to authorize transfer of ${formatNaira(memberReceivesAmount)}`}
        onSuccess={handleConfirmPackWithPassword}
      />

      {/* Group Admin Commission Withdrawal Modal */}
      {showCommissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100">
            <h3 className="font-black text-slate-900 text-base mb-1.5">Withdraw Admin Commission</h3>
            <p className="text-xs text-slate-500 mb-4">
              Transferred directly to your saved bank account ({currentUser.bank_name} - {currentUser.account_number}).
            </p>

            <form onSubmit={handleWithdrawCommission} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Amount to Withdraw (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₦</span>
                  <input
                    type="number"
                    min={100}
                    max={commission?.available || 0}
                    required
                    value={commissionWithdrawAmount}
                    onChange={(e) => setCommissionWithdrawAmount(e.target.value)}
                    placeholder="e.g. 4000"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] text-sm font-bold font-mono outline-none text-slate-900 transition"
                  />
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Available: {formatNaira(commission?.available || 0)}
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCommissionModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWithdrawingCommission || !commissionWithdrawAmount}
                  className="flex-1 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white text-xs font-bold shadow-lg shadow-[#008751]/20 transition disabled:opacity-50 cursor-pointer"
                >
                  {isWithdrawingCommission ? 'Processing...' : 'Transfer Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Group Admin Packing Fee Adjustment Modal */}
      {showFeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-100">
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Adjust Group Packing Fee
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              As Group Admin, you can set or adjust the custom deduction deducted from each member's packing amount when they pack.
            </p>

            <form onSubmit={handleUpdatePackingFee} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Packing Fee / Deduction (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₦</span>
                  <input
                    type="number"
                    min={0}
                    max={group.packing_amount - 100}
                    step={100}
                    required
                    value={newPackingFee}
                    onChange={(e) => setNewPackingFee(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] text-sm font-bold font-mono outline-none text-slate-900 transition"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[500, 1000, 2000, 3000, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewPackingFee(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                        newPackingFee === preset
                          ? 'bg-[#008751] text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      ₦{preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-[#E6F3ED] p-3 text-xs text-[#008751] font-medium space-y-1">
                <div>Member receives: <strong>{formatNaira(Math.max(0, group.packing_amount - newPackingFee))}</strong></div>
                <div>Admin commission (66.67%): <strong>{formatNaira(Number((newPackingFee * 0.6667).toFixed(2)))}</strong></div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFeeModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingFee}
                  className="flex-1 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white text-xs font-bold shadow-lg shadow-[#008751]/20 transition disabled:opacity-50 cursor-pointer"
                >
                  {isUpdatingFee ? 'Saving...' : 'Save Packing Fee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
