import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

/**
 * Universal environment variable cleaner.
 */
function cleanEnvValue(val) {
  if (!val) return null;
  let str = val.trim();
  while (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'")) ||
    (str.startsWith('`') && str.endsWith('`'))
  ) {
    str = str.slice(1, -1).trim();
  }
  return str || null;
}

/**
 * Robust private key parser.
 */
function parsePrivateKey(rawKey) {
  if (!rawKey) return null;
  let key = rawKey.trim();
  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith('`') && key.endsWith('`'))
  ) {
    key = key.slice(1, -1).trim();
  }

  // Decodes base64 if key is base64 encoded
  if (
    !key.includes('-----BEGIN') &&
    (key.startsWith('LS0t') || key.startsWith('ZXhw') || /^[A-Za-z0-9+/=\s]+$/.test(key))
  ) {
    try {
      const decoded = Buffer.from(key.replace(/\s+/g, ''), 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN PRIVATE KEY-----')) {
        key = decoded;
      }
    } catch {}
  }

  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  if (key.includes('BEGIN PRIVATE KEY')) {
    const beginMarker = '-----BEGIN PRIVATE KEY-----';
    const endMarker = '-----END PRIVATE KEY-----';
    const beginIdx = key.indexOf(beginMarker);
    const endIdx = key.indexOf(endMarker);
    if (beginIdx !== -1 && endIdx !== -1) {
      const body = key.slice(beginIdx + beginMarker.length, endIdx).replace(/\s+/g, '');
      const formattedBody = body.match(/.{1,64}/g)?.join('\n') || body;
      return `${beginMarker}\n${formattedBody}\n${endMarker}\n`;
    }
  }

  return key;
}

/**
 * Initialize Firestore DB safely.
 */
function initDb() {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return getFirestore(existingApps[0]);
  }

  const projectId = cleanEnvValue(process.env.FIREBASE_PROJECT_ID) || 'better-ajo-b629a';
  const clientEmail = cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL);
  const rawKey = cleanEnvValue(process.env.FIREBASE_PRIVATE_KEY);
  const privateKey = parsePrivateKey(rawKey);

  if (clientEmail && privateKey) {
    const app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      }),
      projectId
    });
    return getFirestore(app);
  }

  const app = initializeApp({ projectId });
  return getFirestore(app);
}

/**
 * Helper to delete all documents in a collection in batches of 400.
 */
async function deleteCollection(db, collectionName) {
  const colRef = db.collection(collectionName);
  let totalDeleted = 0;

  while (true) {
    const snapshot = await colRef.limit(400).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    totalDeleted += snapshot.size;
  }

  return totalDeleted;
}

/**
 * Main Database Wipe and Super Admin Provisioning Script.
 */
