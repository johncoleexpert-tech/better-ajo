/**
 * Better Ajo - Financial Streams Permanent Migration & Safeguard
 * Re-aligns stream1 (Registration), stream2 (Contribution), stream3 (Packing),
 * and stream4 (Personal Withdrawal) according to pure double-entry calculations.
 */

import { getFirestoreDb, FIRESTORE_COLLECTIONS } from './firebase.js';
import { db, calculatePackingSplit, STREAM_REGISTRATION, STREAM_CONTRIBUTION, STREAM_PACKING } from './db.js';

export async function runFinancialStreamsMigration(): Promise<{
  success: boolean;
  stream1: number;
  stream2: number;
  stream3: number;
  totalGross: number;
  unifiedAvailable: number;
  corrected: boolean;
}> {
  try {
    const fsDb = getFirestoreDb();
    if (!fsDb) {
      console.log('[Financial Migration] In-memory mode active; Firestore not configured.');
      return { success: true, stream1: 0, stream2: 0, stream3: 0, totalGross: 0, unifiedAvailable: 0, corrected: false };
    }

    console.log('[Financial Migration] Starting financial streams audit and auto-repair...');

    // 0. MIGRATION SCRIPT: Move any packing_commission wrongly stored in payments/registration collection to commissions
    try {
      const wrongPaymentsSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.PAYMENTS)
        .where('type', '==', STREAM_PACKING)
        .get();
      for (const doc of wrongPaymentsSnap.docs) {
        const data = doc.data();
        console.log(`[Financial Migration] Moving misplaced packing_commission from payments to commissions collection (${doc.id})...`);
        await fsDb.collection(FIRESTORE_COLLECTIONS.COMMISSIONS).doc(doc.id).set({
          ...data,
          stream: STREAM_PACKING,
          type: STREAM_PACKING,
          recipient_role: 'GROUP_ADMIN'
        }, { merge: true });
        await doc.ref.delete();
      }

      // Also clean in-memory payments if any contain packing_commission
      if (db.data.payments) {
        const wrongLocalIdxs: number[] = [];
        db.data.payments.forEach((p, idx) => {
          if ((p as any).type === STREAM_PACKING || (p as any).purpose === STREAM_PACKING) {
            wrongLocalIdxs.push(idx);
          }
        });
        for (let i = wrongLocalIdxs.length - 1; i >= 0; i--) {
          db.data.payments.splice(wrongLocalIdxs[i], 1);
        }
      }
    } catch (migErr) {
      console.warn('[Financial Migration Warn] Error moving misplaced commissions:', migErr);
    }

    // 1. Calculate pure Stream 1: Personal Ajo Registration Fees (₦600 per unique saver)
    let stream1_actual = 0;
    try {
      const regSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.PAYMENTS)
        .where('amount', '==', 600)
        .get();
      const seenRegRefs = new Set<string>();
      regSnap.forEach(d => {
        const data = d.data();
        const ref = data.reference || d.id;
        if (!seenRegRefs.has(ref) && (data.status === 'success' || data.status === 'completed')) {
          seenRegRefs.add(ref);
          stream1_actual += 600;
        }
      });
    } catch {}

    // Fallback to in-memory registration count if Firestore query yielded 0
    if (stream1_actual === 0 && db.data.personal_ajo) {
      const activePersonal = db.data.personal_ajo.filter(p => p.status === 'active');
      stream1_actual = activePersonal.length * 600;
    }

    // 2. Calculate pure Stream 2: Group Contribution Fees (₦60 per contribution)
    let stream2_actual = 0;
    try {
      const contribSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS)
        .where('status', '==', 'Paid')
        .get();
      stream2_actual = contribSnap.size * 60;
    } catch {}

    if (stream2_actual === 0 && db.data.contributions) {
      const paidContribs = db.data.contributions.filter(c => c.status === 'Paid');
      stream2_actual = paidContribs.length * 60;
    }

    // 3. Calculate pure Stream 3: Group Packing Commissions (33.33% of packing fee)
    let stream3_actual = 0;
    try {
      const comSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.COMMISSIONS).get();
      comSnap.forEach(d => {
        const data = d.data();
        const fee = Number(data.packing_fee || data.withdrawalFee || 3000);
        const split = calculatePackingSplit(fee);
        stream3_actual += Number(data.super_admin_amount || split.superAdmin);
      });
    } catch {}

    if (stream3_actual === 0 && db.data.commissions) {
      for (const c of db.data.commissions) {
        const fee = Number(c.packing_fee || (c as any).withdrawalFee || 3000);
        stream3_actual += Number(c.super_admin_amount || calculatePackingSplit(fee).superAdmin);
      }
    }

    // 4. Calculate total super admin withdrawals
    let totalWithdrawn_actual = 0;
    try {
      const wthSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS)
        .where('withdrawal_type', '==', 'super_admin_revenue')
        .get();
      wthSnap.forEach(d => {
        const data = d.data();
        if (data.status === 'completed' || data.status === 'successful') {
          totalWithdrawn_actual += Number(data.amount || 0);
        }
      });
    } catch {}

    const totalGross_actual = stream1_actual + stream2_actual + stream3_actual;
    const unifiedAvailable_actual = Math.max(0, totalGross_actual - totalWithdrawn_actual);

    // 5. Update platformRevenue/main in Firestore with correct segregated streams
    const mainRef = fsDb.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc('main');
    const mainSnap = await mainRef.get();
    let corrected = false;

    if (mainSnap.exists) {
      const current = mainSnap.data() as any;
      if (
        current.stream1 !== stream1_actual ||
        current.stream2 !== stream2_actual ||
        current.stream3 !== stream3_actual ||
        current.totalGross !== totalGross_actual
      ) {
        await mainRef.set({
          stream1: stream1_actual,
          stream2: stream2_actual,
          stream3: stream3_actual,
          totalGross: totalGross_actual,
          totalWithdrawn: totalWithdrawn_actual,
          unifiedAvailable: unifiedAvailable_actual,
          lastUpdated: new Date().toISOString(),
          migration_applied: true
        }, { merge: true });
        corrected = true;
        console.log(`[Financial Migration] Successfully corrected platformRevenue/main! Stream1: ₦${stream1_actual}, Stream2: ₦${stream2_actual}, Stream3: ₦${stream3_actual}, Total: ₦${totalGross_actual}`);
      }
    } else {
      await mainRef.set({
        stream1: stream1_actual,
        stream2: stream2_actual,
        stream3: stream3_actual,
        totalGross: totalGross_actual,
        totalWithdrawn: totalWithdrawn_actual,
        unifiedAvailable: unifiedAvailable_actual,
        lastUpdated: new Date().toISOString(),
        migration_applied: true
      });
      corrected = true;
    }

    return {
      success: true,
      stream1: stream1_actual,
      stream2: stream2_actual,
      stream3: stream3_actual,
      totalGross: totalGross_actual,
      unifiedAvailable: unifiedAvailable_actual,
      corrected
    };
  } catch (err: any) {
    console.error('[Financial Migration Error]:', err?.message || err);
    return { success: false, stream1: 0, stream2: 0, stream3: 0, totalGross: 0, unifiedAvailable: 0, corrected: false };
  }
}
