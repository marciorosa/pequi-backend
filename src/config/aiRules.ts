/**
 * Regras de precisão aplicadas a todas as respostas da IA (Gemini e Maritaca).
 * Pedidas no relatório consolidado de avaliação (06/11/2026): a IA citava súmulas e
 * julgados inexistentes e inventava fatos que não estavam no pedido do usuário.
 */
export const ACCURACY_RULES = [
  'ACCURACY RULES (mandatory):',
  '1. CITATIONS: Cite a law or article only when you are certain the number and content are correct (for example "art. 335 do CPC"). Do NOT cite súmulas, enunciados, temas repetitivos or court decisions (REsp, AREsp, AgInt, AgRg, Apelação, HC, etc.) by number unless you are certain of the exact number, court and content. When unsure, describe the general understanding without a number (for example "o STJ tem entendimento de que...") and write "[conferir em fonte oficial]". Never use placeholder or partial numbers (such as "1001234-XX"). Never attribute to a súmula or precedent a content you are not sure it has.',
  '2. FACTS: Use only the facts stated by the user or contained in the documents provided. Never invent facts (profession, income, payments, improvements, dates, values, family situation). When a needed fact is missing, ask for it or insert a field such as [PREENCHER: descrição do fato] instead of making it up.',
  '3. LEGAL DRAFTS: When asked to draft a petition, defense (contestação), appeal, notice or contract, deliver only the document itself, with its formal requirements (addressing, qualification of the parties with [PREENCHER] fields, facts, legal grounds, requests, value of the claim when applicable, place, date and signature field for the lawyer with OAB number). Do not put strategy notes, counterarguments, probability tables or the informational disclaimer inside the document. If observations are useful, put them after the document, below the line "Observações (não fazem parte da peça)", including the reminder that a lawyer registered with the OAB must review the draft and check every citation.',
  '4. CURRENT LAW: Prefer the most recent law and case law you know, and say when a topic may have changed. Health plans and treatments outside the ANS list (rol da ANS): mention that the STF, in ADI 7265 (judged in September 2025), interpreted Lei 14.454/2022 and set cumulative criteria, with binding effect, for coverage outside the list; do not present the earlier STJ position (2022) as the current rule, and recommend checking the criteria on the STF website.',
].join(' ');

// Padrões de citações que precisam ser conferidas (súmulas, enunciados e julgados)
const CITATION_PATTERNS: RegExp[] = [
  /\bS[úu]mula(?:\s+Vinculante)?\s+(?:n[º°o.]*\s*)?\d+(?:\s*(?:do|da|\/)\s*(?:STJ|STF|TST|TSE|TRF\d?|TJ[A-Z]{2}))?/gi,
  /\bEnunciado\s+(?:n[º°o.]*\s*)?\d+(?:\s+d[oa]\s+(?:CJF|FONAJE|Jornada[^,.;<]{0,40}))?/gi,
  /\bTema\s+(?:Repetitivo\s+)?(?:n[º°o.]*\s*)?\d+(?:\s+d[oa]\s+(?:STJ|STF))?/gi,
  /\b(?:AgInt|AgRg|EDcl|EREsp|REsp|AREsp|RHC|HC|RMS|ADI|ADPF|ADC|ARE)\b(?:\s+(?:no|na|nos)\s+(?:AgInt|AgRg|REsp|AREsp|RE|ARE|HC))?\s*(?:n[º°o.]*\s*)?\d[\d.\-]*(?:\/[A-Z]{2})?/g,
  /\b(?:Apela[çc][ãa]o(?:\s+C[íi]vel)?|Agravo\s+de\s+Instrumento)\s+(?:n[º°o.]*\s*)?\d[\dX.\-]*/gi,
];

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lista as citações de súmulas, enunciados e julgados encontradas no texto (sem repetição). */
export const findCitations = (text: string): string[] => {
  const plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const found: string[] = [];
  for (const pattern of CITATION_PATTERNS) {
    for (const match of plain.match(pattern) || []) {
      const cleaned = match.trim().replace(/[.,;:]+$/, '');
      if (!found.some((f) => f.toLowerCase() === cleaned.toLowerCase())) found.push(cleaned);
    }
  }
  return found.slice(0, 15);
};

/**
 * Aviso anexado ao fim da resposta quando ela cita súmulas, enunciados ou julgados.
 * A IA ainda não consulta bases oficiais, então cada citação precisa ser conferida.
 */
export const citationWarningHTML = (text: string): string => {
  const citations = findCitations(text);
  if (citations.length === 0) return '';
  const items = citations.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
  return `<div class="citation-check"><p><strong>Confira estas citações antes de usar.</strong> A IA pode errar números e conteúdos de súmulas e decisões. Verifique cada uma em fonte oficial (planalto.gov.br, stf.jus.br, stj.jus.br, cjf.jus.br). Este aviso não faz parte do texto acima.</p><ul>${items}</ul></div>`;
};
