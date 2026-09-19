import React, { useState } from 'react';
import {
  Menu,
  X,
  User,
  LogOut,
  PlusCircle,
  Users,
  Wallet,
  Shield,
  Home,
  Info,
  HelpCircle,
  Phone,
  MessageSquare,
  FileText
} from 'lucide-react';
import { UserProfile, PersonalAjo, GroupAjo } from '../types/index.js';
import { formatPhone } from '../lib/formatters.js';
import { PackAjoLogo } from './PackAjoLogo.js';

interface NavbarProps {
  user?: UserProfile | null;
  currentUser?: UserProfile | null;
  personalAjo?: PersonalAjo | null;
  groups?: GroupAjo[];
  hasAdminGroups?: boolean;
  onOpenSignUp?: () => void;
  onOpenSignUpChoice?: () => void;
  onOpenLogin: () => void;
  onOpenJoinWithCode?: () => void;
  onOpenPersonal?: () => void;
  onOpenGroup?: () => void;
  onOpenGroupAdmin?: () => void;
  onOpenSuperAdmin?: () => void;
  onSelectPersonalDashboard?: () => void;
  onNavigateHome: () => void;
  onLogout: () => void;
  onScrollToSection?: (sectionId: string) => void;
  onOpenAbout?: () => void;
  onOpenPrivacy?: () => void;
  onOpenLiveChat?: () => void;
  currentView: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  currentUser,
  personalAjo,
  hasAdminGroups = false,
  onOpenSignUp,
  onOpenSignUpChoice,
  onOpenLogin,
  onOpenJoinWithCode,
  onOpenPersonal,
  onOpenGroup,
  onOpenGroupAdmin,
  onOpenSuperAdmin,
  onSelectPersonalDashboard,
  onNavigateHome,
  onLogout,
  onScrollToSection,
  onOpenAbout,
  onOpenPrivacy,
  onOpenLiveChat,
  currentView
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeUser = user || currentUser || null;
  const isSuperAdmin = activeUser?.phone === '08154267469' || activeUser?.role === 'SUPER_ADMIN' || activeUser?.email === 'superadmin@packajo.ng' || activeUser?.email === 'paulakinyele54@gmail.com';
  const isGroupAdmin = hasAdminGroups || activeUser?.role === 'GROUP_ADMIN';

  const handleSignUpClick = () => {
    setIsMenuOpen(false);
    if (onOpenSignUp) onOpenSignUp();
    else if (onOpenSignUpChoice) onOpenSignUpChoice();
  };

