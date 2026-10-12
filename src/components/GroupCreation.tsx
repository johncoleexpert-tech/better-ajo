// GroupCreation.tsx - FINAL MODEL - GroupAdmin enters all members, auto generate virtual accounts, copy to WhatsApp
import React, { useState } from 'react';
import { formatNaira } from '../lib/formatters.js';
import { addDoc, collection, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

const CIRCLES = ["Daily", "Every 3 Days", "Every 4 Days", "Every 5 Days", "Every 7 Days", "Monthly"] as const;

type MemberInput = { id: string; fullName: string; phone: string; };
type GeneratedMember = { fullName: string; phone: string; virtualAccountNumber: string; bankName: string; accountName: string; };

export const GroupCreation: React.FC<any> = ({ agentId, agentName, onBack }) => {
  const [groupName, setGroupName] = useState("");
  const [membersCount, setMembersCount] = useState(5);
  const [contributionAmount, setContributionAmount] = useState(5000);
  const [circle, setCircle] = useState<typeof CIRCLES[number]>("Every 4 Days");
  const [packFee, setPackFee] = useState(3000);
  const [memberInputs, setMemberInputs] = useState<MemberInput[]>([
    { id: '1', fullName: '', phone: '' },
    { id: '2', fullName: '', phone: '' },
    { id: '3', fullName: '', phone: '' },
    { id: '4', fullName: '', phone: '' },
    { id: '5', fullName: '', phone: '' },
  ]);
  const [generated, setGenerated] = useState<GeneratedMember[]>([]);
  const [loading, setLoading] = useState(false);

  const updateMembersCount = (count: number) => {
    setMembersCount(count);
    const newInputs: MemberInput[] = [];
    for(let i=0; i<count; i++) {
      newInputs.push(memberInputs[i] || { id: `${i+1}`, fullName: '', phone: '' });
    }
    setMemberInputs(newInputs);
  };

  const handleCreate = async () => {
    if(!groupName) return alert("Enter group name sir");
    if(memberInputs.some(m=>!m.fullName ||!m.phone)) return alert("Fill all members full name and phone/WhatsApp sir");

    setLoading(true);
    try {
      // Generate virtual account numbers - Mock for now pending Monnify - Later auto from Monnify API sir
      const genMembers: GeneratedMember[] = memberInputs.map(m => ({
        fullName: m.fullName.trim(),
        phone: m.phone.trim(),
        virtualAccountNumber: `9${Math.floor(100000000 + Math.random()*900000000)}`, // 10-digit mock sir - Replace with Monnify API sir
        bankName: "Monnify - Wema Bank (Pending Approval)",
        accountName: m.fullName.trim().toUpperCase(),
      }));

      const batch = writeBatch(db);
      const groupRef = doc(collection(db, "groups"));
      batch.set(groupRef, {
        groupName: groupName.trim(),
        membersCount,
        contributionAmount,
        circle,
        packFee,
        agentId: agentId || "super_admin",
        agentName: agentName || "Super Admin",
        superAdminShare: Math.round(packFee * 0.3333),
        agentShare: Math.round(packFee * 0.6667),
        status: "active",
        createdAt: serverTimestamp(),
        virtualAccountEnabled: false,
        monnifyStatus: "pending_documents",
        platformFeeNote: "Member pays contribution + 60 extra - 60 not from pot sir",
      });

      genMembers.forEach(gm => {
        const memRef = doc(collection(db, `groups/${groupRef.id}/members`));
        batch.set(memRef, {
         ...gm,
          contributionAmount,
          circle,
          createdAt: serverTimestamp(),
          monnifyStatus: "pending_documents",
        });
      });

      await batch.commit();
      setGenerated(genMembers);
      alert(`SUCCESS sir! Group ${groupName} created with ${genMembers.length} members sir! Virtual accounts generated sir! Copy and send to them sir!`);
    } catch(e:any) {
      alert("Error sir: " + e.message);
    }
    setLoading(false);
  };

  const copyMember = (gm: GeneratedMember) => {
    const text = `Hello ${gm.fullName} sir/madam, You don join Group Ajo: ${groupName} sir. Circle: ${circle} sir. Contribution: ${formatNaira(contributionAmount)} + ${formatNaira(60)} bank charge = ${formatNaira(contributionAmount+60)} total sir. Your Personal Virtual Account Number: ${gm.virtualAccountNumber} | Bank: ${gm.bankName} | Name: ${gm.accountName} sir. Transfer to this account to pay sir. ${formatNaira(contributionAmount)} full go pot sir. Thank you sir! - Better Ajo`;
    navigator.clipboard.writeText(text);
    alert(`Copied for ${gm.fullName} sir! Send for WhatsApp sir!`);
  };

  const copyAll = () => {
    const allText = generated.map(gm => `${gm.fullName} - ${gm.phone} - Acct: ${gm.virtualAccountNumber} - ${gm.bankName} - ${formatNaira(contributionAmount)} + ${formatNaira(60)} = ${formatNaira(contributionAmount+60)}`).join("\n");
    navigator.clipboard.writeText(allText);
    alert("All copied sir!");
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow space-y-5 max-w-2xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Create Group Ajo - GroupAdmin Dashboard sir</h2>
        {onBack && <button onClick={onBack} className="text-sm bg-gray-100 px-3 py-1 rounded-full">Back</button>}
      </div>

      {generated.length === 0? (
        <>
          <input className="w-full border p-3 rounded-xl" placeholder="Group Name e.g IKORODU MARKET" value={groupName} onChange={e=>setGroupName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-bold">Members Count</label><input className="w-full border p-3 rounded-xl" type="number" value={membersCount} onChange={e=>updateMembersCount(Number(e.target.value))} /></div>
            <div><label className="text-sm font-bold">Pack Fee</label><input className="w-full border p-3 rounded-xl" type="number" value={packFee} onChange={e=>setPackFee(Number(e.target.value))} /></div>
          </div>
          <div><label className="text-sm font-bold">Contribution</label><input className="w-full border p-3 rounded-xl" type="number" value={contributionAmount} onChange={e=>setContributionAmount(Number(e.target.value))} /><p className="text-xs text-blue-600">Member go pay {formatNaira(contributionAmount+60)} sir ({formatNaira(contributionAmount)} pot + {formatNaira(60)} bank charge ON TOP sir)</p></div>
          <div><label className="text-sm font-bold">Circle - Agent selects sir</label><select className="w-full border p-3 rounded-xl bg-white" value={circle} onChange={e=>setCircle(e.target.value as any)}>{CIRCLES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>

          <div className="space-y-3">
            <h3 className="font-bold">Enter All Members - Full Name + Phone/WhatsApp sir - No registration needed sir - Pack automatic sir</h3>
            {memberInputs.map((m, idx)=>(
              <div key={m.id} className="grid grid-cols-2 gap-2 border p-2 rounded-xl">
                <input className="border p-2 rounded" placeholder={`Member ${idx+1} Full Name`} value={m.fullName} onChange={e=>{ const copy=[...memberInputs]; copy[idx].fullName=e.target.value; setMemberInputs(copy); }} />
                <input className="border p-2 rounded" placeholder={`Phone/WhatsApp`} value={m.phone} onChange={e=>{ const copy=[...memberInputs]; copy[idx].phone=e.target.value; setMemberInputs(copy); }} />
              </div>
            ))}
          </div>

          <button disabled={loading} onClick={handleCreate} className="w-full bg-black text-white p-4 rounded-full font-bold">{loading? "Creating sir..." : `Create Group & Generate Virtual Accounts sir - ${circle}`}</button>
        </>
      ) : (
        <div className="space-y-4">
          <h3 className="font-bold text-green-700">Group {groupName} Created! Virtual Accounts Generated sir! Copy & Send to WhatsApp sir!</h3>
          <button onClick={copyAll} className="w-full bg-blue-600 text-white p-3 rounded-full font-bold">Copy All Members sir</button>
          {generated.map((gm, i)=>(
            <div key={i} className="border p-4 rounded-xl space-y-2 bg-gray-50">
              <p className="font-bold">{i+1}. {gm.fullName} - {gm.phone}</p>
              <p className="text-sm">Acct: <span className="font-mono font-bold text-lg">{gm.virtualAccountNumber}</span></p>
              <p className="text-xs">{gm.bankName} - {gm.accountName}</p>
              <p className="text-xs text-blue-600">{formatNaira(contributionAmount)} pot + {formatNaira(60)} charge = {formatNaira(contributionAmount+60)} total sir</p>
              <button onClick={()=>copyMember(gm)} className="bg-black text-white px-4 py-2 rounded-full text-sm">Copy for {gm.fullName} & Send WhatsApp sir</button>
            </div>
          ))}
          <button onClick={()=>{ setGenerated([]); setGroupName(""); }} className="w-full bg-gray-200 p-3 rounded-full font-bold">Create Another Group sir</button>
        </div>
      )}
    </div>
  );
};
export default GroupCreation;
