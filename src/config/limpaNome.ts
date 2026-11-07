/**
 * Serviço Limpa Nome (Pesquisa Inteligente): petição inicial de Ação Declaratória de
 * Inexistência de Débito cumulada com Indenização por Danos Morais e Tutela de Urgência.
 *
 * O texto do pedido foi enviado por Márcio Rosa em 07/11/2026. Ajustes: a IA não "atua como
 * advogado" (regra da OAB já aplicada no Núcleo) e os campos não informados viram [PREENCHER].
 * O pedido é montado aqui, no servidor, e roda no modo peça.
 */

export type LimpaNomeData = {
  autorNome?: string;
  autorQualificacao?: string;
  reuNome?: string;
  reuQualificacao?: string;
  orgao?: string;
  valorDebito?: string;
  contrato?: string;
  dataInclusao?: string;
  protocolo?: string;
  cidadeUf?: string;
  valorDanoMoral?: string;
  fatosAdicionais?: string;
};

const MAX_FIELD = 600;

/** Limpa o texto digitado: sem quebras de linha extras e com tamanho limitado. */
const clean = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FIELD);

const orFill = (value: unknown, label: string): string => clean(value) || `[PREENCHER: ${label}]`;

/** Converte "1.234,56", "1234.56" ou "R$ 10.000" em número; devolve null se não for um valor. */
export const parseBRL = (value: unknown): number | null => {
  let s = clean(value).replace(/R\$\s*/i, '').replace(/\s/g, '');
  if (!s || !/^\d[\d.,]*$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export const formatBRL = (n: number): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Valor da causa: soma do dano moral com o débito, quando os dois valores foram informados. */
export const valorDaCausa = (data: LimpaNomeData): string => {
  const debito = parseBRL(data.valorDebito);
  const dano = parseBRL(data.valorDanoMoral);
  if (debito === null || dano === null) {
    return 'R$ [PREENCHER: soma do valor do dano moral com o valor do débito a ser declarado inexistente]';
  }
  return `R$ ${formatBRL(debito + dano)} (soma do dano moral, R$ ${formatBRL(dano)}, com o débito impugnado, R$ ${formatBRL(debito)})`;
};

const money = (value: unknown, label: string): string => {
  const n = parseBRL(value);
  return n === null ? `[PREENCHER: ${label}]` : formatBRL(n);
};

export const buildLimpaNomePrompt = (data: LimpaNomeData): string => {
  const protocolo = clean(data.protocolo);
  const tentativaAdministrativa = protocolo
    ? ` O Autor tentou resolver administrativamente através do protocolo nº ${protocolo}, sem sucesso.`
    : '';
  const fatosAdicionais = clean(data.fatosAdicionais);

  return `Com o rigor técnico de um especialista em Direito do Consumidor e Direito Bancário, escreva uma petição inicial de Ação Declaratória de Inexistência de Débito cumulada com Indenização por Danos Morais e Pedido de Tutela de Urgência (Liminar para Limpa Nome).

Considere os seguintes dados do caso:
- Nome do Autor: ${orFill(data.autorNome, 'nome completo do autor')}
- Qualificação do Autor: ${orFill(data.autorQualificacao, 'estado civil, profissão, RG, CPF, endereço e e-mail do autor')}
- Nome do Réu: ${orFill(data.reuNome, 'nome da empresa ou banco')}
- Qualificação do Réu: ${orFill(data.reuQualificacao, 'CNPJ e endereço da sede do réu')}
- Detalhes da Negativação Indevida: ${orFill(data.orgao, 'órgão onde está a negativação, Serasa ou SPC')}, referente ao suposto débito de R$ ${money(data.valorDebito, 'valor do débito')}, sob o contrato nº ${orFill(data.contrato, 'número do contrato')}, com data de inclusão em ${orFill(data.dataInclusao, 'data de inclusão')}.

Fatos do caso:
O Autor foi surpreendido ao tentar realizar uma operação de crédito e ter seu pedido negado devido a uma restrição em seu CPF. Ao consultar os órgãos de proteção ao crédito, descobriu a negativação feita pelo Réu. O Autor NUNCA contratou qualquer serviço ou produto com a empresa ré, tratando-se de fraude, assinatura falsa ou erro administrativo crasso da instituição.${tentativaAdministrativa}${fatosAdicionais ? `\nFatos acrescentados pelo usuário: ${fatosAdicionais}` : ''}

A petição deve seguir a estrutura formal do CPC e conter:
1. Endereçamento: Deixe o espaço padrão para o Juízo Cível competente da comarca de ${orFill(data.cidadeUf, 'cidade/UF')}.
2. Preliminar: Requerimento de Justiça Gratuita (afirmando a hipossuficiência jurídica) e opção pela não realização da audiência de conciliação (Art. 319, VII, CPC).
3. Dos Fatos: Narrar a situação de forma clara, enfatizando o abalo ao crédito e o caráter indevido da cobrança.
4. Do Direito:
   - Aplicação do Código de Defesa do Consumidor (CDC), inversão do ônus da prova (Art. 6º, VIII) e responsabilidade objetiva da empresa (Art. 14).
   - Menção à Súmula 479 do STJ (responsabilidade por fraudes praticadas por terceiros no âmbito de operações bancárias).
   - Inexistência de relação jurídica e do débito.
   - Configuração do Dano Moral In Re Ipsa (presumido) pela negativação indevida.
5. Da Tutela de Urgência (Liminar): Demonstrar o "Fumus boni iuris" (prova da negativação e alegação de inexistência de vínculo) e o "Periculum in mora" (manutenção do nome sujo impede o acesso ao mercado, gera humilhação e restrição de crédito). Pedir a expedição de ofício ao Serasa/SPC para baixa imediata do registro em até 48 horas sob pena de multa diária (astreintes).
6. Dos Pedidos:
   - Concessão da liminar (tutela de urgência).
   - Citação do Réu.
   - Procedência total da ação para declarar a inexistência do débito.
   - Condenação do Réu ao pagamento de indenização por danos morais no valor de R$ ${money(data.valorDanoMoral, 'valor pretendido de dano moral')}.
   - Condenação em custas e honorários advocatícios de sucumbência.
7. Valor da Causa: ${valorDaCausa(data)}.

Utilize uma linguagem formal, técnica e rigorosa do ponto de vista jurídico, sem jargões excessivos ou prolixidade. Use a jurisprudência brasileira atualizada, observando as regras de citação das instruções (só cite julgados com todos os dados completos e verificáveis; na dúvida, descreva o entendimento e registre o ponto em "Observações").
Os dados entre colchetes [PREENCHER: ...] não foram informados: mantenha-os assim na peça, sem inventar.`;
};
