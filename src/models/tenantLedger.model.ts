import mongoose, { Document, Schema } from 'mongoose';

/**
 * Extrato do escritório (white-label).
 * Os clientes do escritório pagam na conta Stripe do Pequi. Cada fatura paga gera um
 * lançamento com o valor bruto, a comissão do Pequi e o valor líquido do escritório.
 * Os repasses feitos pelo Pequi ao escritório ficam em TenantPayout.
 * Saldo a receber = soma dos líquidos − soma dos repasses.
 */
export interface ITenantEarning extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  subscriptionId?: mongoose.Types.ObjectId;
  tenantPlanId?: mongoose.Types.ObjectId;
  stripeInvoiceId: string;
  amountCents: number;
  commissionPercent: number;
  commissionCents: number;
  netCents: number;
  paidAt: Date;
  createdAt: Date;
}

const TenantEarningSchema = new Schema<ITenantEarning>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    tenantPlanId: { type: Schema.Types.ObjectId, ref: 'TenantPlan' },
    stripeInvoiceId: { type: String, required: true, unique: true },
    amountCents: { type: Number, required: true },
    commissionPercent: { type: Number, required: true },
    commissionCents: { type: Number, required: true },
    netCents: { type: Number, required: true },
    paidAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export interface ITenantPayout extends Document {
  tenantId: mongoose.Types.ObjectId;
  amountCents: number;
  paidAt: Date;
  note?: string;
  adminEmail?: string;
  createdAt: Date;
}

const TenantPayoutSchema = new Schema<ITenantPayout>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    amountCents: { type: Number, required: true, min: 1 },
    paidAt: { type: Date, required: true },
    note: { type: String, trim: true },
    adminEmail: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TenantEarning = mongoose.model<ITenantEarning>('TenantEarning', TenantEarningSchema);
export const TenantPayout = mongoose.model<ITenantPayout>('TenantPayout', TenantPayoutSchema);
