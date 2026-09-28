import React, { useState, useEffect } from 'react';
import { Shield, ArrowLeft, Users, Coins, Clock, Loader2, CheckCircle2, AlertTriangle, KeyRound, Mail, Lock, User, Eye, EyeOff, Phone } from 'lucide-react';
import { UserProfile, GroupAjo } from '../types/index.js';
import { NIGERIAN_BANKS, formatNaira, formatPhone } from '../lib/formatters.js';
import { apiRequest } from '../lib/api.js';

interface GroupJoinProps {
  initialCode?: string;
  currentUser: UserProfile | null;
  onBack: () => void;
  onSuccess: (data: { group: GroupAjo; member: any }) => void;
}

export const GroupJoin: React.FC<GroupJoinProps> = ({
  initialCode = '',
  currentUser,
  onBack,
  onSuccess
}) => {
  const [groupCode, setGroupCode] = useState(initialCode.toUpperCase());
  const [groupPreview, setGroupPreview] = useState<{
    group: GroupAjo;
    totalMembers: number;
    availableSlots: number;
    isFull: boolean;
  } | null>(null);

  // Registration fields (prefilled if user logged in)
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState(currentUser?.phone || `080${Math.floor(10000000 + Math.random() * 90000000)}`);
  const [whatsappNumber, setWhatsappNumber] = useState(currentUser?.whatsapp_number || currentUser?.whatsappNumber || currentUser?.phone || '');
  const [bankName, setBankName] = useState(currentUser?.bank_name || NIGERIAN_BANKS[0]);
  const [accountNumber, setAccountNumber] = useState(currentUser?.account_number || '');
  const [verificationType, setVerificationType] = useState<'NIN' | 'BVN'>(currentUser?.verification_type || 'BVN');
  const [verificationNumber, setVerificationNumber] = useState(currentUser?.verification_number || '');

  // OTP state preserved so no dependencies break
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [testOtpCode, setTestOtpCode] = useState<string | undefined>();

  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCode) {
      handleLookup(initialCode);
    }
  }, [initialCode]);

  const handleLookup = async (codeToLookup: string) => {
    const code = codeToLookup.trim().toUpperCase();
    if (!code) return;

    try {
      setLookupLoading(true);
      setError(null);
      const data = await apiRequest(`/api/groups/lookup/${encodeURIComponent(code)}`);
      setGroupPreview(data);
    } catch (err: any) {
      setGroupPreview(null);
      setError(err.message || 'Could not find group with this code.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupPreview) return;
    if (groupPreview.isFull) {
      setError('This Better Ajo group is currently full.');
      return;
    }

    if (!fullName.trim() || !bankName || !accountNumber || !verificationNumber) {
      setError('Please fill in all required registration fields.');
      return;
    }
    if (!currentUser && (!email.trim() || !password)) {
      setError('Please provide your email and password to create your account.');
      return;
    }
    if (!currentUser && (!email.includes('@') || !email.includes('.'))) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!currentUser && password.length < 4) {
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

    // Direct join without OTP
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/groups/join', {
        method: 'POST',
        body: JSON.stringify({
          group_code: groupPreview.group.group_code,
          full_name: fullName.trim(),
          email: (currentUser?.email || email).trim().toLowerCase(),
          password: password || undefined,
          phone,
          whatsapp_number: whatsappNumber,
          whatsappNumber: whatsappNumber,
          bank_name: bankName,
          account_number: accountNumber,
          verification_type: verificationType,
          verification_number: verificationNumber
        })
      });

      const userProfile = data.profile || {
        id: data.member?.user_id || currentUser?.id || `usr_${Date.now()}`,
        full_name: fullName.trim(),
        email: (currentUser?.email || email).trim().toLowerCase(),
        phone: currentUser?.phone || phone,
        whatsapp_number: whatsappNumber || currentUser?.whatsapp_number || phone,
        whatsappNumber: whatsappNumber || currentUser?.whatsapp_number || phone,
        bank_name: bankName,
        account_number: accountNumber,
        verification_type: verificationType,
        verification_number: verificationNumber,
        role: 'MEMBER',
        created_at: new Date().toISOString()
      };

      onSuccess({
        ...data,
        profile: userProfile
      });
    } catch (err: any) {
      setError(err.message || 'Error joining group');
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
        <span>Back to homepage</span>
      </button>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm">
        <div className="mb-6">
          <div className="inline-flex items-center space-x-1.5 rounded-full bg-[#E6F3ED] px-3.5 py-1 text-xs font-bold text-[#008751] mb-2.5">
            <span>Join Group Better Ajo</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Enter Group Invitation Code
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Enter the unique 5-character group code shared by your Group Admin.
          </p>
        </div>

        {/* Code Input */}
        <div className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
              placeholder="Enter invitation code"
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-base font-bold font-mono tracking-wider uppercase text-slate-900 transition"
            />
            <button
              type="button"
              disabled={lookupLoading || !groupCode.trim()}
              onClick={() => handleLookup(groupCode)}
              className="px-5 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs transition-all shadow-md shadow-[#008751]/15 disabled:opacity-50 cursor-pointer"
            >
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>LOOKUP</span>}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        {/* Group Preview Details as required by prompt Section 18 */}
        {groupPreview && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#E6F3ED]/60 border border-[#008751]/20 p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#008751]">
                    Group Better Ajo Preview
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-0.5">
                    {groupPreview.group.group_name}
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold bg-[#E6F3ED] text-[#008751] px-3 py-1 rounded-lg border border-[#008751]/10">
                  {groupPreview.group.group_code}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs pt-3.5 border-t border-[#008751]/15">
                <div>
                  <span className="text-slate-500 font-medium block">Contribution:</span>
                  <span className="font-extrabold text-slate-900 text-sm font-mono">
                    {formatNaira(groupPreview.group.contribution_amount)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Packing Amount:</span>
                  <span className="font-extrabold text-[#008751] text-sm font-mono">
                    {formatNaira(groupPreview.group.packing_amount)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Cycle:</span>
                  <span className="font-extrabold text-slate-900">{groupPreview.group.cycle_type}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Capacity:</span>
                  <span className="font-extrabold text-slate-900">{groupPreview.group.member_limit} Members</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Joined Members:</span>
                  <span className="font-extrabold text-slate-900">{groupPreview.totalMembers}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Available Slots:</span>
                  <span className={`font-extrabold text-sm ${groupPreview.availableSlots > 0 ? 'text-[#008751] font-mono' : 'text-rose-600'}`}>
                    {groupPreview.availableSlots} Left
                  </span>
                </div>
              </div>

              {/* Group Full Notice if at capacity */}
              {groupPreview.isFull ? (
                <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>This Better Ajo group is currently full. No additional members can join at this time.</span>
                </div>
              ) : (
                <div className="mt-4 p-3 rounded-xl bg-[#E6F3ED] border border-[#008751]/20 text-[#008751] text-xs font-semibold flex items-center justify-between">
                  <span>Joining Fee: <strong className="font-bold">₦0</strong> (Free for Group Members)</span>
                  <span className="text-[11px] bg-white px-2.5 py-0.5 rounded-lg text-[#008751] font-bold shadow-xs">
                    Next Join: Position {groupPreview.totalMembers + 1}
                  </span>
                </div>
              )}
            </div>

            {/* Registration Form to Join */}
            {!groupPreview.isFull && (
              <form onSubmit={handleJoinSubmit} className="space-y-4 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Member Registration Details
                </div>

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
                      placeholder="e.g. David Adeleke"
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm text-slate-900 transition"
                    />
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  </div>
                </div>

                {/* Member WhatsApp Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    WhatsApp Phone Number <span className="text-slate-400 font-normal lowercase">(for admin reminders & notifications)</span>
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
                    Your Group Admin can send direct turn notifications and payout alerts via WhatsApp.
                  </span>
                </div>

                {!currentUser && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Email Address (For Account Login) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="member@example.com"
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
                          placeholder="Create account password"
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
                  </>
                )}

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
                      Identity Verification (NIN OR BVN) <span className="text-rose-500">*</span>
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
                    placeholder={`Enter 11-digit ${verificationType}`}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-mono text-slate-900 transition"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Choose NIN or BVN. Used for payout verification to your registered account.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Joining Group...</span>
                    </>
                  ) : (
                    <span>JOIN GROUP (₦0 FEE)</span>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
