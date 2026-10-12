import React, { useState, useEffect } from 'react';

type Tx = {
  id: string;
  type: 'ACTIVATION' | 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  fee: number;
  net: number;
  date: string;
};

export default function PersonalDashboard({ userId = 'user_123' }: { userId?: string }) {
  const [isActivated, setIsActivated] = useState(false);
  const [virtualAccount, setVirtualAccount] = useState('9458791374');
  const [totalSaved, setTotalSaved] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [saveAmount, setSaveAmount] = useState('5000');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load from localStorage sir
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const act = localStorage.getItem(`personal_activated_${userId}`) === 'true';
    setIsActivated(act);
    const va = localStorage.getItem(`personal_va_${userId}`);
    if (va) setVirtualAccount(va);
    else {
      const newVa = `9458${Math.floor(100000 + Math.random() * 900000)}`;
      localStorage.setItem(`personal_va_${userId}`, newVa);
      setVirtualAccount(newVa);
    }
    const bal = Number(localStorage.getItem(`personal_balance_${userId}`) || '0');
    setTotalSaved(bal);
    const tx = localStorage.getItem(`personal_tx_${userId}`);
    if (tx) {
      try { setTransactions(JSON.parse(tx)); } catch {}
    }
  }, [userId]);

  // Save sir
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`personal_balance_${userId}`, String(totalSaved));
    localStorage.setItem(`personal_tx_${userId}`, JSON.stringify(transactions));
  }, [totalSaved, transactions, userId]);

  const handleSimulateActivation = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    localStorage.setItem(`personal_activated_${userId}`, 'true');
    setIsActivated(true);
    const tx: Tx = { id: Date.now().toString(), type: 'ACTIVATION', amount: 600, fee: 0, net: 600, date: new Date().toISOString() };
    setTransactions(p => [tx,...p]);
    console.log('SIM: Stream 1 +600');
    setLoading(false);
  };

  const handleSimulateSave = async () => {
    const amt = Number(saveAmount);
    if (!amt || amt < 100) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    const fee = 60;
    setTotalSaved(p => p + amt);
    const tx: Tx = { id: Date.now().toString(), type: 'DEPOSIT', amount: amt, fee, net: amt + fee, date: new Date().toISOString() };
    setTransactions(p => [tx,...p]);
    console.log(`SIM: Stream 2 +${fee}`);
    setLoading(false);
  };

  const handleSimulateWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt > totalSaved || amt < 100) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    const fee = Number((amt * 0.016).toFixed(2));
    const netToUser = amt - fee;
    setTotalSaved(p => p - amt);
    const tx: Tx = { id: Date.now().toString(), type: 'WITHDRAWAL', amount: amt, fee, net: netToUser, date: new Date().toISOString() };
    setTransactions(p => [tx,...p]);
    console.log(`SIM: Stream 4 +${fee}`);
    setWithdrawAmount('');
    setLoading(false);
  };

  const copyAccount = () => {
    if (typeof navigator!== 'undefined') {
      navigator.clipboard.writeText(virtualAccount);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isActivated) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, textAlign: 'center' as const }}>
          <h2 style={{ fontSize: 20, fontWeight: 900 }}>Activate Personal Ajo</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>Your personal savings. Save anytime, withdraw anytime. Private virtual account.</p>

          <div style={{ marginTop: 16, background: '#f8fafc', borderRadius: 12, padding: 12, textAlign: 'left' as const, fontSize: 12, border: '1px solid #e2e8f0' }}>
            <b>What you get after activation:</b>
            <div style={{ marginTop: 6, lineHeight: '20px' }}>
              ✅ Your own 10-digit Wema virtual account<br/>
              ✅ Save anytime - ₦60 fee on top<br/>
              ✅ Withdraw anytime - 1.6% fee to Stream 4<br/>
              ✅ No Goal/Target - Just your pot
            </div>
          </div>

          <div style={{ marginTop: 16, background: '#E6F3ED', borderRadius: 12, padding: 12, border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>One-time Activation Fee (Only Personal Ajo)</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#008751' }}>₦600</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Lifetime - Group members don't pay</div>
          </div>

          <button onClick={handleSimulateActivation} disabled={loading} style={{ marginTop: 16, width: '100%', padding: '12px', borderRadius: 12, background: '#008751', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            {loading? 'Activating...' : 'Pay ₦600 to Activate (Simulate)'}
          </button>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>SIMULATION: No real Monnify yet. Clicking marks you activated. ₦600 -> Stream 1.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900 }}>Personal Ajo</h1>
          <p style={{ fontSize: 11, color: '#64748b' }}>Your personal savings - Private & Secure</p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>ACTIVE</span>
      </div>

      <div style={{ background: 'linear-gradient(135deg,#008751,#00663A)', borderRadius: 16, padding: 20, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.9 }}>
          <span>Personal Virtual Account (SIMULATED)</span>
          <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 999 }}>WEMA</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1 }}>{virtualAccount}</div>
          <button onClick={copyAccount} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer' }}>
            {copied? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6 }}>Monnify - Wema Bank - Simulate deposit to test behaviour before real API</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>Total Saved</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>₦{totalSaved.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Available to withdraw</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>Fees Info</div>
          <div style={{ fontSize: 11, marginTop: 4, lineHeight: '16px' }}>
            Save: ₦60 on top -> Stream 2<br/>Withdraw: 1.6% -> Stream 4<br/>Packing 33.33% -> Stream 3
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Save Money</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input type="number" value={saveAmount} onChange={e => setSaveAmount(e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 700 }} />
          <button onClick={handleSimulateSave} disabled={loading} style={{ padding: '10px 14px', borderRadius: 10, background: '#008751', color: '#fff', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>
            Save ₦{Number(saveAmount || 0).toLocaleString()} (Pay +₦60)
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>You pay ₦{(Number(saveAmount || 0) + 60).toLocaleString()} (save + fee). Fee goes to Stream 2.</div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Withdraw Money (1.6% fee to Stream 4)</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="Amount" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 700 }} />
          <button onClick={handleSimulateWithdraw} disabled={loading ||!withdrawAmount || Number(withdrawAmount) > totalSaved} style={{ padding: '10px 14px', borderRadius: 10, background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer' }}>
            {withdrawAmount? `Withdraw - Fee ₦${(Number(withdrawAmount) * 0.016).toFixed(0)}` : 'Withdraw'}
          </button>
        </div>
        {withdrawAmount && (
          <div style={{ fontSize: 10, color: '#334155', marginTop: 6 }}>
            Withdraw ₦{Number(withdrawAmount).toLocaleString()} - Fee ₦{(Number(withdrawAmount) * 0.016).toFixed(2)} - You get ₦{(Number(withdrawAmount) * 0.984).toFixed(2)}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Transaction History (Simulated)</div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
          {transactions.length === 0 && <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No transactions yet</div>}
          {transactions.map(tx => (
            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 10, padding: 10, border: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{tx.type}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(tx.date).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>Amt: ₦{tx.amount.toLocaleString()} | Fee: ₦{tx.fee}</div>
                <div style={{ color: '#475569' }}>Net: ₦{tx.net.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const PersonalAjoDashboardNamed = PersonalDashboard;
