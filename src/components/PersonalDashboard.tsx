// PersonalAjo.tsx - FINAL - Personal Savings - Correct 60 ON TOP + Virtual Account + Monnify Pending sir
import React, { useState, useEffect } from 'react';
import { formatNaira } from '../lib/formatters.js';
import { addDoc, collection, serverTimestamp, onSnapshot, query, where, orderBy, doc } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { Copy, Wallet, Target, TrendingUp } from 'lucide-react';

type Props = { userId: string; userName?: string; };

export const PersonalAjo: React.FC<Props> = ({ userId, userName }) => {
  const [goalName, setGoalName] = useState("");
  const [targetAmount, setTargetAmount] = useState(100000);
  const [amountToSave, setAmountToSave] = useState(5000);
  const [savings, setSavings] = useState<any[]>([]);
  const [totalSaved, setTotalSaved] = useState(0);
  const [virtualAccount, setVirtualAccount] = useState("Pending - Monnify verification sir");
  const [bankName, setBankName] = useState("Monnify - Wema (Pending Docs)");

  useEffect(() => {
    const q = query(collection(db, `users/${userId}/personal_savings`), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      let total = 0; const list:any[]=[];
      snap.forEach(d=>{ const data:any=d.data(); list.push({id:d.id,...data}); total+= data.amount||0; });
      setSavings(list); setTotalSaved(total);
    });
    // Mock virtual account for personal sir - Replace with real Monnify later sir
    setVirtualAccount(`9${Math.floor(100000000 + Math.random()*900000000)}`);
    return () => unsub();
  }, [userId]);

  const handleDeposit = async () => {
    if(!goalName) return alert("Enter goal name sir e.g Rent, School Fees sir");
    await addDoc(collection(db, `users/${userId}/personal_savings`), {
      goalName: goalName.trim(),
      amount: amountToSave, // Full amount go pot sir - No deduction sir
      targetAmount,
      userId, userName,
      type: "personal_deposit",
      platformFee: 60, // Extra ON TOP sir - Not from pot sir - User pays amount+60 sir
      platformFeeNote: `${formatNaira(amountToSave)} full pot + ${formatNaira(60)} extra bank charge ON TOP = ${formatNaira(amountToSave+60)} total paid sir`,
      createdAt: serverTimestamp(),
      virtualAccount, bankName,
      monnifyStatus: "pending_documents"
    });
    // Also add to contributions for SuperAdmin Stream 2 sir
    await addDoc(collection(db, "contributions"), {
      type: "personal_deposit",
      amount: amountToSave,
      userId, userName, goalName,
      platformFee: 60,
      createdAt: serverTimestamp(),
    });
    alert(`Saved ${formatNaira(amountToSave)} sir! You paid ${formatNaira(amountToSave+60)} total sir (${formatNaira(amountToSave)} pot + ${formatNaira(60)} bank charge ON TOP sir) - Full ${formatNaira(amountToSave)} enter your savings sir!`);
  };

  const handleActivation = async () => {
    await addDoc(collection(db, "contributions"), { type: "activation", amount: 600, userId, userName, createdAt: serverTimestamp() });
    alert("Personal Ajo Activated! ₦600 activation fee - Stream 1 for SuperAdmin sir");
  };

  const copyAccount = () => {
    navigator.clipboard.writeText(virtualAccount);
    alert(`Copied sir: ${virtualAccount} - Your Personal Virtual Account for Personal Ajo sir - Pay ${formatNaira(amountToSave+60)} to this account sir`);
  };

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold">Personal Ajo - Save Better Personal Savings sir</h2>

      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-5 rounded-2xl space-y-2">
        <p className="text-sm flex items-center gap-2"><Wallet size={16}/> Your Personal Virtual Account sir (Personal Savings)</p>
        <p className="text-3xl font-mono font-bold">{virtualAccount}</p>
        <p className="text-sm">{bankName}</p>
        <p className="text-xs opacity-80">{userName} - Use to deposit personal savings sir</p>
        <button onClick={copyAccount} className="bg-white text-green-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1"><Copy size={14}/> Copy sir</button>
        <p className="text-[10px]">Monnify status: Pending documents sir - Real account after approval sir - Structure ready sir</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-xl shadow"><p className="text-xs text-gray-500"><Target size={14} className="inline"/> Total Saved</p><p className="text-xl font-bold">{formatNaira(totalSaved)}</p><p className="text-[10px]">Full pot sir - No deduction sir</p></div>
        <div className="bg-white p-4 rounded-xl shadow"><p className="text-xs text-gray-500"><TrendingUp size={14} className="inline"/> Target</p><p className="text-xl font-bold">{formatNaira(targetAmount)}</p><p className="text-[10px]">{Math.round((totalSaved/targetAmount)*100)||0}% done sir</p></div>
      </div>

      <div className="bg-white p-5 rounded-xl shadow space-y-4">
        <input className="w-full border p-3 rounded-xl" placeholder="Goal Name - Dynamic e.g Rent, School Fees, Car" value={goalName} onChange={e=>setGoalName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-bold">Target Amount</label><input className="w-full border p-3 rounded-xl" type="number" value={targetAmount} onChange={e=>setTargetAmount(Number(e.target.value))} /></div>
          <div><label className="text-xs font-bold">Amount to Save Now</label><input className="w-full border p-3 rounded-xl" type="number" value={amountToSave} onChange={e=>setAmountToSave(Number(e.target.value))} /><p className="text-[11px] text-blue-600 mt-1">You go pay {formatNaira(amountToSave+60)} sir ({formatNaira(amountToSave)} + {formatNaira(60)} charge ON TOP sir) - {formatNaira(amountToSave)} full enter savings sir</p></div>
        </div>
        <button onClick={handleDeposit} className="w-full bg-black text-white p-4 rounded-full font-bold">Save {formatNaira(amountToSave)} Now sir - Pay {formatNaira(amountToSave+60)} to Virtual Account sir</button>
        <button onClick={handleActivation} className="w-full bg-gray-100 p-3 rounded-full text-sm">Activate Personal Ajo - ₦600 once sir - Stream 1 sir</button>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-2">My Savings History sir</h3>
        <div className="space-y-2">
          {savings.map((s:any)=><div key={s.id} className="flex justify-between border-b py-2 text-sm"><span>{s.goalName} - {s.createdAt?.toDate?.()?.toLocaleDateString()}</span><span className="font-bold">{formatNaira(s.amount)} + {formatNaira(60)} charge ON TOP sir</span></div>)}
          {savings.length===0 && <p className="text-center text-xs py-4">No savings yet sir - Start saving sir - Pack automatic sir - Virtual account ready sir</p>}
        </div>
      </div>
    </div>
  );
};

export default PersonalAjo;
