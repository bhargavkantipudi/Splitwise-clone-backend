const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding demo data...\n');

  // =============================================
  // 1. Create users (or get existing ones)
  // =============================================
  const password = await bcrypt.hash('password123', 10);

  const users = [];
  const userData = [
    { name: 'Bhargav', email: 'test@example.com' },
    { name: 'Alice Johnson', email: 'alice@example.com' },
    { name: 'Bob Smith', email: 'bob@example.com' },
    { name: 'Charlie Brown', email: 'charlie@example.com' },
    { name: 'Diana Prince', email: 'diana@example.com' },
  ];

  for (const u of userData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash: password },
    });
    users.push(user);
    console.log(`  ✅ User: ${user.name} (${user.email}) — ID: ${user.id}`);
  }

  const [bhargav, alice, bob, charlie, diana] = users;

  // =============================================
  // 2. Create friendships
  // =============================================
  const friendPairs = [
    [bhargav, alice], [bhargav, bob], [bhargav, charlie], [bhargav, diana],
    [alice, bob], [alice, charlie],
  ];

  for (const [a, b] of friendPairs) {
    await prisma.friendship.upsert({
      where: { userId_friendId: { userId: a.id, friendId: b.id } },
      update: {},
      create: { userId: a.id, friendId: b.id },
    });
    await prisma.friendship.upsert({
      where: { userId_friendId: { userId: b.id, friendId: a.id } },
      update: {},
      create: { userId: b.id, friendId: a.id },
    });
  }
  console.log(`\n  ✅ ${friendPairs.length} friendships created`);

  // =============================================
  // 3. Create groups with members
  // =============================================
  const group1 = await prisma.group.create({
    data: {
      name: '🏖️ Goa Trip',
      members: {
        create: [
          { userId: bhargav.id },
          { userId: alice.id },
          { userId: bob.id },
          { userId: charlie.id },
        ],
      },
    },
  });
  console.log(`  ✅ Group: ${group1.name} (4 members)`);

  const group2 = await prisma.group.create({
    data: {
      name: '🏠 Apartment',
      members: {
        create: [
          { userId: bhargav.id },
          { userId: diana.id },
          { userId: alice.id },
        ],
      },
    },
  });
  console.log(`  ✅ Group: ${group2.name} (3 members)`);

  const group3 = await prisma.group.create({
    data: {
      name: '🍕 Friday Dinners',
      members: {
        create: [
          { userId: bhargav.id },
          { userId: bob.id },
          { userId: charlie.id },
        ],
      },
    },
  });
  console.log(`  ✅ Group: ${group3.name} (3 members)`);

  // =============================================
  // 4. Create group expenses
  // =============================================
  console.log('\n  Adding expenses...');

  // --- Goa Trip expenses ---
  const goaExpenses = [
    { payer: bhargav, amount: 240, desc: 'Hotel booking', splits: [bhargav, alice, bob, charlie] },
    { payer: alice, amount: 80, desc: 'Breakfast', splits: [bhargav, alice, bob, charlie] },
    { payer: bob, amount: 120, desc: 'Scuba diving', splits: [bhargav, bob, charlie] },
    { payer: charlie, amount: 60, desc: 'Beach bar', splits: [bhargav, alice, bob, charlie] },
    { payer: bhargav, amount: 50, desc: 'Taxi to airport', splits: [bhargav, alice] },
  ];

  for (const e of goaExpenses) {
    const splitAmount = Math.round((e.amount / e.splits.length) * 100) / 100;
    const lastSplit = Math.round((e.amount - splitAmount * (e.splits.length - 1)) * 100) / 100;

    await prisma.expense.create({
      data: {
        groupId: group1.id,
        payerId: e.payer.id,
        amount: e.amount,
        description: e.desc,
        splits: {
          create: e.splits.map((u, i) => ({
            userId: u.id,
            amountOwed: i === e.splits.length - 1 ? lastSplit : splitAmount,
          })),
        },
      },
    });
    console.log(`    💰 ${e.payer.name} paid $${e.amount} for "${e.desc}"`);
  }

  // --- Apartment expenses ---
  const aptExpenses = [
    { payer: bhargav, amount: 1500, desc: 'Monthly rent', splits: [bhargav, diana, alice] },
    { payer: diana, amount: 90, desc: 'Electric bill', splits: [bhargav, diana, alice] },
    { payer: alice, amount: 60, desc: 'Internet bill', splits: [bhargav, diana, alice] },
    { payer: bhargav, amount: 120, desc: 'Groceries', splits: [bhargav, diana, alice] },
  ];

  for (const e of aptExpenses) {
    const splitAmount = Math.round((e.amount / e.splits.length) * 100) / 100;
    const lastSplit = Math.round((e.amount - splitAmount * (e.splits.length - 1)) * 100) / 100;

    await prisma.expense.create({
      data: {
        groupId: group2.id,
        payerId: e.payer.id,
        amount: e.amount,
        description: e.desc,
        splits: {
          create: e.splits.map((u, i) => ({
            userId: u.id,
            amountOwed: i === e.splits.length - 1 ? lastSplit : splitAmount,
          })),
        },
      },
    });
    console.log(`    💰 ${e.payer.name} paid $${e.amount} for "${e.desc}"`);
  }

  // --- Friday Dinners ---
  const dinnerExpenses = [
    { payer: bhargav, amount: 75, desc: 'Pizza Palace', splits: [bhargav, bob, charlie] },
    { payer: bob, amount: 90, desc: 'Sushi night', splits: [bhargav, bob, charlie] },
    { payer: charlie, amount: 45, desc: 'Taco Tuesday', splits: [bhargav, bob, charlie] },
  ];

  for (const e of dinnerExpenses) {
    const splitAmount = Math.round((e.amount / e.splits.length) * 100) / 100;
    const lastSplit = Math.round((e.amount - splitAmount * (e.splits.length - 1)) * 100) / 100;

    await prisma.expense.create({
      data: {
        groupId: group3.id,
        payerId: e.payer.id,
        amount: e.amount,
        description: e.desc,
        splits: {
          create: e.splits.map((u, i) => ({
            userId: u.id,
            amountOwed: i === e.splits.length - 1 ? lastSplit : splitAmount,
          })),
        },
      },
    });
    console.log(`    💰 ${e.payer.name} paid $${e.amount} for "${e.desc}"`);
  }

  // =============================================
  // 5. Create 1-on-1 (non-group) expenses
  // =============================================
  console.log('\n  Adding 1-on-1 expenses...');

  // Alice paid for coffee, Bhargav owes her
  await prisma.expense.create({
    data: {
      payerId: alice.id, amount: 12, description: 'Coffee',
      splits: { create: [{ userId: bhargav.id, amountOwed: 12 }] },
    },
  });
  console.log('    ☕ Alice paid $12 for Coffee (Bhargav owes)');

  // Bhargav paid for movie tickets, Bob owes him
  await prisma.expense.create({
    data: {
      payerId: bhargav.id, amount: 30, description: 'Movie tickets',
      splits: { create: [{ userId: bob.id, amountOwed: 30 }] },
    },
  });
  console.log('    🎬 Bhargav paid $30 for Movie tickets (Bob owes)');

  // Bhargav paid for lunch, Diana owes him
  await prisma.expense.create({
    data: {
      payerId: bhargav.id, amount: 22, description: 'Lunch',
      splits: { create: [{ userId: diana.id, amountOwed: 22 }] },
    },
  });
  console.log('    🥗 Bhargav paid $22 for Lunch (Diana owes)');

  // =============================================
  // 6. Create settlements
  // =============================================
  console.log('\n  Adding settlements...');

  await prisma.settlement.create({
    data: { payerId: bob.id, payeeId: bhargav.id, amount: 20 },
  });
  console.log('    💸 Bob paid Bhargav $20');

  await prisma.settlement.create({
    data: { payerId: charlie.id, payeeId: bhargav.id, amount: 30 },
  });
  console.log('    💸 Charlie paid Bhargav $30');

  // =============================================
  // 7. Create activity feed
  // =============================================
  console.log('\n  Creating activity feed...');

  const activities = [
    { userId: bhargav.id, type: 'group_created', message: 'You created "🏖️ Goa Trip"', groupId: group1.id },
    { userId: bhargav.id, type: 'expense_added', message: 'You added "Hotel booking" ($240) in Goa Trip', groupId: group1.id },
    { userId: bhargav.id, type: 'friend_added', message: 'You added Alice Johnson as a friend' },
    { userId: bhargav.id, type: 'friend_added', message: 'You added Bob Smith as a friend' },
    { userId: bhargav.id, type: 'friend_added', message: 'You added Charlie Brown as a friend' },
    { userId: bhargav.id, type: 'friend_added', message: 'You added Diana Prince as a friend' },
    { userId: bhargav.id, type: 'group_created', message: 'You created "🏠 Apartment"', groupId: group2.id },
    { userId: bhargav.id, type: 'expense_added', message: 'You added "Monthly rent" ($1500) in Apartment', groupId: group2.id },
    { userId: bhargav.id, type: 'expense_added', message: 'You added "Groceries" ($120) in Apartment', groupId: group2.id },
    { userId: bhargav.id, type: 'group_created', message: 'You created "🍕 Friday Dinners"', groupId: group3.id },
    { userId: bhargav.id, type: 'expense_added', message: 'You added "Pizza Palace" ($75) in Friday Dinners', groupId: group3.id },
    { userId: bhargav.id, type: 'expense_added', message: 'You added "Movie tickets" ($30) with Bob' },
    { userId: bhargav.id, type: 'settlement', message: 'Bob paid you $20' },
    { userId: bhargav.id, type: 'settlement', message: 'Charlie paid you $30' },
  ];

  for (const a of activities) {
    await prisma.activity.create({ data: a });
  }
  console.log(`    ✅ ${activities.length} activity entries created`);

  // =============================================
  // Done!
  // =============================================
  console.log('\n🎉 Seed complete! Log in with:');
  console.log('   Email:    test@example.com');
  console.log('   Password: password123');
  console.log('\n   Other test accounts (same password):');
  console.log('   alice@example.com, bob@example.com, charlie@example.com, diana@example.com\n');

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error('❌ Seed failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
