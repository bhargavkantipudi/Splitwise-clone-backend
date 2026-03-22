const request = require('supertest');
const app = require('../app');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Fixed test emails — reused every run
const emailA = 'testa@test.com';
const emailB = 'testb@test.com';
const emailC = 'testc@test.com';
const emailOutsider = 'outsider@test.com';
const emailRando = 'rando@test.com';
const emailStranger = 'stranger@test.com';
const allTestEmails = [emailA, emailB, emailC, emailOutsider, emailRando, emailStranger];

// Shared state across tests
let userAToken, userBToken, userCToken;
let userAId, userBId, userCId;
let groupId;

// Clean up all test data before running
beforeAll(async () => {
  // Find all test user IDs
  const testUsers = await prisma.user.findMany({
    where: { email: { in: allTestEmails } },
    select: { id: true },
  });
  const testUserIds = testUsers.map((u) => u.id);

  if (testUserIds.length > 0) {
    // Delete in correct order to respect foreign keys
    await prisma.activity.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.settlement.deleteMany({
      where: { OR: [{ payerId: { in: testUserIds } }, { payeeId: { in: testUserIds } }] },
    });
    await prisma.expenseSplit.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.expense.deleteMany({ where: { payerId: { in: testUserIds } } });
    await prisma.groupMember.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.friendship.deleteMany({
      where: { OR: [{ userId: { in: testUserIds } }, { friendId: { in: testUserIds } }] },
    });
    // Delete empty groups (groups that no longer have members)
    const emptyGroups = await prisma.group.findMany({
      where: { members: { none: {} } },
      select: { id: true },
    });
    if (emptyGroups.length > 0) {
      await prisma.group.deleteMany({ where: { id: { in: emptyGroups.map((g) => g.id) } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('API Integration Tests', () => {
  // ==========================================
  // AUTH FLOW
  // ==========================================
  describe('Auth Flow', () => {
    it('POST /api/auth/register - should register User A', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'User A', email: emailA, password: 'pass123' });

      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(emailA);
      expect(res.body).toHaveProperty('token');
      userAToken = res.body.token;
      userAId = res.body.user.id;
    });

    it('POST /api/auth/register - should register User B', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'User B', email: emailB, password: 'pass123' });

      expect(res.status).toBe(201);
      userBToken = res.body.token;
      userBId = res.body.user.id;
    });

    it('POST /api/auth/register - should register User C', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'User C', email: emailC, password: 'pass123' });

      expect(res.status).toBe(201);
      userCToken = res.body.token;
      userCId = res.body.user.id;
    });

    it('POST /api/auth/register - should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Dup', email: emailA, password: 'pass123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already exists');
    });

    it('POST /api/auth/register - should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'missing@test.com' });

      expect(res.status).toBe(400);
    });

    it('POST /api/auth/login - should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: emailA, password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(emailA);
      expect(res.body).toHaveProperty('token');
    });

    it('POST /api/auth/login - should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: emailA, password: 'wrongpass' });

      expect(res.status).toBe(401);
    });

    it('POST /api/auth/login - should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody_ever@test.com', password: 'pass123' });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // AUTH MIDDLEWARE
  // ==========================================
  describe('Auth Middleware', () => {
    it('should reject request with no token', async () => {
      const res = await request(app).get('/api/groups');
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get('/api/groups')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // FRIENDS FLOW
  // ==========================================
  describe('Friends Flow', () => {
    it('POST /api/friends - User A adds User B as friend', async () => {
      const res = await request(app)
        .post('/api/friends')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ email: emailB });

      expect(res.status).toBe(201);
      expect(res.body.friend.name).toBe('User B');
    });

    it('POST /api/friends - should reject adding yourself', async () => {
      const res = await request(app)
        .post('/api/friends')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ email: emailA });

      expect(res.status).toBe(400);
    });

    it('POST /api/friends - should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/friends')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ email: 'nobody@nowhere.com' });

      expect(res.status).toBe(404);
    });

    it('GET /api/friends - should return friends list with balances', async () => {
      const res = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('balance');
    });

    it('POST /api/friends/:id/expense - add 1-on-1 expense (A paid)', async () => {
      const res = await request(app)
        .post(`/api/friends/${userBId}/expense`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ amount: 50, description: 'Dinner for two', paidByMe: true });

      expect(res.status).toBe(201);
    });

    it('GET /api/friends - balance should reflect the 1-on-1 expense', async () => {
      const res = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userAToken}`);

      const friendB = res.body.find((f) => f.id === userBId);
      expect(friendB).toBeDefined();
      expect(friendB.balance).toBe(50); // B owes A $50
    });
  });

  // ==========================================
  // GROUPS FLOW
  // ==========================================
  describe('Groups Flow', () => {
    it('POST /api/groups - should create a group', async () => {
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: 'Test Trip' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Trip');
      expect(res.body.members).toHaveLength(1);
      groupId = res.body.id;
    });

    it('POST /api/groups - should reject empty name', async () => {
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('POST /api/groups/:id/members - should add User B to group', async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ email: emailB });

      expect(res.status).toBe(201);
    });

    it('POST /api/groups/:id/members - should add User C to group', async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ email: emailC });

      expect(res.status).toBe(201);
    });

    it('POST /api/groups/:id/members - should reject duplicate member', async () => {
      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ email: emailB });

      expect(res.status).toBe(400);
    });

    it('POST /api/groups/:id/members - non-member cannot add people', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Outsider', email: emailOutsider, password: 'pass123' });

      expect(regRes.status).toBe(201);

      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${regRes.body.token}`)
        .send({ email: emailA });

      expect(res.status).toBe(403);
    });

    it('GET /api/groups - should list groups for the user', async () => {
      const res = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const testGroup = res.body.find((g) => g.id === groupId);
      expect(testGroup).toBeDefined();
      expect(testGroup.members).toHaveLength(3);
    });
  });

  // ==========================================
  // EXPENSES FLOW
  // ==========================================
  describe('Expenses Flow', () => {
    it('POST /api/expenses - should create expense split among 3 members', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          groupId,
          amount: 90,
          description: 'Group dinner',
          splits: [
            { userId: userAId, amountOwed: 30 },
            { userId: userBId, amountOwed: 30 },
            { userId: userCId, amountOwed: 30 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.expense).toHaveProperty('id');
    });

    it('POST /api/expenses - should reject mismatched split totals', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          groupId,
          amount: 90,
          description: 'Bad split',
          splits: [
            { userId: userAId, amountOwed: 10 },
            { userId: userBId, amountOwed: 10 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Splits do not add up');
    });

    it('POST /api/expenses - non-member cannot add expense', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Rando', email: emailRando, password: 'pass123' });

      expect(regRes.status).toBe(201);

      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${regRes.body.token}`)
        .send({
          groupId,
          amount: 20,
          description: 'Not allowed',
          splits: [{ userId: regRes.body.user.id, amountOwed: 20 }],
        });

      expect(res.status).toBe(403);
    });

    it('GET /api/expenses/group/:id - should list expenses', async () => {
      const res = await request(app)
        .get(`/api/expenses/group/${groupId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('payer');
      expect(res.body[0]).toHaveProperty('splits');
    });

    it('POST /api/expenses - User B adds another expense', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          groupId,
          amount: 30,
          description: 'Taxi ride',
          splits: [
            { userId: userBId, amountOwed: 15 },
            { userId: userCId, amountOwed: 15 },
          ],
        });

      expect(res.status).toBe(201);
    });
  });

  // ==========================================
  // BALANCES & DEBT SIMPLIFICATION
  // ==========================================
  describe('Balances & Debt Simplification', () => {
    it('GET /api/groups/:id/balances - should return correct balances and simplified transactions', async () => {
      const res = await request(app)
        .get(`/api/groups/${groupId}/balances`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('balances');
      expect(res.body).toHaveProperty('transactions');

      const { balances, transactions } = res.body;

      // User A: paid 90, owes 30 => net +60
      expect(balances[String(userAId)]).toBe(60);
      // User B: paid 30, owes 30+15 = 45 => net -15
      expect(balances[String(userBId)]).toBe(-15);
      // User C: owes 30+15 = 45 => net -45
      expect(balances[String(userCId)]).toBe(-45);

      // Simplified transactions should be minimal
      expect(transactions.length).toBeGreaterThanOrEqual(1);
      expect(transactions.length).toBeLessThanOrEqual(2);

      // Total settlement flow should match total debts
      const totalSettlement = transactions.reduce((s, t) => s + t.amount, 0);
      expect(totalSettlement).toBeCloseTo(60);
    });

    it('GET /api/groups/:id/balances - non-member should be rejected', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Stranger', email: emailStranger, password: 'pass123' });

      expect(regRes.status).toBe(201);

      const res = await request(app)
        .get(`/api/groups/${groupId}/balances`)
        .set('Authorization', `Bearer ${regRes.body.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // SETTLEMENTS FLOW
  // ==========================================
  describe('Settlements Flow', () => {
    it('POST /api/settlements - should record a settlement', async () => {
      const res = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ payeeId: userAId, amount: 15 });

      expect(res.status).toBe(201);
      expect(res.body.settlement).toHaveProperty('id');
      expect(res.body.settlement.amount).toBe(15);
    });

    it('POST /api/settlements - should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ amount: 10 });

      expect(res.status).toBe(400);
    });

    it('POST /api/settlements - should reject invalid user', async () => {
      const res = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ payeeId: 99999, amount: 10 });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // ACTIVITY FLOW
  // ==========================================
  describe('Activity Flow', () => {
    it('GET /api/activity - should return activity feed', async () => {
      const res = await request(app)
        .get('/api/activity')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      res.body.forEach((activity) => {
        expect(activity).toHaveProperty('type');
        expect(activity).toHaveProperty('message');
        expect(activity).toHaveProperty('createdAt');
      });
    });

    it('GET /api/activity - should return activities in reverse chronological order', async () => {
      const res = await request(app)
        .get('/api/activity')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      if (res.body.length >= 2) {
        const first = new Date(res.body[0].createdAt);
        const second = new Date(res.body[1].createdAt);
        expect(first.getTime()).toBeGreaterThanOrEqual(second.getTime());
      }
    });

    it('GET /api/activity - settlement should appear in payer activity', async () => {
      const res = await request(app)
        .get('/api/activity')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const settlement = res.body.find((a) => a.type === 'settlement');
      expect(settlement).toBeDefined();
      expect(settlement.message).toContain('paid');
    });
  });
});
