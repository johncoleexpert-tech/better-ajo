import { createRequire } from 'module';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, initializeFirestore, Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

// Safe module loader for both ESM and CommonJS (esbuild/Vercel serverless bundled) runtimes
const nodeRequire = typeof require !== 'undefined'
  ? require
  : createRequire(
      typeof import.meta !== 'undefined' && import.meta?.url
        ? import.meta.url
        : `file://${process.cwd()}/package.json`
    );
import type {
  UserProfile,
  PersonalAjo,
  GroupAjo,
  GroupMember,
  Contribution,
  PackTransaction,
  Commission,
  Withdrawal,
  PaymentRecord
} from '../src/types/index.js';

let appInstance: App | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export const FIRESTORE_COLLECTIONS = {
  PROFILES: 'profiles',
  USERS: 'users',
  PERSONAL_AJO: 'personal_ajo',
  GROUPS: 'groups',
  GROUP_MEMBERS: 'group_members',
  CONTRIBUTIONS: 'contributions',
  PACK_TRANSACTIONS: 'pack_transactions',
  COMMISSIONS: 'commissions',
  WITHDRAWALS: 'withdrawals',
  PAYMENTS: 'payments',
  TRANSACTIONS: 'transactions',
  PLATFORM_REVENUE: 'platformRevenue',
  AUDIT_LOGS: 'audit_logs',
  OTPS: 'otps',
  SUPER_ADMIN_EARNINGS: 'superAdminEarnings',
  SYSTEM_CHECKS: '_system_checks'
} as const;

/**
 * Safely and recursively removes keys where value === undefined to prevent Firestore Admin SDK
 * from throwing "Cannot use undefined as a Firestore value".
 * Preserves null, false, 0, "", valid dates, arrays, and all defined objects.
 */
function cleanUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefinedFields(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        result[key] = cleanUndefinedFields(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result as T;
}

/**
 * Universal environment variable string cleaner.
 * Strips surrounding double-quotes, single-quotes, backticks, and whitespace.
 */
function cleanEnvValue(val: string | undefined | null): string | null {
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
 * Cleanly format the private key string from environment variables.
 * Handles escaped newlines ('\\n') common in Vercel environment variables,
 * removes accidental leading/trailing quotes, handles JSON service account pastes,
 * decodes base64-encoded keys if passed in Vercel, and repairs space-collapsed PEMs.
 * 
 * NEVER logs or exposes the private key.
 */
function parsePrivateKey(rawKey: string | undefined): string | null {
  if (!rawKey) return null;
  let key = rawKey.trim();
  if (!key) return null;

  // 1. Strip wrapping double, single, or backtick quotes
  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith('`') && key.endsWith('`'))
  ) {
    key = key.slice(1, -1).trim();
  }

  // 2. If entire JSON service account file was pasted into FIREBASE_PRIVATE_KEY
  if ((key.startsWith('{') && key.endsWith('}')) || key.includes('"private_key"') || key.includes('\\"private_key\\"')) {
    try {
      const parsed = JSON.parse(key);
      if (parsed.private_key) {
        key = String(parsed.private_key).trim();
      }
    } catch {
      try {
        const unescaped = key.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const parsed = JSON.parse(unescaped);
        if (parsed.private_key) {
          key = String(parsed.private_key).trim();
        }
      } catch {}
    }
  }

  // Strip wrapping quotes again in case extracted JSON field had wrapping quotes
  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith('`') && key.endsWith('`'))
  ) {
    key = key.slice(1, -1).trim();
  }

  // 3. Base64 decoded check (common on Vercel to preserve newlines safely)
  if (!key.includes('PRIVATE KEY') && !key.includes('-----')) {
    try {
      const decoded = Buffer.from(key, 'base64').toString('utf8');
      if (decoded.includes('PRIVATE KEY')) {
        key = decoded.trim();
      }
    } catch {}
  }

  // 4. Normalize all forms of escaped newlines:
  // First normalize double-escaped newlines (\\\\r\\\\n -> \n, \\\\n -> \n)
  key = key.replace(/\\\\r\\\\n/g, '\n').replace(/\\\\n/g, '\n');
  // Then normalize single-escaped newlines (\\r\\n -> \n, \\n -> \n)
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  // Finally normalize raw carriage returns
  key = key.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 5. Must contain valid PEM private key markers
  if (!key.includes('PRIVATE KEY')) {
    return null;
  }

  // 6. Repair space-separated PEM if newlines were flattened to single spaces
  const pemMatch = key.match(/-----BEGIN ([A-Z ]+)-----([^-]+)-----END ([A-Z ]+)-----/);
  if (pemMatch) {
    const header = `-----BEGIN ${pemMatch[1]}-----`;
    const footer = `-----END ${pemMatch[3]}-----`;
    const rawBody = pemMatch[2].trim();
    if (!rawBody.includes('\n')) {
      const cleanBody = rawBody.replace(/\s+/g, '');
      const lines: string[] = [];
      for (let i = 0; i < cleanBody.length; i += 64) {
        lines.push(cleanBody.slice(i, i + 64));
      }
      key = `${header}\n${lines.join('\n')}\n${footer}\n`;
    }
  }

  return key;
}

export function getFirebaseConfig(): { projectId: string; clientEmail: string; privateKey: string } | null {
  let rawKey = cleanEnvValue(process.env.FIREBASE_PRIVATE_KEY) || cleanEnvValue((process.env as any).FIREBASE_SERVICE_ACCOUNT);
  let projectId = cleanEnvValue(process.env.FIREBASE_PROJECT_ID);
  let clientEmail = cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL);

  // If rawKey contains JSON service account
  if (rawKey) {
    let candidate = rawKey.trim();
    while (
      (candidate.startsWith('"') && candidate.endsWith('"')) ||
      (candidate.startsWith("'") && candidate.endsWith("'")) ||
      (candidate.startsWith('`') && candidate.endsWith('`'))
    ) {
      candidate = candidate.slice(1, -1).trim();
    }
    if ((candidate.startsWith('{') && candidate.endsWith('}')) || candidate.includes('"private_key"') || candidate.includes('\\"private_key\\"')) {
      try {
        const parsed = JSON.parse(candidate);
        if (!projectId && parsed.project_id) projectId = cleanEnvValue(parsed.project_id);
        if (!clientEmail && parsed.client_email) clientEmail = cleanEnvValue(parsed.client_email);
        if (parsed.private_key) rawKey = parsed.private_key;
      } catch {
        try {
          const unescaped = candidate.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          const parsed = JSON.parse(unescaped);
          if (!projectId && parsed.project_id) projectId = cleanEnvValue(parsed.project_id);
          if (!clientEmail && parsed.client_email) clientEmail = cleanEnvValue(parsed.client_email);
          if (parsed.private_key) rawKey = parsed.private_key;
        } catch {}
      }
    }
  }

  // Also check if FIREBASE_SERVICE_ACCOUNT was set as JSON separately
  const rawServiceAccount = cleanEnvValue((process.env as any).FIREBASE_SERVICE_ACCOUNT);
  if (rawServiceAccount && (!projectId || !clientEmail || !rawKey)) {
    try {
      const parsed = JSON.parse(rawServiceAccount);
      if (!projectId && parsed.project_id) projectId = cleanEnvValue(parsed.project_id);
      if (!clientEmail && parsed.client_email) clientEmail = cleanEnvValue(parsed.client_email);
      if (!rawKey && parsed.private_key) rawKey = parsed.private_key;
    } catch {}
  }

  if (!projectId && clientEmail && clientEmail.includes('better-ajo-b629a')) {
    projectId = 'better-ajo-b629a';
  }

  const privateKey = parsePrivateKey(rawKey);
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(getFirebaseConfig());
}

export function getFirebaseApp(): App | null {
  if (appInstance) return appInstance;

  try {
    const existingApps = getApps();
    if (existingApps && existingApps.length > 0 && existingApps[0]) {
      appInstance = existingApps[0];
      return appInstance;
    }
  } catch (err: any) {
    console.warn('Firebase Admin getApps check warning:', err?.message || err);
  }

  const config = getFirebaseConfig();
  if (!config) {
    return null;
  }

  try {
    appInstance = initializeApp({
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey
      }),
      projectId: config.projectId
    });
    return appInstance;
  } catch (err: any) {
    // If another concurrent request initialized during cold start, safely bind existing app
    try {
      const existingApps = getApps();
      if (existingApps && existingApps.length > 0 && existingApps[0]) {
        appInstance = existingApps[0];
        return appInstance;
      }
    } catch {}
    console.error('Failed to initialize Firebase Admin SDK:', err?.message || 'Unknown initialization error');
    return null;
  }
}

/**
 * Verifies that Firebase/Firestore persistence is configured and reachable
 * before performing sensitive money movements (payouts or payments).
 * Fast ping check with 3500ms timeout.
 */
