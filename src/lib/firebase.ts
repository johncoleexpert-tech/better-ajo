import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  runTransaction,
  serverTimestamp,
  Firestore,
  Unsubscribe
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'better-ajo-b629a',
  apiKey: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) || 'AIzaSyBetterAjoPlatformClient2026',
  authDomain: 'better-ajo-b629a.firebaseapp.com',
  storageBucket: 'better-ajo-b629a.appspot.com'
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app);
export const auth = getAuth(app);
export { sendPasswordResetEmail };

// Enable offline persistence in firebase.ts: enableIndexedDbPersistence(db)
if (typeof window !== 'undefined') {
  try {
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('[Firestore Persistence] Multiple tabs open; persistence active in primary tab.');
      } else if (err.code === 'unimplemented') {
        console.warn('[Firestore Persistence] Browser does not support IndexedDb persistence.');
      }
    });
  } catch (e) {
    console.warn('[Firestore Persistence] Notice:', e);
  }
}

export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  runTransaction,
  serverTimestamp
};

/**
 * Real-time listener for user personalBalance directly from Firestore users/{userId} collection.
 */
export function subscribeToUserPersonalBalance(
  userId: string,
  onBalanceUpdate: (balance: number, data: any) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!userId) return () => {};
  const userRef = doc(db, 'users', userId);

  return onSnapshot(
    userRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const personalBalance = Number(data.personalBalance ?? data.balance ?? 0);
        onBalanceUpdate(personalBalance, data);
      } else {
        // Check personal_ajo fallback if users doc not yet created
        const pRef = doc(db, 'personal_ajo', userId);
        getDoc(pRef).then((pSnap) => {
          if (pSnap.exists()) {
            const pData = pSnap.data();
            onBalanceUpdate(Number(pData.balance ?? 0), pData);
          }
        }).catch(() => {});
      }
    },
    (err) => {
      console.warn('[Firestore Listener] users snapshot error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Real-time listener for personalAjos doc using onSnapshot.
 * FIX A: Dashboard balance must read from personalAjos total_saved via onSnapshot, not local state.
 */
export function subscribeToPersonalAjoDoc(
  userId: string,
  onUpdate: (data: any) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!userId) return () => {};

  const handleDoc = (data: any) => {
    if (!data) return;
    const totalSaved = Number(data.total_saved ?? data.balance ?? 0);
    onUpdate({
      ...data,
      total_saved: totalSaved,
      balance: totalSaved
    });
  };

  // 1. Listen directly to personalAjos doc (by userId)
  const docRef1 = doc(db, 'personalAjos', userId);
  const unsubDoc1 = onSnapshot(docRef1, (snap) => {
    if (snap.exists()) {
      handleDoc(snap.data());
    }
  }, (err) => {
    if (onError) onError(err);
  });

  // 2. Query personalAjos by user_id
  const q1 = query(collection(db, 'personalAjos'), where('user_id', '==', userId));
  const unsubQuery1 = onSnapshot(q1, (snapshot) => {
    if (!snapshot.empty) {
      handleDoc(snapshot.docs[0].data());
    }
  }, (err) => {
    if (onError) onError(err);
  });

  // 3. Fallback listen to personal_ajo doc
  const docRef2 = doc(db, 'personal_ajo', userId);
  const unsubDoc2 = onSnapshot(docRef2, (snap) => {
    if (snap.exists()) {
      handleDoc(snap.data());
    }
  }, () => {});

  // 4. Query personal_ajo by user_id
  const q2 = query(collection(db, 'personal_ajo'), where('user_id', '==', userId));
  const unsubQuery2 = onSnapshot(q2, (snapshot) => {
    if (!snapshot.empty) {
      handleDoc(snapshot.docs[0].data());
    }
  }, () => {});

  return () => {
    unsubDoc1();
    unsubQuery1();
    unsubDoc2();
    unsubQuery2();
  };
}

/**
 * Real-time listener for personal payments (deposits & withdrawals) for user_id / userId == me
 */
export function subscribeToUserPersonalPayments(
  userId: string,
  onPaymentsUpdate: (payments: any[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!userId) return () => {};

  const paymentsMap: Record<string, any> = {};
  const txMap: Record<string, any> = {};

  const emit = () => {
    // Deduplicate by reference or ID to prevent x3 duplicate transaction bug
    const dedupedMap = new Map<string, any>();

    // 1. First add payments
    for (const p of Object.values(paymentsMap)) {
      const refKey = p?.reference || p?.id;
      if (refKey) {
        dedupedMap.set(refKey, p);
      }
    }

    // 2. Merge/overwrite with transactions (transactions contain detailed status, fee, savings_amount, etc.)
    for (const t of Object.values(txMap)) {
      const refKey = t?.reference || t?.ref || t?.id;
      if (refKey) {
        dedupedMap.set(refKey, t);
      }
    }

    const combined = Array.from(dedupedMap.values());
    combined.sort((a, b) => {
      const timeA = a?.timestamp?.seconds ? (a.timestamp.seconds * 1000) : new Date(a?.created_at || a?.createdAt || a?.paid_at || 0).getTime();
      const timeB = b?.timestamp?.seconds ? (b.timestamp.seconds * 1000) : new Date(b?.created_at || b?.createdAt || b?.paid_at || 0).getTime();
      return timeB - timeA;
    });
    onPaymentsUpdate(combined);
  };

  const qPayments = query(
    collection(db, 'payments'),
    where('user_id', '==', userId)
  );

  const unsubPayments = onSnapshot(
    qPayments,
    (snapshot) => {
      snapshot.forEach((doc) => {
        paymentsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      emit();
    },
    (err) => {
      console.warn('[Firestore] personal payments listener error:', err);
      if (onError) onError(err);
    }
  );

  const qTx1 = query(
    collection(db, 'transactions'),
    where('userId', '==', userId)
  );

  const unsubTx1 = onSnapshot(
    qTx1,
    (snapshot) => {
      snapshot.forEach((doc) => {
        txMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      emit();
    },
    (err) => {
      console.warn('[Firestore] user transactions listener 1 error:', err);
    }
  );

  const qTx2 = query(
    collection(db, 'transactions'),
    where('user_id', '==', userId)
  );

  const unsubTx2 = onSnapshot(
    qTx2,
    (snapshot) => {
      snapshot.forEach((doc) => {
        txMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      emit();
    },
    (err) => {
      console.warn('[Firestore] user transactions listener 2 error:', err);
    }
  );

  return () => {
    unsubPayments();
    unsubTx1();
    unsubTx2();
  };
}

export interface PlatformRevenueMainData {
  stream1: number;
  stream2: number;
  stream3: number;
  stream4: number;
  totalGross: number;
  totalWithdrawn: number;
  unifiedAvailable: number;
  lastUpdated?: any;
}

/**
 * 3. Super Admin page should ONLY do ONE thing on load:
 * const doc = await getDoc(doc(db, 'platformRevenue', 'main'))
 * setRevenue(doc.data())
 * NO calculation, NO sum.
 */
export async function getPlatformRevenueMain(): Promise<PlatformRevenueMainData | null> {
  const docRef = doc(db, 'platformRevenue', 'main');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const d = snap.data();
    return {
      stream1: Number(d.stream1 || 0),
      stream2: Number(d.stream2 || 0),
      stream3: Number(d.stream3 || 0),
      stream4: Number(d.stream4 || 0),
      totalGross: Number(d.totalGross || 0),
      totalWithdrawn: Number(d.totalWithdrawn || 0),
      unifiedAvailable: Number(d.unifiedAvailable || 0),
      lastUpdated: d.lastUpdated
    };
  }
  return null;
}

/**
 * Real-time listener for the permanent platformRevenue/main document directly.
 * Zero calculation, zero iteration, pure document snapshot state.
 */
export function subscribeToPlatformRevenue(
  onRevenueUpdate: (stats: {
    stream1_registration: number;
    stream2_contribution: number;
    stream3_packing: number;
    stream4_withdrawal: number;
    stream1: number;
    stream2: number;
    stream3: number;
    stream4: number;
    totalGross: number;
    totalWithdrawn: number;
    availableBalance: number;
    unifiedAvailable: number;
  }) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const mainDocRef = doc(db, 'platformRevenue', 'main');

  return onSnapshot(
    mainDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        const s1 = Number(d.stream1 || 0);
        const s2 = Number(d.stream2 || 0);
        const s3 = Number(d.stream3 || 0);
        const s4 = Number(d.stream4 || 0);
        const gross = Number(d.totalGross || 0);
        const withdrawn = Number(d.totalWithdrawn || 0);
        const available = Number(d.unifiedAvailable ?? (gross - withdrawn) ?? 0);

        onRevenueUpdate({
          stream1_registration: s1,
          stream2_contribution: s2,
          stream3_packing: s3,
          stream4_withdrawal: s4,
          stream1: s1,
          stream2: s2,
          stream3: s3,
          stream4: s4,
          totalGross: gross,
          totalWithdrawn: withdrawn,
          availableBalance: available,
          unifiedAvailable: available
        });
      }
    },
    (err) => {
      console.warn('[Firestore Listener] platformRevenue/main snapshot error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * 4. For new money to add correctly, use ONLY increment in transaction:
 * On Personal Ajo save of N5000 with 1.6% fee (N80):
 * transaction.update(platformRevenue/main, {
 *   stream4: increment(80),
 *   totalGross: increment(80),
 *   unifiedAvailable: increment(80)
 * })
 */
export async function incrementPlatformRevenueClient(
  stream: 'stream1' | 'stream2' | 'stream3' | 'stream4',
  amount: number
): Promise<void> {
  if (!amount || isNaN(amount) || amount <= 0) return;
  const mainRef = doc(db, 'platformRevenue', 'main');
  await runTransaction(db, async (transaction) => {
    transaction.update(mainRef, {
      [stream]: increment(amount),
      totalGross: increment(amount),
      unifiedAvailable: increment(amount),
      lastUpdated: serverTimestamp()
    });
  });
}

/**
 * 5. On Super Admin withdraw N9,888:
 * transaction.update(platformRevenue/main, {
 *   totalWithdrawn: increment(9888),
 *   unifiedAvailable: increment(-9888)
 * })
 */
export async function deductPlatformRevenueWithdrawalClient(
  amount: number
): Promise<void> {
  if (!amount || isNaN(amount) || amount <= 0) return;
  const mainRef = doc(db, 'platformRevenue', 'main');
  await runTransaction(db, async (transaction) => {
    transaction.update(mainRef, {
      totalWithdrawn: increment(amount),
      unifiedAvailable: increment(-amount),
      lastUpdated: serverTimestamp()
    });
  });
}

/**
 * Frontend helper: fetch personal_ajo by user_id and return latest doc only where user_id == input.
 */
export async function fetchPersonalAjoByUserId(userId: string): Promise<any | null> {
  if (!userId) return null;
  try {
    const q = query(collection(db, 'personal_ajo'), where('user_id', '==', userId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
      return docs[0];
    }
    // Check direct doc(db, 'personal_ajo', userId)
    const directSnap = await getDoc(doc(db, 'personal_ajo', userId));
    if (directSnap.exists()) {
      return { id: directSnap.id, ...directSnap.data() };
    }
    return null;
  } catch (err) {
    console.warn('[fetchPersonalAjoByUserId] error:', err);
    return null;
  }
}

/**
 * Self-healing cleanup: ensures ADUGBO JAO has strictly 5 canonical members and removes fake/duplicate records
 */
export async function runFinalAdugboPacksCleanup(): Promise<void> {
  try {
    const groupsSnap = await getDocs(collection(db, 'groups')).catch(() => null);
    if (!groupsSnap) return;

    const adugboDoc = groupsSnap.docs.find(d => {
      const n = String(d.data().name || d.data().group_name || '').toUpperCase();
      return n.includes('ADUGBO') || n.includes('ADUBO');
    });

    if (!adugboDoc) return;
    const adugboGroupId = adugboDoc.id;

    const finalFiveFixedPacks = [
      {
        id: 'glry_jaye',
        name: 'GLRY JAYE',
        fullName: 'Glory Ajayi',
        full_name: 'GLRY JAYE',
        position: 1,
        packingOrder: 1,
        packing_position: 1,
        packsLabel: 'Packs 1st',
        phone: '08077777771',
        virtualAccountNumber: '8152476851',
        virtual_account_number: '8152476851',
        virtualAccountName: 'BETTERAJO-GLRY JAYE',
        virtual_account_name: 'BETTERAJO-GLRY JAYE',
        status: 'PAID',
        current_round_status: 'packed',
        credit_balance: 0,
        hasPackedThisRound: true,
        isFullyPaid: true
      },
      {
        id: 'festus_chris',
        name: 'Festus Chris',
        fullName: 'Festus Chris',
        full_name: 'Festus Chris',
        altNames: ['FESTUA'],
        position: 2,
        packingOrder: 2,
        packing_position: 2,
        packsLabel: 'Packs 2nd',
        phone: '07069702560',
        virtualAccountNumber: '8152195643',
        virtual_account_number: '8152195643',
        virtualAccountName: 'BETTERAJO-FESTUS CHRIS',
        virtual_account_name: 'BETTERAJO-FESTUS CHRIS',
        status: 'PENDING',
        current_round_status: 'pending_contribution',
        credit_balance: 0,
        hasPackedThisRound: false,
        isFullyPaid: false
      },
      {
        id: 'sholakule',
        name: 'Sholakule',
        fullName: 'Sholakule',
        full_name: 'Sholakule',
        altNames: ['SHOLA KUNLE'],
        position: 3,
        packingOrder: 3,
        packing_position: 3,
        packsLabel: 'Packs 3rd',
        phone: '07069702563',
        virtualAccountNumber: '8152741791',
        virtual_account_number: '8152741791',
        virtualAccountName: 'BETTERAJO-SHOLA KUNLE',
        virtual_account_name: 'BETTERAJO-SHOLA KUNLE',
        status: 'PENDING',
        current_round_status: 'pending_contribution',
        credit_balance: 0,
        hasPackedThisRound: false,
        isFullyPaid: false,
        keepFromScreenshot: true
      },
      {
        id: 'david_felistans',
        name: 'David Felistans',
        fullName: 'David Felistans',
        full_name: 'David Felistans',
        altNames: ['DAVID FELISTANCE', 'David Felictans'],
        position: 4,
        packingOrder: 4,
        packing_position: 4,
        packsLabel: 'Packs 4th',
        phone: '07069702564',
        virtualAccountNumber: '8152168957',
        virtual_account_number: '8152168957',
        virtualAccountName: 'BETTERAJO-DAVID FELISTANCE',
        virtual_account_name: 'BETTERAJO-DAVID FELISTANCE',
        status: 'PENDING',
        current_round_status: 'pending_contribution',
        credit_balance: 0,
        hasPackedThisRound: false,
        isFullyPaid: false,
        keepFromScreenshot: true
      },
      {
        id: 'kola_ogo',
        name: 'Kola Ogo',
        fullName: 'Kola Ogo',
        full_name: 'Kola Ogo',
        altNames: ['KOLA OGO'],
        position: 5,
        packingOrder: 5,
        packing_position: 5,
        packsLabel: 'Packs 5th',
        phone: '07069702561',
        virtualAccountNumber: '8152739353',
        virtual_account_number: '8152739353',
        virtualAccountName: 'BETTERAJO-KOLA OGO',
        virtual_account_name: 'BETTERAJO-KOLA OGO',
        status: 'PENDING',
        current_round_status: 'pending_contribution',
        credit_balance: 0,
        hasPackedThisRound: false,
        isFullyPaid: false
      }
    ];

    // Ensure group doc is set to 5 members
    await updateDoc(doc(db, 'groups', adugboGroupId), {
      name: 'ADUGBO JAO',
      group_name: 'ADUGBO JAO',
      members: finalFiveFixedPacks,
      memberCount: 5,
      member_limit: 5,
      packingIntervalDays: adugboDoc.data().packingIntervalDays || 3,
      packingInterval: adugboDoc.data().packingInterval || '3 days',
      contributionFrequencyDays: adugboDoc.data().contributionFrequencyDays || 3,
      contributionFrequency: adugboDoc.data().contributionFrequency || '3 days'
    }).catch(() => {});

    // Ensure subcollection has only these 5
    const subSnap = await getDocs(collection(db, 'groups', adugboGroupId, 'members')).catch(() => null);
    if (subSnap) {
      for (const d of subSnap.docs) {
        if (!finalFiveFixedPacks.some(m => m.id === d.id)) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }
      for (const m of finalFiveFixedPacks) {
        await setDoc(doc(db, 'groups', adugboGroupId, 'members', m.id), {
          ...m,
          groupId: adugboGroupId,
          group_id: adugboGroupId
        }, { merge: true }).catch(() => {});
      }
    }

    // Ensure root group_members has only these 5
    const gmSnap = await getDocs(query(collection(db, 'group_members'), where('group_id', '==', adugboGroupId))).catch(() => null);
    if (gmSnap) {
      for (const d of gmSnap.docs) {
        if (!finalFiveFixedPacks.some(m => m.id === d.data().id || m.id === d.id)) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }
    }

    // Ensure KARILE AJO name is clean
    const karileDoc = groupsSnap.docs.find(d => {
      const n = String(d.data().name || d.data().group_name || '').toUpperCase();
      return n.includes('KARILE');
    });
    if (karileDoc && (karileDoc.data().name !== 'KARILE AJO' || karileDoc.data().group_name !== 'KARILE AJO')) {
      await updateDoc(karileDoc.ref, {
        name: 'KARILE AJO',
        group_name: 'KARILE AJO'
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[runFinalAdugboPacksCleanup] warn:', err);
  }
}

// Trigger in background on module load
if (typeof window !== 'undefined') {
  runFinalAdugboPacksCleanup().catch(() => {});
}

