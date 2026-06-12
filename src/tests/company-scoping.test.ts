import { describe, it, expect } from 'vitest';

// Simulates the companyId scoping logic used in all service/route where-clauses.
// Verifies that data from company A is never visible to company B.

type Resource = { id: string; companyId: string; userId: string; amount: number };

function findForUser(
  resources: Resource[],
  user: { companyId: string; id: string; role: string }
): Resource[] {
  if (user.role === 'EMPLOYEE') {
    return resources.filter(
      (r) => r.companyId === user.companyId && r.userId === user.id
    );
  }
  return resources.filter((r) => r.companyId === user.companyId);
}

const resources: Resource[] = [
  { id: '1', companyId: 'company-a', userId: 'user-a1', amount: 100 },
  { id: '2', companyId: 'company-a', userId: 'user-a2', amount: 200 },
  { id: '3', companyId: 'company-b', userId: 'user-b1', amount: 300 },
];

describe('companyId scoping', () => {
  it('ADMIN from company A sees only company A resources', () => {
    const result = findForUser(resources, { companyId: 'company-a', id: 'user-a1', role: 'ADMIN' });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.companyId === 'company-a')).toBe(true);
  });

  it('EMPLOYEE from company A sees only their own resources', () => {
    const result = findForUser(resources, { companyId: 'company-a', id: 'user-a1', role: 'EMPLOYEE' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('user from company A cannot see company B resources regardless of role', () => {
    for (const role of ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE']) {
      const result = findForUser(resources, { companyId: 'company-a', id: 'user-b1', role });
      expect(result.some((r) => r.companyId === 'company-b')).toBe(false);
    }
  });

  it('MANAGER from company B sees only company B resources', () => {
    const result = findForUser(resources, { companyId: 'company-b', id: 'user-b1', role: 'MANAGER' });
    expect(result).toHaveLength(1);
    expect(result[0].companyId).toBe('company-b');
  });

  it('EMPLOYEE with no matching resources returns empty array', () => {
    const result = findForUser(resources, { companyId: 'company-a', id: 'unknown-user', role: 'EMPLOYEE' });
    expect(result).toHaveLength(0);
  });
});
