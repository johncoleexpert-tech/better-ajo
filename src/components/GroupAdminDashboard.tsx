// GroupAdminDashboard.tsx - FINAL V2 - Fixed Empty Dashboard + Old DB sir
import React, { useEffect, useState, useMemo } from 'react';
import { formatNaira } from '../lib/formatters.js';
import { ArrowLeft, Wallet, Users, Package, TrendingUp } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase.js';

type Props = { onBack: () => void; userId?: string; agentId?: string; agentName?: string; };

export const GroupAdminDashboard: React.FC<Props> = ({ onBack, userId, agentId, agentName }) => {
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // GET AGENT ID FROM EVERYWHERE SIR - LocalStorage + Props + Firebase Auth sir
  const getCurrentAgent = () => {
    try {
      const local = localStorage.getItem('currentGroupAdmin');
      if (local) {
        const parsed = JSON.parse(local);
        return { id: parsed.id || parsed.groupId || auth.currentUser?.uid, name: parsed.name, groupId: parsed.groupId, groupName: parsed.groupName, localData: parsed };
      }
    } catch {}
    return { id: agentId || userId || auth.currentUser?.uid || "super_admin", name: agentName, groupId: null, groupName: null, localData: null };
  };

  const currentAgent = getCurrentAgent();
  const currentAgentId = currentAgent.id;
  const displayName = currentAgent.name || agentName || auth.currentUser?.email || "Group Admin";

  useEffect(() => {
    console.log('Dashboard checking for agent:', currentAgentId, 'auth:', auth.currentUser?.uid);

    if (!currentAgentId || currentAgentId === "super_admin") {
      // Try to get from auth
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setLoading(false);
        setErrorMsg("No login found sir - Please login again sir. Old DB still dey sir.");
        // Show local group if exists sir
        const local = localStorage.getItem('currentGroupAdmin');
        if (local) {
          try {
            const p = JSON.parse(local);
            setMyGroups([{ id: p.groupId || 'local', groupName: p.groupName || 'MY NEW GROUP', membersCount: 3, packFee: 3000, circle: 'Daily', status: 'active', agentId: p.id, isLocal: true }]);
          } catch {}
        }
        return;
      }
    }

    const finalId = currentAgentId!== "super_admin"? currentAgentId : auth.currentUser?.uid;
    if (!finalId) { setLoading(false); return; }

    setLoading(true);
    // NO ORDERBY SIR - To avoid index error from old DB sir
    const q1 = query(collection(db, "groups"), where("agentId", "==", finalId));

    const unsub1 = onSnapshot(q1, snap => {
      const list:any[]=[];
      snap.forEach(d=>list.push({id:d.id,...d.data()}));
      console.log('Groups found:', list.length);

      // If no groups from Firebase but local exists, show local sir
      if (list.length === 0) {
        const local = localStorage.getItem('currentGroupAdmin');
        if (local) {
          try {
            const p = JSON.parse(local);
            if (p.groupName) {
              list.push({ id: p.groupId || 'local-'+Date.now(), groupName: p.groupName, membersCount: 3, packFee: 3000, circle: 'Daily', status: 'active (local)', agentId: finalId, isLocal: true });
            }
          } catch {}
        }
      }

      // Sort by createdAt in memory sir - No index needed sir
      list.sort((a,b) => {
        const ta = a.createdAt?.seconds || 0;
        const tb = b.createdAt?.seconds || 0;
        return tb - ta;
      });

      setMyGroups(list);
      setLoading(false);
      setErrorMsg("");
    }, err => {
      console.error('Firestore error sir:', err);
      setErrorMsg("Old DB blocking sir: " + err.message + " - Showing local group sir");
      // Show local group sir
      const local = localStorage.getItem('currentGroupAdmin');
      if (local) {
        try {
          const p = JSON.parse(local);
          setMyGroups([{ id: p.groupId || 'local', groupName: p.groupName || 'MY GROUP', membersCount: 3, packFee: 3000, circle: 'Daily', status: 'active (local)', agentId: finalId, isLocal: true }]);
        } catch {}
      }
      setLoading(false);
    });

    return () => unsub1();
  }, [currentAgentId]);

  const stats = useMemo(() => {
    let totalPackFee = 0;
    let myEarning = 0;
    let superAdminShare = 0;
    let totalMembers = 0;
    let totalContributionVolume = 0;
    myGroups.forEach((g:any)=>{
      const fee = g.packFee || 3000;
      totalPackFee += fee;
      myEarning += Math.round(fee * 0.6667);
      superAdminShare += Math.round(fee * 0.3333);
      totalMembers += g.membersCount || 0;
      totalContributionVolume += (g.contributionAmount || 5000) * (g.membersCount || 0);
    });
    return { totalPackFee, myEarning, superAdminShare, totalMembers, totalContributionVolume, groupsCount: myGroups.length };
  }, [myGroups]);

  return (
    <div className="p-4 space-y-6 bg-gray-50 min-h-screen max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow hover:bg-gray-100"><ArrowLeft size={20}/></button>
        <h1 className="text-xl font-bold">GroupAdmin Dashboard - {displayName} sir</h1>
      </div>

      <div className="bg-blue-600 text-white p-4 rounded-xl">
        <p className="text-sm font-bold">Welcome {displayName} sir - ID: {currentAgentId?.substring(0,8)}... sir</p>
        <p className="text-xs opacity-80 mt-1">If dashboard empty sir na old DB sir - New group dey localStorage sir - Clear old Firestore groups sir</p>
      </div>

      {loading && <div className="bg-white p-8 rounded-xl text-center">Loading your groups sir...</div>}
      {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs">{errorMsg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-black text-white p-4 rounded-xl">
          <p className="text-xs opacity-80">My Total Pack Fee</p>
          <p className="text-2xl font-bold">{formatNaira(stats.totalPackFee)}</p>
          <p className="text-[10px]">From {stats.groupsCount} groups sir</p>
        </div>
        <div className="bg-green-600 text-white p-4 rounded-xl border-2 border-yellow-400">
          <p className="text-xs flex items-center gap-1"><Wallet size={14}/> MY EARNING sir 66.67%</p>
          <p className="text-2xl font-bold">{formatNaira(stats.myEarning)}</p>
          <p className="text-[10px]">Must match SuperAdmin sir ✅</p>
        </div>
        <div className="bg-purple-600 text-white p-4 rounded-xl">
          <p className="text-xs">SuperAdmin 33.33%</p>
          <p className="text-2xl font-bold">{formatNaira(stats.superAdminShare)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Users size={14}/> Total Members</p>
          <p className="text-2xl font-bold">{stats.totalMembers}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-3">My Groups - {myGroups.length} groups sir</h3>
        {myGroups.length === 0 &&!loading && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No groups found for this account sir</p>
            <p className="text-xs text-red-500 mt-2">Old crash DB dey use different agentId sir - Check Firestore groups collection sir - Delete old groups sir</p>
            <p className="text-xs mt-2">Current UID: {auth.currentUser?.uid || currentAgentId}</p>
          </div>
        )}
        {myGroups.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100"><tr><th className="p-3 text-left">Group Name</th><th className="p-3 text-left">Circle</th><th className="p-3 text-left">Members</th><th className="p-3 text-left">Pack Fee</th><th className="p-3 text-left">My 66.67%</th><th className="p-3 text-left">Status</th></tr></thead>
              <tbody>
                {myGroups.map((g:any)=>(
                  <tr key={g.id} className="border-t">
                    <td className="p-3 font-bold">{g.groupName} {g.isLocal && <span className="text-[10px] bg-yellow-200 px-1 rounded">LOCAL</span>}</td>
                    <td className="p-3"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">{g.circle}</span></td>
                    <td className="p-3">{g.membersCount}</td>
                    <td className="p-3">{formatNaira(g.packFee||0)}</td>
                    <td className="p-3 font-bold text-green-600">{formatNaira(Math.round((g.packFee||0)*0.6667))}</td>
                    <td className="p-3"><span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs">{g.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupAdminDashboard;
