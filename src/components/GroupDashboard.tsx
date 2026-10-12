// GroupDashboard.tsx - FINAL - GroupAdmin oversee everything sir - Members, Virtual Accounts, Circle, Contributions sir
import React, { useEffect, useState } from 'react';
import { formatNaira } from '../lib/formatters.js';
import { ArrowLeft, Copy, Users, Wallet, Calendar, Phone } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

type Props = { onBack: () => void; groupId: string; groupData?: any; };

export const GroupDashboard: React.FC<Props> = ({ onBack, groupId, groupData }) => {
  const [members, setMembers] = useState<any[]>([]);
  const [contribs, setContribs] = useState<any[]>([]);
  const [group, setGroup] = useState<any>(groupData);

  useEffect(() => {
    if (!groupData) {
      const unsubGroup = onSnapshot(doc(db, "groups", groupId), snap => { if(snap.exists()) setGroup({id:snap.id,...snap.data()}); });
      return () => unsubGroup();
    } else {
      setGroup(groupData);
    }
  }, [groupId, groupData]);

  useEffect(() => {
    const q1 = query(collection(db, `groups/${groupId}/members`), orderBy("createdAt", "asc"));
    const unsub1 = onSnapshot(q1, snap => { const list:any[]=[]; snap.forEach(d=>list.push({id:d.id,...d.data()})); setMembers(list); });

    const q2 = query(collection(db, `groups/${groupId}/contributions`), orderBy("createdAt", "desc"));
    const unsub2 = onSnapshot(q2, snap => { const list:any[]=[]; snap.forEach(d=>list.push({id:d.id,...d.data()})); setContribs(list); });

    return () => { unsub1(); unsub2(); };
  }, [groupId]);

  const copyMember = (m:any) => {
    const text = `Hello ${m.fullName} sir/madam, Group: ${group?.groupName} sir. Circle: ${group?.circle} sir. Contribution: ${formatNaira(group?.contributionAmount||0)} + ${formatNaira(60)} bank charge = ${formatNaira((group?.contributionAmount||0)+60)} total sir. Your Personal Virtual Account: ${m.virtualAccountNumber} | Bank: ${m.bankName} | Name: ${m.accountName} sir. Transfer to this account to pay sir. ${formatNaira(group?.contributionAmount||0)} full go pot sir. - Better Ajo`;
    navigator.clipboard.writeText(text);
    alert(`Copied for ${m.fullName} sir! Send WhatsApp sir!`);
  };

  const copyAll = () => {
    const text = members.map(m=>`${m.fullName} - ${m.phone} - Acct: ${m.virtualAccountNumber} - ${m.bankName} - ${formatNaira(group?.contributionAmount||0)}+${formatNaira(60)}=${formatNaira((group?.contributionAmount||0)+60)}`).join("\n");
    navigator.clipboard.writeText(text);
    alert("All members copied sir!");
  };

  return (
    <div className="p-4 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow"><ArrowLeft size={20}/></button>
        <div><h1 className="text-xl font-bold">{group?.groupName || "Group Dashboard"} sir</h1><p className="text-xs text-gray-500">Pack automatic sir - Member no register sir</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl shadow"><p className="text-xs text-gray-500 flex gap-1"><Calendar size={14}/> Circle</p><p className="font-bold">{group?.circle}</p></div>
        <div className="bg-white p-4 rounded-xl shadow"><p className="text-xs text-gray-500 flex gap-1"><Wallet size={14}/> Contribution</p><p className="font-bold">{formatNaira(group?.contributionAmount||0)} + {formatNaira(60)}</p><p className="text-[10px]">+60 ON TOP sir - Pot full sir</p></div>
        <div className="bg-white p-4 rounded-xl shadow"><p className="text-xs text-gray-500 flex gap-1"><Users size={14}/> Members</p><p className="font-bold">{members.length} / {group?.membersCount}</p></div>
        <div className="bg-white p-4 rounded-xl shadow"><p className="text-xs text-gray-500">Pack Fee</p><p className="font-bold">{formatNaira(group?.packFee||0)}</p><p className="text-[10px]">You 66.67% = {formatNaira(Math.round((group?.packFee||0)*0.6667))}</p></div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold">Members + Virtual Accounts - Copy & Send WhatsApp sir - GroupAdmin oversee sir</h3>
          <button onClick={copyAll} className="bg-black text-white px-4 py-2 rounded-full text-sm flex items-center gap-1"><Copy size={14}/> Copy All sir</button>
        </div>
        <div className="space-y-3">
          {members.map((m:any, i:number)=>(
            <div key={m.id} className="border p-3 rounded-xl bg-gray-50 flex justify-between items-center">
              <div>
                <p className="font-bold">{i+1}. {m.fullName} <span className="text-xs font-normal flex items-center gap-1"><Phone size={12}/> {m.phone}</span></p>
                <p className="font-mono text-lg font-bold">{m.virtualAccountNumber}</p>
                <p className="text-xs">{m.bankName} - {m.accountName}</p>
                <p className="text-[11px] text-blue-600">{formatNaira(group?.contributionAmount||0)} full pot + {formatNaira(60)} bank charge sir</p>
                <p className="text-[10px]">Monnify: {m.monnifyStatus || group?.monnifyStatus || "pending_documents"}</p>
              </div>
              <button onClick={()=>copyMember(m)} className="bg-blue-600 text-white px-3 py-2 rounded-full text-xs">Copy & Send sir</button>
            </div>
          ))}
          {members.length===0 && <p className="text-center text-sm text-gray-500 py-6">No members yet sir - Go to GroupCreation to add members sir - Pack automatic sir</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-3">Contributions History - Oversee everything sir</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100"><tr><th className="p-2 text-left">Member</th><th className="p-2 text-left">Amount (Full Pot)</th><th className="p-2 text-left">+60 Charge</th><th className="p-2 text-left">Circle Day</th><th className="p-2 text-left">Date</th></tr></thead>
            <tbody>
              {contribs.map((c:any)=><tr key={c.id} className="border-t"><td className="p-2">{c.memberName||c.fullName}</td><td className="p-2 font-bold">{formatNaira(c.amount||group?.contributionAmount||0)}</td><td className="p-2 text-blue-600">+{formatNaira(60)}</td><td className="p-2">{group?.circle}</td><td className="p-2 text-xs">{c.createdAt?.toDate?.()?.toLocaleString()||"—"}</td></tr>)}
            </tbody>
          </table>
          {contribs.length===0 && <p className="text-center text-xs py-4">No contributions yet sir - Members go pay to their personal virtual account sir - Pack automatic sir</p>}
        </div>
      </div>
    </div>
  );
};

export default GroupDashboard;
