// GroupCreation.tsx - FINAL FOREVER - Circle Daily/3/4/5/7/Monthly + Virtual + Correct 60 ON TOP + Monnify Ready
import React, { useState } from 'react';
import { formatNaira } from '../lib/formatters.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

const CIRCLES = ["Daily", "Every 3 Days", "Every 4 Days", "Every 5 Days", "Every 7 Days", "Monthly"] as const;

type Props = { agentId?: string; agentName?: string; onBack?: () => void; onCreated?: () => void; };

export const GroupCreation: React.FC<Props> = ({ agentId, agentName, onBack, onCreated }) => {
  const [groupName, setGroupName] = useState("");
  const [membersCount, setMembersCount] = useState(5);
  const [contributionAmount, setContributionAmount] = useState(5000);
  const [circle, setCircle] = useState<typeof CIRCLES[number]>("Every 4 Days");
  const [packFee, setPackFee] = useState(3000);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if(!groupName) { alert("Enter group name sir"); return; }
    setLoading(true);
    try {
      await addDoc(collection(db, "groups"), {
        groupName: groupName.trim(), // Dynamic sir - Any name agent type sir
        membersCount,
        contributionAmount, // Full pot sir - No deduction sir
        circle, // Agent selects sir - Daily, Every 3,4,5,7, Monthly sir
        packFee,
        agentId: agentId || "super_admin",
        agentName: agentName || "Super Admin",
        superAdminShare: Math.round(packFee * 0.3333),
        agentShare: Math.round(packFee * 0.6667),
        status: "active",
        createdAt: serverTimestamp(),
        // Monnify Virtual Account Structure - Pending sir
        virtualAccountEnabled: false,
        monnifyStatus: "pending_documents",
        // Correct fee logic sir
        platformFeeNote: "Member pays contribution + 60 extra bank charge - 60 not from pot sir",
      });

      alert(`SUCCESS sir! Group ${groupName} created sir! Circle: ${circle} sir! Contribution: ${formatNaira(contributionAmount)} + ${formatNaira(60)} bank charge = ${formatNaira(contributionAmount+60)} total sir - Full ${formatNaira(contributionAmount)} go pot sir!`);
      setGroupName("");
      onCreated?.();
    } catch(e:any) {
      alert("Error sir: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow space-y-5 max-w-xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Create Group Ajo sir - Dynamic</h2>
        {onBack && <button onClick={onBack} className="text-sm bg-gray-100 px-3 py-1 rounded-full">Back</button>}
      </div>

      <div className="space-y-3">
        <label className="text-sm font-bold">Group Name (Dynamic - Any name) sir</label>
        <input className="w-full border p-3 rounded-xl" placeholder="e.g IKORODU MARKET, ALABA TRADERS, LAGOS LADIES" value={groupName} onChange={e=>setGroupName(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-bold">Members Count</label>
          <input className="w-full border p-3 rounded-xl" type="number" value={membersCount} onChange={e=>setMembersCount(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-sm font-bold">Pack Fee</label>
          <input className="w-full border p-3 rounded-xl" type="number" value={packFee} onChange={e=>setPackFee(Number(e.target.value))} />
          <p className="text-[10px] mt-1">You 66.67% = {formatNaira(Math.round(packFee*0.6667))} | SuperAdmin 33.33% = {formatNaira(Math.round(packFee*0.3333))}</p>
        </div>
      </div>

      <div>
        <label className="text-sm font-bold">Contribution Amount (Full Pot) sir</label>
        <input className="w-full border p-3 rounded-xl" type="number" value={contributionAmount} onChange={e=>setContributionAmount(Number(e.target.value))} />
        <p className="text-xs text-blue-600 mt-1">Member go pay {formatNaira(contributionAmount)} + {formatNaira(60)} extra bank charge = {formatNaira(contributionAmount+60)} total sir - {formatNaira(contributionAmount)} full enter pot sir - No deduction sir</p>
      </div>

      <div>
        <label className="text-sm font-bold">Select Circle - Agent Decides sir</label>
        <select className="w-full border p-3 rounded-xl bg-white" value={circle} onChange={e=>setCircle(e.target.value as any)}>
          {CIRCLES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <p className="text-xs text-gray-500 mt-1">Options: Daily | Every 3 Days | Every 4 Days | Every 5 Days | Every 7 Days | Monthly sir</p>
      </div>

      <div className="bg-blue-50 p-3 rounded-xl text-xs">
        <p className="font-bold">Virtual Account Info sir:</p>
        <p>Every member go get personal virtual account number to deposit sir - For now Monnify status: Pending documents sir - Once approved, auto generate for all members sir - Structure ready sir</p>
      </div>

      <button disabled={loading} onClick={handleCreate} className="w-full bg-black text-white p-4 rounded-full font-bold disabled:opacity-50">
        {loading? "Creating sir..." : `Create Group - ${circle} sir`}
      </button>
    </div>
  );
};

export default GroupCreation;
