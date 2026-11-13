/**
 * Revisão automática das peças depois da geração (Relatório 4, itens 2 e 3).
 *
 * 1. Idioma: troca palavras em inglês que o modelo deixa escapar em textos longos
 *    ("elaboration" no lugar de "elaboração"). Primeiro por um dicionário fixo; se ainda
 *    sobrar palavra estrangeira, pede ao modelo só a tradução dessas palavras (e aplica
 *    apenas a troca de palavras, sem reescrever a peça).
 * 2. Observações: garante que o aviso ao usuário fique na seção
 *    "Observações (não integram a peça)", e não como "Aviso:" solto no fim.
 */

export const OBSERVACOES_TITULO = 'Observações (não integram a peça)';

// Deslizes já vistos ou prováveis em peças jurídicas: inglês -> português
const DICIONARIO: Record<string, string> = {
  elaboration: 'elaboração',
  therefore: 'portanto',
  however: 'contudo',
  moreover: 'ademais',
  furthermore: 'além disso',
  whereas: 'considerando que',
  plaintiff: 'autor',
  plaintiffs: 'autores',
  defendant: 'réu',
  defendants: 'réus',
  lawsuit: 'ação',
  lawsuits: 'ações',
  claim: 'pedido',
  claims: 'pedidos',
  damages: 'danos',
  agreement: 'acordo',
  liability: 'responsabilidade',
  evidence: 'prova',
  hearing: 'audiência',
  judgment: 'sentença',
  judgement: 'sentença',
  court: 'juízo',
  attorney: 'advogado',
  lawyer: 'advogado',
  fees: 'honorários',
  request: 'requerimento',
  requests: 'requerimentos',
  according: 'conforme',
  regarding: 'quanto a',
  analysis: 'análise',
  application: 'aplicação',
  interpretation: 'interpretação',
  compensation: 'indenização',
  indemnification: 'indenização',
  injunction: 'liminar',
  debt: 'débito',
  creditor: 'credor',
  debtor: 'devedor',
  consumer: 'consumidor',
  property: 'imóvel',
  lease: 'locação',
  rent: 'aluguel',
  payment: 'pagamento',
  breach: 'descumprimento',
  statement: 'declaração',
  understanding: 'entendimento',
};

// Palavras que só existem em inglês (não colidem com o português): servem para detectar
// o que o dicionário não cobriu. Expressões latinas do foro não entram aqui.
const SINAIS_INGLES = [
  'the', 'and', 'which', 'with', 'that', 'this', 'these', 'those', 'should', 'would', 'could',
  'been', 'being', 'have', 'has', 'were', 'their', 'there', 'where', 'whose', 'within', 'without',
  'between', 'through', 'against', 'upon', 'shall', 'must', 'such', 'other', 'also', 'only',
  'because', 'while', 'whether', 'about', 'after', 'before', 'under', 'into', 'from',
];

const ENGLISH_SUFFIX = /\b[a-z]{4,}(?:tion|tions|ment|ments|ness|ship|ings|ity)\b/gi;
// Terminações que também existem em português e não indicam inglês
const PT_FALSOS = /(?:mento|mentos|dade|ção|ções)$/i;

const preserveCase = (original: string, replacement: string): string => {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
};

const wordRegex = (word: string) => new RegExp(`(?<![\\p{L}\\-])${word}(?![\\p{L}\\-])`, 'giu');

/** Troca as palavras do dicionário. Devolve o texto corrigido e as trocas feitas. */
export const corrigirIdiomaDicionario = (text: string): { text: string; trocas: string[] } => {
  let out = String(text || '');
  const trocas: string[] = [];
  for (const [en, pt] of Object.entries(DICIONARIO)) {
    const word = en;
    const re = wordRegex(word);
    if (re.test(out)) {
      out = out.replace(wordRegex(word), (m) => preserveCase(m, pt));
      trocas.push(`${word} → ${pt}`);
    }
  }
  return { text: out, trocas };
};

/** Lista palavras que parecem estar em inglês (para a revisão por modelo). */
export const findForeignWords = (text: string): string[] => {
  const plain = String(text || '').replace(/<[^>]+>/g, ' ');
  const found = new Set<string>();
  for (const w of SINAIS_INGLES) {
    const m = plain.match(wordRegex(w));
    if (m) found.add(m[0].toLowerCase());
  }
  for (const m of plain.match(ENGLISH_SUFFIX) || []) {
    if (!PT_FALSOS.test(m) && /^[a-z]+$/i.test(m)) found.add(m.toLowerCase());
  }
  // Palavras sem acento terminadas em -tion/-ment etc. que existem em português são raras;
  // ainda assim, a revisão por modelo só troca o que ele confirmar como estrangeiro.
  return [...found].slice(0, 30);
};

