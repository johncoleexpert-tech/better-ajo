import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { Contribution, PaymentRecord, GroupMember, Withdrawal, STREAM_REGISTRATION, STREAM_CONTRIBUTION, STREAM_PACKING } from '../src/types/index.js';
import { db, getNigeriaCalendarDate, addCycleIntervalToCalendarDate, formatCalendarDateDisplay, normalizeNigerianPhone } from './db.js';
import { initializePaystackPayment, verifyPaystackPayment, setTestPaymentCharge, initiatePaystackTransfer } from './paystack.js';
import { formatPersonalAccountName, formatGroupMemberAccountName, generateMoniepointAccountNumber, generateGroupMemberVirtualAccount } from './moniepoint.js';
import { createRateLimiter } from './rateLimiter.js';
import {
  isSupabaseConfigured,
  getMissingSupabaseEnv,
  syncProfileToSupabase,
  syncPersonalAjoToSupabase,
  syncPaymentRecordToSupabase,
  syncWithdrawalToSupabase,
  syncGroupToSupabase,
  syncGroupMemberToSupabase,
  syncContributionToSupabase,
  syncPackTransactionToSupabase,
  syncCommissionToSupabase,
  syncAuditLogToSupabase,
  fetchProfileByPhoneFromSupabase,
  fetchProfileByIdFromSupabase,
  fetchGroupByIdFromSupabase,
  fetchGroupByCodeFromSupabase
} from './supabase.js';
import {
  isFirebaseConfigured,
  checkFirebaseHealth,
  testFirestoreReadWrite,
  syncExistingDataToFirestore,
  verifyRepresentativeRecords,
  fsUpsertProfile,
  fsGetProfileByPhone,
  fsGetProfileById,
  fsUpsertPersonalAjo,
  fsGetPersonalAjoByUserId,
  getOrCreatePersonalAjo,
  onPaymentSuccess,
  fsUpsertGroup,
  fsGetGroupById,
  fsGetGroupByCode,
  fsGetGroupsForUser,
  fsGetMembersForGroup,
  fsUpsertGroupMember,
  fsUpsertContribution,
  fsUpsertPackTransaction,
  fsUpsertCommission,
  fsUpsertWithdrawal,
  fsUpsertPayment,
  fsGetPaymentByReference,
  fsGetWithdrawalByReference,
  fsGetContributionById,
  fsGetContributionByReference,
  fsExecutePackBatch,
  fsExecuteStartNextRoundBatch,
  fsExecuteDepositBatch,
  fsVerifyPersonalAjoFeeTransaction,
  fsExecuteContributionBatch,
  fsExecuteWithdrawalBatch,
  fsExecuteWithdrawalTransaction,
  fsGetTotalsFromTransactions,
  fsExecuteAdminWithdrawalBatch,
  fsExecutePersonalDepositTransaction,
  fsRecordRegistrationRevenue,
  fsRecordPackingRevenue,
  fsRecordWithdrawalFeeRevenue,
  fsRecordSuperAdminWithdrawalDeduction,
  fsGetPlatformRevenueMain,
  aggregatePersonalAjoSavings,
  fsGetPlatformStats,
  getFirestoreDb,
  getFirebaseAuth,
  fsGetProfileByEmail,
  fsUpsertUserAndProfile,
  fsRecordGroupCreationFee,
  fsLogAuditEvent,
  fsSaveOtp,
  fsVerifyOtp,
  fsDeleteOtp,
  verifyFirestorePersistenceReady,
  FIRESTORE_COLLECTIONS,
  FieldValue
} from './firebase.js';
import { wipeTestData } from './wipeTestData.js';

export const apiRouter = Router();

// Global hook: Whenever a pack is executed in db (manual or auto-pack safeguard), sync batch to Firestore
db.onPackExecuted = (packTx, commission, group, member) => {
  fsExecutePackBatch(packTx, commission, member, group).catch(err => {
    console.warn('[Auto-Pack fsExecutePackBatch Warn]:', err?.message || err);
  });
};

// Rate limiters for security hardening
const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many authentication attempts. Please try again in 1 minute.'
});

const packRateLimiter = createRateLimiter({
  windowMs: 30 * 1000,
  maxRequests: 20,
  message: 'Too many pack requests. Please wait a moment before trying again.'
});

const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many payment verification requests. Please wait a moment.'
});

// Helper to verify OTP with serverless-safe Firestore fallback and single-use invalidation
async function verifyOtpSafe(phone: string, code: string, purpose: string): Promise<boolean> {
  const cleanPhone = normalizeNigerianPhone(phone);
  let isValid = db.verifyOtp(cleanPhone, code, purpose);
  if (!isValid) {
    isValid = await fsVerifyOtp(cleanPhone, code, purpose);
  } else {
    fsDeleteOtp(cleanPhone, purpose).catch(() => {});
  }
  return isValid;
}

// ----------------------------------------------------
// DATABASE & PLATFORM STATUS
// ----------------------------------------------------
apiRouter.get('/db/status', (req: Request, res: Response) => {
  const configured = isSupabaseConfigured();
  const missingEnv = getMissingSupabaseEnv();
  const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
  const paystackMode = secretKey.startsWith('sk_live_')
    ? 'live'
    : secretKey.startsWith('sk_test_')
    ? 'test'
    : 'simulated';

  const firebaseConfigured = isFirebaseConfigured();

  return res.json({
    supabaseConfigured: configured,
    firebaseConfigured,
    provider: firebaseConfigured ? 'firebase' : (configured ? 'supabase' : 'local_storage'),
    missingEnv,
    paystackLive: secretKey.startsWith('sk_'),
    paystackMode,
    tables: [
      'profiles',
      'personal_ajo',
      'groups',
      'group_members',
      'contributions',
      'pack_transactions',
      'commissions',
      'withdrawals',
      'payment_records'
    ],
    firestoreCollections: Object.values(FIRESTORE_COLLECTIONS),
    schemaFile: 'supabase/schema.sql'
  });
});

apiRouter.get('/firebase/health', async (_req: Request, res: Response) => {
  try {
    const health = await checkFirebaseHealth();
    return res.json(health);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Firebase health check failed' });
  }
});

apiRouter.post('/firebase/test-read-write', async (_req: Request, res: Response) => {
  try {
    const result = await testFirestoreReadWrite();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Firestore read/write test error' });
  }
});

// Phase 3: Safe Synchronization of Better Ajo records into Cloud Firestore
apiRouter.post('/firebase/sync', async (_req: Request, res: Response) => {
  try {
    if (!isFirebaseConfigured()) {
      return res.status(503).json({
        error: 'Firebase Admin SDK is not fully configured. Missing credentials.',
        missingEnv: [
          !process.env.FIREBASE_PROJECT_ID ? 'FIREBASE_PROJECT_ID' : null,
          !process.env.FIREBASE_CLIENT_EMAIL ? 'FIREBASE_CLIENT_EMAIL' : null,
          !process.env.FIREBASE_PRIVATE_KEY ? 'FIREBASE_PRIVATE_KEY' : null
        ].filter(Boolean)
      });
    }

    const snapshot = db.getSnapshotData();
    const result = await syncExistingDataToFirestore(snapshot);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Firestore synchronization failed' });
  }
});

// Phase 3: Verify representative records across all 11 entities in Cloud Firestore
apiRouter.get('/firebase/verify', async (_req: Request, res: Response) => {
  try {
    if (!isFirebaseConfigured()) {
      return res.status(503).json({
        error: 'Firebase Admin SDK is not configured.'
      });
    }

    const verification = await verifyRepresentativeRecords();
    return res.json(verification);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Firestore verification failed' });
  }
});

// Phase 3: Hydrate running local instance from Cloud Firestore
apiRouter.post('/firebase/hydrate', async (_req: Request, res: Response) => {
  try {
    if (!isFirebaseConfigured()) {
      return res.status(503).json({ error: 'Firebase is not configured' });
    }

    const result = await db.syncWithFirestore();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Firestore hydration failed' });
  }
});

// ----------------------------------------------------
// PAYSTACK TEST SIMULATION (TEST MODE)
// ----------------------------------------------------
apiRouter.post('/paystack/test-charge', (req: Request, res: Response) => {
  try {
    const { reference, status, gatewayResponse, amount, amountKobo } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'reference is required' });
    }
    const chargeStatus = status === 'failed' ? 'failed' : 'success';
    const finalAmountKobo = amountKobo || (amount ? Math.round(Number(amount) * 100) : 60000);
    setTestPaymentCharge(reference, chargeStatus, gatewayResponse, finalAmountKobo);

    return res.json({
      success: true,
      reference,
      status: chargeStatus,
      message: `Test charge recorded as ${chargeStatus}`
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// AUTH & OTP ROUTES
// ----------------------------------------------------

apiRouter.post('/auth/send-otp', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, purpose } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
    const cleanPhone = normalizeNigerianPhone(phone);
    const otpPurpose = purpose || 'login';
    const code = db.generateOtp(cleanPhone, otpPurpose);
    const expiresAtMs = Date.now() + 10 * 60 * 1000;
    
    // Serverless-safe shared persistence in Firestore otps collection
    await fsSaveOtp(cleanPhone, code, otpPurpose, expiresAtMs);
    
    return res.json({
      success: true,
      message: `OTP sent to ${cleanPhone}`,
      phone: cleanPhone,
      testCode: code // Exposed for testing in development preview
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send OTP' });
  }
});

apiRouter.post('/auth/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, phone, code } = req.body;

    // 1. Email + Password Authentication
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      if (!password) {
        return res.status(400).json({ error: 'Password is required.' });
      }

      let profile = db.getProfileByEmail(cleanEmail);

      // Check Firestore by email if not found in memory
      if (!profile) {
        try {
          const fsProf = await fsGetProfileByEmail(cleanEmail);
          if (fsProf) {
            profile = db.upsertProfile(fsProf);
          }
        } catch (e) {
          console.warn('[Login] fsGetProfileByEmail error:', e);
        }
      }

      // Check Firebase Admin Auth if still not found
      if (!profile) {
        try {
          const auth = getFirebaseAuth();
          if (auth) {
            const authUser = await auth.getUserByEmail(cleanEmail);
            if (authUser) {
              const fsUser = await fsGetProfileById(authUser.uid);
              const candidate = fsUser || {
                id: authUser.uid,
                uid: authUser.uid,
                full_name: authUser.displayName || cleanEmail.split('@')[0],
                email: cleanEmail,
                phone: authUser.phoneNumber || '08000000000',
                role: (cleanEmail === 'realheavenict@gmail.com' || cleanEmail === 'superadmin@packajo.ng' || cleanEmail === 'paulakinyele54@gmail.com') ? 'SUPER_ADMIN' : 'MEMBER',
                bank_name: 'Guaranty Trust Bank (GTB)',
                account_number: '0123456789',
                verification_type: 'NIN',
                verification_number: '12345678901',
                password: password,
                status: 'active',
                is_verified: true,
                created_at: new Date().toISOString()
              };
              profile = db.upsertProfile(candidate as any);
              await fsUpsertUserAndProfile(profile);
            }
          }
        } catch (authErr) {
          // User not found in Firebase Auth
        }
      }

      // Check for Super Admin auto-resolution
      if (!profile && (cleanEmail === 'realheavenict@gmail.com' || cleanEmail === 'superadmin@packajo.ng' || cleanEmail === 'paulakinyele54@gmail.com')) {
        profile = db.getProfiles().find(p => p.role === 'SUPER_ADMIN') || db.upsertProfile({
          id: 'usr_superadmin_realheaven',
          uid: 'usr_superadmin_realheaven',
          full_name: 'Super Administrator',
          phone: '08154267469',
          email: cleanEmail,
          password: password || 'BetterAjo@RealHeaven2026!',
          bank_name: 'Guaranty Trust Bank (GTB)',
          account_number: '0123456789',
          verification_type: 'NIN',
          verification_number: '12345678901',
          role: 'SUPER_ADMIN',
          status: 'active',
          is_verified: true,
          created_at: new Date().toISOString()
        });
        await fsUpsertUserAndProfile(profile);
      }

      if (!profile) {
        return res.status(404).json({
          error: 'No account found for this email address. Please sign up first.',
          isNewUser: true,
          email: cleanEmail
        });
      }

      // Verify password
      if (cleanEmail === 'realheavenict@gmail.com' && password === 'BetterAjo@RealHeaven2026!') {
        profile.password = password;
        profile.role = 'SUPER_ADMIN';
        db.upsertProfile(profile);
      } else if (profile.password) {
        if (profile.password !== password) {
          return res.status(401).json({ error: 'Incorrect password. Please verify your credentials and try again.' });
        }
      } else {
        // Set password for existing demo profiles
        profile.password = password;
        db.upsertProfile(profile);
      }

      const isSuper = profile.role === 'SUPER_ADMIN' || profile.role === 'superadmin' || cleanEmail === 'realheavenict@gmail.com' || cleanEmail === 'superadmin@packajo.ng' || cleanEmail === 'paulakinyele54@gmail.com' || profile.phone === '08154267469';
      const isGroupAdmin = profile.role === 'GROUP_ADMIN' || profile.role === 'groupadmin';

      // personal_ajo must ONLY be visible to role=user and only his own doc.
      let personal = null;
      if (!isSuper && !isGroupAdmin) {
        try {
          personal = await getOrCreatePersonalAjo(profile.id);
        } catch (e) {
          personal = db.getPersonalAjoByUserId(profile.id);
        }
      }

      const userGroups = db.getUserGroups(profile.id);

      db.recordAudit({
        event_type: 'AUTH_LOGIN_SUCCESS',
        user_id: profile.id,
        ip_address: req.ip,
        details: { email: cleanEmail, role: profile.role }
      });

      return res.json({
        success: true,
        profile,
        personalAjo: personal,
        adminGroups: userGroups.adminGroups,
        memberGroups: userGroups.memberGroups,
        groups: userGroups.allGroups
      });
    }

    // 2. Legacy Phone + OTP Authentication (Preserved for compatibility)
    if (!phone || !code) {
      return res.status(400).json({ error: 'Email and password (or phone and OTP) are required.' });
    }

    const cleanPhone = normalizeNigerianPhone(phone);
    const isValid = await verifyOtpSafe(cleanPhone, code, 'login');
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }

    let profile = db.getProfileByPhone(cleanPhone);
    if (!profile) {
      try {
        const fsProfile = await fsGetProfileByPhone(cleanPhone);
        if (fsProfile) {
          profile = db.upsertProfile(fsProfile);
        }
      } catch (err) {
        console.warn('Direct Firestore profile lookup error in login:', err);
      }
    }
    if (!profile) {
      try {
        const remoteProfile = await fetchProfileByPhoneFromSupabase(cleanPhone);
        if (remoteProfile) {
          profile = db.upsertProfile(remoteProfile);
        }
      } catch (err) {
        console.warn('Direct Supabase profile lookup error in login:', err);
      }
    }

    if (!profile) {
      return res.status(404).json({
        error: 'No account found for this phone number. Please sign up first.',
        isNewUser: true,
        phone: cleanPhone
      });
    }

    const isSuper = profile.role === 'SUPER_ADMIN' || profile.role === 'superadmin' || profile.phone === '08154267469';
    const isGroupAdmin = profile.role === 'GROUP_ADMIN' || profile.role === 'groupadmin';

    let personal = null;
    if (!isSuper && !isGroupAdmin) {
      try {
        personal = await getOrCreatePersonalAjo(profile.id);
      } catch (e) {
        personal = db.getPersonalAjoByUserId(profile.id);
      }
    }
    const userGroups = db.getUserGroups(profile.id);

    db.recordAudit({
      event_type: 'AUTH_LOGIN_SUCCESS',
      user_id: profile.id,
      ip_address: req.ip,
      details: { phone: cleanPhone, role: profile.role }
    });

    return res.json({
      success: true,
      profile,
      personalAjo: personal,
      adminGroups: userGroups.adminGroups,
      memberGroups: userGroups.memberGroups,
      groups: userGroups.allGroups
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Login failed' });
  }
});

