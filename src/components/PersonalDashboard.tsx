// PersonalDashboard.tsx - FINAL SAFE - No Build Error sir - Virtual Account + 60 ON TOP + Personal Ajo sir
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

type Props = { userId?: string; userName?: string; };

function formatNaira(n: number) {
  try {
    const { formatNaira: fmt } = require('../lib/formatters');
    return fmt(n);
  } catch {
    return `₦${Number(n).toLocaleString()}`;
  }
}

export const PersonalDashboard: React.FC<Props> = ({ userId = "test_user", userName = "User" }) => {
  const [goalName, setGoalName] = useState("");
  const [targetAmount, setTargetAmount] = useState(100000);
  const [amountToSave, setAmountToSave] = useState(5000);
  const [savings, setSavings] = useState<any[]>([]);
  const [totalSaved, setTotalSaved] = useState(0);
  const [virtualAccount] = useState(`9${Math.floor(100000000 + Math.random()*900000000)}`);
  const [bankName] = useState("Monnify - Wema Bank (Pending Docs sir)");

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, `users/${userId}/personal_savings`), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      let total = 0; const list:any[]=[];
      snap.forEach(d=>{ const data:any=d.data(); list.push({id:d.id,...data}); total+= data.amount||0; });
      setSavings(list); setTotalSaved(total);
    }, () => { /* ignore if no collection yet sir */ });
    return () => unsub();
  }, [userId]);

  const handleDeposit = async () => {
    if(!goalName) return alert("Enter goal name sir e.g Rent");
    if(!userId) return alert("No userId sir");
    try {
      await addDoc(collection(db, `users/${userId}/personal_savings`), {
        goalName: goalName.trim(),
        amount: amountToSave,
        targetAmount,
        userId, userName,
        type: "personal_deposit",
        platformFee: 60,
        platformFeeNote: `Full pot + 60 ON TOP sir`,
        createdAt: serverTimestamp(),
        virtualAccount, bankName,
        monnifyStatus: "pending_documents"
      });
      await addDoc(collection(db, "contributions"), {
        type: "personal_deposit",
        amount: amountToSave,
        userId, userName, goalName,
        platformFee: 60,
        createdAt: serverTimestamp(),
      });
      alert(`Saved ${formatNaira(amountToSave)} sir! You paid ${formatNaira(amountToSave+60)} total sir - ${formatNaira(amountToSave)} pot + ${formatNaira(60)} ON TOP sir`);
    } catch(e:any) { alert("Error sir: " + e.message); }
  };

  const handleActivation = async () => {
    try {
      await addDoc(collection(db, "contributions"), { type: "activation", amount: 600, userId, userName, createdAt: serverTimestamp() });
      alert("Activated! 600 Stream 1 sir");
    } catch(e:any){ alert(e.message); }
  };

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto bg-gray-50 min-h-screen">
      <h2 className="text-xl font-bold">Personal Ajo - Save Better sir</h2>

      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-5 rounded-2xl space-y-2">
        <p className="text-sm">Your Personal Virtual Account sir (Personal Savings)</p>
        <p className="text-3xl font-mono font-bold">{virtualAccount}</p>
        <p className="text-sm">{bankName}</p>
        <p className="text-xs opacity-80">{userName} - Deposit here sir</p>
        <button onClick={()=>{navigator.clipboard.writeText(virtualAccount); alert("Copied sir: "+virtualAccount);}} className="bg-white text-green-700 px-4 py-2 rounded-full text-sm font-bold">Copy Account sir</button>
        <p className="text-[10px]">Monnify Pending Docs sir - Structure Ready sir</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-xl shadow"><p className="text-xs text-gray-500">Total Saved</p><p className="text-xl font-bold">{formatNaira(totalSaved)}</p><p className="text-[10px]">Full pot sir</p></div>
        <div className="bg-white p-4 rounded-xl shadow"><p className="text-xs text-gray-500">Target</p><p className="text-xl font-bold">{formatNaira(targetAmount)}</p><p className="text-[10px]">{Math.round((totalSaved/targetAmount)*100)||0}% done sir</p></div>
      </div>

      <div className="bg-white p-5 rounded-xl shadow space-y-4">
        <input className="w-full border p-3 rounded-xl" placeholder="Goal Name - e.g Rent, School Fees" value={goalName} onChange={e=>setGoalName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-bold">Target Amount</label><input className="w-full border p-3 rounded-xl" type="number" value={targetAmount} onChange={e=>setTargetAmount(Number(e.target.value))} /></div>
          <div><label className="text-xs font-bold">Amount to Save</label><input className="w-full border p-3 rounded-xl" type="number" value={amountToSave} onChange={e=>setAmountToSave(Number(e.target.value))} /><p className="text-[11px] text-blue-600 mt-1">Pay {formatNaira(amountToSave+60)} sir - {formatNaira(amountToSave)} pot + 60 ON TOP sir</p></div>
        </div>
        <button onClick={handleDeposit} className="w-full bg-black text-white p-4 rounded-full font-bold">Save {formatNaira(amountToSave)} Now sir</button>
        <button onClick={handleActivation} className="w-full bg-gray-100 p-3 rounded-full text-sm">Activate Personal Ajo - 600 once sir</button>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-2">My Savings History sir</h3>
        {savings.map((s:any)=><div key={s.id} className="flex justify-between border-b py-2 text-sm"><span>{s.goalName}</span><span className="font-bold">{formatNaira(s.amount)} + 60 sir</span></div>)}
        {savings.length===0 && <p className="text-center text-xs py-4">No savings yet sir</p>}
      </div>
    </div>
  );
};

export default PersonalDashboard;
