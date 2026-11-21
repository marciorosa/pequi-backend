/**
 * Widget de atendimento white-label (chat embutido no site do escritório).
 *
 * Fluxo:
 * 1. widget.js (no site do escritório) chama GET /widget/config?key=pk_wl_…
 *    O CORS dessa rota só libera as origens cadastradas para aquele escritório.
 * 2. O widget abre o iframe /embed/chat do Pequi. O Next manda frame-ancestors com as
 *    mesmas origens, então só os sites autorizados conseguem embutir o chat.
 * 3. O iframe pede POST /widget/session e recebe um token curto (2 h) preso ao escritório,
 *    ao visitante e à origem. Cada mensagem exige esse token e passa por limites de uso.
 * 4. Depois de algumas mensagens grátis, o widget pede o contato (nome, e-mail, telefone);
 *    esgotadas as mensagens após o contato, sugere os planos do escritório.
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Tenant from '../models/tenant.model';
import WidgetConversation from '../models/widgetConversation.model';
import { findTenantByWidgetKey, isWidgetOriginAllowed, normalizeOrigin, publicTenant, panelUrl } from '../services/tenant.service';
import { hit, clientIp } from '../middleware/rateLimit.middleware';
import { maritacaChat, isMaritacaConfigured } from '../services/maritaca.service';
import geminiService, { formatResponseToHTML } from '../services/gemini.service';
import { isAiFailureMessage } from '../controllers/ai.controller';

const router = express.Router();
router.use(express.json({ limit: '50kb' }));

const TOKEN_TTL = '2h';
const MAX_MESSAGE_CHARS = 2000;

// Segredo próprio do widget: um token do widget nunca vale como login de usuário
const widgetSecret = () =>
  crypto.createHmac('sha256', String(process.env.JWT_SECRET || '')).update('pequi-widget-v1').digest('hex');

/* ------------------------------------ CORS ------------------------------------ */

// Origens do próprio Pequi (de onde o iframe /embed/chat faz os pedidos)
const pequiOrigins = (): string[] =>
  Array.from(new Set(['https://pequi.me', 'https://www.pequi.me', ...(process.env.FRONTEND_URL || '').split(',')]))
    .map(normalizeOrigin)
    .filter(Boolean);

/** CORS de /widget/config: só os sites cadastrados do escritório da chave */
const tenantCors = (req: Request, res: Response, next: NextFunction) =>
  cors(async (request: any, cb: any) => {
    const origin = request.headers.origin as string | undefined;
    if (!origin) return cb(null, { origin: false });
    const tenant = await findTenantByWidgetKey(String(request.query.key || '')).catch(() => null);
    cb(null, { origin: Boolean(tenant && isWidgetOriginAllowed(tenant, origin)), methods: ['GET'], maxAge: 600 });
  })(req, res, next);

/** CORS das demais rotas: só o próprio Pequi (o iframe) */
const pequiCors = cors({
  origin: (origin, cb) => cb(null, !origin || pequiOrigins().includes(normalizeOrigin(origin))),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
});

const limited = (res: Response, retryAfter: number, message = 'Muitas mensagens em pouco tempo. Aguarde um instante e tente de novo.') => {
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({ message });
};

/* ------------------------------- configuração ------------------------------- */

/**
 * GET /widget/config?key=pk_wl_…
 * Marca para o botão do widget. Pedido vindo de um site não autorizado recebe 403.
 * Sem Origin (pedido do servidor do Next), devolve também as origens para o frame-ancestors.
 */
