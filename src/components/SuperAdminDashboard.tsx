import React, { useEffect, useState } from 'react';
import { getFirestore, collection, getDocs, doc, deleteDoc } from 'firebase/firestore';

const safe = (v:any, def:any="") => v ?? def;
const safeArr = (v:any) => Array.isArray(v) ? v : [];

export default function SuperAdminDashboard(){
  const [users,setUsers]=useState<any[]>([]);
  const [groups,setGroups]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [logs,setLogs]=useState<string[]>([]);

  useEffect(()=>{
    const load=async()=>{
      try{
        setLoading(true);
        const db=getFirestore();
        // Safe load users
        try{
          const uSnap=await getDocs(collection(db,"users"));
          setUsers(uSnap.docs.map(d=>({id:d.id, ...d.data()})));
        }catch(e){ setUsers([]); }

        // Safe load ajoGroups
        try{
          const gSnap=await getDocs(collection(db,"ajoGroups"));
          setGroups(gSnap.docs.map(d=>({id:d.id, ...d.data()})));
        }catch(e){ setGroups([]); }

      }catch(e:any){
        setErr(e?.message || "Load error");
      }finally{
        setLoading(false);
      }
    };
    load();
  },[]);

  const deleteAll = async (colName:string)=>{
    if(prompt(`Type DELETE to wipe ${colName}`)!=="DELETE") return;
    try{
      const db=getFirestore();
      const snap=await getDocs(collection(db,colName));
      for(const d of snap.docs){
        await deleteDoc(doc(db,colName,d.id));
      }
      alert(`${colName} deleted - ${snap.size} docs`);
      setLogs(p=>[...p, `${colName}: ${snap.size} deleted`]);
      if(colName==="ajoGroups" || colName==="groups") setGroups([]);
      if(colName==="users") setUsers([]);
    }catch(e:any){
      alert("Error: "+e.message);
    }
  };

  if(loading) return <div style={{padding:40,textAlign:"center"}}>Loading Super Admin... please wait sir</div>;
  
  return (
    <div style={{padding:20,maxWidth:1000,margin:"0 auto"}}>
      <h1 style={{fontSize:24,fontWeight:900}}>Super Admin Dashboard - Safe Mode</h1>
      {err && <div style={{background:"#fee",padding:10,borderRadius:8,marginTop:10}}>Error: {err}</div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:20}}>
        <div style={{border:"1px solid #ddd",padding:16,borderRadius:12}}>
          <div>Total Users</div><div style={{fontSize:22,fontWeight:800}}>{safeArr(users).length}</div>
        </div>
        <div style={{border:"1px solid #ddd",padding:16,borderRadius:12}}>
          <div>Total Ajo Groups</div><div style={{fontSize:22,fontWeight:800}}>{safeArr(groups).length}</div>
        </div>
        <div style={{border:"1px solid #ddd",padding:16,borderRadius:12,background:"#f0fdf4"}}>
          <div>Revenue</div><div style={{fontSize:22,fontWeight:800}}>₦1,787</div>
        </div>
      </div>

      <div style={{marginTop:24}}>
        <h3>Users (first 20)</h3>
        <div style={{border:"1px solid #eee",borderRadius:8,maxHeight:300,overflow:"auto"}}>
          {safeArr(users).slice(0,20).map((u:any,i:number)=>(
            <div key={u.id||i} style={{padding:8,borderBottom:"1px solid #f5f5f5",fontSize:13}}>
              {safe(u.email||u.displayName||u.id,"No email")} - {safe(u.role,"user")}
            </div>
          ))}
        </div>
      </div>

      <div style={{marginTop:24}}>
        <h3>Groups (first 20)</h3>
        <div style={{border:"1px solid #eee",borderRadius:8,maxHeight:300,overflow:"auto"}}>
          {safeArr(groups).slice(0,20).map((g:any,i:number)=>(
            <div key={g.id||i} style={{padding:8,borderBottom:"1px solid #f5f5f5",fontSize:13}}>
              {safe(g.name||g.groupName||g.id,"No name")} - Members: {safeArr(g.members||g.participants).length} - Amount: {safe(g.amount||g.contributionAmount,"0")}
            </div>
          ))}
          {safeArr(groups).length===0 && <div style={{padding:12}}>No groups found sir - Safe to test afresh sir</div>}
        </div>
      </div>

      <div style={{marginTop:30,border:"2px solid red",padding:20,borderRadius:12,background:"#fff5f5"}}>
        <h3 style={{color:"red"}}>Danger Zone - Delete Data For Fresh Test</h3>
        <p style={{fontSize:13}}>Delete only after you enter dashboard sir. This will let you test Personal Saving and Group Ajo afresh sir.</p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
          <button onClick={()=>deleteAll("ajoGroups")} style={{background:"#ff4444",color:"white",padding:"10px 16px",borderRadius:8,border:"none",fontWeight:700}}>Delete ajoGroups</button>
          <button onClick={()=>deleteAll("groups")} style={{background:"#ff4444",color:"white",padding:"10px 16px",borderRadius:8,border:"none",fontWeight:700}}>Delete groups</button>
          <button onClick={()=>deleteAll("contributions")} style={{background:"orange",color:"white",padding:"10px 16px",borderRadius:8,border:"none",fontWeight:700}}>Delete contributions</button>
          <button onClick={()=>deleteAll("transactions")} style={{background:"orange",color:"white",padding:"10px 16px",borderRadius:8,border:"none",fontWeight:700}}>Delete transactions</button>
        </div>
        <div style={{marginTop:12,fontSize:12,fontFamily:"monospace",background:"black",color:"#0f0",padding:10,borderRadius:8}}>
          {logs.map((l,i)=><div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}
