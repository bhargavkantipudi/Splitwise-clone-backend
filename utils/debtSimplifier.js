/**
 * Simplifies a list of net balances into minimal transactions.
 * @param {Object} balances - A hashmap of userId to net balance. POSITIVE means they are owed money, NEGATIVE means they owe money.
 * @returns {Array} List of transactions to settle debts: [{ from: userId, to: userId, amount: number }]
 */
function simplifyDebts(balances) {
  const debtors = [];
  const creditors = [];

  // Separate people into debtors and creditors
  for (const [userId, balance] of Object.entries(balances)) {
    if (balance < -0.01) {
      debtors.push({ userId: parseInt(userId), amount: Math.abs(balance) });
    } else if (balance > 0.01) {
      creditors.push({ userId: parseInt(userId), amount: balance });
    }
  }

  // Sort them so largest debts and credits are matched first (Greedy approach)
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let d = 0; // Debtor index
  let c = 0; // Creditor index

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];

    // The amount to settle is the minimum of what the debtor owes and what the creditor is owed
    const minAmount = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.userId,
      to: creditor.userId,
      amount: Math.round(minAmount * 100) / 100 // Round to 2 decimal places
    });

    debtor.amount -= minAmount;
    creditor.amount -= minAmount;

    // Next debtor or creditor if their balance reached 0
    if (Math.abs(debtor.amount) < 0.01) {
      d++;
    }
    if (Math.abs(creditor.amount) < 0.01) {
      c++;
    }
  }

  return transactions;
}

/**
 * Computes net balances for users from a raw list of expenses.
 * @param {Array} expenses - Array of Prisma Expense objects that include splits.
 * @returns {Object} Map of userId -> netBalance
 */
function computeNetBalances(expenses) {
  const balances = {};

  for (const expense of expenses) {
    // The payer gets a positive credit for the full amount they paid
    balances[expense.payerId] = (balances[expense.payerId] || 0) + expense.amount;

    // Each person who owes money (including the payer, if they are part of the split) gets a negative deficit
    for (const split of expense.splits) {
      balances[split.userId] = (balances[split.userId] || 0) - split.amountOwed;
    }
  }

  return balances;
}

module.exports = { simplifyDebts, computeNetBalances };
