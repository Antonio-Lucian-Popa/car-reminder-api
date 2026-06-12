import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirrors the defensive parsing logic from src/modules/ocr/ocr.routes.ts
const ocrResultSchema = z.object({
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  date: z.string().nullable(),
  merchant: z.string().nullable(),
  cif: z.string().nullable(),
  category: z.enum(['COMBUSTIBIL', 'MASA', 'CAZARE', 'TRANSPORT', 'ALTELE']).nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

type OcrResult = z.infer<typeof ocrResultSchema>;

const EMPTY_RESULT: OcrResult = {
  amount: null, currency: null, date: null,
  merchant: null, cif: null, category: null, confidence: 'low',
};

function parseOcrResponse(raw: string): OcrResult {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const json = JSON.parse(cleaned);
    return ocrResultSchema.parse(json);
  } catch {
    return EMPTY_RESULT;
  }
}

describe('OCR response defensive parsing', () => {
  it('parses a valid JSON response', () => {
    const raw = JSON.stringify({
      amount: 150.5, currency: 'RON', date: '2026-01-15',
      merchant: 'Petrom', cif: 'RO1234567',
      category: 'COMBUSTIBIL', confidence: 'high',
    });
    const result = parseOcrResponse(raw);
    expect(result.amount).toBe(150.5);
    expect(result.merchant).toBe('Petrom');
    expect(result.category).toBe('COMBUSTIBIL');
    expect(result.confidence).toBe('high');
  });

  it('strips markdown JSON fences before parsing', () => {
    const raw = '```json\n{"amount":45.0,"currency":"RON","date":"2026-01-10","merchant":"McDonald\'s","cif":null,"category":"MASA","confidence":"medium"}\n```';
    const result = parseOcrResponse(raw);
    expect(result.amount).toBe(45.0);
    expect(result.category).toBe('MASA');
    expect(result.confidence).toBe('medium');
  });

  it('returns EMPTY_RESULT on invalid JSON', () => {
    const result = parseOcrResponse('not valid json at all');
    expect(result).toEqual(EMPTY_RESULT);
  });

  it('returns EMPTY_RESULT when required field is missing', () => {
    // Missing 'confidence' field — Zod should reject
    const raw = JSON.stringify({ amount: 100, currency: 'RON', date: null, merchant: null, cif: null, category: null });
    const result = parseOcrResponse(raw);
    expect(result).toEqual(EMPTY_RESULT);
  });

  it('returns EMPTY_RESULT on empty string', () => {
    expect(parseOcrResponse('')).toEqual(EMPTY_RESULT);
  });

  it('handles all-null fields with low confidence', () => {
    const raw = JSON.stringify({
      amount: null, currency: null, date: null,
      merchant: null, cif: null, category: null, confidence: 'low',
    });
    const result = parseOcrResponse(raw);
    expect(result.confidence).toBe('low');
    expect(result.amount).toBeNull();
  });

  it('rejects unknown category values', () => {
    const raw = JSON.stringify({
      amount: 50, currency: 'RON', date: '2026-01-01',
      merchant: 'Test', cif: null, category: 'UNKNOWN_CATEGORY', confidence: 'high',
    });
    const result = parseOcrResponse(raw);
    expect(result).toEqual(EMPTY_RESULT);
  });
});
