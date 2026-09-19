import React from 'react';
import { Shield, Mail, MapPin, Lock, MessageSquare } from 'lucide-react';
import { PackAjoLogo } from './PackAjoLogo.js';

interface FooterProps {
  onOpenSuperAdmin?: () => void;
  onOpenAbout?: () => void;
  onOpenPrivacy?: () => void;
  onOpenLiveChat?: () => void;
  onScrollToSection: (sectionId: string) => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAbout,
  onOpenPrivacy,
  onOpenLiveChat,
  onScrollToSection
}) => {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 text-slate-600">
      <div className="mx-auto max-w-7xl px-6 md:px-12 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand and Mission */}
          <div className="md:col-span-2 space-y-4">
            <PackAjoLogo size="md" showText={true} />
            <p className="text-sm text-slate-500 max-w-md leading-relaxed">
              Better Ajo makes personal and group savings simple, organized and easy to manage. Built for the modern Nigerian.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#008751] bg-[#E6F3ED] px-3 py-1.5 rounded-full w-fit">
              <Shield className="h-4 w-4 text-[#008751]" />
              <span>Nigeria Only • Safe & Secure Payouts</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Quick Navigation
            </h4>
            <ul className="space-y-2.5 text-xs font-medium text-slate-600">
              {onOpenAbout && (
                <li>
                  <button
                    onClick={onOpenAbout}
                    className="hover:text-[#008751] transition cursor-pointer"
                  >
                    About Better Ajo
                  </button>
                </li>
              )}
              <li>
                <button
                  onClick={() => onScrollToSection('how-it-works')}
                  className="hover:text-[#008751] transition cursor-pointer"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  onClick={() => onScrollToSection('faq')}
                  className="hover:text-[#008751] transition cursor-pointer"
                >
                  Frequently Asked Questions
                </button>
              </li>
              {onOpenPrivacy && (
                <li>
                  <button
                    onClick={onOpenPrivacy}
                    className="hover:text-[#008751] transition cursor-pointer"
                  >
                    Privacy Policy
                  </button>
                </li>
              )}
              {onOpenLiveChat && (
                <li>
                  <button
                    onClick={onOpenLiveChat}
                    className="hover:text-[#008751] transition cursor-pointer inline-flex items-center gap-1.5 text-[#008751] font-bold"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Live Support Chat</span>
                  </button>
                </li>
              )}
              <li>
                <a
                  href="https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#008751] transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>Customer Service</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#E6F3ED] text-[#008751] font-bold">WhatsApp</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div className="space-y-3" id="contact-info">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Contact Better Ajo
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-500">
              <li className="flex items-center space-x-2">
                <MapPin className="h-4 w-4 text-[#008751] shrink-0" />
                <span>Victoria Island, Lagos, Nigeria</span>
              </li>
              <li className="flex items-start space-x-2">
                <MessageSquare className="h-4 w-4 text-[#008751] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[11px] font-bold text-slate-800">WhatsApp Customer Service</div>
                  <a
                    href="https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[#008751] font-bold hover:underline inline-block mt-0.5"
                  >
                    +44 7451 298096
                  </a>
                </div>
              </li>
              <li className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-[#008751] shrink-0" />
                <span>support@betterajo.ng</span>
              </li>
            </ul>

            <div className="pt-1 flex flex-col gap-2">
              {onOpenLiveChat && (
                <button
                  onClick={onOpenLiveChat}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#008751] text-[#008751] hover:bg-[#E6F3ED]/30 text-xs font-bold transition cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>START LIVE CHAT</span>
                </button>
              )}
              <a
                href="https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008751] hover:bg-[#007345] text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>CONTACT US ON WHATSAPP</span>
              </a>
            </div>
          </div>
        </div>

        {/* Feature Badges from Design */}
        <div className="pt-8 border-t border-slate-200 flex flex-wrap gap-8 sm:gap-14 mb-8">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-widest">
              Products
            </span>
            <div className="flex gap-4 text-xs font-semibold text-slate-700">
              <span>Personal Better Ajo</span>
              <span>•</span>
              <span>Group Better Ajo</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-widest">
              Security
            </span>
            <div className="flex gap-4 text-xs font-semibold text-slate-700">
              <span>Secure Email Login</span>
              <span>•</span>
              <span>Paystack Verified</span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 space-y-4 sm:space-y-0">
          <p>© 2026 Better Ajo Nigeria. All rights reserved.</p>
          <div className="flex items-center space-x-5 text-xs text-slate-400 font-medium">
            <span>Paystack Certified Partner</span>
            <span>•</span>
            <span>CBN Compliant NDIC Secured</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

