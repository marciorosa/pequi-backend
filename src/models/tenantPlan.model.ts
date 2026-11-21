import mongoose, { Document, Schema } from 'mongoose';

/**
 * Plano que o escritório vende aos próprios clientes (preço em BRL e limites de uso).
 * O produto e o preço ficam na conta Stripe do Pequi; a cobrança repassa o valor
 * ao escritório (Connect) e retém a comissão do Pequi.
 */
export interface ITenantPlan extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  priceCents: number;
  interval: 'month' | 'year';
  /** null = sem limite */
  limits: {
    searchCount: number | null;
    chatCount: number | null;
    docsCount: number | null;
    vaultFolderCount: number | null;
    workflowCount: number | null;
  };
  features: string[];
  stripeProductId?: string;
  stripePriceId?: string;
  /** Destaque "Mais popular" na página de planos */
  popular: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const limit = { type: Number, default: 0, min: 0 };

const TenantPlanSchema = new Schema<ITenantPlan>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: [true, 'O nome do plano é obrigatório'], trim: true },
    description: { type: String, trim: true },
    priceCents: { type: Number, required: true, min: [100, 'O preço mínimo é R$ 1,00'] },
    interval: { type: String, enum: ['month', 'year'], default: 'month' },
    limits: {
      searchCount: limit,
      chatCount: limit,
      docsCount: limit,
      vaultFolderCount: limit,
      workflowCount: limit,
    },
    features: { type: [String], default: [] },
    stripeProductId: { type: String },
    stripePriceId: { type: String },
    popular: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<ITenantPlan>('TenantPlan', TenantPlanSchema);