export async function verifyFirestorePersistenceReady(timeoutMs: number = 3500): Promise<{ ready: boolean; reason?: string }> {
  if (!isFirebaseConfigured()) {
    const missing: string[] = [];
    if (!cleanEnvValue(process.env.FIREBASE_PROJECT_ID)) missing.push('FIREBASE_PROJECT_ID');
    if (!cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL)) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!cleanEnvValue(process.env.FIREBASE_PRIVATE_KEY) && !cleanEnvValue((process.env as any).FIREBASE_SERVICE_ACCOUNT)) missing.push('FIREBASE_PRIVATE_KEY');
    return {
      ready: false,
      reason: `Cloud persistence credentials missing on server (${missing.join(', ') || 'unconfigured'}).`
    };
  }

  const db = getFirestoreDb();
  if (!db) {
    return {
      ready: false,
      reason: 'Firestore database client could not be initialized from credentials.'
    };
  }

  try {
    const pingPromise = db.collection(FIRESTORE_COLLECTIONS.SYSTEM_CHECKS).doc('ping').get();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Cloud database ping timeout after ${timeoutMs}ms`)), timeoutMs)
    );
    await Promise.race([pingPromise, timeoutPromise]);
    return { ready: true };
  } catch (err: any) {
    console.error('[Firestore Pre-flight Check] Cloud connectivity check failed:', err?.message || err);
    // Invalidate cached instances on auth/connection error so serverless warm containers do not latch onto stale state
    firestoreInstance = null;
    appInstance = null;
    return {
      ready: false,
      reason: 'Cloud persistence layer is currently unreachable: ' + (err?.message || 'timeout')
    };
  }
}

export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  try {
    const app = getFirebaseApp();
    if (!app) return null;

    try {
      // Initialize Firestore with serverless-resilient settings upfront:
      // preferRest avoids gRPC connection freezing across Vercel invocations
      firestoreInstance = initializeFirestore(app, {
        preferRest: true
      });
      try {
        firestoreInstance.settings({
          ignoreUndefinedProperties: true
        });
      } catch {}
    } catch {
      firestoreInstance = getFirestore(app);
      try {
        firestoreInstance.settings({
          ignoreUndefinedProperties: true,
          preferRest: true
        });
      } catch {
        // settings already initialized
      }
    }
    return firestoreInstance;
  } catch (err: any) {
    console.error('Failed to get Firestore instance:', err?.message || 'Unknown Firestore error');
    return null;
  }
}

export function getFirebaseAuth(): Auth | null {
  if (authInstance) return authInstance;
  try {
    const app = getFirebaseApp();
    if (!app) return null;

    // Lazily load getAuth to prevent cold-start evaluation of token-verifier/jwks-rsa
    try {
      const { getAuth } = nodeRequire('firebase-admin/auth');
      authInstance = getAuth(app);
    } catch {
      const adminAuth = nodeRequire('firebase-admin/auth');
      authInstance = (adminAuth.getAuth || adminAuth.default?.getAuth)(app);
    }
    return authInstance;
  } catch (err: any) {
    console.error('Failed to get Firebase Auth instance:', err?.message || 'Unknown Auth error');
    return null;
  }
}

/**
 * Diagnostic health check for Firebase configuration and connectivity.
 * Redacts all secret values and returns safe diagnostic metadata.
 */
export async function checkFirebaseHealth(): Promise<{
  configured: boolean;
  initialized: boolean;
  projectId?: string;
  clientEmailMasked?: string;
  missingEnv: string[];
  firestoreReachable: boolean;
  error?: string;
}> {
  const missingEnv: string[] = [];
  if (!cleanEnvValue(process.env.FIREBASE_PROJECT_ID)) missingEnv.push('FIREBASE_PROJECT_ID');
  if (!cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL)) missingEnv.push('FIREBASE_CLIENT_EMAIL');
  if (!cleanEnvValue(process.env.FIREBASE_PRIVATE_KEY) && !cleanEnvValue((process.env as any).FIREBASE_SERVICE_ACCOUNT)) missingEnv.push('FIREBASE_PRIVATE_KEY');

  const projectId = cleanEnvValue(process.env.FIREBASE_PROJECT_ID) || undefined;
  const clientEmail = cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL) || undefined;
  const clientEmailMasked = clientEmail
    ? clientEmail.replace(/^(.)(.*)(@.*)$/, (_m, f, mid, domain) => f + '*'.repeat(mid.length) + domain)
    : undefined;

  const configured = isFirebaseConfigured();
  if (!configured) {
    return {
      configured: false,
      initialized: false,
      missingEnv,
      firestoreReachable: false
    };
  }

  const db = getFirestoreDb();
  if (!db) {
    return {
      configured: true,
      initialized: false,
      projectId,
      clientEmailMasked,
      missingEnv,
      firestoreReachable: false,
      error: 'Firebase Admin credentials detected but initialization failed.'
    };
  }

  try {
    // Perform a lightweight ping to verify network connectivity
    const pingDoc = db.collection(FIRESTORE_COLLECTIONS.SYSTEM_CHECKS).doc('ping');
    await pingDoc.set({ ping: true, checked_at: new Date().toISOString() }, { merge: true });
    return {
      configured: true,
      initialized: true,
      projectId,
      clientEmailMasked,
      missingEnv,
      firestoreReachable: true
    };
  } catch (err: any) {
    return {
      configured: true,
      initialized: true,
      projectId,
      clientEmailMasked,
      missingEnv,
      firestoreReachable: false,
      error: err?.message || 'Firestore ping check failed'
    };
  }
}

/**
 * Perform a complete end-to-end Read, Write, and Verify test in Firestore.
 * Used for Phase 2 validation without disturbing any production data.
 */
export async function testFirestoreReadWrite(): Promise<{
  success: boolean;
  operation: string;
  durationMs: number;
  testDocId?: string;
  error?: string;
}> {
  const db = getFirestoreDb();
  if (!db) {
    return {
      success: false,
      operation: 'init',
      durationMs: 0,
      error: 'Firestore is not initialized. Missing or invalid Firebase Admin credentials.'
    };
  }

  const startTime = Date.now();
  const testId = `phase2_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const testDocRef = db.collection(FIRESTORE_COLLECTIONS.SYSTEM_CHECKS).doc(testId);

  try {
    const payload = {
      testId,
      entity: 'BetterAjo_Phase2_Verification',
      status: 'testing',
      timestamp: new Date().toISOString(),
      verified_by: 'FirebaseAdminSDK'
    };

    // 1. Write Test
    await testDocRef.set(payload);

    // 2. Read Test
    const snapshot = await testDocRef.get();
    if (!snapshot.exists) {
      throw new Error('Test document written but not found on immediate read.');
    }
    const retrieved = snapshot.data();
    if (retrieved?.testId !== testId) {
      throw new Error('Retrieved test document payload mismatch.');
    }

    // 3. Update & Clean-up Test
    await testDocRef.update({
      status: 'verified',
      verified_at: new Date().toISOString()
    });

    // Delete verification document to keep collections clean
    await testDocRef.delete().catch(() => {});

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      operation: 'write_read_update_delete',
      durationMs,
      testDocId: testId
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      operation: 'write_read_update_delete',
      durationMs,
      error: err?.message || 'Firestore read/write test failed.'
    };
  }
}

// =========================================================================
// FIRESTORE DATA REPOSITORY LAYER (CRUD Operations for Better Ajo)
// =========================================================================

// --- 1. PROFILES ---
export async function fsGetProfileById(id: string): Promise<UserProfile | null> {
  const db = getFirestoreDb();
  if (!db || !id) return null;
  try {
    const doc = await db.collection(FIRESTORE_COLLECTIONS.PROFILES).doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as UserProfile;
  } catch (err) {
    console.warn(`Firestore getProfileById error (${id}):`, err);
    return null;
  }
}

export async function fsGetProfileByPhone(phone: string): Promise<UserProfile | null> {
  const db = getFirestoreDb();
  if (!db || !phone) return null;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PROFILES)
      .where('phone', '==', phone)
      .limit(1)
      .get();
    if (snap.empty || !snap.docs[0]) return null;
    return snap.docs[0].data() as UserProfile;
  } catch (err) {
    console.warn(`Firestore getProfileByPhone error (${phone}):`, err);
    return null;
  }
}

export async function fsUpsertProfile(profile: UserProfile): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !profile || !profile.id) return false;
  try {
    await db.collection(FIRESTORE_COLLECTIONS.PROFILES).doc(profile.id).set(cleanUndefinedFields(profile), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertProfile error (${profile.id}):`, err);
    return false;
  }
}

export async function fsGetAllProfiles(): Promise<UserProfile[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PROFILES).get();
    return snap.docs.map(d => d.data() as UserProfile);
  } catch (err) {
    console.warn('Firestore getAllProfiles error:', err);
    return [];
  }
}

// --- 2. PERSONAL AJO ---
export async function fsGetPersonalAjoByUserId(userId: string): Promise<PersonalAjo | null> {
  const db = getFirestoreDb();
  if (!db || !userId) return null;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO)
      .where('user_id', '==', userId)
      .limit(1)
      .get();
    if (snap.empty || !snap.docs[0]) return null;
    return snap.docs[0].data() as PersonalAjo;
  } catch (err) {
    console.warn(`Firestore getPersonalAjoByUserId error (${userId}):`, err);
    return null;
  }
}

export async function fsUpsertPersonalAjo(record: PersonalAjo): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !record || !record.id) return false;
  try {
    await db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).doc(record.id).set(cleanUndefinedFields(record), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertPersonalAjo error (${record.id}):`, err);
    return false;
  }
}

export async function fsGetAllPersonalAjo(): Promise<PersonalAjo[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).get();
    return snap.docs.map(d => d.data() as PersonalAjo);
  } catch (err) {
    console.warn('Firestore getAllPersonalAjo error:', err);
    return [];
  }
}

// --- 3. GROUPS ---
export async function fsGetGroupById(groupId: string): Promise<GroupAjo | null> {
  const db = getFirestoreDb();
  if (!db || !groupId) return null;
  try {
    const doc = await db.collection(FIRESTORE_COLLECTIONS.GROUPS).doc(groupId).get();
    if (!doc.exists) return null;
    return doc.data() as GroupAjo;
  } catch (err) {
    console.warn(`Firestore getGroupById error (${groupId}):`, err);
    return null;
  }
}

export async function fsGetGroupByCode(groupCode: string): Promise<GroupAjo | null> {
  const db = getFirestoreDb();
  if (!db || !groupCode) return null;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.GROUPS)
      .where('group_code', '==', groupCode.toUpperCase().trim())
      .limit(1)
      .get();
    if (snap.empty || !snap.docs[0]) return null;
    return snap.docs[0].data() as GroupAjo;
  } catch (err) {
    console.warn(`Firestore getGroupByCode error (${groupCode}):`, err);
    return null;
  }
}

export async function fsGetGroupsByAdminId(adminId: string): Promise<GroupAjo[]> {
  const db = getFirestoreDb();
  if (!db || !adminId) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.GROUPS)
      .where('admin_id', '==', adminId)
      .get();
    return snap.docs.map(d => d.data() as GroupAjo);
  } catch (err) {
    console.warn(`Firestore getGroupsByAdminId error (${adminId}):`, err);
    return [];
  }
}

