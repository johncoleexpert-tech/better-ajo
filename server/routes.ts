import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { Contribution, PaymentRecord, GroupMember, Withdrawal } from '../src/types/index.js';
import { db, getNigeriaCalendarDate, addCycleIntervalToCalendarDate, formatCalendarDateDisplay, normalizeNigerianPhone } from './db.js';
import { initializePaystackPayment, verifyPaystackPayment, setTestPaymentCharge, initiatePaystackTransfer } from './paystack.js';
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
  fsUpsertGroup,
  fsGetGroupById,
  fsGetGroupByCode,
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
  fsExecuteContributionBatch,
  fsExecuteWithdrawalBatch,
  fsExecuteAdminWithdrawalBatch,
  fsLogAuditEvent,
  fsSaveOtp,
  fsVerifyOtp,
  fsDeleteOtp,
  verifyFirestorePersistenceReady,
  FIRESTORE_COLLECTIONS
} from './firebase.js';

export const apiRouter = Router();

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

      // Check for Super Admin auto-resolution
      if (!profile && (cleanEmail === 'superadmin@packajo.ng' || cleanEmail === 'paulakinyele54@gmail.com')) {
        profile = db.getProfiles().find(p => p.role === 'SUPER_ADMIN') || db.upsertProfile({
          full_name: 'Super Administrator',
          phone: '08154267469',
          email: cleanEmail,
          password: password,
          bank_name: 'Guaranty Trust Bank (GTB)',
          account_number: '0123456789',
          verification_type: 'NIN',
          verification_number: '12345678901',
          role: 'SUPER_ADMIN'
        });
      }

      if (!profile) {
        return res.status(404).json({
          error: 'No account found for this email address. Please sign up first.',
          isNewUser: true,
          email: cleanEmail
        });
      }

      // Verify password if one exists on profile; otherwise set it on first login
      if (profile.password) {
        if (profile.password !== password) {
          return res.status(401).json({ error: 'Incorrect password. Please verify your credentials and try again.' });
        }
      } else {
        // Set password for existing demo profiles
        profile.password = password;
        db.upsertProfile(profile);
      }

      const personal = db.getPersonalAjoByUserId(profile.id);
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

    const personal = db.getPersonalAjoByUserId(profile.id);
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

    const existing = db.getProfileByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists. Please log in.' });
    }

    const cleanPhone = phone ? normalizeNigerianPhone(phone) : `080${Math.floor(10000000 + Math.random() * 90000000)}`;
    const isSuperAdminEmail = cleanEmail === 'superadmin@packajo.ng' || cleanEmail === 'paulakinyele54@gmail.com';

    const profile = db.upsertProfile({
      full_name: (full_name && full_name.trim()) ? full_name.trim() : cleanEmail.split('@')[0],
      email: cleanEmail,
      password: password,
      phone: cleanPhone,
      bank_name: bank_name || 'Guaranty Trust Bank (GTB)',
      account_number: account_number || '0123456789',
      verification_type: verification_type || 'BVN',
      verification_number: verification_number || '12345678901',
      role: isSuperAdminEmail ? 'SUPER_ADMIN' : 'MEMBER'
    });

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

    const profile = db.upsertProfile({
      full_name: full_name.trim(),
      phone: cleanPhone,
      bank_name: bank_name.trim(),
      account_number: account_number.trim(),
      verification_type,
      verification_number: verification_number.trim(),
      email: email ? email.trim() : undefined,
      password: password || undefined
    });

    await syncProfileToSupabase(profile).catch(() => {});
    await fsUpsertProfile(profile).catch(() => {});

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
      otp_code
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
      password: password || undefined
    });

    // Create Personal Ajo in pending_fee status
    const personalAjo = db.createPersonalAjo(profile.id);

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

