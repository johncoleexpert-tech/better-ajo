import React, { useEffect, useState } from 'react';
import { Database, CheckCircle2, AlertTriangle, X, Shield, RefreshCw, KeyRound, Server } from 'lucide-react';
import { apiRequest } from '../lib/api.js';

interface DatabaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StatusData {
  supabaseConfigured: boolean;
  provider: 'supabase' | 'local_storage';
  missingEnv: string[];
  paystackLive: boolean;
  tables: string[];
  schemaFile: string;
}

export const DatabaseStatusModal: React.FC<DatabaseStatusModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/db/status');
      setStatus(data);
    } catch (err: any) {
      setError(err.message || 'Failed to check database status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#E6F3ED] text-[#008751] flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Database & Platform Status</h3>
              <p className="text-xs text-slate-500">Better Ajo Production & MVP Health</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="py-5 space-y-4">
          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-[#008751] mb-2" />
              <p className="text-xs font-semibold">Inspecting infrastructure...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              <p className="font-bold mb-1">Status check error</p>
              <p>{error}</p>
            </div>
          ) : status ? (
            <>
              {/* Supabase Connection Status Card */}
              <div
                className={`p-4 rounded-xl border ${
                  status.supabaseConfigured
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    {status.supabaseConfigured ? (
                      <CheckCircle2 className="w-5 h-5 text-[#008751] shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Supabase Database:{' '}
                        {status.supabaseConfigured ? (
                          <span className="text-[#008751]">Connected</span>
                        ) : (
                          <span className="text-amber-700">Awaiting Credentials</span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Active Data Layer:{' '}
                        <span className="font-mono font-semibold">
                          {status.supabaseConfigured ? 'Supabase PostgreSQL' : 'Persistent Storage (MVP mode)'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {!status.supabaseConfigured && status.missingEnv.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-amber-200/60 text-xs text-amber-900 space-y-1.5">
                    <p className="font-semibold">Required Environment Variables to connect your Supabase project:</p>
                    <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200 font-mono text-[11px] space-y-1">
                      {status.missingEnv.map((envVar) => (
                        <div key={envVar} className="flex items-center justify-between">
                          <span>{envVar}</span>
                          <span className="text-amber-700 text-[10px] font-bold">Missing</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Add these variables in AI Studio Settings/Secrets to connect your remote Supabase instance.
                    </p>
                  </div>
                )}
              </div>

              {/* Paystack Status */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-[#008751]" />
                  <span className="font-semibold text-slate-800">Paystack Gateway</span>
                </div>
                <div className="flex items-center space-x-1.5 font-bold">
                  {status.paystackLive ? (
                    <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Live Key Active</span>
                  ) : (
                    <span className="text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">Test / Sandbox Mode</span>
                  )}
                </div>
              </div>

              {/* Schema & Tables */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Better Ajo 8 Core Tables</span>
                  <span className="font-mono text-[11px] text-slate-500">{status.schemaFile}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {status.tables.map((tbl) => (
                    <div
                      key={tbl}
                      className="bg-white px-2 py-1 rounded border border-slate-200 font-mono text-[11px] text-slate-700 flex items-center space-x-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#008751]" />
                      <span>{tbl}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
          <button
            onClick={fetchStatus}
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition inline-flex items-center space-x-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#008751] hover:bg-[#007345] transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
