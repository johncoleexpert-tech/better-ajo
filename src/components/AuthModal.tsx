import React, { useState } from 'react';
import { Shield, ArrowRight, Wallet, Users, Loader2, X, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { apiRequest } from '../lib/api.js';
import { PackAjoLogo } from './PackAjoLogo.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'choice' | 'login';
  onSelectPersonal: () => void;
  onSelectGroup: () => void;
  onLoginSuccess: (userData: any) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  mode,
  onSelectPersonal,
  onSelectGroup,
  onLoginSuccess
}) => {
  // Tabs for account authentication
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');

  // Form Fields - Email & Password ONLY
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Hidden Phone & OTP variables preserved so no dependencies break
  const [phone, setPhone] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [testCode, setTestCode] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset input state when modal is opened or mode changes
  React.useEffect(() => {
    if (isOpen) {
      setEmail('');
      setPassword('');
      setFullName('');
      setShowPassword(false);
      setError(null);
      setLoading(false);
      setAuthTab('login');
      // Hidden state cleanup
      setPhone('');
      setOtpStep(false);
      setOtpCode('');
      setTestCode(null);
    }
  }, [isOpen, mode]);

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setError(null);
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });

      onLoginSuccess(data);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password
        })
      });

      onLoginSuccess(data);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const autofillSuperAdmin = () => {
    setEmail('superadmin@packajo.ng');
    setPassword('admin123');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#008751] px-6 py-4.5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-white/90" />
            <span className="font-bold text-base tracking-tight">
              {mode === 'choice' ? 'Create New Better Ajo' : 'Account Access'}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 sm:p-8">
          <div className="flex justify-center mb-4">
            <PackAjoLogo size="sm" showText={true} />
          </div>

          {mode === 'choice' ? (
            <div>
              <div className="text-center mb-6">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  WHAT WOULD YOU LIKE TO CREATE?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Select the product that matches your savings goal:
                </p>
              </div>

              <div className="space-y-4">
                {/* Option 1: Personal Better Ajo */}
                <button
                  onClick={() => {
                    onClose();
                    onSelectPersonal();
                  }}
                  className="w-full text-left p-5 rounded-2xl border-2 border-slate-200 bg-[#f0f9f4]/40 hover:border-[#008751] hover:bg-[#f0f9f4] transition-all group flex items-start space-x-4 cursor-pointer"
                >
                  <div className="h-10 w-10 rounded-xl bg-[#008751] text-white flex items-center justify-center font-bold shrink-0 mt-0.5 group-hover:scale-105 transition-transform shadow-xs">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-[#E6F3ED] px-2 py-0.5 rounded-full mb-1">
                      Option 1
                    </div>
                    <div className="text-base font-black text-slate-900">
                      PERSONAL BETTER AJO
                    </div>
                    <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Save money for yourself. One-time ₦600 platform activation fee.
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-[#008751] group-hover:translate-x-1 transition-transform mt-2.5" />
                </button>

                {/* Option 2: Group Better Ajo */}
                <button
                  onClick={() => {
                    onClose();
                    onSelectGroup();
                  }}
                  className="w-full text-left p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-[#008751] hover:bg-[#f0f9f4]/40 transition-all group flex items-start space-x-4 cursor-pointer"
                >
                  <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 group-hover:scale-105 transition-transform shadow-xs">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-[#E6F3ED] px-2 py-0.5 rounded-full mb-1">
                      Option 2
                    </div>
                    <div className="text-base font-black text-slate-900">
                      GROUP BETTER AJO
                    </div>
                    <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Create and manage a savings group (5 to 50 members). Members pay ₦0 joining fee.
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-[#008751] group-hover:translate-x-1 transition-transform mt-2.5" />
                </button>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                <button
                  onClick={() => {
                    setAuthTab('login');
                    // switch to login form view inside modal
                    const modalEl = document.querySelector('[data-auth-container]');
                    if (modalEl) modalEl.scrollIntoView();
                  }}
                  className="text-xs font-bold text-[#008751] hover:underline cursor-pointer"
                >
                  Already have an account? Sign in with Email
                </button>
              </div>
            </div>
          ) : (
            <div data-auth-container>
              {/* Login / Sign Up Tab Switcher */}
              <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    authTab === 'login'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signup');
                    setError(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    authTab === 'signup'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <div className="text-center mb-5">
                <h3 className="text-lg font-black text-slate-900">
                  {authTab === 'login' ? 'Welcome Back' : 'Sign Up for Better Ajo'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {authTab === 'login'
                    ? 'Log in with your email and password to access Personal or Group Ajo.'
                    : 'Create your account with email and password to start saving.'}
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
                  {error}
                </div>
              )}

              {/* Login Form */}
              {authTab === 'login' ? (
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  {/* Email Input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none transition text-sm text-slate-900"
                        autoFocus
                      />
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none transition text-sm text-slate-900"
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

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Logging in...</span>
                      </>
                    ) : (
                      <span>LOG IN</span>
                    )}
                  </button>

                  {/* Super Admin Quick Helper */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Super Admin: <strong className="text-slate-700">superadmin@packajo.ng</strong></span>
                    <button
                      type="button"
                      onClick={autofillSuperAdmin}
                      className="font-bold text-[#008751] hover:underline cursor-pointer"
                    >
                      Fill Admin
                    </button>
                  </div>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('signup');
                        setError(null);
                      }}
                      className="text-xs text-slate-600 hover:text-[#008751] font-medium cursor-pointer"
                    >
                      Don't have an account? <span className="font-bold text-[#008751]">Sign Up</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Sign Up Form */
                <form onSubmit={handleEmailSignup} className="space-y-4">
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Babatunde Adeleke"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none transition text-sm text-slate-900"
                        autoFocus
                      />
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none transition text-sm text-slate-900"
                      />
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Create Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={4}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 4 characters"
                        className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-300 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none transition text-sm text-slate-900"
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

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <span>CREATE ACCOUNT & LOG IN</span>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('login');
                        setError(null);
                      }}
                      className="text-xs text-slate-600 hover:text-[#008751] font-medium cursor-pointer"
                    >
                      Already have an account? <span className="font-bold text-[#008751]">Log In</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
