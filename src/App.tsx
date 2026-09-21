import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { Navbar } from './components/Navbar.js';
import { Footer } from './components/Footer.js';
import { HomeHero } from './components/HomeHero.js';
import { AuthModal } from './components/AuthModal.js';
import { PersonalRegistration } from './components/PersonalRegistration.js';
import { PersonalDashboard } from './components/PersonalDashboard.js';
import { GroupCreation } from './components/GroupCreation.js';
import { GroupJoin } from './components/GroupJoin.js';
import { GroupDashboard } from './components/GroupDashboard.js';
import { GroupAdminDashboard } from './components/GroupAdminDashboard.js';
import { SuperAdminDashboard } from './components/SuperAdminDashboard.js';
import { DatabaseStatusModal } from './components/DatabaseStatusModal.js';
import { InfoModal } from './components/InfoModals.js';
import { LiveSupportChat } from './components/LiveSupportChat.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { UserProfile, PersonalAjo, GroupAjo } from './types/index.js';
import { subscribeToUserPersonalBalance } from './lib/firebase.js';

export type AppView =
  | 'home'
  | 'personal_register'
  | 'personal_dashboard'
  | 'group_create'
  | 'group_join'
  | 'group_dashboard'
  | 'group_admin_dashboard'
  | 'super_admin';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [personalAjo, setPersonalAjo] = useState<PersonalAjo | null>(null);
  const [userGroups, setUserGroups] = useState<GroupAjo[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Auth modal states
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'choice' | 'login'>('choice');
  const [authModalKey, setAuthModalKey] = useState(0);

  // Join code state for deep links
  const [joinCode, setJoinCode] = useState<string>('');

  // Info modal states (About & Privacy)
  const [infoModalType, setInfoModalType] = useState<'about' | 'privacy' | null>(null);

  // Live support chat state
  const [isLiveChatOpen, setIsLiveChatOpen] = useState(false);

  // Database status modal
  const [isDbStatusOpen, setIsDbStatusOpen] = useState(false);

  // Check URL query parameters and local session on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      setJoinCode(codeParam.toUpperCase());
      setCurrentView('group_join');
    }

    // Restore saved session if any
    try {
      const savedSession = localStorage.getItem('pack_ajo_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed.profile) {
          setUser(parsed.profile);
          if (parsed.personalAjo) setPersonalAjo(parsed.personalAjo);
          if (parsed.groups) setUserGroups(parsed.groups);
          if (parsed.activeGroupId) {
            setActiveGroupId(parsed.activeGroupId);
            setCurrentView('group_dashboard');
          } else if (parsed.personalAjo) {
            setCurrentView('personal_dashboard');
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore session', e);
    }
  }, []);

  // Durable real-time Firestore balance synchronization
  useEffect(() => {
    if (!user?.id) return;

    const isSuperAdminUser = user.phone === '08154267469' || user.role === 'SUPER_ADMIN' || user.role === 'superadmin' || user.email === 'superadmin@packajo.ng' || user.email === 'paulakinyele54@gmail.com';
    const isGroupAdminUser = user.role === 'GROUP_ADMIN' || user.role === 'groupadmin';

    // Strict rule: personal_ajo must ONLY be visible to role=user
    if (isSuperAdminUser || isGroupAdminUser) {
      setPersonalAjo(null);
      return;
    }

    // Fetch initial fresh balance from backend
    fetch(`/api/user/${encodeURIComponent(user.id)}/balance`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && typeof data.personalBalance === 'number') {
          setPersonalAjo(prev => {
            if (!prev) {
              return {
                id: `pajo_${user.id}`,
                user_id: user.id,
                balance: data.personalBalance,
                total_deposited: data.personalBalance,
                total_withdrawn: 0,
                status: 'active',
                created_at: new Date().toISOString()
              };
            }
            return { ...prev, balance: data.personalBalance };
          });
        }
      })
      .catch(() => {});

    // Listen to real-time changes in Firestore users/{userId}
    const unsub = subscribeToUserPersonalBalance(user.id, (freshBal) => {
      setPersonalAjo(prev => {
        if (!prev) {
          return {
            id: `pajo_${user.id}`,
            user_id: user.id,
            balance: freshBal,
            total_deposited: freshBal,
            total_withdrawn: 0,
            status: 'active',
            created_at: new Date().toISOString()
          };
        }
        return { ...prev, balance: freshBal };
      });
    });

    return () => unsub();
  }, [user?.id, user?.role, user?.phone]);

  // Route protection: prevent admin roles from viewing personal ajo routes
  useEffect(() => {
    if (!user) return;
    const isSuperAdminUser = user.phone === '08154267469' || user.role === 'SUPER_ADMIN' || user.role === 'superadmin' || user.email === 'superadmin@packajo.ng' || user.email === 'paulakinyele54@gmail.com';
    const isGroupAdminUser = user.role === 'GROUP_ADMIN' || user.role === 'groupadmin';
    if ((isSuperAdminUser || isGroupAdminUser) && (currentView === 'personal_dashboard' || currentView === 'personal_register')) {
      if (isSuperAdminUser) setCurrentView('super_admin');
      else setCurrentView('group_admin_dashboard');
    }
  }, [user, currentView]);

  const saveSession = (
    profile: UserProfile | null,
    personal?: PersonalAjo | null,
    groups?: GroupAjo[],
    activeGId?: string | null
  ) => {
    try {
      if (!profile) {
        localStorage.removeItem('pack_ajo_session');
        return;
      }
      localStorage.setItem(
        'pack_ajo_session',
        JSON.stringify({
          profile,
          personalAjo: personal || null,
          groups: groups || userGroups,
          activeGroupId: activeGId !== undefined ? activeGId : activeGroupId
        })
      );
    } catch (e) {
      console.error('Session save error', e);
    }
  };

  // Login handler
  const handleLoginSuccess = (loginData: any) => {
    const userProfile = loginData.profile;
    setUser(userProfile);
    setPersonalAjo(loginData.personalAjo || null);

    const adminGroups: GroupAjo[] = loginData.adminGroups || [];
    const memberGroups: GroupAjo[] = loginData.memberGroups || [];
    const allGroups: GroupAjo[] = loginData.groups || [];
    setUserGroups(allGroups);

    // Routing after successful login
    // For Super Admin (08154267469) -> Super Admin Dashboard
    // For an existing Group Admin -> Existing Group Admin Dashboard
    // For an existing Group Member -> Existing Group Member Dashboard
    // For an existing Personal Ajo user -> Existing Personal Ajo Dashboard
    const isSuper = userProfile.phone === '08154267469' || userProfile.role === 'SUPER_ADMIN' || userProfile.role === 'superadmin' || userProfile.email === 'superadmin@packajo.ng' || userProfile.email === 'paulakinyele54@gmail.com';
    const isGroupAdm = adminGroups.length > 0 || userProfile.role === 'GROUP_ADMIN' || userProfile.role === 'groupadmin';

    if (isSuper) {
      setPersonalAjo(null);
      saveSession(userProfile, null, allGroups, adminGroups[0]?.id || null);
      setCurrentView('super_admin');
    } else if (isGroupAdm) {
      const targetId = adminGroups[0]?.id || null;
      setActiveGroupId(targetId);
      setPersonalAjo(null);
      saveSession(userProfile, null, allGroups, targetId);
      setCurrentView('group_admin_dashboard');
    } else if (memberGroups.length > 0) {
      const targetId = memberGroups[0].id;
      setActiveGroupId(targetId);
      saveSession(userProfile, loginData.personalAjo, allGroups, targetId);
      setCurrentView('group_dashboard');
    } else if (loginData.personalAjo) {
      saveSession(userProfile, loginData.personalAjo, allGroups, null);
      setCurrentView('personal_dashboard');
    } else if (allGroups.length > 0) {
      const targetId = allGroups[0].id;
      setActiveGroupId(targetId);
      saveSession(userProfile, loginData.personalAjo, allGroups, targetId);
      setCurrentView('group_dashboard');
    } else {
      // If user has no active product yet, prompt choice modal
      saveSession(userProfile, null, [], null);
      setIsAuthModalOpen(true);
      setAuthModalMode('choice');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setPersonalAjo(null);
    setUserGroups([]);
    setActiveGroupId(null);
    localStorage.removeItem('pack_ajo_session');
    try {
      sessionStorage.clear();
    } catch (_) {}
    setAuthModalKey(prev => prev + 1);
    setIsAuthModalOpen(false);
    setCurrentView('home');
  };

  const handleScrollToSection = (sectionId: string) => {
    if (currentView !== 'home') {
      setCurrentView('home');
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-[#E6F3ED] selection:text-[#008751]">
      {/* Top Navigation */}
      <Navbar
        user={user}
        personalAjo={personalAjo}
        currentView={currentView}
        hasAdminGroups={userGroups.some(g => g.admin_id === user?.id) || user?.role === 'GROUP_ADMIN'}
        onNavigateHome={() => setCurrentView('home')}
        onOpenAbout={() => setInfoModalType('about')}
        onOpenPrivacy={() => setInfoModalType('privacy')}
        onOpenJoinWithCode={() => {
          setJoinCode('');
          setCurrentView('group_join');
        }}
        onOpenLogin={() => {
          setAuthModalKey(prev => prev + 1);
          setAuthModalMode('login');
          setIsAuthModalOpen(true);
        }}
        onOpenSignUp={() => {
          setAuthModalMode('choice');
          setIsAuthModalOpen(true);
        }}
        onOpenPersonal={() => {
          if (personalAjo) {
            setCurrentView('personal_dashboard');
          } else {
            setCurrentView('personal_register');
          }
        }}
        onOpenGroup={() => {
          if (userGroups.length > 0) {
            if (!activeGroupId) setActiveGroupId(userGroups[0].id);
            setCurrentView('group_dashboard');
          } else {
            setCurrentView('group_create');
          }
        }}
        onOpenGroupAdmin={() => {
          const adminG = userGroups.find(g => g.admin_id === user?.id) || userGroups[0];
          if (adminG) setActiveGroupId(adminG.id);
          setCurrentView('group_admin_dashboard');
        }}
        onOpenSuperAdmin={() => {
          setCurrentView('super_admin');
        }}
        onOpenLiveChat={() => setIsLiveChatOpen(true)}
        onLogout={handleLogout}
        onScrollToSection={handleScrollToSection}
      />

      {/* Main Content Body */}
      <main className="flex-1">
        <ErrorBoundary onNavigateHome={() => setCurrentView('home')}>
          {/* 1. Homepage */}
          {currentView === 'home' && (
            <HomeHero
              onSignUpChoice={() => {
                setAuthModalMode('choice');
                setIsAuthModalOpen(true);
              }}
              onSelectPersonal={() => {
                setCurrentView('personal_register');
              }}
              onSelectGroup={() => {
                setCurrentView('group_create');
              }}
              onJoinWithCode={() => {
                setJoinCode('');
                setCurrentView('group_join');
              }}
              onLogin={() => {
                setAuthModalMode('login');
                setIsAuthModalOpen(true);
              }}
              onOpenLiveChat={() => setIsLiveChatOpen(true)}
            />
          )}

          {/* 2. Personal Registration */}
          {currentView === 'personal_register' && (
            <PersonalRegistration
              onBack={() => setCurrentView('home')}
              onSuccess={(data) => {
                setUser(data.profile);
                setPersonalAjo(data.personalAjo);
                saveSession(data.profile, data.personalAjo);
                setCurrentView('personal_dashboard');
              }}
            />
          )}

          {/* 3. Personal Dashboard */}
          {currentView === 'personal_dashboard' && (
            !user ? (
              <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="rounded-3xl bg-white border border-slate-200 p-8 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-[#E6F3ED] text-[#008751] flex items-center justify-center mx-auto mb-4 font-bold">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-black text-slate-900 mb-2">Authentication Required</h2>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    Please log in with your email and password to view your Personal Better Ajo dashboard.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => {
                        setAuthModalMode('login');
                        setIsAuthModalOpen(true);
                      }}
                      className="px-5 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      Log In with Email & Password
                    </button>
                    <button
                      onClick={() => setCurrentView('home')}
                      className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      Return Home
                    </button>
                  </div>
                </div>
              </div>
            ) : personalAjo ? (
              <PersonalDashboard
                user={user}
                personalAjo={personalAjo}
                onLogout={handleLogout}
                onUpdatePersonalAjo={(updated) => {
                  setPersonalAjo(updated);
                  saveSession(user, updated);
                }}
              />
            ) : (
              <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="rounded-3xl bg-white border border-slate-200 p-8 shadow-sm">
                  <h2 className="text-xl font-black text-slate-900 mb-2">No Active Personal Ajo Found</h2>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    You do not currently have an active Personal Ajo savings account. You can activate your personal savings plan with a one-time ₦600 registration fee.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => setCurrentView('personal_register')}
                      className="px-5 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      Activate Personal Ajo (₦600)
                    </button>
                    <button
                      onClick={() => setCurrentView('home')}
                      className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      Return Home
                    </button>
                  </div>
                </div>
              </div>
            )
          )}

          {/* 4. Group Creation */}
          {currentView === 'group_create' && (
            <GroupCreation
              currentUser={user}
              onBack={() => setCurrentView('home')}
              onSuccess={(data) => {
                const activeProfile = data.adminProfile || user;
                if (activeProfile) {
                  setUser(activeProfile);
                }
                setActiveGroupId(data.group.id);
                setUserGroups((prev) => {
                  const exists = prev.some((g) => g.id === data.group.id);
                  return exists ? prev : [...prev, data.group];
                });
                const updatedGroups = userGroups.some((g) => g.id === data.group.id)
                  ? userGroups
                  : [...userGroups, data.group];
                saveSession(activeProfile || user, personalAjo, updatedGroups, data.group.id);
                setCurrentView('group_admin_dashboard');
              }}
            />
          )}

          {/* 5. Group Join with Code */}
          {currentView === 'group_join' && (
            <GroupJoin
              initialCode={joinCode}
              currentUser={user}
              onBack={() => setCurrentView('home')}
              onSuccess={(data: any) => {
                const activeProfile = data.profile || data.member?.profile || user;
                if (activeProfile) {
                  setUser(activeProfile);
                }
                setActiveGroupId(data.group.id);
                setUserGroups((prev) => {
                  const exists = prev.some((g) => g.id === data.group.id);
                  const updated = exists ? prev : [...prev, data.group];
                  if (activeProfile) {
                    saveSession(activeProfile, personalAjo, updated, data.group.id);
                  }
                  return updated;
                });
                setCurrentView('group_dashboard');
              }}
            />
          )}

          {/* 6. Group Dashboard */}
          {currentView === 'group_dashboard' && (
            !user ? (
              <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="rounded-3xl bg-white border border-slate-200 p-8 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-[#E6F3ED] text-[#008751] flex items-center justify-center mx-auto mb-4 font-bold">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-black text-slate-900 mb-2">Authentication Required</h2>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    Please log in with your email and password to view and participate in your Group Better Ajo.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => {
                        setAuthModalMode('login');
                        setIsAuthModalOpen(true);
                      }}
                      className="px-5 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      Log In with Email & Password
                    </button>
                    <button
                      onClick={() => setCurrentView('home')}
                      className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      Return Home
                    </button>
                  </div>
                </div>
              </div>
            ) : (activeGroupId || userGroups.length > 0) ? (
              <GroupDashboard
                groupId={activeGroupId || userGroups[0].id}
                currentUser={user}
                onNavigateHome={() => setCurrentView('home')}
                onLogout={handleLogout}
                onGroupUpdated={() => {
                  // Group refreshed
                }}
                onOpenGroupAdminDashboard={(gid) => {
                  setActiveGroupId(gid);
                  setCurrentView('group_admin_dashboard');
                }}
              />
            ) : (
              <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="rounded-3xl bg-white border border-slate-200 p-8 shadow-sm">
                  <h2 className="text-xl font-black text-slate-900 mb-2">No Active Group Found</h2>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    You are not currently managing or participating in any Group Better Ajo. Create your own group or join an existing group with an invite code.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => setCurrentView('group_create')}
                      className="px-5 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      Create Group (₦0 Fee)
                    </button>
                    <button
                      onClick={() => setCurrentView('group_join')}
                      className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      Join with Code
                    </button>
                  </div>
                </div>
              </div>
            )
          )}

          {/* 7. Group Admin Dashboard */}
          {currentView === 'group_admin_dashboard' && (
            !user ? (
              <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="rounded-3xl bg-white border border-slate-200 p-8 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-[#E6F3ED] text-[#008751] flex items-center justify-center mx-auto mb-4 font-bold">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-black text-slate-900 mb-2">Authentication Required</h2>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    Please log in with your email and password to access your Group Admin Console.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => {
                        setAuthModalMode('login');
                        setIsAuthModalOpen(true);
                      }}
                      className="px-5 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      Log In with Email & Password
                    </button>
                    <button
                      onClick={() => setCurrentView('home')}
                      className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      Return Home
                    </button>
                  </div>
                </div>
              </div>
            ) : (activeGroupId || userGroups.length > 0) ? (
              <GroupAdminDashboard
                groupId={activeGroupId || userGroups[0].id}
                currentUser={user}
                onBack={() => setCurrentView('home')}
                onLogout={handleLogout}
                onOpenGroupView={() => setCurrentView('group_dashboard')}
              />
            ) : (
              <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="rounded-3xl bg-white border border-slate-200 p-8 shadow-sm">
                  <h2 className="text-xl font-black text-slate-900 mb-2">No Admin Group Found</h2>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    You are not currently registered as the creator or administrator of any Group Better Ajo.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => setCurrentView('group_create')}
                      className="px-5 py-3 rounded-xl bg-[#008751] hover:bg-[#007345] text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      Create a Group
                    </button>
                    <button
                      onClick={() => setCurrentView('home')}
                      className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      Return Home
                    </button>
                  </div>
                </div>
              </div>
            )
          )}

          {/* 8. Super Admin Portal */}
          {currentView === 'super_admin' && (
            <SuperAdminDashboard
              onBack={() => setCurrentView('home')}
              userPhone={user?.phone || '08154267469'}
              userId={user?.id}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Global Footer */}
      <Footer
        onOpenAbout={() => setInfoModalType('about')}
        onOpenPrivacy={() => setInfoModalType('privacy')}
        onOpenLiveChat={() => setIsLiveChatOpen(true)}
        onScrollToSection={handleScrollToSection}
      />

      {/* About & Privacy Info Modal */}
      <InfoModal
        isOpen={infoModalType !== null}
        onClose={() => setInfoModalType(null)}
        type={infoModalType || 'about'}
      />

      {/* Live Customer Support Chat */}
      <LiveSupportChat
        user={user}
        isOpen={isLiveChatOpen}
        onClose={() => setIsLiveChatOpen(false)}
        onOpen={() => setIsLiveChatOpen(true)}
      />

      {/* Database Status Modal */}
      <DatabaseStatusModal
        isOpen={isDbStatusOpen}
        onClose={() => setIsDbStatusOpen(false)}
      />

      {/* Auth & Choice Modal */}
      <AuthModal
        key={authModalKey}
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        mode={authModalMode}
        onSelectPersonal={() => {
          setIsAuthModalOpen(false);
          setCurrentView('personal_register');
        }}
        onSelectGroup={() => {
          setIsAuthModalOpen(false);
          setCurrentView('group_create');
        }}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}
