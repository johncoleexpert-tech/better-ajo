import React, { useState } from 'react';
import { ArrowLeft, Users, Coins, Clock, Loader2, CheckCircle2, Shield, Phone, Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { UserProfile, PackingCycle } from '../types/index.js';
import { NIGERIAN_BANKS, formatNaira, formatPhone } from '../lib/formatters.js';
import { apiRequest } from '../lib/api.js';
import { db } from '../lib/firebase.js';
import { doc, writeBatch, collection } from 'firebase/firestore';

interface GroupCreationProps {
  currentUser: UserProfile | null;
  onBack: () => void;
  onSuccess: (groupData: any) => void;
}

const ALLOWED_CYCLES: PackingCycle[] = [
  'Every 7 Days',
  'Every Day',
  'Every 3 Days',
  'Every 4 Days',
  'Every 5 Days',
  'Every 14 Days',
  'Every Month'
];

const MEMBER_COUNT_OPTIONS = [5, 8, 10, 12, 15, 20, 30];

interface MemberRow {
  full_name: string;
  phone: string;
  account_number: string;
  bank_name: string;
}

export const GroupCreation: React.FC<GroupCreationProps> = ({
  currentUser,
  onBack,
  onSuccess
}) => {
  // Step 1: Group Parameters
  const [groupName, setGroupName] = useState('Adeola Group');
  const [memberLimit, setMemberLimit] = useState(10);
  const [contributionAmount, setContributionAmount] = useState(10000);
  const [cycleType, setCycleType] = useState<PackingCycle>('Every 7 Days');
  const [packingFee, setPackingFee] = useState<number>(15000);
  const [whatsappNumber, setWhatsappNumber] = useState(currentUser?.whatsapp_number || currentUser?.whatsappNumber || currentUser?.phone || '');

  // Step 2: Dynamic Member Rows (Order = Packing Order, Member 1 packs first)
  const [members, setMembers] = useState<MemberRow[]>(() =>
    Array.from({ length: 10 }, () => ({
      full_name: '',
      phone: '',
      account_number: '',
      bank_name: 'Moniepoint MFB'
    }))
  );

  // Admin Profile (if not logged in)
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState(currentUser?.phone || `080${Math.floor(10000000 + Math.random() * 90000000)}`);
  const [bankName, setBankName] = useState(currentUser?.bank_name || 'Moniepoint MFB');
  const [accountNumber, setAccountNumber] = useState(currentUser?.account_number || '');
  const [verificationType, setVerificationType] = useState<'NIN' | 'BVN'>(currentUser?.verification_type || 'BVN');
  const [verificationNumber, setVerificationNumber] = useState(currentUser?.verification_number || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed pack amount and member payout
  const packAmount = memberLimit * contributionAmount;
  const memberReceives = Math.max(0, packAmount - packingFee);

  // Handle number of members dropdown change (instant dynamic rows)
  const handleMemberCountChange = (newCount: number) => {
    setMemberLimit(newCount);
    setMembers(prev => {
      if (newCount > prev.length) {
        const extra = Array.from({ length: newCount - prev.length }, () => ({
          full_name: '',
          phone: '',
          account_number: '',
          bank_name: 'Moniepoint MFB'
        }));
        return [...prev, ...extra];
      } else {
        return prev.slice(0, newCount);
      }
    });
  };

  const updateMemberRow = (index: number, field: keyof MemberRow, value: string) => {
    setMembers(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const getPositionSuffix = (pos: number) => {
    if (pos === 1) return '1st';
    if (pos === 2) return '2nd';
    if (pos === 3) return '3rd';
    return `${pos}th`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Group Validation
    if (!groupName.trim()) {
      setError('Group name is required (e.g. Adeola Group).');
      return;
    }
    if (memberLimit < 2 || memberLimit > 50) {
      setError('Number of members must be between 2 and 50.');
      return;
    }
    if (contributionAmount < 100 || contributionAmount > 100000) {
      setError('Contribution amount must be between ₦100 and ₦100,000.');
      return;
    }
    if (packingFee < 0) {
      setError('Pack fee cannot be negative.');
      return;
    }
    if (packingFee >= packAmount) {
      setError(`Pack fee (₦${packingFee.toLocaleString()}) must be less than total pack amount (₦${packAmount.toLocaleString()}).`);
      return;
    }

    // Step 4 Validation: All member fields required, phone must be 11 digits, no empty rows
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const rowNum = i + 1;
      const cleanName = m.full_name.trim();
      const cleanP = m.phone.replace(/\D/g, '');
      const cleanAcc = m.account_number.replace(/\D/g, '');

      if (!cleanName || cleanName.length < 2) {
        setError(`Row ${rowNum}: Please enter the member's full name.`);
        return;
      }
      if (!cleanP || cleanP.length !== 11) {
        setError(`Row ${rowNum} (${cleanName}): Phone number must be exactly 11 digits (e.g. 08012345678).`);
        return;
      }
      if (!cleanAcc || cleanAcc.length !== 10) {
        setError(`Row ${rowNum} (${cleanName}): Bank account number must be exactly 10 digits.`);
        return;
      }
    }

    // Admin validation if not logged in
    if (!currentUser) {
      if (!fullName.trim() || !email.trim() || !password || !bankName || !accountNumber || !verificationNumber) {
        setError('Please fill in all required Group Admin registration fields.');
        return;
      }
      if (!email.includes('@') || !email.includes('.')) {
        setError('Please enter a valid email address.');
        return;
      }
      if (password.length < 4) {
        setError('Password must be at least 4 characters.');
        return;
      }
      if (accountNumber.replace(/\D/g, '').length !== 10) {
        setError('Admin bank account number must be 10 digits.');
        return;
      }
      if (verificationNumber.replace(/\D/g, '').length !== 11) {
        setError(`Admin ${verificationType} must be 11 digits.`);
        return;
      }

      try {
        setLoading(true);
        const profData = await apiRequest('/api/auth/register-profile', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
            password,
            phone: phone.replace(/\D/g, ''),
            bank_name: bankName,
            account_number: accountNumber.replace(/\D/g, ''),
            verification_type: verificationType,
            verification_number: verificationNumber.replace(/\D/g, '')
          })
        });

        await executeCreateGroup(profData.profile.id, profData.profile.full_name, profData.profile);
      } catch (err: any) {
        setError(err.message || 'Error creating admin account');
        setLoading(false);
      }
    } else {
      await executeCreateGroup(currentUser.id, currentUser.full_name, currentUser);
    }
  };

  const executeCreateGroup = async (adminId: string, adminName: string, adminProfileObj?: UserProfile) => {
    try {
      setLoading(true);
      setError(null);

      // Sanitize member rows - exclude admin so admin is strictly not a contributor
      const adminPhone = currentUser?.phone ? currentUser.phone.replace(/\D/g, '') : '';
      const adminEmail = currentUser?.email;
      const membersOnly = members
        .map((m) => ({
          full_name: m.full_name.trim(),
          phone: m.phone.replace(/\D/g, ''),
          account_number: m.account_number.replace(/\D/g, ''),
          bank_name: (m.bank_name || 'Moniepoint MFB').trim()
        }))
        .filter((m) => {
          if (adminPhone && m.phone === adminPhone) return false;
          if (adminEmail && (m as any).email === adminEmail) return false;
          return true;
        });

      const data = await apiRequest('/api/groups/create', {
        method: 'POST',
        body: JSON.stringify({
          admin_id: adminId,
          admin_name: adminName,
          group_name: groupName.trim(),
          member_limit: Number(memberLimit),
          contribution_amount: Number(contributionAmount),
          cycle_type: cycleType,
          packing_fee: Number(packingFee),
          whatsapp_number: whatsappNumber,
          whatsappNumber: whatsappNumber,
          members: membersOnly
        })
      });

      // Save to Firestore with EXACT same groupId as group doc id (groupRef.id)
      if (db && data?.group?.id) {
        try {
          const groupRef = doc(db, 'groups', data.group.id);
          const membersArray = (data.members && data.members.length > 0)
            ? data.members.map((m: any, idx: number) => ({
                ...m,
                groupId: groupRef.id,
                group_id: groupRef.id,
                position: m.position || (idx + 1),
                status: 'active'
              }))
            : membersOnly.map((m, idx) => ({
                ...m,
                id: `mem_${groupRef.id}_${idx + 1}_${Math.random().toString(36).substring(2, 6)}`,
                groupId: groupRef.id,
                group_id: groupRef.id,
                position: idx + 1,
                status: 'active'
              }));

          const batch = writeBatch(db);
          // Save members as array field inside group doc
          batch.set(groupRef, {
            ...data.group,
            id: groupRef.id,
            groupId: groupRef.id,
            group_id: groupRef.id,
            members: membersArray
          }, { merge: true });

          // Save members as sub-collection: groups/{groupRef.id}/members
          // AND in group_members and groupMembers collections
          membersArray.forEach((m: any) => {
            const memberDocRef = doc(db, 'groups', groupRef.id, 'members', m.id);
            batch.set(memberDocRef, { ...m, groupId: groupRef.id, group_id: groupRef.id }, { merge: true });

            const rootMemberRef = doc(db, 'group_members', m.id);
            batch.set(rootMemberRef, { ...m, groupId: groupRef.id, group_id: groupRef.id }, { merge: true });

            const legacyMemberRef = doc(db, 'groupMembers', m.id);
            batch.set(legacyMemberRef, { ...m, groupId: groupRef.id, group_id: groupRef.id }, { merge: true });
          });

          await batch.commit();
          console.log('[handleCreateGroup] batch committed successfully. Group ID:', groupRef.id, 'Members:', membersArray.length);
        } catch (batchErr) {
          console.warn('[handleCreateGroup] Firestore batch commit error:', batchErr);
        }
      }

      onSuccess({
        group: data.group,
        adminMember: data.adminMember,
        adminProfile: data.adminProfile || adminProfileObj || currentUser
      });
    } catch (err: any) {
      setError(err.message || 'Error creating group');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-[#008751] transition-colors mb-5 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to options</span>
      </button>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center space-x-1.5 rounded-full bg-[#E6F3ED] px-3.5 py-1 text-xs font-bold text-[#008751] mb-2.5">
            <span>Group Creation Flow</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Create Savings Group & Generate Member Virtual Accounts
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Configure group contribution parameters and enter all members. Packing order corresponds strictly to the order entered below (Member 1 packs first).
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs font-medium text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* STEP 1: GROUP PARAMETERS */}
          <div className="space-y-5 rounded-2xl bg-slate-50/70 p-6 border border-slate-200/80">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#008751] text-xs font-bold text-white">
                1
              </span>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                Step 1: Group Parameters
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Group Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Group Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Adeola Group"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-semibold text-slate-900 bg-white transition"
                />
              </div>

              {/* Number of Members (Allow 5, 8, 10, 12, 15, 20, 30) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Number of Members <span className="text-rose-500">*</span>
                </label>
                <select
                  value={memberLimit}
                  onChange={(e) => handleMemberCountChange(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-bold text-slate-900 bg-white transition cursor-pointer"
                >
                  {MEMBER_COUNT_OPTIONS.map((num) => (
                    <option key={num} value={num}>
                      {num} Members
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Dynamically generates {memberLimit} member rows below.
                </span>
              </div>

              {/* Contribution Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contribution Amount (₦) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₦</span>
                  <input
                    type="number"
                    min={100}
                    max={100000}
                    step={100}
                    required
                    value={contributionAmount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setContributionAmount(isNaN(val) ? 100 : Math.min(100000, Math.max(100, val)));
                    }}
                    placeholder="e.g. 10,000"
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-bold font-mono text-slate-900 bg-white transition"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Amount each member contributes per cycle (₦100 – ₦100,000).
                </span>
              </div>

              {/* Cycle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Cycle <span className="text-rose-500">*</span>
                </label>
                <select
                  value={cycleType}
                  onChange={(e) => setCycleType(e.target.value as PackingCycle)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm bg-white font-medium text-slate-900 transition cursor-pointer"
                >
                  {ALLOWED_CYCLES.map((cycle) => (
                    <option key={cycle} value={cycle}>
                      {cycle}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Interval for each member packing turn.
                </span>
              </div>

              {/* Pack Fee */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Pack Fee (₦) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₦</span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    required
                    value={packingFee}
                    onChange={(e) => setPackingFee(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="e.g. 15,000"
                    className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-bold font-mono text-slate-900 bg-white transition"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Presets:</span>
                  {[3000, 5000, 10000, 15000, 20000].map((fPreset) => (
                    <button
                      key={fPreset}
                      type="button"
                      onClick={() => setPackingFee(fPreset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        packingFee === fPreset
                          ? 'bg-[#008751] text-white'
                          : 'bg-white hover:bg-[#E6F3ED] text-slate-700 hover:text-[#008751] border border-slate-200'
                      }`}
                    >
                      ₦{fPreset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pack Amount Display (Total) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Pack Amount (Total Pot)
                </label>
                <div className="px-4 py-3 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
                  <span className="text-xs text-emerald-800 font-medium">
                    {memberLimit} members × ₦{contributionAmount.toLocaleString()}
                  </span>
                  <span className="text-base sm:text-lg font-black text-emerald-900 font-mono">
                    {formatNaira(packAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                  <span>Member Net Payout:</span>
                  <span className="font-bold text-[#008751] font-mono">
                    {formatNaira(memberReceives)} (after ₦{packingFee.toLocaleString()} fee)
                  </span>
                </div>
              </div>
            </div>

            {/* Admin WhatsApp */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Group Admin WhatsApp Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="e.g. 08012345678"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-mono text-slate-900 bg-white transition"
                />
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </div>

          {/* STEP 2: DYNAMIC FORM DISPLAY (INSTANT) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#008751] text-xs font-bold text-white">
                2
              </span>
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                  Step 2: Enter Member Details ({memberLimit} Members)
                </h2>
                <p className="text-xs font-bold text-[#008751] mt-0.5">
                  The order you enter is the packing order. Member 1 will pack first.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50/80 border border-amber-200 p-4 text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
              <span className="text-amber-600 font-bold text-sm">💡</span>
              <div>
                <strong>Rotation Order Guaranteed:</strong> Member 1 packs on cycle 1, Member 2 packs on cycle 2, up to Member {memberLimit} who packs last. A dedicated Moniepoint Virtual Account named <code className="bg-amber-100/80 px-1.5 py-0.5 rounded text-amber-950 font-bold">BETTERAJO-[MEMBER NAME]</code> will be auto-generated for each member.
              </div>
            </div>

            {/* Dynamic Member Rows */}
            <div className="space-y-3">
              {members.map((member, index) => {
                const rowNum = index + 1;
                const isFirst = rowNum === 1;
                const isLast = rowNum === members.length;

                return (
                  <div
                    key={index}
                    className={`rounded-2xl border p-4 transition-all ${
                      isFirst
                        ? 'border-emerald-300 bg-emerald-50/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center h-6 w-7 rounded-lg bg-slate-900 text-white font-mono font-bold text-xs">
                          #{rowNum}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          Member {rowNum}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isFirst
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isLast
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          Packs {getPositionSuffix(rowNum)} {isFirst ? '(First)' : isLast ? '(Last)' : ''}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Auto Account: BETTERAJO-{member.full_name ? member.full_name.trim().toUpperCase() : `MEMBER${rowNum}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Full Name */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Full Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={member.full_name}
                          onChange={(e) => updateMemberRow(index, 'full_name', e.target.value)}
                          placeholder={`e.g. ${isFirst ? 'Adeola Ogunleye' : 'John Musa'}`}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] outline-none text-xs font-medium text-slate-900 bg-white transition"
                        />
                      </div>

                      {/* Phone Number */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Phone Number (11 Digits) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          maxLength={11}
                          value={member.phone}
                          onChange={(e) => updateMemberRow(index, 'phone', e.target.value.replace(/\D/g, ''))}
                          placeholder="e.g. 08012345678"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] outline-none text-xs font-mono font-medium text-slate-900 bg-white transition"
                        />
                      </div>

                      {/* Bank Account Number */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Bank Account (10 Digits) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={10}
                          value={member.account_number}
                          onChange={(e) => updateMemberRow(index, 'account_number', e.target.value.replace(/\D/g, ''))}
                          placeholder="10-digit NUBAN"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] outline-none text-xs font-mono font-medium text-slate-900 bg-white transition"
                        />
                      </div>

                      {/* Bank Name */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Bank Name <span className="text-slate-400 font-normal">(Optional)</span>
                        </label>
                        <select
                          value={member.bank_name}
                          onChange={(e) => updateMemberRow(index, 'bank_name', e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-1 focus:ring-[#008751] outline-none text-xs bg-white text-slate-800 transition cursor-pointer"
                        >
                          {NIGERIAN_BANKS.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group Admin Account Information (if not logged in) */}
          {!currentUser && (
            <div className="space-y-4 rounded-2xl bg-slate-50/70 p-6 border border-slate-200/80">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Group Admin Account Setup (For login & admin console)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admin Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Babatunde Adeleke"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-xs text-slate-900 bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admin Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-xs text-slate-900 bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admin Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Admin password"
                      className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-xs text-slate-900 bg-white transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admin Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="08012345678"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-xs font-mono text-slate-900 bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admin Bank Name <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-xs bg-white text-slate-900 transition cursor-pointer"
                  >
                    {NIGERIAN_BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admin Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit NUBAN"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-xs font-mono text-slate-900 bg-white transition"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Verification <span className="text-rose-500">*</span>
                    </label>
                    <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setVerificationType('BVN')}
                        className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                          verificationType === 'BVN' ? 'bg-[#008751] text-white shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        BVN
                      </button>
                      <button
                        type="button"
                        onClick={() => setVerificationType('NIN')}
                        className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                          verificationType === 'NIN' ? 'bg-[#008751] text-white shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        NIN
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    value={verificationNumber}
                    onChange={(e) => setVerificationNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder={`11-digit ${verificationType}`}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-xs font-mono text-slate-900 bg-white transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SUBMIT BUTTON */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 rounded-2xl bg-[#008751] py-4 px-6 text-sm sm:text-base font-extrabold text-white shadow-xl shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.008] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Creating Group & Generating Moniepoint Virtual Accounts...</span>
                </>
              ) : (
                <span>Create Group and Generate Virtual Accounts</span>
              )}
            </button>
            <p className="text-center text-xs text-slate-500 mt-2.5">
              All {memberLimit} members will be created in sequential packing order with individual dedicated Moniepoint Virtual Accounts.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