export async function wipeDatabase() {
  console.log('========================================================');
  console.log('BETTER AJO - TOTAL DATABASE WIPE & FRESH START SCRIPT');
  console.log('========================================================');

  const db = initDb();
  if (!db) {
    console.error('Failed to initialize Firestore database.');
    process.exit(1);
  }

  // 1. List of all collections to wipe
  const collectionsToWipe = [
    'users',
    'profiles',
    'personal_ajo',
    'personalAjos',
    'groups',
    'group_members',
    'contributions',
    'pack_transactions',
    'commissions',
    'withdrawals',
    'payments',
    'transactions',
    'platformRevenue',
    'platformStats',
    'superAdminEarnings',
    'admin_revenue_ledger',
    'wallets',
    'audit_logs',
    'otps',
    '_system_checks',
    'group_notifications',
    'support_messages',
    'super_admin_earnings',
    'group_admin_earnings',
    'admin_earnings',
    'group_admin_fees',
    'groupAdminEarnings',
    'super_admin_revenue',
    'packing_payouts'
  ];

  // Also query any dynamic collections that exist in Firestore
  try {
    const existingCols = await db.listCollections();
    for (const col of existingCols) {
      if (!collectionsToWipe.includes(col.id)) {
        collectionsToWipe.push(col.id);
      }
    }
  } catch (err) {
    console.warn('Could not list dynamic collections, using standard list:', err?.message || err);
  }

  console.log(`\nWiping ${collectionsToWipe.length} collections in Firebase Firestore...`);

  for (const colName of collectionsToWipe) {
    try {
      const deletedCount = await deleteCollection(db, colName);
      console.log(`✓ Deleted collection [${colName}]: ${deletedCount} documents deleted.`);
    } catch (err) {
      console.error(`✗ Error deleting collection [${colName}]:`, err?.message || err);
    }
  }

  // 2. Initialize Platform Revenue to ZERO
  console.log('\nInitializing platformRevenue/main to 0...');
  const mainRevenueRef = db.collection('platformRevenue').doc('main');
  await mainRevenueRef.set({
    stream1: 0,
    stream2: 0,
    stream3: 0,
    stream4: 0,
    totalGross: 0,
    totalWithdrawn: 0,
    unifiedAvailable: 0,
    lastUpdated: new Date()
  });
  console.log('✓ platformRevenue/main set to 0 balance.');

  // 3. Initialize Platform Stats to ZERO
  console.log('Initializing platformStats/main to 0...');
  const mainStatsRef = db.collection('platformStats').doc('main');
  await mainStatsRef.set({
    totalPersonalSavings: 0,
    totalPersonalDeposits: 0,
    totalPersonalWithdrawn: 0,
    totalPersonalSavers: 0,
    totalPersonalFees: 0,
    lastUpdated: new Date().toISOString()
  });
  console.log('✓ platformStats/main set to 0.');

  // 4. Initialize Super Admin Earnings to ZERO
  console.log('Initializing superAdminEarnings/main to 0...');
  const saEarningsRef = db.collection('superAdminEarnings').doc('main');
  await saEarningsRef.set({
    totalEarnings: 0,
    totalWithdrawn: 0,
    availableBalance: 0,
    lastUpdated: new Date().toISOString()
  });
  console.log('✓ superAdminEarnings/main set to 0.');

  // 5. Recreate the ONLY Super Admin User
  const superAdminProfile = {
    id: 'usr_superadmin_realheaven',
    uid: 'usr_superadmin_realheaven',
    full_name: 'Super Administrator',
    phone: '08154267469',
    email: 'realheavenict@gmail.com',
    password: 'BetterAjo@RealHeaven2026!',
    role: 'SUPER_ADMIN',
    status: 'active',
    is_verified: true,
    bank_name: 'Guaranty Trust Bank (GTB)',
    account_number: '0123456789',
    verification_type: 'NIN',
    verification_number: '12345678901',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('\nRecreating single Super Admin user...');
  await db.collection('users').doc('usr_superadmin_realheaven').set(superAdminProfile);
  await db.collection('profiles').doc('usr_superadmin_realheaven').set(superAdminProfile);
  console.log('✓ Super Admin user recreated successfully:');
  console.log('  Email: realheavenict@gmail.com');
  console.log('  Password: BetterAjo@RealHeaven2026!');
  console.log('  Role: SUPER_ADMIN');

  // 6. Reset local file data/packajo_db.json if it exists
  const localDbPath = path.resolve(process.cwd(), 'data/packajo_db.json');
  const freshDb = {
    profiles: [superAdminProfile],
    personal_ajo: [],
    groups: [],
    group_members: [],
    contributions: [],
    pack_transactions: [],
    commissions: [],
    withdrawals: [],
    payments: [],
    otps: [],
    audit_logs: [],
    support_messages: [],
    group_notifications: [],
    superAdminRevenue: 0,
    groupAdminRevenue: 0,
    superAdminEarnings: {
      totalEarnings: 0,
      total_withdrawn: 0,
      available_balance: 0,
      totalWithdrawn: 0
    },
    super_admin_wallet: {
      total_gross_earnings: 0,
      total_withdrawn: 0,
      available_balance: 0,
      breakdown: {
        reg_600_total: 0,
        contrib_60_total: 0,
        packing_33_total: 0,
        withdrawal_1_6_total: 0
      },
      updated_at: new Date().toISOString()
    },
    admin_revenue_ledger: [],
    personal_transactions: [],
    super_admin_transactions: []
  };

  try {
    fs.mkdirSync(path.dirname(localDbPath), { recursive: true });
    fs.writeFileSync(localDbPath, JSON.stringify(freshDb, null, 2), 'utf8');
    console.log(`✓ Local database mirror [data/packajo_db.json] reset to pristine state with zero balances.`);
  } catch (localErr) {
    console.warn('Could not reset local packajo_db.json:', localErr?.message || localErr);
  }

  console.log('\n========================================================');
  console.log('TOTAL DATABASE WIPE COMPLETE: ALL SYSTEMS AT ZERO');
  console.log('========================================================');
  console.log('Platform Fees Wallet: ₦0');
  console.log('Total Savers: 0');
  console.log('Total Groups: 0');
  console.log('Total Transactions: 0');
  console.log('Super Admin Login: realheavenict@gmail.com / BetterAjo@RealHeaven2026!');
  console.log('Ready for clean testing with 100% accurate financial tallies.\n');
}

// Auto-run if executed directly via node or tsx
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('wipeDatabase.js')
) {
  wipeDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal wipe error:', err);
      process.exit(1);
    });
}
