import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { loginSchema, refreshSchema, registerSchema } from './auth.schema';
import * as controller from './auth.controller';

export const authRouter = Router();
authRouter.post('/register', validate(registerSchema), controller.register);
authRouter.post('/login', validate(loginSchema), controller.login);
authRouter.post('/refresh', validate(refreshSchema), controller.refresh);
authRouter.post('/logout', validate(refreshSchema), controller.logout);
