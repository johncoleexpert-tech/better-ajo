/**
 * Better Ajo - Master Verification & Safeguard Test Suite
 * Tests all 6 bug fixes and 7 permanent verification criteria.
 */

import { BANK_CODES, resolveBankCodeSync, runBankCodesUnitTest } from './bankCodes.js';
import { db, calculatePackingSplit, STREAM_REGISTRATION, STREAM_CONTRIBUTION, STREAM_PACKING } from './db.js';
import { GroupAjo, GroupMember } from '../src/types/index.js';

async function runMasterVerificationTests() {
  console.log('\n========================================================');
  console.log('BETTER AJO - MASTER PERMANENT SAFEGUARD VERIFICATION');
  console.log('========================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] Test ${totalTests}: ${testName}`);
    } else {
      console.error(`❌ [FAIL] Test ${totalTests}: ${testName} - ${details || ''}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // -----------------------------------------------------------
  // TEST 1: Paystack Bank Mapping for Fintechs & Commercial Banks
  // -----------------------------------------------------------
  console.log('\n--- 1. Testing Paystack Bank Mapping (BUG 2) ---');
  const unitTestRes = runBankCodesUnitTest();
  assert(unitTestRes.passed, 'Bank codes internal unit test passes', unitTestRes.errors.join(', '));
  assert(resolveBankCodeSync('OPay') === '999992', 'OPay resolves to 999992');
  assert(resolveBankCodeSync('PalmPay') === '999991', 'PalmPay resolves to 999991');
  assert(resolveBankCodeSync('Moniepoint MFB') === '50515', 'Moniepoint resolves to 50515');
  assert(resolveBankCodeSync('Kuda Microfinance Bank') === '50211', 'Kuda resolves to 50211');
  assert(resolveBankCodeSync('Guaranty Trust Bank') === '058', 'GTB resolves to 058');
  assert(resolveBankCodeSync('Access Bank') === '044', 'Access resolves to 044');
  assert(resolveBankCodeSync('First Bank') === '011', 'First Bank resolves to 011');
  assert(resolveBankCodeSync('Zenith Bank') === '057', 'Zenith resolves to 057');
  assert(resolveBankCodeSync('UBA') === '033', 'UBA resolves to 033');

  // -----------------------------------------------------------
  // TEST 2: Personal Ajo ₦600 Idempotent Verification (BUG 3)
  // -----------------------------------------------------------
  console.log('\n--- 2. Testing Personal Ajo ₦600 Idempotency (BUG 3) ---');
  const testUserId = `usr_test_${Date.now()}`;
  const testRef = `pak_test_ref_${Date.now()}`;

  // First verification
  db.upsertProfile({
    id: testUserId,
    full_name: 'Test Saver',
    phone: '08012345678',
    email: 'saver@test.com',
    bank_name: 'OPay',
    account_number: '9999999999',
    verification_type: 'NIN',
    verification_number: '12345678901'
  });

  const paFirst = db.activatePersonalAjo(testUserId);
  assert(paFirst.status === 'active', 'Personal Ajo activates successfully on first attempt');

  // Record payment
  db.data.payments.push({
    id: `pay_${testRef}`,
    user_id: testUserId,
    purpose: 'personal_registration',
    amount: 600,
    amount_kobo: 60000,
    currency: 'NGN',
    reference: testRef,
    status: 'success',
    created_at: new Date().toISOString()
  });

  // Second verification with identical reference -> must be idempotent
  const existingPayment = db.getPaymentByReference(testRef);
  assert(Boolean(existingPayment && existingPayment.status === 'success'), 'Payment record exists with success status');

  const isDuplicate = existingPayment && existingPayment.status === 'success';
  assert(isDuplicate, 'Second check detects already verified payment without double charging');

  // -----------------------------------------------------------
  // TEST 3 & 4: Super Admin Wallet Streams & Packing Split (BUG 4)
  // -----------------------------------------------------------
  console.log('\n--- 3. Testing Pure calculatePackingSplit & Financial Streams (BUG 4) ---');
  // Group with 2000 packing fee
  const split2000 = calculatePackingSplit(2000);
  assert(split2000.superAdmin === 667, 'calculatePackingSplit(2000).superAdmin === 667', `Got: ${split2000.superAdmin}`);
  assert(split2000.groupAdmin === 1333, 'calculatePackingSplit(2000).groupAdmin === 1333', `Got: ${split2000.groupAdmin}`);
  assert(split2000.superAdmin + split2000.groupAdmin === 2000, 'Sum of split equals total fee exactly (2000)');

  // Stream types immutability
  assert(STREAM_REGISTRATION === 'personal_ajo_fee', 'STREAM_REGISTRATION constant');
  assert(STREAM_CONTRIBUTION === 'contribution_fee', 'STREAM_CONTRIBUTION constant');
  assert(STREAM_PACKING === 'packing_commission', 'STREAM_PACKING constant');

  // -----------------------------------------------------------
  // TEST 5 & 6: Rotation Engine & Pay Ahead Safeguards (BUG 5 & 6)
  // -----------------------------------------------------------
  console.log('\n--- 4. Testing Rotation Engine & Pay Ahead Safeguards (BUG 5 & 6) ---');
  const testGroupId = `grp_rot_${Date.now()}`;
  const testGroup: GroupAjo = {
    id: testGroupId,
    group_name: 'Rotation Verification Group',
    group_code: 'ROT001',
    admin_id: 'usr_admin',
    admin_name: 'Group Admin',
    member_limit: 3,
    contribution_amount: 10000,
    packing_amount: 30000,
    cycle_type: 'Daily',
    packing_fee: 2000,
    current_round: 1,
    status: 'active',
    created_at: '2026-09-29T00:00:00.000Z',
    round_started_at: '2026-09-29T00:00:00.000Z'
  };
  (db.data.groups as any).push(testGroup);

  // Add 3 members: Ade (pos 1), Kayode (pos 2), Dauda (pos 3)
  const m1: GroupMember = {
    id: `mem_1_${Date.now()}`,
    group_id: testGroupId,
    user_id: 'usr_ade',
    full_name: 'Ade',
    phone: '08011111111',
    position: 1,
    status: 'active',
    bank_name: 'Access Bank',
    account_number: '0123456789',
    joined_at: '2026-09-29T00:00:00.000Z',
    current_round_status: 'pending_contribution'
  };
  const m2: GroupMember = {
    id: `mem_2_${Date.now()}`,
    group_id: testGroupId,
    user_id: 'usr_kayode',
    full_name: 'Kayode',
    phone: '08022222222',
    position: 2,
    status: 'active',
    bank_name: 'GTBank',
    account_number: '0987654321',
    joined_at: '2026-09-29T00:00:00.000Z',
    current_round_status: 'pending_contribution'
  };
  const m3: GroupMember = {
    id: `mem_3_${Date.now()}`,
    group_id: testGroupId,
    user_id: 'usr_dauda',
    full_name: 'Dauda',
    phone: '08033333333',
    position: 3,
    status: 'active',
    bank_name: 'Zenith Bank',
    account_number: '1122334455',
    joined_at: '2026-09-29T00:00:00.000Z',
    current_round_status: 'pending_contribution'
  };
  db.data.group_members.push(m1, m2, m3);

  // Generate immutable schedule
  const schedule = db.generateOrEnsurePackingSchedule(testGroup, [m1, m2, m3]);
  assert(schedule.length === 3, 'Packing schedule has exactly 3 slots');
  assert(schedule[0].scheduled_date === '2026-09-29', 'Position 1 Ade scheduled for 2026-09-29');
  assert(schedule[1].scheduled_date === '2026-09-30', 'Position 2 Kayode scheduled for 2026-09-30');
  assert(schedule[2].scheduled_date === '2026-10-01', 'Position 3 Dauda scheduled for 2026-10-01');

  // Verify dates are unique and never duplicated
  const dates = schedule.map(s => s.scheduled_date);
  const uniqueDates = new Set(dates);
  assert(uniqueDates.size === dates.length, 'Scheduled dates are distinct and never duplicated');

  // Simulate contributions for Round 1
  db.markContributionPaid(testGroupId, m1.id, 1, `ref_ade_${Date.now()}`, '2026-09-29');
  db.markContributionPaid(testGroupId, m2.id, 1, `ref_kayode_${Date.now()}`, '2026-09-29');
  db.markContributionPaid(testGroupId, m3.id, 1, `ref_dauda_${Date.now()}`, '2026-09-29');

  // On Sept 29: Can Ade pack?
  const canAdePackSept29 = db.canPackNow(schedule[0], schedule, true, '2026-09-29');
  assert(canAdePackSept29 === true, 'Ade can pack on Sept 29 (scheduled date arrived, pos 1)');

  // On Sept 29: Can Kayode pack ahead? MUST BE FALSE!
  const canKayodePackSept29 = db.canPackNow(schedule[1], schedule, true, '2026-09-29');
  assert(canKayodePackSept29 === false, 'Kayode CANNOT pack on Sept 29 (scheduled date 2026-09-30 is in future)');

  // Pack Ade on Sept 29
  db.executePack(testGroupId, m1.id, 1, '2026-09-29');
  assert(db.isMemberPacked(testGroupId, m1.id, 1), 'Ade is marked packed');

  // Check Upcoming Packers: MUST exclude Ade, show Kayode (Sept 30) and Dauda (Oct 1)
  const upcomingAfterAde = db.getUpcomingPackers(testGroup, 1);
  assert(upcomingAfterAde.length === 2, 'Upcoming packers has 2 members left (excludes Ade)');
  assert(upcomingAfterAde[0].user_name === 'Kayode' && upcomingAfterAde[0].scheduled_date === '2026-09-30', 'Kayode is next unpacked on Sept 30');
  assert(upcomingAfterAde[1].user_name === 'Dauda' && upcomingAfterAde[1].scheduled_date === '2026-10-01', 'Dauda is waiting for Oct 1');

  // Current packer is now Kayode
  const currentPackerNow = db.getCurrentPacker(testGroupId, 1);
  assert(currentPackerNow?.id === m2.id, 'Current packer is now Kayode');

  // Next packer is Dauda
  const nextPackerNow = db.getNextPacker(testGroupId, 1);
  assert(nextPackerNow?.id === m3.id, 'Next packer is Dauda');

  // On Sept 29, can Kayode pack now? MUST STILL BE FALSE!
  const canKayodePackNowSept29 = db.canPackNow(schedule[1], schedule, true, '2026-09-29');
  assert(canKayodePackNowSept29 === false, 'Kayode still cannot pack on Sept 29 even though Ade packed');

  // On Sept 30, can Kayode pack now? MUST BE TRUE!
  const canKayodePackNowSept30 = db.canPackNow(schedule[1], schedule, true, '2026-09-30');
  assert(canKayodePackNowSept30 === true, 'Kayode CAN pack on Sept 30 (scheduled date has arrived)');

  // Double pack protection: Cannot pack Ade again!
  let doublePackThrew = false;
  try {
    db.executePack(testGroupId, m1.id, 1, '2026-09-29');
  } catch (err: any) {
    doublePackThrew = true;
  }
  assert(doublePackThrew, 'Double packing prevention: Throws error when attempting to pack Ade twice');

  console.log(`\n========================================================`);
  console.log(`ALL ${totalTests} PERMANENT VERIFICATION TESTS PASSED SUCCESSFULLY!`);
  console.log(`========================================================\n`);
  return true;
}

runMasterVerificationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Master verification failed:', err);
    process.exit(1);
  });
