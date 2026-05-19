import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse({ body: req.body, params: req.params, query: req.query }) as {
      body?: unknown;
      params?: Request['params'];
    };
    req.body = parsed.body ?? req.body;
    req.params = parsed.params ?? req.params;
    next();
  };
}
