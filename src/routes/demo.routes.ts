/**
 * Demonstração aberta da assistente (2026-11-24): o visitante do site do Pequi,
 * sem login, faz algumas perguntas e vê a IA respondendo de verdade.
 *
 * Limites (em memória, como o widget):
 * - por visitante (IP): DEMO_PER_VISITOR perguntas a cada 24 h e no máximo 2 por minuto;
 * - no site inteiro: DEMO_DAILY_CAP perguntas por dia, para o custo da IA ficar previsível.
 * Nada é gravado: a conversa vive só na tela do visitante.
 */
import express, { Request, Response } from 'express';
import { hit, peek, refund, clientIp } from '../middleware/rateLimit.middleware';
import { maritacaChat, isMaritacaConfigured } from '../services/maritaca.service';
import geminiService from '../services/gemini.service';
import { isAiFailureMessage } from '../controllers/ai.controller';

const router = express.Router();

const PER_VISITOR = Number(process.env.DEMO_PER_VISITOR || 3);
const DAILY_CAP = Number(process.env.DEMO_DAILY_CAP || 300);
const MAX_CHARS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const demoPrompt = [
  'Você é a assistente jurídica do Pequi, em uma demonstração no site para escritórios de advocacia.',
  'Responda à dúvida jurídica da pessoa em linguagem simples, com base na legislação brasileira, citando a lei quando ajudar.',
  'Seja breve: no máximo 3 parágrafos curtos, sem títulos e sem tabelas.',
  'Quando o caso exigir análise individual, prazos urgentes ou atuação em processo, recomende procurar um advogado.',
  'Não prometa resultado e não invente números de processos, artigos ou valores.',
].join('\n');

// O chat da página mostra texto simples: tira HTML e marcações de Markdown
const toPlain = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const tooMany = (res: Response, retryAfter: number, limit: 'visitor' | 'site', message: string) => {
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({ limit, message });
};

/** POST /api/demo/ask { message, history?: [{ role, content }] } */
router.post('/ask', async (req: Request, res: Response) => {
  const message = String(req.body?.message || '').trim().slice(0, MAX_CHARS);
  if (!message) return res.status(400).json({ message: 'Escreva uma pergunta.' });

  const ip = clientIp(req);
  const burst = hit(`demo:min:${ip}`, 2, 60 * 1000);
  if (!burst.ok) return tooMany(res, burst.retryAfter, 'visitor', 'Aguarde um instante antes da próxima pergunta.');
  const visitor = hit(`demo:day:${ip}`, PER_VISITOR, DAY_MS);
  if (!visitor.ok) {
    return tooMany(res, visitor.retryAfter, 'visitor', 'Você usou as perguntas da demonstração. Crie sua conta grátis para continuar.');
  }
  const siteKey = `demo:site:${new Date().toISOString().slice(0, 10)}`;
  const site = hit(siteKey, DAILY_CAP, DAY_MS);
  if (!site.ok) {
    return tooMany(res, site.retryAfter, 'site', 'A demonstração atingiu o limite de hoje. Crie sua conta grátis para continuar.');
  }

  // Só as últimas trocas, curtas, para manter o contexto sem custo alto
  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .slice(-6)
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m: any) => ({ role: m.role, content: String(m.content || '').slice(0, 1500) }));

  let reply = '';
  try {
    if (isMaritacaConfigured()) {
      reply = await maritacaChat(message, { chatHistory: history, languageLevel: 'simple', extraSystem: demoPrompt, maxTokens: 700, timeoutMs: 40000 });
    } else {
      reply = await geminiService.generateChatResponse(`${demoPrompt}\n\nPergunta do visitante: ${message}`, {
        languageLevel: 'simple',
        chatHistory: history,
      });
    }
  } catch (error: any) {
    console.error('[demo] Falha da IA:', error?.message || error);
  }
  reply = toPlain(String(reply || ''));
  if (!reply || isAiFailureMessage(reply)) {
    // Sem resposta, a pergunta não conta para o visitante nem para o teto do dia
    refund(`demo:day:${ip}`);
    refund(siteKey);
    return res.status(503).json({ message: 'A assistente está indisponível agora. Tente de novo em instantes.' });
  }

  res.json({ reply, remaining: Math.max(0, PER_VISITOR - peek(`demo:day:${ip}`)) });
});

export default router;
