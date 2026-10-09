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
  LogOut,
  UserPlus,
  Edit3,
  PlusCircle,
  Coins
} from 'lucide-react';
import { GroupAdminDashboardData, GroupAdminMemberItem, UserProfile } from '../types/index.js';
import { formatNaira, formatPhone, NIGERIAN_BANKS } from '../lib/formatters.js';
import { db, auth } from '../lib/firebase.js';
import { collection, addDoc, setDoc, deleteDoc, serverTimestamp, query, where, onSnapshot, doc, getDocs, getDoc, updateDoc, Timestamp, runTransaction, increment } from 'firebase/firestore';

interface GroupAdminDashboardProps {
  groupId: string;
  currentUser: UserProfile;
  onBack: () => void;
  onLogout?: () => void;
  onOpenGroupView?: () => void;
  onCreateNewGroup?: () => void;
  onSwitchGroup?: (groupId: string) => void;
}

export const GroupAdminDashboard: React.FC<GroupAdminDashboardProps> = ({
  groupId,
  currentUser,
  onBack,
  onLogout,
  onOpenGroupView,
  onCreateNewGroup,
  onSwitchGroup
}) => {
  const [data, setData] = useState<GroupAdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [adminGroups, setAdminGroups] = useState<any[]>([]);

  // Real-time hooks / collections for Group Admin available commission
  const [platformCommissions, setPlatformCommissions] = useState<any[]>([]);
  const [platformWithdrawals, setPlatformWithdrawals] = useState<any[]>([]);

  // Payment Simulation State (Test Moniepoint payments)
  const [simulatingMember, setSimulatingMember] = useState<GroupAdminMemberItem | null>(null);
  const [simulateAmount, setSimulateAmount] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);

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

  // Edit Member State (Ability to edit member later if needed)
  const [editingMember, setEditingMember] = useState<GroupAdminMemberItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAccount, setEditAccount] = useState('');
  const [editBank, setEditBank] = useState('Moniepoint MFB');
  const [isUpdatingMember, setIsUpdatingMember] = useState(false);
  const [editMemberError, setEditMemberError] = useState<string | null>(null);
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);
  const [copiedVaNumId, setCopiedVaNumId] = useState<string | null>(null);
  const [copiedVaNameId, setCopiedVaNameId] = useState<string | null>(null);

  const [isProcessingPack, setIsProcessingPack] = useState(false);

  const openSimulateModal = (m: GroupAdminMemberItem) => {
    setSimulatingMember(m);
    const req = Number(data?.group?.contribution_amount || 20000);
    const curRound = Number(data?.group?.current_round || 1);
    const contribs = Array.isArray(data?.contributions) ? data.contributions : [];
    const paidForRound = contribs
      .filter((c: any) =>
        (c.member_id === m.id || c.memberId === m.id) &&
        (c.round_number === curRound || c.round === curRound) &&
        !c.is_pay_ahead &&
        !c.isPayAhead
      )
      .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
    const credit = Number(m.creditBalance ?? m.credit_balance ?? 0);
    const totalEffective = paidForRound + credit;
    const remaining = Math.max(0, req - totalEffective);
    const isFullyPaid = totalEffective >= req;

    // If fully paid, default to req for pay-ahead. If partially paid, default to remaining balance. If unpaid, default to req.
    const defaultAmount = isFullyPaid ? req : (remaining > 0 ? remaining : req);
    setSimulateAmount(defaultAmount.toString());
    setSimulateError(null);
  };

  const handleAdminPackCurrentMember = async () => {
    try {
      setIsProcessingPack(true);
      const groupSnap = await getDoc(doc(db, 'groups', groupId)).catch(() => null);
      const groupData = groupSnap?.data() || (data?.group as any) || {};
      const currentMems = groupData.members || members || [];
      const currentPackingOrder = Number(groupData.currentPackingOrder || 1);

      const packingMember = currentMems.find((m: any) => Number(m.position || m.packingOrder || m.packing_position || 1) === currentPackingOrder) || currentMems[0] || data?.currentPacker;
      if (!packingMember) {
        showToast('No member found to pack');
        return;
      }

      const packingMemberName = packingMember.full_name || packingMember.name || 'Member';
      const grpName = groupData.name || groupData.group_name || (data?.group as any)?.name || data?.group?.group_name || 'AJO GROUP';
      const totalPack = Number(groupData.totalPackAmount || groupData.packing_amount || (Number(groupData.contributionAmount || groupData.contribution_amount || 50000) * (currentMems.length || 5)));
      const cycleDays = Number(groupData.packingIntervalDays || groupData.contributionFrequencyDays || (groupData.cycle_type ? parseInt(groupData.cycle_type.replace(/\D/g, ''), 10) : 3)) || 3;
      const nextPackDate = new Date();
      nextPackDate.setDate(nextPackDate.getDate() + cycleDays);

      const packingFee = Number(groupData.packingFee || groupData.packing_fee || groupData.packFee || 4000);
      const adminShare = Math.round(packingFee * (2 / 3)); // 2667 for 4000, 2000 for 3000
      const superAdminShare = packingFee - adminShare; // 1333 for 4000, 1000 for 3000
      const adminId = groupData.creatorId || groupData.adminId || groupData.admin_id || currentUser.id;
      const curRound = Number(groupData.current_round || groupData.currentRound || 1);

      await fetch(`/api/groups/${groupId}/pack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          memberId: packingMember.id
        })
      }).catch(() => null);

      // a) group_admin_earnings collection
      await addDoc(collection(db, 'group_admin_earnings'), {
        groupId: groupId,
        group_id: groupId,
        adminId: adminId,
        amount: adminShare,
        type: 'packing_fee',
        groupName: grpName,
        round: curRound,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      // b) super_admin_revenue collection (Stream 3)
      await addDoc(collection(db, 'super_admin_revenue'), {
        groupId: groupId,
        group_id: groupId,
        amount: superAdminShare,
        type: 'packing_share_33_33',
        groupName: grpName,
        round: curRound,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      // c) packing_payouts collection
      await addDoc(collection(db, 'packing_payouts'), {
        groupId: groupId,
        group_id: groupId,
        groupName: grpName,
        amount: totalPack,
        beneficiary: packingMemberName,
        beneficiaryId: packingMember.id,
        fee: packingFee,
        status: 'packed',
        round: curRound,
        packingOrder: currentPackingOrder,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      // Update platformRevenue/main directly
      await runTransaction(db, async (t) => {
        const revRef = doc(db, 'platformRevenue', 'main');
        const revDoc = await t.get(revRef);
        if (revDoc.exists()) {
          t.update(revRef, {
            stream3: increment(superAdminShare),
            totalGross: increment(superAdminShare),
            unifiedAvailable: increment(superAdminShare),
            lastUpdated: serverTimestamp()
          });
        } else {
          t.set(revRef, {
            stream1: 0,
            stream2: 0,
            stream3: superAdminShare,
            stream4: 0,
            totalGross: superAdminShare,
            totalWithdrawn: 0,
            unifiedAvailable: superAdminShare,
            lastUpdated: serverTimestamp()
          });
        }
      }).catch(err => console.warn('[PlatformRevenue stream3 error]:', err));

      const updatedMembersAfterPack = currentMems.map((m: any) => {
        if (m.id === packingMember.id || m.position === packingMember.position) {
          return { ...m, hasPackedThisRound: true, hasPacked: true, current_round_status: 'packed' };
        }
        return m;
      });

      await updateDoc(doc(db, 'groups', groupId), {
        packingStatus: 'PACKED',
        currentPackingOrder: currentPackingOrder + 1,
        totalPackedAmount: (Number(groupData.totalPackedAmount) || 0) + totalPack,
        members: updatedMembersAfterPack
      }).catch(() => {});

      showToast(`Packing completed for ${packingMemberName}! Next pack in ${cycleDays} days.`);
      fetchDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Error processing packing');
    } finally {
      setIsProcessingPack(false);
    }
  };

  const handleSimulatePayment = async (member: GroupAdminMemberItem, customAmount?: number) => {
    try {
      const groupDocSnap = await getDoc(doc(db, 'groups', groupId)).catch(() => null);
      const groupData = groupDocSnap?.data();
      const groupName = groupData?.name || groupData?.group_name || (data?.group as any)?.name || data?.group?.group_name || 'AJO GROUP';
      const contributionAmount = customAmount || Number(groupData?.contributionAmount || groupData?.contribution_amount || data?.group?.contribution_amount) || 50000;
      const platformFee = 60;
      const totalAmount = contributionAmount + platformFee;
      const memberName = member.full_name || (member as any).name || 'Member';
      const curRound = Number(groupData?.current_round || groupData?.currentRound || data?.group?.current_round || 1);

      const contributionId = `${groupId}_${member.id}_round${curRound}`;
      const existing = await getDoc(doc(db, 'contributions', contributionId)).catch(() => null);
      if (existing && existing.exists()) {
        showToast(`Contribution already recorded for ${memberName} in round ${curRound}`);
        return;
      }

      if (db) {
        // Write ONLY to contributions collection as SINGLE SOURCE OF TRUTH (no duplicate write!)
        await setDoc(doc(db, 'contributions', contributionId), {
          groupId: groupId,
          group_id: groupId,
          groupName: groupName,
          ajoName: groupName,
          memberId: member.id,
          member_id: member.id,
          memberName: memberName,
          userName: memberName,
          contributionAmount: contributionAmount, // e.g. 50,000 pot
          fee: platformFee, // 60 fee
          net: contributionAmount, // 50,000
          total: totalAmount, // 50,060 what user paid
          amount: totalAmount, // Display ₦50,060 single amount
          gross_amount: totalAmount,
          round: curRound,
          round_number: curRound,
          type: 'group_contribution',
          source: 'group_contribution',
          status: 'success',
          createdAt: serverTimestamp(),
          timestamp: serverTimestamp()
        }).catch((err) => console.warn('[SetDoc contribution warn]:', err));

        // Increment Stream 2 atomically in platformRevenue/main
        await runTransaction(db, async (t) => {
          const revRef = doc(db, 'platformRevenue', 'main');
          const revSnap = await t.get(revRef);
          if (revSnap.exists()) {
            t.update(revRef, {
              stream2: increment(platformFee),
              totalGross: increment(platformFee),
              unifiedAvailable: increment(platformFee),
              lastUpdated: serverTimestamp()
            });
          } else {
            t.set(revRef, {
              stream1: 0,
              stream2: platformFee,
              stream3: 0,
              stream4: 0,
              totalGross: platformFee,
              totalWithdrawn: 0,
              unifiedAvailable: platformFee,
              lastUpdated: serverTimestamp()
            });
          }
        }).catch((err) => console.warn('[PlatformRevenue stream2 update warn]:', err));
      }
    } catch (e) {
      console.warn('[handleSimulatePayment error]:', e);
    }
  };

  const handleConfirmSimulatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatingMember) return;

    const currentGroupName = (data?.group as any)?.name || data?.group?.group_name || 'AJO GROUP';
    const baseContrib = Number((data?.group as any)?.contributionAmount || data?.group?.contribution_amount || 50000);
    const totalToPay = baseContrib + 60;
    const memberName = simulatingMember.full_name || (simulatingMember as any).name || 'Member';

    if (!confirm(`Pay ₦${totalToPay.toLocaleString()} for ${memberName}?`)) return;

    try {
      setIsSimulating(true);
      setSimulateError(null);

      // In Pay Now onClick - mark member status in group doc:
      const groupDocSnap = await getDoc(doc(db, 'groups', groupId)).catch(() => null);
      const groupData = groupDocSnap?.data() || {};
      const rawMembers = groupData.members || members || [];
      const updatedMembers = rawMembers.map((m: any) => {
        if (m.id === simulatingMember.id || m.position === simulatingMember.position) {
          return {
            ...m,
            hasPaid: true,
            hasPaidCurrentCycle: true,
            status: 'PAID',
            current_round_status: 'contributed',
            isFullyPaid: true
          };
        }
        return m;
      });

      await updateDoc(doc(db, 'groups', groupId), { members: updatedMembers }).catch(() => {});

      const paidCount = updatedMembers.filter((m: any) => m.hasPaidCurrentCycle).length;
      const allPaid = updatedMembers.length > 0 && paidCount === updatedMembers.length;

      if (allPaid) {
        // Only now allow pack - show button "PACK NOW" - do not auto pack
        // DO NOT auto create contribution here - wait for Pack Now button click
        await updateDoc(doc(db, 'groups', groupId), { packingStatus: 'READY_TO_PACK' }).catch(() => {});
      } else {
        // Still waiting - no pack - no commission
        // Ledger shows 0 packed - commission N0
      }

      const res = await fetch(`/api/groups/${groupId}/members/${simulatingMember.id}/simulate-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ amount: baseContrib })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Payment simulation failed');
      }
      showToast(json.message || `Payment of ₦${totalToPay.toLocaleString()} confirmed!`);
      setSimulatingMember(null);
      fetchDashboardData();
    } catch (err: any) {
      setSimulateError(err.message || 'Error processing payment');
    } finally {
      setIsSimulating(false);
    }
  };

  const openEditMemberModal = (m: GroupAdminMemberItem) => {
    setEditingMember(m);
    setEditFullName(m.full_name || '');
    setEditPhone(m.phone || '');
    setEditAccount(m.account_number || '');
    setEditBank(m.bank_name || 'Moniepoint MFB');
    setEditMemberError(null);
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    if (!editFullName.trim() || editFullName.trim().length < 2) {
      setEditMemberError('Please enter a valid full name.');
      return;
    }
    const cleanPhone = editPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 11) {
      setEditMemberError('Phone number must be exactly 11 digits (e.g. 08012345678).');
      return;
    }
    const cleanAcc = editAccount.replace(/\D/g, '');
    if (cleanAcc.length !== 10) {
      setEditMemberError('Bank account number must be exactly 10 digits.');
      return;
    }

    try {
      setIsUpdatingMember(true);
      setEditMemberError(null);
      const res = await fetch(`/api/groups/${groupId}/members/${editingMember.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          full_name: editFullName.trim(),
          phone: cleanPhone,
          account_number: cleanAcc,
          bank_name: editBank.trim()
        })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update member');
      }
      showToast('Member details updated successfully!');
      setEditingMember(null);
      fetchDashboardData();
    } catch (err: any) {
      setEditMemberError(err.message || 'Error updating member');
    } finally {
      setIsUpdatingMember(false);
    }
  };

  const handleCopyVirtualAccount = (m: GroupAdminMemberItem) => {
    const accNum = m.virtual_account_number || 'Pending';
    const accName = m.virtual_account_name || `BETTERAJO-${m.full_name.toUpperCase()}`;
    const totalToPay = (data?.group?.contribution_amount || 0) + 60;
    const textToCopy = `*BETTER AJO CONTRIBUTION ACCOUNT*\nMember: ${m.full_name}\nBank: Moniepoint MFB\nAccount Number: ${accNum}\nAccount Name: ${accName}\nAmount: ₦${totalToPay.toLocaleString()} (₦${(data?.group?.contribution_amount || 0).toLocaleString()} contribution + ₦60 fee)\n\nPlease transfer your contribution directly into this dedicated account. Your payment is verified instantly!`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedMemberId(m.id);
    showToast(`Copied Moniepoint Virtual Account for ${m.full_name}! Ready to paste into WhatsApp.`);
    setTimeout(() => setCopiedMemberId(null), 3000);
  };

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
    // Fetch all admin groups for multi-group switching
    fetch(`/api/users/${currentUser.id}/admin-groups`)
      .then(r => r.json())
      .then(groups => {
        if (Array.isArray(groups)) {
          setAdminGroups(groups);
        }
      })
      .catch(() => {});

    if (!db || !groupId) return;

    const effectiveGroupId = groupId;
    console.log('[GroupAdminDashboard] Initializing members onSnapshot for groupId:', effectiveGroupId);

    // Sync helper: guarantees admin is not a member, filters fake members, ensures only unique positions 1..5
    const syncMembersFromSnap = (rawDocs: any[]) => {
      if (!rawDocs || rawDocs.length === 0) return;
      const fakeListUpper = ['CHIDI EZE', 'FATIMA BELLO', 'TUNDE OKORO', 'BISI ADEBAYO'];
      const fakeVans = ['8152629304', '8152467888', '8152925182'];

      const memberMap = new Map<string, GroupAdminMemberItem>();
      rawDocs.forEach(d => {
        const item: any = typeof d.data === 'function' ? { ...d.data(), id: d.id } : d;
        // DO NOT make admin a member. DO NOT add admin to count. Keep admin as non-contributor exclusive manager.
        if (item.user_id === currentUser.id || item.userId === currentUser.id || item.id === currentUser.id) {
          return;
        }
        const nameUpper = String(item.full_name || item.name || item.fullName || '').trim().toUpperCase();
        if (fakeListUpper.includes(nameUpper) || nameUpper.startsWith('MEMBER')) {
          return;
        }
        const van = String(item.virtual_account_number || item.virtualAccountNumber || '');
        if (fakeVans.includes(van)) {
          return;
        }
        if (item.id && String(item.id).startsWith('mem_adugbo_')) {
          return;
        }
        if (nameUpper === 'GLRY JAYE' && van === '8152925182') {
          return;
        }

        memberMap.set(item.id, { ...item } as GroupAdminMemberItem);
      });

      const memberList = Array.from(memberMap.values());
      memberList.sort((a, b) => (Number(a.position || a.packing_position || 1)) - (Number(b.position || b.packing_position || 1)));

      // Limit to unique positions (no duplicate 4th or 5th)
      const uniquePositionList: GroupAdminMemberItem[] = [];
      const seenPositions = new Set<number>();
      for (const m of memberList) {
        const pos = Number(m.position || m.packing_position || 1);
        if (!seenPositions.has(pos)) {
          seenPositions.add(pos);
          uniquePositionList.push(m);
        }
      }

      const expectedCap = data?.totalMembersExpected || 5;
      const finalCleanList = uniquePositionList.slice(0, expectedCap);

      if (finalCleanList.length > 0) {
        setData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            members: finalCleanList,
            membersJoinedCount: finalCleanList.length
          };
        });
      }
    };

    // 1. Sub-collection: groups/{effectiveGroupId}/members
    const subColRef = collection(db, 'groups', effectiveGroupId, 'members');
    const unsubSub = onSnapshot(subColRef, (snap) => {
      if (!snap.empty) {
        syncMembersFromSnap(snap.docs);
      }
    }, (err) => console.warn('[Members Sub Snapshot Warn]:', err));

    // 2. Root group_members query by group_id
    const q1 = query(collection(db, 'group_members'), where('group_id', '==', effectiveGroupId));
    const unsubQ1 = onSnapshot(q1, (snap) => {
      if (!snap.empty) {
        syncMembersFromSnap(snap.docs);
      }
    }, (err) => console.warn('[Members Q1 Snapshot Warn]:', err));

    // 3. Root group_members query by groupId
    const q2 = query(collection(db, 'group_members'), where('groupId', '==', effectiveGroupId));
    const unsubQ2 = onSnapshot(q2, (snap) => {
      if (!snap.empty) {
        syncMembersFromSnap(snap.docs);
      }
    }, (err) => console.warn('[Members Q2 Snapshot Warn]:', err));

    // 4. Legacy groupMembers query by groupId
    const q3 = query(collection(db, 'groupMembers'), where('groupId', '==', effectiveGroupId));
    const unsubQ3 = onSnapshot(q3, (snap) => {
      if (!snap.empty) {
        syncMembersFromSnap(snap.docs);
      }
    }, (err) => console.warn('[Members Q3 Snapshot Warn]:', err));

    // 5. Group doc itself for embedded members array
    const groupDocRef = doc(db, 'groups', effectiveGroupId);
    const unsubGroupDoc = onSnapshot(groupDocRef, (snap) => {
      if (snap.exists()) {
        const gData = snap.data();
        if (Array.isArray(gData?.members) && gData.members.length > 0) {
          syncMembersFromSnap(gData.members);
        }
      }
    }, (err) => console.warn('[Group Doc Snapshot Warn]:', err));

    // 6. Contributions query by group_id
    const qContribs1 = query(collection(db, 'contributions'), where('group_id', '==', effectiveGroupId));
    const unsubContribs1 = onSnapshot(qContribs1, (snap) => {
      if (!snap.empty) {
        const cList: any[] = [];
        snap.docs.forEach(d => cList.push({ ...d.data(), id: d.id }));
        setData(prev => {
          if (!prev) return prev;
          const merged = [...(prev.contributions || [])];
          cList.forEach(c => {
            const idx = merged.findIndex(existing => existing.id === c.id || (existing.reference && existing.reference === c.reference));
            if (idx >= 0) merged[idx] = { ...merged[idx], ...c };
            else merged.push(c);
          });
          return { ...prev, contributions: merged };
        });
      }
    }, (err) => console.warn('[Contribs1 Snapshot Warn]:', err));

    // 7. Contributions query by groupId
    const qContribs2 = query(collection(db, 'contributions'), where('groupId', '==', effectiveGroupId));
    const unsubContribs2 = onSnapshot(qContribs2, (snap) => {
      if (!snap.empty) {
        const cList: any[] = [];
        snap.docs.forEach(d => cList.push({ ...d.data(), id: d.id }));
        setData(prev => {
          if (!prev) return prev;
          const merged = [...(prev.contributions || [])];
          cList.forEach(c => {
            const idx = merged.findIndex(existing => existing.id === c.id || (existing.reference && existing.reference === c.reference));
            if (idx >= 0) merged[idx] = { ...merged[idx], ...c };
            else merged.push(c);
          });
          return { ...prev, contributions: merged };
        });
      }
    }, (err) => console.warn('[Contribs2 Snapshot Warn]:', err));

    // 8. Admin Commission from group_admin_earnings
    const effectiveAdminUid = auth?.currentUser?.uid || currentUser.id;
    const unsubAdminCom = onSnapshot(collection(db, 'group_admin_earnings'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        const val = d.data();
        if (val.groupId === effectiveGroupId || val.group_id === effectiveGroupId || val.adminId === effectiveAdminUid) {
          list.push({ id: d.id, ...val });
        }
      });
      setPlatformCommissions(list);
    }, (err) => console.warn('[AdminCom Snapshot Warn]:', err));

    // 9. Admin Withdrawals from withdrawals
    const adminWithdrawalsQuery = query(
      collection(db, 'withdrawals'),
      where('adminId', '==', effectiveAdminUid),
      where('type', '==', 'admin_commission'),
      where('status', '==', 'success')
    );
    const unsubAdminWth = onSnapshot(adminWithdrawalsQuery, (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setPlatformWithdrawals(list);
    }, (err) => console.warn('[AdminWth Snapshot Warn]:', err));

    return () => {
      unsubSub();
      unsubQ1();
      unsubQ2();
      unsubQ3();
      unsubGroupDoc();
      unsubContribs1();
      unsubContribs2();
      unsubAdminCom();
      unsubAdminWth();
    };
  }, [groupId, currentUser.id]);

  // A. Fix Group Admin Available Commission Calculation - MUST BE INTEGER, NO KOBO, NO PLATFORM FEE
  // Group Admin fees must strictly be 0 when no group
  const currentGroupId = groupId || data?.group?.id || (data as any)?.groupId || '';
  const ptxCommissionSum = (!currentGroupId)
    ? 0
    : platformCommissions
        .filter((c: any) => {
          const isPersonal = c.type === 'personal_ajo_fee' || c.type === 'personal_deposit' || c.type === 'personal_withdraw' || c.source === 'personal_ajo';
          return !isPersonal && (c.groupId === currentGroupId || c.group_id === currentGroupId);
        })
        .reduce((sum, c) => sum + Math.floor(Number(c.amount || c.adminShare || 0)), 0);

  const ptxWithdrawalsSum = platformWithdrawals
    .reduce((sum, w) => sum + Math.floor(Number(w.amount || 0)), 0);

  const totalAdminCommission = ptxCommissionSum;
  const totalAdminWithdrawn = ptxWithdrawalsSum;
  const availableAdminBalance = Math.floor(Math.max(0, totalAdminCommission - totalAdminWithdrawn));

  const displayAdminEarnings = {
    totalEarned: totalAdminCommission,
    available: availableAdminBalance,
    withdrawn: totalAdminWithdrawn
  };

  const handleMax = () => {
    setWithdrawAmount(availableAdminBalance.toString()); // Integer string like "10000"
  };

  const handleInitiateWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setWithdrawError(null);

    // B. Fix validation that causes "exceeded available of 2.2 naira" error
    const withdrawAmountNum = Math.floor(Number(withdrawAmount)); // Remove decimals, no kobo
    if (isNaN(withdrawAmountNum) || withdrawAmountNum <= 0) {
      setWithdrawError('Enter valid amount');
      return;
    }

    if (withdrawAmountNum > availableAdminBalance) {
      setWithdrawError(`Insufficient balance. Available: ₦${availableAdminBalance.toLocaleString()}`);
      return;
    }

    if (!data.adminBankDetails?.account_number || !data.adminBankDetails?.bank_name) {
      setWithdrawError('Please ensure your payout bank details are registered.');
      return;
    }

    try {
      setIsWithdrawing(true);

      // D. Fix withdrawal creation - ensure integer:
      if (db) {
        await addDoc(collection(db, 'withdrawals'), {
          adminId: currentUser.id,
          userId: currentUser.id,
          groupId: groupId,
          amount: Math.floor(withdrawAmountNum), // Integer, no 10000.02
          type: 'admin_commission',
          withdrawal_type: 'admin_commission',
          status: 'success',
          createdAt: serverTimestamp()
        }).catch((err) => console.warn('[AddDoc withdrawal warn]:', err));
      }

      const res = await fetch(`/api/groups/${groupId}/withdraw-admin-earnings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          userId: currentUser.id,
          amount: Math.floor(withdrawAmountNum),
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
      showToast(json.message || `Commission of ₦${withdrawAmountNum.toLocaleString()} withdrawn successfully!`);
      fetchDashboardData();
    } catch (err: any) {
      setWithdrawError(err.message || 'Error processing withdrawal');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const getWhatsAppLink = (phoneOrMember: any, memberName?: string, customMsg?: string) => {
    if (!data?.group) return '#';
    let phone = '';
    let name = memberName || '';
    if (typeof phoneOrMember === 'object' && phoneOrMember !== null) {
      phone = phoneOrMember.whatsapp_number || phoneOrMember.whatsappNumber || phoneOrMember.phone || '';
      name = name || phoneOrMember.full_name || '';
    } else {
      phone = String(phoneOrMember || '');
    }
    const digitsOnly = phone.replace(/\D/g, '');
    let intlPhone = digitsOnly;
    if (intlPhone.startsWith('0')) {
      intlPhone = '234' + intlPhone.slice(1);
    } else if (!intlPhone.startsWith('234') && intlPhone.length > 0) {
      intlPhone = '234' + intlPhone;
    }

    const baseMessage = customMsg?.trim() || `Hello ${name}, this is a message from the admin of ${data.group.group_name} on Better Ajo.`;
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

  // SAFETY GUARDS
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeAjoGroups = Array.isArray(data?.group ? [data.group] : []) ? (data?.group ? [data.group] : []) : [];
  const safeWithdrawals = Array.isArray(withdrawals) ? withdrawals : [];
  const safeEarningsHistory = Array.isArray(earningsHistory) ? earningsHistory : [];
  const safeMembers = Array.isArray(members) ? members : [];

  // 1. CONTRIBUTION TRACKING - Part Payment + Pay Ahead (Generic for any group)
  const contributions: any[] = Array.isArray(data?.contributions) ? data.contributions : [];
  const required = Number(group.contribution_amount || (group as any).contributionAmount || 20000);
  const currentRound = Number(group.current_round || 1);
  const nextRound = currentRound + 1;

  const memberCanonicalMap = new Map<string, GroupAdminMemberItem>();
  safeMembers.forEach((m: any) => {
    if (m && m.id && !memberCanonicalMap.has(m.id)) {
      memberCanonicalMap.set(m.id, { ...m, position: Number(m.position || m.packing_position || 1) });
    }
  });

  const memberListToFilter = Array.from(memberCanonicalMap.values());
  memberListToFilter.sort((a, b) => Number(a.position || 1) - Number(b.position || 1));

  const seenPos = new Set<number>();
  const uniqueGroupMembers: GroupAdminMemberItem[] = [];
  for (const m of memberListToFilter) {
    const pos = Number(m.position || m.packing_position || 1);
    if (!seenPos.has(pos)) {
      seenPos.add(pos);
      uniqueGroupMembers.push(m);
    }
  }
  uniqueGroupMembers.sort((a, b) => Number(a.position || 1) - Number(b.position || 1));
  const expectedCap = data.totalMembersExpected || (group as any)?.member_limit || (group as any)?.memberCount || safeMembers.length || 5;
  const groupMembers = (uniqueGroupMembers.length > 0 ? uniqueGroupMembers : safeMembers).slice(0, expectedCap);
  const totalCount = groupMembers.length;

  const memberStatusList = groupMembers.map((m) => {
    const memberId = m.id;
    const paidForRound = contributions
      .filter((c: any) =>
        (c.member_id === memberId || c.memberId === memberId) &&
        (c.round_number === currentRound || c.round === currentRound) &&
        !c.is_pay_ahead &&
        !c.isPayAhead
      )
      .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);

    const creditBalance = Number(m.creditBalance ?? m.credit_balance ?? 0);
    const totalEffectivePaid = paidForRound + creditBalance;
    const remaining = Math.max(0, required - totalEffectivePaid);
    const isFullyPaid = totalEffectivePaid >= required || Boolean((m as any).hasPaidCurrentCycle || (m as any).hasPaid || (m as any).status === 'PAID');

    const isPayAhead =
      contributions.filter(
        (c: any) =>
          (c.member_id === memberId || c.memberId === memberId) &&
          ((c.round_number || c.round) > currentRound || c.is_pay_ahead || c.isPayAhead || c.type === 'pay_ahead')
      ).length > 0 ||
      Boolean((m as any).payAheadForRound && (m as any).payAheadForRound > currentRound) ||
      Boolean((m as any).isPayAhead || (m as any).is_pay_ahead) ||
      (paidForRound > 0 &&
        contributions.filter(
          (c: any) =>
            (c.member_id === memberId || c.memberId === memberId) &&
            (c.round_number === currentRound || c.round === currentRound)
        ).length > 1) ||
      (isFullyPaid && creditBalance > 0);

    const payAheadAmount =
      creditBalance > 0
        ? creditBalance
        : contributions
            .filter(
              (c: any) =>
                (c.member_id === memberId || c.memberId === memberId) &&
                ((c.round_number || c.round) > currentRound || c.is_pay_ahead || c.isPayAhead || c.type === 'pay_ahead')
            )
            .reduce((s: number, c: any) => s + Number(c.amount || 0), 0) || (isPayAhead ? required : 0);

    return {
      member: m,
      paidForRound,
      creditBalance,
      totalEffectivePaid,
      remaining,
      isFullyPaid,
      isPayAhead,
      payAheadAmount
    };
  });

  const memberStatusMap = new Map(memberStatusList.map((item) => [item.member.id, item]));

  // 3. PACK ACTIVATION LOGIC - CRITICAL: CanPack = EVERY member in group has totalEffectivePaid >= required
  const paidMembersCount = memberStatusList.filter((item) => item.isFullyPaid).length;
  const unpaidMembersCount = totalCount - paidMembersCount;
  const allMembersPaid = totalCount > 0 && memberStatusList.every((item) => item.isFullyPaid);
  const packTooltip = !allMembersPaid
    ? `Cannot pack - ${unpaidMembersCount} members not fully paid yet. ${paidMembersCount}/${totalCount} paid`
    : 'All members have paid for this round. Ready to pack!';

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

              {/* Multi-Group Switcher & Create New Group */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs font-bold text-slate-500">Your Groups:</span>
                <select
                  value={group.id}
                  onChange={(e) => {
                    if (onSwitchGroup && e.target.value !== group.id) {
                      onSwitchGroup(e.target.value);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none cursor-pointer shadow-xs"
                >
                  {(adminGroups.length > 0 ? adminGroups : [{ id: group.id, group_name: group.group_name, membersCount: members.length }]).map((ag: any) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.group_name} ({ag.membersCount ?? ag.member_limit ?? members.length} members)
                    </option>
                  ))}
                </select>

                {onCreateNewGroup && (
                  <button
                    onClick={onCreateNewGroup}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#008751] text-xs font-bold transition cursor-pointer border border-emerald-200 shadow-xs"
                    title="Create a new independent savings group under this admin account"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>Create New Group</span>
                  </button>
                )}
              </div>
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
            disabled={displayAdminEarnings.available <= 0}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition cursor-pointer ${
              displayAdminEarnings.available > 0
                ? 'bg-[#008751] hover:bg-[#007345] text-white shadow-[#008751]/20'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Wallet className="h-4 w-4" />
            <span>Withdraw Commission ({formatNaira(displayAdminEarnings.available)})</span>
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
        {/* Card 1: Total Contribution Collected */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Contribution Collected</span>
            <Coins className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {formatNaira(data.totalContributionsAmount)}
            </span>
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
              {formatNaira(displayAdminEarnings.available)}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Available
            </span>
          </div>
          <div className="flex items-center justify-between pt-2.5 border-t border-white/10 text-xs">
            <span className="text-slate-400">Total Earned:</span>
            <span className="font-extrabold text-white">{formatNaira(displayAdminEarnings.totalEarned)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 text-xs">
            <span className="text-slate-400">Total Withdrawn:</span>
            <span className="font-extrabold text-emerald-400">{formatNaira(displayAdminEarnings.withdrawn)}</span>
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
                      {(() => {
                        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
                        const currentMemberItem = members.find(m => m.id === currentPacker.id || m.position === currentPacker.position);
                        const scheduledDate = currentMemberItem?.scheduledPackDate || (currentPacker as any).scheduledPackDate || '';
                        const scheduledDisplay = currentMemberItem?.scheduledPackDateDisplay || (currentPacker as any).scheduledPackDateDisplay || scheduledDate;
                        const hasRealPackRecord = contributions.some((c: any) => (c.groupId === groupId || c.group_id === groupId) && (c.status === 'PACKED' || c.type === 'pack_payout'));
                        const isPacked = Boolean(hasRealPackRecord && (currentPacker.current_round_status === 'packed' || currentMemberItem?.hasPacked || (currentPacker as any)?.hasPackedThisRound));

                        if (isPacked) {
                          return <span className="font-extrabold text-emerald-700">Packed ✓</span>;
                        }

                        if (scheduledDate > today) {
                          return <span className="font-extrabold text-blue-700">Scheduled ({scheduledDisplay})</span>;
                        }

                        if (scheduledDate === today) {
                          const canPack = (data as any)?.canPackNow || (currentMemberItem?.hasContributed && data?.cycleStatus?.allPaid);
                          if (canPack) {
                            return <span className="font-extrabold text-emerald-600">Next to Pack Today</span>;
                          }
                          return <span className="font-extrabold text-amber-700">Scheduled Today (Waiting for Contributions)</span>;
                        }

                        if (scheduledDate < today && scheduledDate !== '') {
                          return <span className="font-extrabold text-rose-600">Overdue</span>;
                        }

                        return <span className="font-extrabold text-slate-700">Scheduled</span>;
                      })()}
                    </div>

                    {/* Pack Action Button on Current Packer Card */}
                    <div className="mt-3 pt-2.5 border-t border-emerald-100/80">
                      {Boolean(contributions.some((c: any) => (c.groupId === groupId || c.group_id === groupId) && (c.status === 'PACKED' || c.type === 'pack_payout')) && (currentPacker.current_round_status === 'packed' || (members.find(m => m.id === currentPacker.id) as any)?.hasPacked)) ? (
                        <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-300">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>Packed for Round {group.current_round || 1} ✓</span>
                        </div>
                      ) : (
                        <div className="relative group/pack w-full">
                          <button
                            onClick={handleAdminPackCurrentMember}
                            disabled={!allMembersPaid || isProcessingPack}
                            title={packTooltip}
                            className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl font-black text-xs transition ${
                              allMembersPaid
                                ? 'bg-[#008751] hover:bg-[#007345] text-white shadow-md shadow-[#008751]/20 cursor-pointer animate-pulse'
                                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            }`}
                          >
                            {isProcessingPack ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>PACKING IN PROGRESS...</span>
                              </>
                            ) : allMembersPaid ? (
                              <>
                                <Coins className="h-4 w-4" />
                                <span>PACK NOW</span>
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4" />
                                <span>Cannot pack - {unpaidMembersCount} members not fully paid yet ({paidMembersCount}/{totalCount} paid)</span>
                              </>
                            )}
                          </button>
                          {!allMembersPaid && (
                            <div className="hidden group-hover/pack:block absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl whitespace-nowrap z-30 pointer-events-none">
                              {packTooltip}
                            </div>
                          )}
                        </div>
                      )}
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
                Group Members ({groupMembers.length} / {data.totalMembersExpected || 5})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Group: {group.group_name || (group as any)?.name} — {formatNaira(group.contribution_amount || (group as any).contributionAmount || 50000)} every {(group as any).packingInterval || (group as any).contributionFrequency || group.cycle_type || `${Number((group as any).packingIntervalDays || (group as any).contributionFrequencyDays || 3)} days`} • All registered contributors in rotation order.
              </p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              {onCreateNewGroup && (
                <button
                  onClick={onCreateNewGroup}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#008751] hover:bg-[#007345] text-white shadow-sm shadow-[#008751]/20 transition cursor-pointer"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>+ Create New Group</span>
                </button>
              )}
              <button
                onClick={() => {
                  const cycleLabel = (group as any).contributionFrequency || (group as any).packingInterval || group.cycle_type || '3 days';
                  setSelectedMemberForNotify(null);
                  setNotifyRecipientType('all');
                  setNotifyMessage(`Hello, this is a message from the admin of ${group.group_name} on Better Ajo. Contribution is due every ${cycleLabel}. Please ensure your contribution for Round ${group.current_round} is completed so our rotation proceeds on schedule.`);
                  setShowNotifyModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#E6F3ED] text-[#008751] hover:bg-[#d8ece2] transition cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Notify Members</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Pos / Packing Order</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Personal Bank</th>
                  <th className="py-3 px-4">Virtual Account Number</th>
                  <th className="py-3 px-4">Virtual Account Name</th>
                  <th className="py-3 px-4">Contribution / Credit</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {groupMembers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No members registered in this group yet.
                    </td>
                  </tr>
                ) : (
                  groupMembers.map((m) => {
                    const posNum = m.position || m.packing_position || 1;
                    const posSuffix = posNum === 1 ? '1st' : posNum === 2 ? '2nd' : posNum === 3 ? '3rd' : `${posNum}th`;
                    const cycleDays = Number((group as any).packingIntervalDays || (group as any).contributionFrequencyDays || (group.cycle_type ? parseInt(group.cycle_type.replace(/\D/g, ''), 10) : 3)) || 3;
                    const accNum = m.virtual_account_number || '810' + Math.abs(m.id.split('').reduce((a, b) => a + b.charCodeAt(0), 1000000)).toString().slice(0, 7).padStart(7, '0');
                    const accName = m.virtual_account_name || `BETTERAJO-${m.full_name.toUpperCase()}`;
                    const creditBal = Number(m.credit_balance || 0);
                    const isCopied = copiedMemberId === m.id;
                    const isNumCopied = copiedVaNumId === m.id;
                    const isNameCopied = copiedVaNameId === m.id;

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-900 text-white font-mono text-xs">
                                {posNum}
                              </span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                posNum === 1
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                Packs {posSuffix} {posNum === 1 ? '(First)' : ''}
                              </span>
                            </div>
                            <span className="block text-[9px] font-medium text-slate-500 mt-0.5">
                              {posNum === 1 ? `packs on Day 1, next in ${cycleDays} days` : `packs on Day ${(posNum - 1) * cycleDays + 1}`}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {m.full_name}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          <div>{formatPhone(m.phone)}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {m.bank_name ? `${m.bank_name} • ${m.account_number}` : 'Not provided'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-950 font-mono font-black text-xs border border-emerald-200">
                            <span>{accNum}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(accNum);
                                setCopiedVaNumId(m.id);
                                showToast(`Copied Account Number: ${accNum}`);
                                setTimeout(() => setCopiedVaNumId(null), 2000);
                              }}
                              className="p-0.5 hover:bg-emerald-200/60 rounded text-emerald-800 transition cursor-pointer"
                              title="Copy Account Number"
                            >
                              {isNumCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1 font-mono font-bold text-[#008751] text-xs">
                            <span>{accName}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(accName);
                                setCopiedVaNameId(m.id);
                                showToast(`Copied Account Name: ${accName}`);
                                setTimeout(() => setCopiedVaNameId(null), 2000);
                              }}
                              className="p-0.5 hover:bg-emerald-100/60 rounded text-emerald-700 transition cursor-pointer"
                              title="Copy Account Name"
                            >
                              {isNameCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {(() => {
                            const statusItem = memberStatusMap.get(m.id);
                            const isFullyPaid = statusItem?.isFullyPaid ?? m.isFullyPaid;
                            const isPayAhead = statusItem?.isPayAhead ?? m.isPayAhead;
                            const totalEff = statusItem?.totalEffectivePaid ?? ((m.paidForRound || 0) + Number(m.credit_balance || 0));
                            const rem = statusItem?.remaining ?? Math.max(0, required - totalEff);
                            const creditBal = statusItem?.creditBalance ?? Number(m.credit_balance || 0);
                            const payAheadAmt = statusItem?.payAheadAmount ?? (creditBal > 0 ? creditBal : required);

                            if (isFullyPaid && isPayAhead) {
                              return (
                                <div className="space-y-1">
                                  <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold inline-block">
                                    PAID - {formatNaira(required)}
                                  </div>
                                  <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold inline-block">
                                    CREDITED - {formatNaira(payAheadAmt)} Pay Ahead R{nextRound}
                                  </div>
                                </div>
                              );
                            }

                            if (isFullyPaid) {
                              return (
                                <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold inline-block">
                                  PAID - {formatNaira(required)}
                                </div>
                              );
                            }

                            if (totalEff > 0) {
                              return (
                                <div className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold inline-block">
                                  PART PAID {formatNaira(totalEff)} / {formatNaira(required)} - Remaining {formatNaira(rem)}
                                </div>
                              );
                            }

                            return (
                              <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold inline-block">
                                PENDING - {formatNaira(required)}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {(() => {
                            const statusItem = memberStatusMap.get(m.id);
                            const isFullyPaid = statusItem?.isFullyPaid ?? m.isFullyPaid;
                            const isPayAhead = statusItem?.isPayAhead ?? m.isPayAhead;
                            const rem = statusItem?.remaining ?? Math.max(0, required - (statusItem?.totalEffectivePaid || 0));

                            const contribAmount = required || 50000;
                            const totalAmountToPay = contribAmount + 60;

                            let simLabel = `Pay ₦${totalAmountToPay.toLocaleString()}`;
                            let simClass = 'bg-[#008751] hover:bg-[#007345] text-white border-[#008751]';
                            let simIcon = <Coins className="h-3 w-3 text-white" />;

                            if (isFullyPaid && isPayAhead) {
                              simLabel = 'PAID ✓';
                              simClass = 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200';
                              simIcon = <CheckCircle2 className="h-3 w-3 text-blue-600" />;
                            } else if (isFullyPaid) {
                              simLabel = `Pay ₦${totalAmountToPay.toLocaleString()} (Pay Ahead)`;
                              simClass = 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600';
                              simIcon = <Coins className="h-3 w-3 text-white" />;
                            } else if (rem > 0 && rem < required) {
                              simLabel = `Pay ₦${(rem + 60).toLocaleString()}`;
                              simClass = 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600';
                              simIcon = <Coins className="h-3 w-3 text-white" />;
                            }

                            return (
                              <button
                                onClick={() => openSimulateModal(m)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer border shadow-2xs ${simClass}`}
                                title={`Pay ₦${totalAmountToPay.toLocaleString()} for ${m.full_name}`}
                              >
                                {simIcon}
                                <span>{simLabel}</span>
                              </button>
                            );
                          })()}
                          {/* Pack Button for Current Packer in table */}
                          {currentPacker && m.id === currentPacker.id && !m.hasPacked && currentPacker.current_round_status !== 'packed' && !contributions.some((c: any) => (c.groupId === groupId || c.group_id === groupId) && (c.status === 'PACKED' || c.type === 'pack_payout')) && (
                            allMembersPaid ? (
                              <button
                                onClick={handleAdminPackCurrentMember}
                                disabled={isProcessingPack}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008751] hover:bg-[#007345] text-white font-black text-[11px] transition cursor-pointer shadow-xs animate-pulse"
                                title="Ready to Pack"
                              >
                                <Coins className="h-3 w-3" />
                                <span>{isProcessingPack ? 'Packing...' : 'PACK NOW'}</span>
                              </button>
                            ) : (
                              <button
                                disabled
                                title={packTooltip}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 font-bold text-[11px] border border-slate-200 cursor-not-allowed"
                              >
                                <Lock className="h-3 w-3" />
                                <span>Cannot pack ({paidMembersCount}/{totalCount} paid)</span>
                              </button>
                            )
                          )}
                          <button
                            onClick={() => handleCopyVirtualAccount(m)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#E6F3ED] hover:bg-[#d8ece2] text-[#008751]'
                            }`}
                            title="Copy full Moniepoint Virtual Account details"
                          >
                            {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            <span>{isCopied ? 'Copied ✓' : 'Copy'}</span>
                          </button>
                          <a
                            href={getWhatsAppLink(m, m.full_name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#008751] font-bold text-[11px] transition"
                            title="Open WhatsApp chat with member"
                          >
                            <Phone className="h-3 w-3" />
                            <span>WhatsApp</span>
                          </a>
                          <button
                            onClick={() => openEditMemberModal(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] transition cursor-pointer"
                            title="Edit member details"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
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
                    );
                  })
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
              Total Commission: {formatNaira(displayAdminEarnings.totalEarned)}
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
              disabled={displayAdminEarnings.available <= 0}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                displayAdminEarnings.available > 0
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
                {safeWithdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No withdrawals recorded yet.
                    </td>
                  </tr>
                ) : (
                  (safeWithdrawals || []).map((w: any) => (
                    <tr key={w?.id || Math.random()} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {w?.created_at ? new Date(w.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : (w?.timestamp?.seconds ? new Date(w.timestamp.seconds * 1000).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : '-')}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatNaira(w?.gross_amount ?? w?.amount ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {w?.bank_name || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {w?.account_number || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {w?.account_name || w?.userName || group?.admin_name || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          w?.status === 'completed' || w?.status === 'successful'
                            ? 'bg-emerald-100 text-emerald-800'
                            : w?.status === 'processing' || w?.status === 'pending'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {w?.status || 'completed'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {w?.reference || w?.id || '-'}
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
                {safeTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No ledger transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  (safeTransactions || []).map((t: any) => (
                    <tr key={t?.id || Math.random()} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {t?.timestamp?.seconds
                          ? new Date(t.timestamp.seconds * 1000).toLocaleString('en-NG')
                          : (t?.created_at ? new Date(t.created_at).toLocaleString('en-NG') : '-')}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t?.type === 'GROUP_CONTRIBUTION' || t?.type === 'personal_savings' || (typeof t?.type === 'string' && t?.type.includes('deposit'))
                            ? 'bg-emerald-50 text-emerald-800'
                            : t?.type === 'GROUP_PACKING' || (typeof t?.type === 'string' && t?.type.includes('pack'))
                            ? 'bg-purple-50 text-purple-800'
                            : (typeof t?.type === 'string' && t?.type.includes('withdraw'))
                            ? 'bg-rose-50 text-rose-800'
                            : 'bg-blue-50 text-blue-800'
                        }`}>
                          {t?.type || 'TRANSACTION'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {t?.description || (typeof t?.type === 'string' && t?.type.includes('withdraw') ? `Withdrawal - ${t?.source || 'Group'}` : 'Contribution')}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {t?.user_name || t?.userName || t?.destination || 'Member'}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatNaira(t?.gross_amount ?? t?.amount ?? 0)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                          {t?.status || 'completed'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {t?.reference || t?.id || '-'}
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
                    {formatNaira(displayAdminEarnings.available)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Accumulated Total:</span>
                  <span className="font-bold text-slate-600">
                    {formatNaira(displayAdminEarnings.totalEarned)}
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Amount to Withdraw (₦)
                  </label>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Available: ₦{Math.floor(displayAdminEarnings.available).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                    ₦
                  </span>
                  <input
                    type="number"
                    min="100"
                    max={displayAdminEarnings.available}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder={`Max ${displayAdminEarnings.available}`}
                    className="w-full pl-8 pr-20 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#008751]"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleMax}
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
                    {group.group_name} • Round {group.current_round}
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
                    <span>All Members ({groupMembers.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifyRecipientType('single');
                      if (groupMembers.length > 0 && !selectedMemberForNotify) {
                        setSelectedMemberForNotify(groupMembers[0]);
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
                  {(selectedMemberDetails.whatsapp_number || selectedMemberDetails.whatsappNumber) && (
                    <span className="text-[10px] text-emerald-700 font-sans block mt-0.5">
                      WhatsApp: {selectedMemberDetails.whatsapp_number || selectedMemberDetails.whatsappNumber}
                    </span>
                  )}
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
                  href={getWhatsAppLink(selectedMemberDetails, selectedMemberDetails.full_name)}
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

      {/* MODAL: Group Admin Edit Member Details */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Edit Member Details</h3>
                  <p className="text-[11px] text-slate-500">Position #{editingMember.position} • {editingMember.full_name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="rounded-full p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editMemberError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editMemberError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditMember} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Member Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g. John Musa"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 text-xs text-slate-900 outline-none transition"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Virtual account name will be: <strong className="text-[#008751]">BETTERAJO-{editFullName ? editFullName.trim().toUpperCase() : 'MEMBER'}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Phone Number (11 digits) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={11}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 08012345678"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 font-mono text-xs text-slate-900 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Personal Bank Account Number (10 digits) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={editAccount}
                  onChange={(e) => setEditAccount(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 0123456789"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 font-mono text-xs text-slate-900 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Personal Bank Name
                </label>
                <select
                  value={editBank}
                  onChange={(e) => setEditBank(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 text-xs text-slate-900 outline-none transition cursor-pointer bg-white"
                >
                  {NIGERIAN_BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingMember}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-xs font-bold text-white shadow-md shadow-[#008751]/20 transition disabled:opacity-50 cursor-pointer"
                >
                  {isUpdatingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Save Changes</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Payment Modal - TOTAL ONLY */}
      {simulatingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100 my-8">
            {(() => {
              const currentGroupName = (data?.group as any)?.name || data?.group?.group_name || 'AJO GROUP';
              const baseContrib = required;
              const totalToPay = baseContrib + 60;
              const memberName = simulatingMember.full_name || (simulatingMember as any).name || 'Member';

              return (
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                        <Coins className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-base">{currentGroupName}</h3>
                        <p className="text-xs text-slate-500 font-medium">Member: <strong className="text-slate-800">{memberName}</strong></p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSimulatingMember(null)}
                      className="rounded-full p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {simulateError && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{simulateError}</span>
                    </div>
                  )}

                  <form onSubmit={handleConfirmSimulatePayment} className="space-y-5">
                    <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200/80">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Amount to Pay
                      </span>
                      <span className="text-3xl font-black text-slate-900 font-mono block">
                        ₦{totalToPay.toLocaleString()}
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setSimulatingMember(null)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSimulating}
                        className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-xs font-bold text-white shadow-md shadow-[#008751]/20 transition disabled:opacity-50 cursor-pointer"
                      >
                        {isSimulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Pay ₦{totalToPay.toLocaleString()} Now</span>}
                      </button>
                    </div>
                  </form>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
