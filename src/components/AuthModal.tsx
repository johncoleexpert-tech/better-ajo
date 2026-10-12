import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface Props { onClose: () => void; }

export function AuthModal({ onClose }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          email, uid: cred.user.uid, createdAt: serverTimestamp()
        });
      }
      onClose();
      window.location.reload();
    } catch (err: any) {
      setError(err.message.replace('Firebase:',''));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4"><X size={20} /></button>
        <h2 className="text-2xl font-bold mb-2">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="you@example.com" />
          <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="••••••••" />
          <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold flex justify-center gap-2">
            {loading && <Loader2 className="animate-spin" size={18} />} {isLogin ? 'Login' : 'Register'}
          </button>
        </form>
        <p className="text-center mt-4 text-sm">{isLogin ? "No account? " : "Have account? "}<button onClick={()=>setIsLogin(!isLogin)} className="text-green-600 font-semibold">{isLogin ? 'Register' : 'Login'}</button></p>
      </div>
    </div>
  );
}
