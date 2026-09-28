import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  getDoc,
  setDoc,
  updateDoc,
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
    const combined = Object.values({ ...paymentsMap, ...txMap });
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

