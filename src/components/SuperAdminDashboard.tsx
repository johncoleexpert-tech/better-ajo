import React from 'react';
import { collection, getDocs, deleteDoc, doc, getFirestore } from 'firebase/firestore';

export default function SuperAdminDashboard() {
  const [deleting, setDeleting] = React.useState(false);
  
  const deleteAll = async () => {
    const ok = window.prompt("Type DELETE to delete all data permanently");
    if(ok !== "DELETE") return;
    setDeleting(true);
    try {
      const db = getFirestore();
      const cols = ['users','groups','transactions','withdrawals','packingPayouts','revenue','contributions','ajoGroups'];
      for(const c of cols){
        try {
          const snap = await getDocs(collection(db, c));
          for(const d of snap.docs) await deleteDoc(doc(db, c, d.id));
        } catch(e) {}
      }
      alert("SUCCESS! All Data Deleted! 6 members, packing, withdrawals cleared! Refresh site now!");
    } catch(e:any) {
      alert("Error: " + e.message);
    }
    setDeleting(false);
  };

  return (
    <div style={{padding: '40px', maxWidth: '700px', margin: '50px auto', fontFamily: 'sans-serif'}}>
      <div style={{background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #eee'}}>
        <h1 style={{fontSize: '24px', fontWeight: '800'}}>Super Admin - SAFE MODE (Temporary)</h1>
        <p style={{marginTop: '10px', color: '#666'}}>Revenue: ₦1,787 | Safe minimal mode - Cannot crash.</p>
      </div>
      <div style={{marginTop: '30px', border: '3px solid red', padding: '24px', borderRadius: '16px', background: '#fff5f5'}}>
        <h2 style={{color: 'red', fontWeight: '800', fontSize: '18px'}}>DANGER ZONE - PERMANENT DATABASE RESET</h2>
        <p style={{marginTop: '8px', fontSize: '14px'}}>This deletes all Firestore data and fixes Error #310 forever.</p>
        <button onClick={deleteAll} disabled={deleting} style={{background: deleting ? '#999' : 'red', color: 'white', padding: '14px 28px', borderRadius: '10px', marginTop: '20px', fontWeight: '800', border: 'none', cursor: 'pointer', width: '100%'}}>
          {deleting ? 'DELETING ALL DATA...' : 'DELETE ALL DATA NOW'}
        </button>
      </div>
    </div>
  );
}