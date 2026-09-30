/**
 * Better Ajo - Clean Wipe of Test Data
 * Wipes: groups, group_members, pack_transactions, contributions, commissions, withdrawals.
 * Keeps: users and profiles collections.
 * Resets: platformRevenue/main and superAdminEarnings/main to 0.
 * Resets: in-memory / db.json to 0.
 */

import { getFirestoreDb, FIRESTORE_COLLECTIONS } from './firebase.js';
import { db } from './db.js';

export async function wipeTestData(): Promise<{
  success: boolean;
  deletedCounts: Record<string, number>;
  message: string;
}> {
  console.log('[WIPE TEST DATA] Starting test data wipe...');
  const deletedCounts: Record<string, number> = {
    groups: 0,
    group_members: 0,
    pack_transactions: 0,
    contributions: 0,
    commissions: 0,
    withdrawals: 0,
    transactions: 0
  };

  const fsDb = getFirestoreDb();
  if (fsDb) {
    const collectionsToWipe = [
      FIRESTORE_COLLECTIONS.GROUPS,
      FIRESTORE_COLLECTIONS.GROUP_MEMBERS,
      FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS,
      FIRESTORE_COLLECTIONS.CONTRIBUTIONS,
      FIRESTORE_COLLECTIONS.COMMISSIONS,
      FIRESTORE_COLLECTIONS.WITHDRAWALS,
      FIRESTORE_COLLECTIONS.TRANSACTIONS,
      FIRESTORE_COLLECTIONS.PAYMENTS
    ];

    for (const collName of collectionsToWipe) {
      try {
        const snap = await fsDb.collection(collName).get();
        deletedCounts[collName] = snap.size;
        const batch = fsDb.batch();
        snap.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        if (snap.size > 0) {
          await batch.commit();
          console.log(`[WIPE TEST DATA] Deleted ${snap.size} documents from Firestore collection: ${collName}`);
        }
      } catch (err: any) {
        console.warn(`[WIPE TEST DATA Warn] Error clearing collection ${collName}:`, err?.message || err);
      }
    }

    // Reset all users in users collection to balance 0
    try {
      const userSnaps = await fsDb.collection(FIRESTORE_COLLECTIONS.USERS).get();
      const uBatch = fsDb.batch();
      userSnaps.docs.forEach(doc => {
        uBatch.set(doc.ref, {
          personalBalance: 0,
          balance: 0,
          total_saved: 0,
          total_deposited: 0,
          total_withdrawn: 0,
          updatedAt: new Date()
        }, { merge: true });
      });
      if (userSnaps.size > 0) {
        await uBatch.commit();
        console.log(`[WIPE TEST DATA] Reset balances for ${userSnaps.size} users in users collection to 0`);
      }
    } catch (err: any) {
      console.warn('[WIPE TEST DATA Warn] Error resetting users balance:', err?.message || err);
    }

    // Reset personal_ajo and personalAjos docs
    try {
      for (const coll of [FIRESTORE_COLLECTIONS.PERSONAL_AJO, FIRESTORE_COLLECTIONS.PERSONAL_AJOS]) {
        const pSnaps = await fsDb.collection(coll).get();
        const pBatch = fsDb.batch();
        pSnaps.docs.forEach(doc => {
          pBatch.set(doc.ref, {
            balance: 0,
            total_saved: 0,
            total_deposited: 0,
            total_withdrawn: 0,
            credit_balance: 0,
            updated_at: new Date().toISOString()
          }, { merge: true });
        });
        if (pSnaps.size > 0) {
          await pBatch.commit();
        }
      }
    } catch (err: any) {}

    // Reset platformRevenue/main to 0
    try {
      await fsDb.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc('main').set({
        stream1: 0,
        stream2: 0,
        stream3: 0,
        stream4: 0,
        totalGross: 0,
        totalWithdrawn: 0,
        unifiedAvailable: 0,
        lastUpdated: new Date().toISOString(),
        wiped_at: new Date().toISOString()
      });
      console.log('[WIPE TEST DATA] platformRevenue/main reset to 0');
    } catch (err: any) {
      console.warn('[WIPE TEST DATA Warn] Error resetting platformRevenue/main:', err?.message || err);
    }

    // Reset superAdminEarnings/main to 0
    try {
      await fsDb.collection(FIRESTORE_COLLECTIONS.SUPER_ADMIN_EARNINGS).doc('main').set({
        totalEarnings: 0,
        availableBalance: 0,
        available_balance: 0,
        lastUpdated: new Date().toISOString(),
        wiped_at: new Date().toISOString()
      });
      console.log('[WIPE TEST DATA] superAdminEarnings/main reset to 0');
    } catch (err: any) {
      console.warn('[WIPE TEST DATA Warn] Error resetting superAdminEarnings/main:', err?.message || err);
    }
  }

  // Clear in-memory db data (KEEP profiles and users!)
  db.data.groups = [];
  db.data.group_members = [];
  db.data.contributions = [];
  db.data.pack_transactions = [];
  db.data.commissions = [];
  db.data.withdrawals = [];
  db.data.payments = [];
  db.data.personal_transactions = [];
  db.data.admin_revenue_ledger = [];
  db.data.super_admin_transactions = [];

  // Reset in-memory personal ajo savings balances to 0 and pending_fee
  if (Array.isArray(db.data.personal_ajo)) {
    for (const pa of db.data.personal_ajo) {
      pa.balance = 0;
      pa.total_deposited = 0;
      pa.total_withdrawn = 0;
      pa.credit_balance = 0;
      pa.status = 'pending_fee';
      (pa as any).personal_ajo_active = false;
      (pa as any).fee_paid = 0;
    }
  }

  // Reset profiles personal_ajo_active
  if (Array.isArray(db.data.profiles)) {
    for (const p of db.data.profiles) {
      (p as any).personal_ajo_active = false;
      (p as any).personal_ajo_fee_paid = 0;
    }
  }

  // Reset super admin wallet to 0
  db.data.super_admin_wallet = {
    available_balance: 0,
    total_gross_earnings: 0,
    total_withdrawn: 0,
    stream1_registration: 0,
    stream2_contribution: 0,
    stream3_packing: 0,
    stream4_withdrawal: 0,
    breakdown: {
      reg_600_total: 0,
      contrib_60_total: 0,
      packing_33_total: 0,
      withdrawal_1_6_total: 0
    },
    updated_at: new Date().toISOString(),
    last_updated: new Date().toISOString()
  };

  db.save();
  console.log('[WIPE TEST DATA] Local in-memory and db.json test data successfully wiped. Super admin balance is 0. Users preserved.');

  return {
    success: true,
    deletedCounts,
    message: 'Test data wiped successfully. Super admin balance is 0. Groups wiped. Users preserved.'
  };
}
