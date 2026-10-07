import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Loader2 } from 'lucide-react';

interface DashboardRedirectProps {
  onNavigate: (view: string, groupId?: string) => void;
}

export const DashboardRedirect: React.FC<DashboardRedirectProps> = ({ onNavigate }) => {
  const { user, role, groupId, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      onNavigate('home');
      return;
    }

    if (role === 'super_admin' || role === 'SUPER_ADMIN' || user.phone === '08154267469') {
      // Super admin stays super admin on refresh - NO groupId - not Adugbo Jao
      window.history.replaceState({}, '', '/super-admin');
      onNavigate('super_admin');
    } else if (role === 'group_admin' || role === 'GROUP_ADMIN') {
      if (groupId) {
        window.history.replaceState({}, '', `/group-admin/${groupId}`);
        onNavigate('group_admin_dashboard', groupId);
      } else {
        onNavigate('group_admin_dashboard');
      }
    } else if (groupId) {
      window.history.replaceState({}, '', `/group/${groupId}`);
      onNavigate('group_dashboard', groupId);
    } else {
      onNavigate('home');
    }
  }, [user, role, groupId, loading, onNavigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-[#008751] mb-3" />
      <p className="text-xs font-semibold">Redirecting to your dashboard...</p>
    </div>
  );
};
