import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import User from '../models/user.model';
import Subscription from '../models/subscription.model';
import { AppError } from '../utils/errors';

export type FeatureType = 'searchCount' | 'chatCount' | 'docsCount' | 'vaultFolderCount' | 'workflowCount';

// Define the absolute limits for each plan over a billing cycle
export const PLAN_LIMITS = {
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
    }
};

/**
 * Middleware to check if a user has exceeded their plan's limit for a given feature.
 * Automatically increments the count if they pass the check (and increment is true).
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

            let planTier: 'free' | 'pro' | 'enterprise' = 'free';

            if (user.subscriptionId) {
                const sub = await Subscription.findById(user.subscriptionId);
                if (sub && sub.status === 'active') {
                    planTier = 'pro';
                    // NOTE: If you add Enterprise natively to stripe in the future, 
                    // you would conditionally set planTier='enterprise' depending on the price ID.
                }
            }

            // A conta do administrador (ADMIN_EMAIL) não tem limites, para testes e suporte
            const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
            const isAdmin = Boolean(adminEmail) && (user.email || '').trim().toLowerCase() === adminEmail;

            const limit = isAdmin ? Infinity : PLAN_LIMITS[planTier][feature];
            const currentUsage = user.apiUsage ? user.apiUsage[feature] : 0;

            if (currentUsage >= (limit as number)) {
                const featureNames: Record<FeatureType, string> = {
                    searchCount: 'pesquisas',
                    chatCount: 'conversas',
                    docsCount: 'documentos',
                    vaultFolderCount: 'pastas do cofre',
                    workflowCount: 'fluxos de trabalho',
                };
                const featureName = featureNames[feature] ?? (feature as string).replace('Count', '').replace(/([A-Z])/g, ' $1').toLowerCase().trim();
                
                const message = (limit === 0)
                    ? `Este recurso não está incluído no seu plano atual. Faça upgrade para o Pro para ter acesso.`
                    : `Você atingiu o limite de ${featureName} do plano ${planTier.toUpperCase()}. Faça upgrade para o Pro para continuar.`;

                return res.status(403).json({
                    message,
                    code: 'UPGRADE_REQUIRED'
                });
            }

            // Automatically increment their usage counter if requested
            if (increment) {
                await User.findByIdAndUpdate(userId, {
                    $inc: { [`apiUsage.${feature}`]: 1 }
                });
            }

            next();
        } catch (error) {
            res.status(500).json({ message: 'Falha ao verificar os limites de uso' });
        }
    };
};