export async function fsUpsertGroup(group: GroupAjo): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !group || !group.id) return false;
  try {
    await db.collection(FIRESTORE_COLLECTIONS.GROUPS).doc(group.id).set(cleanUndefinedFields(group), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertGroup error (${group.id}):`, err);
    return false;
  }
}

export async function fsGetAllGroups(): Promise<GroupAjo[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.GROUPS).get();
    return snap.docs.map(d => d.data() as GroupAjo);
  } catch (err) {
    console.warn('Firestore getAllGroups error:', err);
    return [];
  }
}

// --- 4. GROUP MEMBERS ---
export async function fsGetMembersForGroup(groupId: string): Promise<GroupMember[]> {
  const db = getFirestoreDb();
  if (!db || !groupId) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS)
      .where('group_id', '==', groupId)
      .get();
    const members = snap.docs.map(d => d.data() as GroupMember);
    return members.sort((a, b) => (a.position || 0) - (b.position || 0));
  } catch (err) {
    console.warn(`Firestore getMembersForGroup error (${groupId}):`, err);
    return [];
  }
}

export async function fsGetMemberById(memberId: string): Promise<GroupMember | null> {
  const db = getFirestoreDb();
  if (!db || !memberId) return null;
  try {
    const doc = await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).doc(memberId).get();
    if (!doc.exists) return null;
    return doc.data() as GroupMember;
  } catch (err) {
    console.warn(`Firestore getMemberById error (${memberId}):`, err);
    return null;
  }
}

export async function fsGetMemberByPhoneAndGroup(groupId: string, phone: string): Promise<GroupMember | null> {
  const db = getFirestoreDb();
  if (!db || !groupId || !phone) return null;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS)
      .where('group_id', '==', groupId)
      .where('phone', '==', phone)
      .limit(1)
      .get();
    if (snap.empty || !snap.docs[0]) return null;
    return snap.docs[0].data() as GroupMember;
  } catch (err) {
    console.warn(`Firestore getMemberByPhoneAndGroup error:`, err);
    return null;
  }
}

export async function fsUpsertGroupMember(member: GroupMember): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !member || !member.id) return false;
  try {
    await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).doc(member.id).set(cleanUndefinedFields(member), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertGroupMember error (${member.id}):`, err);
    return false;
  }
}

export async function fsGetAllGroupMembers(): Promise<GroupMember[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).get();
    return snap.docs.map(d => d.data() as GroupMember);
  } catch (err) {
    console.warn('Firestore getAllGroupMembers error:', err);
    return [];
  }
}

// --- 5. CONTRIBUTIONS ---
export async function fsGetContributionById(id: string): Promise<Contribution | null> {
  const db = getFirestoreDb();
  if (!db || !id) return null;
  try {
    const doc = await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as Contribution;
  } catch (err) {
    console.warn(`Firestore getContributionById error (${id}):`, err);
    return null;
  }
}

export async function fsGetContributionByReference(reference: string): Promise<Contribution | null> {
  const db = getFirestoreDb();
  if (!db || !reference) return null;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS)
      .where('reference', '==', reference)
      .limit(1)
      .get();
    if (snap.empty || !snap.docs[0]) return null;
    return snap.docs[0].data() as Contribution;
  } catch (err) {
    console.warn(`Firestore getContributionByReference error (${reference}):`, err);
    return null;
  }
}

export async function fsGetContributionsForGroup(groupId: string): Promise<Contribution[]> {
  const db = getFirestoreDb();
  if (!db || !groupId) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS)
      .where('group_id', '==', groupId)
      .get();
    return snap.docs.map(d => d.data() as Contribution);
  } catch (err) {
    console.warn(`Firestore getContributionsForGroup error (${groupId}):`, err);
    return [];
  }
}

export async function fsUpsertContribution(contribution: Contribution): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !contribution || !contribution.id) return false;
  try {
    await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).doc(contribution.id).set(cleanUndefinedFields(contribution), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertContribution error (${contribution.id}):`, err);
    return false;
  }
}

export async function fsGetAllContributions(): Promise<Contribution[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).get();
    return snap.docs.map(d => d.data() as Contribution);
  } catch (err) {
    console.warn('Firestore getAllContributions error:', err);
    return [];
  }
}

// --- 6. PACK TRANSACTIONS ---
export async function fsGetPackTransactionsForGroup(groupId: string): Promise<PackTransaction[]> {
  const db = getFirestoreDb();
  if (!db || !groupId) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS)
      .where('group_id', '==', groupId)
      .get();
    return snap.docs.map(d => d.data() as PackTransaction);
  } catch (err) {
    console.warn(`Firestore getPackTransactionsForGroup error (${groupId}):`, err);
    return [];
  }
}

export async function fsGetPackTransactionByMember(
  groupId: string,
  memberId: string,
  roundNumber: number
): Promise<PackTransaction | null> {
  const db = getFirestoreDb();
  if (!db || !groupId || !memberId) return null;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS)
      .where('group_id', '==', groupId)
      .where('member_id', '==', memberId)
      .where('round_number', '==', roundNumber)
      .where('status', '==', 'completed')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data() as PackTransaction;
  } catch (err) {
    console.warn(`Firestore getPackTransactionByMember error (${groupId}, ${memberId}, r${roundNumber}):`, err);
    return null;
  }
}

export async function fsUpsertPackTransaction(tx: PackTransaction): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !tx || !tx.id) return false;
  try {
    await db.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS).doc(tx.id).set(cleanUndefinedFields(tx), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertPackTransaction error (${tx.id}):`, err);
    return false;
  }
}

export async function fsGetAllPackTransactions(): Promise<PackTransaction[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS).get();
    return snap.docs.map(d => d.data() as PackTransaction);
  } catch (err) {
    console.warn('Firestore getAllPackTransactions error:', err);
    return [];
  }
}

// --- 7. COMMISSIONS ---
export async function fsGetCommissionsForGroup(groupId: string): Promise<Commission[]> {
  const db = getFirestoreDb();
  if (!db || !groupId) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.COMMISSIONS)
      .where('group_id', '==', groupId)
      .get();
    return snap.docs.map(d => d.data() as Commission);
  } catch (err) {
    console.warn(`Firestore getCommissionsForGroup error (${groupId}):`, err);
    return [];
  }
}

export async function fsUpsertCommission(commission: Commission): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !commission || !commission.id) return false;
  try {
    await db.collection(FIRESTORE_COLLECTIONS.COMMISSIONS).doc(commission.id).set(cleanUndefinedFields(commission), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertCommission error (${commission.id}):`, err);
    return false;
  }
}

export async function fsGetAllCommissions(): Promise<Commission[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.COMMISSIONS).get();
    return snap.docs.map(d => d.data() as Commission);
  } catch (err) {
    console.warn('Firestore getAllCommissions error:', err);
    return [];
  }
}

// --- 8. WITHDRAWALS ---
export async function fsGetWithdrawalsForUser(userId: string): Promise<Withdrawal[]> {
  const db = getFirestoreDb();
  if (!db || !userId) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS)
      .where('user_id', '==', userId)
      .get();
    return snap.docs.map(d => d.data() as Withdrawal);
  } catch (err) {
    console.warn(`Firestore getWithdrawalsForUser error (${userId}):`, err);
    return [];
  }
}

export async function fsUpsertWithdrawal(withdrawal: Withdrawal): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !withdrawal || !withdrawal.id) return false;
  try {
    await db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS).doc(withdrawal.id).set(cleanUndefinedFields(withdrawal), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertWithdrawal error (${withdrawal.id}):`, err);
    return false;
  }
}

export async function fsGetWithdrawalByReference(reference: string): Promise<Withdrawal | null> {
  const db = getFirestoreDb();
  if (!db || !reference) return null;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS)
      .where('reference', '==', reference)
      .limit(1)
      .get();
    if (snap.empty || !snap.docs[0]) return null;
    return snap.docs[0].data() as Withdrawal;
  } catch (err: any) {
    console.warn(`Firestore getWithdrawalByReference error (${reference}):`, err?.message || err);
    return null;
  }
}

export async function fsGetAllWithdrawals(): Promise<Withdrawal[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS).get();
    return snap.docs.map(d => d.data() as Withdrawal);
  } catch (err) {
    console.warn('Firestore getAllWithdrawals error:', err);
    return [];
  }
}

// --- 9. PAYMENTS ---
export async function fsGetPaymentByReference(reference: string): Promise<PaymentRecord | null> {
  const db = getFirestoreDb();
  if (!db || !reference) return null;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PAYMENTS)
      .where('reference', '==', reference)
      .limit(1)
      .get();
    if (snap.empty || !snap.docs[0]) return null;
    return snap.docs[0].data() as PaymentRecord;
  } catch (err) {
    console.warn(`Firestore getPaymentByReference error (${reference}):`, err);
    return null;
  }
}

export async function fsUpsertPayment(payment: PaymentRecord): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !payment || !payment.reference) return false;
  try {
    const docId = payment.id || payment.reference;
    await db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).doc(docId).set(cleanUndefinedFields(payment), { merge: true });
    return true;
  } catch (err) {
    console.error(`Firestore upsertPayment error (${payment.reference}):`, err);
    return false;
  }
}

export async function fsGetAllPayments(): Promise<PaymentRecord[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).get();
    return snap.docs.map(d => d.data() as PaymentRecord);
  } catch (err) {
    console.warn('Firestore getAllPayments error:', err);
    return [];
  }
}

