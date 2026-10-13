// GroupCreation.tsx - FINAL V3 - With Auto Redirect to Group Admin Dashboard sir
import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../lib/firebase';

const NIGERIAN_BANKS = [
  "Access Bank", "GTBank - Guaranty Trust", "First Bank", "UBA - United Bank for Africa",
  "Zenith Bank", "Wema Bank", "Opay", "Palmpay", "Moniepoint", "Kuda Bank",
  "Fidelity Bank", "Union Bank", "Sterling Bank", "FCMB", "Ecobank",
  "Polaris Bank", "Stanbic IBTC", "Jaiz Bank", "Providus Bank", "Unity Bank", "Rubies Bank"
];

type MemberInput = { fullName: string; phone: string; accountNumber: string; bankName: string; virtualAccount: string; };

interface GroupCreationProps {
  onNavigate?: (view: string) => void;
}

export const GroupCreation: React.FC<GroupCreationProps> = ({ onNavigate }) => {
  const [groupName, setGroupName] = useState("");
  const [membersCount, setMembersCount] = useState(3);
  const [packFee, setPackFee] = useState(3000);
  const [contribution, setContribution] = useState(5000);
  const [circle, setCircle] = useState("Daily");
  const [loading, setLoading] = useState(false);

  const [agentFullName, setAgentFullName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentPassword, setAgentPassword] = useState("");
  const [agentAccountNumber, setAgentAccountNumber] = useState("");
  const [agentBankName, setAgentBankName] = useState("Access Bank");

  const [members, setMembers] = useState<MemberInput[]>(
    Array.from({ length: 3 }, () => ({ fullName: "", phone: "", accountNumber: "", bankName: "Access Bank", virtualAccount: "" }))
  );

  React.useEffect(() => {
    setMembers(prev => {
      if (prev.length === membersCount) return prev;
      if (prev.length < membersCount) return [...prev,...Array.from({ length: membersCount - prev.length }, () => ({ fullName: "", phone: "", accountNumber: "", bankName: "Access Bank", virtualAccount: "" }))];
      else return prev.slice(0, membersCount);
    });
  }, [membersCount]);

  const updateMember = (index: number, field: keyof MemberInput, value: string) => {
    const copy = [...members]; (copy[index] as any)[field] = value; setMembers(copy);
  };

  const handleCreate = async () => {
    if (!groupName.trim()) return alert("Enter Group Name sir");
    if (!agentFullName ||!agentEmail ||!agentPassword ||!agentAccountNumber) return alert("Fill Group Admin Full Details sir - Name + Email + Password + Account Number sir");
    if (agentPassword.length < 6) return alert("Password must be 6 characters minimum sir");
    for (let i = 0; i < members.length; i++) {
      if (!members[i].fullName ||!members[i].phone ||!members[i].accountNumber) return alert(`Fill Member ${i + 1} Full Name + Phone + Account Number sir`);
    }

    setLoading(true);
    try {
      const userCred = await createUserWithEmailAndPassword(auth, agentEmail.trim().toLowerCase(), agentPassword);
      const agentId = userCred.user.uid;

      await setDoc(doc(db, "agents", agentId), {
        fullName: agentFullName,
        email: agentEmail.trim().toLowerCase(),
        accountNumber: agentAccountNumber,
        bankName: agentBankName,
        role: "group_admin",
        createdAt: serverTimestamp(),
      });

      const membersWithVA = members.map(m => ({
      ...m,
        virtualAccount: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        monnifyBank: "Monnify - Wema Bank"
      }));

      const groupData = {
        groupName: groupName.trim().toUpperCase(),
        membersCount,
        packFee,
        contributionAmount: contribution,
        circle,
        agentId,
        agentName: agentFullName,
        agentEmail: agentEmail.trim().toLowerCase(),
        agentAccountDetails: {
          fullName: agentFullName,
          email: agentEmail.trim().toLowerCase(),
          accountNumber: agentAccountNumber,
          bankName: agentBankName,
          earningsPercent: 66.67,
        },
        members: membersWithVA,
        superAdminShare: 33.33,
        agentShare: 66.67,
        totalContributionWithFee: contribution + 60,
        createdAt: serverTimestamp(),
        createdBy: agentId,
        status: "active",
        packAutomatic: true,
      };

      const docRef = await addDoc(collection(db, "groups"), groupData);
      console.log('Group created:', docRef.id);

      alert(`GROUP CREATED SIR! ✅\nGroup: ${groupName.toUpperCase()}\nAdmin: ${agentFullName}\nEmail: ${agentEmail}\nNow going to Group Admin Dashboard sir!`);

      // SAVE TO LOCAL FOR DASHBOARD SIR
      localStorage.setItem('currentGroupAdmin', JSON.stringify({ id: agentId, email: agentEmail, name: agentFullName, groupId: docRef.id, groupName }));

      // REDIRECT SIR - THIS WAS MISSING SIR
      if (onNavigate) {
        onNavigate('group_admin_dashboard');
      } else {
        // fallback - reload to dashboard
        window.location.hash = 'group_admin_dashboard';
        window.location.reload();
      }

    } catch (e: any) {
      console.error(e);
      if (e.code === "auth/email-already-in-use") alert("This email already dey exist sir - Use another email sir or Login sir");
      else alert("Error sir: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto bg-white min-h-screen">
      <h2 className="text-xl font-bold">Create Group Ajo - GroupAdmin Dashboard</h2>
      <input className="w-full border-2 p-4 rounded-xl" placeholder="Group Name e.g IKORODU MARKET" value={groupName} onChange={e => setGroupName(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-sm font-bold">Members Count</label><input type="number" className="w-full border-2 p-3 rounded-xl" value={membersCount} onChange={e => setMembersCount(Math.max(1, Number(e.target.value)))} /></div>
        <div><label className="text-sm font-bold">Pack Fee</label><input type="number" className="w-full border-2 p-3 rounded-xl" value={packFee} onChange={e => setPackFee(Number(e.target.value))} /></div>
      </div>
      <div>
        <label className="text-sm font-bold">Contribution</label>
        <input type="number" className="w-full border-2 p-3 rounded-xl" value={contribution} onChange={e => setContribution(Number(e.target.value))} />
        <p className="text-xs text-blue-600 mt-1">Member go pay ₦{contribution + 60} sir (₦{contribution} pot + ₦60 ON TOP sir)</p>
      </div>
      <div>
        <label className="text-sm font-bold text-green-700">Circle - Agent selects</label>
        <select className="w-full border-2 p-3 rounded-xl" value={circle} onChange={e => setCircle(e.target.value)}>
          <option>Daily</option><option>3 Days</option><option>4 Days</option><option>5 Days</option><option>7 Days</option><option>Monthly</option>
        </select>
      </div>
      <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-xl space-y-3">
        <h3 className="font-bold text-red-700">Group Admin Full Details - Must Fill sir</h3>
        <input className="w-full border p-3 rounded-xl" placeholder="Group Admin Full Name" value={agentFullName} onChange={e => setAgentFullName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className="w-full border p-3 rounded-xl" type="email" placeholder="Group Admin Email - For Login sir" value={agentEmail} onChange={e => setAgentEmail(e.target.value)} />
          <input className="w-full border p-3 rounded-xl" type="password" placeholder="Group Admin Password - For Login sir" value={agentPassword} onChange={e => setAgentPassword(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className="w-full border p-3 rounded-xl" placeholder="Group Admin Account Number" value={agentAccountNumber} onChange={e => setAgentAccountNumber(e.target.value)} />
          <select className="w-full border p-3 rounded-xl" value={agentBankName} onChange={e => setAgentBankName(e.target.value)}>
            {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-4">
        <h3 className="font-bold">Enter All Members</h3>
        {members.map((m, i) => (
          <div key={i} className="border-2 p-3 rounded-xl space-y-2 bg-gray-50">
            <p className="text-xs font-bold">Member {i + 1} sir</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="border p-3 rounded-xl" placeholder={`Member ${i + 1} Full Name`} value={m.fullName} onChange={e => updateMember(i, "fullName", e.target.value)} />
              <input className="border p-3 rounded-xl" placeholder="Phone/WhatsApp" value={m.phone} onChange={e => updateMember(i, "phone", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="border p-3 rounded-xl" placeholder="Account Number" value={m.accountNumber} onChange={e => updateMember(i, "accountNumber", e.target.value)} />
              <select className="border p-3 rounded-xl" value={m.bankName} onChange={e => updateMember(i, "bankName", e.target.value)}>
                {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      <button onClick={handleCreate} disabled={loading} className="w-full bg-black text-white p-4 rounded-full font-bold text-lg disabled:bg-gray-400">
        {loading? 'Creating sir...' : `Create Group + Admin Login - ${circle}`}
      </button>
    </div>
  );
};

export default GroupCreation;
