const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Apply auth middleware to all expense routes
router.use(requireAuth);

// Create an expense and split it
router.post('/', async (req, res) => {
  try {
    const { groupId, amount, description, splits, category, notes } = req.body;
    const payerId = req.user.id;

    if (!groupId || !amount || !description || !splits || !Array.isArray(splits)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify payer is in the group
    const isMember = await prisma.groupMember.findFirst({
      where: { groupId, userId: payerId }
    });

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Ensure splits add up to the total amount
    const totalSplit = splits.reduce((sum, split) => sum + split.amountOwed, 0);
    // Allowing a small floating point margin of error (0.01)
    if (Math.abs(totalSplit - amount) > 0.01) {
      return res.status(400).json({ error: 'Splits do not add up to the total amount' });
    }

    // Create Expense in a Prisma Transaction
    const expense = await prisma.$transaction(async (tx) => {
      // 1. Create the main expense
      const newExpense = await tx.expense.create({
        data: {
          groupId,
          payerId,
          amount,
          description,
          category: category || 'general',
          notes: notes || null,
        }
      });

      // 1b. Create activity
      const group = await tx.group.findUnique({ where: { id: groupId }, select: { name: true } });
      await tx.activity.create({
        data: {
          userId: payerId,
          type: 'expense_added',
          message: `Added "${description}" ($${amount}) in ${group?.name}`,
          groupId,
        },
      });

      // 2. Create the splits
      const expenseSplits = splits.map(split => ({
        expenseId: newExpense.id,
        userId: split.userId,
        amountOwed: split.amountOwed
      }));

      await tx.expenseSplit.createMany({
        data: expenseSplits
      });

      return newExpense;
    });

    res.status(201).json({ message: 'Expense added successfully', expense });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create expense', details: error.message });
  }
});

// Get expenses for a group
router.get('/group/:groupId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const userId = req.user.id;

    // Verify membership
    const isMember = await prisma.groupMember.findFirst({
      where: { groupId, userId }
    });

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Fetch expenses with splits
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expenses', details: error.message });
  }
});

module.exports = router;
