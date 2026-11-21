import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

/**
 * Escritório (inquilino do modo white-label).
 * Cada escritório tem a própria marca, os domínios autorizados, o widget de atendimento,
 * a comissão do Pequi e a conta conectada no Stripe (Connect) que recebe dos clientes.
 */
export interface ITenant extends Document {
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  ownerUserId?: mongoose.Types.ObjectId;
  /** Plano que o escritório paga ao Pequi */
  pequiPlan: 'pro' | 'enterprise';
  branding: {
    displayName: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor: string;
    inkColor: string;
    welcomeMessage: string;
    widgetPosition: 'right' | 'left';
  };
  domains: {
    /** Hosts do painel com a marca do escritório (ex.: ia.silvaadvogados.com.br) */
    panelDomains: string[];
    /** Sites autorizados a abrir o widget (ex.: https://silvaadvogados.com.br) */
    widgetOrigins: string[];
  };
  widget: {
    publicKey: string;
    enabled: boolean;
    /** Mensagens grátis antes de pedir o contato */
    freeMessages: number;
    /** Mensagens depois de deixar o contato, antes de sugerir um plano */
    leadMessages: number;
    rateLimitPerMinute: number;
    dailyMessageCap: number;
  };
  /** Comissão do Pequi (%) sobre as assinaturas dos clientes do escritório */
  commissionPercent: number;
  stripe: {
    accountId?: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const newWidgetKey = () => `pk_wl_${crypto.randomBytes(18).toString('hex')}`;

const HEX = /^#[0-9a-fA-F]{6}$/;

const TenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: [true, 'O nome do escritório é obrigatório'], trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Use de 3 a 40 letras minúsculas, números ou hífen'],
    },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    pequiPlan: { type: String, enum: ['pro', 'enterprise'], default: 'pro' },
    branding: {
      displayName: { type: String, trim: true, default: '' },
      logoUrl: { type: String, trim: true },
      faviconUrl: { type: String, trim: true },
      primaryColor: { type: String, default: '#FA5A50', match: [HEX, 'Cor inválida (use #RRGGBB)'] },
      inkColor: { type: String, default: '#242521', match: [HEX, 'Cor inválida (use #RRGGBB)'] },
      welcomeMessage: { type: String, trim: true, default: 'Olá! Sou a assistente virtual do escritório. Como posso ajudar?' },
      widgetPosition: { type: String, enum: ['right', 'left'], default: 'right' },
    },
    domains: {
      panelDomains: { type: [String], default: [] },
      widgetOrigins: { type: [String], default: [] },
    },
    widget: {
      publicKey: { type: String, unique: true, default: newWidgetKey },
      enabled: { type: Boolean, default: true },
      freeMessages: { type: Number, default: 3, min: 0, max: 50 },
      leadMessages: { type: Number, default: 10, min: 0, max: 500 },
      rateLimitPerMinute: { type: Number, default: 20, min: 1, max: 600 },
      dailyMessageCap: { type: Number, default: 2000, min: 1, max: 1000000 },
    },
    commissionPercent: { type: Number, default: 15, min: 0, max: 100 },
    stripe: {
      accountId: { type: String },
      chargesEnabled: { type: Boolean, default: false },
      payoutsEnabled: { type: Boolean, default: false },
      detailsSubmitted: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

TenantSchema.index({ 'domains.panelDomains': 1 });

export default mongoose.model<ITenant>('Tenant', TenantSchema);
