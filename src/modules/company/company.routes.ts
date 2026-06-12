import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roles';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';

export const companyRouter = Router();
companyRouter.use(requireAuth);

companyRouter.get('/', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } });
  if (!company) throw new AppError(404, 'Company not found');
  res.json(company);
});

const updateCompanySchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    cif: z.string().optional(),
    accountantEmail: z.string().email().optional(),
    settings: z.record(z.string(), z.unknown()).optional()
  })
});

companyRouter.patch('/', requireRole('ADMIN'), validate(updateCompanySchema), async (req, res) => {
  const company = await prisma.company.update({
    where: { id: req.user!.companyId },
    data: req.body
  });
  res.json(company);
});
