/**
 * Better Ajo - Clean Wipe of Test Data
 * Wipes: groups, group_members, pack_transactions, contributions, commissions, withdrawals.
 * Keeps: users and profiles collections.
 * Resets: platformRevenue/main and superAdminEarnings/main to 0.
 * Resets: in-memory / db.json to 0.
 */

import { getFirestoreDb, FIRESTORE_COLLECTIONS } from './firebase.js';
import { db } from './db.js';

function isSuperAdminUser(data: any): boolean {
  if (!data) return false;
  const role = (data.role || '').toUpperCase();
  const email = (data.email || '').trim().toLowerCase();
  const phone = (data.phone || '').trim();
  return (
    role === 'SUPER_ADMIN' ||
    email === 'superadmin@fundscycle.com' ||
    email === 'realheavenict@gmail.com' ||
    email === 'superadmin@packajo.ng' ||
    email === 'paulakinyele54@gmail.com' ||
    phone === '08154267469'
  );
}

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
    transactions: 0,
    payments: 0,
    users: 0,
    profiles: 0
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
      FIRESTORE_COLLECTIONS.PAYMENTS,
      'group_admin_earnings',
      'admin_earnings',
      'group_admin_fees',
      'groupAdminEarnings',
      'super_admin_revenue',
      'packing_payouts'
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

    // Delete users except super admin
    try {
      const userSnaps = await fsDb.collection(FIRESTORE_COLLECTIONS.USERS).get();
      const uBatch = fsDb.batch();
      let delUsers = 0;
      userSnaps.docs.forEach(doc => {
        const data = doc.data();
        if (isSuperAdminUser(data)) {
          uBatch.set(doc.ref, {
            personalBalance: 0,
            balance: 0,
            total_saved: 0,
            total_deposited: 0,
            total_withdrawn: 0,
            updatedAt: new Date()
          }, { merge: true });
        } else {
          uBatch.delete(doc.ref);
          delUsers++;
        }
      });
      deletedCounts.users = delUsers;
      if (userSnaps.size > 0) {
        await uBatch.commit();
        console.log(`[WIPE TEST DATA] Deleted ${delUsers} non-admin users, preserved super admin.`);
      }
    } catch (err: any) {
      console.warn('[WIPE TEST DATA Warn] Error deleting users:', err?.message || err);
    }

    // Delete profiles except super admin
    try {
      const profSnaps = await fsDb.collection(FIRESTORE_COLLECTIONS.PROFILES).get();
      const pBatch = fsDb.batch();
      let delProfs = 0;
      profSnaps.docs.forEach(doc => {
        const data = doc.data();
        if (!isSuperAdminUser(data)) {
          pBatch.delete(doc.ref);
          delProfs++;
        }
      });
      deletedCounts.profiles = delProfs;
      if (profSnaps.size > 0) {
        await pBatch.commit();
        console.log(`[WIPE TEST DATA] Deleted ${delProfs} non-admin profiles, preserved super admin.`);
      }
    } catch (err: any) {
      console.warn('[WIPE TEST DATA Warn] Error deleting profiles:', err?.message || err);
    }

    // Clear personal_ajo and personalAjos docs
    try {
      for (const coll of [FIRESTORE_COLLECTIONS.PERSONAL_AJO, FIRESTORE_COLLECTIONS.PERSONAL_AJOS]) {
        const pSnaps = await fsDb.collection(coll).get();
        const pBatch = fsDb.batch();
        pSnaps.docs.forEach(doc => {
          pBatch.delete(doc.ref);
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

  // Clear in-memory db data (KEEP super admin profile and user!)
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
  db.data.personal_ajo = [];
  (db.data as any).transactions = [];
  db.data.groupAdminRevenue = 0;
  db.data.superAdminRevenue = 0;

  // Filter profiles and users to keep ONLY super admin
  if (Array.isArray(db.data.profiles)) {
    db.data.profiles = db.data.profiles.filter(p => isSuperAdminUser(p));
  }
  if (Array.isArray((db.data as any).users)) {
    (db.data as any).users = (db.data as any).users.filter((u: any) => isSuperAdminUser(u));
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
