import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import { env } from '../../config/env';
import { createDocumentSchema, docListSchema, docIdSchema } from './documents.schema';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|jpg|png|webp|heic)|application\/pdf/;
    cb(null, allowed.test(file.mimetype));
  },
});

async function getOwnedCarIds(userId: string, carId?: string): Promise<string[]> {
  if (carId) {
    const car = await prisma.car.findFirst({ where: { id: carId, userId } });
    if (!car) throw new AppError(404, 'Car not found');
    return [carId];
  }
  const cars = await prisma.car.findMany({ where: { userId }, select: { id: true } });
  return cars.map((c) => c.id);
}

documentsRouter.get('/', validate(docListSchema), async (req, res) => {
  const { carId } = req.query as { carId?: string };
  const carIds = await getOwnedCarIds(req.user!.id, carId);
  const docs = await prisma.document.findMany({
    where: { carId: { in: carIds } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

documentsRouter.post('/', upload.single('file'), validate(createDocumentSchema), async (req, res) => {
  if (!req.file) throw new AppError(400, 'File is required');
  const { carId, type, title, linkedCostId, linkedReminderId } = req.body;
  await getOwnedCarIds(req.user!.id, carId);
  const imageUrl = `${env.PUBLIC_URL}/api/uploads/documents/${req.file.filename}`;
  const doc = await prisma.document.create({
    data: { carId, type, title, imageUrl, linkedCostId, linkedReminderId },
  });
  res.status(201).json(doc);
});

documentsRouter.delete('/:id', validate(docIdSchema), async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id as string },
    include: { car: { select: { userId: true } } },
  });
  if (!doc || doc.car.userId !== req.user!.id) throw new AppError(404, 'Document not found');

  // Remove file from disk (extract relative path from full URL)
  const filename = path.basename(doc.imageUrl);
  const filePath = path.join(process.cwd(), 'uploads', 'documents', filename);
  fs.unlink(filePath, () => {/* best-effort */});

  await prisma.document.delete({ where: { id: doc.id } });
  res.status(204).send();
});
