import React, { useState, useEffect } from 'react';
import { Wallet, Copy, Check, ShieldCheck, ArrowUpCircle, ArrowDownCircle, Info } from 'lucide-react';

interface Transaction {
  id: string;
  type: 'ACTIVATION' | 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  fee: number;
  net: number;
  date: string;
  status: 'SUCCESS' | 'SIMULATED';
}

export const PersonalAjoDashboard: React.FC<{ userId?: string }> = ({ userId = 'user_123' }) => {
  // --- SIMULATION STATE SIR ---
  const [isActivated, setIsActivated] = useState<boolean>(() => {
    return localStorage.getItem(`personal_activated_${userId}`) === 'true';
  });
  const [virtualAccount] = useState<string>(() => {
    const saved = localStorage.getItem(`personal_va_${userId}`);
    if (saved) return saved;
    const va = `9458${Math.floor(100000 + Math.random() * 900000)}`;
    localStorage.setItem(`personal_va_${userId}`, va);
    return va;
  });
  const [totalSaved, setTotalSaved] = useState<number>(() => Number(localStorage.getItem(`personal_balance_${userId}`) || 0));
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const t = localStorage.getItem(`personal_tx_${userId}`);
    return t? JSON.parse(t) : [];
  });

  const [saveAmount, setSaveAmount] = useState<string>('5000');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Save to localStorage simulation sir
  useEffect(() => {
    localStorage.setItem(`personal_balance_${userId}`, String(totalSaved));
    localStorage.setItem(`personal_tx_${userId}`, JSON.stringify(transactions));
  }, [totalSaved, transactions, userId]);

  // --- ACTIVATION LOGIC SIR - 600 NAIRA ONLY FOR PERSONAL AJO SIR ---
  const handleSimulateActivation = async () => {
    setLoading(true);
    // Simulate API call sir
    await new Promise(r => setTimeout(r, 1000));

    // Mark activated sir
    localStorage.setItem(`personal_activated_${userId}`, 'true');
    setIsActivated(true);

    const tx: Transaction = {
      id: Date.now().toString(),
      type: 'ACTIVATION',
      amount: 600,
      fee: 0,
      net: 600,
      date: new Date().toISOString(),
      status: 'SIMULATED'
    };
    setTransactions(prev => [tx,...prev]);

    // Simulate Super Admin Stream 1 increase sir - Call your real API when ready sir
    // fetch('/api/super-admin-wallet', { method: 'POST', body: JSON.stringify({ stream: 1, amount: 600 }) })
    console.log('SIMULATION: Stream 1 +600 - Personal Activation');

    setLoading(false);
  };

  // --- SAVE LOGIC SIR - 60 NAIRA FEE ON TOP SIR ---
  const handleSimulateSave = async () => {
    const amt = Number(saveAmount);
    if (!amt || amt < 100) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));

    const fee = 60; // Stream 2 sir
    const totalPay = amt + fee;

    setTotalSaved(prev => prev + amt);

    const tx: Transaction = {
      id: Date.now().toString(),
      type: 'DEPOSIT',
      amount: amt,
      fee: fee,
      net: totalPay,
      date: new Date().toISOString(),
      status: 'SIMULATED'
    };
    setTransactions(prev => [tx,...prev]);

    // Stream 2 sir
    console.log(`SIMULATION: Stream 2 +${fee} - Saving ${amt} => User paid ${totalPay}`);

    setLoading(false);
  };

  // --- WITHDRAWAL LOGIC SIR - 1.6% FEE TO STREAM 4 SIR ---
  const handleSimulateWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt > totalSaved || amt < 100) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));

    const feePercent = 1.6;
    const fee = Number((amt * feePercent / 100).toFixed(2)); // Stream 4 sir
    const netToUser = amt - fee;

    setTotalSaved(prev => prev - amt);

    const tx: Transaction = {
      id: Date.now().toString(),
      type: 'WITHDRAWAL',
      amount: amt,
      fee: fee,
      net: netToUser,
      date: new Date().toISOString(),
      status: 'SIMULATED'
    };
    setTransactions(prev => [tx,...prev]);

    // Stream 4 sir
    console.log(`SIMULATION: Stream 4 +${fee} - Withdraw ${amt} => User gets ${netToUser} (1.6% fee)`);

    setWithdrawAmount('');
    setLoading(false);
  };

  const copyAccount = () => {
    navigator.clipboard.writeText(virtualAccount);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- ACTIVATION GATE SIR - BEFORE DASHBOARD SIR ---
  if (!isActivated) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-[#008751]/10 text-[#008751] flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Activate Personal Ajo</h2>
          <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
            Your personal savings account. Save anytime, withdraw anytime. Secure virtual account just for you.
          </p>

          <div className="mt-6 bg-slate-50 rounded-xl p-4 text-left text-sm border border-slate-200">
            <div className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Info className="h-4 w-4" /> What you get after activation:</div>
            <ul className="space-y-1.5 text-slate-700">
              <li>✅ Your own 10-digit Wema Bank virtual account</li>
              <li>✅ Save anytime - ₦60 fee on top of any amount</li>
              <li>✅ Withdraw anytime - 1.6% fee goes to Stream 4</li>
              <li>✅ No Goal, No Target - Just your personal pot</li>
            </ul>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-[#E6F3ED] border border-[#008751]/20">
            <div className="text-xs text-slate-600">One-time Activation Fee</div>
            <div className="text-3xl font-black text-[#008751]">₦600</div>
            <div className="text-[11px] text-slate-500 mt-1">Lifetime access - Group members don't pay this</div>
          </div>

          <button
            onClick={handleSimulateActivation}
            disabled={loading}
            className="mt-6 w-full py-3.5 rounded-xl bg-[#008751] text-white font-bold text-sm shadow-md hover:bg-[#007345] disabled:opacity-50 transition"
          >
            {loading? 'Activating...' : 'Pay ₦600 to Activate (Simulate)'}
          </button>

          <p className="text-[10px] text-slate-400 mt-3">
            SIMULATION MODE: Clicking simulates payment. When you connect real Monnify, this will be real Paystack/Monnify checkout. ₦600 goes to Super Admin Stream 1.
          </p>
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD SIR - PROFESSIONAL, NO GOAL/TARGET SIR ---
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header sir - Professional sir */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[#008751]" /> Personal Ajo
          </h1>
          <p className="text-xs text-slate-500 mt-1">Your personal savings - Private & Secure</p>
        </div>
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">ACTIVE</span>
      </div>

      {/* Virtual Account Card sir - Simulation sir */}
      <div className="bg-gradient-to-br from-[#008751] to-[#007345] rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-xs opacity-80">Personal Virtual Account</div>
          <div className="text-[10px] px-2 py-0.5 rounded-full bg-white/20">SIMULATED</div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="text-2xl font-black tracking-wider">{virtualAccount}</div>
          <button onClick={copyAccount} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition">
            {copied? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <div className="text-xs mt-1 opacity-80">Monnify - Wema Bank • Transfer to this account to save (simulated)</div>
        <div className="mt-3 text-[11px] opacity-70">When you connect real Monnify, this becomes real account number. Copy works same way.</div>
      </div>

      {/* Balance Cards sir */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">Total Saved</div>
          <div className="text-2xl font-black text-slate-900 mt-1">₦{totalSaved.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400 mt-1">Available to withdraw</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">Simulation Notice</div>
          <div className="text-xs text-slate-700 mt-1 leading-relaxed">
            All deposits/withdrawals are simulated now. Real Monnify webhook will replace <code>handleSimulateSave</code> later. No Goal/Target logic.
          </div>
        </div>
      </div>

      {/* Save Money sir - 60 fee sir */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><ArrowUpCircle className="h-4 w-4 text-[#008751]" /> Save Money</h3>
        <div className="mt-4 flex gap-3">
          <input
            type="number"
            value={saveAmount}
            onChange={(e) => setSaveAmount(e.target.value)}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#008751]/20 focus:border-[#008751]"
            placeholder="Amount to save"
          />
          <button
            onClick={handleSimulateSave}
            disabled={loading}
            className="px-5 py-3 rounded-xl bg-[#008751] text-white font-bold text-xs hover:bg-[#007345] disabled:opacity-50 transition"
          >
            {loading? '...' : `Save ₦${Number(saveAmount||0).toLocaleString()} (Pay ₦${(Number(saveAmount||0)+60).toLocaleString()})`}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">You pay amount + ₦60 fee on top. ₦60 goes to Super Admin Stream 2. Same for group contributions.</p>
      </div>

      {/* Withdraw Money sir - 1.6% fee Stream 4 sir */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><ArrowDownCircle className="h-4 w-4 text-rose-600" /> Withdraw Money</h3>
        <div className="mt-4 flex gap-3">
          <input
            type="number"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
            placeholder="Amount to withdraw"
            max={totalSaved}
          />
          <button
            onClick={handleSimulateWithdraw}
            disabled={loading ||!withdrawAmount || Number(withdrawAmount) > totalSaved}
            className="px-5 py-3 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black disabled:opacity-40 transition"
          >
            {withdrawAmount? `Withdraw ₦${Number(withdrawAmount).toLocaleString()} (Fee 1.6% = ₦${(Number(withdrawAmount)*0.016).toFixed(0)})` : 'Withdraw'}
          </button>
        </div>
        {withdrawAmount && (
          <p className="text-[11px] text-slate-600 mt-2">
            You withdraw ₦{Number(withdrawAmount).toLocaleString()} - Fee ₦{(Number(withdrawAmount)*0.016).toFixed(2)} (1.6%) goes to Stream 4 - You receive ₦{(Number(withdrawAmount)*0.984).toFixed(2)}
          </p>
        )}
      </div>

      {/* Transaction History sir */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900">Transaction History (Simulated)</h3>
        <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
          {transactions.length === 0 && <div className="text-xs text-slate-400 text-center py-8">No transactions yet - Activate and simulate a save</div>}
          {transactions.map(tx => (
            <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <div className="text-xs font-bold text-slate-900">{tx.type} - {tx.status}</div>
                <div className="text-[11px] text-slate-500">{new Date(tx.date).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-900">Amount: ₦{tx.amount.toLocaleString()} | Fee: ₦{tx.fee.toLocaleString()}</div>
                <div className="text-[11px] text-slate-600">Net: ₦{tx.net.toLocaleString()} {tx.type === 'WITHDRAWAL'? `(You get ₦${tx.net.toLocaleString()})` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* For Real Monnify sir - Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] text-amber-800">
        <b>To connect real Monnify sir:</b> Replace <code>handleSimulateActivation</code> with real Paystack checkout for ₦600, replace <code>virtualAccount</code> with real API response <code>res.accountNumber</code>, replace <code>handleSimulateSave</code> with webhook listener. Keep UI same. Streams already logged.
      </div>
    </div>
  );
};
