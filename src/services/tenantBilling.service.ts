/**
 * Cobrança dos clientes dos escritórios (white-label).
 *
 * Modelo: todos os pagamentos entram na conta Stripe que o Pequi já usa.
 * - Produto e preço de cada plano do escritório ficam nessa conta.
 * - Cada fatura paga gera um lançamento no extrato do escritório (TenantEarning):
 *   valor bruto, comissão do Pequi (percentual do escritório) e líquido do escritório.
 * - O Pequi repassa o líquido ao escritório e registra o repasse (TenantPayout).
 *   Saldo a receber = líquidos − repasses.
 * Os valores são antes das tarifas do Stripe.
 */
import Stripe from 'stripe';
import mongoose from 'mongoose';
import Tenant, { ITenant } from '../models/tenant.model';
import TenantPlan, { ITenantPlan } from '../models/tenantPlan.model';
import Subscription from '../models/subscription.model';
import User from '../models/user.model';
import { TenantEarning, TenantPayout } from '../models/tenantLedger.model';
import { ValidationError, ExternalServiceError, AppError } from '../utils/errors';
import { tenantPageUrl } from './tenant.service';

let client: Stripe | null = null;
export const stripeClient = (): Stripe => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new ValidationError('STRIPE_SECRET_KEY não definida no servidor');
  }
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  return client;
};

const wrap = async <T>(what: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    throw new ExternalServiceError('Stripe', `${what}: ${error?.raw?.message || error?.message || 'erro desconhecido'}`, error);
  }
};

const commissionOf = (amountCents: number, percent: number) => Math.round((amountCents * percent) / 100);

/* ------------------------------ planos do escritório ------------------------------ */

/**
 * Cria ou atualiza o produto e o preço do plano no Stripe do Pequi.
 * Preços no Stripe não mudam de valor: se o preço ou o período mudou, criamos um novo
 * preço e desativamos o anterior (assinaturas antigas continuam no preço antigo).
 */
export const syncPlanPrice = async (plan: ITenantPlan, tenant: ITenant) => {
  if (!process.env.STRIPE_SECRET_KEY) return plan; // sem Stripe configurado: só grava no banco
  return wrap('Falha ao gravar o plano no Stripe', async () => {
    const stripe = stripeClient();
    const productName = `${tenant.branding?.displayName || tenant.name}: ${plan.name}`;
    if (!plan.stripeProductId) {
      const product = await stripe.products.create({
        name: productName,
        description: plan.description || undefined,
        metadata: { tenantId: String(tenant._id), tenantPlanId: String(plan._id) },
      });
      plan.stripeProductId = product.id;
    } else {
      await stripe.products.update(plan.stripeProductId, { name: productName, description: plan.description || '', active: plan.active });
    }

    let needNewPrice = !plan.stripePriceId;
    if (plan.stripePriceId) {
      const current = await stripe.prices.retrieve(plan.stripePriceId);
      needNewPrice = current.unit_amount !== plan.priceCents || current.recurring?.interval !== plan.interval || current.currency !== 'brl';
      if (needNewPrice) await stripe.prices.update(plan.stripePriceId, { active: false });
    }
    if (needNewPrice) {
      const price = await stripe.prices.create({
        product: plan.stripeProductId!,
        currency: 'brl',
        unit_amount: plan.priceCents,
        recurring: { interval: plan.interval },
        metadata: { tenantId: String(tenant._id), tenantPlanId: String(plan._id) },
      });
      plan.stripePriceId = price.id;
    }
    await plan.save();
    return plan;
  });
};

/* ------------------------------ assinatura do cliente ------------------------------ */

