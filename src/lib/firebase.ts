import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  enableIndexedDbPersistence,
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
 * Real-time listener for platformRevenue collection directly from Firestore.
 * Calculates Stream 1, Stream 2, Stream 3, Stream 4, and Unified Available Revenue.
 */
export function subscribeToPlatformRevenue(
  onRevenueUpdate: (stats: {
    stream1_registration: number;
    stream2_contribution: number;
    stream3_packing: number;
    stream4_withdrawal: number;
    totalGross: number;
    totalWithdrawn: number;
    availableBalance: number;
    docsCount: number;
  }) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const revCol = collection(db, 'platformRevenue');

  return onSnapshot(
    revCol,
    (snap) => {
      let reg600 = 0;
      let contrib60 = 0;
      let packing33 = 0;
      let wth1_6 = 0;
      let withdrawnTotal = 0;

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const amt = Number(d.amount || 0);
        const stream = d.stream || '';
        const type = d.type || '';

        if (stream === 'STREAM_1_REGISTRATION' || type === 'registration_600' || type === 'personal_registration_fee') {
          reg600 += Math.max(0, amt);
        } else if (
          stream === 'STREAM_2_CONTRIBUTION' ||
          type === 'contribution_60' ||
          type === 'personal_savings_fee' ||
          type === 'group_contribution_fee'
        ) {
          contrib60 += Math.max(0, amt);
        } else if (stream === 'STREAM_3_PACKING' || type === 'packing_33' || type === 'group_packing_fee') {
          packing33 += Math.max(0, amt);
        } else if (stream === 'STREAM_4_WITHDRAWAL' || type === 'withdrawal_1_6' || type === 'personal_withdrawal_fee') {
          wth1_6 += Math.max(0, amt);
        } else if (stream === 'WITHDRAWAL_DEDUCTION' || type === 'super_admin_withdrawal') {
          withdrawnTotal += Math.abs(amt);
        }
      });

      const totalGross = reg600 + contrib60 + packing33 + wth1_6;
      const availableBalance = Math.max(0, totalGross - withdrawnTotal);

      onRevenueUpdate({
        stream1_registration: reg600,
        stream2_contribution: contrib60,
        stream3_packing: packing33,
        stream4_withdrawal: wth1_6,
        totalGross,
        totalWithdrawn: withdrawnTotal,
        availableBalance,
        docsCount: snap.size
      });
    },
    (err) => {
      console.warn('[Firestore Listener] platformRevenue snapshot error:', err);
      if (onError) onError(err);
    }
  );
}
