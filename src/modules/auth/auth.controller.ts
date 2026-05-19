import { Request, Response } from 'express';
import * as service from './auth.service';

export async function register(req: Request, res: Response) {
  res.status(201).json(await service.register(req.body));
}
export async function login(req: Request, res: Response) {
  res.json(await service.login(req.body));
}
export async function refresh(req: Request, res: Response) {
  res.json(await service.refresh(req.body.refreshToken));
}
export async function logout(req: Request, res: Response) {
  res.json(await service.logout(req.body.refreshToken));
}
