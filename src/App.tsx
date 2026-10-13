import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomeHero } from './components/HomeHero';
import { AuthModal } from './components/AuthModal';
import { PersonalRegistration } from './components/PersonalRegistration';
import PersonalDashboard from './components/PersonalDashboard';
import { GroupCreation } from './components/GroupCreation';
import { GroupJoin } from './components/GroupJoin';
import { GroupDashboard } from './components/GroupDashboard';

type View = 'home' | 'personal-registration' | 'personal-dashboard' | 'group-creation' | 'group-join' | 'group-dashboard' | 'super_admin' | 'group_admin_dashboard' | 'personal';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [showAuth, setShowAuth] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Fix: Make body scroll work sir
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const handleSelectPersonal = () => {
    console.log('Personal clicked sir!');
    setView('personal-registration');
    window.scrollTo(0, 0);
  };

  const handleSelectGroup = () => {
    console.log('Group clicked sir!');
    setView('group-creation');
    window.scrollTo(0, 0);
  };

  const handleLogin = () => {
    setShowLogin(true);
    setShowAuth(true);
  };

  const handleNavigateHome = () => {
    setView('home');
    window.scrollTo(0, 0);
  };

  const handleLogout = () => {
    setView('home');
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar
        onNavigateHome={handleNavigateHome}
        onOpenSignUp={handleSelectPersonal}
        onOpenSignUpChoice={handleSelectPersonal}
        onOpenPersonal={handleSelectPersonal}
        onOpenGroup={handleSelectGroup}
        onOpenLogin={handleLogin}
        onLogout={handleLogout}
        currentView={view}
        user={null}
        currentUser={null}
        personalAjo={null}
        groups={[]}
        hasAdminGroups={false}
        onScrollToSection={(id) => {
          if (view!== 'home') {
            setView('home');
            setTimeout(() => {
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          } else {
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      />

      {view === 'home' && (
        <HomeHero
          onSignUpChoice={handleSelectPersonal}
          onSelectPersonal={handleSelectPersonal}
          onSelectGroup={handleSelectGroup}
          onLogin={handleLogin}
        />
      )}

      {view === 'personal-registration' && <PersonalRegistration onNavigate={setView as any} />}
      {view === 'personal-dashboard' && <PersonalDashboard />}
      {view === 'group-creation' && <GroupCreation />}
      {view === 'group-join' && <GroupJoin onNavigate={setView as any} />}
      {view === 'group-dashboard' && <GroupDashboard />}

      <Footer />

      {showAuth && <AuthModal onClose={() => { setShowAuth(false); setShowLogin(false); }} />}
    </div>
  );
}
