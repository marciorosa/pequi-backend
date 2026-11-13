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
  /** Súmula 385 do STJ: 'nao' | 'sim' (outra negativação legítima) | 'contestada' | 'nao_sei' */
  negativacaoAnterior?: string;
  /** 'jec' (Juizado Especial Cível) | 'vara' | 'nao_sei' */
  via?: string;
};

// Acima disso o pedido de dano moral é tratado como não informado (Relatório 4: evitar pedidos desproporcionais)
export const DANO_MORAL_MAXIMO = 50000;

type Anterior = 'nao' | 'sim' | 'contestada' | 'nao_sei';
type Via = 'jec' | 'vara' | 'nao_sei';
const anteriorDe = (v: unknown): Anterior => (['nao', 'sim', 'contestada'].includes(String(v)) ? (String(v) as Anterior) : 'nao_sei');
const viaDe = (v: unknown): Via => (['jec', 'vara'].includes(String(v)) ? (String(v) as Via) : 'nao_sei');

/** Dano moral pedido, ou null quando não cabe (Súmula 385) ou o valor é desproporcional. */
const danoMoralDe = (data: LimpaNomeData): number | null => {
  if (anteriorDe(data.negativacaoAnterior) === 'sim') return null;
  const n = parseBRL(data.valorDanoMoral);
  return n !== null && n > 0 && n <= DANO_MORAL_MAXIMO ? n : null;
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
  if (anteriorDe(data.negativacaoAnterior) === 'sim') {
    return debito === null
      ? 'R$ [PREENCHER: valor do débito a ser declarado inexistente]'
      : `R$ ${formatBRL(debito)} (valor do débito impugnado)`;
  }
  const dano = danoMoralDe(data);
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
  const anterior = anteriorDe(data.negativacaoAnterior);
  const via = viaDe(data.via);
  const jec = via === 'jec';
  const comDanoMoral = anterior !== 'sim';
  const danoInformado = parseBRL(data.valorDanoMoral);
  const danoValor = danoMoralDe(data);
  const danoTexto = danoValor !== null
    ? formatBRL(danoValor)
    : `[PREENCHER: valor pretendido de dano moral${danoInformado !== null && danoInformado > DANO_MORAL_MAXIMO ? ' (o valor informado parecia desproporcional)' : ''}]`;

  const situacaoAnterior: Record<Anterior, string> = {
    nao: 'O Autor informou que não possui nenhuma outra inscrição em cadastros de proteção ao crédito além desta.',
    sim: 'O Autor informou que já possuía outra inscrição legítima anterior em cadastro de proteção ao crédito. Por isso, conforme a Súmula 385 do STJ (da anotação irregular não cabe indenização por dano moral quando preexiste inscrição legítima, ressalvado o direito ao cancelamento), a petição NÃO pede indenização por danos morais: pede apenas a declaração de inexistência do débito e o cancelamento da anotação, com a tutela de urgência.',
    contestada: 'O Autor informou que há outras inscrições em seu nome, mas que também são indevidas e estão sendo ou serão contestadas. A petição pede o dano moral e deve sustentar que as demais anotações não são legítimas, de modo que não se aplica a Súmula 385 do STJ.',
    nao_sei: 'O Autor não informou se havia outra inscrição anterior em cadastro de proteção ao crédito.',
  };

  const endereco = jec
    ? `Ao Juizado Especial Cível da comarca de ${orFill(data.cidadeUf, 'cidade/UF')} (rito da Lei 9.099/1995).`
    : `Ao Juízo da Vara Cível competente da comarca de ${orFill(data.cidadeUf, 'cidade/UF')}.`;

  const preliminar = jec
    ? '2. Preliminar: não há custas no primeiro grau do Juizado (art. 54 da Lei 9.099/1995); não peça justiça gratuita nem dispensa de audiência, porque a conciliação é etapa própria do Juizado.'
    : '2. Preliminar: Requerimento de Justiça Gratuita (afirmando a hipossuficiência jurídica) e opção pela não realização da audiência de conciliação (Art. 319, VII, CPC).';

  const direito = [
    '   - Aplicação do Código de Defesa do Consumidor (CDC), inversão do ônus da prova (Art. 6º, VIII) e responsabilidade objetiva da empresa (Art. 14).',
    '   - Menção à Súmula 479 do STJ (responsabilidade por fraudes praticadas por terceiros no âmbito de operações bancárias), somente se o réu for instituição financeira.',
    '   - Inexistência de relação jurídica e do débito.',
    comDanoMoral ? '   - Configuração do dano moral in re ipsa pela negativação indevida.' : '',
  ].filter(Boolean).join('\n');

  const pedidos = [
    '   - Concessão da liminar (tutela de urgência).',
    jec ? '   - Citação do Réu e intimação para a audiência de conciliação.' : '   - Citação do Réu.',
    '   - Procedência da ação para declarar a inexistência do débito e determinar o cancelamento definitivo da anotação.',
    comDanoMoral ? `   - Condenação do Réu ao pagamento de indenização por danos morais no valor de R$ ${danoTexto}.` : '',
    jec ? '' : '   - Condenação em custas e honorários advocatícios de sucumbência.',
  ].filter(Boolean).join('\n');

  const assinatura = jec
    ? 'Fecho com local, data e assinatura do Autor; acrescente linha para advogado, observando que no Juizado a assistência por advogado é obrigatória em causas acima de 20 salários mínimos.'
    : 'Fecho com local, data e espaço de assinatura do advogado: [PREENCHER: nome do advogado], OAB/[PREENCHER: UF] nº [PREENCHER].';

  const observacoes = [
    '- O aviso de que a minuta deve ser revisada por advogado inscrito na OAB antes do protocolo.',
    anterior === 'nao_sei'
      ? '- Que o usuário confirme se havia outra negativação legítima anterior: pela Súmula 385 do STJ, se houver, não cabe dano moral, e o pedido deve ser retirado.'
      : anterior === 'contestada'
        ? '- Que a existência de outras anotações pode levar o réu a invocar a Súmula 385 do STJ; convém juntar a prova de que também são indevidas.'
        : '',
    via === 'nao_sei'
      ? '- Que, para causas de até 40 salários mínimos, o Juizado Especial Cível pode ser a via mais simples (sem custas no primeiro grau e, até 20 salários mínimos, sem exigência de advogado); a peça foi redigida para a Vara Cível.'
      : jec
        ? '- Que o Juizado só aceita causas de até 40 salários mínimos e que, acima de 20 salários mínimos, exige advogado.'
        : '',
    '- Os documentos a juntar: comprovante da negativação (consulta ao órgão), documento de identidade e comprovante de residência, e o protocolo de reclamação, se houver.',
  ].filter(Boolean).join('\n');

  const estrutura = `Situação de negativações anteriores: ${situacaoAnterior[anterior]}

A petição deve seguir a estrutura formal ${jec ? 'do rito da Lei 9.099/1995 (Juizado Especial Cível)' : 'do CPC'} e conter:
1. Endereçamento: ${endereco}
${preliminar}
3. Dos Fatos: Narrar a situação de forma clara, enfatizando o abalo ao crédito e o caráter indevido da cobrança.
4. Do Direito:
${direito}
5. Da Tutela de Urgência (Liminar): Demonstrar a probabilidade do direito (prova da negativação e alegação de inexistência de vínculo) e o perigo de dano (a manutenção do nome negativado impede o acesso ao crédito). Pedir a expedição de ofício ao órgão de proteção ao crédito para baixa do registro, sob pena de multa diária.
6. Dos Pedidos:
${pedidos}`;

  const fim = `8. ${assinatura}

Depois da peça, inclua a seção "Observações (não integram a peça)" com:
${observacoes}`;

  return `Com o rigor técnico de um especialista em Direito do Consumidor e Direito Bancário, escreva uma petição inicial de Ação Declaratória de Inexistência de Débito${comDanoMoral ? ' cumulada com Indenização por Danos Morais' : ''} e Pedido de Tutela de Urgência (Liminar para Limpa Nome)${jec ? ', para o Juizado Especial Cível' : ''}.

Considere os seguintes dados do caso:
- Nome do Autor: ${orFill(data.autorNome, 'nome completo do autor')}
- Qualificação do Autor: ${orFill(data.autorQualificacao, 'estado civil, profissão, RG, CPF, endereço e e-mail do autor')}
- Nome do Réu: ${orFill(data.reuNome, 'nome da empresa ou banco')}
- Qualificação do Réu: ${orFill(data.reuQualificacao, 'CNPJ e endereço da sede do réu')}
- Detalhes da Negativação Indevida: ${orFill(data.orgao, 'órgão onde está a negativação, Serasa ou SPC')}, referente ao suposto débito de R$ ${money(data.valorDebito, 'valor do débito')}, sob o contrato nº ${orFill(data.contrato, 'número do contrato')}, com data de inclusão em ${orFill(data.dataInclusao, 'data de inclusão')}.

Fatos do caso:
O Autor foi surpreendido ao tentar realizar uma operação de crédito e ter seu pedido negado devido a uma restrição em seu CPF. Ao consultar os órgãos de proteção ao crédito, descobriu a negativação feita pelo Réu. O Autor NUNCA contratou qualquer serviço ou produto com a empresa ré, tratando-se de fraude, assinatura falsa ou erro administrativo crasso da instituição.${tentativaAdministrativa}${fatosAdicionais ? `\nFatos acrescentados pelo usuário: ${fatosAdicionais}` : ''}

${estrutura}
7. Valor da Causa: ${valorDaCausa(data)}.
${fim}

Utilize uma linguagem formal, técnica e rigorosa do ponto de vista jurídico, sem jargões excessivos ou prolixidade. Use a jurisprudência brasileira atualizada, observando as regras de citação das instruções (só cite julgados com todos os dados completos e verificáveis; na dúvida, descreva o entendimento e registre o ponto em "Observações").
Os dados entre colchetes [PREENCHER: ...] não foram informados: mantenha-os assim na peça, sem inventar.`;
};
