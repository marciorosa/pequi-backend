import Subscription from '../models/subscription.model';
import User from '../models/user.model';
import VaultFolder from '../models/vault.model';
import Workflow from '../models/workflow.model';

export type FeatureType = 'searchCount' | 'chatCount' | 'docsCount' | 'vaultFolderCount' | 'workflowCount';
export type PlanTier = 'free' | 'pro' | 'enterprise';

// Limites de cada plano. Esta é a regra que vale: a tela só mostra o que o servidor permite.
export const PLAN_LIMITS: Record<PlanTier, Record<FeatureType, number>> = {
  free: {
    searchCount: 5,
    chatCount: 5,
    docsCount: 0,
    vaultFolderCount: 0,
    workflowCount: 0,
  },
  pro: {
    searchCount: 50,
    chatCount: 50,
    docsCount: 50,
    vaultFolderCount: 50,
    workflowCount: 5,
  },
  enterprise: {
    searchCount: Infinity,
    chatCount: Infinity,
    docsCount: Infinity,
    vaultFolderCount: Infinity,
    workflowCount: Infinity,
  },
};

// Assistentes de IA liberados no plano Gratuito (a mesma lista existe no site, em lawyerService.ts)
export const FREE_LAWYER_IDS = ['criminal', 'civil', 'corporate', 'family', 'immigration'];

// Recursos de cada plano, iguais aos da página de planos do site
export const PLAN_FEATURES: Record<PlanTier, string[]> = {
  free: [
    'Pesquisa inteligente (5 pesquisas)',
    'Chat jurídico com IA (5 mensagens)',
    'Assistentes de IA (5 áreas liberadas)',
    'Sem acesso ao Cofre e às operações com documentos',
    'Sem criador de fluxos',
  ],
  pro: [
    'Pesquisa inteligente (50 pesquisas)',
    'Chat jurídico com IA (50 mensagens)',
    'Todos os assistentes de IA',
    'Operações com documentos (50 operações)',
    'Cofre (50 pastas, 500 MB)',
    'Criador de fluxos (5 fluxos)',
  ],
  enterprise: [
    'Recursos ilimitados',
  ],
};

export const isAdminEmail = (email?: string): boolean => {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  return Boolean(adminEmail) && (email || '').trim().toLowerCase() === adminEmail;
};

export interface ResolvedPlan {
  tier: PlanTier;
  isAdmin: boolean;
  subscription: any | null;
}

/** Descobre o plano real do usuário a partir da assinatura gravada no banco */
export const resolvePlan = async (user: { email?: string; subscriptionId?: any }): Promise<ResolvedPlan> => {
  let tier: PlanTier = 'free';
  let subscription: any = null;

  if (user.subscriptionId) {
    const sub = await Subscription.findById(user.subscriptionId);
    if (sub && sub.status === 'active') {
      tier = 'pro';
      subscription = sub;
      // Se o Enterprise for criado no Stripe, defina tier = 'enterprise' conforme o priceId.
    }
  }

  return { tier, isAdmin: isAdminEmail(user.email), subscription };
};

export const getLimit = (plan: ResolvedPlan, feature: FeatureType): number =>
  plan.isAdmin ? Infinity : PLAN_LIMITS[plan.tier][feature];

export const canUseLawyer = (plan: ResolvedPlan, lawyerId?: string): boolean => {
  if (!lawyerId) return true;
  if (plan.isAdmin || plan.tier !== 'free') return true;
  return FREE_LAWYER_IDS.includes(lawyerId);
};

/**
 * Uso atual de cada recurso.
 * Pastas do cofre e fluxos são contados a partir do que existe de fato no banco,
 * para que o número bata com o que o usuário vê na tela (excluir uma pasta libera a vaga).
 * Pesquisas, mensagens e operações com documentos vêm do contador do usuário.
 */
export const getUsage = async (user: { _id: any; apiUsage?: any }): Promise<Record<FeatureType, number>> => {
  const [vaultFolderCount, workflowCount] = await Promise.all([
    VaultFolder.countDocuments({ userId: user._id }),
    Workflow.countDocuments({ userId: user._id }),
  ]);

  return {
    searchCount: user.apiUsage?.searchCount || 0,
    chatCount: user.apiUsage?.chatCount || 0,
    docsCount: user.apiUsage?.docsCount || 0,
    vaultFolderCount,
    workflowCount,
  };
};

/**
 * No plano Pro, pesquisas, mensagens e operações com documentos renovam a cada ciclo de cobrança
 * (como diz a página de planos). No Gratuito, as 5 pesquisas e 5 mensagens são para experimentar e não renovam.
 * Altera o objeto user em memória para que a checagem seguinte já use os valores zerados.
 */
export const ensureUsageCycle = async (user: any, plan: ResolvedPlan): Promise<void> => {
  const periodStart: Date | undefined = plan.subscription?.currentPeriodStart;
  if (!periodStart) return;

  const last: Date | undefined = user.usageCycleStart;
  if (last && new Date(last).getTime() >= new Date(periodStart).getTime()) return;

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        usageCycleStart: periodStart,
        'apiUsage.searchCount': 0,
        'apiUsage.chatCount': 0,
        'apiUsage.docsCount': 0,
      },
    }
  );

  user.usageCycleStart = periodStart;
  if (user.apiUsage) {
    user.apiUsage.searchCount = 0;
    user.apiUsage.chatCount = 0;
    user.apiUsage.docsCount = 0;
  }
};

/** Limites em formato JSON (Infinity vira null = sem limite) */
export const limitsForJson = (plan: ResolvedPlan): Record<FeatureType, number | null> => {
  const out = {} as Record<FeatureType, number | null>;
  (Object.keys(PLAN_LIMITS.free) as FeatureType[]).forEach((f) => {
    const v = getLimit(plan, f);
    out[f] = Number.isFinite(v) ? v : null;
  });
  return out;
};
