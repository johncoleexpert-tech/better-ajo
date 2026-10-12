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
import CreateChoiceModal from './components/CreateChoiceModal';

type View = 'home' | 'personal-registration' | 'personal-dashboard' | 'group-creation' | 'group-join' | 'group-dashboard';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [showAuth, setShowAuth] = useState(false);
  const [showChoice, setShowChoice] = useState(false);

  // This function will be passed to Navbar and HomeHero sir
  const handleCreateClick = () => {
    setShowChoice(true);
  };

  const handleSelectPersonal = () => {
    setView('personal-registration');
  };

  const handleSelectGroup = () => {
    setView('group-creation');
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar onNavigate={setView} onShowAuth={() => setShowAuth(true)} onCreateClick={handleCreateClick} />
      {view === 'home' && <HomeHero onNavigate={setView} onCreateClick={handleCreateClick} />}
      {view === 'personal-registration' && <PersonalRegistration onNavigate={setView} />}
      {view === 'personal-dashboard' && <PersonalDashboard />}
      {view === 'group-creation' && <GroupCreation />}
      {view === 'group-join' && <GroupJoin onNavigate={setView} />}
      {view === 'group-dashboard' && <GroupDashboard />}
      <Footer />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      
      <CreateChoiceModal 
        isOpen={showChoice} 
        onClose={() => setShowChoice(false)}
        onSelectPersonal={handleSelectPersonal}
        onSelectGroup={handleSelectGroup}
      />
    </div>
  );
}
