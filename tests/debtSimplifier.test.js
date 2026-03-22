const { computeNetBalances, simplifyDebts } = require('../utils/debtSimplifier');

describe('Debt Simplification Algorithm', () => {
  describe('computeNetBalances', () => {
    it('should compute correct balances for a single expense', () => {
      const expenses = [
        {
          payerId: 1,
          amount: 30,
          splits: [
            { userId: 1, amountOwed: 10 },
            { userId: 2, amountOwed: 10 },
            { userId: 3, amountOwed: 10 },
          ],
        },
      ];

      const balances = computeNetBalances(expenses);
      expect(balances[1]).toBe(20);   // Paid 30, owes 10 = +20
      expect(balances[2]).toBe(-10);  // Owes 10
      expect(balances[3]).toBe(-10);  // Owes 10
    });

    it('should compute correct balances for multiple expenses', () => {
      const expenses = [
        {
          payerId: 1,
          amount: 60,
          splits: [
            { userId: 1, amountOwed: 20 },
            { userId: 2, amountOwed: 20 },
            { userId: 3, amountOwed: 20 },
          ],
        },
        {
          payerId: 2,
          amount: 30,
          splits: [
            { userId: 2, amountOwed: 15 },
            { userId: 3, amountOwed: 15 },
          ],
        },
      ];

      const balances = computeNetBalances(expenses);
      expect(balances[1]).toBe(40);   // Paid 60, owes 20 = +40
      expect(balances[2]).toBe(-5);   // Paid 30, owes 20+15 = -5
      expect(balances[3]).toBe(-35);  // Owes 20+15 = -35
    });

    it('should return empty object for no expenses', () => {
      const balances = computeNetBalances([]);
      expect(balances).toEqual({});
    });

    it('should handle expense where payer is not in splits', () => {
      const expenses = [
        {
          payerId: 1,
          amount: 50,
          splits: [
            { userId: 2, amountOwed: 25 },
            { userId: 3, amountOwed: 25 },
          ],
        },
      ];

      const balances = computeNetBalances(expenses);
      expect(balances[1]).toBe(50);
      expect(balances[2]).toBe(-25);
      expect(balances[3]).toBe(-25);
    });
  });

  describe('simplifyDebts', () => {
    it('should simplify basic two-person debt', () => {
      const balances = { 1: 10, 2: -10 };
      const transactions = simplifyDebts(balances);

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toEqual({ from: 2, to: 1, amount: 10 });
    });

    it('should simplify A->B->C chain into A->C', () => {
      // A: +40, B: -5, C: -35
      const balances = { 1: 40, 2: -5, 3: -35 };
      const transactions = simplifyDebts(balances);

      expect(transactions).toHaveLength(2);
      // Largest debtor (C:-35) pays largest creditor (A:+40) first
      expect(transactions[0]).toEqual({ from: 3, to: 1, amount: 35 });
      expect(transactions[1]).toEqual({ from: 2, to: 1, amount: 5 });
    });

    it('should return empty array when all settled', () => {
      const balances = { 1: 0, 2: 0, 3: 0 };
      const transactions = simplifyDebts(balances);
      expect(transactions).toHaveLength(0);
    });

    it('should handle empty balances', () => {
      const transactions = simplifyDebts({});
      expect(transactions).toHaveLength(0);
    });

    it('should handle complex multi-person scenario', () => {
      // 4 people: A: +30, B: +10, C: -25, D: -15
      const balances = { 1: 30, 2: 10, 3: -25, 4: -15 };
      const transactions = simplifyDebts(balances);

      // Verify total settlement matches
      const totalFrom = transactions.reduce((s, t) => s + t.amount, 0);
      expect(totalFrom).toBeCloseTo(40); // Total debts = 25 + 15 = 40

      // Verify all amounts are positive
      transactions.forEach((t) => {
        expect(t.amount).toBeGreaterThan(0);
      });
    });

    it('should round amounts to 2 decimal places', () => {
      const balances = { 1: 10.005, 2: -10.005 };
      const transactions = simplifyDebts(balances);
      expect(transactions[0].amount).toBe(10.01);
    });
  });
});
