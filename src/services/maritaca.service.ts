import { AiMode, aiInstructions } from '../config/aiRules';
/**
 * Integração com a Maritaca AI (modelos Sabiá), focada em português do Brasil.
 * A API segue o formato da OpenAI (chat/completions), então usamos o fetch nativo
 * do Node 20, sem dependências extras.
 *
 * Variáveis de ambiente:
 *   MARITACA_API_KEY   chave da plataforma Maritaca (obrigatória para usar)
 *   MARITACA_MODEL     modelo (padrão: sabia-4). Use o sufixo -br-sp para processar no Brasil.
 *   MARITACA_BASE_URL  opcional (padrão: https://chat.maritaca.ai/api)
 */

export const MARITACA_MODEL = process.env.MARITACA_MODEL || 'sabia-4';
const MARITACA_BASE_URL = (process.env.MARITACA_BASE_URL || 'https://chat.maritaca.ai/api').replace(/\/+$/, '');
const MARITACA_TIMEOUT_MS = 50000;

export type MaritacaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export const isMaritacaConfigured = (): boolean => Boolean(process.env.MARITACA_API_KEY);

// Prompt de sistema: instruções consolidadas do Pequi (Núcleo, Exemplos, modo e autoauditoria)
const legalSystemPrompt = (mode: AiMode): string =>
  [
    'Responda sempre em português do Brasil, com base no ordenamento jurídico brasileiro. Não use tabelas.',
    aiInstructions(mode),
  ].join('\n\n');

const LEVEL_INSTRUCTIONS: Record<string, string> = {
  professional: 'Use tom profissional e a terminologia jurídica adequada.',
  regular: 'Use tom equilibrado: alguns termos jurídicos, sempre explicados com clareza.',
  simple: 'Use linguagem simples e acessível, evitando termos jurídicos complexos.',
};

/** Remove HTML das respostas anteriores (o histórico do painel guarda a resposta formatada). */
const toPlainText = (value: string): string =>
  String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Chamada genérica ao endpoint chat/completions da Maritaca. */
export const maritacaCompletion = async (
  messages: MaritacaMessage[],
  options: { temperature?: number; maxTokens?: number; model?: string; timeoutMs?: number } = {}
): Promise<string> => {
  const apiKey = process.env.MARITACA_API_KEY;
  if (!apiKey) {
    throw new Error('MARITACA_API_KEY não definida');
  }

  const fetchFn: any = (globalThis as any).fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch indisponível: use Node.js 20 ou superior');
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? MARITACA_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(`${MARITACA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || MARITACA_MODEL,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });

    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      // resposta não-JSON: tratada abaixo
    }

    if (!res.ok) {
      const detail = data?.error?.message || data?.detail || data?.message || raw?.slice(0, 300) || res.statusText;
      const err: any = new Error(`Maritaca ${res.status}: ${detail}`);
      err.status = res.status;
      throw err;
    }

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('Maritaca retornou uma resposta vazia');
    }
    return text.trim();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Maritaca: tempo limite de ${timeoutMs / 1000}s esgotado`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

/** Chat jurídico: monta o prompt de sistema, o histórico e a pergunta atual. */
export const maritacaChat = async (
  prompt: string,
  options: {
    languageLevel?: 'professional' | 'regular' | 'simple';
    useWebSearch?: boolean;
    chatHistory?: Array<{ role: string; content: string }>;
    mode?: AiMode;
    maxTokens?: number;
    timeoutMs?: number;
  } = {}
): Promise<string> => {
  const systemParts = [legalSystemPrompt(options.mode || 'informativo')];
  if (options.languageLevel && LEVEL_INSTRUCTIONS[options.languageLevel]) {
    systemParts.push(LEVEL_INSTRUCTIONS[options.languageLevel]);
  }
  if (options.useWebSearch) {
    // A Maritaca não pesquisa na internet: pedimos transparência sobre a data do conhecimento
    systemParts.push('O usuário pediu informações atualizadas: mencione desenvolvimentos recentes que conheça e avise que mudanças legislativas ou jurisprudenciais muito recentes devem ser conferidas nas fontes oficiais.');
  }

  const messages: MaritacaMessage[] = [{ role: 'system', content: systemParts.join('\n\n') }];

  // Últimas mensagens do histórico, sem vazias e alternando os papéis
  const history = (options.chatHistory || [])
    .map((m) => ({ role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: toPlainText(m.content) }))
    .filter((m) => m.content !== '')
    .slice(-20);
  for (const m of history) {
    const last = messages[messages.length - 1];
    if (last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      messages.push(m);
    }
  }
  // A pergunta atual precisa vir depois de uma resposta do assistente (ou do sistema)
  if (messages[messages.length - 1].role === 'user') {
    messages.pop();
  }

  messages.push({ role: 'user', content: (prompt || '').trim() || 'Preciso de ajuda com uma questão jurídica.' });

  // Peças pedem precisão: menos variação no texto
  const temperature = options.mode === 'peca' ? 0.2 : 0.4;
  return maritacaCompletion(messages, { temperature, maxTokens: options.maxTokens ?? 4096, timeoutMs: options.timeoutMs });
};

/** Diagnóstico usado em /health/ai?provider=maritaca. Nunca expõe a chave. */
export const checkMaritaca = async (): Promise<{ ok: boolean; provider: string; model: string; keyConfigured: boolean; reply?: string; error?: string; status?: number }> => {
  const keyConfigured = isMaritacaConfigured();
  if (!keyConfigured) {
    return { ok: false, provider: 'maritaca', model: MARITACA_MODEL, keyConfigured, error: 'MARITACA_API_KEY não definida' };
  }
  try {
    const started = Date.now();
    const reply = await maritacaCompletion(
      [{ role: 'user', content: 'O que é usucapião? Responda em uma frase.' }],
      { maxTokens: 200, temperature: 0.2 }
    );
    return { ok: true, provider: 'maritaca', model: MARITACA_MODEL, keyConfigured, reply: `${reply} (${Date.now() - started} ms)` };
  } catch (err: any) {
    const key = process.env.MARITACA_API_KEY || '__no_key__';
    return {
      ok: false,
      provider: 'maritaca',
      model: MARITACA_MODEL,
      keyConfigured,
      status: err?.status,
      error: String(err?.message || err).split(key).join('***'),
    };
  }
};
