/**
 * Cloud Function: aggregatePersonalAjoSavings
 * 
 * Triggered on any write to personal_ajo/{docId}.
 * Sums all personal_ajo.balance across the personal_ajo collection
 * and writes the aggregate to platformStats/main.
 * 
 * This ensures the Super Admin dashboard reads ONLY the aggregate totalPersonalSavings
 * from platformStats/main and never reads individual personal_ajo documents.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const onPersonalAjoWrite = functions.firestore
  .document('personal_ajo/{docId}')
  .onWrite(async (_change, _context) => {
    const db = admin.firestore();
    try {
      const snap = await db.collection('personal_ajo').get();
      let totalSavings = 0;
      let totalSavers = 0;

      snap.forEach((doc) => {
        const d = doc.data();
        const bal = Number(d.balance || 0);
        if (bal > 0) {
          totalSavings += bal;
        }
        totalSavers++;
      });

      await db.collection('platformStats').doc('main').set({
        totalPersonalSavings: totalSavings,
        totalPersonalSavers: totalSavers,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`[Cloud Function] Aggregated personal_ajo: ${totalSavings} for ${totalSavers} savers.`);
    } catch (err) {
      console.error('[Cloud Function] Error aggregating personal_ajo:', err);
    }
  });
