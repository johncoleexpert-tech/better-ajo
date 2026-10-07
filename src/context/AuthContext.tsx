import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase.js';
import { UserProfile } from '../types/index.js';

export interface AuthContextType {
  firebaseUser: User | null;
  user: UserProfile | null;
  role: string | null;
  groupId: string | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  user: null,
  role: null,
  groupId: null,
  loading: true,
  logout: async () => {},
  refreshProfile: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (u: User | null) => {
    if (!u) {
      setUser(null);
      setRole(null);
      setGroupId(null);
      setLoading(false);
      return;
    }

    try {
      if (db) {
        const uDoc = await getDoc(doc(db, 'users', u.uid));
        if (uDoc.exists()) {
          const data = uDoc.data();
          const isSA =
            data.phone === '08154267469' ||
            data.role === 'SUPER_ADMIN' ||
            data.role === 'superadmin' ||
            data.role === 'super_admin' ||
            u.email === 'realheavenict@gmail.com' ||
            u.email === 'superadmin@packajo.ng' ||
            u.email === 'paulakinyele54@gmail.com';

          const resolvedRole = isSA ? 'super_admin' : (data.role || 'user');
          const resolvedGroupId = data.groupId || data.group_id || null;

          setRole(resolvedRole);
          setGroupId(resolvedGroupId);
          setUser({
            id: u.uid,
            uid: u.uid,
            full_name: data.full_name || data.fullName || data.name || u.displayName || 'User',
            phone: data.phone || '',
            email: u.email || data.email || '',
            role: resolvedRole,
            bank_name: data.bank_name || 'Moniepoint MFB',
            account_number: data.account_number || '',
            verification_type: data.verification_type || 'BVN',
            verification_number: data.verification_number || '',
            created_at: data.created_at || new Date().toISOString(),
            updated_at: data.updated_at || new Date().toISOString()
          });
        } else {
          // Check if super admin email/phone
          const isSA =
            u.email === 'realheavenict@gmail.com' ||
            u.email === 'superadmin@packajo.ng' ||
            u.email === 'paulakinyele54@gmail.com';
          const resolvedRole = isSA ? 'super_admin' : 'user';

          setRole(resolvedRole);
          setUser({
            id: u.uid,
            uid: u.uid,
            full_name: u.displayName || 'User',
            phone: u.phoneNumber || '',
            email: u.email || '',
            role: resolvedRole,
            bank_name: 'Moniepoint MFB',
            account_number: '',
            verification_type: 'BVN',
            verification_number: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.warn('[AuthContext] error fetching user profile from Firestore:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsub = auth.onAuthStateChanged((u) => {
      setFirebaseUser(u);
      fetchUserProfile(u);
    });

    return () => unsub();
  }, []);

  const logout = async () => {
    if (auth) {
      await auth.signOut();
    }
    setFirebaseUser(null);
    setUser(null);
    setRole(null);
    setGroupId(null);
  };

  const refreshProfile = async () => {
    await fetchUserProfile(firebaseUser);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        role,
        groupId,
        loading,
        logout,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
