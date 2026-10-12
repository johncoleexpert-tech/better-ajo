// PROFESSIONAL RESTORED - FINAL FOREVER - SHOW GroupAdmin Earnings to SuperAdmin sir
import React, { useEffect, useState, useMemo } from 'react';
import { formatNaira } from '../lib/formatters.js';
import { Filter, ArrowLeft, TrendingUp, Wallet, Users, Package, UserCheck } from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, subscribeToPlatformRevenue } from '../lib/firebase.js';

type Props = { onBack: () => void; };

export const SuperAdminDashboard: React.FC<Props> = ({ onBack }) => {
  const [allContrib, setAllContrib] = useState<any[]>([]);
  const [allPacks, setAllPacks] = useState<any[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>({ gross: 0, withdrawn: 14000 });
  const [filter, setFilter] = useState<"ALL"|"PERSONAL"|"GROUP">("ALL");

  useEffect(() => {
    const q1 = query(collection(db, "contributions"), orderBy("createdAt", "desc"));
    const unsub1 = onSnapshot(q1, snap => { const list:any[]=[]; snap.forEach(d=>list.push({id:d.id,...d.data()})); setAllContrib(list); });

    const q2 = query(collection(db, "pack_transactions"), orderBy("createdAt", "desc"));
    const unsub2 = onSnapshot(q2, snap => { const list:any[]=[]; snap.forEach(d=>list.push({id:d.id,...d.data()})); setAllPacks(list); });

    const q3 = query(collection(db, "groups"), orderBy("createdAt", "desc"));
    const unsub3 = onSnapshot(q3, snap => { const list:any[]=[]; snap.forEach(d=>list.push({id:d.id,...d.data()})); setAllGroups(list); });

    const unsubRev = subscribeToPlatformRevenue((data: any) => setRevenue(data));
    return () => { unsub1(); unsub2(); unsub3(); unsubRev(); };
  }, []);

  const calculated = useMemo(() => {
    let stream1=0, stream2=0, stream3=0, stream4=0, agentEarning=0;
    allContrib.forEach((c:any)=>{
      if(c.type==="activation"||c.type==="personal_opening") stream1+=600;
      if(c.type==="personal_deposit"||c.type==="group_contribution"||c.type==="contribution") stream2+=60;
      if(c.type==="personal_withdraw") stream4+=(c.amount||0)*0.016;
    });
    allPacks.forEach((p:any)=>{ stream3+=(p.packFee||p.fee||0)*0.3333; agentEarning+=(p.packFee||p.fee||0)*0.6667; });
    // Also from groups directly sir
    allGroups.forEach((g:any)=>{
      if(!allPacks.find((p:any)=>p.groupId===g.id)){
        stream3+= (g.packFee||0)*0.3333;
        agentEarning+= (g.packFee||0)*0.6667;
      }
    });
    const gross = stream1+stream2+stream3+stream4;
    return { stream1, stream2, stream3, stream4, agentEarning, gross, withdrawn: revenue.withdrawn||14000, available: gross - (revenue.withdrawn||14000) };
  }, [allContrib, allPacks, allGroups, revenue]);

  const allTx = useMemo(()=>{
    const combined=[...allContrib,...allPacks].sort((a:any,b:any)=>{
      const da=a.createdAt?.toDate?a.createdAt.toDate():new Date(a.createdAt);
      const db=b.createdAt?.toDate?b.createdAt.toDate():new Date(b.createdAt);
      return db.getTime()-da.getTime();
    });
    if(filter==="PERSONAL") return combined.filter((t:any)=>t.type?.includes("personal"));
    if(filter==="GROUP") return combined.filter((t:any)=>t.type?.includes("group")||t.type==="contribution"||t.type==="packing"||t.circle);
    return combined;
  },[allContrib,allPacks,filter]);

  return (
    <div className="p-4 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex items-center gap-3"><button onClick={onBack} className="p-2 bg-white rounded-full shadow"><ArrowLeft size={20}/></button><h1 className="text-2xl font-bold">Super Admin - Save Better sir</h1></div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-green-600"><p className="text-xs text-gray-500 flex gap-1"><Users size={14}/> Stream 1</p><p className="text-xs">Personal Opening ₦600</p><p className="text-xl font-bold">{formatNaira(calculated.stream1)}</p></div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-blue-600"><p className="text-xs text-gray-500 flex gap-1"><Wallet size={14}/> Stream 2</p><p className="text-xs">Extra Bank ₦60 ON TOP</p><p className="text-xl font-bold">{formatNaira(calculated.stream2)}</p></div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-purple-600"><p className="text-xs text-gray-500 flex gap-1"><Package size={14}/> Stream 3</p><p className="text-xs">Pack 33.33% Your Share</p><p className="text-xl font-bold">{formatNaira(calculated.stream3)}</p></div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-orange-600"><p className="text-xs text-gray-500 flex gap-1"><TrendingUp size={14}/> Stream 4</p><p className="text-xs">Personal 1.6%</p><p className="text-xl font-bold">{formatNaira(calculated.stream4)}</p></div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-red-600"><p className="text-xs text-gray-500 flex gap-1"><UserCheck size={14}/> GroupAdmin Earning sir</p><p className="text-xs">Agent 66.67% Pack Fee</p><p className="text-xl font-bold text-red-600">{formatNaira(calculated.agentEarning)}</p><p className="text-[10px]">Visible to SuperAdmin sir</p></div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-black text-white p-4 rounded-xl"><p className="text-sm">Your Gross (4 Streams)</p><p className="text-2xl font-bold">{formatNaira(calculated.gross)}</p></div>
        <div className="bg-gray-800 text-white p-4 rounded-xl"><p className="text-sm">Withdrawn</p><p className="text-2xl font-bold">{formatNaira(calculated.withdrawn)}</p></div>
        <div className="bg-green-700 text-white p-4 rounded-xl"><p className="text-sm">Your Available</p><p className="text-2xl font-bold">{formatNaira(calculated.available)}</p></div>
      </div>

      {/* GROUP ADMIN EARNINGS BREAKDOWN - FOR SUPERADMIN TO SEE sir */}
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-3">Group Admin Earnings Breakdown - All Groups sir (Pack Automatic sir)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100"><tr><th className="p-3 text-left">Group Name (Dynamic)</th><th className="p-3 text-left">GroupAdmin Name</th><th className="p-3 text-left">Pack Fee</th><th className="p-3 text-left">SuperAdmin 33.33%</th><th className="p-3 text-left">GroupAdmin 66.67% (Earning)</th><th className="p-3 text-left">Circle</th><th className="p-3 text-left">Members</th></tr></thead>
            <tbody>
              {allGroups.map((g:any)=>(
                <tr key={g.id} className="border-t">
                  <td className="p-3 font-bold">{g.groupName}</td>
                  <td className="p-3">{g.agentName||"Group Admin"}</td>
                  <td className="p-3">{formatNaira(g.packFee||0)}</td>
                  <td className="p-3 text-purple-600 font-bold">{formatNaira(Math.round((g.packFee||0)*0.3333))}</td>
                  <td className="p-3 text-red-600 font-bold">{formatNaira(Math.round((g.packFee||0)*0.6667))} ← GroupAdmin Earning sir</td>
                  <td className="p-3"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">{g.circle}</span></td>
                  <td className="p-3">{g.membersCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-center text-gray-500 mt-2">Every group pack fee na automatic split sir - SuperAdmin 33.33% - GroupAdmin 66.67% sir - SuperAdmin can see all GroupAdmin earnings here sir</p>
      </div>

      <div className="flex gap-2">
        <button onClick={()=>setFilter("ALL")} className={`px-4 py-2 rounded-full text-sm ${filter==="ALL"?"bg-black text-white":"bg-white shadow"}`}><Filter size={14} className="inline mr-1"/> All</button>
        <button onClick={()=>setFilter("PERSONAL")} className={`px-4 py-2 rounded-full text-sm ${filter==="PERSONAL"?"bg-black text-white":"bg-white shadow"}`}>Personal</button>
        <button onClick={()=>setFilter("GROUP")} className={`px-4 py-2 rounded-full text-sm ${filter==="GROUP"?"bg-black text-white":"bg-white shadow"}`}>Group</button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100"><tr><th className="p-3 text-left">Group</th><th className="p-3 text-left">Member</th><th className="p-3 text-left">Circle</th><th className="p-3 text-left">Virtual Acct</th><th className="p-3 text-left">Full Pot</th><th className="p-3 text-left">+₦60</th><th className="p-3 text-left">Date</th></tr></thead>
          <tbody>
            {allTx.map((t:any)=><tr key={t.id} className="border-t"><td className="p-3 font-bold">{t.groupName||"Personal"}</td><td className="p-3">{t.memberName||t.userName||"User"}</td><td className="p-3">{t.circle||"Monthly"}</td><td className="p-3 text-xs">{t.virtualAccountNumber||"Pending"}</td><td className="p-3 font-bold">{formatNaira(t.amount||0)}</td><td className="p-3 text-blue-600">+{formatNaira(60)}</td><td className="p-3">{t.createdAt?.toDate?t.createdAt.toDate().toLocaleString(): "—"}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};
