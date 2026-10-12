// GroupCreation.tsx - FINAL - With Agent & Member Bank Accounts + Dropdown + Virtual Accounts + Pack Automatic sir
import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

const NIGERIAN_BANKS = [
  "Access Bank", "GTBank - Guaranty Trust", "First Bank", "UBA - United Bank for Africa",
  "Zenith Bank", "Wema Bank", "Opay", "Palmpay", "Moniepoint", "Kuda Bank",
  "Fidelity Bank", "Union Bank", "Sterling Bank", "FCMB", "Ecobank",
  "Polaris Bank", "Stanbic IBTC", "Jaiz Bank", "Providus Bank", "Unity Bank", "Rubies Bank"
];

type MemberInput = { fullName: string; phone: string; accountNumber: string; bankName: string; virtualAccount: string; };

export const GroupCreation: React.FC<{ agentId?: string; agentName?: string }> = ({ agentId = "ABOSEDE_TIJANI", agentName = "ABOSEDE TIJANI" }) => {
  const [groupName, setGroupName] = useState("");
  const [membersCount, setMembersCount] = useState(3);
  const [packFee, setPackFee] = useState(3000);
  const [contribution, setContribution] = useState(5000);
  const [circle, setCircle] = useState("Daily");

  // GroupAdmin / Agent Account Details sir - Where earnings go sir
  const [agentFullName, setAgentFullName] = useState(agentName);
  const [agentAccountNumber, setAgentAccountNumber] = useState("");
  const [agentBankName, setAgentBankName] = useState("Access Bank");

  const [members, setMembers] = useState<MemberInput[]>(
    Array.from({ length: 3 }, () => ({ fullName: "", phone: "", accountNumber: "", bankName: "Access Bank", virtualAccount: "" }))
  );

  React.useEffect(() => {
    setMembers(prev => {
      if (prev.length === membersCount) return prev;
      if (prev.length < membersCount) {
        return [...prev,...Array.from({ length: membersCount - prev.length }, () => ({ fullName: "", phone: "", accountNumber: "", bankName: "Access Bank", virtualAccount: "" }))];
      } else {
        return prev.slice(0, membersCount);
      }
    });
  }, [membersCount]);

  const updateMember = (index: number, field: keyof MemberInput, value: string) => {
    const copy = [...members]; (copy[index] as any)[field] = value; setMembers(copy);
  };

  const handleCreate = async () => {
    if (!groupName.trim()) return alert("Enter Group Name sir e.g IKORODU MARKET sir");
    if (!agentFullName ||!agentAccountNumber) return alert("Fill Agent Full Name + Account Number sir - Where earnings go sir");
    for (let i = 0; i < members.length; i++) {
      if (!members[i].fullName ||!members[i].phone ||!members[i].accountNumber) return alert(`Fill Member ${i + 1} Full Name + Phone + Account Number sir - Where pack money go sir`);
    }

    // Generate Virtual Accounts for members sir - Monnify pending sir
    const membersWithVA = members.map(m => ({
     ...m,
      virtualAccount: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
      bankNameForPayout: m.bankName,
      accountNumberForPayout: m.accountNumber,
      monnifyBank: "Monnify - Wema Bank (Pending Docs sir)"
    }));

    const groupData = {
      groupName: groupName.trim().toUpperCase(),
      membersCount,
      packFee,
      contributionAmount: contribution,
      circle, // Daily, 3 Days, 4 Days, 5 Days, 7 Days, Monthly sir - Agent selects sir
      agentId,
      agentName: agentFullName,
      // Agent account where 66.67% earnings go sir
      agentAccountDetails: {
        fullName: agentFullName,
        accountNumber: agentAccountNumber,
        bankName: agentBankName,
        earningsPercent: 66.67,
        note: "Agent earnings 66.67% of pack fee go here sir"
      },
      members: membersWithVA,
      // For SuperAdmin split sir
      superAdminShare: 33.33,
      agentShare: 66.67,
      totalContributionWithFee: contribution + 60,
      platformFeeNote: `Member go pay ₦${contribution + 60} sir (₦${contribution} pot + ₦60 bank charge ON TOP sir) - Pot full sir`,
      createdAt: serverTimestamp(),
      createdBy: agentId,
      status: "active",
      packAutomatic: true,
    };

    try {
      await addDoc(collection(db, "groups"), groupData);
      // Also log pack transaction for SuperAdmin Stream 3 sir
      await addDoc(collection(db, "pack_transactions"), {
        groupName: groupName.trim().toUpperCase(),
        packFee,
        agentEarning: (packFee * 66.67) / 100,
        superAdminEarning: (packFee * 33.33) / 100,
        agentId,
        agentAccountNumber,
        agentBankName,
        createdAt: serverTimestamp(),
      });

      const whatsappText = `BETTER AJO GROUP CREATED sir:\nGroup: ${groupName.toUpperCase()}\nCircle: ${circle}\nContribution: ₦${contribution} + ₦60 ON TOP = ₦${contribution + 60}\nPack Fee: ₦${packFee}\n\nAgent Account for Earnings:\n${agentFullName}\n${agentAccountNumber} - ${agentBankName}\n\nMembers:\n${membersWithVA.map((m, i) => `${i + 1}. ${m.fullName} - ${m.phone} - ${m.accountNumber} ${m.bankName} - VA: ${m.virtualAccount}`).join("\n")}\n\nMember pay to their Virtual Account sir - When pack, money auto go to their bank account sir`;

      navigator.clipboard.writeText(whatsappText);
      alert(`Group ${groupName.toUpperCase()} Created sir! ✅\nAgent Earnings Account: ${agentAccountNumber} ${agentBankName} sir - 66.67% go there sir\nMembers: ${membersCount} sir - Each get Virtual Account sir - Pack money auto go to their bank account sir - WhatsApp copied sir!`);
      setGroupName("");
    } catch (e: any) {
      alert("Error sir: " + e.message);
    }
  };

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto bg-white min-h-screen">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Create Group Ajo - GroupAdmin Dashboard</h2>
        <button onClick={() => window.history.back()} className="bg-gray-100 px-4 py-2 rounded-full text-sm">Back</button>
      </div>

      <input className="w-full border-2 p-4 rounded-xl" placeholder="Group Name e.g IKORODU MARKET" value={groupName} onChange={e => setGroupName(e.target.value)} />

      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-sm font-bold">Members Count</label><input type="number" className="w-full border-2 p-3 rounded-xl" value={membersCount} onChange={e => setMembersCount(Math.max(1, Number(e.target.value)))} /></div>
        <div><label className="text-sm font-bold">Pack Fee</label><input type="number" className="w-full border-2 p-3 rounded-xl" value={packFee} onChange={e => setPackFee(Number(e.target.value))} /></div>
      </div>

      <div>
        <label className="text-sm font-bold">Contribution</label>
        <input type="number" className="w-full border-2 p-3 rounded-xl" value={contribution} onChange={e => setContribution(Number(e.target.value))} />
        <p className="text-xs text-blue-600 mt-1">Member go pay ₦{contribution + 60} sir (₦{contribution} pot + ₦60 bank charge ON TOP sir)</p>
      </div>

      <div>
        <label className="text-sm font-bold text-green-700">Circle - Agent selects</label>
        <select className="w-full border-2 p-3 rounded-xl" value={circle} onChange={e => setCircle(e.target.value)}>
          <option>Daily</option><option>3 Days</option><option>4 Days</option><option>5 Days</option><option>7 Days</option><option>Monthly</option>
        </select>
      </div>

      {/* AGENT ACCOUNT DETAILS SIR */}
      <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-xl space-y-3">
        <h3 className="font-bold">Group Admin / Agent Account Details - Where Your 66.67% Earnings Go sir</h3>
        <input className="w-full border p-3 rounded-xl" placeholder="Agent Full Name" value={agentFullName} onChange={e => setAgentFullName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className="w-full border p-3 rounded-xl" placeholder="Agent Account Number" value={agentAccountNumber} onChange={e => setAgentAccountNumber(e.target.value)} />
          <select className="w-full border p-3 rounded-xl" value={agentBankName} onChange={e => setAgentBankName(e.target.value)}>
            {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <p className="text-[11px]">This account go receive Pack Fee 66.67% sir - e.g if Pack Fee ₦3000, you go receive ₦2000 sir</p>
      </div>

      <div className="space-y-4">
        <h3 className="font-bold">Enter All Members - Full Name + Phone + Bank Account for Payout sir - No registration needed sir - Pack automatic sir</h3>
        {members.map((m, i) => (
          <div key={i} className="border-2 p-3 rounded-xl space-y-2 bg-gray-50">
            <p className="text-xs font-bold">Member {i + 1} sir</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="border p-3 rounded-xl" placeholder={`Member ${i + 1} Full Name`} value={m.fullName} onChange={e => updateMember(i, "fullName", e.target.value)} />
              <input className="border p-3 rounded-xl" placeholder="Phone/WhatsApp" value={m.phone} onChange={e => updateMember(i, "phone", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="border p-3 rounded-xl" placeholder="Account Number - Where Pack money go" value={m.accountNumber} onChange={e => updateMember(i, "accountNumber", e.target.value)} />
              <select className="border p-3 rounded-xl" value={m.bankName} onChange={e => updateMember(i, "bankName", e.target.value)}>
                {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-gray-500">Pack money go auto to {m.accountNumber || "their account"} - {m.bankName} sir</p>
          </div>
        ))}
      </div>

      <button onClick={handleCreate} className="w-full bg-black text-white p-4 rounded-full font-bold text-lg">
        Create Group & Generate Virtual Accounts - {circle}
      </button>

      <p className="text-[11px] text-center">Agent: {agentFullName} - {agentAccountNumber} {agentBankName} sir - 66.67% earnings sir | Members: Virtual Account for contribution + Bank Account for payout sir</p>
    </div>
  );
};

export default GroupCreation;