apiRouter.post('/auth/signup', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const {
      full_name,
      email,
      password,
      phone,
      bank_name,
      account_number,
      verification_type,
      verification_number
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const existing = db.getProfileByEmail(cleanEmail) || (await fsGetProfileByEmail(cleanEmail));
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists. Please log in.' });
    }

    const cleanPhone = phone ? normalizeNigerianPhone(phone) : `080${Math.floor(10000000 + Math.random() * 90000000)}`;
    const isSuperAdminEmail = cleanEmail === 'realheavenict@gmail.com' || cleanEmail === 'superadmin@packajo.ng' || cleanEmail === 'paulakinyele54@gmail.com';

    let authUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      const auth = getFirebaseAuth();
      if (auth) {
        try {
          const userRec = await auth.createUser({
            email: cleanEmail,
            password: password,
            displayName: (full_name && full_name.trim()) ? full_name.trim() : cleanEmail.split('@')[0]
          });
          authUid = userRec.uid;
        } catch (authErr: any) {
          if (authErr?.code === 'auth/email-already-exists') {
            const u = await auth.getUserByEmail(cleanEmail);
            authUid = u.uid;
          } else {
            console.warn('[Signup] Firebase Auth createUser notice:', authErr?.message);
          }
        }
      }
    } catch (e) {
      console.warn('[Signup] Firebase Auth init notice:', e);
    }

    const profile = db.upsertProfile({
      id: authUid,
      uid: authUid,
      full_name: (full_name && full_name.trim()) ? full_name.trim() : cleanEmail.split('@')[0],
      email: cleanEmail,
      password: password,
      phone: cleanPhone,
      bank_name: bank_name || 'Guaranty Trust Bank (GTB)',
      account_number: account_number || '0123456789',
      verification_type: verification_type || 'BVN',
      verification_number: verification_number || '12345678901',
      role: isSuperAdminEmail ? 'SUPER_ADMIN' : 'MEMBER',
      status: 'active',
      is_verified: true,
      created_at: new Date().toISOString()
    });

    await fsUpsertUserAndProfile(profile);

    db.recordAudit({
      event_type: 'AUTH_REGISTER_SUCCESS',
      user_id: profile.id,
      ip_address: req.ip,
      details: { email: cleanEmail, role: profile.role }
    });

    return res.json({
      success: true,
      profile,
      personalAjo: null,
      adminGroups: [],
      memberGroups: [],
      groups: []
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

apiRouter.get('/auth/user-overview/:identifier', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    let cleanPhone = '';
    try {
      cleanPhone = normalizeNigerianPhone(identifier);
    } catch {}

    let profile = db.getProfileById(identifier) ||
                  db.getProfileByEmail(identifier) ||
                  (cleanPhone ? db.getProfileByPhone(cleanPhone) : null);

    if (!profile && cleanPhone) {
      try {
        const fsProfile = await fsGetProfileByPhone(cleanPhone);
        if (fsProfile) {
          profile = db.upsertProfile(fsProfile);
        }
      } catch (err) {
        console.warn('Direct Firestore profile lookup error in user-overview:', err);
      }
    }

    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    const personal = db.getPersonalAjoByUserId(profile.id);
    const userGroups = db.getUserGroups(profile.id);
    const groupMemberships = db.getAllGroupMemberships(profile.id);

    return res.json({
      profile,
      personalAjo: personal,
      adminGroups: userGroups.adminGroups,
      memberGroups: userGroups.memberGroups,
      groups: userGroups.allGroups,
      memberships: groupMemberships
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/auth/register-profile', async (req: Request, res: Response) => {
  try {
    const {
      full_name,
      phone,
      bank_name,
      account_number,
      verification_type,
      verification_number,
      email,
      password,
      otp_code
    } = req.body;

    if (!full_name || (!phone && !email) || !bank_name || !account_number || !verification_type || !verification_number) {
      return res.status(400).json({ error: 'All required registration fields must be completed.' });
    }

    if (verification_type !== 'NIN' && verification_type !== 'BVN') {
      return res.status(400).json({ error: 'Verification type must be either NIN or BVN.' });
    }

    const cleanPhone = phone ? normalizeNigerianPhone(phone) : `080${Math.floor(10000000 + Math.random() * 90000000)}`;

    if (otp_code) {
      const valid = await verifyOtpSafe(cleanPhone, otp_code, 'register');
      if (!valid) {
        return res.status(400).json({ error: 'Invalid or expired verification OTP.' });
      }
    }

    let authUid = undefined;
    if (email && password) {
      try {
        const auth = getFirebaseAuth();
        if (auth) {
          try {
            const userRec = await auth.createUser({
              email: email.trim().toLowerCase(),
              password: password,
              displayName: full_name.trim()
            });
            authUid = userRec.uid;
          } catch (authErr: any) {
            if (authErr?.code === 'auth/email-already-exists') {
              const u = await auth.getUserByEmail(email.trim().toLowerCase());
              authUid = u.uid;
            }
          }
        }
      } catch {}
    }

    const profile = db.upsertProfile({
      id: authUid,
      uid: authUid,
      full_name: full_name.trim(),
      phone: cleanPhone,
      bank_name: bank_name.trim(),
      account_number: account_number.trim(),
      verification_type,
      verification_number: verification_number.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      password: password || undefined,
      status: 'active',
      is_verified: true,
      created_at: new Date().toISOString()
    });

    await syncProfileToSupabase(profile).catch(() => {});
    await fsUpsertUserAndProfile(profile).catch(() => {});

    return res.json({
      success: true,
      profile
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// ----------------------------------------------------
// PERSONAL PACK AJO ROUTES
// ----------------------------------------------------

apiRouter.post('/personal/register', async (req: Request, res: Response) => {
  try {
    const {
      full_name,
      phone,
      bank_name,
      account_number,
      verification_type,
      verification_number,
      email,
      password,
      otp_code,
      whatsappNumber,
      whatsapp_number
    } = req.body;

    if (!full_name || (!phone && !email) || !bank_name || !account_number || !verification_type || !verification_number) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    if (verification_type !== 'NIN' && verification_type !== 'BVN') {
      return res.status(400).json({ error: 'Verification type must be either NIN or BVN.' });
    }

    const cleanPhone = phone
      ? phone.replace(/\s+/g, '').replace(/^\+234/, '0')
      : (email ? '080' + Math.abs(email.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 10000000)).toString().slice(0, 8) : '08012345678');

    const cleanWhatsapp = (whatsappNumber || whatsapp_number || cleanPhone).replace(/\D/g, '');

    // Verify OTP if supplied
    if (otp_code) {
      const valid = await verifyOtpSafe(cleanPhone, otp_code, 'register');
      if (!valid) {
        return res.status(400).json({ error: 'Invalid or expired OTP.' });
      }
    }

    // Save profile
    const profile = db.upsertProfile({
      full_name: full_name.trim(),
      phone: cleanPhone,
      bank_name: bank_name.trim(),
      account_number: account_number.trim(),
      verification_type,
      verification_number: verification_number.trim(),
      email: email ? email.trim() : undefined,
      password: password || undefined,
      whatsapp_number: cleanWhatsapp
    });

    // Create Personal Ajo in pending_fee status
    const personalAjo = db.createPersonalAjo(profile.id);

    // FIX B: Save whatsappNumber to users and personalAjos
    const fDb = getFirestoreDb();
    if (fDb) {
      fDb.collection(FIRESTORE_COLLECTIONS.USERS).doc(profile.id).set({
        id: profile.id,
        name: profile.full_name,
        email: profile.email,
        phone: cleanPhone,
        whatsappNumber: cleanWhatsapp,
        updatedAt: new Date()
      }, { merge: true }).catch(() => {});

      fDb.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJOS).doc(personalAjo.id).set({
        id: personalAjo.id,
        user_id: profile.id,
        whatsappNumber: cleanWhatsapp,
        total_saved: 0,
        total_deposited: 0,
        total_withdrawn: 0,
        balance: 0,
        updated_at: new Date().toISOString()
      }, { merge: true }).catch(() => {});

      fDb.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).doc(personalAjo.id).set({
        id: personalAjo.id,
        user_id: profile.id,
        whatsappNumber: cleanWhatsapp,
        total_saved: 0,
        total_deposited: 0,
        total_withdrawn: 0,
        balance: 0,
        updated_at: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }

    // Sync profile & personal Ajo safely to Supabase and Firestore in background
    syncProfileToSupabase(profile).catch(() => {});
    fsUpsertProfile(profile).catch(() => {});
    syncPersonalAjoToSupabase(personalAjo).catch(() => {});
    fsUpsertPersonalAjo(personalAjo).catch(() => {});

    // Initialize Paystack payment for exactly ₦600 platform fee (60,000 kobo)
    const paystack = await initializePaystackPayment(
      profile.email || `${cleanPhone}@packajo.ng`,
      600,
      'Personal Better Ajo Registration Fee',
      { userId: profile.id, type: 'personal_platform_fee' }
    );

    // 4. DATABASE PAYMENT RECORD (Requirement 4):
    // Before sending user to Paystack, create pending payment record:
    // user ID, purpose = 'personal_registration', amount = 60000 kobo, currency = NGN, reference, status = 'pending', created_at
    const paymentRecord = db.createPendingPayment(
      profile.id,
      paystack.reference,
      60000,
      'personal_registration'
    );
    syncPaymentRecordToSupabase(paymentRecord).catch(() => {});
    fsUpsertPayment(paymentRecord).catch(() => {});

    return res.json({
      success: true,
      profile,
      personalAjo,
      paystack,
      payment: paymentRecord
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// FIX B: Contact Info update route
apiRouter.post('/user/contact-info', async (req: Request, res: Response) => {
  try {
    const { userId, whatsappNumber } = req.body;
    if (!userId || !whatsappNumber) {
      return res.status(400).json({ error: 'User ID and WhatsApp number required.' });
    }
    const cleanNum = String(whatsappNumber).replace(/\D/g, '');
    if (cleanNum.length !== 11) {
      return res.status(400).json({ error: 'Phone / WhatsApp Number must be exactly 11 digits (e.g. 08012345678).' });
    }

    // Update in-memory db
    const existing = db.getProfileById(userId);
    if (existing) {
      existing.whatsapp_number = cleanNum;
      existing.phone = cleanNum;
    }

    const fDb = getFirestoreDb();
    if (fDb) {
      await fDb.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId).set({
        whatsappNumber: cleanNum,
        phone: cleanNum,
        updatedAt: new Date()
      }, { merge: true });

      const pajo = await getOrCreatePersonalAjo(userId);
      await Promise.all([
        fDb.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJOS).doc(pajo.id).set({
          whatsappNumber: cleanNum,
          updated_at: new Date().toISOString()
        }, { merge: true }),
        fDb.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).doc(pajo.id).set({
          whatsappNumber: cleanNum,
          updated_at: new Date().toISOString()
        }, { merge: true })
      ]);
    }

    return res.json({ success: true, whatsappNumber: cleanNum });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update contact info' });
  }
});

apiRouter.post(['/personal/verify-fee', '/personal/verify-personal-ajo', '/verify-personal-ajo'], paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, reference } = req.body;
    if (!userId || !reference) {
      return res.status(400).json({ error: 'userId and reference are required' });
    }

    const authUserId = (req.headers['x-user-id'] as string);
    if (authUserId && authUserId !== userId) {
      return res.status(403).json({ error: 'Security violation: Cannot verify payment for another user account.' });
    }

    // 5. PREVENT DUPLICATE PROCESSING (Requirement 3 & 5):
    // The same Paystack reference must never activate Personal Better Ajo twice or charge twice.
    // Check if reference exists in payments with success status locally or in Firestore
    const existingPayment = db.getPaymentByReference(reference);

    const fsDb = getFirestoreDb();
    if (fsDb) {
      try {
        const existingFsPay = await fsDb.collection('payments').doc(`pay_${reference}`).get();
        if (existingFsPay.exists && (existingFsPay.data()?.status === 'success' || existingFsPay.data()?.status === 'completed')) {
          const personalAjo = db.activatePersonalAjo(userId);
          return res.json({
            success: true,
            message: 'Payment already verified and Personal Better Ajo is active.',
            alreadyVerified: true,
            alreadyProcessed: true,
            personalAjo,
            payment: existingFsPay.data()
          });
        }
      } catch (err) {}
    }

    if (existingPayment && existingPayment.status === 'success') {
      const personalAjo = db.activatePersonalAjo(userId);
      await fsVerifyPersonalAjoFeeTransaction(userId, reference, 600).catch(() => {});
      return res.json({
        success: true,
        message: 'Payment already verified and Personal Better Ajo is active.',
        alreadyVerified: true,
        alreadyProcessed: true,
        personalAjo,
        payment: existingPayment
      });
    }

    // Verify Paystack payment server-side (Requirement 2 & 6)
    // Confirms status = success, amount = ₦600 (60000 kobo), currency = NGN
    const verification = await verifyPaystackPayment(reference, 60000, 'NGN');

    // Update payment record with verified status
    const updatedPayment = db.updatePaymentStatus(
      reference,
      verification.status,
      verification.gateway_response
    );
    if (updatedPayment) {
      syncPaymentRecordToSupabase(updatedPayment).catch(() => {});
    }

    if (!verification.success) {
      if (updatedPayment) {
        fsUpsertPayment(updatedPayment).catch(() => {});
      }
      return res.status(400).json({
        error: verification.message || 'Payment verification failed',
        status: verification.status,
        gatewayResponse: verification.gateway_response,
        reference
      });
    }

    // Payment verified successfully! Activate Personal Better Ajo locally
    const personalAjo = db.activatePersonalAjo(userId);
    syncPersonalAjoToSupabase(personalAjo).catch(() => {});

    // Record platform fee transaction
    db.createPlatformFeeTransaction(userId, 600, 'PERSONAL_AJO', reference);

    // STEP 2 - Record Personal Ajo Registration (₦600) in Super Admin Revenue Ledger
    const registeredUser = db.getProfileById(userId);
    db.recordAdminRevenue({
      type: 'registration_600',
      amount: 600,
      reference,
      group_or_user: registeredUser?.full_name || 'Personal Saver',
      user_id: userId,
      gross_amount: 600,
      description: `Personal Ajo Platform Registration Fee (₦600) - ${registeredUser?.full_name || 'Saver'}`
    });

    // CRITICAL ATOMIC TRANSACTION:
    // Execute atomic Firestore transaction writing pack_transactions, payments, personal_ajo,
    // users, profiles, and platformRevenue/main
    const fsResult = await fsVerifyPersonalAjoFeeTransaction(userId, reference, 600);

    if (!fsResult.success && isFirebaseConfigured()) {
      console.warn(`[Personal Fee] Firestore write returned retryable status for ref: ${reference}`);
      return res.status(503).json({
        error: fsResult.message || 'Payment verified with Paystack, but cloud record persistence is finalizing. Please retry.',
        retryable: true,
        reference
      });
    }

    // Record audit
    db.recordAudit({
      event_type: 'PERSONAL_AJO_ACTIVATED',
      user_id: userId,
      ip_address: req.ip,
      details: { reference, fee: 600, verified_at: new Date().toISOString() }
    });

    return res.json({
      success: true,
      message: 'Personal Better Ajo activated successfully!',
      verified_at: new Date().toISOString(),
      alreadyVerified: false,
      personalAjo,
      payment: updatedPayment
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error during payment verification' });
  }
});

apiRouter.post('/personal/deposit/init', async (req: Request, res: Response) => {
  try {
    const { userId, amount } = req.body;
    const numAmount = Number(amount);
    if (!userId || isNaN(numAmount) || numAmount < 500) {
      return res.status(400).json({ error: 'Minimum deposit is ₦500.' });
    }

    const authUserId = (req.headers['x-user-id'] as string);
    if (authUserId && authUserId !== userId) {
      return res.status(403).json({ error: 'Security violation: Cannot initiate deposit for another account.' });
    }

    const transactionFee = 60;
    const totalAmount = numAmount + transactionFee;

    const profile = db.getProfileById(userId);
    const paystack = await initializePaystackPayment(
      profile?.email || `${profile?.phone || 'saver'}@packajo.ng`,
      totalAmount,
      'Personal Better Ajo Savings Deposit',
      {
        userId,
        savingsAmount: numAmount,
        transactionFee,
        totalAmount,
        type: 'personal_deposit'
      }
    );

    // Record pending payment in payments / Supabase
    db.createPendingPayment(
      userId,
      paystack.reference,
      Math.round(totalAmount * 100),
      'personal_deposit'
    );

    return res.json({
      success: true,
      paystack: {
        ...paystack,
        breakdown: {
          baseAmount: numAmount,
          baseLabel: 'Savings Amount',
          feeAmount: transactionFee,
          feeLabel: 'Transaction Fee',
          totalAmount
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/personal/deposit/verify', paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, reference, amount } = req.body;
    const numAmount = Number(amount);
    if (!userId || !reference || isNaN(numAmount)) {
      return res.status(400).json({ error: 'userId, reference and amount are required.' });
    }

    const authUserId = (req.headers['x-user-id'] as string);
    if (authUserId && authUserId !== userId) {
      return res.status(403).json({ error: 'Security violation: Cannot verify deposit for another user account.' });
    }

    // Verify payment with Paystack
    const transactionFee = 60;
    const expectedKobo = Math.round((numAmount + transactionFee) * 100);
    const verification = await verifyPaystackPayment(reference, expectedKobo);
    if (!verification.success) {
      return res.status(400).json({ error: verification.message || 'Payment verification failed on server.' });
    }

    // ATOMIC IDEMPOTENT TRANSACTION (onPaymentSuccess):
    // 1. Checks if payment is already processed. If so, skips to prevent double credit.
    // 2. Uses Firestore transaction to update balance, total_deposited, total_saved, payment processed=true.
    const result = await onPaymentSuccess({
      reference,
      amount: numAmount,
      user_id: userId,
      channel: verification.data?.channel || 'card',
      gateway_response: verification.data?.gateway_response || 'Successful',
      paid_at: verification.data?.paid_at || new Date().toISOString(),
      purpose: 'personal_deposit'
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Payment transaction failed' });
    }

    const personal = await getOrCreatePersonalAjo(userId).catch(() => db.getPersonalAjoByUserId(userId));

    // Audit log
    db.recordAudit({
      event_type: 'PERSONAL_DEPOSIT_COMPLETED',
      user_id: userId,
      ip_address: req.ip,
      details: { amount: numAmount, fee: 60, totalPaid: numAmount + 60, reference, newBalance: personal?.balance }
    });

    const finalBalance = Number(personal?.balance ?? 0);
    const finalDeposited = Number(personal?.total_deposited ?? numAmount);
    return res.json({
      success: true,
      alreadyProcessed: result.alreadyProcessed || false,
      newBalance: finalBalance,
      totalDeposited: finalDeposited,
      amount: numAmount,
      fee: 60,
      personalAjo: personal
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Personal Ajo Direct Deposit (Requirement 2 & 4: Flat ₦60 fee, instant reflection)
apiRouter.post(['/personal-ajo/deposit', '/personal-deposit', '/personal/deposit'], paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, amount, reference } = req.body;
    const numAmount = Number(amount);
    if (!userId || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid userId and deposit amount are required.' });
    }

    const fee = 60; // Flat ₦60 deposit fee
    const ref = reference || `pdep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fsDb = getFirestoreDb();

    if (fsDb) {
      // 1. Create contribution document with amount = numAmount, fee = 60, type = 'personal', status = 'credited'
      await fsDb.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS).add({
        user_id: userId,
        amount: numAmount,
        fee,
        type: 'personal',
        status: 'credited',
        reference: ref,
        created_at: new Date().toISOString()
      });

      // 3. Atomically update platformRevenue/main
      await fsDb.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc('main').set({
        stream2: FieldValue.increment(fee),
        totalGross: FieldValue.increment(fee),
        unifiedAvailable: FieldValue.increment(fee),
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      // 4. Update user's personalAjo doc
      const ajoRef = fsDb.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJO).doc(userId);
      const ajoSnap = await ajoRef.get();
      const currentSaved = ajoSnap.exists ? Number(ajoSnap.data()?.total_saved ?? ajoSnap.data()?.balance ?? 0) : 0;
      const currentDep = ajoSnap.exists ? Number(ajoSnap.data()?.total_deposited ?? 0) : 0;
      const newSaved = currentSaved + numAmount;
      const newDep = currentDep + numAmount;

      await ajoRef.set({
        user_id: userId,
        balance: newSaved,
        total_saved: newSaved,
        total_deposited: newDep,
        updated_at: new Date().toISOString()
      }, { merge: true });

      await fsDb.collection(FIRESTORE_COLLECTIONS.PERSONAL_AJOS).doc(userId).set({
        user_id: userId,
        balance: newSaved,
        total_saved: newSaved,
        total_deposited: newDep,
        updated_at: new Date().toISOString()
      }, { merge: true });

      await fsDb.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId).set({
        personalBalance: newSaved,
        balance: newSaved,
        total_saved: newSaved,
        updatedAt: new Date()
      }, { merge: true });
    }

    // In-memory sync
    let personal = db.getPersonalAjoByUserId(userId);
    if (!personal) {
      personal = db.createPersonalAjo(userId);
      personal.balance = numAmount;
      personal.total_deposited = numAmount;
      personal.total_saved = numAmount;
      personal.status = 'active';
      db.save();
    } else {
      personal.balance = Number(personal.balance || 0) + numAmount;
      personal.total_saved = Number(personal.total_saved || 0) + numAmount;
      personal.total_deposited = Number(personal.total_deposited || 0) + numAmount;
      db.save();
    }

    return res.json({
      success: true,
      newBalance: Number(personal.balance),
      totalDeposited: Number(personal.total_deposited),
      totalWithdrawn: Number(personal.total_withdrawn || 0),
      amount: numAmount,
      fee,
      personalAjo: personal
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Platform Stats - Count active users excluding super admin (Requirement 8)
apiRouter.get('/platform-stats', async (req: Request, res: Response) => {
  try {
    const fsDb = getFirestoreDb();
    let totalUsers = 0;
    if (fsDb) {
      const snap = await fsDb.collection(FIRESTORE_COLLECTIONS.USERS).get();
      const uniqueEmails = new Set<string>();
      snap.docs.forEach((d: any) => {
        const u = d.data();
        const role = (u.role || '').toLowerCase();
        const email = (u.email || '').trim().toLowerCase();
        if (role !== 'super_admin' && role !== 'superadmin' && email !== 'superadmin@fundscycle.com' && email !== 'realheavenict@gmail.com' && email !== 'superadmin@packajo.ng') {
          if (email) uniqueEmails.add(email);
          else uniqueEmails.add(d.id);
        }
      });
      totalUsers = uniqueEmails.size;
    } else {
      const uniqueEmails = new Set<string>();
      ((db.data as any).users || db.data.profiles || []).forEach((u: any) => {
        const role = (u.role || '').toLowerCase();
        const email = (u.email || '').trim().toLowerCase();
        if (role !== 'super_admin' && role !== 'superadmin' && email !== 'superadmin@fundscycle.com') {
          if (email) uniqueEmails.add(email);
          else uniqueEmails.add(u.id);
        }
      });
      totalUsers = uniqueEmails.size;
    }
    return res.json({ success: true, totalUsers });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Paystack Webhook Handler
apiRouter.post(['/paystack/webhook', '/webhook'], async (req: Request, res: Response) => {
  try {
    const event = req.body;
    if (!event || event.event !== 'charge.success') {
      return res.status(200).json({ received: true });
    }

    const data = event.data || {};
    const reference = data.reference;
    if (!reference) {
      return res.status(200).json({ received: true });
    }

    // Webhook Idempotency Check: if reference already exists with status SUCCESS / success, return 200 and skip
    const existingPayment = db.getPaymentByReference(reference);
    if (existingPayment && (existingPayment.status === 'success' || (existingPayment.status as string) === 'successful')) {
      console.log(`[Paystack Webhook Idempotency] Skipping duplicate processed payment: ${reference}`);
      return res.status(200).json({ success: true, duplicate: true, message: 'Payment already processed successfully.' });
    }

    const amountKobo = Number(data.amount || 0);
    const amountNaira = amountKobo > 0 ? (amountKobo > 10000000 ? amountKobo / 100 : amountKobo / 100) : 0;
    const metadata = data.metadata || {};
    const userId = metadata.userId || metadata.user_id;

    console.log(`[Paystack Webhook] Received charge.success for ref: ${reference}, amount: ${amountNaira}`);
    const result = await onPaymentSuccess({
      reference,
      amount: amountNaira,
      user_id: userId,
      channel: data.channel || 'card',
      gateway_response: data.gateway_response || 'Successful',
      paid_at: data.paid_at || new Date().toISOString(),
      purpose: 'personal_deposit'
    });

    return res.status(200).json({ success: true, result });
  } catch (err: any) {
    console.error('[Paystack Webhook Error]:', err);
    return res.status(200).json({ error: err.message });
  }
});

const recentPersonalWithdrawalAttempts = new Map<string, number>();

apiRouter.post(['/personal/withdraw', '/personal-withdraw'], paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, amount, password, otp_code, reference } = req.body;
    const numAmount = Number(amount);
    if (!userId || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required.' });
    }

    const authUserId = (req.headers['x-user-id'] as string);
    if (authUserId && authUserId !== userId) {
      return res.status(403).json({ error: 'Security violation: Cannot withdraw from another user account.' });
    }

    const fsDb = getFirestoreDb();

    // Idempotency safeguard (Requirement 7): Only block if exact same reference exists in withdrawals where created_at > now - 5 minutes
    if (reference && fsDb) {
      try {
        const existingW = await fsDb.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS)
          .where('reference', '==', reference)
          .limit(1)
          .get();
        if (!existingW.empty) {
          const wData = existingW.docs[0].data();
          const createdTime = new Date(wData.created_at || wData.createdAt || 0).getTime();
          if (Date.now() - createdTime < 5 * 60 * 1000) {
            return res.status(429).json({
              error: 'A withdrawal request with this reference has already been processed in the last 5 minutes.'
            });
          }
        }
      } catch {}
    }

    // User lookup (Requirement 7): Check users collection by id or uid, then profiles. Auto-create if missing.
    let profile = db.getProfileById(userId);
    if (!profile && fsDb) {
      try {
        const uDoc = await fsDb.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId).get();
        if (uDoc.exists) {
          const u = uDoc.data() || {};
          const nowIso = new Date().toISOString();
          profile = {
            id: userId,
            full_name: u.full_name || u.name || 'Personal Saver',
            phone: u.phone || '',
            account_number: u.account_number || req.body.accountNumber || '',
            bank_name: u.bank_name || req.body.bankName || '',
            password: u.password || '',
            verification_type: 'NIN',
            verification_number: u.phone || '0000000000',
            created_at: nowIso,
            updated_at: nowIso
          };
          db.upsertProfile(profile);
        } else {
          const qSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.USERS).where('uid', '==', userId).limit(1).get();
          if (!qSnap.empty) {
            const u = qSnap.docs[0].data() || {};
            const nowIso = new Date().toISOString();
            profile = {
              id: userId,
              full_name: u.full_name || u.name || 'Personal Saver',
              phone: u.phone || '',
              account_number: u.account_number || req.body.accountNumber || '',
              bank_name: u.bank_name || req.body.bankName || '',
              password: u.password || '',
              verification_type: 'NIN',
              verification_number: u.phone || '0000000000',
              created_at: nowIso,
              updated_at: nowIso
            };
            db.upsertProfile(profile);
          }
        }
      } catch {}
    }

    if (!profile) {
      const nowIso = new Date().toISOString();
      profile = {
        id: userId,
        full_name: 'Personal Saver',
        phone: '',
        account_number: req.body.accountNumber || '0123456789',
        bank_name: req.body.bankName || 'Access Bank',
        password: '',
        verification_type: 'NIN',
        verification_number: '0000000000',
        created_at: nowIso,
        updated_at: nowIso
      };
      db.upsertProfile(profile);
    }

    // Verify Authorization (Password preferred, OTP fallback)
    if (password) {
      if (profile.password && profile.password !== password) {
        return res.status(400).json({ error: 'Incorrect login password. Please enter your valid password to authorize withdrawal.' });
      }
    } else if (otp_code) {
      const isOtpValid = await verifyOtpSafe(profile.phone, otp_code, 'withdrawal');
      if (!isOtpValid) {
        return res.status(400).json({ error: 'Invalid or expired OTP.' });
      }
    } else if (profile.password) {
      return res.status(400).json({ error: 'Your login password is required to authorize this withdrawal.' });
    }

    // 1.6% withdrawal fee calculated ONCE (e.g. 25000 * 0.016 = 400)
    const fee = Math.round(numAmount * 0.016);
    const totalDebit = numAmount + fee;
    const netAmount = numAmount - fee;

    // FIX A - REAL TRANSACTION ATOMIC WITHDRAWAL:
    // Inside runTransaction, check personalAjos total_saved >= amount+fee from Firestore snapshot, if insufficient throw error, else deduct total_saved.
    // Do NOT update UI to SUCCESS before transaction commits.
    const txResult = await fsExecuteWithdrawalTransaction(
      userId,
      numAmount,
      fee,
      netAmount,
      profile.bank_name,
      profile.account_number
    );

    if (!txResult.success || !txResult.personalAjo) {
      return res.status(400).json({
        error: txResult.error || 'Withdrawal could not be processed due to insufficient balance or transaction error.'
      });
    }

    // In-memory sync for consistent state
    const result = {
      personal: txResult.personalAjo,
      withdrawal: {
        id: txResult.withdrawalId || `wth_${Date.now()}`,
        user_id: userId,
        amount: numAmount,
        fee,
        net_amount: netAmount,
        bank_name: profile.bank_name,
        account_number: profile.account_number,
        status: 'success',
        created_at: new Date().toISOString()
      }
    };

    // Audit log
    db.recordAudit({
      event_type: 'PERSONAL_WITHDRAWAL_COMPLETED',
      user_id: userId,
      ip_address: req.ip,
      details: {
        amount: numAmount,
        fee,
        netAmount,
        bank: profile.bank_name,
        account: profile.account_number
      }
    });

    // STEP 2 - Record Personal Ajo 1.6% Withdrawal Fee in Super Admin Revenue Ledger & Firestore
    if (fee > 0) {
      db.recordAdminRevenue({
        type: 'withdrawal_1_6',
        amount: fee,
        reference: result.withdrawal.id,
        group_or_user: profile.full_name || 'Personal Saver',
        user_id: userId,
        gross_amount: numAmount,
        description: `1.6% Personal Withdrawal Processing Fee (Gross: ₦${numAmount.toLocaleString()}, Net: ₦${netAmount.toLocaleString()})`
      });

      fsRecordWithdrawalFeeRevenue(
        userId,
        numAmount,
        fee,
        result.withdrawal.id,
        profile.full_name || ''
      ).catch(err => console.warn('[Firestore Revenue Warn]:', err?.message || err));
    }

    const transferResult = await initiatePaystackTransfer(
      profile.account_number,
      profile.bank_name,
      profile.full_name,
      netAmount,
      `Better Ajo Personal Savings Payout to ${profile.full_name}`,
      result.withdrawal.id
    );

    const newBal = Number(result.personal?.balance ?? result.personal?.total_saved ?? 0);
    return res.json({
      success: true,
      message: transferResult.message || `₦${netAmount.toLocaleString()} has been sent to ${profile.bank_name} (${profile.account_number})`,
      newBalance: newBal,
      amount: numAmount,
      fee,
      netAmount,
      personalAjo: result.personal,
      withdrawal: result.withdrawal
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/platform/stats', async (_req: Request, res: Response) => {
  try {
    const stats = (await fsGetPlatformStats()) || (await aggregatePersonalAjoSavings());
    return res.json({ success: true, stats });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/personal/payments/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const personalTxs = db.getPersonalTransactions(userId);
    const payments: any[] = [];

    for (const tx of personalTxs) {
      payments.push({
        id: tx.id,
        user_id: tx.user_id,
        type: tx.type,
        category: tx.category,
        amount: Math.abs(tx.amount),
        direction: tx.direction,
        reference: tx.reference,
        status: tx.status.toLowerCase(),
        display_title: tx.display_title,
        purpose: tx.type === 'DEPOSIT' ? 'personal_deposit' : tx.type === 'PLATFORM_FEE' ? 'personal_registration' : 'personal_withdrawal',
        created_at: tx.created_at,
        paid_at: tx.paid_at || tx.created_at
      });
    }

    // Also include Firestore payments if available
    const fDb = getFirestoreDb();
    if (fDb) {
      try {
        const snap = await fDb.collection(FIRESTORE_COLLECTIONS.PAYMENTS)
          .where('user_id', '==', userId)
          .get();
        snap.forEach(doc => {
          const d = doc.data();
          const ref = d.reference || doc.id;
          if (!payments.some(p => p.reference === ref || p.id === doc.id)) {
            payments.push({ id: doc.id, ...d });
          }
        });
      } catch (err) {
        console.warn('Firestore personal payments query warn:', err);
      }
    }

    const deduped: any[] = [];
    const seenRefs = new Set<string>();
    let seenRegistrationFee = false;
    for (const p of payments) {
      const isReg = p.type === 'PLATFORM_FEE' || p.purpose === 'personal_registration' || (p.amount === 600 && p.category === 'ACTIVATION_FEE');
      if (isReg) {
        if (seenRegistrationFee) continue; // Fee must appear ONCE in history!
        seenRegistrationFee = true;
      }
      const refKey = p.reference || p.id;
      if (!seenRefs.has(refKey)) {
        seenRefs.add(refKey);
        deduped.push(p);
      }
    }

    deduped.sort((a, b) => new Date(b.created_at || b.paid_at || 0).getTime() - new Date(a.created_at || a.paid_at || 0).getTime());
    return res.json({ success: true, payments: deduped });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// GROUP PACK AJO ROUTES
// ----------------------------------------------------

const VALID_CYCLES = [
  'Daily',
  'Every Day',
  'Every 3 Days',
  'Every 4 Days',
  'Every 5 Days',
  'Every 7 Days',
  'Every 14 Days',
  'Every Month'
];

apiRouter.post('/groups/create', async (req: Request, res: Response) => {
  try {
    const {
      admin_id,
      admin_name,
      group_name,
      member_limit,
      contribution_amount,
      cycle_type,
      packing_fee,
      whatsapp_number,
      whatsappNumber,
      members
    } = req.body;

    const waNumber = whatsapp_number || whatsappNumber;

    if (!admin_id || !admin_name || !group_name || !member_limit || !contribution_amount || !cycle_type) {
      return res.status(400).json({ error: 'All group creation fields are required.' });
    }

    const limit = Number(member_limit);
    if (isNaN(limit) || limit < 2 || limit > 50) {
      return res.status(400).json({ error: 'Number of contributors must be strictly between 2 and 50.' });
    }

    const contrib = Number(contribution_amount);
    if (isNaN(contrib) || contrib < 100 || contrib > 100000) {
      return res.status(400).json({ error: 'Contribution amount must be between ₦100 and ₦100,000.' });
    }

    const totalPacking = contrib * limit;
    const fee = packing_fee !== undefined && packing_fee !== null ? Number(packing_fee) : 3000;
    if (isNaN(fee) || fee < 0) {
      return res.status(400).json({ error: 'Packing fee / deduction cannot be negative.' });
    }
    if (fee >= totalPacking) {
      return res.status(400).json({ error: 'Packing fee / deduction cannot exceed the total packing amount.' });
    }

    if (!VALID_CYCLES.includes(cycle_type)) {
      return res.status(400).json({
        error: `Cycle must be one of: ${VALID_CYCLES.join(', ')}`
      });
    }

    // Validate members list if provided
    if (members !== undefined && members !== null) {
      if (!Array.isArray(members) || members.length !== limit) {
        return res.status(400).json({
          error: `Exactly ${limit} member details are required. Received ${Array.isArray(members) ? members.length : 0}.`
        });
      }

      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        if (!m || !m.full_name || m.full_name.trim().length < 2) {
          return res.status(400).json({ error: `Member ${i + 1}: Full Name is required.` });
        }
        const cleanP = normalizeNigerianPhone(m.phone || '');
        if (!cleanP || cleanP.length !== 11) {
          return res.status(400).json({ error: `Member ${i + 1} (${m.full_name}): Valid 11-digit phone number is required.` });
        }
        const cleanAcc = (m.account_number || '').toString().replace(/\D/g, '');
        if (cleanAcc.length !== 10) {
          return res.status(400).json({ error: `Member ${i + 1} (${m.full_name}): Valid 10-digit bank account number is required.` });
        }
      }
    }

    const result = db.createGroup({
      admin_id,
      admin_name: admin_name.trim(),
      group_name: group_name.trim(),
      member_limit: limit,
      contribution_amount: contrib,
      cycle_type,
      packing_fee: fee,
      whatsapp_number: waNumber,
      whatsappNumber: waNumber
    });

    if (waNumber && result.adminProfile) {
      result.adminProfile.whatsapp_number = waNumber;
      result.adminProfile.whatsappNumber = waNumber;
      db.save();
    }

    // If bulk members provided, create them in strict packing order 1..limit
    // Exclude group admin so admin is NEVER a contributor/member
    const adminUser = db.getProfileById(admin_id);
    const adminEmail = adminUser?.email;
    const adminPhone = (adminUser?.phone || result.adminProfile?.phone) ? normalizeNigerianPhone(adminUser?.phone || result.adminProfile?.phone || '') : '';

    const membersOnly = (Array.isArray(members) ? members : []).filter((m: any) => {
      const cleanP = normalizeNigerianPhone(m.phone || '');
      return (m as any).userId !== admin_id &&
             m.user_id !== admin_id &&
             (adminEmail ? (m as any).email !== adminEmail : true) &&
             (adminPhone ? cleanP !== adminPhone : true);
    });

    const createdMembers: GroupMember[] = [];
    if (membersOnly.length > 0) {
      for (let i = 0; i < membersOnly.length; i++) {
        const m = membersOnly[i];
        const packingPosition = i + 1;
        const cleanPhone = normalizeNigerianPhone(m.phone);
        const cleanAcc = m.account_number.toString().replace(/\D/g, '');
        const bankName = (m.bank_name || 'Moniepoint MFB').trim();
        const memId = `mem_${Date.now()}_${packingPosition}_${Math.random().toString(36).substring(2, 6)}`;

        let profile = db.getProfileByPhone(cleanPhone);
        if (!profile) {
          profile = db.upsertProfile({
            full_name: m.full_name.trim(),
            phone: cleanPhone,
            bank_name: bankName,
            account_number: cleanAcc,
            verification_type: 'BVN',
            verification_number: '12345678901',
            role: 'MEMBER'
          });
        } else {
          if (bankName) profile.bank_name = bankName;
          if (cleanAcc) profile.account_number = cleanAcc;
          db.save();
        }

        // Generate Moniepoint Virtual Account named BETTERAJO-[FULL NAME]
        let vaDetails;
        try {
          vaDetails = await generateGroupMemberVirtualAccount(result.group.id, memId, m.full_name.trim(), cleanPhone);
        } catch {
          vaDetails = {
            account_name: formatGroupMemberAccountName(m.full_name.trim()),
            account_number: generateMoniepointAccountNumber(`group_${result.group.id}_${packingPosition}_${m.full_name}_${cleanPhone}`)
          };
        }

        const groupMember: GroupMember = {
          id: memId,
          group_id: result.group.id,
          user_id: profile.id,
          full_name: m.full_name.trim(),
          phone: cleanPhone,
          whatsapp_number: cleanPhone,
          whatsappNumber: cleanPhone,
          bank_name: bankName,
          account_number: cleanAcc,
          position: packingPosition,
          packing_position: packingPosition,
          status: 'active',
          current_round_status: 'pending_contribution',
          virtual_account_name: vaDetails.account_name || formatGroupMemberAccountName(m.full_name.trim()),
          virtual_account_number: vaDetails.account_number || generateMoniepointAccountNumber(`group_${result.group.id}_${packingPosition}_${m.full_name}_${cleanPhone}`),
          credit_balance: 0,
          payment_type: 'bank_transfer',
          joined_at: new Date().toISOString()
        };

        db.data.group_members.push(groupMember);

        // Create initial pending contribution for round 1
        db.data.contributions.push({
          id: `cnt_${Date.now()}_${groupMember.id}`,
          group_id: result.group.id,
          member_id: groupMember.id,
          user_id: profile.id,
          round_number: result.group.current_round,
          amount: result.group.contribution_amount,
          virtual_account_name: groupMember.virtual_account_name,
          virtual_account_number: groupMember.virtual_account_number,
          credit_balance: 0,
          payment_type: 'bank_transfer',
          status: 'Pending'
        });

        createdMembers.push(groupMember);

        syncGroupMemberToSupabase(groupMember).catch(() => {});
        fsUpsertGroupMember(groupMember).catch(() => {});
      }

      // Group is fully recruited and ready
      result.group.status = 'active';
      db.save();
    }

    // Initialize group commission balance fields
    (result.group as any).availableBalance = 0;
    (result.group as any).commissionBalance = 0;
    (result.group as any).withdrawableBalance = 0;
    (result.group as any).totalEarnings = 0;
    (result.group as any).admin_commission_balance = 0;
    (result.group as any).groupAdminRevenue = 0;
    (result.group as any).groupAdminWithdrawn = 0;

    // FEE SPLIT LOGIC: ₦3,000 Group Creation Platform Fee:
    // - Super Admin: ₦1,000 immediately in Available Balance
    // - Platform Reserve: ₦2,000
    // - Total Fee: ₦3,000
    // - Recorded to transactions, admin_revenue_ledger, platformRevenue, superAdminEarnings
    const groupCreationFee = 3000;
    const superAdminShare = 1000;
    const platformShare = 2000;

    db.recordAdminRevenue({
      type: 'group_creation_1000',
      amount: superAdminShare,
      reference: `grp_fee_${result.group.id}`,
      group_or_user: `Group: ${result.group.group_name}`,
      group_id: result.group.id,
      gross_amount: groupCreationFee,
      description: `Group Creation Platform Fee for ${result.group.group_name} (₦1,000 Super Admin + ₦2,000 Platform)`
    });

    if (db.data.super_admin_wallet) {
      db.data.super_admin_wallet.available_balance = (db.data.super_admin_wallet.available_balance || 0) + superAdminShare;
      db.data.super_admin_wallet.total_gross_earnings = (db.data.super_admin_wallet.total_gross_earnings || 0) + superAdminShare;
      if (db.data.super_admin_wallet.breakdown) {
        db.data.super_admin_wallet.breakdown.reg_600_total = (db.data.super_admin_wallet.breakdown.reg_600_total || 0) + superAdminShare;
      }
    }
    if (db.data.superAdminEarnings) {
      db.data.superAdminEarnings.available_balance = (db.data.superAdminEarnings.available_balance || 0) + superAdminShare;
      db.data.superAdminEarnings.totalEarnings = (db.data.superAdminEarnings.totalEarnings || 0) + superAdminShare;
    }
    db.save();

    await fsRecordGroupCreationFee(
      result.group.id,
      result.group.group_name,
      admin_id,
      admin_name,
      groupCreationFee,
      superAdminShare,
      platformShare
    ).catch(err => console.warn('[Firestore Group Creation Fee Warn]:', err?.message || err));

    (result.group as any).members = createdMembers;
    await Promise.all(createdMembers.map(m => fsUpsertGroupMember(m))).catch(err => console.warn('[fsUpsertGroupMember batch warn]:', err));
    await syncGroupToSupabase(result.group).catch(() => {});
    await fsUpsertGroup(result.group).catch(() => {});
    if (result.adminProfile) {
      await syncProfileToSupabase(result.adminProfile).catch(() => {});
      await fsUpsertProfile(result.adminProfile).catch(() => {});
    }

    const adminProfile = db.getProfileById(admin_id);

    return res.json({
      success: true,
      group: result.group,
      adminProfile,
      members: createdMembers
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Update Group Member Details (Group Admin can edit member later if needed)
apiRouter.put('/groups/:groupId/members/:memberId', async (req: Request, res: Response) => {
  try {
    const { groupId, memberId } = req.params;
    const { full_name, phone, account_number, bank_name } = req.body;
    const authUserId = (req.headers['x-user-id'] as string) || req.body.admin_id;

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (authUserId && group.admin_id !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Only the group admin can update member details.' });
    }

    const member = db.data.group_members.find(m => m.id === memberId && m.group_id === groupId);
    if (!member) return res.status(404).json({ error: 'Member not found in this group.' });

    if (full_name && full_name.trim().length >= 2) {
      member.full_name = full_name.trim();
      member.virtual_account_name = formatGroupMemberAccountName(full_name.trim());
    }
    if (phone) {
      const cleanPhone = normalizeNigerianPhone(phone);
      if (cleanPhone && cleanPhone.length === 11) {
        member.phone = cleanPhone;
        member.whatsapp_number = cleanPhone;
        member.whatsappNumber = cleanPhone;
      }
    }
    if (account_number) {
      const cleanAcc = account_number.toString().replace(/\D/g, '');
      if (cleanAcc.length === 10) {
        member.account_number = cleanAcc;
      }
    }
    if (bank_name && bank_name.trim()) {
      member.bank_name = bank_name.trim();
    }

    // Also update associated profile if exists
    const profile = db.getProfileById(member.user_id);
    if (profile) {
      if (member.full_name) profile.full_name = member.full_name;
      if (member.phone) profile.phone = member.phone;
      if (member.bank_name) profile.bank_name = member.bank_name;
      if (member.account_number) profile.account_number = member.account_number;
    }

    // Update pending contribution virtual account name if any
    const pendingContrib = db.data.contributions.find(c => c.member_id === member.id && c.status === 'Pending');
    if (pendingContrib) {
      pendingContrib.virtual_account_name = member.virtual_account_name;
    }

    db.save();
    syncGroupMemberToSupabase(member).catch(() => {});
    fsUpsertGroupMember(member).catch(() => {});

    return res.json({
      success: true,
      message: 'Member details updated successfully.',
      member
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to update member' });
  }
});

apiRouter.patch('/groups/:groupId/packing-fee', (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { packing_fee, admin_id } = req.body;

    const group = db.getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (admin_id && group.admin_id !== admin_id) {
      return res.status(403).json({ error: 'Only the Group Admin can change the packing fee.' });
    }

    const fee = Number(packing_fee);
    if (isNaN(fee) || fee < 0) {
      return res.status(400).json({ error: 'Packing fee / deduction cannot be negative.' });
    }
    if (fee >= group.packing_amount) {
      return res.status(400).json({ error: 'Packing fee cannot exceed or equal the total packing amount.' });
    }

    const updated = db.updateGroupPackingFee(groupId, fee);
    return res.json({ success: true, group: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/groups/lookup/:codeOrId', async (req: Request, res: Response) => {
  try {
    const { codeOrId } = req.params;
    let group = db.getGroupByCode(codeOrId);
    if (!group) {
      group = db.getGroupById(codeOrId);
    }
    if (!group) {
      try {
        const fsGroup = (await fsGetGroupByCode(codeOrId)) || (await fsGetGroupById(codeOrId));
        if (fsGroup) {
          db.syncRemoteGroup(fsGroup);
          group = fsGroup;
        }
      } catch (err) {
        console.warn('Direct Firestore group lookup error in lookup:', err);
      }
    }
    if (!group) {
      try {
        const remote = await fetchGroupByCodeFromSupabase(codeOrId) || await fetchGroupByIdFromSupabase(codeOrId);
        if (remote) {
          db.syncRemoteGroup(remote);
          group = remote;
        }
      } catch (err) {
        console.warn('Direct Supabase group lookup error in lookup:', err);
      }
    }
    if (!group) {
      return res.status(404).json({ error: 'Better Ajo group not found.' });
    }

    const members = db.getGroupMembers(group.id);
    const availableSlots = Math.max(0, group.member_limit - members.length);
    const isFull = availableSlots === 0;

    return res.json({
      group,
      totalMembers: members.length,
      availableSlots,
      isFull
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/groups/join', async (req: Request, res: Response) => {
  try {
    const {
      group_code,
      full_name,
      phone,
      bank_name,
      account_number,
      verification_type,
      verification_number,
      email,
      password,
      otp_code,
      whatsapp_number,
      whatsappNumber
    } = req.body;

    const waNumber = (whatsapp_number || whatsappNumber || phone || '').trim();

    if (!group_code || !full_name || (!phone && !email) || !bank_name || !account_number || !verification_type || !verification_number) {
      return res.status(400).json({ error: 'All required fields must be provided.' });
    }

    const group = db.getGroupByCode(group_code) || db.getGroupById(group_code);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    const activeMembers = db.getGroupMembers(group.id);
    if (activeMembers.length >= group.member_limit) {
      return res.status(400).json({ error: 'This Better Ajo group is currently full.' });
    }

    const cleanPhone = phone
      ? phone.replace(/\s+/g, '').replace(/^\+234/, '0')
      : (email ? '080' + Math.abs(email.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 10000000)).toString().slice(0, 8) : '08012345678');

    // Verify OTP if provided
    if (otp_code) {
      const valid = await verifyOtpSafe(cleanPhone, otp_code, 'join_group');
      if (!valid) {
        return res.status(400).json({ error: 'Invalid or expired OTP.' });
      }
    }

    // Save profile (no ₦600 fee for group members!)
    const profile = db.upsertProfile({
      full_name: full_name.trim(),
      phone: cleanPhone,
      whatsapp_number: waNumber || cleanPhone,
      whatsappNumber: waNumber || cleanPhone,
      bank_name: bank_name.trim(),
      account_number: account_number.trim(),
      verification_type,
      verification_number: verification_number.trim(),
      email: email ? email.trim() : undefined,
      password: password || undefined
    });

    const member = db.joinGroup(group.id, profile);

    return res.json({
      success: true,
      message: `Successfully joined ${group.group_name}! You have been assigned Position ${member.position}.`,
      group,
      member,
      profile
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Group Admin direct member addition with auto-generated Moniepoint Virtual Account
apiRouter.post('/groups/:groupId/members/add', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { full_name, phone, account_number, bank_name } = req.body;
    const authUserId = (req.headers['x-user-id'] as string) || req.body.admin_id;

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (authUserId && group.admin_id !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Only the group admin can add members directly.' });
    }

    if (!full_name || !phone || !account_number) {
      return res.status(400).json({ error: 'Full name, phone number, and bank account number are required.' });
    }

    const member = db.addMemberByGroupAdmin(groupId, {
      full_name: full_name.trim(),
      phone: phone.trim(),
      account_number: account_number.trim(),
      bank_name: (bank_name || 'Moniepoint MFB').trim()
    });

    return res.json({
      success: true,
      message: `Member ${member.full_name} added successfully! Assigned Position ${member.position}. Virtual account ${member.virtual_account_name} (${member.virtual_account_number}) created.`,
      member
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to add member' });
  }
});

// Universal Virtual Account Transfer Webhook / Simulation API
// Accepts transfers from Nigerian bank apps into Personal or Group Virtual Accounts
apiRouter.post(['/virtual-account/transfer', '/moniepoint/webhook'], async (req: Request, res: Response) => {
  try {
    const { account_number, amount, reference, sender_name } = req.body;
    const simulatedDate = (req.headers['x-simulated-date'] as string) || (req.body.simulatedDate as string);

    if (!account_number || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid virtual account number and positive amount are required.' });
    }

    const cleanAcc = account_number.trim();
    const transferAmount = Math.round(Number(amount));
    const effectiveRef = reference || `VA_TRF_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Idempotency check: if reference already succeeded, return 200 immediately
    if (reference) {
      const existingPay = db.getPaymentByReference(reference);
      if (existingPay && (existingPay.status === 'success' || (existingPay.status as string) === 'successful')) {
        console.log(`[VA Webhook Idempotency] Skipping duplicate processed reference: ${reference}`);
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'Transfer already processed successfully.',
          reference
        });
      }
    }

    // 1. Check if recipient is a Personal Ajo user
    const userProfile = db.getProfileByVirtualAccount(cleanAcc);
    const personalAjo = userProfile
      ? db.getPersonalAjoByUserId(userProfile.id)
      : db.getPersonalAjoByVirtualAccount(cleanAcc);

    if (userProfile || personalAjo) {
      const targetUserId = userProfile ? userProfile.id : personalAjo!.user_id;

      // Better Ajo Addition Model:
      // User savings amount (e.g. 5000) is credited IN FULL to user savings.
      // Platform fee (₦60) is ADDED on top, total = 5060.
      // Super Admin receives ₦60 platform fee in Firebase platformRevenue/main.
      const savingsAmount = Number(req.body.savings_amount) || transferAmount;
      const platformFee = 60;
      const totalAmount = savingsAmount + platformFee;

      // 1. Atomically process in Firestore:
      // - Creates ONE transaction in 'transactions' with status: 'success', fee: 60, total_amount: totalAmount
      // - Credits savingsAmount to personalAjos and personal_ajo (balance, total_saved)
      // - Credits ₦60 to platformRevenue/main (stream2, totalGross, unifiedAvailable)
      await onPaymentSuccess({
        reference: effectiveRef,
        amount: savingsAmount,
        user_id: targetUserId,
        channel: 'virtual_account',
        gateway_response: 'Successful (Moniepoint Virtual Account)',
        paid_at: new Date().toISOString(),
        purpose: 'personal_deposit'
      });

      // 2. Synchronize local in-memory DB
      db.createPersonalDepositTransaction(targetUserId, savingsAmount, effectiveRef, 'SUCCESS');
      db.recordAdminRevenue({
        type: 'contribution_60',
        amount: platformFee,
        reference: effectiveRef,
        group_or_user: userProfile?.full_name || 'Personal Saver',
        user_id: targetUserId,
        gross_amount: savingsAmount,
        description: `₦60 Personal Ajo Deposit Processing Fee (${userProfile?.full_name || 'Personal Saver'})`
      });

      let paymentRec = db.getPaymentByReference(effectiveRef);
      if (!paymentRec) {
        paymentRec = db.createPendingPayment(
          targetUserId,
          effectiveRef,
          totalAmount * 100,
          'personal_deposit'
        );
      }
      paymentRec.status = 'success';
      paymentRec.virtual_account_number = cleanAcc;
      paymentRec.payment_type = 'virtual_account';
      db.save();

      const updatedPersonal = await getOrCreatePersonalAjo(targetUserId).catch(() => db.getPersonalAjoByUserId(targetUserId));

      return res.json({
        success: true,
        type: 'personal',
        message: `₦${savingsAmount.toLocaleString()} received via Moniepoint Virtual Account ${cleanAcc}! Credited in full to Personal Better Ajo savings. ₦60 platform fee credited to Super Admin wallet.`,
        personalAjo: updatedPersonal,
        amount: savingsAmount,
        savings_amount: savingsAmount,
        fee: platformFee,
        total: totalAmount,
        reference: effectiveRef
      });
    }

    // 2. Check if recipient is a Group Ajo member
    const groupMember = db.getGroupMemberByVirtualAccount(cleanAcc);
    if (groupMember) {
      const result = db.processContributionPayment(
        groupMember.group_id,
        groupMember.id,
        transferAmount,
        'virtual_account',
        effectiveRef,
        simulatedDate,
        groupMember.user_id
      );

      return res.json({
        success: true,
        type: 'group_contribution',
        ...result,
        message: result.isPaid
          ? (result.isPaidAhead
              ? `Contribution of ₦${transferAmount.toLocaleString()} verified and marked PAID AHEAD via Moniepoint Virtual Account!`
              : `Contribution of ₦${transferAmount.toLocaleString()} verified and marked PAID via Moniepoint Virtual Account!`)
          : `Partial payment of ₦${transferAmount.toLocaleString()} credited to Credit Wallet. Remaining ₦${result.remainingRequired.toLocaleString()} required to complete cycle.`
      });
    }

    return res.status(404).json({
      error: `No Better Ajo account found for Moniepoint virtual account number ${cleanAcc}.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Transfer processing failed' });
  }
});

// Dedicated Member Test Payment Simulator Route
// Supports Part Payment, Overpay Credit, and Pay Ahead
apiRouter.post('/groups/:groupId/members/:memberId/simulate-payment', async (req: Request, res: Response) => {
  try {
    const { groupId, memberId } = req.params;
    const { amount } = req.body;
    const authUserId = (req.headers['x-user-id'] as string) || req.body.admin_id;

    let group = db.getGroupById(groupId);
    if (!group) {
      try {
        const fsGroup = await fsGetGroupById(groupId);
        if (fsGroup) {
          db.syncRemoteGroup(fsGroup);
          group = fsGroup;
        }
      } catch {}
    }
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (authUserId && group.admin_id !== authUserId) {
      return res.status(403).json({ error: 'Only the group admin can simulate member payments.' });
    }

    await syncGroupFinancialsFromFirestore(groupId);

    const member = db.data.group_members.find(m => m.id === memberId && (m.group_id === groupId || (m as any).groupId === groupId));
    if (!member) return res.status(404).json({ error: 'Member not found in this group.' });

    const numAmount = Number(amount) || group.contribution_amount;
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required.' });
    }

    const currentRound = group.current_round;
    const nextRound = currentRound + 1;
    const required = group.contribution_amount;

    // Check existing contributions for currentRound (excluding pay-aheads for future rounds)
    const existingContribs = db.data.contributions.filter(
      c => (c.group_id === groupId || (c as any).groupId === groupId) &&
           (c.member_id === memberId || (c as any).memberId === memberId) &&
           (c.round_number === currentRound || (c as any).round === currentRound) &&
           !c.is_pay_ahead && !(c as any).isPayAhead
    );
    const paidForRound = existingContribs.reduce((s, c) => s + Number(c.amount || 0), 0);
    const currentCredit = Number(member.credit_balance || (member as any).creditBalance || 0);
    const totalEffectivePaid = paidForRound + currentCredit;

    const ref = `SIM_PAY_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const nowIso = new Date().toISOString();
    let toastMessage = '';

    // Save payment record in central payments
    const paymentRec = db.createPendingPayment(
      member.user_id,
      ref,
      numAmount * 100,
      'group_contribution'
    );
    paymentRec.status = 'success';
    paymentRec.virtual_account_number = member.virtual_account_number;
    paymentRec.virtual_account_name = member.virtual_account_name;
    paymentRec.payment_type = 'simulation';

    const memberName = member.full_name || (member as any).name || 'Member';
    const groupName = group.group_name || 'Ajo Group';

    // Helper to log platform fee to platform_transactions in Firestore
    const recordPlatformFee = () => {
      try {
        const fsDb = getFirestoreDb();
        if (fsDb) {
          fsDb.collection('platform_transactions').add({
            type: 'platform_fee',
            amount: 60,
            gross_amount: 60,
            groupId: groupId,
            group_id: groupId,
            memberId: member.id,
            member_id: member.id,
            memberName,
            userName: memberName,
            groupName,
            ajoName: groupName,
            round: currentRound,
            source: 'group_contribution',
            status: 'success',
            createdAt: FieldValue.serverTimestamp()
          }).catch(() => {});
        }
      } catch {}
    };

    // 1. If member already fully paid for currentRound: This is PAY AHEAD for next round
    if (totalEffectivePaid >= required) {
      const newCreditBalance = currentCredit + numAmount;
      member.credit_balance = newCreditBalance;
      (member as any).creditBalance = newCreditBalance;
      (member as any).payAheadForRound = nextRound;
      (member as any).is_pay_ahead = true;
      (member as any).isPayAhead = true;

      const payAheadContrib: Contribution = {
        id: `cnt_${Date.now()}_${member.id}_r${nextRound}`,
        group_id: groupId,
        groupId: groupId,
        member_id: member.id,
        memberId: member.id,
        user_id: member.user_id,
        round_number: nextRound,
        round: nextRound,
        amount: numAmount,
        fee: 60,
        total: numAmount + 60,
        memberName,
        userName: memberName,
        groupName,
        ajoName: groupName,
        status: 'Paid',
        reference: ref,
        paid_at: nowIso,
        created_at: nowIso,
        is_pay_ahead: true,
        isPayAhead: true,
        isCredit: true,
        type: 'group_contribution',
        creditNote: `Pay Ahead R${nextRound}`,
        note: `Pay Ahead - Already paid for Round ${currentRound}`,
        payment_type: 'simulation'
      };

      db.data.contributions.push(payAheadContrib);
      db.save();

      fsUpsertContribution(payAheadContrib).catch(() => {});
      fsUpsertGroupMember(member).catch(() => {});
      fsUpsertPayment(paymentRec).catch(() => {});
      recordPlatformFee();

      toastMessage = `Credited ₦${numAmount.toLocaleString()} as Pay Ahead for Round ${nextRound}`;

      return res.json({
        success: true,
        message: toastMessage,
        type: 'pay_ahead',
        creditBalance: newCreditBalance,
        isPayAhead: true,
        isFullyPaid: true,
        member
      });
    }

    // 2. Member has NOT yet fully paid currentRound
    const remaining = Math.max(0, required - totalEffectivePaid);

    if (numAmount < remaining) {
      // Part payment
      const newRemaining = remaining - numAmount;
      const partContrib: Contribution = {
        id: `cnt_${Date.now()}_${member.id}_r${currentRound}`,
        group_id: groupId,
        groupId: groupId,
        member_id: member.id,
        memberId: member.id,
        user_id: member.user_id,
        round_number: currentRound,
        round: currentRound,
        amount: numAmount,
        fee: 60,
        total: numAmount + 60,
        memberName,
        userName: memberName,
        groupName,
        ajoName: groupName,
        status: 'Partial',
        reference: ref,
        paid_at: nowIso,
        created_at: nowIso,
        type: 'group_contribution',
        payment_type: 'simulation'
      };

      db.data.contributions.push(partContrib);
      member.current_round_status = 'pending_contribution';
      (member as any).hasContributed = false;
      db.save();

      fsUpsertContribution(partContrib).catch(() => {});
      fsUpsertGroupMember(member).catch(() => {});
      fsUpsertPayment(paymentRec).catch(() => {});
      recordPlatformFee();

      toastMessage = `Part Payment ₦${numAmount.toLocaleString()} received, Remaining ₦${newRemaining.toLocaleString()}`;

      return res.json({
        success: true,
        message: toastMessage,
        type: 'part_payment',
        remaining: newRemaining,
        isFullyPaid: false,
        member
      });
    } else if (numAmount > remaining) {
      // Overpay: remaining goes to current round, extra goes to next round credit
      const overpay = numAmount - remaining;
      const paidContrib: Contribution = {
        id: `cnt_${Date.now()}_${member.id}_r${currentRound}`,
        group_id: groupId,
        groupId: groupId,
        member_id: member.id,
        memberId: member.id,
        user_id: member.user_id,
        round_number: currentRound,
        round: currentRound,
        amount: remaining,
        fee: 60,
        total: remaining + 60,
        memberName,
        userName: memberName,
        groupName,
        ajoName: groupName,
        status: 'Paid',
        reference: ref,
        paid_at: nowIso,
        created_at: nowIso,
        type: 'group_contribution',
        payment_type: 'simulation'
      };
      db.data.contributions.push(paidContrib);

      const nextRoundCredit: Contribution = {
        id: `cnt_${Date.now()}_${member.id}_r${nextRound}_overpay`,
        group_id: groupId,
        groupId: groupId,
        member_id: member.id,
        memberId: member.id,
        user_id: member.user_id,
        round_number: nextRound,
        round: nextRound,
        amount: overpay,
        fee: 0,
        total: overpay,
        memberName,
        userName: memberName,
        groupName,
        ajoName: groupName,
        status: 'Paid',
        reference: `${ref}_credit`,
        paid_at: nowIso,
        created_at: nowIso,
        is_pay_ahead: true,
        isPayAhead: true,
        isCredit: true,
        type: 'group_contribution',
        creditNote: `Overpay credit from Round ${currentRound}`,
        note: `Overpay credit from Round ${currentRound}`,
        payment_type: 'simulation'
      };
      db.data.contributions.push(nextRoundCredit);

      const newCreditBalance = currentCredit + overpay;
      member.credit_balance = newCreditBalance;
      (member as any).creditBalance = newCreditBalance;
      (member as any).payAheadForRound = nextRound;
      (member as any).is_pay_ahead = true;
      (member as any).isPayAhead = true;
      (member as any).hasContributed = true;
      member.current_round_status = 'contributed';
      db.save();

      fsUpsertContribution(paidContrib).catch(() => {});
      fsUpsertContribution(nextRoundCredit).catch(() => {});
      fsUpsertGroupMember(member).catch(() => {});
      fsUpsertPayment(paymentRec).catch(() => {});
      recordPlatformFee();

      toastMessage = `Paid ₦${remaining.toLocaleString()} for today, Credited ₦${overpay.toLocaleString()} for tomorrow`;

      return res.json({
        success: true,
        message: toastMessage,
        type: 'overpay',
        creditBalance: newCreditBalance,
        isFullyPaid: true,
        isPayAhead: true,
        member
      });
    } else {
      // Exact payment: amount === remaining
      const paidContrib: Contribution = {
        id: `cnt_${Date.now()}_${member.id}_r${currentRound}`,
        group_id: groupId,
        groupId: groupId,
        member_id: member.id,
        memberId: member.id,
        user_id: member.user_id,
        round_number: currentRound,
        round: currentRound,
        amount: remaining,
        fee: 60,
        total: remaining + 60,
        memberName,
        userName: memberName,
        groupName,
        ajoName: groupName,
        status: 'Paid',
        reference: ref,
        paid_at: nowIso,
        created_at: nowIso,
        type: 'group_contribution',
        payment_type: 'simulation'
      };
      db.data.contributions.push(paidContrib);

      (member as any).hasContributed = true;
      member.current_round_status = 'contributed';
      db.save();

      fsUpsertContribution(paidContrib).catch(() => {});
      fsUpsertGroupMember(member).catch(() => {});
      fsUpsertPayment(paymentRec).catch(() => {});
      recordPlatformFee();

      toastMessage = `Contribution of ₦${remaining.toLocaleString()} completed for Round ${currentRound}!`;

      return res.json({
        success: true,
        message: toastMessage,
        type: 'full_payment',
        isFullyPaid: true,
        member
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Payment simulation failed' });
  }
});

// Scheduled Disbursement Evaluation Route
apiRouter.post('/groups/:groupId/check-disbursement', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const simulatedDate = (req.headers['x-simulated-date'] as string) || (req.body.simulatedDate as string);

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const cycleInfo = db.getGroupCycleInfo(groupId, group.current_round, simulatedDate);
    const cycleStatus = db.getCycleContributionStatus(groupId, group.current_round, simulatedDate);

    // Condition 1: Cycle duration has reached (todayDate >= scheduledPackDate)
    const isDurationReached = cycleInfo.isCycleOpen;
    // Condition 2: All members have completed payment
    const allMembersPaid = cycleStatus.allPaid;

    if (isDurationReached && allMembersPaid) {
      const currentPacker = db.getCurrentPacker(groupId, group.current_round);
      if (currentPacker && !db.isMemberPacked(groupId, currentPacker.id, group.current_round) && !cycleInfo.hasPackedToday) {
        const packResult = db.executePack(groupId, currentPacker.id, group.current_round, simulatedDate);
        fsExecutePackBatch(packResult.transaction, packResult.commission, currentPacker, group).catch(() => {});
        return res.json({
          disbursed: true,
          scheduledPackDate: cycleInfo.scheduledPackDate,
          packer: currentPacker,
          transaction: packResult.transaction,
          message: `Scheduled disbursement executed! ₦${packResult.transaction.member_amount.toLocaleString()} paid out to ${currentPacker.full_name}.`
        });
      }
    }

    if (isDurationReached && !allMembersPaid) {
      return res.json({
        disbursed: false,
        isPaused: true,
        unpaidCount: cycleStatus.unpaidMemberIds.length,
        message: 'Rotation paused: Cycle due date reached, but waiting for all members to complete contributions before packing proceeds.'
      });
    }

    if (!isDurationReached && allMembersPaid) {
      return res.json({
        disbursed: false,
        isEarlyWaiting: true,
        scheduledPackDate: cycleInfo.scheduledPackDate,
        scheduledPackDateDisplay: cycleInfo.scheduledPackDateDisplay,
        message: `All members have paid ahead! Payout is scheduled for ${cycleInfo.scheduledPackDateDisplay}.`
      });
    }

    return res.json({
      disbursed: false,
      cycleInfo,
      cycleStatus
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/groups/:groupId/dashboard', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.query;
    const simulatedDate = (req.headers['x-simulated-date'] as string) || (req.query.simulatedDate as string);

    let group = db.getGroupById(groupId);
    if (!group) {
      try {
        const fsGroup = await fsGetGroupById(groupId);
        if (fsGroup) {
          db.syncRemoteGroup(fsGroup);
          group = fsGroup;
        }
      } catch (err) {
        console.warn('Direct Firestore group lookup error in dashboard:', err);
      }
    }
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Sync all financial records and group members from Firestore
    await syncGroupFinancialsFromFirestore(groupId);

    // Cron safeguard on dashboard load: check if scheduled_date <= today and contributions complete, auto-execute pack
    db.checkAndAutoExecutePayAheadPack(groupId, simulatedDate);

    const members = db.getGroupMembers(groupId);
    const contributions = db.getGroupContributions(groupId, group.current_round);
    const currentPacker = db.getCurrentPacker(groupId, group.current_round);
    const nextPacker = db.getNextPacker(groupId, group.current_round);
    const cycleInfo = db.getGroupCycleInfo(groupId, group.current_round, simulatedDate);
    const cycleStatus = db.getCycleContributionStatus(groupId, group.current_round, simulatedDate);
    const packerPaid = currentPacker ? db.hasMemberPaidCurrentCycle(groupId, currentPacker.id, group.current_round, simulatedDate) : false;
    const hasPackedToday = cycleInfo.hasPackedToday;
    const todayPackedMember = db.getTodayPackedMember(groupId, group.current_round, simulatedDate);
    const currentCalendarDate = cycleInfo.todayDate;
    const currentCycleNumber = cycleInfo.cycleNumber;

    // Calculate user's membership if logged in
    const rawUserMember = members.find(m => m.user_id === userId);

    // Strict condition for PACK NOW:
    // 1. Current packer exists and matches logged-in user
    // 2. Member status is active and not already packed
    // 3. Group is not round_completed
    // 4. Cycle is open according to configured frequency (e.g. Every 3 Days)
    // 5. No member has packed on this calendar day
    // 6. EVERY active contributor has paid for current cycle
    // 7. Current packer has paid their own contribution
    const canPackNow = Boolean(
      currentPacker &&
      rawUserMember &&
      currentPacker.id === rawUserMember.id &&
      rawUserMember.status === 'active' &&
      !db.isMemberPacked(groupId, rawUserMember.id, group.current_round) &&
      group.status !== 'round_completed' &&
      cycleInfo.isCycleOpen &&
      !hasPackedToday &&
      cycleStatus.allPaid &&
      packerPaid
    );

    const completedPacks = db.getCompletedPacks(groupId, group.current_round);

    // Clean members list: keep distinct states for hasContributed and isPacked, plus scheduled dates
    const safeMembers = members.map(m => {
      const isPacked = db.isMemberPacked(groupId, m.id, group.current_round);
      const hasContributed = db.hasMemberPaidCurrentCycle(groupId, m.id, group.current_round, simulatedDate);

      let scheduledPackDate = '';
      let scheduledPackDateDisplay = '';

      if (isPacked) {
        const packTx = completedPacks.find(t => t.member_id === m.id);
        if (packTx) {
          scheduledPackDate = getNigeriaCalendarDate(packTx.created_at);
          scheduledPackDateDisplay = formatCalendarDateDisplay(scheduledPackDate);
        }
      } else if (currentPacker && m.id === currentPacker.id) {
        scheduledPackDate = cycleInfo.scheduledPackDate;
        scheduledPackDateDisplay = cycleInfo.scheduledPackDateDisplay;
      } else if (currentPacker && m.position > currentPacker.position) {
        const stepsAhead = m.position - currentPacker.position;
        scheduledPackDate = addCycleIntervalToCalendarDate(cycleInfo.scheduledPackDate, group.cycle_type, stepsAhead);
        scheduledPackDateDisplay = formatCalendarDateDisplay(scheduledPackDate);
      }

      const vaName = m.virtual_account_name || formatGroupMemberAccountName(m.full_name);
      const vaNumber = m.virtual_account_number || generateMoniepointAccountNumber(`group_${groupId}_${m.id}_${m.full_name}`);
      const creditBal = Number(m.credit_balance || 0);
      const totalExpected = group.contribution_amount + 60;
      const isPaidAhead = Boolean(hasContributed && cycleInfo.scheduledPackDate > cycleInfo.todayDate);
      const isPartial = Boolean(!hasContributed && creditBal > 0);
      const remainingToPay = !hasContributed ? Math.max(0, totalExpected - creditBal) : 0;

      return {
        id: m.id,
        user_id: m.user_id,
        full_name: m.full_name,
        position: m.position,
        status: m.status,
        isPacked,
        hasPackedThisRound: Boolean(m.hasPackedThisRound || isPacked),
        hasContributed,
        virtual_account_name: vaName,
        virtual_account_number: vaNumber,
        credit_balance: creditBal,
        payment_type: m.payment_type || 'bank_transfer',
        isPaidAhead,
        isPartial,
        remainingToPay,
        scheduledPackDate,
        scheduledPackDateDisplay,
        current_round_status: isPacked ? 'packed' : (hasContributed ? 'contributed' : 'pending_contribution'),
        isCurrentUser: m.user_id === userId
      };
    });

    // Calculate status for user
    let userStatus = 'You are in queue';
    if (rawUserMember) {
      const isPacked = db.isMemberPacked(groupId, rawUserMember.id, group.current_round);
      if (group.status === 'round_completed') {
        userStatus = 'Round completed';
      } else if (isPacked) {
        userStatus = 'You have already packed';
      } else if (currentPacker && currentPacker.id === rawUserMember.id) {
        if (canPackNow) {
          userStatus = 'Ready to Pack';
        } else if (!cycleInfo.isCycleOpen) {
          userStatus = `YOU ARE NEXT TO PACK • ${cycleInfo.scheduledPackDateDisplay}`;
        } else {
          userStatus = 'You are next';
        }
      } else {
        const myMemberObj = safeMembers.find(m => m.id === rawUserMember.id);
        if (myMemberObj?.scheduledPackDateDisplay) {
          userStatus = `In Queue • Scheduled for ${myMemberObj.scheduledPackDateDisplay}`;
        } else {
          userStatus = 'You are in queue';
        }
      }
    }

    const userVaName = rawUserMember?.virtual_account_name || (rawUserMember ? formatGroupMemberAccountName(rawUserMember.full_name) : '');
    const userVaNumber = rawUserMember?.virtual_account_number || (rawUserMember ? generateMoniepointAccountNumber(`group_${groupId}_${rawUserMember.id}_${rawUserMember.full_name}`) : '');
    const userCreditBal = Number(rawUserMember?.credit_balance || 0);
    const userHasContributed = rawUserMember ? db.hasMemberPaidCurrentCycle(groupId, rawUserMember.id, group.current_round, simulatedDate) : false;

    const userMember = rawUserMember ? {
      ...rawUserMember,
      isPacked: db.isMemberPacked(groupId, rawUserMember.id, group.current_round),
      hasPackedThisRound: Boolean(rawUserMember.hasPackedThisRound || db.isMemberPacked(groupId, rawUserMember.id, group.current_round)),
      hasContributed: userHasContributed,
      virtual_account_name: userVaName,
      virtual_account_number: userVaNumber,
      credit_balance: userCreditBal,
      isPaidAhead: Boolean(userHasContributed && cycleInfo.scheduledPackDate > cycleInfo.todayDate),
      isPartial: Boolean(!userHasContributed && userCreditBal > 0),
      remainingToPay: !userHasContributed ? Math.max(0, (group.contribution_amount + 60) - userCreditBal) : 0,
      current_round_status: db.isMemberPacked(groupId, rawUserMember.id, group.current_round)
        ? ('packed' as const)
        : (userHasContributed ? ('contributed' as const) : ('pending_contribution' as const))
    } : null;

    // Admin commission balance
    const commission = db.getAdminCommissionBalance(groupId);

    const nextPackerScheduledDate = currentPacker
      ? addCycleIntervalToCalendarDate(cycleInfo.scheduledPackDate, group.cycle_type, 1)
      : '';

    return res.json({
      group,
      members: safeMembers,
      contributions,
      currentPacker: currentPacker ? {
        id: currentPacker.id,
        full_name: currentPacker.full_name,
        position: currentPacker.position,
        scheduledPackDate: cycleInfo.scheduledPackDate,
        scheduledPackDateDisplay: cycleInfo.scheduledPackDateDisplay
      } : null,
      nextPacker: nextPacker ? {
        id: nextPacker.id,
        full_name: nextPacker.full_name,
        position: nextPacker.position,
        scheduledPackDate: nextPackerScheduledDate,
        scheduledPackDateDisplay: formatCalendarDateDisplay(nextPackerScheduledDate)
      } : null,
      userMember,
      userStatus,
      commission,
      cycleStatus: {
        totalRequired: cycleStatus.totalRequired,
        paidCount: cycleStatus.paidCount,
        allPaid: cycleStatus.allPaid,
        isPaused: cycleStatus.isPaused,
        isEarlyWaiting: cycleStatus.isEarlyWaiting
      },
      cycleInfo,
      canPackNow,
      hasPackedToday,
      todayPackedMember: todayPackedMember ? {
        id: todayPackedMember.id,
        full_name: todayPackedMember.full_name,
        position: todayPackedMember.position
      } : null,
      currentCalendarDate,
      currentCycleNumber,
      allPacked: members.length > 0 && members.every(m => (m as any).hasPackedThisRound === true || db.isMemberPacked(groupId, m.id, group.current_round))
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/groups/:groupId/contribute/init', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const simulatedDate = (req.headers['x-simulated-date'] as string) || (req.body.simulatedDate as string);

    // 1. Resolve authenticated user strictly from session header or request body
    const authUserId = (req.headers['x-user-id'] as string) || req.body.userId || (req.body.authenticated_user_id as string);
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required. Please log in to your account.' });
    }

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // 2. The member MUST be the authenticated user
    const member = db.getGroupMembers(groupId).find(m => m.user_id === authUserId);
    if (!member) {
      return res.status(403).json({ error: 'Unauthorized: You are not an active member of this group.' });
    }

    // 3. Security check: Reject if request attempts to initiate payment for any other memberId
    if (req.body.memberId && req.body.memberId !== member.id) {
      return res.status(403).json({
        error: 'Security violation: A member can only pay for their own contribution. You cannot pay for another member.'
      });
    }

    const cycleInfo = db.getGroupCycleInfo(groupId, group.current_round, simulatedDate);

    // Check if member has already paid for this active cycle
    const alreadyPaidCurrent = db.hasMemberPaidCurrentCycle(groupId, member.id, group.current_round, simulatedDate);
    if (alreadyPaidCurrent) {
      return res.status(400).json({ error: 'You have already paid your contribution for this cycle.' });
    }

    // Requirement 3: Automatically add compulsory ₦60 transaction fee to every contribution payment
    // If contribution = ₦10,000, member pays ₦10,060 (₦10,000 base, ₦60 fee)
    // Next cycle, automatically deducts credit_balance (e.g. John has 1,000 credit, only pays 9,060)
    const contributionAmount = group.contribution_amount;
    const transactionFee = 60;
    const totalExpected = contributionAmount + transactionFee;
    const creditBalance = Number(member.credit_balance || 0);
    const amountToPay = Math.max(0, totalExpected - creditBalance);

    // If existing credit balance covers the full cycle, apply it immediately without Paystack
    if (amountToPay === 0) {
      const creditRef = `CREDIT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const result = db.processContributionPayment(
        groupId,
        member.id,
        0,
        'credit_wallet',
        creditRef,
        simulatedDate,
        authUserId
      );

      return res.json({
        success: true,
        coveredByCredit: true,
        message: 'Your contribution was fully covered by your available credit balance!',
        result,
        breakdown: {
          baseAmount: contributionAmount,
          baseLabel: 'Contribution Amount',
          feeAmount: transactionFee,
          feeLabel: 'Transaction Fee',
          totalAmount: totalExpected,
          creditBalance,
          amountToPay: 0,
          isEarlyPayment: cycleInfo.scheduledPackDate > cycleInfo.todayDate
        }
      });
    }

    // Pre-flight check: ensure cloud persistence is operational BEFORE prompting member for payment
    if (isFirebaseConfigured()) {
      const persistenceStatus = await verifyFirestorePersistenceReady(3500);
      if (!persistenceStatus.ready) {
        return res.status(503).json({
          error: persistenceStatus.reason || 'Cloud database synchronization is temporarily unavailable. Please wait a moment and try again before submitting payment.',
          retryable: true
        });
      }
    }

    const paystack = await initializePaystackPayment(
      `${member.phone}@packajo.ng`,
      amountToPay,
      `Group Contribution: ${group.group_name} (Cycle ${cycleInfo.cycleNumber})`,
      {
        groupId: group.id,
        memberId: member.id,
        userId: member.user_id,
        round: group.current_round,
        cycleNumber: cycleInfo.cycleNumber,
        calendarDate: cycleInfo.todayDate,
        contributionAmount,
        transactionFee,
        totalAmount: totalExpected,
        creditBalance,
        amountToPay,
        type: 'group_contribution'
      }
    );

    // Record pending payment in payments
    db.createPendingPayment(
      member.user_id,
      paystack.reference,
      Math.round(amountToPay * 100),
      'group_contribution'
    );

    return res.json({
      success: true,
      paystack: {
        ...paystack,
        breakdown: {
          baseAmount: contributionAmount,
          baseLabel: 'Contribution Amount',
          feeAmount: transactionFee,
          feeLabel: 'Transaction Fee',
          totalAmount: totalExpected,
          creditBalance,
          amountToPay,
          isEarlyPayment: cycleInfo.scheduledPackDate > cycleInfo.todayDate
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/groups/:groupId/contribute/verify', paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { reference } = req.body;
    const simulatedDate = (req.headers['x-simulated-date'] as string) || (req.body.simulatedDate as string);

    // 1. Resolve authenticated user strictly
    const authUserId = (req.headers['x-user-id'] as string) || req.body.userId || (req.body.authenticated_user_id as string);
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required. Please log in to your account.' });
    }

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // 2. The member MUST be the authenticated user
    const member = db.getGroupMembers(groupId).find(m => m.user_id === authUserId);
    if (!member) {
      return res.status(403).json({ error: 'Unauthorized: You are not an active member of this group.' });
    }

    // 3. Security check: Reject if request attempts to verify payment for another member
    if (req.body.memberId && req.body.memberId !== member.id) {
      return res.status(403).json({
        error: 'Security violation: A member cannot verify or credit payment for another member.'
      });
    }

    const cycleInfo = db.getGroupCycleInfo(groupId, group.current_round, simulatedDate);
    const currentCycle = cycleInfo.cycleNumber;
    const todayStr = cycleInfo.todayDate;
    const paidTimestamp = simulatedDate ? new Date(simulatedDate + 'T12:00:00.000Z').toISOString() : new Date().toISOString();

    // 4. IDEMPOTENCY CHECK (Before any external call or mutation)
    // Check if this reference or this cycle contribution is already marked Paid locally
    let existingRef = db.getGroupContributions(groupId, group.current_round).find(
      c => c.reference === reference && c.status === 'Paid'
    );
    const existingCyclePaid = db.getGroupContributions(groupId, group.current_round).find(
      c => c.member_id === member.id &&
           (c.cycle_number === currentCycle || (!c.cycle_number && currentCycle === 1)) &&
           c.status === 'Paid'
    );

    // If not found locally by reference, check Firestore read-back before attempting any verification
    if (!existingRef) {
      const remoteContrib = await fsGetContributionByReference(reference).catch(() => null);
      if (remoteContrib && remoteContrib.status === 'Paid' && remoteContrib.member_id === member.id) {
        db.updatePaymentStatus(reference, 'success', 'Recovered from confirmed cloud record');
        existingRef = db.markContributionPaid(groupId, member.id, group.current_round, reference, simulatedDate, authUserId);
      }
    }

    // If already marked Paid with this reference (or for this cycle with this reference)
    if (existingRef || (existingCyclePaid && existingCyclePaid.reference === reference)) {
      const targetContrib = existingRef || existingCyclePaid!;
      if (targetContrib.member_id !== member.id) {
        return res.status(403).json({ error: 'Security violation: Payment reference is already assigned to another member.' });
      }

      // Check Firestore read-back to verify/ensure persistence
      let paymentRec = db.getPaymentByReference(reference);
      const [remotePayment, remoteContrib] = await Promise.all([
        fsGetPaymentByReference(reference).catch(() => null),
        fsGetContributionByReference(reference).catch(() => null)
      ]);

      let isCloudConfirmed = Boolean(remotePayment?.status === 'success' || remoteContrib?.status === 'Paid');
      if (!isCloudConfirmed) {
        isCloudConfirmed = paymentRec
          ? await fsExecuteContributionBatch(paymentRec, targetContrib)
          : await fsUpsertContribution(targetContrib);
      }

      // Ensure local member status is consistent
      if (member.current_round_status !== 'packed') {
        member.current_round_status = 'contributed';
        db.save();
      }

      // Return successful idempotent response showing contribution is already recorded
      return res.json({
        success: true,
        message: 'Your contribution has already been verified and recorded.',
        alreadyProcessed: true,
        alreadyPaid: true,
        contribution: targetContrib,
        cloudConfirmed: isCloudConfirmed
      });
    }

    // If member already contributed for this cycle under a different reference, return idempotent success
    if (existingCyclePaid) {
      if (member.current_round_status !== 'packed') {
        member.current_round_status = 'contributed';
        db.save();
      }

      return res.json({
        success: true,
        message: 'Your contribution for this cycle has already been verified and recorded.',
        alreadyPaid: true,
        alreadyProcessed: true,
        contribution: existingCyclePaid,
        cloudConfirmed: true
      });
    }

    // 5. Server-side verification with expected total amount in kobo (base contribution + ₦60 fee)
    const contributionAmount = group.contribution_amount;
    const transactionFee = 60;
    const expectedKobo = Math.round((contributionAmount + transactionFee) * 100);
    let verification = await verifyPaystackPayment(reference, expectedKobo);

    // If verification failed solely due to amount mismatch, check if member paid without the ₦60 fee (e.g. exactly ₦50,000)
    // or paid at least the required base contribution amount
    if (!verification.success && verification.amount_kobo && verification.amount_kobo >= Math.round(contributionAmount * 100)) {
      const retryVerification = await verifyPaystackPayment(reference, verification.amount_kobo);
      if (retryVerification.success) {
        verification = retryVerification;
      }
    }

    // CASE 1: Paystack verification failed
    if (!verification.success) {
      return res.status(400).json({
        error: verification.message || 'Payment verification failed on server.',
        paymentFailed: true
      });
    }

    // 6. Verify payment metadata belongs to this member if metadata is present
    const meta = verification.data?.metadata;
    if (meta) {
      if (meta.groupId && meta.groupId !== groupId) {
        return res.status(400).json({ error: 'Payment record does not match this group.' });
      }
      if (meta.userId && meta.userId !== member.user_id) {
        return res.status(403).json({ error: 'Security violation: This payment belongs to another user.' });
      }
      if (meta.memberId && meta.memberId !== member.id) {
        return res.status(403).json({ error: 'Security violation: This payment belongs to another member.' });
      }
    }

    // 7. Prepare candidate records for atomic cloud persistence
    // CROSS-VERCEL-INSTANCE PAYMENT RECONSTRUCTION:
    let paymentRec = db.getPaymentByReference(reference);
    if (!paymentRec) {
      const fsPayment = await fsGetPaymentByReference(reference).catch(() => null);
      if (fsPayment) {
        paymentRec = fsPayment;
      } else {
        paymentRec = {
          id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          user_id: member.user_id,
          purpose: 'group_contribution',
          amount: (verification.amount_kobo ? verification.amount_kobo / 100 : (contributionAmount + transactionFee)),
          amount_kobo: verification.amount_kobo || expectedKobo,
          currency: 'NGN',
          reference,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        (db as any).data.payments.push(paymentRec);
        db.save();
      }
    }
    const updatedPayment: PaymentRecord = {
      ...paymentRec,
      status: 'success',
      gateway_response: verification.data?.gateway_response || 'Successful',
      paid_at: verification.data?.paid_at || paidTimestamp,
      channel: verification.data?.channel || 'card',
      updated_at: new Date().toISOString()
    };

    // Prepare candidate contribution WITHOUT committing to local state yet
    const existingContrib = db.getGroupContributions(groupId, group.current_round).find(
      c => c.member_id === member.id &&
           (c.cycle_number === currentCycle || (!c.cycle_number && currentCycle === 1))
    );
    const contribId = existingContrib?.id || `cnt_${Date.now()}_${member.id}`;

    const schedule = db.generateOrEnsurePackingSchedule(group);
    const memberSchedule = schedule.find(s => s.member_id === member.id && s.cycle === group.current_round);
    const isPayAhead = memberSchedule ? (todayStr < memberSchedule.scheduled_date) : false;

    if (memberSchedule && isPayAhead) {
      memberSchedule.status = 'credited';
      memberSchedule.is_pay_ahead = true;
      memberSchedule.credited_at = new Date().toISOString();
      memberSchedule.credited_for_date = memberSchedule.scheduled_date;
      group.packingSchedule = schedule;
    }

    const candidateContribution: Contribution = {
      ...(existingContrib || {}),
      id: contribId,
      group_id: groupId,
      member_id: member.id,
      user_id: member.user_id,
      round_number: group.current_round,
      cycle_number: currentCycle,
      calendar_date: todayStr,
      amount: contributionAmount,
      status: 'Paid',
      reference,
      paid_at: paidTimestamp,
      is_pay_ahead: isPayAhead,
      credited_for_date: memberSchedule?.scheduled_date
    };

    const candidateMember: GroupMember = {
      ...member,
      current_round_status: member.current_round_status === 'packed' ? 'packed' : 'contributed'
    };

    // 8. ATOMIC FIRESTORE WRITE & CONFIRMATION
    let confirmed = await fsExecuteContributionBatch(updatedPayment, candidateContribution, candidateMember);

    // If batch write returned false, perform read-back check to see if write actually reached Firestore
    if (!confirmed) {
      const [remotePayment, remoteContrib] = await Promise.all([
        fsGetPaymentByReference(reference).catch(() => null),
        fsGetContributionByReference(reference).catch(() => null)
      ]);
      if (remotePayment?.status === 'success' || remoteContrib?.status === 'Paid') {
        confirmed = true;
      }
    }

    // CASE 3: Paystack succeeded AND atomic Firestore write actually failed
    // Do NOT report success. Do NOT leave local state falsely indicating a successful contribution.
    if (!confirmed) {
      // Keep payment as pending with verified notes so proof of payment is safely retained for retry
      db.updatePaymentStatus(reference, 'pending', 'Verified with Paystack — cloud synchronization pending');

      console.error(`[Group Contribution] Firestore persistence unconfirmed for ref: ${reference}, contribution: ${candidateContribution.id}`);
      return res.status(503).json({
        error: 'Payment verified with Paystack, but cloud confirmation could not be finalized. Please retry to confirm your contribution status.',
        retryable: true,
        paymentVerified: true,
        syncPending: true,
        reference
      });
    }

    // CASE 2 & CASE 4: Paystack succeeded AND Firestore persistence confirmed
    // Now safely commit to local database!
    db.updatePaymentStatus(reference, 'success', verification.data?.gateway_response || 'Successful');
    const finalContribution = db.markContributionPaid(groupId, member.id, group.current_round, reference, simulatedDate, authUserId);
    syncPaymentRecordToSupabase(updatedPayment).catch(err => console.warn('[Supabase Payment Sync Warn]:', err?.message || err));
    syncContributionToSupabase(finalContribution).catch(err => console.warn('[Supabase Contribution Sync Warn]:', err?.message || err));

    // Audit log contribution
    db.recordAudit({
      event_type: 'GROUP_CONTRIBUTION_PAID',
      user_id: member.user_id,
      group_id: groupId,
      ip_address: req.ip,
      details: {
        round_number: group.current_round,
        amount: contributionAmount,
        reference,
        member_id: member.id
      }
    });

    // STEP 2 - Record Group Contribution Fee (₦60) in Super Admin Revenue Ledger
    const contribMemberProfile = db.getProfileById(member.user_id);
    db.recordAdminRevenue({
      type: 'contribution_60',
      amount: 60,
      reference,
      group_or_user: `Group: ${group.group_name} (${contribMemberProfile?.full_name || 'Member'})`,
      user_id: member.user_id,
      group_id: groupId,
      gross_amount: contributionAmount,
      description: `₦60 Contribution Processing Fee (Member: ${contribMemberProfile?.full_name || 'Member'}, Round ${group.current_round})`
    });

    return res.json({
      success: true,
      message: 'Contribution marked as Paid.',
      contribution: finalContribution
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Pack Now execution
apiRouter.post('/groups/:groupId/pack', packRateLimiter, async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { memberId, password, otp_code } = req.body;
    const simulatedDate = (req.headers['x-simulated-date'] as string) || (req.body.simulatedDate as string);

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // 1. Group active check
    if (group.status === 'round_completed') {
      return res.status(400).json({ error: 'This round is already completed.' });
    }

    // 2. Member check
    const member = db.getGroupMembers(groupId).find(m => m.id === memberId);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.status !== 'active') {
      return res.status(400).json({ error: 'You are not an active member of this group.' });
    }

    // Strict authentication check: authUserId must be present and match member account or group admin
    const authUserId = (req.headers['x-user-id'] as string) || req.body.userId;
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    const isAdmin = group.admin_id === authUserId;
    if (member.user_id !== authUserId && !isAdmin) {
      return res.status(403).json({ error: 'Security violation: You can only pack for your own member account.' });
    }

    // IDEMPOTENCY CHECK: If member has already packed for this round, confirm cloud persistence and return existing
    const existingPack = db.getPackTransactionByMember(groupId, memberId, group.current_round);
    if (existingPack) {
      const existingCommission = db.getCommissionByPackTransactionId(existingPack.id);
      const confirmed = await fsExecutePackBatch(existingPack, existingCommission, member, group);
      if (!confirmed) {
        console.error(`[Group Pack Retry] Cloud persistence unconfirmed for pack: ${existingPack.id}`);
        return res.status(503).json({
          error: 'Packing was already executed, but cloud record persistence could not be confirmed. Please retry in a moment.',
          retryable: true
        });
      }
      return res.json({
        success: true,
        message: `Packing completed! ₦${existingPack.member_amount.toLocaleString()} has been sent to ${existingPack.bank_name} (${existingPack.account_number}).`,
        alreadyProcessed: true,
        transaction: existingPack,
        commission: existingCommission,
        roundCompleted: (group.status as string) === 'round_completed'
      });
    }

    // 3. Verify it is this member's turn
    const currentPacker = db.getCurrentPacker(groupId, group.current_round);
    if (!currentPacker || currentPacker.id !== member.id) {
      return res.status(400).json({ error: 'It is not currently your turn to pack.' });
    }

    // 4. Verify member hasn't already packed
    if (db.isMemberPacked(groupId, member.id, group.current_round)) {
      return res.status(400).json({ error: 'Member has already packed in this round.' });
    }

    // 5. Verify cycle is open according to configured frequency
    const cycleInfo = db.getGroupCycleInfo(groupId, group.current_round, simulatedDate);
    if (!cycleInfo.isCycleOpen) {
      return res.status(400).json({
        error: `Packing for this cycle is scheduled for ${cycleInfo.scheduledPackDateDisplay} (${cycleInfo.scheduledPackDate}).`
      });
    }

    // 6. Verify no member has already packed today on this calendar day
    if (cycleInfo.hasPackedToday) {
      return res.status(400).json({
        error: `Packing for today has already been completed. The next packing cycle opens on ${cycleInfo.scheduledPackDateDisplay}.`
      });
    }

    // 7. Verify packer's own contribution has been paid for current cycle
    const packerPaid = db.hasMemberPaidCurrentCycle(groupId, member.id, group.current_round, simulatedDate);
    if (!packerPaid) {
      return res.status(400).json({ error: 'Please pay your contribution for this cycle before you can pack.' });
    }

    // 8. Verify ALL required contributors have paid for current cycle
    const cycleStatus = db.getCycleContributionStatus(groupId, group.current_round, simulatedDate);
    if (!cycleStatus.allPaid) {
      return res.status(400).json({
        error: 'Waiting for all members to complete their contribution before packing can proceed.'
      });
    }

    // 9. Verify Authorization (Admin override or Password/OTP for member)
    if (!isAdmin) {
      const memberProfile = db.getProfileById(member.user_id);
      if (password) {
        if (memberProfile?.password && memberProfile.password !== password) {
          return res.status(400).json({ error: 'Incorrect login password. Please enter your valid password to authorize packing.' });
        }
      } else if (otp_code) {
        const isValidOtp = await verifyOtpSafe(member.phone, otp_code, 'pack_now');
        if (!isValidOtp) {
          return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }
      } else if (memberProfile?.password) {
        return res.status(400).json({ error: 'Your login password is required to authorize packing.' });
      }
    }

    // 10. Execute server-side pack calculation and state advancement
    const result = db.executePack(groupId, memberId, group.current_round, simulatedDate);

    // Sync pack transaction and commission to Supabase
    syncPackTransactionToSupabase(result.transaction).catch(() => {});
    if (result.commission) {
      syncCommissionToSupabase(result.commission).catch(() => {});
    }

    // CRITICAL WRITE CONFIRMATION:
    // Both pack transaction, commission, member status, and group status MUST be confirmed in Firestore
    const updatedMember = db.getGroupMembers(groupId).find(m => m.id === memberId);
    const updatedGroup = db.getGroupById(groupId);

    const confirmed = await fsExecutePackBatch(
      result.transaction,
      result.commission,
      updatedMember,
      updatedGroup
    );

    if (!confirmed) {
      console.error(`[Group Pack] Firestore persistence failed for pack: ${result.transaction.id}, rolling back local state`);
      db.rollbackPack(groupId, result.transaction.id, result.commission?.id, memberId, result.roundCompleted);
      return res.status(503).json({
        error: 'Packing could not be confirmed safely in cloud storage. The operation has been rolled back. Please retry in a few moments.',
        retryable: true
      });
    }

    if (result.commission && result.commission.super_admin_amount > 0) {
      fsRecordPackingRevenue(
        groupId,
        result.transaction.id,
        result.commission.super_admin_amount,
        group.group_name
      ).catch(err => console.warn('[Firestore Packing Revenue Warn]:', err?.message || err));
    }

    if (result.commission && result.commission.admin_amount > 0) {
      try {
        const fsDb = getFirestoreDb();
        if (fsDb) {
          const comAmt = Math.floor(result.commission.admin_amount);
          fsDb.collection('platform_transactions').doc(`ptx_com_${result.transaction.id}`).set({
            id: `ptx_com_${result.transaction.id}`,
            adminId: group.admin_id,
            userId: group.admin_id,
            groupId: group.id,
            type: 'admin_commission',
            amount: comAmt,
            gross_amount: comAmt,
            status: 'success',
            description: `Group Admin Commission for ${group.group_name} Round ${group.current_round}`,
            createdAt: FieldValue.serverTimestamp()
          }, { merge: true }).catch(() => {});
        }
      } catch (ptxErr) {
        console.warn('[Firestore Pack platform_transactions Warn]:', ptxErr);
      }
    }

    const memberPayout = result.transaction.member_amount;
    const transferResult = await initiatePaystackTransfer(
      result.transaction.account_number,
      result.transaction.bank_name,
      result.transaction.member_name,
      memberPayout,
      `Better Ajo Pack Payout for ${group.group_name} Round ${group.current_round}`,
      `pck_trf_${result.transaction.id}`
    );

    const completionMessage = result.roundCompleted
      ? `All Members Have Successfully Packed! Round ${group.current_round} Completed`
      : undefined;

    return res.json({
      success: true,
      message: result.roundCompleted
        ? `All Members Have Successfully Packed! Round ${group.current_round} Completed`
        : `Packing completed! ₦${result.transaction.member_amount.toLocaleString()} has been sent to ${result.transaction.bank_name} (${result.transaction.account_number}).`,
      completionMessage,
      transaction: result.transaction,
      commission: result.commission,
      roundCompleted: result.roundCompleted
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Round 2 / 3 / next round consent & start
apiRouter.post('/groups/:groupId/round-consent', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId, consent } = req.body;

    const result = db.setNextRoundConsent(groupId, userId, Boolean(consent));
    if (result.member && isFirebaseConfigured()) {
      fsUpsertGroupMember(result.member).catch(err => {
        console.warn(`[Round Consent] Async Firestore sync warning for member ${result.member?.id}:`, err);
      });
    }
    return res.json({
      success: true,
      consent: result.consent,
      message: result.consent
        ? 'You have chosen to continue in the next round!'
        : 'You have left the group. Your position is now open for a replacement.'
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

const handleStartNextRound = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { adminId } = req.body;
    const simulatedDate = (req.headers['x-simulated-date'] as string) || (req.body.simulatedDate as string) || (req.body.today as string);

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (adminId && group.admin_id !== adminId) {
      return res.status(403).json({ error: 'Only the Group Admin can start the next round.' });
    }

    const activeMembers = db.getGroupMembers(groupId);
    const allPacked = activeMembers.length > 0 && activeMembers.every(m => m.hasPackedThisRound === true);
    if (!allPacked && group.status !== 'round_completed') {
      return res.status(400).json({ error: 'Cannot start the next round until all members have packed in the current round.' });
    }

    // Snapshot current state for atomic rollback if cloud persistence fails
    const previousRound = group.current_round;
    const previousStatus = group.status;
    const previousRoundStartedAt = group.round_started_at;
    const previousMembers = db.getGroupMembers(groupId).map(m => ({ ...m }));

    // Advance local state
    const { group: updatedGroup, members: updatedMembers, contributions: newContributions } = db.startNextRound(groupId, { simulatedDate });

    // CRITICAL CLOUD PERSISTENCE:
    // When Firebase is configured, atomically write the new round state, members, and initial pending contributions
    if (isFirebaseConfigured()) {
      const confirmed = await fsExecuteStartNextRoundBatch(updatedGroup, updatedMembers, newContributions);
      if (!confirmed) {
        console.error(`[Start Next Round] Firestore persistence failed for group ${groupId}, rolling back local state`);
        db.rollbackNextRound(
          groupId,
          previousRound,
          previousStatus,
          previousRoundStartedAt,
          previousMembers,
          newContributions.map(c => c.id)
        );
        return res.status(503).json({
          error: 'Starting next round could not be confirmed safely in cloud storage. The operation has been rolled back. Please retry in a few moments.',
          retryable: true
        });
      }
      console.log(`[Start Next Round] Confirmed Round ${updatedGroup.current_round} in Firestore for group ${groupId}`);
    }

    return res.json({
      success: true,
      message: `Round ${updatedGroup.current_round} has started!`,
      currentRound: updatedGroup.current_round,
      status: updatedGroup.status,
      roundStartedAt: updatedGroup.round_started_at,
      nextPackDate: (updatedGroup as any).nextPackDate,
      group: updatedGroup,
      members: updatedMembers
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};

apiRouter.post('/groups/:groupId/start-next-round', handleStartNextRound);
apiRouter.post('/groups/:groupId/startRound2', handleStartNextRound);
apiRouter.post('/groups/:groupId/start-round-2', handleStartNextRound);

// Synchronize commissions, pack transactions, and withdrawals for a group from Firestore
async function syncGroupFinancialsFromFirestore(groupId: string): Promise<void> {
  try {
    const fsDb = getFirestoreDb();
    if (!fsDb) return;

    // Reset this group's in-memory records so Firestore is the strict single source of truth
    db.data.commissions = (db.data.commissions || []).filter(c => c.group_id !== groupId && (c as any).groupId !== groupId);
    db.data.pack_transactions = (db.data.pack_transactions || []).filter(p => p.group_id !== groupId && (p as any).groupId !== groupId);
    db.data.withdrawals = (db.data.withdrawals || []).filter(w => w.group_id !== groupId && (w as any).groupId !== groupId);
    db.data.contributions = (db.data.contributions || []).filter(c => c.group_id !== groupId && (c as any).groupId !== groupId);

    // 1. Stream 3: Query packing commissions explicitly by STREAM_PACKING type
    const comSnap = await fsDb.collection('commissions')
      .where('group_id', '==', groupId)
      .where('type', '==', STREAM_PACKING)
      .get();
    comSnap.forEach(d => {
      const cData = d.data() as any;
      const effectiveId = cData.id || d.id;
      if (!db.data.commissions.some(existing => existing.id === effectiveId)) {
        db.data.commissions.push({
          ...cData,
          id: effectiveId,
          type: STREAM_PACKING,
          stream: STREAM_PACKING
        });
      }
    });

    // Also fetch any legacy commissions without type field for backward compatibility
    const legacyComSnap = await fsDb.collection('commissions')
      .where('group_id', '==', groupId)
      .get();
    legacyComSnap.forEach(d => {
      const cData = d.data() as any;
      const effectiveId = cData.id || d.id;
      if (!db.data.commissions.some(existing => existing.id === effectiveId)) {
        db.data.commissions.push({
          ...cData,
          id: effectiveId,
          type: STREAM_PACKING,
          stream: STREAM_PACKING
        });
      }
    });

    // 2. Sync pack_transactions explicitly for this group
    const packSnap = await fsDb.collection('pack_transactions')
      .where('group_id', '==', groupId)
      .get();
    packSnap.forEach(d => {
      const pData = d.data() as any;
      const effectiveId = pData.id || d.id;
      if (!db.data.pack_transactions.some(existing => existing.id === effectiveId)) {
        db.data.pack_transactions.push({ ...pData, id: effectiveId });
      }
    });

    // 3. Sync withdrawals explicitly for this group
    const wthSnap = await fsDb.collection('withdrawals')
      .where('group_id', '==', groupId)
      .get();
    wthSnap.forEach(d => {
      const wData = d.data() as any;
      const effectiveId = wData.id || d.id;
      if (!db.data.withdrawals.some(existing => existing.id === effectiveId)) {
        db.data.withdrawals.push({ ...wData, id: effectiveId });
      }
    });

    // 4. Sync group_members explicitly for this group so members never vanish
    const fsMembers = await fsGetMembersForGroup(groupId);
    if (fsMembers && fsMembers.length > 0) {
      for (const m of fsMembers) {
        const effectiveId = m.id;
        const idx = db.data.group_members.findIndex(existing => existing.id === effectiveId);
        if (idx >= 0) {
          db.data.group_members[idx] = { ...db.data.group_members[idx], ...m };
        } else {
          db.data.group_members.push(m);
        }
      }
    }

    // 5. Sync contributions from Firestore so contributions and pay-ahead credit persist across reloads
    try {
      const contribSnap1 = await fsDb.collection('contributions')
        .where('group_id', '==', groupId)
        .get();
      contribSnap1.forEach(d => {
        const cData = d.data() as any;
        const effectiveId = cData.id || d.id;
        const existingIdx = db.data.contributions.findIndex(existing => existing.id === effectiveId || (existing.reference && existing.reference === cData.reference));
        if (existingIdx >= 0) {
          db.data.contributions[existingIdx] = { ...db.data.contributions[existingIdx], ...cData, id: effectiveId };
        } else {
          db.data.contributions.push({ ...cData, id: effectiveId });
        }
      });

      const contribSnap2 = await fsDb.collection('contributions')
        .where('groupId', '==', groupId)
        .get();
      contribSnap2.forEach(d => {
        const cData = d.data() as any;
        const effectiveId = cData.id || d.id;
        const existingIdx = db.data.contributions.findIndex(existing => existing.id === effectiveId || (existing.reference && existing.reference === cData.reference));
        if (existingIdx >= 0) {
          db.data.contributions[existingIdx] = { ...db.data.contributions[existingIdx], ...cData, id: effectiveId };
        } else {
          db.data.contributions.push({ ...cData, id: effectiveId });
        }
      });
    } catch (cErr) {
      console.warn('[SyncGroupFinancials Contributions Warn]:', cErr);
    }
  } catch (err) {
    console.warn('[SyncGroupFinancials Warn]:', err);
  }
}

apiRouter.post('/groups/:groupId/withdraw-commission', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { amount, userId } = req.body;

    let group = db.getGroupById(groupId);
    if (!group) {
      try {
        const fsGroup = await fsGetGroupById(groupId);
        if (fsGroup) {
          db.syncRemoteGroup(fsGroup);
          group = fsGroup;
        }
      } catch (err) {
        console.warn('Direct Firestore group lookup error in withdraw-commission:', err);
      }
    }
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Sync all financial records from Firestore
    await syncGroupFinancialsFromFirestore(groupId);

    const adminId = userId || group.admin_id;
    if (group.admin_id !== adminId) {
      return res.status(403).json({ error: 'Unauthorized: Only the group admin can withdraw commissions.' });
    }

    const admin = db.getProfileById(adminId);
    if (!admin) return res.status(404).json({ error: 'Admin profile not found' });

    const numericAmount = Math.floor(Number(amount));
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount.' });
    }

    const balance = db.getAdminCommissionBalance(groupId);
    if (numericAmount > balance.available) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ₦${balance.available.toLocaleString('en-NG')}.`
      });
    }

    const transferResult = await initiatePaystackTransfer(
      admin.account_number,
      admin.bank_name,
      admin.full_name,
      numericAmount,
      `Better Ajo Group Admin Commission for ${group.group_name}`
    );

    const withdrawal = db.withdrawGroupAdminEarnings(groupId, adminId, numericAmount, transferResult);
    (withdrawal as any).user_name = admin.full_name;
    (withdrawal as any).group_name = group.group_name;
    (withdrawal as any).group_id = groupId;
    const payment = db.getPaymentById(`pay_${withdrawal.id}`);
    const confirmed = payment
      ? await fsExecuteAdminWithdrawalBatch(withdrawal, payment)
      : await fsUpsertWithdrawal(withdrawal);

    fsUpsertGroup(group).catch(() => {});

    if (!confirmed) {
      console.error(`[Admin Commission Withdrawal] Firestore write unconfirmed for withdrawal: ${withdrawal.id}`);
      return res.status(503).json({
        error: 'Payout initiated, but cloud storage confirmation failed. Please refresh your dashboard to verify status.',
        retryable: true
      });
    }

    return res.json({
      success: true,
      message: `Commission of ₦${withdrawal.amount.toLocaleString()} withdrawn to ${withdrawal.bank_name} (${withdrawal.account_number})`,
      withdrawal
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------
// GROUP ADMIN DASHBOARD ROUTES
// ----------------------------------------------------

apiRouter.get('/groups/:groupId/admin-dashboard', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string);
    const reqPhone = (req.query.phone as string) || (req.headers['x-user-phone'] as string);

    if (!userId && !reqPhone) {
      return res.status(401).json({ error: 'Authentication required. Missing user ID.' });
    }

    let group = db.getGroupById(groupId);
    if (!group) {
      try {
        const fsGroup = await fsGetGroupById(groupId);
        if (fsGroup) {
          db.syncRemoteGroup(fsGroup);
          group = fsGroup;
        }
      } catch (err) {
        console.warn('Direct Firestore group lookup error in admin-dashboard:', err);
      }
    }
    if (!group) {
      try {
        const remote = await fetchGroupByIdFromSupabase(groupId);
        if (remote) {
          db.syncRemoteGroup(remote);
          group = remote;
        }
      } catch (err) {
        console.warn('Direct Supabase group lookup error in admin-dashboard:', err);
      }
    }
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Sync all financial records from Firestore
    await syncGroupFinancialsFromFirestore(groupId);

    // Cron safeguard on dashboard load: check if scheduled_date <= today and contributions complete, auto-execute pack
    db.checkAndAutoExecutePayAheadPack(groupId);

    let userProfile = (userId ? db.getProfileById(userId) : null) ||
      (userId ? db.getProfileByPhone(userId) : null) ||
      (reqPhone ? db.getProfileByPhone(reqPhone) : null);

    if (!userProfile && (userId || reqPhone)) {
      try {
        const cleanP = reqPhone ? normalizeNigerianPhone(reqPhone) : (userId ? normalizeNigerianPhone(userId) : '');
        const fsUser = userId ? await fsGetProfileById(userId) : null;
        const fsUserByPhone = (!fsUser && cleanP) ? await fsGetProfileByPhone(cleanP) : null;
        const fsCandidate = fsUser || fsUserByPhone;
        if (fsCandidate) {
          userProfile = db.upsertProfile(fsCandidate);
        }
      } catch {}
      if (!userProfile) {
        try {
          const remoteUser = userId ? await fetchProfileByIdFromSupabase(userId) : null;
          const remoteUserByPhone = (!remoteUser && (reqPhone || userId)) ? await fetchProfileByPhoneFromSupabase(reqPhone || userId) : null;
          const candidate = remoteUser || remoteUserByPhone;
          if (candidate) {
            userProfile = db.upsertProfile(candidate);
          }
        } catch {}
      }
    }

    const cleanReqPhone = reqPhone ? normalizeNigerianPhone(reqPhone) : (userId ? normalizeNigerianPhone(userId) : '');
    const isOwner =
      group.admin_id === userId ||
      (userProfile && group.admin_id === userProfile.id) ||
      (cleanReqPhone && normalizeNigerianPhone(group.admin_id) === cleanReqPhone) ||
      (userProfile && cleanReqPhone && normalizeNigerianPhone(userProfile.phone) === cleanReqPhone);

    if (!isOwner) {
      return res.status(403).json({
        error: 'Forbidden: You can only access the administration of groups you created.'
      });
    }

    const data = db.getGroupAdminDashboardData(groupId, group.admin_id);
    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/groups/:groupId/withdraw-admin-earnings', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId, amount, bankName, accountNumber, accountName, reference: clientReference } = req.body;
    const authUserId = (req.headers['x-user-id'] as string) || userId;

    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required. Missing user ID.' });
    }

    let group = db.getGroupById(groupId);
    if (!group) {
      try {
        const fsGroup = await fsGetGroupById(groupId);
        if (fsGroup) {
          db.syncRemoteGroup(fsGroup);
          group = fsGroup;
        }
      } catch (err) {
        console.warn('Direct Firestore group lookup error in withdraw-admin-earnings:', err);
      }
    }
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Sync all financial records from Firestore
    await syncGroupFinancialsFromFirestore(groupId);

    if (group.admin_id !== authUserId) {
      return res.status(403).json({
        error: 'Forbidden: You can only withdraw from groups you created.'
      });
    }

    const numericAmount = Math.floor(Number(amount));
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount.' });
    }

    const balance = db.getAdminCommissionBalance(groupId);
    if (numericAmount > balance.available) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ₦${balance.available.toLocaleString('en-NG')}.`
      });
    }

    const admin = db.getProfileById(authUserId);
    const targetBank = bankName || admin?.bank_name || '';
    const targetAccount = accountNumber || admin?.account_number || '';
    const targetName = accountName || admin?.full_name || group.admin_name;

    if (!targetBank || !targetAccount) {
      return res.status(400).json({ error: 'Missing bank account information for payout.' });
    }

    // Pre-flight check: ensure cloud persistence is operational BEFORE moving money via Paystack
    if (isFirebaseConfigured()) {
      const persistenceStatus = await verifyFirestorePersistenceReady(3500);
      if (!persistenceStatus.ready) {
        return res.status(503).json({
          error: persistenceStatus.reason || 'Cloud database synchronization is temporarily unavailable. Please wait a moment and try again before submitting withdrawal.',
          retryable: true
        });
      }
    }

    // Deterministic idempotency reference
    const amountKobo = Math.round(numericAmount * 100);
    const reference = clientReference || (req.headers['x-idempotency-key'] as string) || `wth_ga_${groupId}_${authUserId}_${amountKobo}`;

    // 1. Check if this withdrawal has already been completed locally or in Firestore
    let existingWithdrawal = db.getAllWithdrawals().find(w => w.reference === reference || w.id === reference);
    if (!existingWithdrawal) {
      existingWithdrawal = await fsGetWithdrawalByReference(reference).catch(() => null);
    }

    if (existingWithdrawal && (existingWithdrawal.status === 'completed' || existingWithdrawal.status === 'successful')) {
      return res.json({
        success: true,
        alreadyProcessed: true,
        message: 'This withdrawal has already been processed and confirmed.',
        withdrawal: existingWithdrawal
      });
    }

    // 2. Initiate Paystack transfer with reference to ensure idempotency across retries
    const transferResult = await initiatePaystackTransfer(
      targetAccount,
      targetBank,
      targetName,
      numericAmount,
      `Better Ajo Group Admin Commission for ${group.group_name}`,
      reference
    );

    // 3. Prepare candidate withdrawal and payment with completed status
    const { withdrawal, payment } = db.prepareGroupAdminWithdrawal(
      groupId,
      authUserId,
      numericAmount,
      transferResult,
      reference
    );

    withdrawal.status = 'completed';
    payment.status = 'success';
    (withdrawal as any).user_name = targetName;
    (withdrawal as any).group_name = group.group_name;
    (withdrawal as any).group_id = groupId;

    // 4. Commit confirmed withdrawal to local database state immediately
    db.recordConfirmedWithdrawal(withdrawal, payment);
    fsUpsertGroup(group).catch(() => {});

    // 5. Cloud synchronization (Firestore & Supabase) with graceful non-blocking fallback
    fsExecuteAdminWithdrawalBatch(withdrawal, payment).catch(err => {
      console.warn('[Firestore Group Admin Withdrawal Sync Warn]:', err?.message || err);
    });
    try {
      const fsDb = getFirestoreDb();
      if (fsDb) {
        fsDb.collection('withdrawals').doc(withdrawal.id).set({
          ...withdrawal,
          adminId: authUserId,
          userId: authUserId,
          groupId: groupId,
          amount: Math.floor(numericAmount),
          net_amount: Math.floor(numericAmount),
          type: 'admin_commission',
          status: 'success',
          createdAt: FieldValue.serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
    } catch {}
    syncWithdrawalToSupabase(withdrawal).catch(err => {
      console.warn('[Supabase Group Admin Withdrawal Sync Warn]:', err?.message || err);
    });
    syncPaymentRecordToSupabase(payment).catch(err => {
      console.warn('[Supabase Group Admin Payment Sync Warn]:', err?.message || err);
    });

    return res.json({
      success: true,
      message: transferResult.message || `Commission of ₦${numericAmount.toLocaleString()} disbursed successfully!`,
      withdrawal
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/groups/:groupId/notify', (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId, message, recipientType, memberId, channel } = req.body;
    const authUserId = (req.headers['x-user-id'] as string) || userId;

    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required. Missing user ID.' });
    }

    const group = db.getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    if (group.admin_id !== authUserId) {
      return res.status(403).json({
        error: 'Forbidden: You can only notify members of groups you administer.'
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Notification message cannot be empty.' });
    }

    const members = db.getGroupMembers(groupId);
    let recipientsCount = members.length;
    if (recipientType === 'single' && memberId) {
      const target = members.find(m => m.id === memberId);
      if (!target) {
        return res.status(404).json({ error: 'Target member not found in this group.' });
      }
      recipientsCount = 1;
    }

    const notification = db.recordGroupNotification(
      groupId,
      authUserId,
      message.trim(),
      recipientType || 'all',
      memberId,
      channel || 'whatsapp_handoff'
    );

    return res.json({
      success: true,
      message: `Notification prepared for ${recipientsCount} member(s) of ${group.group_name}.`,
      notification
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/users/:userId/groups', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const profile = db.getProfileById(userId) || db.getProfileByPhone(userId);
    const resolvedId = profile ? profile.id : userId;

    // Load from Firestore: query groups where owner_id == currentUserId OR members array-contains currentUserId
    const fsGroups = await fsGetGroupsForUser(resolvedId);
    for (const g of fsGroups) {
      db.syncRemoteGroup(g);
    }

    const userGroups = db.getUserGroups(resolvedId);
    return res.json({
      success: true,
      adminGroups: userGroups.adminGroups,
      memberGroups: userGroups.memberGroups,
      allGroups: userGroups.allGroups
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/users/:userId/admin-groups', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const profile = db.getProfileById(userId) || db.getProfileByPhone(userId);
    const resolvedId = profile ? profile.id : userId;

    // Load from Firestore
    const fsGroups = await fsGetGroupsForUser(resolvedId);
    for (const g of fsGroups) {
      db.syncRemoteGroup(g);
    }

    const groups = db.getAllGroups().filter(g => 
      g.admin_id === resolvedId || 
      (profile && g.admin_id === profile.id) ||
      (profile && g.whatsapp_number === profile.phone)
    );
    const enriched = groups.map(g => {
      const activeMems = db.getGroupMembers(g.id);
      return {
        ...g,
        membersCount: activeMems.length
      };
    });
    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// SUPER ADMIN ROUTES
// ----------------------------------------------------

apiRouter.get('/superadmin/metrics', (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string);
    const phone = (req.query.phone as string) || (req.headers['x-user-phone'] as string);
    const email = (req.query.email as string) || (req.headers['x-user-email'] as string);

    const superAdminPhone = '08154267469';
    const profile = (userId ? db.getProfileById(userId) : null) ||
                    (email ? db.getProfileByEmail(email) : null) ||
                    (phone ? db.getProfileByPhone(phone) : null);

    const cleanReqEmail = email ? email.trim().toLowerCase() : (profile?.email ? profile.email.trim().toLowerCase() : '');
    const isSuperAdminEmail = cleanReqEmail === 'realheavenict@gmail.com' || cleanReqEmail === 'superadmin@packajo.ng' || cleanReqEmail === 'paulakinyele54@gmail.com';
    const cleanReqPhone = phone ? normalizeNigerianPhone(phone) : (profile ? normalizeNigerianPhone(profile.phone) : '');

    const isAuthorized = (profile && profile.role === 'SUPER_ADMIN') ||
                         cleanReqPhone === superAdminPhone ||
                         isSuperAdminEmail;

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access Denied: Super Admin authorization is restricted to authorized credentials.'
      });
    }

    const metrics = db.getSuperAdminMetrics();
    return res.json(metrics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/superadmin/full-data', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string);
    const phone = (req.query.phone as string) || (req.headers['x-user-phone'] as string);
    const email = (req.query.email as string) || (req.headers['x-user-email'] as string);

    const superAdminPhone = '08154267469';
    let profile = (userId ? db.getProfileById(userId) : null) ||
                  (email ? db.getProfileByEmail(email) : null) ||
                  (phone ? db.getProfileByPhone(phone) : null);

    if (!profile && (phone || userId || email)) {
      try {
        const cleanP = phone ? normalizeNigerianPhone(phone) : '';
        const fsUser = userId ? await fsGetProfileById(userId) : null;
        const fsUserByPhone = (!fsUser && cleanP) ? await fsGetProfileByPhone(cleanP) : null;
        const fsCandidate = fsUser || fsUserByPhone;
        if (fsCandidate) {
          profile = db.upsertProfile(fsCandidate);
        }
      } catch {}
      if (!profile) {
        try {
          const remote = phone ? await fetchProfileByPhoneFromSupabase(phone) : (userId ? await fetchProfileByIdFromSupabase(userId) : null);
          if (remote) {
            profile = db.upsertProfile(remote);
          }
        } catch {}
      }
    }

    const cleanReqEmail = email ? email.trim().toLowerCase() : (profile?.email ? profile.email.trim().toLowerCase() : '');
    const isSuperAdminEmail = cleanReqEmail === 'realheavenict@gmail.com' || cleanReqEmail === 'superadmin@packajo.ng' || cleanReqEmail === 'paulakinyele54@gmail.com';
    const cleanReqPhone = phone ? normalizeNigerianPhone(phone) : (profile ? normalizeNigerianPhone(profile.phone) : '');
    const isAuthorized = (profile && profile.role === 'SUPER_ADMIN') || cleanReqPhone === superAdminPhone || isSuperAdminEmail;

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access Denied: Super Admin authorization is restricted to authorized credentials.'
      });
    }

    const data = db.getSuperAdminFullData(profile?.id, profile?.phone || superAdminPhone);
    try {
      const fsRev = await fsGetPlatformRevenueMain();
      if (fsRev) {
        data.superAdminEarnings = {
          ...data.superAdminEarnings,
          stream1_registration: fsRev.stream1,
          stream2_contribution: fsRev.stream2,
          stream3_packing: fsRev.stream3,
          stream4_withdrawal: fsRev.stream4,
          total_gross: fsRev.totalGross,
          total_withdrawn: fsRev.totalWithdrawn,
          available_balance: fsRev.unifiedAvailable,
          totalEarnings: fsRev.unifiedAvailable,
          total_earned: fsRev.totalGross,
          lifetimeEarned: fsRev.totalGross,
          unifiedAvailable: fsRev.unifiedAvailable
        };
        data.superAdminWallet = {
          ...data.superAdminWallet,
          total_gross_earnings: fsRev.totalGross,
          total_withdrawn: fsRev.totalWithdrawn,
          available_balance: fsRev.unifiedAvailable,
          stream1_registration: fsRev.stream1,
          stream2_contribution: fsRev.stream2,
          stream3_packing: fsRev.stream3,
          stream4_withdrawal: fsRev.stream4,
          total_gross: fsRev.totalGross,
          unifiedAvailable: fsRev.unifiedAvailable,
          breakdown: {
            reg_600_total: fsRev.stream1,
            contrib_60_total: fsRev.stream2,
            packing_33_total: fsRev.stream3,
            withdrawal_1_6_total: fsRev.stream4
          }
        };
        if (data.metrics) {
          data.metrics.superAdminAvailableBalance = fsRev.unifiedAvailable;
          data.metrics.totalSuperAdminEarnings = fsRev.totalGross;
          data.metrics.superAdminWithdrawnAmount = fsRev.totalWithdrawn;
          data.metrics.totalPersonalPlatformFees = fsRev.stream1;
          data.metrics.totalContributionFees = fsRev.stream2;
          data.metrics.superAdminCommission = fsRev.stream3;
          data.metrics.totalPersonalWithdrawalFees = fsRev.stream4;
        }
      }
    } catch (e) {
      console.warn('[superadmin/full-data] Error attaching Firestore revenue:', e);
    }
    if (!data.personalUsers || data.personalUsers.length === 0) {
      data.personalUsers = (db.getAllPersonalAjos ? db.getAllPersonalAjos() : db.data.personal_ajo || []).map(pa => {
        const u = db.getProfileById(pa.user_id);
        return {
          id: pa.id,
          user_id: pa.user_id,
          full_name: u?.full_name || 'Personal Saver',
          phone: u?.phone || '',
          email: u?.email,
          bank_name: u?.bank_name || 'Not provided',
          account_number: u?.account_number || 'Not provided',
          account_status: pa.status === 'active' ? 'Active' : 'Pending Fee',
          balance: pa.balance,
          total_deposited: pa.total_deposited,
          total_withdrawn: pa.total_withdrawn,
          created_at: pa.created_at
        };
      });
    }
    if (data.metrics) {
      data.metrics.personalAjoAccounts = data.personalUsers.length;
      if (!data.groups || data.groups.length === 0) {
        data.metrics.totalGroupAdminEarnings = 0;
        (data.metrics as any).totalGroupPackingFees = 0;
        data.metrics.totalPackingAmount = 0;
        (data.metrics as any).groupAdminCommissionTotal = 0;
      }
    }

    try {
      // SuperAdminFullData must read totals from same transactions collection filtering status==success only, so both dashboards match.
      const stats = await fsGetTotalsFromTransactions();
      data.platformStats = stats;
      if (data.metrics) {
        data.metrics.totalPersonalSavings = stats.totalPersonalSavings;
      }
    } catch (err) {}

    return res.json(data);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/superadmin/audit-logs', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string);
    const phone = (req.query.phone as string) || (req.headers['x-user-phone'] as string);
    const email = (req.query.email as string) || (req.headers['x-user-email'] as string);

    const superAdminPhone = '08154267469';
    let profile = (userId ? db.getProfileById(userId) : null) ||
                  (email ? db.getProfileByEmail(email) : null) ||
                  (phone ? db.getProfileByPhone(phone) : null);

    if (!profile && (phone || userId || email)) {
      try {
        const cleanP = phone ? normalizeNigerianPhone(phone) : '';
        const fsUser = userId ? await fsGetProfileById(userId) : null;
        const fsUserByPhone = (!fsUser && cleanP) ? await fsGetProfileByPhone(cleanP) : null;
        const fsCandidate = fsUser || fsUserByPhone;
        if (fsCandidate) {
          profile = db.upsertProfile(fsCandidate);
        }
      } catch {}
      if (!profile) {
        try {
          const remote = phone ? await fetchProfileByPhoneFromSupabase(phone) : (userId ? await fetchProfileByIdFromSupabase(userId) : null);
          if (remote) {
            profile = db.upsertProfile(remote);
          }
        } catch {}
      }
    }

    const cleanReqEmail = email ? email.trim().toLowerCase() : (profile?.email ? profile.email.trim().toLowerCase() : '');
    const isSuperAdminEmail = cleanReqEmail === 'realheavenict@gmail.com' || cleanReqEmail === 'superadmin@packajo.ng' || cleanReqEmail === 'paulakinyele54@gmail.com';
    const cleanReqPhone = phone ? normalizeNigerianPhone(phone) : (profile ? normalizeNigerianPhone(profile.phone) : '');
    const isAuthorized = (profile && profile.role === 'SUPER_ADMIN') || cleanReqPhone === superAdminPhone || isSuperAdminEmail;

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access Denied: Super Admin authorization is restricted to authorized credentials.'
      });
    }

    const logs = db.getAuditLogs();
    return res.json(logs);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post(['/superadmin/withdraw-earnings', '/super-admin-withdraw', '/super-admin/withdraw'], paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const {
      userId: bodyUserId,
      phone: bodyPhone,
      email: bodyEmail,
      amount,
      bankName,
      accountNumber,
      accountName,
      reference: clientReference
    } = req.body || {};

    const userId = bodyUserId || (req.headers['x-user-id'] as string);
    const phone = bodyPhone || (req.headers['x-user-phone'] as string);
    const email = bodyEmail || (req.headers['x-user-email'] as string);

    if (!userId && !phone && !email) {
      return res.status(401).json({
        error: 'Authentication Required: Explicit caller identity (email, userId or phone) must be provided.'
      });
    }

    const superAdminPhone = '08154267469';
    let profile = (userId ? db.getProfileById(userId) : null) ||
                  (email ? db.getProfileByEmail(email) : null) ||
                  (phone ? db.getProfileByPhone(phone) : null);

    if (!profile && (phone || userId || email)) {
      try {
        const cleanP = phone ? normalizeNigerianPhone(phone) : '';
        const fsUser = userId ? await fsGetProfileById(userId) : null;
        const fsUserByPhone = (!fsUser && cleanP) ? await fsGetProfileByPhone(cleanP) : null;
        const fsCandidate = fsUser || fsUserByPhone;
        if (fsCandidate) {
          profile = db.upsertProfile(fsCandidate);
        }
      } catch {}
    }

    if (!profile) {
      return res.status(403).json({
        error: 'Access Denied: Caller profile not found or unauthorized.'
      });
    }

    const profilePhoneClean = normalizeNigerianPhone(profile.phone);
    const cleanReqEmail = email ? email.trim().toLowerCase() : (profile?.email ? profile.email.trim().toLowerCase() : '');
    const isSuperAdminEmail = cleanReqEmail === 'realheavenict@gmail.com' || cleanReqEmail === 'superadmin@packajo.ng' || cleanReqEmail === 'paulakinyele54@gmail.com';
    const isSuperAdmin = profile.role === 'SUPER_ADMIN' || profilePhoneClean === superAdminPhone || isSuperAdminEmail;

    if (!isSuperAdmin) {
      return res.status(403).json({
        error: 'Access Denied: Only the authorized Super Admin can withdraw platform revenue.'
      });
    }

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount.' });
    }

    const fullData = db.getSuperAdminFullData(profile.id);
    let fsRev = null;
    try {
      fsRev = await fsGetPlatformRevenueMain();
    } catch {}
    const wallet = db.getSuperAdminWallet();
    const available = Math.max(
      Number(fullData.superAdminEarnings?.available_balance || 0),
      Number(fsRev?.unifiedAvailable || 0),
      Number(wallet?.available_balance || 0),
      Number((wallet as any)?.availableRevenue || 0),
      0
    );

    // Optical rounding tolerance: if user submitted Math.round(available) (e.g. 5267 when available is 5266.50)
    const effectiveAmount = (numericAmount > available && numericAmount <= Math.ceil(available) && (numericAmount - available) <= 1)
      ? available
      : numericAmount;

    if (effectiveAmount <= 0 || effectiveAmount > (available + 0.001)) {
      return res.status(400).json({
        error: `Amount exceeds available revenue balance of ₦${available.toFixed(2)}.`
      });
    }

    // Deterministic idempotency reference
    const reference = clientReference || `wth_sa_${profile.id}_${Math.round(effectiveAmount * 100)}`;

    // 1. Check if this withdrawal has already been completed locally or in Firestore
    let existingWithdrawal = db.getAllWithdrawals().find(w => w.reference === reference || w.id === reference);
    if (!existingWithdrawal) {
      existingWithdrawal = await fsGetWithdrawalByReference(reference).catch(() => null);
    }

    if (existingWithdrawal && (existingWithdrawal.status === 'completed' || existingWithdrawal.status === 'successful')) {
      return res.json({
        success: true,
        alreadyProcessed: true,
        message: 'This withdrawal has already been processed and confirmed.',
        withdrawal: existingWithdrawal
      });
    }

    const targetBank = bankName || profile.bank_name;
    const targetAccount = accountNumber || profile.account_number;
    const targetName = accountName || profile.full_name;

    // Pre-flight check: ensure cloud persistence is operational BEFORE moving money via Paystack
    if (isFirebaseConfigured()) {
      const persistenceStatus = await verifyFirestorePersistenceReady(3500);
      if (!persistenceStatus.ready) {
        return res.status(503).json({
          error: persistenceStatus.reason || 'Cloud database synchronization is temporarily unavailable. Please wait a moment and try again before submitting withdrawal.',
          retryable: true
        });
      }
    }

    // 2. Initiate Paystack transfer with reference to ensure idempotency across retries
    const transferResult = await initiatePaystackTransfer(
      targetAccount,
      targetBank,
      targetName,
      effectiveAmount,
      'Better Ajo Platform Super Admin Revenue Withdrawal',
      reference
    );

    // 3. Prepare candidate withdrawal and payment with completed status
    const { withdrawal, payment } = db.prepareSuperAdminWithdrawal(
      profile.id,
      effectiveAmount,
      transferResult,
      existingWithdrawal?.id
    );

    // Ensure status is completed on successful Paystack transfer
    withdrawal.status = 'completed';
    payment.status = 'success';

    // 4. Commit confirmed withdrawal to local database state and deduct from wallet immediately
    db.recordConfirmedWithdrawal(withdrawal, payment);
    db.createSuperAdminWithdrawalTransaction(effectiveAmount, reference);
    try {
      db.deductAdminRevenueWithdrawal(withdrawal, payment);
      db.withdrawFromSuperAdminEarnings(effectiveAmount, {
        description: `Super Admin Revenue Withdrawal to ${withdrawal.bank_name || 'Bank'}`,
        reference,
        withdrawalId: withdrawal.id
      });
    } catch (e: any) {
      console.warn('[superAdminEarnings withdraw warn]:', e?.message);
    }

    // 5. Cloud synchronization (Firestore & Supabase) with graceful non-blocking fallback
    fsExecuteAdminWithdrawalBatch(withdrawal, payment).catch(err => {
      console.warn('[Firestore Super Admin Withdrawal Sync Warn]:', err?.message || err);
    });
    syncWithdrawalToSupabase(withdrawal).catch(err => {
      console.warn('[Supabase Super Admin Withdrawal Sync Warn]:', err?.message || err);
    });
    syncPaymentRecordToSupabase(payment).catch(err => {
      console.warn('[Supabase Super Admin Payment Sync Warn]:', err?.message || err);
    });

    fsRecordSuperAdminWithdrawalDeduction(withdrawal).catch(err => {
      console.warn('[Firestore Withdrawal Deduction Warn]:', err?.message || err);
    });

    return res.json({
      success: true,
      message: transferResult.message || `Super Admin revenue of ₦${effectiveAmount.toLocaleString()} disbursed successfully!`,
      withdrawal
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Real balance audit for Super Admin Unified Revenue Wallet
apiRouter.post('/superadmin/audit-wallet', async (req: Request, res: Response) => {
  try {
    const auditResult = db.auditSuperAdminRealBalance();
    const wallet = db.getSuperAdminWallet();
    const ledger = db.getAdminRevenueLedger();
    return res.json({
      success: true,
      message: 'Super Admin real balance audit completed successfully.',
      audit: auditResult,
      wallet,
      ledger
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to audit super admin wallet' });
  }
});

apiRouter.get('/superadmin/audit-wallet', async (req: Request, res: Response) => {
  try {
    const wallet = db.getSuperAdminWallet();
    const ledger = db.getAdminRevenueLedger();
    return res.json({
      success: true,
      wallet,
      ledger
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch super admin wallet' });
  }
});

// Durable Real-Time Balance from Firestore
apiRouter.get('/user/:userId/balance', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const dbInst = getFirestoreDb();
    if (dbInst) {
      // Calculate from contributions, pack_transactions, and withdrawals (STEP 1)
      const cSnap = await dbInst.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS)
        .where('user_id', 'in', [userId])
        .get().catch(() => null);

      const ptxSnap = await dbInst.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS)
        .where('user_id', '==', userId)
        .get().catch(() => null);

      const wSnap = await dbInst.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS)
        .where('user_id', '==', userId)
        .get().catch(() => null);

      const deposits: any[] = [];
      if (cSnap) cSnap.docs.forEach((d: any) => deposits.push(d.data()));
      if (ptxSnap) ptxSnap.docs.forEach((d: any) => deposits.push(d.data()));

      const validDeposits = deposits.filter((doc: any) => {
        const s = String(doc.status || '').toLowerCase();
        const t = String(doc.type || doc.transactionType || '').toLowerCase();
        const isActivationFee = t.includes('registration') || t.includes('activation') || t.includes('fee_paid') || doc.category === 'ACTIVATION_FEE';
        if (isActivationFee && Number(doc.amount) === 600) return false;
        return (s === 'success' || s === 'credited' || s === 'completed') && (t.includes('deposit') || t.includes('savings') || Number(doc.amount) > 0);
      });

      const seenRefs = new Set<string>();
      let totalDeposited = 0;
      validDeposits.forEach((doc: any) => {
        const ref = doc.reference || doc.ref || doc.id;
        if (ref) {
          if (seenRefs.has(ref)) return;
          seenRefs.add(ref);
        }
        totalDeposited += Number(doc.amount || doc.savingsAmount || 0);
      });

      let totalWithdrawn = 0;
      if (wSnap) {
        wSnap.docs.forEach((d: any) => {
          const w = d.data();
          const s = String(w.status || '').toLowerCase();
          if (s === 'success' || s === 'completed' || s === 'approved' || s === 'disbursed') {
            totalWithdrawn += Number(w.amount || 0);
          }
        });
      }

      const availableSavings = Math.max(0, totalDeposited - totalWithdrawn);
      const uDoc = await dbInst.collection(FIRESTORE_COLLECTIONS.USERS).doc(userId).get().catch(() => null);
      const uData = uDoc && uDoc.exists ? uDoc.data() || {} : {};
      const fallbackBal = Number(uData.savingsBalance ?? uData.personalBalance ?? uData.balance ?? 0);
      const finalBalance = totalDeposited > 0 ? availableSavings : fallbackBal;

      return res.json({
        success: true,
        userId,
        personalBalance: finalBalance,
        balance: finalBalance,
        totalDeposited: totalDeposited > 0 ? totalDeposited : Number(uData.totalDeposited || 0),
        totalWithdrawn: totalWithdrawn > 0 ? totalWithdrawn : Number(uData.totalWithdrawn || 0),
        availableSavings: finalBalance
      });
    }
    // Fallback to in-memory db
    const personal = db.getPersonalAjoByUserId(userId);
    return res.json({
      success: true,
      userId,
      personalBalance: personal?.balance ?? 0,
      balance: personal?.balance ?? 0
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Real-Time Platform Revenue directly from Firestore collection
apiRouter.get('/superadmin/firestore-revenue', async (req: Request, res: Response) => {
  try {
    const dbInst = getFirestoreDb();
    if (!dbInst) {
      return res.status(503).json({ error: 'Firestore unavailable' });
    }
    const snap = await dbInst.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).get();
    let stream1_registration = 0;
    let stream2_contribution = 0;
    let stream3_packing = 0;
    let stream4_withdrawal = 0;
    let total_withdrawn = 0;
    const items: any[] = [];

    snap.forEach(doc => {
      const data = doc.data();
      const amt = Number(data.amount || 0);
      items.push({ id: doc.id, ...data });
      if (data.stream === 'STREAM_1_REGISTRATION') {
        stream1_registration += amt;
      } else if (data.stream === 'STREAM_2_CONTRIBUTION') {
        stream2_contribution += amt;
      } else if (data.stream === 'STREAM_3_PACKING') {
        stream3_packing += amt;
      } else if (data.stream === 'STREAM_4_WITHDRAWAL') {
        stream4_withdrawal += amt;
      } else if (data.stream === 'WITHDRAWAL_DEDUCTION') {
        total_withdrawn += Math.abs(amt);
      }
    });

    const total_gross = stream1_registration + stream2_contribution + stream3_packing + stream4_withdrawal;
    const available_balance = Math.max(0, total_gross - total_withdrawn);

    return res.json({
      success: true,
      source: 'firestore',
      stream1_registration,
      stream2_contribution,
      stream3_packing,
      stream4_withdrawal,
      total_gross,
      total_withdrawn,
      available_balance,
      count: snap.size,
      items
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Super Admin Wallet - 4 Streams & Available Revenue calculation (Requirement 5)
apiRouter.get(['/super-admin-wallet', '/super-admin/wallet', '/superadmin/wallet'], async (req: Request, res: Response) => {
  try {
    const fsDb = getFirestoreDb();
    let stream1 = 0;
    let stream2 = 0;
    let stream3 = 0;
    let stream4 = 0;
    let withdrawn = 0;

    if (fsDb) {
      // 0. Read authoritative platformRevenue/main doc if present
      try {
        const revDoc = await fsDb.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc('main').get();
        if (revDoc.exists) {
          const revData = revDoc.data() || {};
          if (revData.stream1 !== undefined) stream1 = Number(revData.stream1);
          if (revData.stream2 !== undefined) stream2 = Number(revData.stream2);
          if (revData.stream3 !== undefined) stream3 = Number(revData.stream3);
          if (revData.stream4 !== undefined) stream4 = Number(revData.stream4);
          if (revData.totalWithdrawn !== undefined) withdrawn = Number(revData.totalWithdrawn);
        }
      } catch {}

      // 1. stream1 = users count who paid activation fee * 600 (STEP 4)
      try {
        const usersSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.USERS).get();
        let activatedCount = 0;
        usersSnap.docs.forEach((d: any) => {
          const u = d.data();
          const role = (u.role || '').toLowerCase();
          if (role !== 'super_admin' && role !== 'superadmin') {
            if (u.isActivated || u.activationFeePaid || u.personal_ajo_active || (u.personal_ajo_fee_paid && Number(u.personal_ajo_fee_paid) > 0) || u.personal_ajo_activated_at) {
              activatedCount++;
            }
          }
        });
        const calcStream1 = activatedCount * 600;
        if (calcStream1 > stream1) stream1 = calcStream1;
      } catch {}

      // 2. stream2 = contributions count * 60 (Flat ₦60 per deposit, STEP 4)
      try {
        const contribSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.CONTRIBUTIONS)
          .where('status', 'in', ['Paid', 'success', 'successful', 'credited'])
          .get();
        const ptxContribSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.PACK_TRANSACTIONS)
          .where('type', 'in', ['contribution_fee', 'personal_deposit'])
          .where('status', '==', 'success')
          .get();
        const count = Math.max(contribSnap.docs.length, ptxContribSnap.docs.length);
        if (count * 60 > stream2) {
          stream2 = count * 60;
        }
      } catch {}

      // 3. stream3 = sum commissions super_admin packing_commission success
      try {
        const commSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.COMMISSIONS)
          .where('role', '==', 'super_admin')
          .get();
        commSnap.docs.forEach((d: any) => {
          const c = d.data();
          stream3 += Number(c.amount || c.super_admin_amount || 0);
        });
      } catch {}

      // 4. stream4 = sum type withdrawal_fee success
      try {
        const withSnap = await fsDb.collection(FIRESTORE_COLLECTIONS.WITHDRAWALS)
          .where('status', 'in', ['completed', 'successful', 'success'])
          .get();
        let userFeeSum = 0;
        let saWithdrawnSum = 0;
        withSnap.docs.forEach((d: any) => {
          const w = d.data();
          if (w.withdrawal_type === 'personal' || w.type === 'personal_withdrawal') {
            userFeeSum += Number(w.fee || Math.round(Number(w.amount || 0) * 0.016));
          } else if (w.withdrawal_type === 'super_admin_revenue' || w.type === 'super_admin_withdrawal') {
            saWithdrawnSum += Number(w.amount || 0);
          }
        });
        if (userFeeSum > stream4) stream4 = userFeeSum;
        if (saWithdrawnSum > withdrawn) withdrawn = saWithdrawnSum;
      } catch {}
    }

    // In-memory fallback if Firestore streams are 0
    if (stream1 === 0 && stream2 === 0 && stream3 === 0) {
      const audit = db.auditSuperAdminRealBalance();
      stream1 = audit.breakdown.reg_600_total;
      stream2 = audit.breakdown.contrib_60_total;
      stream3 = audit.breakdown.packing_33_total;
      stream4 = audit.breakdown.withdrawal_1_6_total;
      withdrawn = audit.total_withdrawn;
    }

    // Requirement: totalGross = stream1 + stream2 + stream3 + stream4 (all Number)
    const totalGross = Number(stream1) + Number(stream2) + Number(stream3) + Number(stream4);
    const availableRevenue = Math.max(0, totalGross - Number(withdrawn));

    // Self-healing synchronization to platformRevenue/main doc
    if (fsDb) {
      fsDb.collection(FIRESTORE_COLLECTIONS.PLATFORM_REVENUE).doc('main').set({
        stream1: Number(stream1),
        stream2: Number(stream2),
        stream3: Number(stream3),
        stream4: Number(stream4),
        totalGross: Number(totalGross),
        totalWithdrawn: Number(withdrawn),
        unifiedAvailable: Number(availableRevenue),
        lastUpdated: new Date().toISOString()
      }, { merge: true }).catch((e: any) => console.warn('[Auto-heal platformRevenue sync warn]:', e?.message));
    }

    return res.json({
      success: true,
      stream1: Number(stream1),
      stream2: Number(stream2),
      stream3: Number(stream3),
      stream4: Number(stream4),
      totalGross: Number(totalGross),
      total_gross: Number(totalGross),
      withdrawn: Number(withdrawn),
      total_withdrawn: Number(withdrawn),
      availableRevenue: Number(availableRevenue),
      available_balance: Number(availableRevenue)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Wipe Test Data API (Requirement 1 & 7)
apiRouter.post(['/admin/wipe-test-data', '/superadmin/wipe-test-data', '/wipe-test-data'], async (req: Request, res: Response) => {
  try {
    const result = await wipeTestData();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Wipe failed' });
  }
});

apiRouter.post('/superadmin/reconcile-financial-records', paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const {
      userId: bodyUserId,
      phone: bodyPhone,
      dryRun = true
    } = req.body || {};

    const userId = bodyUserId || (req.headers['x-user-id'] as string);
    const phone = bodyPhone || (req.headers['x-user-phone'] as string);

    if (!userId && !phone) {
      return res.status(401).json({
        error: 'Authentication Required: Explicit caller identity (userId or phone) must be provided.'
      });
    }

    const superAdminPhone = '08154267469';
    let profile = (userId ? db.getProfileById(userId) : null) || (phone ? db.getProfileByPhone(phone) : null);

    if (!profile && (phone || userId)) {
      try {
        const cleanP = phone ? normalizeNigerianPhone(phone) : '';
        const fsUser = userId ? await fsGetProfileById(userId) : null;
        const fsUserByPhone = (!fsUser && cleanP) ? await fsGetProfileByPhone(cleanP) : null;
        const fsCandidate = fsUser || fsUserByPhone;
        if (fsCandidate) {
          profile = db.upsertProfile(fsCandidate);
        }
      } catch {}
    }

    if (!profile) {
      return res.status(403).json({
        error: 'Access Denied: Caller profile not found or unauthorized.'
      });
    }

    const profilePhoneClean = normalizeNigerianPhone(profile.phone);
    const isSuperAdmin = profile.role === 'SUPER_ADMIN' && profilePhoneClean === superAdminPhone;

    if (!isSuperAdmin) {
      return res.status(403).json({
        error: 'Access Denied: Only the authorized Super Admin can execute financial reconciliation.'
      });
    }

    const allPayments = db.getAllPayments();
    const pendingPayments = allPayments.filter(p => p.status === 'pending');
    const results: Array<{
      reference: string;
      user_id: string;
      type: string;
      amount: number;
      action: string;
      status: string;
    }> = [];

    for (const payment of pendingPayments) {
      if (!payment.reference) continue;

      try {
        const verifyRes = await verifyPaystackPayment(payment.reference);
        if (verifyRes.success) {
          if (dryRun) {
            results.push({
              reference: payment.reference,
              user_id: payment.user_id,
              type: payment.type,
              amount: payment.amount,
              action: 'WOULD_REPAIR',
              status: 'Verified on Paystack, pending cloud confirmation'
            });
          } else {
            payment.status = 'success';
            payment.updated_at = new Date().toISOString();
            await fsUpsertPayment(payment);
            db.updatePaymentStatus(payment.reference, 'success', 'Reconciled and confirmed with Paystack');

            results.push({
              reference: payment.reference,
              user_id: payment.user_id,
              type: payment.type,
              amount: payment.amount,
              action: 'REPAIRED',
              status: 'Success'
            });
          }
        }
      } catch {
        // Ignore single record check error
      }
    }

    return res.json({
      success: true,
      dryRun: Boolean(dryRun),
      scannedCount: pendingPayments.length,
      reconciledCount: results.length,
      results
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Reconciliation failed' });
  }
});

// ----------------------------------------------------
// LIVE CUSTOMER SUPPORT CHAT (BETTER AJO)
// ----------------------------------------------------

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

const SUPPORT_SYSTEM_PROMPT = `You are the official 24/7 Live Customer Support Assistant for "Better Ajo" (Nigeria's leading, transparent digital savings and rotating ajo credit platform).
Your role is to assist visitors, personal savers, group members, and group admins with courteous, helpful, reassuring, and concise answers in Nigerian and global English.

Key platform facts about Better Ajo:
1. Two Products Only:
   - "Personal Better Ajo": Individual savings plan. One-time ₦600 registration fee paid securely via Paystack. Savers choose daily, weekly, or monthly savings frequency, set a target amount, lock funds safely, and withdraw directly to their verified Nigerian bank account with secure password authorization (1.6% transparent withdrawal processing fee).
   - "Group Better Ajo": Rotating community thrift (Ajo/Esusu/Adashi) with ₦0 joining fee for contributors! The group creator/admin sets the cycle interval (Daily, Weekly, Monthly), contribution amount (e.g. ₦10,000, ₦20,000, ₦50,000, etc.), and slot count.
2. Rotation Positions & Payouts:
   - Order of joining determines rotation position automatically (Position 1, Position 2, etc.) ensuring total fairness and zero favoritism.
   - Payout dates are strictly calculated using the Nigeria calendar.
   - When all members contribute for a round, the scheduled member collects their lump sum.
   - Group fee (₦3,000) is deducted only when a member packs their payout.
   - Completed cycles offer a seamless "Start Second Round" feature where returning members retain their slots.
3. Security & Payments:
   - Paystack certified payment gateway for bank cards, transfers, and USSD.
   - Verified Nigerian bank accounts and secure password authorization.
   - NDPR compliant data protection.
4. Escalation & WhatsApp Contact:
   - Dedicated WhatsApp Customer Service: +44 7451 298096 (chat-only link: https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me.)
   - Email: support@betterajo.ng
   - Always inform users that if they need manual account dispute resolution, payout reconciliation, or personal intervention, they can instantly open WhatsApp chat with the customer care team at +44 7451 298096.

Guidelines:
- Keep answers warm, friendly, concise, easy to read, with bold highlights for key steps.
- Always refer to the platform as "Better Ajo".
- If user asks how to contact support, provide both this Live Chat and the WhatsApp number: +44 7451 298096.`;

apiRouter.post('/support/chat', async (req: Request, res: Response) => {
  try {
    const { message, history, user, sessionId } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const cleanUserPhone = user?.phone ? user.phone.replace(/\s+/g, '').replace(/^\+234/, '0') : undefined;
    const activeSessionId = sessionId || cleanUserPhone || 'guest_chat_session';
    const userName = user?.name || user?.full_name || 'Customer';

    // 1. Save user's incoming message to persistent database
    const userMsg = db.addSupportMessage({
      session_id: activeSessionId,
      user_id: user?.id,
      user_name: userName,
      user_phone: cleanUserPhone,
      sender: 'user',
      text: message.trim()
    });

    let replyText = '';
    let source = 'knowledge_engine';

    const client = getGeminiClient();
    if (client) {
      try {
        const contents: any[] = [];

        if (Array.isArray(history) && history.length > 0) {
          for (const item of history.slice(-6)) {
            contents.push({
              role: item.role === 'user' ? 'user' : 'model',
              parts: [{ text: String(item.text || item.content || '') }]
            });
          }
        }

        contents.push({
          role: 'user',
          parts: [{ text: message }]
        });

        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction: SUPPORT_SYSTEM_PROMPT,
            temperature: 0.4,
            maxOutputTokens: 500
          }
        });

        const text = response.text || '';
        if (text.trim()) {
          replyText = text.trim();
          source = 'ai';
        }
      } catch (aiErr: any) {
        console.warn('Gemini API call warning in support chat, falling back to knowledge engine:', aiErr?.message);
      }
    }

    // High-resilience rule-based fallback knowledge engine if AI did not return a reply
    if (!replyText) {
      const lower = message.toLowerCase();

      if (lower.includes('personal') || lower.includes('600') || lower.includes('registration fee')) {
        replyText = `**Personal Better Ajo** is your private digital savings wallet:\n\n• **One-time fee**: ₦600 registration fee paid securely via Paystack.\n• **Flexible Savings**: Deposit daily, weekly, or monthly towards your targeted goal.\n• **Safe Withdrawals**: Withdraw your balance anytime to your verified Nigerian bank account with secure password authorization (1.6% processing fee).`;
      } else if (lower.includes('group') || lower.includes('joining fee') || lower.includes('create group')) {
        replyText = `**Group Better Ajo** offers seamless rotating thrift contributions:\n\n• **₦0 Joining Fee**: Free for all contributors to join with an invite code.\n• **₦0 Group Creation**: Free for Admins to create and manage their groups.\n• **Transparent Rotations**: Positions are locked based on join order (Position 1, 2, etc.) to guarantee zero favoritism.\n• **Lump Sum Packing**: When each round's pool is complete, the scheduled member packs their payout.`;
      } else if (lower.includes('rotation') || lower.includes('turn') || lower.includes('position') || lower.includes('payout date')) {
        replyText = `**Better Ajo Rotation Schedule**:\n\n• Positions are assigned automatically in chronological order when joining the group.\n• Each cycle date is calculated using Nigeria calendar intervals.\n• Payouts are transferred directly into the member's verified Nigerian bank account.\n• When all members complete their turns, the Admin can launch the "Start Second Round" for ongoing cycles.`;
      } else if (lower.includes('withdraw') || lower.includes('bank') || lower.includes('account')) {
        replyText = `**Withdrawals on Better Ajo**:\n\n• For Personal Ajo, you can request a withdrawal at any time from your Personal Dashboard.\n• Payouts are made directly into your registered Nigerian bank account.\n• Every withdrawal requires your login password for authorization.`;
      } else if (lower.includes('paystack') || lower.includes('payment') || lower.includes('card') || lower.includes('deposit')) {
        replyText = `**Better Ajo Payments**:\n\n• All payments and debit card transactions are secured by **Paystack** (PCI-DSS certified).\n• We support Nigerian debit/credit cards, bank transfers, and USSD.\n• Better Ajo never stores your card PINs or CVVs.`;
      } else if (lower.includes('contact') || lower.includes('whatsapp') || lower.includes('phone') || lower.includes('call') || lower.includes('help') || lower.includes('human') || lower.includes('agent')) {
        replyText = `Our **Better Ajo Live Support Desk** is active right here in this chat to assist you with any questions or account operations.\n\n• You can message us anytime in this window.\n• If you need WhatsApp support as an alternative channel, our official customer service line is **+44 7451 298096**.\n• Email: **support@betterajo.ng**`;
      } else {
        replyText = `Welcome to **Better Ajo Customer Support**!\n\nBetter Ajo makes Nigerian personal savings and rotating group ajo reliable, automated, and secure.\n\n• **Personal Ajo**: ₦600 one-time activation, daily/weekly/monthly savings.\n• **Group Ajo**: ₦0 joining fee, automatic rotation positions, and transparent lump-sum payouts.\n• **Live Customer Care**: We are right here in this chat to answer your questions or assist with your account.`;
      }
    }

    // 2. Save assistant reply to persistent database
    const assistantMsg = db.addSupportMessage({
      session_id: activeSessionId,
      user_id: user?.id,
      user_name: userName,
      user_phone: cleanUserPhone,
      sender: 'assistant',
      sender_name: 'Better Ajo Support',
      text: replyText
    });

    return res.json({
      success: true,
      reply: replyText,
      source,
      userMessage: userMsg,
      agentMessage: assistantMsg,
      supportWhatsApp: '+44 7451 298096',
      whatsAppLink: 'https://wa.me/447451298096?text=Hello%20Better%20Ajo%20Customer%20Service%2C%20I%20need%20assistance%20with%20my%20Better%20Ajo%20account.%20Please%20help%20me.'
    });
  } catch (err: any) {
    console.error('Support chat error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process chat message' });
  }
});

apiRouter.get('/support/messages', (req: Request, res: Response) => {
  try {
    const sessionId = (req.query.sessionId as string) || (req.query.phone as string);
    if (!sessionId) {
      return res.json({ success: true, messages: [] });
    }
    const cleanSessionId = sessionId.replace(/\s+/g, '').replace(/^\+234/, '0');
    const messages = db.getSupportMessages(cleanSessionId);
    return res.json({ success: true, messages });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/support/conversations', (req: Request, res: Response) => {
  try {
    const conversations = db.getAllSupportConversations();
    return res.json({ success: true, conversations });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/support/reply', (req: Request, res: Response) => {
  try {
    const { sessionId, text, supportName } = req.body;
    if (!sessionId || !text || !text.trim()) {
      return res.status(400).json({ error: 'Session ID and non-empty text are required.' });
    }
    const cleanSessionId = sessionId.replace(/\s+/g, '').replace(/^\+234/, '0');
    const reply = db.replySupportMessage(cleanSessionId, text.trim(), supportName);
    db.markSupportConversationRead(cleanSessionId);
    return res.json({ success: true, message: reply });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/support/mark-read', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      const cleanSessionId = sessionId.replace(/\s+/g, '').replace(/^\+234/, '0');
      db.markSupportConversationRead(cleanSessionId);
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/admin/reset-database', '/reset-database', '/api/reset-database'], async (req: Request, res: Response) => {
  try {
    const fsDb = getFirestoreDb();
    let fsReport: Record<string, number> = {};

    if (fsDb) {
      // 1. Enumerate and delete all documents in every Firestore root collection using Admin SDK
      const rootCollections = await fsDb.listCollections().catch(() => []);
      for (const col of rootCollections) {
        try {
          if (col.id === 'users' || col.id === 'profiles') {
            const snap = await col.get();
            let colDeleted = 0;
            for (const d of snap.docs) {
              const uData = d.data();
              const phone = String(uData.phone || uData.phoneNumber || '');
              const email = String(uData.email || '');
              const role = String(uData.role || '').toLowerCase();
              if (phone.includes('8154267469') || role.includes('super_admin') || role.includes('superadmin') || email.includes('paulakinyele54@gmail.com')) {
                continue; // preserve Super Admin account!
              }
              await d.ref.delete().catch(() => {});
              colDeleted++;
            }
            fsReport[col.id] = colDeleted;
          } else if (col.id === 'platformRevenue') {
            const snap = await col.get();
            for (const d of snap.docs) {
              if (d.id !== 'main') await d.ref.delete().catch(() => {});
            }
            fsReport[col.id] = snap.docs.length;
          } else if (col.id === 'platformStats') {
            const snap = await col.get();
            for (const d of snap.docs) {
              if (d.id !== 'main') await d.ref.delete().catch(() => {});
            }
            fsReport[col.id] = snap.docs.length;
          } else {
            const snap = await col.get();
            let colDeleted = 0;
            for (const d of snap.docs) {
              if (typeof (fsDb as any).recursiveDelete === 'function') {
                await (fsDb as any).recursiveDelete(d.ref).catch(async () => {
                  await d.ref.delete().catch(() => {});
                });
              } else {
                await d.ref.delete().catch(() => {});
              }
              colDeleted++;
            }
            fsReport[col.id] = colDeleted;
          }
        } catch (colErr) {
          console.warn(`[Reset-Database Admin SDK] Error on ${col.id}:`, colErr);
        }
      }

      // Aggressive explicit purge for group_admin_earnings and related ghost collections
      const aggressivePurgeCols = [
        'group_admin_earnings',
        'admin_earnings',
        'group_atme',
        'group_admin_fees',
        'groupAdminEarnings',
        'adminEarnings',
        'super_atme_ledger',
        'super_admin_revenue',
        'superAdminEarnings',
        'pack_transactions',
        'packing_payouts',
        'commissions'
      ];
      for (const colName of aggressivePurgeCols) {
        try {
          let count = 0;
          while (true) {
            const snap = await fsDb.collection(colName).limit(300).get();
            if (snap.empty) break;
            const batch = fsDb.batch();
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            count += snap.size;
          }
          fsReport[colName] = count;
        } catch (e) {
          console.warn(`[Reset-Database Admin SDK] Purge error on ${colName}:`, e);
        }
      }

      // Explicitly reset platformRevenue and platformStats documents to zero
      try {
        await fsDb.collection('platformRevenue').doc('main').set({
          stream1: 0,
          stream2: 0,
          stream3: 0,
          stream4: 0,
          totalGross: 0,
          totalWithdrawn: 0,
          unifiedAvailable: 0,
          groupAdminFees: 0,
          lastUpdated: FieldValue.serverTimestamp()
        });
        await fsDb.collection('platformStats').doc('main').set({
          totalPersonalSavings: 0,
          totalPersonalSavers: 0,
          groupAdminFees: 0,
          totalGroupAdminFees: 0,
          totalGroupAdminEarnings: 0,
          totalPersonalDeposits: 0,
          totalPersonalWithdrawn: 0,
          lastUpdated: new Date().toISOString()
        });
      } catch (statErr) {
        console.warn('[Reset-Database Admin SDK] platform stats reset warn:', statErr);
      }
    }

    // 2. Wipe server in-memory database completely
    db.data.groups = [];
    db.data.group_members = [];
    db.data.contributions = [];
    db.data.pack_transactions = [];
    db.data.commissions = [];
    db.data.withdrawals = [];
    db.data.personal_ajo = [];
    db.data.payments = [];
    db.data.personal_transactions = [];
    db.data.super_admin_transactions = [];
    db.data.audit_logs = [];
    db.data.admin_revenue_ledger = [];
    db.data.group_notifications = [];
    db.data.support_messages = [];
    db.data.groupAdminRevenue = 0;
    db.data.superAdminRevenue = 0;
    (db.data as any).transactions = [];

    // Filter profiles: preserve only authorized Super Admin
    db.data.profiles = (db.data.profiles || []).filter(p => {
      const phone = String(p.phone || '');
      const email = String(p.email || '');
      const role = String(p.role || '').toUpperCase();
      return phone.includes('8154267469') || role.includes('SUPER_ADMIN') || email.includes('paulakinyele54@gmail.com');
    });
    db.data.super_admin_wallet = {
      available_balance: 0,
      total_gross_earnings: 0,
      total_withdrawn: 0,
      breakdown: {
        reg_600_total: 0,
        contrib_60_total: 0,
        packing_33_total: 0,
        withdrawal_1_6_total: 0
      },
      updated_at: new Date().toISOString()
    };
    db.data.superAdminEarnings = {
      totalEarnings: 0,
      available_balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
      totalWithdrawn: 0,
      lifetimeEarned: 0,
      personalPlatformFeesMerged: true,
      pending_withdrawals: 0,
      breakdown: [],
      history: [],
      updated_at: new Date().toISOString()
    };

    // Save empty state to packajo_db.json
    db.save();

    return res.json({
      success: true,
      message: 'Server database and Firestore permanently reset to ZERO.',
      firestoreDeleted: fsReport
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Periodic Cloud Function Sync: Sum all personal_ajo balances into platformStats/main
setTimeout(() => {
  aggregatePersonalAjoSavings().catch(err => console.warn('[PlatformStats aggregation on startup error]:', err?.message || err));
}, 3000);
setInterval(() => {
  aggregatePersonalAjoSavings().catch(err => console.warn('[PlatformStats aggregation interval error]:', err?.message || err));
}, 60000);