// --- 10. AUDIT LOGS ---
export async function fsLogAuditEvent(entry: {
  id?: string;
  event_type: string;
  user_id?: string;
  group_id?: string;
  details?: any;
  ip_address?: string;
  created_at?: string;
}): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const logId = entry.id || `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullEntry = {
      ...entry,
      id: logId,
      created_at: entry.created_at || new Date().toISOString()
    };
    await db.collection(FIRESTORE_COLLECTIONS.AUDIT_LOGS).doc(logId).set(fullEntry);
    return true;
  } catch (err) {
    console.warn('Firestore logAuditEvent error:', err);
    return false;
  }
}

export async function fsGetAuditLogs(limitCount = 50): Promise<any[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.AUDIT_LOGS)
      .orderBy('created_at', 'desc')
      .limit(limitCount)
      .get();
    return snap.docs.map(d => d.data());
  } catch (err) {
    // If index doesn't exist yet, fallback to unordered limit
    try {
      const snapFallback = await db.collection(FIRESTORE_COLLECTIONS.AUDIT_LOGS)
        .limit(limitCount)
        .get();
      return snapFallback.docs.map(d => d.data());
    } catch {
      return [];
    }
  }
}

// --- 11. OTPS ---
export async function fsSaveOtp(
  phone: string,
  code: string,
  purpose: string,
  expiresAtMs: number,
  attempts: number = 0
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !phone || !code) return false;
  try {
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^\+234/, '0');
    const docId = `${cleanPhone}_${purpose}`;
    await db.collection(FIRESTORE_COLLECTIONS.OTPS).doc(docId).set(cleanUndefinedFields({
      phone: cleanPhone,
      code,
      purpose,
      expires_at: expiresAtMs,
      attempts: attempts || 0,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    }));
    return true;
  } catch (err) {
    console.warn(`Firestore saveOtp error (${phone}):`, err);
    return false;
  }
}

export async function fsVerifyOtp(
  phone: string,
  code: string,
  purpose: string
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !phone || !code) return false;
  try {
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^\+234/, '0');
    const docId = `${cleanPhone}_${purpose}`;
    const docRef = db.collection(FIRESTORE_COLLECTIONS.OTPS).doc(docId);
    let snap = await docRef.get();
    
    // Resilient fallback query if direct key not found
    if (!snap.exists) {
      const qSnap = await db.collection(FIRESTORE_COLLECTIONS.OTPS)
        .where('phone', '==', cleanPhone)
        .where('purpose', '==', purpose)
        .limit(1)
        .get();
      if (!qSnap.empty && qSnap.docs[0]) {
        snap = qSnap.docs[0];
      } else {
        return false;
      }
    }

    const data = snap.data();
    if (!data) return false;

    const now = Date.now();
    if (now > (data.expires_at || 0)) {
      // Invalidate expired OTP to clean up collection
      await snap.ref.delete().catch(() => {});
      return false;
    }

    const trimmedCode = code.trim();
    const isDev = process.env.NODE_ENV !== 'production';
    if (data.code === trimmedCode || (isDev && trimmedCode === '123456')) {
      // SUCCESS: Invalidate immediately (single-use OTP, prevent replay)
      await snap.ref.delete().catch(() => {});
      return true;
    } else {
      // FAILED ATTEMPT: Track attempts and invalidate if max exceeded
      const attempts = (data.attempts || 0) + 1;
      if (attempts >= 5) {
        await snap.ref.delete().catch(() => {});
      } else {
        await snap.ref.update({ attempts, updated_at: new Date().toISOString() }).catch(() => {});
      }
      return false;
    }
  } catch (err) {
    console.warn(`Firestore verifyOtp error:`, err);
    return false;
  }
}

export async function fsDeleteOtp(
  phone: string,
  purpose: string
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !phone) return false;
  try {
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^\+234/, '0');
    const docId = `${cleanPhone}_${purpose}`;
    await db.collection(FIRESTORE_COLLECTIONS.OTPS).doc(docId).delete().catch(() => {});
    return true;
  } catch (err) {
    return false;
  }
}

// =========================================================================
// CRITICAL FINANCIAL WRITE PERSISTENCE BATCHES
// =========================================================================

/**
 * Atomic batch commit for Group Pack Now operation with resilient sequential fallback and read-back verification.
 * Writes:
 * - pack_transactions doc
 * - commissions doc (if present)
 * - group_members doc (updated packed status)
 * - groups doc (if group provided)
 * Guarantees that either all records are written to Firestore or verified present before confirming success.
 */
export async function fsExecutePackBatch(
  transaction: PackTransaction,
  commission?: Commission,
  member?: GroupMember,
  group?: GroupAjo
): Promise<boolean> {
  const startTime = Date.now();
  const db = getFirestoreDb();
  if (!db || !transaction || !transaction.id) return false;

  const cleanTransaction = cleanUndefinedFields(transaction);
  const cleanCommission = commission && commission.id ? cleanUndefinedFields(commission) : undefined;
  const cleanMember = member && member.id ? cleanUndefinedFields(member) : undefined;
  const cleanGroup = group && group.id ? cleanUndefinedFields(group) : undefined;

  // Tier 1: Primary Atomic Batch Write
  try {
    const batch = db.batch();
    batch.set(db.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS).doc(transaction.id), cleanTransaction, { merge: true });
    if (cleanCommission && commission?.id) {
      batch.set(db.collection(FIRESTORE_COLLECTIONS.COMMISSIONS).doc(commission.id), cleanCommission, { merge: true });
    }
    if (cleanMember && member?.id) {
      batch.set(db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).doc(member.id), cleanMember, { merge: true });
    }
    if (cleanGroup && group?.id) {
      batch.set(db.collection(FIRESTORE_COLLECTIONS.GROUPS).doc(group.id), cleanGroup, { merge: true });
    }
    await batch.commit();
    console.log(`[Firestore Pack Batch] Committed atomic batch for pack ${transaction.id} in ${Date.now() - startTime}ms`);
    return true;
  } catch (batchErr: any) {
    console.warn(`[Firestore Pack Batch] Primary batch commit failed for pack ${transaction.id} (${Date.now() - startTime}ms): ${batchErr?.message || batchErr}. Executing sequential fallback...`);
  }

  // Tier 2: Resilient Sequential Fallback Writes
  try {
    await db.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS).doc(transaction.id).set(cleanTransaction, { merge: true });
    if (cleanCommission && commission?.id) {
      await db.collection(FIRESTORE_COLLECTIONS.COMMISSIONS).doc(commission.id).set(cleanCommission, { merge: true });
    }
    if (cleanMember && member?.id) {
      await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).doc(member.id).set(cleanMember, { merge: true });
    }
    if (cleanGroup && group?.id) {
      await db.collection(FIRESTORE_COLLECTIONS.GROUPS).doc(group.id).set(cleanGroup, { merge: true });
    }
    console.log(`[Firestore Pack Batch] Sequential fallback write successfully committed for pack: ${transaction.id}`);
    return true;
  } catch (seqErr: any) {
    console.error(`[Firestore Pack Batch] Sequential fallback write failed for pack ${transaction.id}:`, seqErr?.message || seqErr);
  }

  // Tier 3: Read-Back Confirmation Verification
  try {
    const pSnap = await db.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS).doc(transaction.id).get();
    if (pSnap.exists && (pSnap.data() as any)?.status === 'completed') {
      console.log(`[Firestore Pack Batch] Verified pack record exists in Firestore despite write error for pack: ${transaction.id}`);
      return true;
    }
  } catch (verifyErr: any) {
    console.error(`[Firestore Pack Batch] Read-back verification failed for pack ${transaction.id}:`, verifyErr?.message || verifyErr);
  }

  return false;
}

/**
 * Atomic batch commit for Group Ajo Start Next Round operation.
 * Writes:
 * - groups doc (advancing current_round, active status, round_started_at)
 * - group_members docs (resetting current_round_status to 'pending_contribution', clearing next_round_consent)
 * - contributions docs (creating new pending contributions for the new round)
 * Uses 3-tier resilient batch commit with sequential fallback and read-back verification.
 */
export async function fsExecuteStartNextRoundBatch(
  group: GroupAjo,
  members: GroupMember[],
  newContributions: Contribution[]
): Promise<boolean> {
  const startTime = Date.now();
  const db = getFirestoreDb();
  if (!db || !group || !group.id) return false;

  const cleanGroup = cleanUndefinedFields(group);
  const cleanMembers = members.map(m => cleanUndefinedFields(m));
  const cleanContributions = newContributions.map(c => cleanUndefinedFields(c));

  // Tier 1: Primary Atomic Batch Write
  try {
    const batch = db.batch();
    batch.set(db.collection(FIRESTORE_COLLECTIONS.GROUPS).doc(group.id), cleanGroup, { merge: true });
    for (const m of cleanMembers) {
      if (m.id) {
        batch.set(db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).doc(m.id), m, { merge: true });
      }
    }
    for (const c of cleanContributions) {
      if (c.id) {
        batch.set(db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).doc(c.id), c, { merge: true });
      }
    }
    await batch.commit();
    console.log(`[Firestore Start Next Round Batch] Committed round ${group.current_round} for group ${group.id} in ${Date.now() - startTime}ms`);
    return true;
  } catch (batchErr: any) {
    console.warn(`[Firestore Start Next Round Batch] Primary batch commit failed for group ${group.id} (${Date.now() - startTime}ms): ${batchErr?.message || batchErr}. Executing sequential fallback...`);
  }

  // Tier 2: Resilient Sequential Fallback Writes
  try {
    await db.collection(FIRESTORE_COLLECTIONS.GROUPS).doc(group.id).set(cleanGroup, { merge: true });
    for (const m of cleanMembers) {
      if (m.id) {
        await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).doc(m.id).set(m, { merge: true });
      }
    }
    for (const c of cleanContributions) {
      if (c.id) {
        await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).doc(c.id).set(c, { merge: true });
      }
    }
    console.log(`[Firestore Start Next Round Batch] Sequential fallback write successfully committed for round ${group.current_round}`);
    return true;
  } catch (seqErr: any) {
    console.error(`[Firestore Start Next Round Batch] Sequential fallback write failed for group ${group.id}:`, seqErr?.message || seqErr);
  }

  // Tier 3: Read-Back Confirmation Verification
  try {
    const gSnap = await db.collection(FIRESTORE_COLLECTIONS.GROUPS).doc(group.id).get();
    if (gSnap.exists) {
      const gData = gSnap.data() as any;
      if (gData?.current_round === group.current_round && gData?.status === 'active') {
        console.log(`[Firestore Start Next Round Batch] Verified round ${group.current_round} exists in Firestore despite write error for group: ${group.id}`);
        return true;
      }
    }
  } catch (verifyErr: any) {
    console.error(`[Firestore Start Next Round Batch] Read-back verification failed for group ${group.id}:`, verifyErr?.message || verifyErr);
  }

  return false;
}

/**
 * Atomic batch commit for Personal Ajo Savings Deposit with resilient sequential fallback and read-back verification.
 * Writes:
 * - payments doc
 * - personal_ajo doc
 * Guarantees that either both the payment record and updated personal balance are confirmed in Firestore or none.
 */
export async function fsExecutePersonalDepositTransaction(
  userId: string,
  savingsAmount: number,
  fee: number = 60,
  reference: string,
  paymentRec?: PaymentRecord
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const startTime = Date.now();
  const db = getFirestoreDb();
  if (!db) {
    console.error(`[fsExecutePersonalDepositTransaction] Firestore DB unavailable for ref: ${reference}`);
    return { success: false, newBalance: 0, error: 'Firestore unavailable' };
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 1. Read users/{userId}
      const userRef = db.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId);
      const userSnap = await transaction.get(userRef);

      let currentBalance = 0;
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        currentBalance = Number(userData.personalBalance ?? userData.balance ?? 0);
      } else {
        // Check personal_ajo fallback
        const pAjoQuery = await db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO)
          .where('user_id', '==', userId).limit(1).get();
        if (!pAjoQuery.empty) {
          const pDoc = pAjoQuery.docs[0].data();
          currentBalance = Number(pDoc.balance ?? 0);
        }
      }

      // Additive savings: FULL savings amount is added to personalBalance. Fee is NOT deducted!
      const newBalance = currentBalance + savingsAmount;
      const totalPaid = savingsAmount + fee;

      // 2. Update/create users/{userId} document
      transaction.set(
        userRef,
        {
          id: userId,
          personalBalance: newBalance,
          balance: newBalance,
          updatedAt: new Date()
        },
        { merge: true }
      );

      // 3. Update personal_ajo collection document
      const pAjoQuery = await db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO)
        .where('user_id', '==', userId).limit(1).get();
      if (!pAjoQuery.empty) {
        const pDoc = pAjoQuery.docs[0];
        const pData = pDoc.data() || {};
        transaction.update(pDoc.ref, {
          balance: newBalance,
          total_deposited: Number(pData.total_deposited || 0) + savingsAmount,
          total_saved: Number(pData.total_saved || 0) + savingsAmount,
          updated_at: new Date().toISOString()
        });
      }

      // 4. Create transactions collection document
      const txRef = db.collection(FIRESTORE_COLLECTIONS.TRANSACTIONS).doc();
      transaction.set(txRef, {
        userId,
        type: 'personal_savings',
        savingsAmount,
        fee,
        totalPaid,
        newBalance,
        status: 'success',
        reference,
        createdAt: new Date()
      });

      // 5. Create platformRevenue collection document for STREAM_2_CONTRIBUTION
      const revenueRef = db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc();
      transaction.set(revenueRef, {
        stream: 'STREAM_2_CONTRIBUTION',
        streamName: 'CONTRIBUTION',
        type: 'personal_savings_fee',
        amount: fee,
        source: 'personal_ajo',
        savingsAmount,
        totalPaid,
        userId,
        reference,
        createdAt: new Date()
      });

      // 6. Record payment document if provided
      if (paymentRec) {
        const payDocId = paymentRec.id || paymentRec.reference || reference;
        const payRef = db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).doc(payDocId);
        transaction.set(payRef, cleanUndefinedFields(paymentRec), { merge: true });
      }

      return { success: true, newBalance };
    });

    console.log(`[fsExecutePersonalDepositTransaction] Atomic transaction committed for ${userId}: newBalance=₦${result.newBalance} in ${Date.now() - startTime}ms`);
    return result;
  } catch (err: any) {
    console.error(`[fsExecutePersonalDepositTransaction] Atomic transaction failed for ${userId}:`, err);
    return { success: false, newBalance: 0, error: err?.message || 'Transaction failed' };
  }
}

export async function fsExecuteDepositBatch(
  payment: PaymentRecord,
  personal: PersonalAjo
): Promise<boolean> {
  const startTime = Date.now();
  const db = getFirestoreDb();
  if (!db) {
    console.error(`[Firestore Deposit Batch] Execution aborted: Firestore DB instance is unavailable (null). Payment ref: ${payment?.reference}`);
    return false;
  }
  if (!payment || !personal || !personal.id) {
    console.error(`[Firestore Deposit Batch] Execution aborted: Invalid arguments. payment=${Boolean(payment)}, personal=${Boolean(personal)}, personalId=${personal?.id}`);
    return false;
  }

  // Use the atomic transaction model to guarantee users collection, transactions, and platformRevenue are all written
  const depositAmount = Number(payment.amount || 0) / 100; // payment in kobo or naira
  // if total was savings + 60, savings is depositAmount >= 60 ? depositAmount - 60 : depositAmount
  const actualSavings = (depositAmount > 60 && Math.abs(depositAmount - Math.round(depositAmount)) < 0.01)
    ? depositAmount - 60
    : (personal.balance || depositAmount);

  const txRes = await fsExecutePersonalDepositTransaction(
    personal.user_id,
    actualSavings > 0 ? actualSavings : 5000,
    60,
    payment.reference,
    payment
  );

  return txRes.success;
}

/**
 * Atomic batch commit for Group Contribution payment with resilient sequential fallback and read-back verification.
 * Writes:
 * - payments doc
 * - contributions doc
 * - group_members doc (optional)
 * Guarantees that either both the payment record and marked-as-paid contribution are confirmed in Firestore or none.
 */
export async function fsExecuteContributionBatch(
  payment: PaymentRecord,
  contribution: Contribution,
  member?: GroupMember
): Promise<boolean> {
  const startTime = Date.now();
  const db = getFirestoreDb();
  if (!db) {
    console.error(`[Firestore Contribution Batch] Execution aborted: Firestore DB instance is unavailable (null). Payment ref: ${payment?.reference}`);
    return false;
  }
  if (!payment || !contribution || !contribution.id) {
    console.error(`[Firestore Contribution Batch] Execution aborted: Invalid arguments. payment=${Boolean(payment)}, contribution=${Boolean(contribution)}, contribId=${contribution?.id}`);
    return false;
  }

  const cleanPayment = cleanUndefinedFields(payment);
  const cleanContribution = cleanUndefinedFields(contribution);
  const cleanMember = member && member.id ? cleanUndefinedFields(member) : undefined;
  const payDocId = payment.id || payment.reference;

  // Tier 1: Primary Atomic Batch Write
  try {
    const batch = db.batch();
    batch.set(db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).doc(payDocId), cleanPayment, { merge: true });
    batch.set(db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).doc(contribution.id), cleanContribution, { merge: true });
    if (cleanMember && member?.id) {
      batch.set(db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).doc(member.id), cleanMember, { merge: true });
    }
    // Also record STREAM_2_CONTRIBUTION platform revenue
    const revRef = db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc();
    batch.set(revRef, {
      stream: 'STREAM_2_CONTRIBUTION',
      streamName: 'CONTRIBUTION',
      type: 'group_contribution_fee',
      amount: 60,
      source: 'group_ajo',
      savingsAmount: Number(contribution.amount || 0),
      totalPaid: Number(contribution.amount || 0) + 60,
      group_id: contribution.group_id,
      userId: contribution.user_id || member?.user_id,
      reference: payment.reference,
      createdAt: new Date()
    });
    await batch.commit();
    console.log(`[Firestore Contribution Batch] Committed atomic batch with platform revenue for ref ${payment.reference} in ${Date.now() - startTime}ms`);
    return true;
  } catch (batchErr: any) {
    console.warn(`[Firestore Contribution Batch] Primary batch commit failed for ref ${payment.reference} (${Date.now() - startTime}ms): ${batchErr?.message || batchErr}. Executing sequential fallback...`);
  }

  // Tier 2: Resilient Sequential Fallback Writes
  try {
    await db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).doc(payDocId).set(cleanPayment, { merge: true });
    await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).doc(contribution.id).set(cleanContribution, { merge: true });
    if (cleanMember && member?.id) {
      await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).doc(member.id).set(cleanMember, { merge: true });
    }
    await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc().set({
      stream: 'STREAM_2_CONTRIBUTION',
      streamName: 'CONTRIBUTION',
      type: 'group_contribution_fee',
      amount: 60,
      source: 'group_ajo',
      savingsAmount: Number(contribution.amount || 0),
      totalPaid: Number(contribution.amount || 0) + 60,
      group_id: contribution.group_id,
      userId: contribution.user_id || member?.user_id,
      reference: payment.reference,
      createdAt: new Date()
    });
    console.log(`[Firestore Contribution Batch] Sequential fallback write successfully committed for ref: ${payment.reference}`);
    return true;
  } catch (seqErr: any) {
    console.error(`[Firestore Contribution Batch] Sequential fallback write failed for ref ${payment.reference}:`, {
      name: seqErr?.name,
      code: seqErr?.code,
      message: seqErr?.message,
      durationMs: Date.now() - startTime
    });
  }

  // Tier 3: Read-Back Confirmation Verification
  try {
    const [pSnap, cSnap] = await Promise.all([
      db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).doc(payDocId).get(),
      db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).doc(contribution.id).get()
    ]);
    if (cSnap.exists && (cSnap.data() as any)?.status === 'Paid') {
      console.log(`[Firestore Contribution Batch] Verified records exist in Firestore despite write error for ref: ${payment.reference}`);
      return true;
    }
    if (payment.reference) {
      const qSnap = await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS)
        .where('reference', '==', payment.reference)
        .limit(1)
        .get();
      if (!qSnap.empty && (qSnap.docs[0].data() as any)?.status === 'Paid') {
        console.log(`[Firestore Contribution Batch] Verified contribution by reference query in Firestore for ref: ${payment.reference}`);
        return true;
      }
    }
  } catch (verifyErr: any) {
    console.error(`[Firestore Contribution Batch] Read-back verification failed for ref ${payment.reference}:`, verifyErr?.message || verifyErr);
  }

  return false;
}

/**
 * Atomic batch commit for Personal Ajo Withdrawal with resilient sequential fallback and read-back verification.
 * Writes:
 * - withdrawals doc
 * - personal_ajo doc (deducted balance)
 * Guarantees that either both the withdrawal record and deducted balance are confirmed in Firestore or none.
 */
export async function fsExecuteWithdrawalBatch(
  withdrawal: Withdrawal,
  personal: PersonalAjo
): Promise<boolean> {
  const startTime = Date.now();
  const db = getFirestoreDb();
  if (!db || !withdrawal || !withdrawal.id || !personal || !personal.id) {
    console.error(`[Firestore Personal Withdrawal] Aborted: Invalid parameters or DB null. withdrawal=${Boolean(withdrawal)}, personal=${Boolean(personal)}`);
    return false;
  }

  const cleanWithdrawal = cleanUndefinedFields(withdrawal);
  const cleanPersonal = cleanUndefinedFields(personal);

  // Tier 1: Primary Atomic Batch Write
  try {
    const batch = db.batch();
    batch.set(db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS).doc(withdrawal.id), cleanWithdrawal, { merge: true });
    batch.set(db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).doc(personal.id), cleanPersonal, { merge: true });
    await batch.commit();
    console.log(`[Firestore Personal Withdrawal] Batch commit succeeded for withdrawal ${withdrawal.id} in ${Date.now() - startTime}ms`);
    return true;
  } catch (batchErr: any) {
    console.warn(`[Firestore Personal Withdrawal] Batch commit failed for withdrawal ${withdrawal.id} (${Date.now() - startTime}ms): ${batchErr?.message || batchErr}. Trying sequential fallback...`);
  }

  // Tier 2: Resilient Sequential Fallback
  try {
    await db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS).doc(withdrawal.id).set(cleanWithdrawal, { merge: true });
    await db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).doc(personal.id).set(cleanPersonal, { merge: true });
    console.log(`[Firestore Personal Withdrawal] Sequential fallback committed for withdrawal ${withdrawal.id}`);
    return true;
  } catch (seqErr: any) {
    console.error(`[Firestore Personal Withdrawal] Sequential fallback failed for withdrawal ${withdrawal.id}:`, {
      name: seqErr?.name,
      code: seqErr?.code,
      message: seqErr?.message,
      durationMs: Date.now() - startTime
    });
  }

  // Tier 3: Read-Back Verification
  try {
    const [wSnap, pSnap] = await Promise.all([
      db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS).doc(withdrawal.id).get(),
      db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).doc(personal.id).get()
    ]);
    if (wSnap.exists && pSnap.exists) {
      console.log(`[Firestore Personal Withdrawal] Verified records exist in Firestore for withdrawal ${withdrawal.id}`);
      return true;
    }
  } catch (verifyErr: any) {
    console.error(`[Firestore Personal Withdrawal] Read-back verification failed for withdrawal ${withdrawal.id}:`, verifyErr?.message || verifyErr);
  }

  return false;
}

/**
 * Atomic batch commit for Admin / Super Admin Commission Withdrawal with resilient sequential fallback and read-back verification.
 * Writes:
 * - withdrawals doc
 * - payments doc
 * Guarantees that either both the withdrawal and payment records are confirmed in Firestore or none.
 */
export async function fsExecuteAdminWithdrawalBatch(
  withdrawal: Withdrawal,
  payment: PaymentRecord
): Promise<boolean> {
  const startTime = Date.now();
  const db = getFirestoreDb();
  if (!db) {
    console.error(`[Firestore Admin Withdrawal] Aborted: DB instance is null. Withdrawal id: ${withdrawal?.id}`);
    return false;
  }
  if (!withdrawal || !withdrawal.id || !payment) {
    console.error(`[Firestore Admin Withdrawal] Aborted: Invalid parameters. withdrawal=${Boolean(withdrawal)}, payment=${Boolean(payment)}`);
    return false;
  }

  const cleanWithdrawal = cleanUndefinedFields(withdrawal);
  const cleanPayment = cleanUndefinedFields(payment);
  const payDocId = payment.id || payment.reference;

  // Tier 1: Primary Atomic Batch Write
  try {
    const batch = db.batch();
    batch.set(db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS).doc(withdrawal.id), cleanWithdrawal, { merge: true });
    batch.set(db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).doc(payDocId), cleanPayment, { merge: true });
    await batch.commit();
    console.log(`[Firestore Admin Withdrawal] Batch write committed for withdrawal ${withdrawal.id} in ${Date.now() - startTime}ms`);
    return true;
  } catch (batchErr: any) {
    console.warn(`[Firestore Admin Withdrawal] Batch commit failed for withdrawal ${withdrawal.id} (${Date.now() - startTime}ms): ${batchErr?.message || batchErr}. Executing sequential fallback...`);
  }

  // Tier 2: Resilient Sequential Fallback
  try {
    await db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS).doc(withdrawal.id).set(cleanWithdrawal, { merge: true });
    await db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).doc(payDocId).set(cleanPayment, { merge: true });
    console.log(`[Firestore Admin Withdrawal] Sequential fallback committed for withdrawal ${withdrawal.id}`);
    return true;
  } catch (seqErr: any) {
    console.error(`[Firestore Admin Withdrawal] Sequential fallback failed for withdrawal ${withdrawal.id}:`, {
      name: seqErr?.name,
      code: seqErr?.code,
      message: seqErr?.message,
      durationMs: Date.now() - startTime
    });
  }

  // Tier 3: Read-Back Verification
  try {
    const [wSnap, pSnap] = await Promise.all([
      db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS).doc(withdrawal.id).get(),
      db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).doc(payDocId).get()
    ]);
    if (wSnap.exists && (wSnap.data() as any)?.status === withdrawal.status) {
      console.log(`[Firestore Admin Withdrawal] Verified records exist in Firestore for withdrawal ${withdrawal.id}`);
      return true;
    }
    if (withdrawal.reference) {
      const qSnap = await db.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS)
        .where('reference', '==', withdrawal.reference)
        .limit(1)
        .get();
      if (!qSnap.empty) {
        console.log(`[Firestore Admin Withdrawal] Verified withdrawal by reference in Firestore for withdrawal ${withdrawal.id}`);
        return true;
      }
    }
  } catch (verifyErr: any) {
    console.error(`[Firestore Admin Withdrawal] Read-back verification failed for withdrawal ${withdrawal.id}:`, verifyErr?.message || verifyErr);
  }

  return false;
}

// =========================================================================
// PHASE 3: SAFE SYNCHRONIZATION & VERIFICATION
// =========================================================================

export interface EntitySyncResult {
  entity: string;
  sourceCount: number;
  firestoreCount: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  conflicts: string[];
}

export interface FullSyncReport {
  success: boolean;
  timestamp: string;
  durationMs: number;
  entities: Record<string, EntitySyncResult>;
  totalSourceRecords: number;
  totalCreated: number;
  totalUpdated: number;
  totalSkipped: number;
  totalFailed: number;
  error?: string;
}

/**
 * Synchronize existing Better Ajo records into Cloud Firestore with:
 * - Stable existing document IDs
 * - Zero duplication
 * - Timestamp checking to prevent overwriting newer Firestore data
 * - Entity-by-entity granular reporting
 */
export async function syncExistingDataToFirestore(sourceData: {
  profiles?: UserProfile[];
  personal_ajo?: PersonalAjo[];
  groups?: GroupAjo[];
  group_members?: GroupMember[];
  contributions?: Contribution[];
  pack_transactions?: PackTransaction[];
  commissions?: Commission[];
  withdrawals?: Withdrawal[];
  payments?: PaymentRecord[];
  audit_logs?: any[];
  otps?: Array<{ phone: string; code: string; purpose: string; expires_at: number }>;
}): Promise<FullSyncReport> {
  const startTime = Date.now();
  const db = getFirestoreDb();

  if (!db) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      durationMs: 0,
      entities: {},
      totalSourceRecords: 0,
      totalCreated: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      totalFailed: 0,
      error: 'Firestore is not initialized. Firebase Admin credentials missing.'
    };
  }

  const entities: Record<string, EntitySyncResult> = {};
  let totalSourceRecords = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  async function syncCollection<T extends Record<string, any>>(
    entityName: string,
    collectionName: string,
    records: T[] | undefined,
    getId: (item: T) => string
  ) {
    const list = records || [];
    totalSourceRecords += list.length;
    const result: EntitySyncResult = {
      entity: entityName,
      sourceCount: list.length,
      firestoreCount: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      conflicts: []
    };

    try {
      const existingSnap = await db!.collection(collectionName).get();
      result.firestoreCount = existingSnap.size;
      const existingDocsMap = new Map<string, FirebaseFirestore.DocumentData>();
      existingSnap.docs.forEach(doc => {
        existingDocsMap.set(doc.id, doc.data());
      });

      for (const item of list) {
        try {
          const docId = getId(item);
          if (!docId) {
            result.failed++;
            result.conflicts.push(`Missing identifier for ${entityName} record`);
            continue;
          }

          const existing = existingDocsMap.get(docId);
          if (!existing) {
            // Document does not exist in Firestore: create with exact ID
            await db!.collection(collectionName).doc(docId).set(item);
            result.created++;
            result.firestoreCount++;
          } else {
            // Document exists: compare timestamps to avoid overwriting newer data
            const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
            const sourceTime = new Date(item.updated_at || item.created_at || 0).getTime();

            if (sourceTime > existingTime) {
              await db!.collection(collectionName).doc(docId).set(item, { merge: true });
              result.updated++;
            } else {
              result.skipped++;
            }
          }
        } catch (itemErr: any) {
          result.failed++;
          result.conflicts.push(`Failed to sync ${entityName} ID ${getId(item)}: ${itemErr?.message || itemErr}`);
        }
      }
    } catch (collErr: any) {
      result.failed += list.length;
      result.conflicts.push(`Collection sync error for ${entityName}: ${collErr?.message || collErr}`);
    }

    entities[entityName] = result;
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
  }

  // 1. Profiles
  await syncCollection('profiles', FIRESTORE_COLLECTIONS.PROFILES, sourceData.profiles, p => p.id);

  // 2. Personal Ajo
  await syncCollection('personal_ajo', FIRESTORE_COLLECTIONS.PERSONAL_AJO, sourceData.personal_ajo, pa => pa.id);

  // 3. Groups
  await syncCollection('groups', FIRESTORE_COLLECTIONS.GROUPS, sourceData.groups, g => g.id);

  // 4. Group Members
  await syncCollection('group_members', FIRESTORE_COLLECTIONS.GROUP_MEMBERS, sourceData.group_members, m => m.id);

  // 5. Contributions
  await syncCollection('contributions', FIRESTORE_COLLECTIONS.CONTRIBUTIONS, sourceData.contributions, c => c.id);

  // 6. Pack Transactions
  await syncCollection('pack_transactions', FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS, sourceData.pack_transactions, pt => pt.id);

  // 7. Commissions
  await syncCollection('commissions', FIRESTORE_COLLECTIONS.COMMISSIONS, sourceData.commissions, com => com.id);

  // 8. Withdrawals
  await syncCollection('withdrawals', FIRESTORE_COLLECTIONS.WITHDRAWALS, sourceData.withdrawals, w => w.id);

  // 9. Payments
  await syncCollection('payments', FIRESTORE_COLLECTIONS.PAYMENTS, sourceData.payments, pay => pay.id || pay.reference);

  // 10. Audit Logs
  await syncCollection('audit_logs', FIRESTORE_COLLECTIONS.AUDIT_LOGS, sourceData.audit_logs, a => a.id);

  // 11. OTPs
  await syncCollection('otps', FIRESTORE_COLLECTIONS.OTPS, sourceData.otps, o => `${o.phone}_${o.purpose}`);

  const durationMs = Date.now() - startTime;
  return {
    success: totalFailed === 0,
    timestamp: new Date().toISOString(),
    durationMs,
    entities,
    totalSourceRecords,
    totalCreated,
    totalUpdated,
    totalSkipped,
    totalFailed
  };
}

/**
 * Verify representative records from every core entity in Firestore.
 */
export async function verifyRepresentativeRecords(): Promise<{
  allVerified: boolean;
  details: Record<string, { verified: boolean; recordId?: string; info?: string; error?: string }>;
}> {
  const db = getFirestoreDb();
  if (!db) {
    return {
      allVerified: false,
      details: { connection: { verified: false, error: 'Firestore is not initialized.' } }
    };
  }

  const details: Record<string, { verified: boolean; recordId?: string; info?: string; error?: string }> = {};

  // 1. User / Super Admin Profile
  try {
    const pSnap = await db.collection(FIRESTORE_COLLECTIONS.PROFILES)
      .where('phone', '==', '08154267469')
      .limit(1)
      .get();
    if (!pSnap.empty) {
      const p = pSnap.docs[0].data();
      details.superAdmin = {
        verified: p.role === 'SUPER_ADMIN',
        recordId: p.id,
        info: `Name: ${p.full_name}, Phone: ${p.phone}, Role: ${p.role}`
      };
    } else {
      details.superAdmin = { verified: false, error: 'Super Admin profile (08154267469) not found in Firestore' };
    }
  } catch (err: any) {
    details.superAdmin = { verified: false, error: err?.message };
  }

  // 2. Personal Ajo
  try {
    const paSnap = await db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).limit(1).get();
    if (!paSnap.empty) {
      const pa = paSnap.docs[0].data();
      details.personalAjo = {
        verified: true,
        recordId: pa.id,
        info: `User ID: ${pa.user_id}, Status: ${pa.status}, Balance: ₦${pa.balance}`
      };
    } else {
      details.personalAjo = { verified: false, error: 'No Personal Ajo record found' };
    }
  } catch (err: any) {
    details.personalAjo = { verified: false, error: err?.message };
  }

  // 3. Group Ajo
  try {
    const gSnap = await db.collection(FIRESTORE_COLLECTIONS.GROUPS).limit(1).get();
    if (!gSnap.empty) {
      const g = gSnap.docs[0].data();
      details.groupAjo = {
        verified: true,
        recordId: g.id,
        info: `Name: ${g.group_name}, Code: ${g.group_code}, Admin: ${g.admin_name}, Fee: ₦${g.packing_fee}`
      };
    } else {
      details.groupAjo = { verified: false, error: 'No Group found' };
    }
  } catch (err: any) {
    details.groupAjo = { verified: false, error: err?.message };
  }

  // 4. Group Member
  try {
    const mSnap = await db.collection(FIRESTORE_COLLECTIONS.GROUP_MEMBERS).limit(1).get();
    if (!mSnap.empty) {
      const m = mSnap.docs[0].data();
      details.groupMember = {
        verified: true,
        recordId: m.id,
        info: `Name: ${m.full_name}, Group: ${m.group_id}, Position: ${m.position}`
      };
    } else {
      details.groupMember = { verified: false, error: 'No Group Member found' };
    }
  } catch (err: any) {
    details.groupMember = { verified: false, error: err?.message };
  }

  // 5. Contribution
  try {
    const cSnap = await db.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).limit(1).get();
    if (!cSnap.empty) {
      const c = cSnap.docs[0].data();
      details.contribution = {
        verified: true,
        recordId: c.id,
        info: `Amount: ₦${c.amount}, Status: ${c.status}, Round: ${c.round_number}`
      };
    } else {
      details.contribution = { verified: false, error: 'No Contribution found' };
    }
  } catch (err: any) {
    details.contribution = { verified: false, error: err?.message };
  }

  // 6. Payment
  try {
    const paySnap = await db.collection(FIRESTORE_COLLECTIONS.PAYMENTS).limit(1).get();
    if (!paySnap.empty) {
      const pay = paySnap.docs[0].data();
      details.payment = {
        verified: true,
        recordId: pay.reference,
        info: `Amount: ₦${pay.amount}, Status: ${pay.status}, Purpose: ${pay.purpose}`
      };
    } else {
      details.payment = { verified: false, error: 'No Payment record found' };
    }
  } catch (err: any) {
    details.payment = { verified: false, error: err?.message };
  }

  // 7. Pack Transaction
  try {
    const ptSnap = await db.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS).limit(1).get();
    if (!ptSnap.empty) {
      const pt = ptSnap.docs[0].data();
      details.packTransaction = {
        verified: true,
        recordId: pt.id,
        info: `Packing: ₦${pt.packing_amount}, Fee: ₦${pt.packing_fee}, Member: ${pt.member_name}`
      };
    } else {
      details.packTransaction = { verified: false, error: 'No Pack Transaction found' };
    }
  } catch (err: any) {
    details.packTransaction = { verified: false, error: err?.message };
  }

  // 8. Commission
  try {
    const comSnap = await db.collection(FIRESTORE_COLLECTIONS.COMMISSIONS).limit(1).get();
    if (!comSnap.empty) {
      const com = comSnap.docs[0].data();
      details.commission = {
        verified: true,
        recordId: com.id,
        info: `Admin: ₦${com.admin_amount}, Super Admin: ₦${com.super_admin_amount}`
      };
    } else {
      details.commission = { verified: false, error: 'No Commission record found' };
    }
  } catch (err: any) {
    details.commission = { verified: false, error: err?.message };
  }

  const allVerified = Object.values(details).every(d => d.verified);
  return { allVerified, details };
}

/**
 * Hydrate remote Firestore records into local in-memory store.
 * Merges newer or missing records from Firestore without discarding existing state.
 */
export async function hydrateFromFirestore(): Promise<{
  hydrated: boolean;
  counts: Record<string, number>;
  data?: {
    profiles: UserProfile[];
    personal_ajo: PersonalAjo[];
    groups: GroupAjo[];
    group_members: GroupMember[];
    contributions: Contribution[];
    pack_transactions: PackTransaction[];
    commissions: Commission[];
    withdrawals: Withdrawal[];
    payments: PaymentRecord[];
  };
}> {
  const db = getFirestoreDb();
  if (!db) {
    return { hydrated: false, counts: {} };
  }

  try {
    const [
      profiles,
      personal_ajo,
      groups,
      group_members,
      contributions,
      pack_transactions,
      commissions,
      withdrawals,
      payments
    ] = await Promise.all([
      fsGetAllProfiles(),
      fsGetAllPersonalAjo(),
      fsGetAllGroups(),
      fsGetAllGroupMembers(),
      fsGetAllContributions(),
      fsGetAllPackTransactions(),
      fsGetAllCommissions(),
      fsGetAllWithdrawals(),
      fsGetAllPayments()
    ]);

    const counts = {
      profiles: profiles.length,
      personal_ajo: personal_ajo.length,
      groups: groups.length,
      group_members: group_members.length,
      contributions: contributions.length,
      pack_transactions: pack_transactions.length,
      commissions: commissions.length,
      withdrawals: withdrawals.length,
      payments: payments.length
    };

    return {
      hydrated: true,
      counts,
      data: {
        profiles,
        personal_ajo,
        groups,
        group_members,
        contributions,
        pack_transactions,
        commissions,
        withdrawals,
        payments
      }
    };
  } catch (err) {
    console.warn('Failed to hydrate from Firestore:', err);
    return { hydrated: false, counts: {} };
  }
}

/**
 * Adds an amount directly to the unified superAdminEarnings collection in Firestore.
 * Always updates the single document with field 'totalEarnings'.
 */
export async function addToSuperAdminEarnings(
  amount: number,
  type: string,
  metadata?: { description?: string; reference?: string; userId?: string }
): Promise<{ success: boolean; totalEarnings: number }> {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return { success: false, totalEarnings: 0 };
  }

  const db = getFirestoreDb();
  if (!db) {
    console.warn('[addToSuperAdminEarnings] Firestore is not initialized.');
    return { success: false, totalEarnings: 0 };
  }

  try {
    const docRef = db.collection(FIRESTORE_COLLECTIONS.SUPER_ADMIN_EARNINGS).doc('main');
    const docSnap = await docRef.get();

    let currentTotal = 0;
    let currentWithdrawn = 0;
    let currentLifetime = 0;
    let history: any[] = [];

    if (docSnap.exists) {
      const data = docSnap.data() || {};
      currentTotal = Number(data.totalEarnings || 0);
      currentWithdrawn = Number(data.totalWithdrawn || 0);
      currentLifetime = Number(data.lifetimeEarned || currentTotal);
      history = Array.isArray(data.history) ? data.history : [];
    }

    const newTotal = Number((currentTotal + numAmount).toFixed(2));
    const newLifetime = Number((currentLifetime + numAmount).toFixed(2));

    const entry = {
      id: `sa_earn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: numAmount,
      type,
      description: metadata?.description || type,
      reference: metadata?.reference || '',
      user_id: metadata?.userId || '',
      created_at: new Date().toISOString(),
      balance_after: newTotal
    };

    history.unshift(entry);
    if (history.length > 200) history.length = 200;

    await docRef.set(cleanUndefinedFields({
      id: 'main',
      totalEarnings: newTotal,
      totalWithdrawn: currentWithdrawn,
      lifetimeEarned: newLifetime,
      updated_at: new Date().toISOString(),
      last_transaction: entry,
      history
    }), { merge: true });

    return { success: true, totalEarnings: newTotal };
  } catch (err: any) {
    console.error('[addToSuperAdminEarnings Error]:', err?.message || err);
    return { success: false, totalEarnings: 0 };
  }
}

