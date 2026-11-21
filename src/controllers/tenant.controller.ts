/**
 * Modo white-label: cadastro dos escritórios (admin), planos que o escritório vende,
 * contatos do widget, Stripe Connect e assinatura dos clientes do escritório.
 *
 * Os handlers que recebem (req as TenantRequest).tenant são usados tanto pelo admin
 * (/admin/tenants/:id/...) quanto pelo dono do escritório (/office/...).
 */
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import Tenant, { ITenant, newWidgetKey } from '../models/tenant.model';
import TenantPlan from '../models/tenantPlan.model';
import WidgetConversation from '../models/widgetConversation.model';
import Subscription from '../models/subscription.model';
import User from '../models/user.model';
import AdminLog from '../models/adminLog.model';
import {
  cleanList,
  clearTenantCache,
  findTenantByHost,
  findTenantBySlug,
  publicTenant,
  panelUrl,
} from '../services/tenant.service';
import {
  syncPlanPrice,
  createClientCheckout,
  confirmClientCheckout,
  applyCommissionToActive,
  tenantFinance,
  tenantClients,
} from '../services/tenantBilling.service';
import { TenantPayout } from '../models/tenantLedger.model';
import { sendWorkflowEmail } from '../services/email.service';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '../utils/errors';
import { PLAN_LIMITS, PLAN_FEATURES } from '../config/plans';

export interface TenantRequest extends AuthRequest {
  tenant?: ITenant;
}

const fail = (res: Response, error: any, fallback: string) => {
  if (error instanceof AppError) return res.status(error.statusCode).json({ message: error.message });
  if (error?.name === 'ValidationError') {
    const first = Object.values(error.errors || {})[0] as any;
    return res.status(400).json({ message: first?.message || 'Dados inválidos' });
  }
  if (error?.code === 11000) return res.status(400).json({ message: 'Já existe um escritório com este identificador (slug)' });
  console.error('[tenant]', fallback, error?.message || error);
  return res.status(500).json({ message: fallback });
};

const log = (req: AuthRequest, action: string, details?: string) =>
  AdminLog.create({ adminId: req.user!.id, adminEmail: req.user!.email || '', action, details }).catch(() => undefined);

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_CHARS = 700_000; // logo enviado como data URL (cerca de 500 KB)

const cleanImage = (v: any): string | undefined => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.length > MAX_LOGO_CHARS) throw new AppError('A imagem é grande demais (máximo de 500 KB)', 400);
  if (/^https:\/\//i.test(s) || /^data:image\/(png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/i.test(s)) return s;
  throw new AppError('Use um endereço https:// ou envie uma imagem PNG, JPG, WEBP ou SVG', 400);
};

const slugify = (v: string) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Aplica no escritório os campos enviados pelo admin (só os que vieram) */
const applyTenantFields = (t: ITenant, b: any) => {
  if (b.name !== undefined) t.name = String(b.name).trim();
  if (b.slug !== undefined) t.slug = slugify(b.slug);
  if (b.status !== undefined) t.status = b.status === 'suspended' ? 'suspended' : 'active';
  if (b.pequiPlan !== undefined) t.pequiPlan = b.pequiPlan === 'enterprise' ? 'enterprise' : 'pro';
  if (b.commissionPercent !== undefined) {
    const c = Number(b.commissionPercent);
    if (!Number.isFinite(c) || c < 0 || c > 100) throw new AppError('A comissão deve ficar entre 0% e 100%', 400);
    t.commissionPercent = Math.round(c * 100) / 100;
  }
  const br = b.branding || {};
  t.branding = t.branding || ({} as any);
  if (br.displayName !== undefined) t.branding.displayName = String(br.displayName).trim();
  if (br.logoUrl !== undefined) t.branding.logoUrl = cleanImage(br.logoUrl);
  if (br.faviconUrl !== undefined) t.branding.faviconUrl = cleanImage(br.faviconUrl);
  for (const k of ['primaryColor', 'inkColor'] as const) {
    if (br[k] !== undefined) {
      if (!HEX.test(br[k])) throw new AppError('Cor inválida: use o formato #RRGGBB', 400);
      t.branding[k] = String(br[k]).toUpperCase();
    }
  }
  if (br.welcomeMessage !== undefined) t.branding.welcomeMessage = String(br.welcomeMessage).trim().slice(0, 300);
  if (br.widgetPosition !== undefined) t.branding.widgetPosition = br.widgetPosition === 'left' ? 'left' : 'right';
  const d = b.domains || {};
  t.domains = t.domains || ({ panelDomains: [], widgetOrigins: [] } as any);
  if (d.panelDomains !== undefined) t.domains.panelDomains = cleanList(d.panelDomains, 'host');
  if (d.widgetOrigins !== undefined) t.domains.widgetOrigins = cleanList(d.widgetOrigins, 'origin');
  const w = b.widget || {};
  t.widget = t.widget || ({} as any);
  if (w.enabled !== undefined) t.widget.enabled = Boolean(w.enabled);
  for (const k of ['freeMessages', 'leadMessages', 'rateLimitPerMinute', 'dailyMessageCap'] as const) {
    if (w[k] !== undefined) t.widget[k] = Math.max(0, Math.floor(Number(w[k]) || 0));
  }
};