  const handleNavClick = (sectionId: string) => {
    setIsMenuOpen(false);
    if (onScrollToSection) {
      onScrollToSection(sectionId);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleHomeClick = () => {
    setIsMenuOpen(false);
    onNavigateHome();
  };

  const handleAboutClick = () => {
    setIsMenuOpen(false);
    if (onOpenAbout) onOpenAbout();
  };

  const handlePrivacyClick = () => {
    setIsMenuOpen(false);
    if (onOpenPrivacy) onOpenPrivacy();
  };

  return (
    <>
      <nav className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex items-center justify-between px-4 sm:px-6 md:px-12 py-3.5 max-w-7xl">
          {/* Brand Logo with Official Asset */}
          <button
            onClick={handleHomeClick}
            className="flex items-center text-left focus:outline-none cursor-pointer"
            title="Better Ajo Nigeria"
          >
            <PackAjoLogo size="sm" showText={true} />
          </button>

          {/* Desktop Direct Links */}
          <div className="hidden lg:flex items-center gap-6">
            <button
              onClick={handleHomeClick}
              className={`text-sm font-semibold transition-colors cursor-pointer ${
                currentView === 'home' ? 'text-[#008751]' : 'text-slate-600 hover:text-[#008751]'
              }`}
            >
              Home
            </button>
            <button
              onClick={handleAboutClick}
              className="text-sm font-semibold text-slate-600 hover:text-[#008751] transition-colors cursor-pointer"
            >
              About Better Ajo
            </button>
            <button
              onClick={() => handleNavClick('how-it-works')}
              className="text-sm font-semibold text-slate-600 hover:text-[#008751] transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <button
              onClick={() => handleNavClick('faq')}
              className="text-sm font-semibold text-slate-600 hover:text-[#008751] transition-colors cursor-pointer"
            >
              FAQ
            </button>
            {onOpenLiveChat && (
              <button
                onClick={onOpenLiveChat}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-[#008751] transition-colors cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Live Chat</span>
              </button>
            )}
            <a
              href="https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me."
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-slate-600 hover:text-[#008751] transition-colors cursor-pointer"
            >
              WhatsApp
            </a>
            <button
              onClick={handlePrivacyClick}
              className="text-sm font-semibold text-slate-600 hover:text-[#008751] transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {activeUser ? (
              // AUTHENTICATED STATE: No Login, No Sign Up, No Create Account
              <div className="flex items-center gap-2 sm:gap-2.5">
                {/* Group Admin Dashboard Link */}
                {isGroupAdmin && onOpenGroupAdmin && (
                  <button
                    onClick={onOpenGroupAdmin}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                      currentView === 'group_admin_dashboard'
                        ? 'bg-[#008751] text-white shadow-sm'
                        : 'bg-emerald-50 text-[#008751] hover:bg-emerald-100 border border-emerald-200/60'
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Admin Dashboard</span>
                    <span className="sm:hidden">Admin</span>
                  </button>
                )}

                {/* Super Admin Dashboard Link */}
                {isSuperAdmin && onOpenSuperAdmin && (
                  <button
                    onClick={onOpenSuperAdmin}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                      currentView === 'super_admin'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200/60'
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5 text-purple-700" />
                    <span className="hidden sm:inline">Super Admin</span>
                    <span className="sm:hidden">Super</span>
                  </button>
                )}

                {/* Personal Dashboard Link */}
                {personalAjo && (
                  <button
                    onClick={onSelectPersonalDashboard || onOpenPersonal}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                      currentView === 'personal' || currentView === 'personal_dashboard'
                        ? 'bg-[#008751] text-white shadow-sm'
                        : 'bg-[#E6F3ED] text-[#008751] hover:bg-[#d8ece2]'
                    }`}
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Personal Ajo</span>
                    <span className="sm:hidden">Personal</span>
                  </button>
                )}

                {/* User Info Badge */}
                <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
                  <div className="h-8 w-8 rounded-full bg-[#E6F3ED] text-[#008751] font-bold flex items-center justify-center text-xs">
                    {activeUser.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-900 leading-tight truncate max-w-[120px]">
                      {activeUser.full_name}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                      {activeUser.email || formatPhone(activeUser.phone)}
                    </div>
                  </div>
                </div>

                {/* Clear, Consistent Logout Button */}
                <button
                  onClick={onLogout}
                  title="Log out and return to homepage"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">LOGOUT</span>
                </button>
              </div>
            ) : (
              // UNAUTHENTICATED STATE: Main actions
              <div className="flex items-center gap-2 sm:gap-3">
                {onOpenJoinWithCode && (
                  <button
                    onClick={onOpenJoinWithCode}
                    className="hidden sm:inline-flex items-center px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Join with Code
                  </button>
                )}

                <button
                  onClick={onOpenLogin}
                  className="px-4 py-2 text-xs sm:text-sm font-bold border border-[#008751] text-[#008751] rounded-xl hover:bg-[#E6F3ED]/50 transition-colors cursor-pointer"
                >
                  Login
                </button>

                <button
                  onClick={handleSignUpClick}
                  className="inline-flex items-center px-4 py-2 text-xs sm:text-sm font-bold bg-[#008751] text-white rounded-xl shadow-sm shadow-[#008751]/20 hover:bg-[#007345] hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer"
                >
                  Create / Sign Up
                </button>
              </div>
            )}

            {/* Three-Line Hamburger Menu Toggle Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-xl border border-slate-200 hover:border-[#008751] text-slate-700 hover:text-[#008751] hover:bg-slate-50 transition-colors cursor-pointer ml-1"
              aria-label="Toggle navigation menu"
              title="Menu"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Clean Three-Line Hamburger Side Drawer Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl z-10 p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-6 border-b border-slate-100">
                <PackAjoLogo size="sm" showText={true} />
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User badge if authenticated */}
              {activeUser && (
                <div className="my-5 p-3.5 rounded-2xl bg-[#E6F3ED]/60 border border-[#008751]/20 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[#008751] text-white font-bold flex items-center justify-center text-sm">
                    {activeUser.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-black text-slate-900 truncate">
                      {activeUser.full_name}
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono mt-0.5 truncate">
                      {activeUser.email || formatPhone(activeUser.phone)}
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Items */}
              <div className="py-4 space-y-1">
                <button
                  onClick={handleHomeClick}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-800 hover:text-[#008751] hover:bg-[#E6F3ED]/40 transition text-left cursor-pointer"
                >
                  <Home className="h-4 w-4 text-[#008751]" />
                  <span>Home</span>
                </button>

                <button
                  onClick={handleAboutClick}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-800 hover:text-[#008751] hover:bg-[#E6F3ED]/40 transition text-left cursor-pointer"
                >
                  <Info className="h-4 w-4 text-[#008751]" />
                  <span>About Better Ajo</span>
                </button>

                <button
                  onClick={() => handleNavClick('how-it-works')}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-800 hover:text-[#008751] hover:bg-[#E6F3ED]/40 transition text-left cursor-pointer"
                >
                  <HelpCircle className="h-4 w-4 text-[#008751]" />
                  <span>How It Works</span>
                </button>

                <button
                  onClick={() => handleNavClick('faq')}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-800 hover:text-[#008751] hover:bg-[#E6F3ED]/40 transition text-left cursor-pointer"
                >
                  <HelpCircle className="h-4 w-4 text-[#008751]" />
                  <span>FAQ</span>
                </button>

                {onOpenLiveChat && (
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenLiveChat();
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-800 hover:text-[#008751] hover:bg-[#E6F3ED]/40 transition text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <MessageSquare className="h-4 w-4 text-[#008751]" />
                      <span>Live Customer Support</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Online
                    </span>
                  </button>
                )}

                <a
                  href="https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me."
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-slate-800 hover:text-[#008751] hover:bg-[#E6F3ED]/40 transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <Phone className="h-4 w-4 text-[#008751]" />
                    <span>WhatsApp Support</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono">
                    +44 7451 298096
                  </span>
                </a>

                <button
                  onClick={handlePrivacyClick}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-bold text-slate-800 hover:text-[#008751] hover:bg-[#E6F3ED]/40 transition text-left cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-[#008751]" />
                  <span>Privacy Policy</span>
                </button>
              </div>

              {/* Action buttons inside drawer if NOT authenticated */}
              {!activeUser && (
                <div className="pt-6 border-t border-slate-100 space-y-2.5">
                  <button
                    onClick={handleSignUpClick}
                    className="w-full py-3.5 rounded-xl bg-[#008751] text-white font-bold text-xs shadow-md shadow-[#008751]/20 hover:bg-[#007345] transition text-center cursor-pointer"
                  >
                    CREATE / SIGN UP
                  </button>

                  {onOpenJoinWithCode && (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenJoinWithCode();
                      }}
                      className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-xs hover:bg-slate-50 transition text-center cursor-pointer"
                    >
                      JOIN AJO WITH CODE
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenLogin();
                    }}
                    className="w-full py-3 rounded-xl border border-[#008751] text-[#008751] font-bold text-xs hover:bg-[#E6F3ED]/30 transition text-center cursor-pointer"
                  >
                    LOGIN
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Drawer Area */}
            <div className="pt-6 border-t border-slate-100">
              {activeUser ? (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-xs transition cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>LOGOUT ACCOUNT</span>
                </button>
              ) : (
                <div className="text-center text-[11px] text-slate-400">
                  © 2026 Better Ajo Nigeria • Safe & Secure
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
