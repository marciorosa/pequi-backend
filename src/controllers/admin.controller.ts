/**
 * Área administrativa do Pequi: visão geral, usuários, assinaturas, faturamento e registro de ações.
 *
 * Princípios:
 * - Só leitura no faturamento: reembolsos, cancelamentos e cobranças continuam no painel da Stripe.
 * - Nada é apagado: contas problemáticas são bloqueadas, e o bloqueio pode ser desfeito.
 * - Toda ação fica registrada em AdminLog (quem fez, o quê, em quem e quando).
 */
import { Response } from 'express';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import { AuthRequest } from '../types';
import User from '../models/user.model';
import Subscription from '../models/subscription.model';
import AdminLog from '../models/adminLog.model';
import Chat from '../models/chat.model';
import LegalDocument from '../models/document.model';
import VaultFolder from '../models/vault.model';
import Workflow from '../models/workflow.model';
import { resolvePlan, getUsage, isAdminEmail, limitsForJson } from '../config/plans';

const DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 25;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripeClient = (): Stripe | null =>
  process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : null;

const log = (req: AuthRequest, action: string, target?: { _id: any; email?: string } | null, details?: string) =>
  AdminLog.create({
    adminId: req.user!.id,
    adminEmail: req.user!.email,
    action,
    targetUserId: target?._id,
    targetEmail: target?.email,
    details,
  }).catch((error) => console.error('[admin] Falha ao gravar o registro:', error?.message || error));

/** Plano de cada usuário em forma simples, para as listas. */
const planLabel = (user: any, sub: any | null): { plan: 'admin' | 'pro' | 'cortesia' | 'free'; until: Date | null } => {
  if (user.role === 'admin' || isAdminEmail(user.email)) return { plan: 'admin', until: null };
  if (sub && sub.status === 'active') return { plan: 'pro', until: sub.currentPeriodEnd };
  if (user.complimentaryProUntil && new Date(user.complimentaryProUntil).getTime() > Date.now()) {
    return { plan: 'cortesia', until: user.complimentaryProUntil };
  }
  return { plan: 'free', until: null };
};

/** GET /admin/overview: números gerais da plataforma. */
export const getOverview = async (req: AuthRequest, res: Response) => {
  try {
    const now = Date.now();
    const [
      totalUsers, new7, new30, blocked, admins, cortesias, active7,
      subsByStatus, cancelando, documents, chats, folders, workflows, usage, recentUsers,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY) } }),
      User.countDocuments({ createdAt: { $gte: new Date(now - 30 * DAY) } }),
      User.countDocuments({ blocked: true }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ complimentaryProUntil: { $gt: new Date(now) } }),
      User.countDocuments({ lastLoginAt: { $gte: new Date(now - 7 * DAY) } }),
      Subscription.aggregate([{ $group: { _id: { status: '$status', plan: '$plan' }, n: { $sum: 1 } } }]),
      Subscription.countDocuments({ status: 'active', cancelAtPeriodEnd: true }),
      LegalDocument.countDocuments({}),
      Chat.countDocuments({}),
      VaultFolder.countDocuments({}),
      Workflow.countDocuments({}),
      User.aggregate([{ $group: {
        _id: null,
        search: { $sum: '$apiUsage.searchCount' },
        chat: { $sum: '$apiUsage.chatCount' },
        docs: { $sum: '$apiUsage.docsCount' },
      } }]),
      User.find({}).sort({ createdAt: -1 }).limit(6).select('name email createdAt').lean(),
    ]);

    const subs: Record<string, number> = {};
    let activeMonthly = 0;
    let activeYearly = 0;
    for (const row of subsByStatus as any[]) {
      subs[row._id.status] = (subs[row._id.status] || 0) + row.n;
      if (row._id.status === 'active' && row._id.plan === 'monthly') activeMonthly += row.n;
      if (row._id.status === 'active' && row._id.plan === 'yearly') activeYearly += row.n;
    }

    res.json({
      users: { total: totalUsers, new7, new30, active7, blocked, admins, cortesias },
      subscriptions: { byStatus: subs, activeMonthly, activeYearly, cancelando },
      content: { documents, chats, folders, workflows },
      usage: usage[0] ? { search: usage[0].search, chat: usage[0].chat, docs: usage[0].docs } : { search: 0, chat: 0, docs: 0 },
      recentUsers,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao carregar a visão geral', error: (error as Error).message });
  }
};