apiRouter.post('/personal/verify-fee', paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, reference } = req.body;
    if (!userId || !reference) {
      return res.status(400).json({ error: 'userId and reference are required' });
    }

    const authUserId = (req.headers['x-user-id'] as string);
    if (authUserId && authUserId !== userId) {
      return res.status(403).json({ error: 'Security violation: Cannot verify payment for another user account.' });
    }

    // 5. PREVENT DUPLICATE PROCESSING (Requirement 5):
    // The same Paystack reference must never activate the Personal Better Ajo twice.
    // If the reference has already been successfully processed, confirm cloud persistence and return existing.
    const existingPayment = db.getPaymentByReference(reference);
    if (existingPayment && existingPayment.status === 'success') {
      const personalAjo = db.activatePersonalAjo(userId);
      const confirmed = await fsExecuteDepositBatch(existingPayment, personalAjo);
      if (!confirmed) {
        console.error(`[Personal Fee Retry] Cloud persistence unconfirmed for ref: ${reference}`);
        return res.status(503).json({
          error: 'Payment was verified, but cloud record persistence could not be confirmed. Please retry in a few moments.',
          retryable: true,
          reference
        });
      }
      return res.json({
        success: true,
        message: 'Payment already verified and Personal Better Ajo is active.',
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
      // Return clear, actionable error for failed/abandoned/pending/reversed transactions
      return res.status(400).json({
        error: verification.message || 'Payment verification failed',
        status: verification.status,
        gatewayResponse: verification.gateway_response,
        reference
      });
    }

    // Payment verified successfully! Activate the Personal Better Ajo
    const personalAjo = db.activatePersonalAjo(userId);
    syncPersonalAjoToSupabase(personalAjo).catch(() => {});

    // CRITICAL WRITE CONFIRMATION:
    // Both payment record and activated personalAjo MUST be confirmed in Firestore before reporting success
    const confirmed = updatedPayment
      ? await fsExecuteDepositBatch(updatedPayment, personalAjo)
      : await fsUpsertPersonalAjo(personalAjo);

    if (!confirmed) {
      console.error(`[Personal Fee] Firestore write failed for ref: ${reference}, userId: ${userId}`);
      return res.status(503).json({
        error: 'Payment was verified successfully with Paystack, but cloud record persistence could not be confirmed safely. Please click retry to finalize activation.',
        retryable: true,
        reference
      });
    }

    // Record audit
    db.recordAudit({
      event_type: 'PERSONAL_AJO_ACTIVATED',
      user_id: userId,
      ip_address: req.ip,
      details: { reference, fee: 600 }
    });

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

    return res.json({
      success: true,
      message: 'Personal Better Ajo activated successfully!',
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

    // IDEMPOTENCY CHECK: If already successfully processed, confirm Firestore and return without double-crediting
    let existingPayment = db.getPaymentByReference(reference);
    if (!existingPayment) {
      existingPayment = await fsGetPaymentByReference(reference).catch(() => null);
    }

    if (existingPayment && existingPayment.status === 'success') {
      let personal = db.getPersonalAjoByUserId(userId);
      if (!personal) {
        personal = await fsGetPersonalAjoByUserId(userId).catch(() => null);
        if (personal) {
          (db as any).data.personal_ajo.push(personal);
          db.save();
        }
      }
      if (personal) {
        const remotePayment = await fsGetPaymentByReference(reference).catch(() => null);
        let confirmed = Boolean(remotePayment?.status === 'success');
        if (!confirmed) {
          confirmed = await fsExecuteDepositBatch(existingPayment, personal);
        }
        return res.json({
          success: true,
          message: 'Deposit already verified and credited to your savings.',
          alreadyProcessed: true,
          personalAjo: personal,
          cloudConfirmed: confirmed
        });
      }
    }

    const transactionFee = 60;
    const expectedKobo = Math.round((numAmount + transactionFee) * 100);
    const verification = await verifyPaystackPayment(reference, expectedKobo);
    if (!verification.success) {
      return res.status(400).json({ error: verification.message || 'Payment verification failed on server.' });
    }

    // CROSS-VERCEL-INSTANCE PAYMENT RECONSTRUCTION:
    // Do not depend on a payment record existing in local server memory.
    let paymentRec = db.getPaymentByReference(reference);
    if (!paymentRec) {
      const fsPayment = await fsGetPaymentByReference(reference).catch(() => null);
      if (fsPayment) {
        paymentRec = fsPayment;
      } else {
        paymentRec = {
          id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          user_id: userId,
          purpose: 'personal_savings_deposit',
          amount: numAmount,
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

    paymentRec.status = 'success';
    paymentRec.gateway_response = verification.data?.gateway_response || 'Successful';
    paymentRec.paid_at = verification.data?.paid_at || new Date().toISOString();
    paymentRec.channel = verification.data?.channel || 'card';
    paymentRec.updated_at = new Date().toISOString();
    db.save();
    syncPaymentRecordToSupabase(paymentRec).catch(() => {});

    // Ensure Personal Ajo account is available locally
    let personal = db.getPersonalAjoByUserId(userId);
    if (!personal) {
      const fsPersonal = await fsGetPersonalAjoByUserId(userId).catch(() => null);
      if (fsPersonal) {
        personal = fsPersonal;
        (db as any).data.personal_ajo.push(personal);
        db.save();
      }
    }

    // Deposit the savings amount into user's personal ajo (fee is not deducted from savings)
    personal = db.depositPersonalAjo(userId, numAmount);
    syncPersonalAjoToSupabase(personal).catch(() => {});

    // CRITICAL WRITE CONFIRMATION with 3-tier resilience:
    let confirmed = await fsExecuteDepositBatch(paymentRec, personal);
    if (!confirmed) {
      const remotePayment = await fsGetPaymentByReference(reference).catch(() => null);
      if (remotePayment?.status === 'success') {
        confirmed = true;
      }
    }

    if (!confirmed) {
      console.error(`[Personal Deposit] Firestore persistence failed for ref: ${reference}, userId: ${userId}`);
      return res.status(503).json({
        error: 'Deposit was verified with Paystack, but cloud synchronization could not be confirmed safely. Please click retry to confirm your balance.',
        retryable: true,
        reference
      });
    }

    // Audit log
    db.recordAudit({
      event_type: 'PERSONAL_DEPOSIT_COMPLETED',
      user_id: userId,
      ip_address: req.ip,
      details: { amount: numAmount, reference, newBalance: personal.balance }
    });

    return res.json({ success: true, personalAjo: personal });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/personal/withdraw', paymentRateLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, amount, password, otp_code } = req.body;
    const numAmount = Number(amount);
    if (!userId || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required.' });
    }

    const authUserId = (req.headers['x-user-id'] as string);
    if (authUserId && authUserId !== userId) {
      return res.status(403).json({ error: 'Security violation: Cannot withdraw from another user account.' });
    }

    const profile = db.getProfileById(userId);
    if (!profile) return res.status(404).json({ error: 'User profile not found.' });

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

    // 1.6% withdrawal fee
    const fee = Math.round(numAmount * 0.016);
    const netAmount = numAmount - fee;

    const result = db.withdrawPersonalAjo(
      userId,
      numAmount,
      fee,
      netAmount,
      profile.bank_name,
      profile.account_number
    );

    // CRITICAL WRITE CONFIRMATION:
    // Both withdrawal record and deducted personal balance MUST be confirmed in Firestore
    const confirmed = await fsExecuteWithdrawalBatch(result.withdrawal, result.personal);
    if (!confirmed) {
      console.error(`[Personal Withdraw] Firestore persistence failed for withdrawal: ${result.withdrawal.id}, rolling back local balance`);
      db.rollbackPersonalWithdrawal(userId, result.withdrawal.id, numAmount);
      return res.status(503).json({
        error: 'Withdrawal could not be confirmed safely in cloud storage. Your balance has been preserved. Please try again in a few moments.'
      });
    }

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

    // STEP 2 - Record Personal Ajo 1.6% Withdrawal Fee in Super Admin Revenue Ledger
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
    }

    return res.json({
      success: true,
      message: `₦${netAmount.toLocaleString()} has been sent to ${profile.bank_name} (${profile.account_number})`,
      personalAjo: result.personal,
      withdrawal: result.withdrawal
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
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
      packing_fee
    } = req.body;

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

    const result = db.createGroup({
      admin_id,
      admin_name: admin_name.trim(),
      group_name: group_name.trim(),
      member_limit: limit,
      contribution_amount: contrib,
      cycle_type,
      packing_fee: fee
    });

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
      adminProfile
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
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
      otp_code
    } = req.body;

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

apiRouter.get('/groups/:groupId/dashboard', (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.query;
    const simulatedDate = (req.headers['x-simulated-date'] as string) || (req.query.simulatedDate as string);

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

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

      return {
        id: m.id,
        user_id: m.user_id,
        full_name: m.full_name,
        position: m.position,
        status: m.status,
        isPacked,
        hasPackedThisRound: Boolean(m.hasPackedThisRound || isPacked),
        hasContributed,
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

    const userMember = rawUserMember ? {
      ...rawUserMember,
      isPacked: db.isMemberPacked(groupId, rawUserMember.id, group.current_round),
      hasPackedThisRound: Boolean(rawUserMember.hasPackedThisRound || db.isMemberPacked(groupId, rawUserMember.id, group.current_round)),
      hasContributed: db.hasMemberPaidCurrentCycle(groupId, rawUserMember.id, group.current_round, simulatedDate),
      current_round_status: db.isMemberPacked(groupId, rawUserMember.id, group.current_round)
        ? ('packed' as const)
        : (db.hasMemberPaidCurrentCycle(groupId, rawUserMember.id, group.current_round, simulatedDate) ? ('contributed' as const) : ('pending_contribution' as const))
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
        allPaid: cycleStatus.allPaid
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

    // If cycle is not open yet, do not allow contributions for a future cycle
    if (!cycleInfo.isCycleOpen) {
      return res.status(400).json({
        error: `The next contribution cycle (${group.cycle_type}) opens on ${cycleInfo.scheduledPackDateDisplay} (${cycleInfo.cycleOpenDate}). No payment is required today.`
      });
    }

    // Check if member has already paid for this active cycle
    const alreadyPaidCurrent = db.hasMemberPaidCurrentCycle(groupId, member.id, group.current_round, simulatedDate);
    if (alreadyPaidCurrent) {
      return res.status(400).json({ error: 'You have already paid your contribution for this cycle.' });
    }

    // Requirement 3 & 4: Automatically add compulsory ₦60 transaction fee to every contribution payment
    // If contribution = ₦5,000, member pays ₦5,060 (₦5,000 to contribution balance, ₦60 fee)
    const contributionAmount = group.contribution_amount;
    const transactionFee = 60;
    const totalAmount = contributionAmount + transactionFee;

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
      totalAmount,
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
        totalAmount,
        type: 'group_contribution'
      }
    );

    // Record pending payment in payments
    db.createPendingPayment(
      member.user_id,
      paystack.reference,
      Math.round(totalAmount * 100),
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
          totalAmount
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
      paid_at: paidTimestamp
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

    // Strict authentication check: authUserId must be present and match member account
    const authUserId = (req.headers['x-user-id'] as string) || req.body.userId;
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    if (member.user_id !== authUserId) {
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

    // 9. Verify Authorization (Password preferred, OTP fallback)
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

apiRouter.post('/groups/:groupId/withdraw-commission', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { amount, userId } = req.body;

    const group = db.getGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const adminId = userId || group.admin_id;
    if (group.admin_id !== adminId) {
      return res.status(403).json({ error: 'Unauthorized: Only the group admin can withdraw commissions.' });
    }

    const admin = db.getProfileById(adminId);
    if (!admin) return res.status(404).json({ error: 'Admin profile not found' });

    const numericAmount = Math.round(Number(amount));
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount.' });
    }

    const balance = db.getAdminCommissionBalance(groupId);
    if (numericAmount > balance.available) {
      return res.status(400).json({
        error: `Amount exceeds available commission balance of ₦${balance.available.toLocaleString('en-NG')}.`
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
    const payment = db.getPaymentById(`pay_${withdrawal.id}`);
    const confirmed = payment
      ? await fsExecuteAdminWithdrawalBatch(withdrawal, payment)
      : await fsUpsertWithdrawal(withdrawal);

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

    const group = db.getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    if (group.admin_id !== authUserId) {
      return res.status(403).json({
        error: 'Forbidden: You can only withdraw from groups you created.'
      });
    }

    const numericAmount = Math.round(Number(amount));
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount.' });
    }

    const balance = db.getAdminCommissionBalance(groupId);
    if (numericAmount > balance.available) {
      return res.status(400).json({
        error: `Amount exceeds available commission balance of ₦${balance.available.toLocaleString('en-NG')}.`
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

    // 4. Commit confirmed withdrawal to local database state immediately
    db.recordConfirmedWithdrawal(withdrawal, payment);

    // 5. Cloud synchronization (Firestore & Supabase) with graceful non-blocking fallback
    fsExecuteAdminWithdrawalBatch(withdrawal, payment).catch(err => {
      console.warn('[Firestore Group Admin Withdrawal Sync Warn]:', err?.message || err);
    });
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

apiRouter.get('/users/:userId/admin-groups', (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const groups = db.getAllGroups().filter(g => g.admin_id === userId);
    return res.json(groups);
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
    const isSuperAdminEmail = cleanReqEmail === 'superadmin@packajo.ng' || cleanReqEmail === 'paulakinyele54@gmail.com';
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
    const isSuperAdminEmail = cleanReqEmail === 'superadmin@packajo.ng' || cleanReqEmail === 'paulakinyele54@gmail.com';
    const cleanReqPhone = phone ? normalizeNigerianPhone(phone) : (profile ? normalizeNigerianPhone(profile.phone) : '');
    const isAuthorized = (profile && profile.role === 'SUPER_ADMIN') || cleanReqPhone === superAdminPhone || isSuperAdminEmail;

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access Denied: Super Admin authorization is restricted to authorized credentials.'
      });
    }

    const data = db.getSuperAdminFullData(profile?.id, profile?.phone || superAdminPhone);
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
    const isSuperAdminEmail = cleanReqEmail === 'superadmin@packajo.ng' || cleanReqEmail === 'paulakinyele54@gmail.com';
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

apiRouter.post('/superadmin/withdraw-earnings', paymentRateLimiter, async (req: Request, res: Response) => {
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
    const isSuperAdminEmail = cleanReqEmail === 'superadmin@packajo.ng' || cleanReqEmail === 'paulakinyele54@gmail.com';
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
    const available = fullData.superAdminEarnings.available_balance;

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