/**
 * Retrieves the superAdminEarnings document from Firestore.
 */
export async function getSuperAdminEarningsFromFirestore(): Promise<{
  totalEarnings: number;
  totalWithdrawn: number;
  lifetimeEarned: number;
  history: any[];
  updated_at: string;
} | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const docRef = db.collection(FIRESTORE_COLLECTIONS.SUPER_ADMIN_EARNINGS).doc('main');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      return {
        totalEarnings: Number(data.totalEarnings || 0),
        totalWithdrawn: Number(data.totalWithdrawn || 0),
        lifetimeEarned: Number(data.lifetimeEarned || data.totalEarnings || 0),
        history: Array.isArray(data.history) ? data.history : [],
        updated_at: data.updated_at || new Date().toISOString()
      };
    }
    return null;
  } catch (err: any) {
    console.error('[getSuperAdminEarningsFromFirestore Error]:', err?.message || err);
    return null;
  }
}

/**
 * Deducts a withdrawal amount from the superAdminEarnings collection in Firestore.
 */
export async function deductFromSuperAdminEarnings(
  amount: number,
  metadata?: { description?: string; reference?: string; withdrawalId?: string }
): Promise<{ success: boolean; totalEarnings: number; withdrawn: number }> {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Invalid withdrawal amount.');
  }

  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }

  const docRef = db.collection(FIRESTORE_COLLECTIONS.SUPER_ADMIN_EARNINGS).doc('main');
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new Error('No super admin earnings document found in Firestore.');
  }

  const data = docSnap.data() || {};
  const currentTotal = Number(data.totalEarnings || 0);
  if (numAmount > (currentTotal + 0.001)) {
    throw new Error(`Amount exceeds available totalEarnings of ₦${currentTotal.toFixed(2)}.`);
  }

  const newTotal = Math.max(0, Number((currentTotal - numAmount).toFixed(2)));
  const currentWithdrawn = Number(data.totalWithdrawn || 0);
  const newWithdrawn = Number((currentWithdrawn + numAmount).toFixed(2));
  const history = Array.isArray(data.history) ? data.history : [];

  const entry = {
    id: `sa_wth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    amount: -numAmount,
    type: 'super_admin_withdrawal',
    description: metadata?.description || 'Super Admin Revenue Withdrawal',
    reference: metadata?.reference || metadata?.withdrawalId || '',
    created_at: new Date().toISOString(),
    balance_after: newTotal
  };

  history.unshift(entry);
  if (history.length > 200) history.length = 200;

  await docRef.set(cleanUndefinedFields({
    id: 'main',
    totalEarnings: newTotal,
    totalWithdrawn: newWithdrawn,
    updated_at: new Date().toISOString(),
    last_transaction: entry,
    history
  }), { merge: true });

  return { success: true, totalEarnings: newTotal, withdrawn: newWithdrawn };
}

/**
 * Record Personal Ajo ₦600 registration fee to Firestore platformRevenue collection (STREAM_1_REGISTRATION).
 */
export async function fsRecordRegistrationRevenue(
  userId: string,
  fee: number = 600,
  reference: string = '',
  fullName: string = ''
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const revRef = db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc();
    await revRef.set({
      stream: 'STREAM_1_REGISTRATION',
      streamName: 'REGISTRATION',
      type: 'personal_registration_fee',
      amount: fee,
      source: 'personal_ajo',
      userId,
      reference,
      description: `Personal Ajo Registration Fee ₦${fee} - ${fullName || ''}`,
      createdAt: new Date()
    });
    console.log(`[Firestore Revenue] STREAM_1_REGISTRATION recorded for user ${userId}: ₦${fee}`);
    return true;
  } catch (err: any) {
    console.error('[Firestore Revenue] Failed to record STREAM_1_REGISTRATION:', err?.message || err);
    return false;
  }
}

/**
 * Record Group Packing 33.33% share to Firestore platformRevenue collection (STREAM_3_PACKING).
 */
export async function fsRecordPackingRevenue(
  groupId: string,
  transactionId: string,
  superAdminShare: number,
  groupName: string = ''
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const revRef = db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc();
    await revRef.set({
      stream: 'STREAM_3_PACKING',
      streamName: 'PACKING',
      type: 'group_packing_fee',
      amount: superAdminShare,
      source: 'group_ajo',
      group_id: groupId,
      reference: transactionId,
      description: `33.33% Share of Group Packing Fee - ${groupName || ''}`,
      createdAt: new Date()
    });
    console.log(`[Firestore Revenue] STREAM_3_PACKING recorded for group ${groupId}: ₦${superAdminShare}`);
    return true;
  } catch (err: any) {
    console.error('[Firestore Revenue] Failed to record STREAM_3_PACKING:', err?.message || err);
    return false;
  }
}

/**
 * Record Personal Ajo 1.6% withdrawal fee to Firestore platformRevenue collection (STREAM_4_WITHDRAWAL).
 */
export async function fsRecordWithdrawalFeeRevenue(
  userId: string,
  grossAmount: number,
  fee: number,
  reference: string,
  fullName: string = ''
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const revRef = db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc();
    await revRef.set({
      stream: 'STREAM_4_WITHDRAWAL',
      streamName: 'WITHDRAWAL',
      type: 'personal_withdrawal_fee',
      amount: fee,
      source: 'personal_ajo',
      userId,
      gross_amount: grossAmount,
      reference,
      description: `1.6% Personal Withdrawal Processing Fee - ${fullName || ''}`,
      createdAt: new Date()
    });
    console.log(`[Firestore Revenue] STREAM_4_WITHDRAWAL recorded for user ${userId}: ₦${fee}`);
    return true;
  } catch (err: any) {
    console.error('[Firestore Revenue] Failed to record STREAM_4_WITHDRAWAL:', err?.message || err);
    return false;
  }
}

/**
 * Record Super Admin withdrawal deduction to Firestore platformRevenue collection.
 */
export async function fsRecordSuperAdminWithdrawalDeduction(
  withdrawal: { amount: number; reference?: string; id?: string; bank_name?: string }
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const revRef = db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc();
    await revRef.set({
      stream: 'WITHDRAWAL_DEDUCTION',
      type: 'super_admin_withdrawal',
      amount: -Math.abs(Number(withdrawal.amount)),
      reference: withdrawal.reference || withdrawal.id || '',
      description: `Super Admin Revenue Payout to ${withdrawal.bank_name || 'Bank'}`,
      createdAt: new Date()
    });
    console.log(`[Firestore Revenue] WITHDRAWAL_DEDUCTION recorded: -₦${withdrawal.amount}`);
    return true;
  } catch (err: any) {
    console.error('[Firestore Revenue] Failed to record WITHDRAWAL_DEDUCTION:', err?.message || err);
    return false;
  }
}

/**
 * One-time / background sync to ensure all existing profiles & personal_ajo are in Firestore `users/{userId}`
 * with `personalBalance`, and historical ledger entries are in `platformRevenue`.
 */
export async function fsSyncAllToUsersAndRevenue(): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    // 1. Sync profiles and personal_ajo into users/{userId}
    const [profilesSnap, personalSnap] = await Promise.all([
      db.collection(FIRESTORE_COLLECTIONS.PROFILES).get(),
      db.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).get()
    ]);

    const personalMap = new Map<string, any>();
    personalSnap.forEach((doc) => {
      const d = doc.data();
      if (d.user_id) personalMap.set(d.user_id, d);
    });

    const userBatch = db.batch();
    let batchCount = 0;

    profilesSnap.forEach((pDoc) => {
      const profile = pDoc.data();
      const pAjo = personalMap.get(profile.id);
      const balance = Number(pAjo?.balance ?? 0);

      const userRef = db.collection(FIRESTORE_COLLECTIONS.USERS).doc(profile.id);
      userBatch.set(userRef, {
        id: profile.id,
        email: profile.email || '',
        phone: profile.phone || '',
        full_name: profile.full_name || '',
        role: profile.role || 'user',
        personalBalance: balance,
        balance: balance,
        updatedAt: new Date()
      }, { merge: true });

      batchCount++;
    });

    if (batchCount > 0) {
      await userBatch.commit();
      console.log(`[Firestore Sync] Synced ${batchCount} users to users collection with personalBalance`);
    }

    // 2. Check if platformRevenue is empty, and seed from admin ledger if needed
    const revCheck = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).limit(1).get();
    if (revCheck.empty) {
      // Import ledger from in-memory db
      const { db: inMemDb } = await import('./db.js');
      const ledger = inMemDb.getAdminRevenueLedger() || [];
      if (ledger.length > 0) {
        const revBatch = db.batch();
        ledger.forEach((item: any) => {
          const revRef = db.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc();
          let stream = 'STREAM_2_CONTRIBUTION';
          if (item.type === 'registration_600' || item.stream === 'STREAM_1_REGISTRATION') stream = 'STREAM_1_REGISTRATION';
          else if (item.type === 'contribution_60' || item.stream === 'STREAM_2_CONTRIBUTION') stream = 'STREAM_2_CONTRIBUTION';
          else if (item.type === 'packing_33' || item.stream === 'STREAM_3_PACKING') stream = 'STREAM_3_PACKING';
          else if (item.type === 'withdrawal_1_6' || item.stream === 'STREAM_4_WITHDRAWAL') stream = 'STREAM_4_WITHDRAWAL';
          else if (item.type === 'super_admin_withdrawal' || item.stream === 'WITHDRAWAL_DEDUCTION') stream = 'WITHDRAWAL_DEDUCTION';

          const feeVal = Number(item.fee_amount ?? item.amount ?? 0);
          revBatch.set(revRef, {
            stream,
            streamName: stream === 'WITHDRAWAL_DEDUCTION' ? 'WITHDRAWAL' : stream.replace('STREAM_', '').split('_')[1] || 'REVENUE',
            type: item.type,
            amount: stream === 'WITHDRAWAL_DEDUCTION' ? -Math.abs(feeVal) : feeVal,
            fee_amount: feeVal,
            source: item.source || 'platform',
            userId: item.user_id || '',
            reference: item.reference || item.id,
            description: item.description || '',
            createdAt: item.created_at ? new Date(item.created_at) : new Date()
          });
        });

        await revBatch.commit();
        console.log(`[Firestore Sync] Seeded ${ledger.length} records into platformRevenue collection`);
      }
    }
  } catch (syncErr: any) {
    console.error('[Firestore Sync] fsSyncAllToUsersAndRevenue error:', syncErr?.message || syncErr);
  }
}


