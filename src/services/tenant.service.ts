/**
 * Regras do modo white-label: como achar o escritório pelo host ou pela chave do widget,
 * quais dados dele podem ser públicos e quais origens podem usar a API.
 */
import mongoose from 'mongoose';
import Tenant, { ITenant } from '../models/tenant.model';

const CACHE_MS = 60 * 1000;

/** "https://Site.com.br/" -> "https://site.com.br" (origem sem barra e em minúsculas) */
export const normalizeOrigin = (value: string): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
};

/** "https://ia.site.com.br:443/x" -> "ia.site.com.br" (só o host, com porta se não for a padrão) */
export const normalizeHost = (value: string): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).host;
  } catch {
    return '';
  }
};

/** Domínio base do Pequi para os subdomínios dos escritórios (slug.pequi.me) */
const baseDomains = (): string[] =>
  (process.env.TENANT_BASE_DOMAINS || 'pequi.me,localhost:3000,localhost')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

/** Hosts que são o próprio Pequi (sem escritório) */
const isPequiHost = (host: string) =>
  ['pequi.me', 'www.pequi.me', 'localhost', 'localhost:3000', '127.0.0.1:3000'].includes(host);

/* ------------------------------- cache em memória ------------------------------- */

type Entry = { tenant: ITenant | null; at: number };
const byHost = new Map<string, Entry>();
const byKey = new Map<string, Entry>();
let panelOrigins: { set: Set<string>; at: number } = { set: new Set(), at: 0 };

export const clearTenantCache = () => {
  byHost.clear();
  byKey.clear();
  panelOrigins = { set: new Set(), at: 0 };
};

const fresh = (e?: Entry) => e && Date.now() - e.at < CACHE_MS;

/** Acha o escritório pelo host do painel: domínio próprio ou subdomínio slug.pequi.me */
export const findTenantByHost = async (hostInput: string): Promise<ITenant | null> => {
  const host = normalizeHost(hostInput);
  if (!host || isPequiHost(host) || mongoose.connection.readyState !== 1) return null;
  const cached = byHost.get(host);
  if (fresh(cached)) return cached!.tenant;

  let tenant = await Tenant.findOne({ 'domains.panelDomains': host, status: 'active' });
  if (!tenant) {
    for (const base of baseDomains()) {
      if (host.endsWith(`.${base}`)) {
        const slug = host.slice(0, -(base.length + 1));
        if (slug && !slug.includes('.')) {
          tenant = await Tenant.findOne({ slug, status: 'active' });
        }
        break;
      }
    }
  }
  byHost.set(host, { tenant, at: Date.now() });
  return tenant;
};

export const findTenantBySlug = async (slug: string): Promise<ITenant | null> => {
  const s = String(slug || '').trim().toLowerCase();
  if (!s || mongoose.connection.readyState !== 1) return null;
  return Tenant.findOne({ slug: s, status: 'active' });
};

/** Acha o escritório pela chave pública do widget */
export const findTenantByWidgetKey = async (key: string): Promise<ITenant | null> => {
  const k = String(key || '').trim();
  if (!/^pk_wl_[a-f0-9]{20,64}$/.test(k) || mongoose.connection.readyState !== 1) return null;
  const cached = byKey.get(k);
  if (fresh(cached)) return cached!.tenant;
  const tenant = await Tenant.findOne({ 'widget.publicKey': k, status: 'active' });
  byKey.set(k, { tenant, at: Date.now() });
  return tenant;
};

/** O site (origem) pode abrir o widget deste escritório? */
export const isWidgetOriginAllowed = (tenant: ITenant, origin: string): boolean => {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  return (tenant.domains?.widgetOrigins || []).map(normalizeOrigin).includes(o);
};

/** Origens dos painéis white-label (para o CORS da API). Atualiza a cada minuto. */
export const isPanelOrigin = async (origin: string): Promise<boolean> => {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  if (Date.now() - panelOrigins.at > CACHE_MS && mongoose.connection.readyState === 1) {
    const tenants = await Tenant.find({ status: 'active' }).select('slug domains.panelDomains').lean();
    const set = new Set<string>();
    for (const t of tenants as any[]) {
      for (const d of t.domains?.panelDomains || []) {
        set.add(`https://${d}`);
        set.add(`http://${d}`);
      }
      for (const base of baseDomains()) {
        set.add(`https://${t.slug}.${base}`);
        if (base.startsWith('localhost')) set.add(`http://${t.slug}.${base}`);
      }
    }
    panelOrigins = { set, at: Date.now() };
  }
  return panelOrigins.set.has(o);
};

/** Dados do escritório que podem ser mostrados a qualquer visitante (marca e cores) */
export const publicTenant = (t: ITenant) => ({
  id: String(t._id),
  slug: t.slug,
  name: t.branding?.displayName || t.name,
  logoUrl: t.branding?.logoUrl || '',
  faviconUrl: t.branding?.faviconUrl || '',
  primaryColor: t.branding?.primaryColor || '#FA5A50',
  inkColor: t.branding?.inkColor || '#242521',
  welcomeMessage: t.branding?.welcomeMessage || '',
  widgetPosition: t.branding?.widgetPosition || 'right',
  panelUrl: panelUrl(t),
  // Os pagamentos entram na conta Stripe do Pequi: basta o escritório estar ativo e o Stripe configurado
  billingReady: t.status === 'active' && Boolean(process.env.STRIPE_SECRET_KEY),
});

/** Endereço do painel com a marca do escritório (domínio próprio ou subdomínio) */
export const panelUrl = (t: ITenant): string => {
  const own = t.domains?.panelDomains?.[0];
  if (own) return `${own.startsWith('localhost') || own.includes('.localhost') ? 'http' : 'https'}://${own}`;
  const front = (process.env.FRONTEND_URL || 'https://pequi.me').split(',')[0].trim().replace(/\/$/, '');
  try {
    const u = new URL(front);
    return `${u.protocol}//${t.slug}.${u.host.replace(/^www\./, '')}`;
  } catch {
    return `https://${t.slug}.pequi.me`;
  }
};

/**
 * Endereço de uma página no painel do escritório.
 * Com domínio próprio cadastrado: https://dominio/caminho.
 * Sem domínio próprio: endereço do Pequi com ?tenant=slug (funciona sem configurar DNS).
 */
export const tenantPageUrl = (t: ITenant, path: string, query: Record<string, string> = {}): string => {
  const own = t.domains?.panelDomains?.[0];
  const params = new URLSearchParams(query);
  if (!own) params.set('tenant', t.slug);
  const qs = params.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
  const base = own
    ? panelUrl(t)
    : (process.env.FRONTEND_URL || 'https://pequi.me').split(',')[0].trim().replace(/\/$/, '');
  return `${base}${path}${qs ? `?${qs}` : ''}`;
};

/** Limpa a lista de domínios digitada no admin */
export const cleanList = (values: any, kind: 'host' | 'origin'): string[] => {
  const arr = Array.isArray(values) ? values : String(values || '').split(/[\s,;]+/);
  const out = arr.map((v) => (kind === 'host' ? normalizeHost(v) : normalizeOrigin(v))).filter(Boolean);
  return Array.from(new Set(out));
};
