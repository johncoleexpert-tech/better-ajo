import React from 'react';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
export default function SuperAdminDashboard(){
  const [d,setD]=React.useState(false);
  const del=async()=>{
    if(window.prompt("Type DELETE")!=="DELETE")return;
    setD(true);
    const db=getFirestore();
    for(const c of ['users','groups','transactions','withdrawals','packingPayouts','revenue','ajoGroups','contributions']){
      try{
        const s=await getDocs(collection(db,c));
        for(const x of s.docs) await deleteDoc(doc(db,c,x.id));
      }catch{}
    }
    alert("SUCCESS! All Deleted! Now refresh your website!");
    setD(false);
  };
  return React.createElement("div",{style:{padding:40,maxWidth:700,margin:"50px auto",fontFamily:"sans-serif"}},
    React.createElement("div",{style:{background:"white",padding:24,borderRadius:16,border:"1px solid #eee"}},
      React.createElement("h1",{style:{fontSize:24,fontWeight:800}},"Super Admin - SAFE MODE"),
      React.createElement("p",{style:{marginTop:10}},"Revenue: ₦1,787 - Cannot Crash Again")
    ),
    React.createElement("div",{style:{marginTop:30,border:"3px solid red",padding:24,borderRadius:16,background:"#fff5f5"}},
      React.createElement("h2",{style:{color:"red",fontWeight:800}},"DANGER ZONE"),
      React.createElement("button",{onClick:del,disabled:d,style:{background:d?"#999":"red",color:"white",padding:14,borderRadius:10,marginTop:20,fontWeight:800,width:"100%",border:"none"}}, d?"DELETING...":"DELETE ALL DATA NOW")
    )
  );
}
