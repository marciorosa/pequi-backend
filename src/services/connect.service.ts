/**
 * Stripe Connect do modo white-label.
 *
 * Modelo: contas conectadas Express + cobranças de destino (destination charges).
 * - Produto e preço de cada plano do escritório ficam na conta Stripe do Pequi.
 * - A assinatura do cliente usa transfer_data.destination = conta do escritório e
 *   application_fee_percent = comissão do Pequi. Em cada fatura paga o Stripe repassa
 *   o valor ao escritório e retém a comissão automaticamente.
 * - Com STRIPE_CONNECT_ON_BEHALF_OF=true (padrão), o escritório aparece como vendedor
 *   na fatura do cliente (on_behalf_of).
 */
import Stripe from 'stripe';
import Tenant, { ITenant } from '../models/tenant.model';
import TenantPlan, { ITenantPlan } from '../models/tenantPlan.model';
import Subscription from '../models/subscription.model';
import User from '../models/user.model';
import { ValidationError, ExternalServiceError, AppError } from '../utils/errors';
import { panelUrl } from './tenant.service';

let client: Stripe | null = null;
export const stripeClient = (): Stripe => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new ValidationError('STRIPE_SECRET_KEY não definida no servidor');
  }
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  return client;
};

const onBehalfOf = () => (process.env.STRIPE_CONNECT_ON_BEHALF_OF || 'true') !== 'false';

const wrap = async <T>(what: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    // Mensagem do Stripe é útil no admin (ex.: Connect não ativado na conta)
    throw new ExternalServiceError('Stripe', `${what}: ${error?.raw?.message || error?.message || 'erro desconhecido'}`, error);
  }
};

/* ------------------------------ conta conectada ------------------------------ */

/** Cria (uma vez) a conta Express do escritório */
export const ensureConnectedAccount = async (tenant: ITenant, email?: string): Promise<string> => {
  if (tenant.stripe?.accountId) return tenant.stripe.accountId;
  return wrap('Falha ao criar a conta conectada', async () => {
    const account = await stripeClient().accounts.create({
      type: 'express',
      country: 'BR',
      email: email || undefined,
      business_type: 'company',
      business_profile: { name: tenant.branding?.displayName || tenant.name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { tenantId: String(tenant._id), tenantSlug: tenant.slug },
    });
    tenant.stripe = { ...(tenant.stripe as any), accountId: account.id };
    await tenant.save();
    return account.id;
  });
};

/** Link de cadastro do escritório na página do Stripe (CNPJ, banco e documentos) */
export const onboardingLink = async (tenant: ITenant, returnUrl: string, email?: string): Promise<string> => {
  const accountId = await ensureConnectedAccount(tenant, email);
  return wrap('Falha ao gerar o link de cadastro', async () => {
    const link = await stripeClient().accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}stripe=refresh`,
      return_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}stripe=return`,
    });
    return link.url;
  });
};

/** Lê a situação da conta no Stripe e grava no escritório */
export const refreshAccountStatus = async (tenant: ITenant) => {
  if (!tenant.stripe?.accountId) return tenant.stripe;
  return wrap('Falha ao consultar a conta conectada', async () => {
    const acct = await stripeClient().accounts.retrieve(tenant.stripe.accountId!);
    return applyAccountStatus(tenant, acct);
  });
};

export const applyAccountStatus = async (tenant: ITenant, acct: Stripe.Account) => {
  tenant.stripe = {
    accountId: acct.id,
    chargesEnabled: Boolean(acct.charges_enabled),
    payoutsEnabled: Boolean(acct.payouts_enabled),
    detailsSubmitted: Boolean(acct.details_submitted),
  };
  await tenant.save();
  return tenant.stripe;
};

/** Link para o escritório ver repasses e extratos no painel Express do Stripe */
export const dashboardLink = async (tenant: ITenant): Promise<string> => {
  if (!tenant.stripe?.accountId) throw new ValidationError('O escritório ainda não conectou o Stripe');
  return wrap('Falha ao abrir o painel do Stripe', async () => {
    const link = await stripeClient().accounts.createLoginLink(tenant.stripe.accountId!);
    return link.url;
  });
};

/* ------------------------------ planos do escritório ------------------------------ */

/**
 * Cria ou atualiza o produto e o preço do plano no Stripe.
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

/** Checkout da assinatura do cliente do escritório, com a comissão do Pequi */
export const createClientCheckout = async (userId: string, planId: string) => {
  const [user, plan] = await Promise.all([User.findById(userId), TenantPlan.findById(planId)]);
  if (!user) throw new ValidationError('Usuário não encontrado');
  if (!plan || !plan.active) throw new ValidationError('Plano não encontrado ou inativo');
  const tenant = await Tenant.findById(plan.tenantId);
  if (!tenant || tenant.status !== 'active') throw new ValidationError('Escritório indisponível');
  if (!user.tenantId || String(user.tenantId) !== String(tenant._id)) {
    throw new ValidationError('Esta conta não pertence a este escritório');
  }
  if (!tenant.stripe?.accountId || !tenant.stripe.chargesEnabled) {
    throw new ValidationError('O escritório ainda não concluiu o cadastro no Stripe para receber pagamentos');
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

    const base = panelUrl(tenant);
    const meta = { userId: String(user._id), tenantId: String(tenant._id), tenantPlanId: String(plan._id) };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      locale: 'pt-BR',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId!, quantity: 1 }],
      subscription_data: {
        application_fee_percent: tenant.commissionPercent,
        transfer_data: { destination: tenant.stripe.accountId },
        ...(onBehalfOf() ? { on_behalf_of: tenant.stripe.accountId } : {}),
        metadata: { ...meta, commissionPercent: String(tenant.commissionPercent) },
      },
      metadata: meta,
      success_url: `${base}/assinar?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/assinar?canceled=true`,
    });
    return { sessionId: session.id, url: session.url };
  });
};

/**
 * Grava a assinatura do cliente a partir do checkout concluído.
 * Usado pelo webhook e também pela tela de retorno (útil em localhost, sem webhook).
 */
export const recordClientCheckout = async (session: Stripe.Checkout.Session) => {
  const { userId, tenantId, tenantPlanId } = session.metadata || {};
  if (!userId || !tenantPlanId || !session.subscription) return null;
  const stripe = stripeClient();
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const sub = await stripe.subscriptions.retrieve(subId);
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
    applicationFeePercent: sub.application_fee_percent ?? undefined,
  };
  const saved = await Subscription.findOneAndUpdate({ stripeSubscriptionId: sub.id }, { $set: data }, { upsert: true, new: true });
  await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId, subscriptionId: saved._id });
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

/** Aplica a comissão atual do escritório às assinaturas ativas dos clientes dele */
export const applyCommissionToActive = async (tenant: ITenant) => {
  const subs = await Subscription.find({ tenantId: tenant._id, status: { $in: ['active', 'trialing', 'past_due'] } });
  let updated = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await stripeClient().subscriptions.update(s.stripeSubscriptionId, { application_fee_percent: tenant.commissionPercent });
      s.applicationFeePercent = tenant.commissionPercent;
      await s.save();
      updated += 1;
    } catch (e: any) {
      errors.push(`${s.stripeSubscriptionId}: ${e?.raw?.message || e?.message}`);
    }
  }
  return { total: subs.length, updated, errors };
};
