import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  onClose: () => void;
}

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
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const res = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      console.log('Auth success:', res);
      localStorage.setItem('token', res.token || 'demo-token');
      localStorage.setItem('user', JSON.stringify(res.user || { email }));
      onClose();
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Auth failed. Check console.');
      // For demo - allow close even if backend not ready
      if (err.message?.includes('Failed to fetch')) {
        setError('Backend not connected - Demo login allowed');
        localStorage.setItem('token', 'demo-token');
        localStorage.setItem('user', JSON.stringify({ email }));
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-full">
          <X size={20} />
        </button>
        
        <h2 className="text-2xl font-bold mb-2">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
        <p className="text-gray-500 mb-6">{isLogin ? 'Login to your Pack Ajo account' : 'Join Pack Ajo today'}</p>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="animate-spin" size={18} />}
            {isLogin ? 'Login' : 'Register'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm">
          {isLogin ? "Don't have account? " : "Already have account? "}
          <button onClick={() => setIsLogin(!isLogin)} className="text-green-600 font-semibold hover:underline">
            {isLogin ? 'Register' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}
