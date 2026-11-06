import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import User from '../models/user.model';
import {
    FeatureType,
    PLAN_LIMITS,
    resolvePlan,
    getLimit,
    getUsage,
    canUseLawyer,
    ensureUsageCycle,
} from '../config/plans';

export type { FeatureType };
export { PLAN_LIMITS };

const featureNames: Record<FeatureType, string> = {
    searchCount: 'pesquisas',
    chatCount: 'mensagens de chat',
    docsCount: 'operações com documentos',
    vaultFolderCount: 'pastas do cofre',
    workflowCount: 'fluxos de trabalho',
};

// Recursos contados pelo que existe no banco (não por contador), para não divergir da tela
const COUNTED_FROM_DB: FeatureType[] = ['vaultFolderCount', 'workflowCount'];

const upgradeRequired = (res: Response, message: string) =>
    res.status(403).json({ message, code: 'UPGRADE_REQUIRED' });

/**
 * Verifica no servidor se o usuário ainda tem cota do recurso no plano dele.
 * Se tiver, soma 1 ao contador (pesquisas, mensagens e documentos) e devolve a
 * unidade caso a operação termine em erro.
 */
export const checkFeatureLimit = (feature: FeatureType, increment: boolean = true) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Não autorizado' });
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'Usuário não encontrado' });
            }

            const plan = await resolvePlan(user);
            await ensureUsageCycle(user, plan);
            const limit = getLimit(plan, feature);

            if (limit === 0) {
                return upgradeRequired(res, 'Este recurso não está incluído no seu plano atual. Faça upgrade para o Pro para ter acesso.');
            }

            if (!increment) {
                return next();
            }

            if (COUNTED_FROM_DB.includes(feature)) {
                const usage = await getUsage(user);
                if (usage[feature] >= limit) {
                    return upgradeRequired(res, `Você atingiu o limite de ${featureNames[feature]} do seu plano.`);
                }
                return next();
            }

            // Soma 1 só se o uso atual ainda estiver abaixo do limite (operação atômica,
            // para que requisições simultâneas não ultrapassem a cota)
            const filter: any = { _id: userId };
            if (Number.isFinite(limit)) {
                filter.$or = [
                    { [`apiUsage.${feature}`]: { $lt: limit } },
                    { [`apiUsage.${feature}`]: { $exists: false } },
                ];
            }
            const updated = await User.findOneAndUpdate(filter, { $inc: { [`apiUsage.${feature}`]: 1 } }, { new: true });

            if (!updated) {
                return upgradeRequired(res, `Você atingiu o limite de ${featureNames[feature]} do plano ${plan.tier === 'free' ? 'Gratuito' : 'Pro'}. Faça upgrade para continuar.`);
            }

            // Uma operação que terminou em erro não deve consumir a cota do usuário
            res.on('finish', () => {
                if (res.statusCode >= 400) {
                    User.updateOne(
                        { _id: userId, [`apiUsage.${feature}`]: { $gt: 0 } },
                        { $inc: { [`apiUsage.${feature}`]: -1 } }
                    ).catch(() => undefined);
                }
            });

            next();
        } catch (error) {
            res.status(500).json({ message: 'Falha ao verificar os limites de uso' });
        }
    };
};

/**
 * Bloqueia no servidor os assistentes de IA que não fazem parte do plano do usuário.
 * O site envia o identificador do assistente em context.lawyerId (chat) ou options.lawyerId (documentos).
 * Deve vir ANTES de checkFeatureLimit, para não consumir cota quando o acesso é negado.
 */
export const checkLawyerAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const lawyerId: string | undefined = req.body?.context?.lawyerId || req.body?.options?.lawyerId;
        if (!lawyerId) return next();

        const user = await User.findById(req.user?.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const plan = await resolvePlan(user);
        if (!canUseLawyer(plan, String(lawyerId))) {
            return upgradeRequired(res, 'Este assistente não está incluído no plano Gratuito. Faça upgrade para o Pro para usá-lo.');
        }

        next();
    } catch (error) {
        res.status(500).json({ message: 'Falha ao verificar o acesso ao assistente' });
    }
};
