const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();
router.use(requireAuth);

// Get recent activity for the logged-in user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const activities = await prisma.activity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity', details: error.message });
  }
});

module.exports = router;