/** Checkout da assinatura do cliente do escritório (conta Stripe do Pequi) */
export const createClientCheckout = async (userId: string, planId: string) => {
  const [user, plan] = await Promise.all([User.findById(userId), TenantPlan.findById(planId)]);
  if (!user) throw new ValidationError('Usuário não encontrado');
  if (!plan || !plan.active) throw new ValidationError('Plano não encontrado ou inativo');
  const tenant = await Tenant.findById(plan.tenantId);
  if (!tenant || tenant.status !== 'active') throw new ValidationError('Escritório indisponível');
  if (!user.tenantId || String(user.tenantId) !== String(tenant._id)) {
    throw new ValidationError('Esta conta não pertence a este escritório');
  }
  if (!plan.stripePriceId) await syncPlanPrice(plan, tenant);

  return wrap('Falha ao criar a sessão de pagamento', async () => {
    const stripe = stripeClient();
    let customerId = user.stripeCustomerId && user.stripeCustomerId !== 'pending' ? user.stripeCustomerId : null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: String(user._id), tenantId: String(tenant._id) },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const meta = {
      userId: String(user._id),
      tenantId: String(tenant._id),
      tenantPlanId: String(plan._id),
      commissionPercent: String(tenant.commissionPercent),
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      locale: 'pt-BR',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId!, quantity: 1 }],
      subscription_data: { metadata: meta },
      metadata: meta,
      success_url: tenantPageUrl(tenant, '/pricing', { success: 'true', session_id: '{CHECKOUT_SESSION_ID}' }),
      cancel_url: tenantPageUrl(tenant, '/pricing', { canceled: 'true' }),
    });
    return { sessionId: session.id, url: session.url };
  });
};

/**
 * Lança uma fatura paga no extrato do escritório (uma vez por fatura).
 * A comissão usada é a gravada na assinatura no momento da contratação
 * (ou a atual do escritório, se a assinatura não tiver uma).
 */
export const recordInvoiceEarning = async (invoice: Stripe.Invoice) => {
  if (!invoice?.id || !invoice.subscription || invoice.status !== 'paid' || !invoice.amount_paid) return null;
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
  const sub = await Subscription.findOne({ stripeSubscriptionId: subId });
  if (!sub?.tenantId) return null;
  const tenant = await Tenant.findById(sub.tenantId).select('commissionPercent');
  const percent = sub.applicationFeePercent ?? tenant?.commissionPercent ?? 0;
  const commissionCents = commissionOf(invoice.amount_paid, percent);
  return TenantEarning.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    {
      $setOnInsert: {
        tenantId: sub.tenantId,
        userId: sub.userId,
        subscriptionId: sub._id,
        tenantPlanId: sub.tenantPlanId,
        stripeInvoiceId: invoice.id,
        amountCents: invoice.amount_paid,
        commissionPercent: percent,
        commissionCents,
        netCents: invoice.amount_paid - commissionCents,
        paidAt: new Date(((invoice.status_transitions?.paid_at as number) || invoice.created) * 1000),
      },
    },
    { upsert: true, new: true }
  );
};

/**
 * Grava a assinatura do cliente a partir do checkout concluído e lança a primeira fatura.
 * Usado pelo webhook e também pela tela de retorno (útil em localhost, sem webhook).
 */
export const recordClientCheckout = async (session: Stripe.Checkout.Session) => {
  const { userId, tenantId, tenantPlanId, commissionPercent } = session.metadata || {};
  if (!userId || !tenantPlanId || !session.subscription) return null;
  const stripe = stripeClient();
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const sub = await stripe.subscriptions.retrieve(subId, { expand: ['latest_invoice'] });
  const plan = await TenantPlan.findById(tenantPlanId);

  const data = {
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: sub.items.data[0]?.price.id,
    status: sub.status,
    plan: (plan?.interval || sub.items.data[0]?.price.recurring?.interval) === 'year' ? 'yearly' : 'monthly',
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    tenantId,
    tenantPlanId,
    // Comissão do Pequi em vigor quando o cliente contratou
    applicationFeePercent: Number(commissionPercent ?? sub.metadata?.commissionPercent ?? 0),
  };
  const saved = await Subscription.findOneAndUpdate({ stripeSubscriptionId: sub.id }, { $set: data }, { upsert: true, new: true });
  await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId, subscriptionId: saved._id });
  if (sub.latest_invoice && typeof sub.latest_invoice !== 'string') {
    await recordInvoiceEarning(sub.latest_invoice);
  }
  return saved;
};

/** Confirma o checkout pela tela de retorno (o cliente só confirma a própria sessão) */
export const confirmClientCheckout = async (userId: string, sessionId: string) => {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sessionId || ''))) throw new ValidationError('Sessão inválida');
  const session = await wrap('Falha ao consultar o pagamento', () => stripeClient().checkout.sessions.retrieve(sessionId));
  if (session.metadata?.userId !== String(userId)) throw new ValidationError('Esta sessão não pertence a esta conta');
  if (session.status !== 'complete') return { status: session.status, subscription: null };
  const saved = await recordClientCheckout(session);
  return { status: session.status, subscription: saved };
};

