import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Users,
  Wallet,
  ArrowRight,
  Sparkles,
  ChevronDown,
  Clock,
  Coins,
  Send,
  HelpCircle,
  MessageSquare,
  Lock,
  Check
} from 'lucide-react';
import { PackAjoLogo } from './PackAjoLogo.js';

interface HomeHeroProps {
  onSignUpChoice: () => void;
  onSelectPersonal: () => void;
  onSelectGroup: () => void;
  onJoinWithCode: () => void;
  onLogin: () => void;
  onOpenLiveChat?: () => void;
}

export const HomeHero: React.FC<HomeHeroProps> = ({
  onSignUpChoice,
  onSelectPersonal,
  onSelectGroup,
  onJoinWithCode,
  onLogin,
  onOpenLiveChat
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const faqs = [
    {
      q: 'What is Better Ajo?',
      a: 'Better Ajo is a simple, automated Nigerian savings platform. You can either save privately for yourself with Personal Better Ajo, or join a Group Better Ajo where members contribute periodically and take turns collecting (packing) the lump sum.'
    },
    {
      q: 'What is the fee for Personal Better Ajo vs Group Better Ajo?',
      a: 'Personal Better Ajo has a one-time platform fee of ₦600 paid via Paystack upon registration. Group Better Ajo members pay ₦0 joining fee — there is no ₦600 registration fee for group members. Group fees (₦3,000) are only deducted from the total payout when a member packs their lump sum.'
    },
    {
      q: 'How does the Group Better Ajo rotation work?',
      a: 'When members join a group, their position in the packing queue is assigned automatically based on their join order (Position 1, Position 2, etc.). Each cycle, after all members make their required contributions, the designated member packs their full lump sum.'
    },
    {
      q: 'What happens when a round finishes?',
      a: 'Once all members have packed, the round completes! Each member is asked if they want to "START SECOND ROUND". Returning members keep their positions without any joining fees. Vacant slots from departing members can be filled by new invitees.'
    },
    {
      q: 'How do I withdraw my savings from Personal Better Ajo?',
      a: 'You can withdraw anytime to your registered bank account. A transparent 1.6% withdrawal fee is deducted, and you confirm your withdrawal securely using your login password.'
    }
  ];

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-white to-[#f0f9f4] border-b border-slate-100 px-6 sm:px-12 py-12 lg:py-20">
        <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-12 items-center gap-12">
          {/* Left Column: Hero Text and Actions */}
          <div className="lg:col-span-7 lg:pr-8 text-left">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#E6F3ED] text-[#008751] text-xs font-bold uppercase tracking-wider mb-6">
              🇳🇬 Nigeria's Most Reliable Ajo Platform
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-slate-900 leading-[1.08] mb-6 tracking-tight">
              SAVE.<br />
              PACK.<br />
              <span className="text-[#008751]">REPEAT.</span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
              Better Ajo makes personal and group savings simple, organized and easy to manage. Built for the modern Nigerian.
            </p>

            {/* Three Main Actions Grouped Together (Mobile-First & Clean) */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-3.5 max-w-xl">
              <button
                onClick={onSignUpChoice}
                className="px-7 py-4 bg-[#008751] text-white font-black rounded-2xl shadow-lg shadow-[#008751]/25 hover:scale-[1.02] hover:bg-[#007345] active:scale-[0.98] transition-all text-base cursor-pointer text-center"
              >
                CREATE / SIGN UP
              </button>
              <button
                onClick={onJoinWithCode}
                className="px-6 py-4 bg-white border-2 border-slate-200 hover:border-[#008751] text-slate-800 font-bold rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition-all text-base cursor-pointer text-center"
              >
                JOIN AJO WITH CODE
              </button>
              <button
                onClick={onLogin}
                className="px-6 py-4 bg-slate-100 hover:bg-[#E6F3ED] border border-slate-200 hover:border-[#008751]/40 text-slate-800 hover:text-[#008751] font-bold rounded-2xl active:scale-[0.98] transition-all text-base cursor-pointer text-center"
              >
                LOGIN
              </button>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-6 border-t border-slate-200 pt-8 max-w-xl">
              <div>
                <div className="text-2xl font-bold text-slate-900">₦600</div>
                <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold mt-1">
                  Personal Setup Fee
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">₦0</div>
                <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold mt-1">
                  Group Joining Fee
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">1.6%</div>
                <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold mt-1">
                  Withdrawal Fee
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Professional Non-Interactive Showcase Banner */}
          <div className="lg:col-span-5 relative mt-4 lg:mt-0 max-w-md mx-auto w-full">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-7 sm:p-8">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <PackAjoLogo size="sm" showText={true} />
                <div className="bg-[#E6F3ED] text-[#008751] px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#008751]" />
                  <span>Verified Platform</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4.5 border border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    System Overview
                  </span>
                  <p className="text-sm font-extrabold text-slate-900 leading-snug">
                    Nigeria's Digital Rotational Ajo & Personal Savings Infrastructure
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-start space-x-3 p-3 rounded-xl bg-white border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-[#E6F3ED] flex items-center justify-center text-[#008751] shrink-0 mt-0.5">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Personal Better Ajo</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Automated individual savings with secure bank payouts whenever you need your funds.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-xl bg-white border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-[#E6F3ED] flex items-center justify-center text-[#008751] shrink-0 mt-0.5">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Group Better Ajo</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Disciplined rotational ajo cycles, zero group joining fees, and automated turn notifications.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-xl bg-white border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-[#E6F3ED] flex items-center justify-center text-[#008751] shrink-0 mt-0.5">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Bank-Grade Security</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        BVN / NIN identity validation, password authorization, and settlement via Paystack.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-center text-[11px] text-slate-400 font-medium">
                  Designed for trust, transparency, and financial discipline across Nigeria.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Two Products Section */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="mx-auto max-w-6xl px-6 sm:px-12">
          <div className="text-center max-w-xl mx-auto mb-14">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#008751] mb-2">
              Simple & Focused
            </h2>
            <p className="text-3xl sm:text-4xl font-black text-slate-900">
              Better Ajo Has Only Two Products
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Product 1: Personal Better Ajo */}
            <div className="rounded-3xl border border-slate-200 bg-[#f0f9f4]/40 p-8 hover:border-[#008751]/40 transition shadow-sm flex flex-col justify-between">
              <div>
                <div className="h-12 w-12 rounded-xl bg-[#008751] text-white flex items-center justify-center mb-6 font-bold shadow-md shadow-[#008751]/20">
                  <Wallet className="h-6 w-6" />
                </div>
                <div className="inline-block px-2.5 py-0.5 rounded-full bg-[#E6F3ED] text-xs font-bold uppercase tracking-wider text-[#008751] mb-2">
                  Product 1
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-3">
                  Personal Better Ajo
                </h3>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                  Personal savings for one person. Deposit steadily, grow your emergency fund, and withdraw safely to your registered Nigerian bank account anytime.
                </p>

                <ul className="space-y-3 text-xs text-slate-700 font-medium mb-8">
                  <li className="flex items-center space-x-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                    <span>One-time ₦600 platform activation fee</span>
                  </li>
                  <li className="flex items-center space-x-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                    <span>Transparent 1.6% withdrawal fee</span>
                  </li>
                  <li className="flex items-center space-x-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                    <span>Secured with password verification</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={onSelectPersonal}
                className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#008751] py-3.5 text-xs font-bold text-white hover:bg-[#007345] shadow-sm shadow-[#008751]/20 transition cursor-pointer"
              >
                <span>Start Personal Savings</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Product 2: Group Better Ajo */}
            <div className="rounded-3xl border-2 border-[#008751] bg-white p-8 hover:shadow-xl transition shadow-md flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-6 right-6 bg-[#E6F3ED] text-[#008751] text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full">
                ₦0 Joining Fee
              </div>

              <div>
                <div className="h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-6 font-bold shadow-md">
                  <Users className="h-6 w-6" />
                </div>
                <div className="inline-block px-2.5 py-0.5 rounded-full bg-[#E6F3ED] text-xs font-bold uppercase tracking-wider text-[#008751] mb-2">
                  Product 2
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-3">
                  Group Better Ajo
                </h3>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                  Group savings where 5 to 50 members contribute fixed amounts and take turns packing lump sums on fixed cycles (3, 4, 5, 7, 14 days or monthly).
                </p>

                <ul className="space-y-3 text-xs text-slate-700 font-medium mb-8">
                  <li className="flex items-center space-x-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                    <span><strong>₦0 joining fee</strong> for all group members</span>
                  </li>
                  <li className="flex items-center space-x-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                    <span>Join order automatically determines rotation position</span>
                  </li>
                  <li className="flex items-center space-x-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#008751] shrink-0" />
                    <span>Multi-round support (Start Round 2, Round 3...)</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onSelectGroup}
                  className="flex-1 flex items-center justify-center space-x-1.5 rounded-xl bg-[#008751] py-3.5 text-xs font-bold text-white hover:bg-[#007345] shadow-sm shadow-[#008751]/20 transition cursor-pointer"
                >
                  <span>Create Group Ajo</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onJoinWithCode}
                  className="px-4 rounded-xl border-2 border-slate-200 text-slate-800 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
                >
                  Join Code
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 sm:py-24 bg-slate-50 border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-6 sm:px-12">
          <div className="text-center max-w-xl mx-auto mb-14">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#008751] mb-2">
              Straightforward Process
            </h2>
            <p className="text-3xl sm:text-4xl font-black text-slate-900">
              How Better Ajo Works
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div className="rounded-2xl bg-white p-6 border border-slate-100 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-[#E6F3ED] text-[#008751] font-black flex items-center justify-center text-sm mb-4">
                1
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">Sign Up</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sign up with your email and password in seconds. Choose Personal or Group Better Ajo.
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 border border-slate-100 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-[#E6F3ED] text-[#008751] font-black flex items-center justify-center text-sm mb-4">
                2
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">Join or Create</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Create your savings group or join an existing group using an invitation code or link.
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 border border-slate-100 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-[#E6F3ED] text-[#008751] font-black flex items-center justify-center text-sm mb-4">
                3
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">Contribute</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Members contribute according to the selected cycle (3, 4, 5, 7, 14 days or monthly).
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 border border-slate-100 shadow-sm">
              <div className="h-9 w-9 rounded-lg bg-[#E6F3ED] text-[#008751] font-black flex items-center justify-center text-sm mb-4">
                4
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">Pack Your Payout</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                When it’s your turn, click Pack Now. Confirm with your password, and receive your lump sum in your bank!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 sm:py-24 bg-white border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-6 sm:px-12">
          <div className="text-center mb-12">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#008751] mb-2">
              Clear & Transparent
            </h2>
            <p className="text-3xl sm:text-4xl font-black text-slate-900">
              Frequently Asked Questions
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 overflow-hidden transition"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between font-bold text-sm text-slate-900 hover:bg-slate-50 transition cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform ${
                      openFaq === idx ? 'rotate-180 text-[#008751]' : ''
                    }`}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-6 pb-5 pt-1 text-xs text-slate-600 leading-relaxed bg-slate-50/70 border-t border-slate-100">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Us / Customer Service Section */}
      <section id="contact" className="py-16 bg-[#008751] text-white">
        <div className="mx-auto max-w-4xl px-6 sm:px-12 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold uppercase tracking-wider mb-4 backdrop-blur-xs">
            <MessageSquare className="h-3.5 w-3.5 text-emerald-200" />
            <span>24/7 Live Chat & WhatsApp Customer Service</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">
            Need Assistance with Your Better Ajo?
          </h2>
          <p className="text-white/90 text-sm max-w-xl mx-auto mb-2 leading-relaxed">
            Our customer care team is available daily on Live Chat and WhatsApp to assist with your personal savings, group rotations, and account questions.
          </p>
          <div className="my-6">
            <div className="text-xs uppercase tracking-widest text-emerald-200 font-bold mb-1">
              WhatsApp Customer Service
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-black text-white tracking-wider">
              +44 7451 298096
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 text-xs font-semibold">
            {onOpenLiveChat && (
              <button
                onClick={onOpenLiveChat}
                className="flex items-center space-x-2.5 bg-white text-[#008751] hover:bg-slate-100 px-8 py-4 rounded-xl transition w-full sm:w-auto justify-center font-black shadow-lg shadow-black/15 tracking-wide text-sm cursor-pointer"
              >
                <MessageSquare className="h-4 w-4 text-[#008751]" />
                <span>START LIVE SUPPORT CHAT</span>
              </button>
            )}
            <a
              href="https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2.5 bg-emerald-700/80 hover:bg-emerald-700 border border-white/20 px-8 py-4 rounded-xl transition w-full sm:w-auto justify-center font-black text-white shadow-lg tracking-wide text-sm cursor-pointer"
            >
              <MessageSquare className="h-4 w-4 text-white" />
              <span>WHATSAPP SUPPORT (+44 7451 298096)</span>
            </a>
            <a
              href="mailto:support@betterajo.ng"
              className="flex items-center space-x-2 bg-black/20 hover:bg-black/30 px-6 py-4 rounded-xl transition w-full sm:w-auto justify-center font-bold text-white border border-white/20 cursor-pointer"
            >
              <Send className="h-4 w-4 text-emerald-200" />
              <span>support@betterajo.ng</span>
            </a>
          </div>
          <p className="text-[11px] text-emerald-100/75 mt-5">
            Customer support is provided via 24/7 in-app Live Chat, WhatsApp message, or WhatsApp call. No direct cellular toll charges.
          </p>
        </div>
      </section>
    </div>
  );
};
