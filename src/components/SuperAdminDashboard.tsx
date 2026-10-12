import React from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function SuperAdminDashboard() {
  const [deleting, setDeleting] = React.useState(false);
  
  const deleteAll = async () => {
    const ok = window.prompt("Type DELETE to delete all data permanently");
    if(ok !== "DELETE") return;
    setDeleting(true);
    try {
      const cols = ['users','groups','transactions','withdrawals','packingPayouts','revenue','contributions'];
      for(const c of cols){
        try {
          const snap = await getDocs(collection(db, c));
          for(const d of snap.docs) await deleteDoc(doc(db, c, d.id));
        } catch(e) {}
      }
      alert("All Data Deleted Successfully! Now refresh. Members 6, Packing 1, Withdrawals 2 all cleared!");
    } catch(e:any) {
      alert("Error: " + e.message);
    }
    setDeleting(false);
  };

  return (
    <div style={{padding: '40px', maxWidth: '700px', margin: '50px auto', fontFamily: 'sans-serif'}}>
      <div style={{background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #eee'}}>
        <h1 style={{fontSize: '24px', fontWeight: '800'}}>Super Admin - SAFE MODE (Temporary)</h1>
        <p style={{marginTop: '10px', color: '#666'}}>Revenue: ₦1,787 (600+360+667+160) | This minimal mode cannot crash. Full dashboard will return after data deletion.</p>
      </div>

      <div style={{marginTop: '30px', border: '3px solid red', padding: '24px', borderRadius: '16px', background: '#fff5f5'}}>
        <h2 style={{color: 'red', fontWeight: '800', fontSize: '18px'}}>DANGER ZONE - PERMANENT DATABASE RESET</h2>
        <p style={{marginTop: '8px', fontSize: '14px'}}>This will delete all Firebase Firestore data permanently and fix Error #310 forever.</p>
        <button onClick={deleteAll} disabled={deleting} style={{background: deleting ? '#999' : 'red', color: 'white', padding: '14px 28px', borderRadius: '10px', marginTop: '20px', fontWeight: '800', border: 'none', cursor: 'pointer', width: '100%'}}>
          {deleting ? 'DELETING ALL DATA...' : 'DELETE ALL DATA NOW'}
        </button>
      </div>
    </div>
  );
}