/** Aplica a comissão atual do escritório às assinaturas ativas dos clientes (faturas futuras) */
export const applyCommissionToActive = async (tenant: ITenant) => {
  const r = await Subscription.updateMany(
    { tenantId: tenant._id, status: { $in: ['active', 'trialing', 'past_due'] } },
    { $set: { applicationFeePercent: tenant.commissionPercent } }
  );
  return { total: r.matchedCount, updated: r.modifiedCount, errors: [] as string[] };
};

/* ------------------------------------ extrato ------------------------------------ */

/** Totais do escritório: bruto, comissão do Pequi, líquido, repassado e a receber */
export const tenantFinance = async (tenantId: any) => {
  const id = new mongoose.Types.ObjectId(String(tenantId));
  const [sum] = await TenantEarning.aggregate([
    { $match: { tenantId: id } },
    { $group: { _id: null, gross: { $sum: '$amountCents' }, commission: { $sum: '$commissionCents' }, net: { $sum: '$netCents' }, invoices: { $sum: 1 } } },
  ]);
  const [paid] = await TenantPayout.aggregate([{ $match: { tenantId: id } }, { $group: { _id: null, total: { $sum: '$amountCents' } } }]);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [month] = await TenantEarning.aggregate([
    { $match: { tenantId: id, paidAt: { $gte: startOfMonth } } },
    { $group: { _id: null, gross: { $sum: '$amountCents' }, commission: { $sum: '$commissionCents' }, net: { $sum: '$netCents' } } },
  ]);
  const [earnings, payouts] = await Promise.all([
    TenantEarning.find({ tenantId: id }).sort({ paidAt: -1 }).limit(100).populate('userId', 'name email').populate('tenantPlanId', 'name').lean(),
    TenantPayout.find({ tenantId: id }).sort({ paidAt: -1 }).limit(100).lean(),
  ]);
  const net = sum?.net || 0;
  const paidOut = paid?.total || 0;
  return {
    totals: {
      grossCents: sum?.gross || 0,
      commissionCents: sum?.commission || 0,
      netCents: net,
      paidOutCents: paidOut,
      balanceCents: net - paidOut,
      invoices: sum?.invoices || 0,
      month: { grossCents: month?.gross || 0, commissionCents: month?.commission || 0, netCents: month?.net || 0 },
    },
    earnings: earnings.map((e: any) => ({
      _id: e._id,
      client: e.userId ? { name: e.userId.name, email: e.userId.email } : null,
      plan: e.tenantPlanId?.name || '',
      amountCents: e.amountCents,
      commissionPercent: e.commissionPercent,
      commissionCents: e.commissionCents,
      netCents: e.netCents,
      paidAt: e.paidAt,
    })),
    payouts,
  };
};

/** Clientes do escritório com o plano contratado */
export const tenantClients = async (tenantId: any) => {
  const users = await User.find({ tenantId }).select('name email tenantRole createdAt lastLoginAt subscriptionId blocked').sort({ createdAt: -1 }).limit(500).lean();
  const subs = await Subscription.find({ tenantId }).sort({ createdAt: -1 }).populate('tenantPlanId', 'name priceCents interval').lean();
  const byUser = new Map<string, any>();
  for (const s of subs as any[]) if (!byUser.has(String(s.userId))) byUser.set(String(s.userId), s);
  const earned = await TenantEarning.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)) } },
    { $group: { _id: '$userId', total: { $sum: '$amountCents' } } },
  ]);
  const paidBy = new Map(earned.map((e) => [String(e._id), e.total]));
  return users.map((u: any) => {
    const s = byUser.get(String(u._id));
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.tenantRole || 'client',
      blocked: Boolean(u.blocked),
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      totalPaidCents: paidBy.get(String(u._id)) || 0,
      subscription: s
        ? {
            plan: s.tenantPlanId?.name || '',
            priceCents: s.tenantPlanId?.priceCents || 0,
            interval: s.tenantPlanId?.interval || (s.plan === 'yearly' ? 'year' : 'month'),
            status: s.status,
            cancelAtPeriodEnd: s.cancelAtPeriodEnd,
            currentPeriodEnd: s.currentPeriodEnd,
            commissionPercent: s.applicationFeePercent,
          }
        : null,
    };
  });
};
