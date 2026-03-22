const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Apply auth middleware to all group routes
router.use(requireAuth);

// Create a new group
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Create the group and automatically add the creator as a member
    const group = await prisma.group.create({
      data: {
        name,
        members: {
          create: [
            { userId: userId }
          ]
        }
      },
      include: {
        members: true
      }
    });

    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create group', details: error.message });
  }
});

// Get user's groups
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: {
            userId: userId
          }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch groups', details: error.message });
  }
});

// Add a member to a group
router.post('/:groupId/members', async (req, res) => {
  try {
    const { email } = req.body;
    const groupId = parseInt(req.params.groupId);
    const requestingUserId = req.user.id;

    // Verify requester is in the group
    const isMember = await prisma.groupMember.findFirst({
      where: { groupId, userId: requestingUserId }
    });

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Find the user to add
    const userToAdd = await prisma.user.findUnique({ where: { email } });
    if (!userToAdd) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add them to the group
    const newMember = await prisma.groupMember.create({
      data: {
        groupId,
        userId: userToAdd.id
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    res.status(201).json(newMember);
  } catch (error) {
    // Unique constraint violation (P2002) means user is already a member
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'User is already a member of this group' });
    }
    res.status(500).json({ error: 'Failed to add member', details: error.message });
  }
});

const { computeNetBalances, simplifyDebts } = require('../utils/debtSimplifier');

// Get simplified balances/debts for a group
router.get('/:groupId/balances', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const userId = req.user.id;

    // Verify requesting user is in the group
    const isMember = await prisma.groupMember.findFirst({
      where: { groupId, userId }
    });

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Fetch all expenses including all splits for this group
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        splits: true
      }
    });

    // Compute raw balances
    const balances = computeNetBalances(expenses);
    
    // Simplify it
    const transactions = simplifyDebts(balances);

    res.json({ balances, transactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate balances', details: error.message });
  }
});

module.exports = router;