/**
 * Aplica as traduções devolvidas pelo modelo, só para as palavras pedidas.
 * `traducoes` vem como {"palavra": "tradução"}; entradas vazias ou iguais são ignoradas.
 */
export const aplicarTraducoes = (text: string, pedidas: string[], traducoes: Record<string, unknown>): string => {
  let out = text;
  for (const palavra of pedidas) {
    const pt = traducoes?.[palavra];
    if (typeof pt !== 'string') continue;
    const limpo = pt.trim();
    if (!limpo || limpo.toLowerCase() === palavra || limpo.length > 40) continue;
    out = out.replace(wordRegex(palavra), (m) => preserveCase(m, limpo));
  }
  return out;
};

export const promptTraducao = (palavras: string[], trecho: string): string =>
  `Um texto jurídico em português do Brasil saiu com estas palavras possivelmente em inglês: ${palavras.join(', ')}.
Trecho do texto, para contexto:
"""${trecho.slice(0, 3000)}"""
Responda somente com um objeto JSON no formato {"palavra": "tradução em português"}, só para as palavras que de fato estão em outra língua no texto. Não inclua palavras que já são português, expressões latinas do foro nem nomes próprios (pessoas, empresas, marcas). Sem explicações.`;

// Avisos que o modelo costuma deixar soltos no fim da peça
const AVISO_SOLTO = /^\s*(?:#{1,4}\s*)?(?:\*\*|__)?\s*(?:aviso(?:\s+importante)?|observa[çc][ãa]o|observa[çc][õo]es|nota|importante|aten[çc][ãa]o|disclaimer)(?![\p{L}])\s*(?:\([^)]*\))?\s*(?:\*\*|__)?\s*[:\-–]?\s*(?:\*\*|__)?\s*/iu;
const AVISO_CONTEUDO = /(este texto [ée] uma minuta|esta (?:pe[çc]a|minuta) (?:[ée]|foi)|minuta (?:gerada|elaborada)|n[ãa]o substitui|advogad[oa] inscrit[oa] na OAB|revis(?:ad[oa]|ão) por advogad|gerad[oa] por (?:intelig[êe]ncia artificial|IA)|conferir em fonte oficial|confira em fonte oficial)/i;
const SO_TITULO = /^\s*(?:#{1,4}\s*)?(?:\*\*|__)?\s*observa[çc][õo]es\b[^\n]{0,40}$/i;

/**
 * Garante a seção "Observações (não integram a peça)" no fim da peça:
 * - se o modelo já abriu a seção (com qualquer título "Observações..."), padroniza o título;
 * - se deixou avisos soltos no fim ("Aviso: este texto é uma minuta..."), põe esses
 *   parágrafos finais dentro da seção;
 * - se não há aviso nenhum, acrescenta a seção com o aviso mínimo.
 * Só os parágrafos finais são considerados, para nunca mover trechos do corpo da peça.
 */
export const separarObservacoes = (text: string): string => {
  const src = String(text || '').replace(/\r\n/g, '\n').trimEnd();
  if (!src.trim()) return src;
  const titulo = `${OBSERVACOES_TITULO}:`;
  const paragrafos = src.split(/\n\s*\n/);

  // 1. Seção já aberta nos parágrafos finais (no máximo os 8 últimos)
  for (let i = paragrafos.length - 1; i >= Math.max(0, paragrafos.length - 8); i--) {
    const primeiraLinha = paragrafos[i].split('\n')[0];
    if (SO_TITULO.test(primeiraLinha) && !primeiraLinha.includes('[PREENCHER')) {
      const resto = paragrafos[i].split('\n').slice(1).join('\n').trim();
      const novo = [titulo, resto].filter(Boolean).join('\n\n');
      return [...paragrafos.slice(0, i), novo, ...paragrafos.slice(i + 1)].join('\n\n');
    }
  }

  // 2. Avisos soltos: bloco contínuo de parágrafos de aviso no fim do texto
  let inicio = paragrafos.length;
  while (inicio > 0) {
    const p = paragrafos[inicio - 1];
    if (AVISO_CONTEUDO.test(p) || (AVISO_SOLTO.test(p) && !/\[PREENCHER/.test(p) && inicio === paragrafos.length)) inicio--;
    else break;
  }
  if (inicio < paragrafos.length) {
    const avisos = paragrafos.slice(inicio).map((p) => p.replace(AVISO_SOLTO, '').trim()).filter(Boolean);
    return [...paragrafos.slice(0, inicio), titulo, ...avisos].join('\n\n');
  }

  // 3. Sem aviso: acrescenta a seção com o aviso mínimo
  return `${src}\n\n${titulo}\n\nEsta minuta foi gerada por inteligência artificial e deve ser revisada por advogado inscrito na OAB antes de qualquer uso ou protocolo. Confira em fonte oficial as normas e os entendimentos mencionados.`;
};
