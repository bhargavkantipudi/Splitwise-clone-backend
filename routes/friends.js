const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();
router.use(requireAuth);

// Add a friend by email
router.post('/', async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) return res.status(400).json({ error: 'Email is required' });

    const friend = await prisma.user.findUnique({ where: { email } });
    if (!friend) return res.status(404).json({ error: 'User not found with that email' });
    if (friend.id === userId) return res.status(400).json({ error: 'You cannot add yourself' });

    // Create friendship in both directions
    await prisma.$transaction([
      prisma.friendship.upsert({
        where: { userId_friendId: { userId, friendId: friend.id } },
        create: { userId, friendId: friend.id },
        update: {},
      }),
      prisma.friendship.upsert({
        where: { userId_friendId: { userId: friend.id, friendId: userId } },
        create: { userId: friend.id, friendId: userId },
        update: {},
      }),
      prisma.activity.create({
        data: { userId, type: 'friend_added', message: `You added ${friend.name} as a friend` },
      }),
    ]);

    res.status(201).json({ message: 'Friend added', friend: { id: friend.id, name: friend.name, email: friend.email } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add friend', details: error.message });
  }
});

// Get all friends with balances
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const friendships = await prisma.friendship.findMany({
      where: { userId },
      include: { friend: { select: { id: true, name: true, email: true } } },
    });

    // For each friend, compute balance from shared non-group expenses
    const friendsWithBalances = await Promise.all(
      friendships.map(async (f) => {
        // Expenses I paid that they owe on (no group)
        const iPaid = await prisma.expense.findMany({
          where: { payerId: userId, groupId: null, splits: { some: { userId: f.friendId } } },
          include: { splits: { where: { userId: f.friendId } } },
        });
        const theyOweMe = iPaid.reduce((sum, exp) =>
          sum + exp.splits.reduce((s, sp) => s + sp.amountOwed, 0), 0);

        // Expenses they paid that I owe on (no group)
        const theyPaid = await prisma.expense.findMany({
          where: { payerId: f.friendId, groupId: null, splits: { some: { userId } } },
          include: { splits: { where: { userId } } },
        });
        const iOweThem = theyPaid.reduce((sum, exp) =>
          sum + exp.splits.reduce((s, sp) => s + sp.amountOwed, 0), 0);

        // Settlements between us
        const myPayments = await prisma.settlement.aggregate({
          where: { payerId: userId, payeeId: f.friendId },
          _sum: { amount: true },
        });
        const theirPayments = await prisma.settlement.aggregate({
          where: { payerId: f.friendId, payeeId: userId },
          _sum: { amount: true },
        });

        const balance = (theyOweMe - iOweThem)
          - (myPayments._sum.amount || 0)
          + (theirPayments._sum.amount || 0);

        return {
          ...f.friend,
          balance: Math.round(balance * 100) / 100,
        };
      })
    );

    res.json(friendsWithBalances);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch friends', details: error.message });
  }
});

// Get all transactions between me and a friend
router.get('/:friendId/transactions', async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const friendId = parseInt(req.params.friendId);

    // 1. Fetch expenses (shared directly, no group)
    const expenses = await prisma.expense.findMany({
      where: {
        groupId: null,
        OR: [
          { payerId: userId, splits: { some: { userId: friendId } } },
          { payerId: friendId, splits: { some: { userId } } },
        ],
      },
      include: {
        payer: { select: { id: true, name: true } },
        splits: { select: { userId: true, amountOwed: true } },
      },
      orderBy: { date: 'desc' },
    });

    // 2. Fetch settlements
    const settlements = await prisma.settlement.findMany({
      where: {
        OR: [
          { payerId: userId, payeeId: friendId },
          { payerId: friendId, payeeId: userId },
        ],
      },
      include: {
        payer: { select: { id: true, name: true } },
        payee: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });

    // 3. Merge and formatting
    const transactions = [
      ...expenses.map(e => ({
        id: `exp-${e.id}`,
        type: 'expense',
        amount: e.amount,
        description: e.description,
        category: e.category,
        notes: e.notes,
        date: e.date,
        payerId: e.payerId,
        payerName: e.payer?.name || 'Unknown',
      })),
      ...settlements.map(s => ({
        id: `set-${s.id}`,
        type: 'settlement',
        amount: s.amount,
        description: 'Payment',
        date: s.date,
        payerId: s.payerId,
        payerName: s.payer?.name || 'Unknown',
        payeeId: s.payeeId,
        payeeName: s.payee?.name || 'Unknown',
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(transactions);
  } catch (error) {
    console.error('Error in /:friendId/transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions', details: error.message });
  }
});

// Add a non-group expense with a friend
router.post('/:friendId/expense', async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId);
    const userId = req.user.id;
    const { amount, description, paidByMe, category, notes } = req.body;

    if (!amount || !description) {
      return res.status(400).json({ error: 'Amount and description are required' });
    }

    const payerId = paidByMe !== false ? userId : friendId;
    const owerId = payerId === userId ? friendId : userId;

    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          payerId,
          amount: parseFloat(amount),
          description,
          groupId: null,
          category: category || 'general',
          notes: notes || null,
        },
      });

      // The non-payer owes the full amount
      await tx.expenseSplit.create({
        data: { expenseId: exp.id, userId: owerId, amountOwed: parseFloat(amount) },
      });

      const friend = await tx.user.findUnique({ where: { id: friendId }, select: { name: true } });
      await tx.activity.create({
        data: {
          userId,
          type: 'expense_added',
          message: `You added "${description}" ($${amount}) with ${friend?.name}`,
        },
      });

      return exp;
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add expense', details: error.message });
  }
});

module.exports = router;
