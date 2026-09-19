import React, { useState } from 'react';
import { ArrowLeft, Loader2, CreditCard, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { NIGERIAN_BANKS } from '../lib/formatters.js';
import { PaystackModal } from './PaystackModal.js';
import { OtpModal } from './OtpModal.js';
import { apiRequest } from '../lib/api.js';

interface PersonalRegistrationProps {
  onBack: () => void;
  onSuccess: (userData: any) => void;
}

export const PersonalRegistration: React.FC<PersonalRegistrationProps> = ({
  onBack,
  onSuccess
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Phone state preserved internally without rendering phone UI
  const [phone, setPhone] = useState(`080${Math.floor(10000000 + Math.random() * 90000000)}`);
  const [bankName, setBankName] = useState(NIGERIAN_BANKS[0]);
  const [accountNumber, setAccountNumber] = useState('');
  const [verificationType, setVerificationType] = useState<'NIN' | 'BVN'>('BVN');
  const [verificationNumber, setVerificationNumber] = useState('');

  // OTP flow state preserved so no dependencies break
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [testOtpCode, setTestOtpCode] = useState<string | undefined>();
  const [verifiedOtp, setVerifiedOtp] = useState<string | null>(null);

  // Paystack flow state
  const [showPaystackModal, setShowPaystackModal] = useState(false);
  const [paystackData, setPaystackData] = useState<{ reference: string; authorization_url?: string; isTestMode?: boolean } | null>(null);
  const [registeredProfile, setRegisteredProfile] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password || !bankName || !accountNumber || !verificationNumber) {
      setError('Please complete all required fields.');
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
      setError('Nigerian bank account number must be 10 digits.');
      return;
    }
    if (verificationNumber.length !== 11) {
      setError(`${verificationType} must be exactly 11 digits.`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Direct registration with Email and Password (No phone OTP required)
      const data = await apiRequest('/api/personal/register', {
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

      setRegisteredProfile(data.profile);
      setPaystackData(data.paystack);
      setShowPaystackModal(true);
    } catch (err: any) {
      setError(err.message || 'Error initializing registration');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerified = async (code: string) => {
    setShowOtpModal(false);
    setVerifiedOtp(code);
  };

  const handlePaystackConfirmed = async () => {
    if (!registeredProfile || !paystackData) return;

    try {
      setLoading(true);
      // Secure server-side verification of Paystack transaction
      const data = await apiRequest('/api/personal/verify-fee', {
        method: 'POST',
        body: JSON.stringify({
          userId: registeredProfile.id,
          reference: paystackData.reference
        })
      });

      // Brief delay to let the user see the success confirmation state
      setTimeout(() => {
        setShowPaystackModal(false);
        onSuccess({
          profile: registeredProfile,
          personalAjo: data.personalAjo
        });
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Payment verification failed');
      throw err;
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
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center space-x-1.5 rounded-full bg-[#E6F3ED] px-3.5 py-1 text-xs font-bold text-[#008751] mb-2.5">
            <span>Personal Better Ajo Registration</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Create Your Personal Savings Account
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Complete your profile using your email and password to start your personal savings journey.
          </p>
        </div>

        {/* Fee Notice */}
        <div className="mb-6 rounded-2xl bg-[#E6F3ED]/70 border border-[#008751]/20 p-4.5 text-xs text-slate-800 flex items-start space-x-3.5">
          <CreditCard className="h-5 w-5 text-[#008751] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-sm block mb-0.5 text-slate-900">Platform Activation Fee: ₦600</span>
            <span className="text-slate-600 leading-relaxed">
              Personal Better Ajo requires a one-time ₦600 platform activation fee paid securely via Paystack. Your account is activated immediately upon verified payment.
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleStartRegistration} className="space-y-4.5">
          {/* Full Name */}
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

          {/* Email Address */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Email Address (Used for Login) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="babatunde@example.com"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm text-slate-900 transition"
              />
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            </div>
          </div>

          {/* Password */}
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
                placeholder="Create a password (min 4 characters)"
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

          {/* Bank Account Details */}
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

          {/* NIN OR BVN */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Identity Verification <span className="text-rose-500">*</span>
              </label>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setVerificationType('BVN');
                    setVerificationNumber('');
                  }}
                  className={`px-3.5 py-1 rounded-lg transition-all cursor-pointer ${
                    verificationType === 'BVN'
                      ? 'bg-[#008751] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  BVN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVerificationType('NIN');
                    setVerificationNumber('');
                  }}
                  className={`px-3.5 py-1 rounded-lg transition-all cursor-pointer ${
                    verificationType === 'NIN'
                      ? 'bg-[#008751] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
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
              Select either NIN or BVN. Verified securely with Nigeria Inter-Bank Settlement System (NIBSS).
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
                <span>Processing...</span>
              </>
            ) : (
              <span>Proceed to Pay ₦600 Platform Fee</span>
            )}
          </button>
        </form>
      </div>

      {/* OTP Verification Modal preserved safely */}
      <OtpModal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        phone={phone}
        purpose="register"
        title="Verify Phone to Continue"
        description="Enter the 6-digit verification code sent to your phone number before Paystack payment."
        initialTestCode={testOtpCode}
        onSuccess={handleOtpVerified}
      />

      {/* Paystack Payment Modal */}
      {paystackData && (
        <PaystackModal
          isOpen={showPaystackModal}
          onClose={() => setShowPaystackModal(false)}
          reference={paystackData.reference}
          amount={600}
          purpose="Personal Better Ajo Registration Fee (₦600)"
          authorizationUrl={paystackData.authorization_url}
          isTestMode={paystackData.isTestMode ?? true}
          onVerified={handlePaystackConfirmed}
        />
      )}
    </div>
  );
};