router.options('/config', tenantCors);
router.get('/config', tenantCors, async (req: Request, res: Response) => {
  const r = hit(`cfg:${clientIp(req)}`, 120, 60 * 1000);
  if (!r.ok) return limited(res, r.retryAfter);

  const tenant = await findTenantByWidgetKey(String(req.query.key || '')).catch(() => null);
  if (!tenant || !tenant.widget?.enabled) return res.status(404).json({ message: 'Widget não encontrado ou desativado' });

  const origin = req.headers.origin as string | undefined;
  if (origin && !isWidgetOriginAllowed(tenant, origin)) {
    return res.status(403).json({ message: 'Este site não está autorizado a usar este widget' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    tenant: publicTenant(tenant),
    // Origens que podem embutir o iframe (lista pública: são os sites do próprio escritório)
    frameAncestors: (tenant.domains?.widgetOrigins || []).map(normalizeOrigin).filter(Boolean),
  });
});

/* ---------------------------------- sessão ---------------------------------- */

type WidgetClaims = { t: string; v: string; o: string; typ: 'widget' };

const readToken = (req: Request): WidgetClaims | null => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const c = jwt.verify(h.slice(7), widgetSecret()) as any;
    return c?.typ === 'widget' && c.t && c.v ? c : null;
  } catch {
    return null;
  }
};

const conversationState = (conv: any, tenant: any) => {
  const free = tenant.widget?.freeMessages ?? 3;
  const afterLead = tenant.widget?.leadMessages ?? 10;
  const count = conv?.userMessageCount || 0;
  const hasLead = Boolean(conv?.lead?.email || conv?.lead?.phone);
  let gate: 'none' | 'lead' | 'plan' = 'none';
  if (!hasLead && count >= free) gate = 'lead';
  else if (hasLead && count >= free + afterLead) gate = 'plan';
  return {
    gate,
    hasLead,
    remaining: hasLead ? Math.max(0, free + afterLead - count) : Math.max(0, free - count),
    messages: (conv?.messages || []).slice(-40).map((m: any) => ({ role: m.role, content: m.content })),
  };
};

/** POST /widget/session { key, parentOrigin, visitorId? } */
router.options(['/session', '/message', '/lead'], pequiCors);
router.post('/session', pequiCors, async (req: Request, res: Response) => {
  const r = hit(`ses:${clientIp(req)}`, 30, 60 * 1000);
  if (!r.ok) return limited(res, r.retryAfter);

  const { key, parentOrigin } = req.body || {};
  const tenant = await findTenantByWidgetKey(String(key || '')).catch(() => null);
  if (!tenant || !tenant.widget?.enabled) return res.status(404).json({ message: 'Widget não encontrado ou desativado' });

  // Segunda barreira (a primeira é o frame-ancestors): a página que abriu o iframe precisa estar na lista
  const origin = normalizeOrigin(String(parentOrigin || ''));
  if (!origin || !isWidgetOriginAllowed(tenant, origin)) {
    return res.status(403).json({ message: 'Este site não está autorizado a usar este widget' });
  }

  let visitorId = String(req.body?.visitorId || '');
  if (!/^v_[a-f0-9]{32}$/.test(visitorId)) visitorId = `v_${crypto.randomBytes(16).toString('hex')}`;

  const conv = await WidgetConversation.findOne({ tenantId: tenant._id, visitorId }).lean();
  const token = jwt.sign({ t: String(tenant._id), v: visitorId, o: origin, typ: 'widget' } as WidgetClaims, widgetSecret(), {
    expiresIn: TOKEN_TTL,
  });

  res.json({ token, visitorId, tenant: publicTenant(tenant), state: conversationState(conv, tenant) });
});

/* --------------------------------- mensagens --------------------------------- */

const officePrompt = (tenant: any) =>
  [
    `Você é a assistente virtual de atendimento do escritório "${tenant.branding?.displayName || tenant.name}", exibida no site do próprio escritório.`,
    'Acolha a pessoa, entenda a situação dela e explique os direitos e caminhos possíveis em linguagem simples.',
    'Quando o caso exigir análise individual, prazos urgentes ou atuação em processo, sugira falar com a equipe deste escritório pelo próprio atendimento.',
    'Não prometa resultado, não informe preços de honorários e não diga que a pessoa já é cliente do escritório.',
    'Respostas curtas: no máximo 4 parágrafos.',
  ].join('\n');

