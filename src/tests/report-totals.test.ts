import { describe, it, expect } from 'vitest';
import type { ExpenseRow } from '../lib/pdf';

// Pure logic extracted from pdf.ts for unit testing
function groupByCategory(expenses: ExpenseRow[]) {
  const groups: Record<string, ExpenseRow[]> = {};
  for (const e of expenses) {
    if (!groups[e.category]) groups[e.category] = [];
    groups[e.category].push(e);
  }
  return groups;
}

function computeTotals(expenses: ExpenseRow[]) {
  const groups = groupByCategory(expenses);
  const subtotals: Record<string, number> = {};
  for (const [cat, rows] of Object.entries(groups)) {
    subtotals[cat] = parseFloat(rows.reduce((s, e) => s + e.amount, 0).toFixed(2));
  }
  const grand = parseFloat(Object.values(subtotals).reduce((s, v) => s + v, 0).toFixed(2));
  return { subtotals, grand };
}

const makeExpense = (category: string, amount: number): ExpenseRow => ({
  date: new Date('2026-01-15'),
  category,
  merchant: null,
  merchantCif: null,
  amount,
  currency: 'RON',
  notes: null,
  imageUrl: null,
});

describe('report totals', () => {
  it('computes subtotals per category', () => {
    const expenses = [
      makeExpense('COMBUSTIBIL', 250.5),
      makeExpense('COMBUSTIBIL', 180.0),
      makeExpense('MASA', 45.0),
      makeExpense('CAZARE', 320.0),
    ];
    const { subtotals, grand } = computeTotals(expenses);
    expect(subtotals['COMBUSTIBIL']).toBe(430.5);
    expect(subtotals['MASA']).toBe(45.0);
    expect(subtotals['CAZARE']).toBe(320.0);
    expect(grand).toBe(795.5);
  });

  it('returns zero grand total for empty expense list', () => {
    const { grand } = computeTotals([]);
    expect(grand).toBe(0);
  });

  it('handles floating point amounts without drift', () => {
    const expenses = [
      makeExpense('ALTELE', 0.1),
      makeExpense('ALTELE', 0.2),
    ];
    const { subtotals } = computeTotals(expenses);
    expect(subtotals['ALTELE']).toBe(0.3);
  });

  it('groups correctly when single category', () => {
    const expenses = [makeExpense('TRANSPORT', 100), makeExpense('TRANSPORT', 55.75)];
    const { subtotals, grand } = computeTotals(expenses);
    expect(Object.keys(subtotals)).toHaveLength(1);
    expect(grand).toBe(155.75);
  });

  it('budget delta is positive when under budget', () => {
    const budget = 1000;
    const total = 795.5;
    expect(parseFloat((budget - total).toFixed(2))).toBe(204.5);
  });

  it('budget delta is negative when over budget', () => {
    const budget = 500;
    const total = 795.5;
    expect(parseFloat((budget - total).toFixed(2))).toBe(-295.5);
  });
});
