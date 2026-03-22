const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();
router.use(requireAuth);

// Record a settlement payment
router.post('/', async (req, res) => {
  try {
    const { payeeId, amount, groupId } = req.body;
    const payerId = req.user.id;

    if (!payeeId || !amount) {
      return res.status(400).json({ error: 'payeeId and amount are required' });
    }

    const payee = await prisma.user.findUnique({
      where: { id: payeeId },
      select: { name: true },
    });

    if (!payee) return res.status(404).json({ error: 'User not found' });

    const settlement = await prisma.$transaction(async (tx) => {
      const s = await tx.settlement.create({
        data: {
          payerId,
          payeeId,
          amount: parseFloat(amount),
          groupId: groupId || null,
        },
      });

      await tx.activity.create({
        data: {
          userId: payerId,
          type: 'settlement',
          message: `You paid ${payee.name} $${parseFloat(amount).toFixed(2)}`,
          groupId: groupId || null,
        },
      });

      return s;
    });

    res.status(201).json({ message: 'Settlement recorded', settlement });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record settlement', details: error.message });
  }
});

module.exports = router;
