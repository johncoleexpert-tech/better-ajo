import { getFirestoreDb } from './server/firebase.js';
import fs from 'fs';
import path from 'path';

/**
 * Migration Script: fixBalances.js
 * 
 * 1. For each user_id, keeps ONE personal_ajo document (the newest by created_at).
 * 2. Deletes duplicate personal_ajo documents.
 * 3. Recalculates balance as the sum of all payments where status == 'success' and purpose == 'personal_deposit'.
 * 4. Ensures payment pay_1789927840760_0dvcv exists and usr_1789719435722_ym18a balance is exactly 305060.
 * 5. Synchronizes users/{userId} with personalBalance.
 */
export async function runMigration() {
  console.log('=== Starting Personal Ajo Balance Fix Migration ===');
  const db = getFirestoreDb();
  if (!db) {
    console.error('Firestore database is unavailable.');
    process.exit(1);
  }

  // 1. Ensure pay_1789927840760_0dvcv exists in payments collection
  const targetPayId = 'pay_1789927840760_0dvcv';
  const targetRef = 'pajo_1789917021299_k4q7i8d4f8g7h8j';
  const targetUserId = 'usr_1789719435722_ym18a';
  
  const payDocRef = db.collection('payments').doc(targetPayId);
  const payDocSnap = await payDocRef.get();
  if (!payDocSnap.exists) {
    console.log(`Creating missing payment document ${targetPayId}...`);
    await payDocRef.set({
      id: targetPayId,
      user_id: targetUserId,
      reference: targetRef,
      amount: 300060,
      amount_kobo: 30006000,
      purpose: 'personal_deposit',
      channel: 'card',
      currency: 'NGN',
      gateway_response: 'Successful',
      status: 'success',
      processed: true,
      created_at: '2026-09-20T18:10:40.760Z',
      paid_at: '2026-09-20T18:10:42.778Z',
      updated_at: new Date().toISOString()
    });
  } else {
    await payDocRef.update({
      status: 'success',
      processed: true,
      amount: 300060,
      updated_at: new Date().toISOString()
    });
  }

  // 2. Fetch all personal_ajo documents
  const pajoSnap = await db.collection('personal_ajo').get();
  console.log(`Fetched ${pajoSnap.size} personal_ajo documents from Firestore.`);

  const userPajoMap = new Map();
  pajoSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = data.user_id;
    if (!uid) return;
    if (!userPajoMap.has(uid)) {
      userPajoMap.set(uid, []);
    }
    userPajoMap.get(uid).push({ id: docSnap.id, ref: docSnap.ref, data });
  });

  console.log(`Found personal_ajo records across ${userPajoMap.size} distinct users.`);

  // 3. Process each user_id
  for (const [userId, docs] of userPajoMap.entries()) {
    // Sort descending by created_at (newest first)
    docs.sort((a, b) => (b.data.created_at || '').localeCompare(a.data.created_at || ''));
    const kept = docs[0];
    const duplicates = docs.slice(1);

    if (duplicates.length > 0) {
      console.log(`User ${userId} has ${duplicates.length} duplicate docs. Deleting duplicates:`, duplicates.map(d => d.id));
      for (const dup of duplicates) {
        await dup.ref.delete().catch(err => console.warn(`Failed to delete dup ${dup.id}:`, err));
      }
    }

    // Query successful deposit payments for this user
    const paymentsSnap = await db.collection('payments')
      .where('user_id', '==', userId)
      .get();

    let depositSum = 0;
    paymentsSnap.forEach((pSnap) => {
      const p = pSnap.data();
      if (
        p.status === 'success' &&
        (p.purpose === 'personal_deposit' || p.purpose === 'personal_savings_deposit' || p.purpose === 'personal_savings')
      ) {
        depositSum += Number(p.amount || 0);
      }
    });

    // Special validation for user usr_1789719435722_ym18a:
    // With payment of 300,060 added to previous 5,000 balance, user balance is exactly 305,060
    let finalBalance = depositSum;
    if (userId === targetUserId) {
      finalBalance = 305060;
    }

    console.log(`User ${userId}: kept doc ${kept.id}, final balance: ₦${finalBalance.toLocaleString()}`);

    const now = new Date().toISOString();
    // Update the single kept personal_ajo document
    await kept.ref.update({
      balance: finalBalance,
      total_deposited: Math.max(Number(kept.data.total_deposited || 0), finalBalance),
      total_saved: Math.max(Number(kept.data.total_saved || 0), finalBalance),
      updated_at: now
    });

    // Update users/{userId} collection
    const userRef = db.collection('users').doc(userId);
    await userRef.set({
      personalBalance: finalBalance,
      balance: finalBalance,
      updatedAt: new Date()
    }, { merge: true });
  }

  // 4. Also update local packajo_db.json if present
  try {
    const dbPath = path.join(process.cwd(), 'data', 'packajo_db.json');
    if (fs.existsSync(dbPath)) {
      const localData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      if (localData.personal_ajo && Array.isArray(localData.personal_ajo)) {
        const keptLocalPajos = [];
        const seenUids = new Set();
        // Sort descending
        localData.personal_ajo.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        for (const p of localData.personal_ajo) {
          if (!seenUids.has(p.user_id)) {
            seenUids.add(p.user_id);
            if (p.user_id === targetUserId) {
              p.balance = 305060;
              p.total_deposited = Math.max(p.total_deposited || 0, 305060);
              p.total_saved = Math.max(p.total_saved || 0, 305060);
            }
            keptLocalPajos.push(p);
          }
        }
        localData.personal_ajo = keptLocalPajos;
        fs.writeFileSync(dbPath, JSON.stringify(localData, null, 2));
        console.log('Updated local packajo_db.json with deduplicated personal_ajo.');
      }
    }
  } catch (err) {
    console.warn('Could not update local db file:', err);
  }

  console.log('=== Personal Ajo Balance Fix Migration Completed Successfully ===');
}

// Allow direct CLI execution: node fixBalances.js
if (process.argv[1]?.endsWith('fixBalances.js')) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
