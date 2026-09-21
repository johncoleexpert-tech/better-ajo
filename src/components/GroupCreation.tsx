import React, { useState } from 'react';
import { Shield, ArrowLeft, Users, Coins, Clock, Loader2, CheckCircle2, Copy, Share2, Mail, Lock, User, Eye, EyeOff, Phone } from 'lucide-react';
import { UserProfile, PackingCycle } from '../types/index.js';
import { NIGERIAN_BANKS, formatNaira, formatPhone } from '../lib/formatters.js';
import { OtpModal } from './OtpModal.js';
import { apiRequest } from '../lib/api.js';

interface GroupCreationProps {
  currentUser: UserProfile | null;
  onBack: () => void;
  onSuccess: (groupData: any) => void;
}

const ALLOWED_CYCLES: PackingCycle[] = [
  'Every Day',
  'Every 3 Days',
  'Every 4 Days',
  'Every 5 Days',
  'Every 7 Days',
  'Every 14 Days',
  'Every Month'
];

export const GroupCreation: React.FC<GroupCreationProps> = ({
  currentUser,
  onBack,
  onSuccess
}) => {
  // Group Parameters
  const [groupName, setGroupName] = useState('Family Monthly Pack');
  const [memberLimit, setMemberLimit] = useState(10);
  const [contributionAmount, setContributionAmount] = useState(50000);
  const [cycleType, setCycleType] = useState<PackingCycle>('Every Month');
  const [packingFee, setPackingFee] = useState<number>(3000);
  const [whatsappNumber, setWhatsappNumber] = useState(currentUser?.whatsapp_number || currentUser?.whatsappNumber || currentUser?.phone || '');

  // Admin Profile (if not logged in)
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState(currentUser?.phone || `080${Math.floor(10000000 + Math.random() * 90000000)}`);
  const [bankName, setBankName] = useState(currentUser?.bank_name || NIGERIAN_BANKS[0]);
  const [accountNumber, setAccountNumber] = useState(currentUser?.account_number || '');
  const [verificationType, setVerificationType] = useState<'NIN' | 'BVN'>(currentUser?.verification_type || 'BVN');
  const [verificationNumber, setVerificationNumber] = useState(currentUser?.verification_number || '');

  // OTP state preserved so no dependencies break
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [testOtpCode, setTestOtpCode] = useState<string | undefined>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-calculated packing amount and member receive amount
  const packingAmount = memberLimit * contributionAmount;
  const memberReceives = Math.max(0, packingAmount - packingFee);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (memberLimit < 2 || memberLimit > 50) {
      setError('Number of contributors must be between 2 and 50 strictly.');
      return;
    }
    if (contributionAmount < 100 || contributionAmount > 100000) {
      setError('Contribution amount must be between ₦100 and ₦100,000.');
      return;
    }
    if (packingFee < 0) {
      setError('Packing fee / deduction cannot be negative.');
      return;
    }
    if (packingFee >= packingAmount) {
      setError('Packing fee / deduction must be less than the total packing amount.');
      return;
    }
    if (!groupName.trim()) {
      setError('Group name is required.');
      return;
    }

    if (!currentUser) {
      if (!fullName.trim() || !email.trim() || !password || !bankName || !accountNumber || !verificationNumber) {
        setError('Please fill in all required admin registration fields.');
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
      if (accountNumber.length !== 10) {
        setError('Bank account number must be 10 digits.');
        return;
      }
      if (verificationNumber.length !== 11) {
        setError(`${verificationType} must be 11 digits.`);
        return;
      }

      // Direct registration using email and password
      try {
        setLoading(true);
        setError(null);
        const profData = await apiRequest('/api/auth/register-profile', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
            password,
            phone,
            bank_name: bankName,
            account_number: accountNumber,
            verification_type: verificationType,
            verification_number: verificationNumber
          })
        });

        executeCreateGroup(profData.profile.id, profData.profile.full_name, profData.profile);
      } catch (err: any) {
        setError(err.message || 'Error creating admin account');
        setLoading(false);
      }
    } else {
      // User already logged in, proceed directly with group creation
      executeCreateGroup(currentUser.id, currentUser.full_name, currentUser);
    }
  };

  const handleOtpVerified = async (code: string) => {
    setShowOtpModal(false);
  };

  const executeCreateGroup = async (adminId: string, adminName: string, adminProfileObj?: UserProfile) => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiRequest('/api/groups/create', {
        method: 'POST',
        body: JSON.stringify({
          admin_id: adminId,
          admin_name: adminName,
          group_name: groupName,
          member_limit: Number(memberLimit),
          contribution_amount: Number(contributionAmount),
          cycle_type: cycleType,
          packing_fee: Number(packingFee),
          whatsapp_number: whatsappNumber,
          whatsappNumber: whatsappNumber
        })
      });

      onSuccess({
        group: data.group,
        adminMember: data.adminMember,
        adminProfile: data.adminProfile || adminProfileObj || currentUser
      });
    } catch (err: any) {
      setError(err.message || 'Error creating group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-[#008751] transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to options</span>
      </button>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm">
        <div className="mb-6">
          <div className="inline-flex items-center space-x-1.5 rounded-full bg-[#E6F3ED] px-3.5 py-1 text-xs font-bold text-[#008751] mb-2.5">
            <span>Group Better Ajo Setup</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Create & Manage a Savings Group
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            As Group Admin, you define the contribution amount, rotation cycle, and member capacity.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
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
              placeholder="e.g. Family Monthly Pack"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-semibold text-slate-900 transition"
            />
          </div>

          {/* Group Admin WhatsApp Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Admin WhatsApp Number <span className="text-slate-400 font-normal lowercase">(for member coordination & reminders)</span>
            </label>
            <div className="relative">
              <input
                type="tel"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. 08012345678 or +2348012345678"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-mono text-slate-900 transition"
              />
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Enables members to reach you and receive instant notifications via WhatsApp.
            </span>
          </div>

          {/* Number of Contributors (2 to 50 strictly) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Contributors (Min: 2, Max: 50) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={2}
                max={50}
                required
                value={memberLimit}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setMemberLimit(isNaN(val) ? 2 : Math.min(50, Math.max(2, val)));
                }}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-bold font-mono text-slate-900 transition"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Excludes Group Admin (2–50 contributors)</span>
            </div>

            {/* Contribution Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Contribution (₦100 – ₦100,000) <span className="text-rose-500">*</span>
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
                  className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-bold font-mono text-slate-900 transition"
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">Min ₦100, Max ₦100,000</span>
            </div>
          </div>

          {/* Packing Cycle */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Packing Cycle <span className="text-rose-500">*</span>
            </label>
            <select
              value={cycleType}
              onChange={(e) => setCycleType(e.target.value as PackingCycle)}
              className="w-full px-3.5 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm bg-white font-medium text-slate-900 transition cursor-pointer"
            >
              {ALLOWED_CYCLES.map((cycle) => (
                <option key={cycle} value={cycle}>
                  {cycle}
                </option>
              ))}
            </select>
          </div>

          {/* Packing Fee / Deduction */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Packing Fee / Deduction <span className="text-rose-500">*</span>
            </label>
            <p className="text-[12px] text-slate-500 mb-2 leading-relaxed">
              Enter the amount that will be deducted from each member’s packing amount when it is their turn to pack.
            </p>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₦</span>
              <input
                type="number"
                min={0}
                step={500}
                required
                value={packingFee}
                onChange={(e) => setPackingFee(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-bold font-mono text-slate-900 transition"
              />
            </div>
            {/* Quick preset buttons */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] text-slate-400 font-medium mr-1">Quick select:</span>
              {[500, 1000, 2000, 3000, 5000].map((feePreset) => (
                <button
                  key={feePreset}
                  type="button"
                  onClick={() => setPackingFee(feePreset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    packingFee === feePreset
                      ? 'bg-[#008751] text-white'
                      : 'bg-slate-100 hover:bg-[#E6F3ED] text-slate-700 hover:text-[#008751]'
                  }`}
                >
                  ₦{feePreset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-calculated Packing Amount & Breakdown Display */}
          <div className="rounded-2xl bg-[#E6F3ED]/70 border border-[#008751]/20 p-5 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#008751]">
              Automatic Packing Calculation
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-[#008751]/15">
              <div>
                <span className="text-[11px] font-bold uppercase text-slate-500 block">Packing Amount</span>
                <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
                  {formatNaira(packingAmount)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {memberLimit} members × {formatNaira(contributionAmount)}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase text-slate-500 block">Packing Fee</span>
                <span className="text-lg sm:text-xl font-black text-rose-600 font-mono block">
                  {formatNaira(packingFee)}
                </span>
                <span className="text-[10px] text-slate-500">
                  Deducted per turn
                </span>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase text-[#008751] block">Amount Member Receives</span>
                <span className="text-lg sm:text-xl font-black text-[#008751] font-mono block">
                  {formatNaira(memberReceives)}
                </span>
                <span className="text-[10px] text-[#008751]">
                  Lump sum payout
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-600 pt-1 leading-relaxed border-t border-[#008751]/10">
              When it is a member's turn to pack, the <strong>{formatNaira(packingFee)}</strong> deduction is applied and the member receives <strong>{formatNaira(memberReceives)}</strong> directly to their verified bank account.
            </p>
          </div>

          {/* Admin Details Section (only if not logged in) */}
          {!currentUser && (
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Group Admin Account Information
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Babatunde Adeleke"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm text-slate-900 transition"
                  />
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address (For Admin Login) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm text-slate-900 transition"
                  />
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create admin password"
                    className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm text-slate-900 transition"
                  />
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Bank Name <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm bg-white text-slate-900 transition cursor-pointer"
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
                    Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit NUBAN"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-mono text-slate-900 transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Verification <span className="text-rose-500">*</span>
                  </label>
                  <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setVerificationType('BVN')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        verificationType === 'BVN' ? 'bg-[#008751] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      BVN
                    </button>
                    <button
                      type="button"
                      onClick={() => setVerificationType('NIN')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        verificationType === 'NIN' ? 'bg-[#008751] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-mono text-slate-900 transition"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating Group Better Ajo...</span>
              </>
            ) : (
              <span>CREATE GROUP AJO (₦0 FEE)</span>
            )}
          </button>
        </form>
      </div>

      {/* OTP Modal */}
      <OtpModal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        phone={phone}
        purpose="register"
        title="Verify Admin Phone"
        description="Enter the verification code to finalize group admin creation."
        initialTestCode={testOtpCode}
        onSuccess={handleOtpVerified}
      />
    </div>
  );
};