/**
 * Liga o responsável (pelo e-mail) ao escritório.
 * Se ainda não houver conta com esse e-mail, cria a conta e devolve um link para
 * a pessoa definir a senha (também enviado por e-mail, quando o envio estiver configurado).
 */
const linkOwner = async (t: ITenant, ownerEmail?: string): Promise<string | null> => {
  const email = String(ownerEmail || '').trim().toLowerCase();
  if (!email) return null;
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AppError('E-mail do responsável inválido', 400);
  let owner = await User.findOne({ email });
  let inviteLink: string | null = null;
  if (owner && owner.tenantId && String(owner.tenantId) !== String(t._id)) {
    throw new AppError('Esta conta já pertence a outro escritório', 400);
  }
  if (!owner) {
    const token = crypto.randomBytes(32).toString('hex');
    owner = new User({
      name: t.branding?.displayName || t.name,
      email,
      password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
      resetPasswordToken: await bcrypt.hash(token, 10),
      resetPasswordExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const front = (process.env.FRONTEND_URL || 'https://pequi.me').split(',')[0].trim().replace(/\/$/, '');
    // Link com ?tenant: a página de criar senha já abre com a marca do escritório
    inviteLink = `${front}/reset-password?token=${token}&email=${encodeURIComponent(email)}&tenant=${t.slug}`;
  }
  owner.tenantId = t._id as any;
  owner.tenantRole = 'owner';
  await owner.save();
  t.ownerUserId = owner._id as any;
  if (inviteLink) {
    const name = t.branding?.displayName || t.name;
    sendWorkflowEmail(
      email,
      `Acesso à administração de ${name}`,
      `<div style="font-family:sans-serif;color:#333"><p>Olá!</p><p>A área de administração de <strong>${name}</strong> foi criada.</p><p>Defina sua senha neste link (vale por 7 dias):</p><p><a href="${inviteLink}">${inviteLink}</a></p><p>Depois, entre com este e-mail e abra o menu <strong>Administração</strong>.</p></div>`
    ).catch((e) => console.error('[tenant] Falha ao enviar o convite:', e?.message || e));
  }
  return inviteLink;
};

const adminView = async (t: ITenant) => {
  const owner = t.ownerUserId ? await User.findById(t.ownerUserId).select('name email').lean() : null;
  return {
    ...t.toObject(),
    owner,
    panelUrl: panelUrl(t),
  };
};

/**
 * Planos padrão do escritório: os mesmos preços e limites do Pro do Pequi
 * (R$ 399/mês e R$ 3.999/ano).
 * Se o Stripe falhar, o plano fica salvo e vai para o Stripe ao ser editado ou na primeira compra.
 */
const DEFAULT_PLANS = [
  { name: 'Pro mensal', priceCents: 39900, interval: 'month' as const, description: 'Acesso completo à assistente jurídica, com cobrança mensal.' },
  { name: 'Pro anual', priceCents: 399900, interval: 'year' as const, description: 'Acesso completo à assistente jurídica, com cobrança anual.' },
];

export const ensureDefaultPlans = async (t: ITenant): Promise<number> => {
  // Só para escritórios que ainda não têm nenhum plano: depois disso, os planos são
  // do escritório (ele altera, desativa ou cria outros) e nunca são recriados
  if (await TenantPlan.exists({ tenantId: t._id })) return 0;
  const limits = Object.fromEntries(
    Object.entries(PLAN_LIMITS.pro).map(([k, v]) => [k, Number.isFinite(v) ? v : null])
  );
  let created = 0;
  for (const d of DEFAULT_PLANS) {
    const plan = await TenantPlan.create({ ...d, tenantId: t._id, limits, features: PLAN_FEATURES.pro, active: true });
    created += 1;
    await syncPlanPrice(plan, t).catch((e) => console.error('[tenant] Plano padrão salvo sem o Stripe:', e?.message || e));
  }
  return created;
};

/** Na subida da API: dá os planos padrão aos escritórios já cadastrados que ainda não têm planos */
export const backfillDefaultPlans = async () => {
  const tenants = await Tenant.find({});
  let total = 0;
  for (const t of tenants) total += await ensureDefaultPlans(t).catch(() => 0);
  if (total) console.log(`[startup] Planos padrão criados: ${total}`);
};

/* ------------------------------------ admin ------------------------------------ */

/** GET /admin/tenants */
export const listTenants = async (req: AuthRequest, res: Response) => {
  try {
    const tenants = await Tenant.find({}).sort({ createdAt: -1 }).lean();
    const ids = tenants.map((t) => t._id);
    const [clients, subs, leads] = await Promise.all([
      User.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
      Subscription.aggregate([{ $match: { tenantId: { $in: ids }, status: 'active' } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
      WidgetConversation.aggregate([{ $match: { tenantId: { $in: ids }, 'lead.capturedAt': { $exists: true } } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
    ]);
    const count = (arr: any[], id: any) => arr.find((x) => String(x._id) === String(id))?.n || 0;
    res.json({
      tenants: tenants.map((t: any) => ({
        _id: t._id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        pequiPlan: t.pequiPlan,
        commissionPercent: t.commissionPercent,
        primaryColor: t.branding?.primaryColor,
        logoUrl: t.branding?.logoUrl,
        widgetOrigins: t.domains?.widgetOrigins || [],
        panelDomains: t.domains?.panelDomains || [],
        stripeReady: Boolean(t.stripe?.chargesEnabled),
        users: count(clients, t._id),
        activeSubscriptions: count(subs, t._id),
        leads: count(leads, t._id),
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    fail(res, error, 'Não foi possível listar os escritórios');
  }
};

/** POST /admin/tenants */
export const createTenant = async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const t = new Tenant({ name: String(b.name || '').trim(), slug: slugify(b.slug || b.name) });
    applyTenantFields(t, { ...b, slug: b.slug || b.name });
    if (!t.branding.displayName) t.branding.displayName = t.name;
    await t.validate();
    const inviteLink = await linkOwner(t, b.ownerEmail);
    await t.save();
    // Todo escritório novo já nasce com os planos padrão (iguais ao Pro do Pequi)
    await ensureDefaultPlans(t).catch((e) => console.error('[tenant] Falha nos planos padrão:', e?.message || e));
    clearTenantCache();
    log(req, 'tenantCreate', `${t.name} (${t.slug})`);
    res.status(201).json({ tenant: await adminView(t), inviteLink });
  } catch (error) {
    fail(res, error, 'Não foi possível cadastrar o escritório');
  }
};

/** Carrega o escritório de :id em req.tenant (rotas do admin) */
export const loadTenantParam = async (req: TenantRequest, res: Response, next: NextFunction) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Escritório inválido' });
  const t = await Tenant.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Escritório não encontrado' });
  req.tenant = t;
  next();
};

/** GET /admin/tenants/:id */
export const getTenant = async (req: TenantRequest, res: Response) => {
  try {
    res.json({ tenant: await adminView(req.tenant!) });
  } catch (error) {
    fail(res, error, 'Não foi possível carregar o escritório');
  }
};

/** PUT /admin/tenants/:id */
export const updateTenant = async (req: TenantRequest, res: Response) => {
  try {
    const t = req.tenant!;
    const before = t.commissionPercent;
    applyTenantFields(t, req.body || {});
    const inviteLink = req.body?.ownerEmail !== undefined ? await linkOwner(t, req.body.ownerEmail) : null;
    await t.save();
    clearTenantCache();
    log(req, 'tenantUpdate', `${t.name}${before !== t.commissionPercent ? ` · comissão ${before}% → ${t.commissionPercent}%` : ''}`);
    res.json({ tenant: await adminView(t), inviteLink });
  } catch (error) {
    fail(res, error, 'Não foi possível salvar o escritório');
  }
};

/** POST /admin/tenants/:id/rotate-key: troca a chave pública (o snippet antigo para de funcionar) */
export const rotateWidgetKey = async (req: TenantRequest, res: Response) => {
  try {
    const t = req.tenant!;
    t.widget.publicKey = newWidgetKey();
    await t.save();
    clearTenantCache();
    log(req, 'tenantRotateKey', t.name);
    res.json({ tenant: await adminView(t) });
  } catch (error) {
    fail(res, error, 'Não foi possível trocar a chave');
  }
};

/** POST /admin/tenants/:id/apply-commission */
export const applyCommission = async (req: TenantRequest, res: Response) => {
  try {
    const result = await applyCommissionToActive(req.tenant!);
    log(req, 'tenantApplyCommission', `${req.tenant!.name}: ${result.updated}/${result.total} assinaturas em ${req.tenant!.commissionPercent}%`);
    res.json(result);
  } catch (error) {
    fail(res, error, 'Não foi possível aplicar a comissão');
  }
};

/* ------------------------- admin e dono do escritório ------------------------- */

/** Dono do escritório: carrega o escritório da própria conta em req.tenant */
export const loadOwnTenant = async (req: TenantRequest, res: Response, next: NextFunction) => {
  const user = await User.findById(req.user?.id).select('tenantId tenantRole').lean();
  if (!user?.tenantId || !['owner', 'staff'].includes(String(user.tenantRole))) {
    return res.status(403).json({ message: 'Área restrita à equipe do escritório' });
  }
  const t = await Tenant.findById(user.tenantId);
  if (!t) return res.status(404).json({ message: 'Escritório não encontrado' });
  req.tenant = t;
  (req as any).tenantRole = user.tenantRole;
  next();
};

export const requireOwner = (req: TenantRequest, res: Response, next: NextFunction) =>
  (req as any).tenantRole === 'owner' ? next() : res.status(403).json({ message: 'Só o responsável pelo escritório pode fazer isso' });

/** GET .../summary: dados do escritório para a equipe (sem campos internos do admin) */
export const officeSummary = async (req: TenantRequest, res: Response) => {
  const t = req.tenant!;
  res.json({
    tenant: { ...publicTenant(t), commissionPercent: t.commissionPercent, pequiPlan: t.pequiPlan, widgetKey: t.widget.publicKey },
  });
};

const planInput = (b: any) => {
  const price = Number(String(b.price ?? '').replace(',', '.'));
  const priceCents = b.priceCents !== undefined ? Math.round(Number(b.priceCents)) : Math.round(price * 100);
  if (!Number.isFinite(priceCents) || priceCents < 100) throw new AppError('Informe um preço a partir de R$ 1,00', 400);
  const lim = (v: any) => (v === null || v === '' || v === undefined || String(v).toLowerCase() === 'ilimitado' ? null : Math.max(0, Math.floor(Number(v) || 0)));
  const l = b.limits || {};
  return {
    name: String(b.name || '').trim(),
    description: String(b.description || '').trim().slice(0, 500),
    priceCents,
    interval: b.interval === 'year' ? 'year' : 'month',
    limits: {
      searchCount: lim(l.searchCount),
      chatCount: lim(l.chatCount),
      docsCount: lim(l.docsCount),
      vaultFolderCount: lim(l.vaultFolderCount),
      workflowCount: lim(l.workflowCount),
    },
    features: (Array.isArray(b.features) ? b.features : String(b.features || '').split('\n')).map((f: any) => String(f).trim()).filter(Boolean).slice(0, 20),
    active: b.active === undefined ? true : Boolean(b.active),
  };
};

/** GET .../plans */
export const listPlans = async (req: TenantRequest, res: Response) => {
  const plans = await TenantPlan.find({ tenantId: req.tenant!._id }).sort({ priceCents: 1 }).lean();
  res.json({ plans });
};

/** POST .../plans */
export const createPlan = async (req: TenantRequest, res: Response) => {
  try {
    const plan = new TenantPlan({ ...planInput(req.body || {}), tenantId: req.tenant!._id });
    await plan.save();
    await syncPlanPrice(plan, req.tenant!);
    res.status(201).json({ plan });
  } catch (error) {
    fail(res, error, 'Não foi possível criar o plano');
  }
};

/** PUT .../plans/:planId */
export const updatePlan = async (req: TenantRequest, res: Response) => {
  try {
    const plan = await TenantPlan.findOne({ _id: req.params.planId, tenantId: req.tenant!._id });
    if (!plan) return res.status(404).json({ message: 'Plano não encontrado' });
    Object.assign(plan, planInput({ ...plan.toObject(), ...req.body, price: req.body?.price ?? plan.priceCents / 100, priceCents: undefined }));
    await plan.save();
    await syncPlanPrice(plan, req.tenant!);
    res.json({ plan });
  } catch (error) {
    fail(res, error, 'Não foi possível salvar o plano');
  }
};

/** GET .../leads: contatos deixados no widget */
export const listLeads = async (req: TenantRequest, res: Response) => {
  const convs = await WidgetConversation.find({ tenantId: req.tenant!._id })
    .sort({ updatedAt: -1 })
    .limit(200)
    .select('visitorId origin lead userMessageCount createdAt updatedAt messages')
    .lean();
  res.json({
    conversations: convs.map((c: any) => ({
      _id: c._id,
      lead: c.lead || null,
      origin: c.origin,
      messages: c.userMessageCount,
      firstMessage: c.messages?.find((m: any) => m.role === 'user')?.content?.slice(0, 200) || '',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
};

/** GET .../clients: clientes do escritório e o plano contratado */
export const listClients = async (req: TenantRequest, res: Response) => {
  try {
    res.json({ clients: await tenantClients(req.tenant!._id) });
  } catch (error) {
    fail(res, error, 'Não foi possível carregar os clientes');
  }
};

/** GET .../finance: bruto, comissão do Pequi, líquido, repassado e saldo a receber */
export const getFinance = async (req: TenantRequest, res: Response) => {
  try {
    res.json({ commissionPercent: req.tenant!.commissionPercent, ...(await tenantFinance(req.tenant!._id)) });
  } catch (error) {
    fail(res, error, 'Não foi possível carregar o extrato');
  }
};

/** POST /admin/tenants/:id/payouts { amount, paidAt?, note? }: registra um repasse feito ao escritório */
export const createPayout = async (req: TenantRequest, res: Response) => {
  try {
    const amount = Number(String(req.body?.amount ?? '').replace(/\./g, '').replace(',', '.'));
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amountCents) || amountCents < 1) throw new AppError('Informe o valor do repasse', 400);
    const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw new AppError('Data inválida', 400);
    const payout = await TenantPayout.create({
      tenantId: req.tenant!._id,
      amountCents,
      paidAt,
      note: String(req.body?.note || '').slice(0, 200),
      adminEmail: req.user?.email,
    });
    log(req, 'tenantPayout', `${req.tenant!.name}: R$ ${(amountCents / 100).toFixed(2)}`);
    res.status(201).json({ payout });
  } catch (error) {
    fail(res, error, 'Não foi possível registrar o repasse');
  }
};

/* ------------------------------------ públicas ------------------------------------ */

/** GET /tenants/public/resolve?host=…&slug=…: marca do escritório para o painel white-label */
export const resolveTenant = async (req: Request, res: Response) => {
  try {
    const slug = String(req.query.slug || '');
    const host = String(req.query.host || req.headers['x-forwarded-host'] || req.headers.host || '');
    const t = slug ? await findTenantBySlug(slug) : await findTenantByHost(host);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ tenant: t ? publicTenant(t) : null });
  } catch (error) {
    fail(res, error, 'Não foi possível identificar o escritório');
  }
};

/** GET /tenants/public/:slug/plans: planos à venda do escritório */
export const publicPlans = async (req: Request, res: Response) => {
  const t = await findTenantBySlug(req.params.slug);
  if (!t) return res.status(404).json({ message: 'Escritório não encontrado' });
  const plans = await TenantPlan.find({ tenantId: t._id, active: true }).sort({ priceCents: 1 }).select('-stripeProductId').lean();
  res.json({ tenant: publicTenant(t), plans });
};

/* ------------------------------ cliente do escritório ------------------------------ */

/** POST /tenant-billing/checkout { planId } */
export const clientCheckout = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await createClientCheckout(req.user!.id, String(req.body?.planId || '')));
  } catch (error) {
    fail(res, error, 'Não foi possível iniciar o pagamento');
  }
};

/** POST /tenant-billing/confirm { sessionId } */
export const clientConfirm = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await confirmClientCheckout(req.user!.id, String(req.body?.sessionId || '')));
  } catch (error) {
    fail(res, error, 'Não foi possível confirmar o pagamento');
  }
};
