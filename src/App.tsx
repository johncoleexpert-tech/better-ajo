import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomeHero } from './components/HomeHero';
import { AuthModal } from './components/AuthModal';
import { PersonalRegistration } from './components/PersonalRegistration';
import PersonalDashboard from './components/PersonalDashboard';
import { GroupCreation } from './components/GroupCreation';
import { GroupJoin } from './components/GroupJoin';
import { GroupDashboard } from './components/GroupDashboard';

type View = 'home' | 'personal-registration' | 'personal-dashboard' | 'group-creation' | 'group-join' | 'group-dashboard';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Navbar onNavigate={setView} onShowAuth={() => setShowAuth(true)} />
      {view === 'home' && <HomeHero onNavigate={setView} />}
      {view === 'personal-registration' && <PersonalRegistration onNavigate={setView} />}
      {view === 'personal-dashboard' && <PersonalDashboard />}
      {view === 'group-creation' && <GroupCreation />}
      {view === 'group-join' && <GroupJoin onNavigate={setView} />}
      {view === 'group-dashboard' && <GroupDashboard />}
      <Footer />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