/** GET /admin/users?q=&filter=&page=: lista de usuários com busca e filtro. */
export const listUsers = async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const filter = String(req.query.filter || 'all');
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);

    const query: any = {};
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      query.$or = [{ name: re }, { email: re }, { company: re }];
    }
    if (filter === 'blocked') query.blocked = true;
    if (filter === 'admin') {
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      query.$and = [...(query.$and || []), { $or: [{ role: 'admin' }, ...(adminEmail ? [{ email: adminEmail }] : [])] }];
    }
    if (filter === 'cortesia') query.complimentaryProUntil = { $gt: new Date() };
    if (filter === 'pro' || filter === 'free') {
      const activeUserIds = await Subscription.find({ status: 'active' }).distinct('userId');
      query._id = filter === 'pro' ? { $in: activeUserIds } : { $nin: activeUserIds };
      if (filter === 'free') {
        query.role = { $ne: 'admin' };
        const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
        if (adminEmail) query.email = { $ne: adminEmail };
        query.$and = [{ $or: [{ complimentaryProUntil: { $exists: false } }, { complimentaryProUntil: null }, { complimentaryProUntil: { $lte: new Date() } }] }];
      }
    }

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .select('name email company role blocked createdAt lastLoginAt complimentaryProUntil subscriptionId apiUsage')
        .lean(),
    ]);

    const subIds = users.map((u: any) => u.subscriptionId).filter(Boolean);
    const subs = await Subscription.find({ _id: { $in: subIds } }).lean();
    const subById = new Map(subs.map((s: any) => [String(s._id), s]));

    res.json({
      page,
      pageSize: PAGE_SIZE,
      total,
      users: users.map((u: any) => {
        const sub = u.subscriptionId ? subById.get(String(u.subscriptionId)) : null;
        const { plan, until } = planLabel(u, sub);
        return {
          id: u._id,
          name: u.name,
          email: u.email,
          company: u.company || '',
          role: u.role,
          blocked: Boolean(u.blocked),
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt || null,
          plan,
          planUntil: until,
          usage: u.apiUsage || {},
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao listar os usuários', error: (error as Error).message });
  }
};

/** GET /admin/users/:id: ficha completa de um usuário. */
export const getUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Usuário não encontrado' });
    const user: any = await User.findById(req.params.id).select('-password -resetPasswordToken -resetPasswordExpires');
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

    const [plan, usage, subscriptions, documents, chats, logs] = await Promise.all([
      resolvePlan(user),
      getUsage(user),
      Subscription.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      LegalDocument.countDocuments({ userId: user._id }),
      Chat.countDocuments({ userId: user._id }),
      AdminLog.find({ targetUserId: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    const activeSub = subscriptions.find((s: any) => s.status === 'active') || null;

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        company: user.company || '',
        jobTitle: user.jobTitle || '',
        phone: user.phone || '',
        role: user.role,
        isAdminByEmail: isAdminEmail(user.email),
        blocked: Boolean(user.blocked),
        blockedReason: user.blockedReason || '',
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt || null,
        complimentaryProUntil: user.complimentaryProUntil || null,
        stripeCustomerId: user.stripeCustomerId || null,
      },
      plan: { ...planLabel(user, activeSub), tier: plan.tier, isAdmin: plan.isAdmin, limits: limitsForJson(plan) },
      usage,
      subscriptions,
      content: { documents, chats },
      logs,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao carregar o usuário', error: (error as Error).message });
  }
};

/**
 * POST /admin/users/:id/actions  { action, days?, reason? }
 * Ações: grantPro (cortesia por N dias), revokePro, resetUsage, block, unblock, makeAdmin, removeAdmin.
 */
export const userAction = async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Usuário não encontrado' });
    const user: any = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

    const action = String(req.body?.action || '');
    const isSelf = String(user._id) === String(req.user!.id);
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    let details = '';

    switch (action) {
      case 'grantPro': {
        const days = Math.round(Number(req.body?.days));
        if (!Number.isFinite(days) || days < 1 || days > 366) {
          return res.status(400).json({ message: 'Informe de 1 a 366 dias de cortesia.' });
        }
        // Soma à cortesia que ainda estiver valendo
        const base = user.complimentaryProUntil && new Date(user.complimentaryProUntil).getTime() > Date.now()
          ? new Date(user.complimentaryProUntil).getTime()
          : Date.now();
        user.complimentaryProUntil = new Date(base + days * DAY);
        details = `${days} dias, até ${user.complimentaryProUntil.toLocaleDateString('pt-BR')}`;
        break;
      }
      case 'revokePro':
        user.complimentaryProUntil = undefined;
        details = 'Cortesia encerrada (assinaturas pagas não são afetadas)';
        break;
      case 'resetUsage':
        user.apiUsage.searchCount = 0;
        user.apiUsage.chatCount = 0;
        user.apiUsage.docsCount = 0;
        details = 'Pesquisas, mensagens e documentos zerados';
        break;
      case 'block':
        if (isSelf) return res.status(400).json({ message: 'Você não pode bloquear a própria conta.' });
        if (isAdminEmail(user.email)) return res.status(400).json({ message: 'A conta principal de administrador (ADMIN_EMAIL) não pode ser bloqueada.' });
        user.blocked = true;
        user.blockedReason = reason;
        details = reason || 'Sem motivo informado';
        break;
      case 'unblock':
        user.blocked = false;
        user.blockedReason = undefined;
        break;
      case 'makeAdmin':
        user.role = 'admin';
        break;
      case 'removeAdmin':
        if (isSelf) return res.status(400).json({ message: 'Você não pode tirar a própria permissão de administrador.' });
        user.role = 'user';
        if (isAdminEmail(user.email)) details = 'Continua administrador pela variável ADMIN_EMAIL';
        break;
      default:
        return res.status(400).json({ message: 'Ação desconhecida.' });
    }

    await user.save();
    await log(req, action, user, details);
    res.json({ success: true, message: 'Feito.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao aplicar a ação', error: (error as Error).message });
  }
};

/** GET /admin/subscriptions?status=: assinaturas gravadas no banco, com o e-mail do usuário. */
export const listSubscriptions = async (req: AuthRequest, res: Response) => {
  try {
    const status = String(req.query.status || '');
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const query: any = status ? { status } : {};
    const [total, subs] = await Promise.all([
      Subscription.countDocuments(query),
      Subscription.find(query).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
        .populate('userId', 'name email').lean(),
    ]);
    res.json({
      page,
      pageSize: PAGE_SIZE,
      total,
      subscriptions: subs.map((s: any) => ({
        id: s._id,
        user: s.userId ? { id: s.userId._id, name: s.userId.name, email: s.userId.email } : null,
        plan: s.plan,
        status: s.status,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        createdAt: s.createdAt,
        stripeSubscriptionId: s.stripeSubscriptionId,
        stripeCustomerId: s.stripeCustomerId,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao listar as assinaturas', error: (error as Error).message });
  }
};

/**
 * GET /admin/billing: faturamento lido da Stripe (somente leitura).
 * Receita recorrente mensal (MRR) pelas assinaturas ativas e as últimas faturas.
 */
export const getBilling = async (req: AuthRequest, res: Response) => {
  const stripe = stripeClient();
  if (!stripe) return res.json({ configured: false });
  try {
    const [activeMonthly, activeYearly] = await Promise.all([
      Subscription.countDocuments({ status: 'active', plan: 'monthly' }),
      Subscription.countDocuments({ status: 'active', plan: 'yearly' }),
    ]);

    const priceOf = async (priceId?: string) => {
      if (!priceId) return null;
      try {
        const p = await stripe.prices.retrieve(priceId);
        return { amount: (p.unit_amount || 0) / 100, currency: (p.currency || 'brl').toUpperCase() };
      } catch {
        return null;
      }
    };
    const [monthly, yearly] = await Promise.all([
      priceOf(process.env.STRIPE_PRICE_ID_MONTHLY),
      priceOf(process.env.STRIPE_PRICE_ID_YEARLY),
    ]);
    const mrr = (monthly ? monthly.amount * activeMonthly : 0) + (yearly ? (yearly.amount / 12) * activeYearly : 0);

    const invoices = await stripe.invoices.list({ limit: 20 });
    const now = Math.floor(Date.now() / 1000);
    const paid30 = await stripe.invoices.list({ limit: 100, status: 'paid', created: { gte: now - 30 * 24 * 3600 } });

    res.json({
      configured: true,
      livemode: invoices.data[0]?.livemode ?? null,
      prices: { monthly, yearly },
      activeMonthly,
      activeYearly,
      mrr,
      currency: monthly?.currency || yearly?.currency || 'BRL',
      received30: paid30.data.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) / 100,
      received30Count: paid30.data.length,
      received30More: paid30.has_more,
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        email: inv.customer_email,
        amount: (inv.amount_paid || inv.amount_due || 0) / 100,
        currency: (inv.currency || 'brl').toUpperCase(),
        status: inv.status,
        created: new Date(inv.created * 1000),
        url: inv.hosted_invoice_url,
      })),
    });
  } catch (error: any) {
    res.status(502).json({ configured: true, message: 'Não foi possível ler os dados da Stripe.', error: error?.message || String(error) });
  }
};

/** GET /admin/logs: últimas ações feitas na área administrativa. */
export const listLogs = async (req: AuthRequest, res: Response) => {
  try {
    const logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao carregar o registro', error: (error as Error).message });
  }
};
