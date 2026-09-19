import React from 'react';
import { X, Shield, Lock, FileText, CheckCircle2, Phone, Mail, MapPin, MessageSquare } from 'lucide-react';
import { PackAjoLogo } from './PackAjoLogo.js';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'about' | 'privacy';
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, type }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 text-left">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {type === 'about' ? (
          <div>
            <div className="mb-6 flex items-center gap-3">
              <PackAjoLogo size="md" />
            </div>

            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">
              About Better Ajo
            </h2>

            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              <strong>Better Ajo</strong> is Nigeria’s modern, automated digital savings and rotating credit platform. Built for everyday Nigerians, professionals, market communities, and cooperative groups, Better Ajo bridges traditional African community thrift (<em>Ajo, Esusu, Adashi</em>) with bank-grade financial technology.
            </p>

            <div className="space-y-4 mb-6">
              <div className="p-4 rounded-2xl bg-[#E6F3ED]/60 border border-[#008751]/20">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#008751] mb-1">
                  Product 1: Personal Better Ajo
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Individual automated savings account. Save toward personal goals with a one-time ₦600 registration fee. Make flexible deposits anytime via Paystack and withdraw securely to your Nigerian bank account with instant secure password authorization.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1">
                  Product 2: Group Better Ajo
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Rotating community savings with <strong>₦0 joining fee</strong> for contributors. The Group Admin sets the group size (2 to 50 members), contribution amount, and packing cycle. Order of joining transparently locks rotation positions, ensuring zero favoritism and complete accountability.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 space-y-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                <span>Verified Paystack payment gateway integration</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                <span>Transparent payouts directly into verified Nigerian bank accounts</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                <span>Strict cycle dates calculated using Nigeria standard calendar</span>
              </div>
            </div>

            {/* Customer Service WhatsApp */}
            <div className="mt-6 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  WhatsApp Customer Service
                </div>
                <div className="text-sm font-black font-mono text-slate-900 mt-0.5">
                  +44 7451 298096
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Available daily for savings & group support
                </div>
              </div>
              <a
                href="https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>CONTACT US ON WHATSAPP</span>
              </a>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[#008751] text-white text-xs font-bold hover:bg-[#007345] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-50 text-[#008751] border border-emerald-100">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  Privacy Policy
                </h2>
                <p className="text-xs text-slate-400">Effective Date: Nigeria Standard • 2026</p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-600 leading-relaxed mb-6">
              <p>
                At <strong>Better Ajo</strong>, safeguarding your personal data and financial security is our highest priority. This Privacy Policy details how we collect, use, and protect your information under the Nigeria Data Protection Regulation (NDPR).
              </p>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">1. Information We Collect</h4>
                <p>
                  We collect your full name, verified Nigerian phone number, email (optional), verified Nigerian bank account details (bank name, account number), and BVN/NIN for identity verification as mandated by financial compliance.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">2. Payment & Card Security</h4>
                <p>
                  All card transactions and deposits are securely processed through Paystack, a PCI-DSS certified payment processor. Better Ajo does not store your debit card numbers, CVVs, or card PINs on our servers.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">3. Account Security & Authorization</h4>
                <p>
                  Withdrawals and critical account operations require password verification linked to your registered email account.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">4. Group Data Sharing</h4>
                <p>
                  Within Group Better Ajo, only your authorized Group Admin has access to administrative member verification details. Members can only view contributor positions and payment status for the active cycle.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">5. Contact Information</h4>
                <p>
                  If you have any questions regarding your personal information, contact our Data Protection Officer at: <span className="font-mono text-[#008751]">privacy@betterajo.ng</span>.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[#008751] text-white text-xs font-bold hover:bg-[#007345] transition cursor-pointer"
              >
                I Understand
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
