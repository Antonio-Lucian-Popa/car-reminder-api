import { Request, Response } from 'express';
import * as service from './auth.service';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function activationPage(token: string, error?: string) {
  const escapedToken = escapeHtml(token);
  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Activează contul</title>
  <style>
    body{font-family:Arial,sans-serif;background:#0b0f19;color:#f8fafc;margin:0;display:grid;min-height:100vh;place-items:center}
    main{width:min(420px,calc(100vw - 32px));background:#111827;border:1px solid #24304a;border-radius:16px;padding:28px}
    h1{margin:0 0 8px;font-size:28px}
    p{color:#aab4cc;line-height:1.5}
    label{display:block;margin:18px 0 8px;color:#dbe4f0;font-weight:700}
    input{width:100%;box-sizing:border-box;border:1px solid #33415f;background:#0b1020;color:#fff;border-radius:12px;padding:14px;font-size:16px}
    button{width:100%;border:0;border-radius:999px;background:#5b8def;color:white;font-weight:700;font-size:16px;padding:14px;margin-top:20px}
    .error{color:#f87171}
  </style>
</head>
<body>
  <main>
    <h1>Activează contul</h1>
    <p>Setează parola pentru contul tău. După activare te poți autentifica în aplicație.</p>
    ${errorHtml}
    <form method="post" action="/api/auth/activate-invite">
      <input type="hidden" name="token" value="${escapedToken}" />
      <label for="password">Parolă nouă</label>
      <input id="password" name="password" type="password" minlength="8" autocomplete="new-password" required />
      <button type="submit">Activează contul</button>
    </form>
  </main>
</body>
</html>`;
}

function successPage() {
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Cont activat</title><style>body{font-family:Arial,sans-serif;background:#0b0f19;color:#f8fafc;margin:0;display:grid;min-height:100vh;place-items:center}main{width:min(420px,calc(100vw - 32px));background:#111827;border:1px solid #24304a;border-radius:16px;padding:28px}p{color:#aab4cc;line-height:1.5}</style></head><body><main><h1>Cont activat</h1><p>Parola a fost setată. Poți reveni în aplicație și te poți autentifica.</p></main></body></html>`;
}

export async function register(req: Request, res: Response) {
  res.status(201).json(await service.register(req.body));
}
export async function login(req: Request, res: Response) {
  res.json(await service.login(req.body));
}
export async function refresh(req: Request, res: Response) {
  res.json(await service.refresh(req.body.refreshToken));
}
export async function activateInvitePage(req: Request, res: Response) {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  res.type('html').send(activationPage(token));
}
export async function activateInvite(req: Request, res: Response) {
  try {
    const result = await service.activateInvite(req.body);
    if (req.is('application/x-www-form-urlencoded')) return res.type('html').send(successPage());
    return res.json(result);
  } catch (error: any) {
    if (req.is('application/x-www-form-urlencoded')) {
      return res.status(error.statusCode ?? 400).type('html').send(activationPage(req.body.token ?? '', error.message ?? 'Nu am putut activa contul.'));
    }
    throw error;
  }
}
export async function logout(req: Request, res: Response) {
  res.json(await service.logout(req.body.refreshToken));
}
