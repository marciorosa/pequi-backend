/**
 * Limite de pedidos em memória (janela fixa). Serve para uma instância do servidor;
 * com várias instâncias, troque o Map por Redis mantendo a mesma interface.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Soma 1 ao contador da chave e diz se ainda está dentro do limite */
export const hit = (key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } => {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  return { ok: b.count <= max, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
};

/** Quantos pedidos a chave já fez na janela atual (sem somar) */
export const peek = (key: string): number => {
  const b = buckets.get(key);
  return b && b.resetAt > Date.now() ? b.count : 0;
};

/** Devolve 1 pedido à chave (ex.: quando a IA falhou e o visitante não recebeu resposta) */
export const refund = (key: string): void => {
  const b = buckets.get(key);
  if (b && b.count > 0) b.count -= 1;
};

// Limpeza periódica para o Map não crescer sem fim
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60 * 1000).unref();

/** IP do visitante (considera o proxy da hospedagem) */
export const clientIp = (req: any): string =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