/** POST /widget/message { message } (Authorization: Bearer <token do widget>) */
router.post('/message', pequiCors, async (req: Request, res: Response) => {
  const claims = readToken(req);
  if (!claims) return res.status(401).json({ message: 'Sessão do chat expirada. Recarregue a página.' });

  const tenant = await Tenant.findById(claims.t);
  if (!tenant || tenant.status !== 'active' || !tenant.widget?.enabled) {
    return res.status(404).json({ message: 'Widget não encontrado ou desativado' });
  }

  // Limites: por visitante, por IP e por escritório (minuto e dia)
  const perMin = tenant.widget.rateLimitPerMinute || 20;
  const checks = [
    hit(`msg:v:${claims.v}`, Math.min(perMin, 10), 60 * 1000),
    hit(`msg:ip:${clientIp(req)}`, perMin, 60 * 1000),
    hit(`msg:t:${claims.t}:min`, perMin * 10, 60 * 1000),
  ];
  const blocked = checks.find((c) => !c.ok);
  if (blocked) return limited(res, blocked.retryAfter);
  const day = hit(`msg:t:${claims.t}:day:${new Date().toISOString().slice(0, 10)}`, tenant.widget.dailyMessageCap || 2000, 24 * 60 * 60 * 1000);
  if (!day.ok) return limited(res, day.retryAfter, 'O atendimento atingiu o limite do dia. Tente novamente amanhã.');

  const message = String(req.body?.message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) return res.status(400).json({ message: 'Escreva uma mensagem.' });

  let conv = await WidgetConversation.findOne({ tenantId: tenant._id, visitorId: claims.v });
  const state = conversationState(conv, tenant);
  if (state.gate !== 'none') {
    return res.json({ gate: state.gate, state, plansUrl: `${panelUrl(tenant)}/assinar` });
  }
  if (!conv) conv = new WidgetConversation({ tenantId: tenant._id, visitorId: claims.v, origin: claims.o, messages: [] });

  const history = conv.messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
  let reply = '';
  let isError = false;
  try {
    if (isMaritacaConfigured()) {
      reply = formatResponseToHTML(
        await maritacaChat(message, { chatHistory: history, languageLevel: 'simple', extraSystem: officePrompt(tenant), maxTokens: 1200 })
      );
    } else {
      reply = await geminiService.generateChatResponse(`${officePrompt(tenant)}\n\nMensagem do visitante: ${message}`, {
        languageLevel: 'simple',
        chatHistory: history,
      });
    }
    isError = isAiFailureMessage(reply);
  } catch (error: any) {
    console.error('[widget] Falha da IA:', error?.message || error);
    isError = true;
  }
  if (isError || !reply) {
    return res.status(503).json({ message: 'A assistente está indisponível agora. Tente de novo em instantes.' });
  }

  conv.messages.push({ role: 'user', content: message, at: new Date() } as any);
  conv.messages.push({ role: 'assistant', content: reply, at: new Date() } as any);
  conv.userMessageCount += 1;
  await conv.save();

  res.json({ reply, state: conversationState(conv, tenant) });
});

/** POST /widget/lead { name, email, phone } */
router.post('/lead', pequiCors, async (req: Request, res: Response) => {
  const claims = readToken(req);
  if (!claims) return res.status(401).json({ message: 'Sessão do chat expirada. Recarregue a página.' });
  const r = hit(`lead:${clientIp(req)}`, 10, 60 * 1000);
  if (!r.ok) return limited(res, r.retryAfter);

  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 160);
  const phone = String(req.body?.phone || '').replace(/[^\d+()\s-]/g, '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ message: 'Informe o seu nome.' });
  if (!/^\S+@\S+\.\S+$/.test(email) && phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ message: 'Informe um e-mail válido ou um telefone com DDD.' });
  }

  const tenant = await Tenant.findById(claims.t);
  if (!tenant) return res.status(404).json({ message: 'Widget não encontrado' });

  const conv = await WidgetConversation.findOneAndUpdate(
    { tenantId: tenant._id, visitorId: claims.v },
    {
      $set: { lead: { name, email: email || undefined, phone: phone || undefined, capturedAt: new Date() } },
      $setOnInsert: { origin: claims.o, messages: [], userMessageCount: 0 },
    },
    { upsert: true, new: true }
  );
  res.json({ ok: true, state: conversationState(conv, tenant) });
});

export default router;
