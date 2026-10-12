import React from 'react';

export default function PersonalDashboard() {
  const [isActivated, setIsActivated] = React.useState(false);
  const [balance, setBalance] = React.useState(0);
  const [saveAmount, setSaveAmount] = React.useState('5000');
  const [withdrawAmount, setWithdrawAmount] = React.useState('');

  if (!isActivated) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <h2 style={{ fontWeight: 900, fontSize: 18 }}>Activate Personal Ajo</h2>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Pay ₦600 once to get your personal virtual account. Group members don't pay ₦600.</p>
          <div style={{ marginTop: 16, background: '#E6F3ED', padding: 12, borderRadius: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#008751' }}>₦600</div>
          </div>
          <button
            onClick={() => setIsActivated(true)}
            style={{ marginTop: 16, width: '100%', padding: 12, borderRadius: 12, background: '#008751', color: '#fff', fontWeight: 700, border: 'none' }}
          >
            Simulate Pay ₦600 - Activate (Test)
          </button>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>SIMULATION MODE - No real Monnify yet</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontWeight: 900 }}>Personal Ajo - Simulation Mode</h1>
      <p style={{ fontSize: 11, color: '#64748b' }}>No Goal/Target - Just personal pot - Professional title</p>

      <div style={{ marginTop: 16, background: '#008751', color: '#fff', padding: 16, borderRadius: 16 }}>
        <div style={{ fontSize: 11 }}>Virtual Account (Simulated)</div>
        <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>9458791374 - WEMA</div>
      </div>

      <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e2e8f0', padding: 16, borderRadius: 16 }}>
        <div>Total Saved: <b>₦{balance.toLocaleString()}</b></div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input value={saveAmount} onChange={e => setSaveAmount(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <button onClick={() => { setBalance(b => b + Number(saveAmount || 0)); }} style={{ padding: '8px 12px', background: '#008751', color: '#fff', borderRadius: 8, border: 'none' }}>
            Save +₦60 fee (Stream 2)
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e2e8f0', padding: 16, borderRadius: 16 }}>
        <div>Withdraw (1.6% fee to Stream 4)</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="Amount" style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <button
            onClick={() => {
              const amt = Number(withdrawAmount || 0);
              if (amt > 0 && amt <= balance) {
                const fee = amt * 0.016;
                setBalance(b => b - amt);
                alert(`Withdraw ₦${amt} - Fee ₦${fee.toFixed(2)} (1.6% to Stream 4) - You get ₦${(amt - fee).toFixed(2)}`);
              }
            }}
            style={{ padding: '8px 12px', background: '#0f172a', color: '#fff', borderRadius: 8, border: 'none' }}
          >
            Withdraw
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>
          600 = Only Personal activation (Stream 1) | 60 = Every save/contribution on top (Stream 2) | 33.33% packing fee (Stream 3) | 1.6% withdrawal (Stream 4)
        </div>
      </div>
    </div>
  );
}
