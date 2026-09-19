import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Loader2, X, ShieldCheck } from 'lucide-react';

export interface OtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone?: string;
  purpose?: string;
  title?: string;
  description?: string;
  amountDisplay?: string;
  initialTestCode?: string;
  onSuccess: (password: string) => Promise<void> | void;
}

export const OtpModal: React.FC<OtpModalProps> = ({
  isOpen,
  onClose,
  title = 'Authorize Transfer',
  description,
  amountDisplay,
  onSuccess
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setShowPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Determine the display prompt
  let promptText = description;
  if (!promptText) {
    if (amountDisplay) {
      promptText = `Enter your login password to authorize transfer of ${amountDisplay}`;
    } else {
      promptText = 'Enter your login password to authorize transfer';
    }
  }

  // Ensure prompt explicitly matches "Enter your login password to authorize transfer of [amount]"
  if (amountDisplay && !promptText.toLowerCase().includes('password to authorize transfer')) {
    promptText = `Enter your login password to authorize transfer of ${amountDisplay}`;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter your login password to authorize transfer.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSuccess(password);
    } catch (e: any) {
      setError(e.message || 'Verification failed. Please check your password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#008751] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-white/15 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="font-black text-sm tracking-wide block">{title}</span>
              <span className="text-[10px] text-emerald-100 uppercase tracking-wider font-semibold">Security Authorization</span>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-1.5 text-emerald-100 hover:bg-white/20 hover:text-white transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100 p-4 mb-5">
            <p className="text-xs font-bold text-emerald-950 leading-relaxed text-center">
              {promptText}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-semibold flex items-center space-x-2">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Login Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your login password"
                  autoFocus
                  required
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 focus:border-[#008751] focus:ring-2 focus:ring-[#008751]/20 outline-none text-sm font-medium text-slate-900 transition placeholder:text-slate-400 bg-slate-50/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !password.trim()}
                className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 px-4 text-xs font-bold text-white shadow-lg shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.01] active:scale-[0.99] transition disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying & Authorizing...</span>
                  </>
                ) : (
                  <span>Verify & Proceed</span>
                )}
              </button>
            </div>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
            >
              Cancel Transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
