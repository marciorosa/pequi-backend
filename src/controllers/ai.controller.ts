import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import geminiService from '../services/gemini.service';

// Generate AI assistant response
export const generateAssistantResponse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { prompt, context } = req.body;
    
    if (!prompt) {
      res.status(400).json({ message: 'O prompt é obrigatório' });
      return;
    }
    
    const aiResponse = await geminiService.generateLegalResponse(prompt, context);
    
    // Process the response to ensure proper structure
    const formattedResponse = formatLegalResponse(aiResponse);
    
    // Generate contextual suggestions based on the query and response
    const suggestions = generateContextualSuggestions(prompt, aiResponse);
    
    res.json({
      success: true,
      response: {
        text: formattedResponse,
        suggestions
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao gerar a resposta da IA', error: (error as Error).message });
  }
};

// Analyze document
export const analyzeDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { document, options } = req.body;
    
    if (!document) {
      res.status(400).json({ message: 'O conteúdo do documento é obrigatório' });
      return;
    }

    // Extract options
    const lawyerId = options?.lawyerId;
    const fileType = options?.fileType;
    const mimeType = options?.mimeType || 
      (fileType === 'pdf' ? 'application/pdf' : 'image/jpeg');
    
    // Custom prompt based on lawyer ID if available
    let customPrompt = '';
    if (lawyerId) {
      customPrompt = `As a specialized ${lawyerId.replace('-', ' ')} lawyer, analyze this ${fileType}. `;
    }
    
    // Add formatting instructions to the prompt
    customPrompt += ' Format your response with clear headings, bold for important terms, and use bullet points or numbered lists for clarity. Always structure your response using HTML-compatible formatting.';
    
    // Call the Gemini service for document analysis
    const analysisResult = await geminiService.analyzeDocument(
      document,
      mimeType,
      lawyerId,
      customPrompt
    );
    
    // Return the formatted analysis
    res.json({
      success: true,
      text: analysisResult
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao analisar o documento', 
      error: (error as Error).message,
      text: `Erro: ${(error as Error).message}. Tente novamente com outro documento.`
    });
  }
};

// Search legal database
export const searchLegalDatabase = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = req.query.query as string;
    const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;
    
    if (!query) {
      res.status(400).json({ message: 'O termo de pesquisa é obrigatório' });
      return;
    }
    
    const enhancedSearch = await geminiService.aiEnhancedLegalSearch(query, filters);
    
    // Process the enhanced query to preserve formatting while removing markdown
    const processedEnhancedQuery = enhancedSearch.enhancedQuery;
    
    // In a real application, you would use the enhanced query to search your database
    // Mock search results with better formatting
    const searchResults = [
      {
        id: "case-001",
        title: "Smith v. Johnson",
        type: "Jurisprudência",
        year: 2020,
        relevance: 0.95,
        summary: "Caso paradigmático que estabeleceu precedente para a interpretação de contratos por IA.",
        formattedContent: "Neste caso decisivo, o tribunal decidiu que interpretações contratuais geradas por IA podem ser admitidas como prova quando certos critérios de confiabilidade são atendidos."
      },
      {
        id: "reg-042",
        title: "Regulamento de Proteção de Dados 42",
        type: "Regulamento",
        year: 2022,
        relevance: 0.87,
        summary: "Regulamento que disciplina o uso de IA em processos judiciais.",
        formattedContent: "Seção 3.1: sistemas de IA usados em processos judiciais devem manter trilha de auditoria de todas as decisões e oferecer mecanismos de explicabilidade."
      },
      {
        id: "article-103",
        title: "Ética da IA na Prática Jurídica",
        type: "Artigo",
        year: 2023,
        relevance: 0.82,
        summary: "Artigo acadêmico sobre considerações éticas da IA no Direito.",
        formattedContent: "O artigo explora três áreas principais: mitigação de vieses, requisitos de transparência e manutenção da supervisão humana em aplicações jurídicas de IA de alto impacto."
      }
    ];
    
    res.json({
      success: true,
      query,
      enhancedQuery: processedEnhancedQuery,
      followUpPrompts: enhancedSearch.followUpPrompts || [],
      results: searchResults
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao pesquisar a base jurídica', error: (error as Error).message });
  }
};

// Chat with AI assistant
export const chatWithAssistant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, languageLevel, useWebSearch, context, chatHistory } = req.body;
    
    // Log the request for debugging
    
    // Generate response through the Gemini service
    // The service now handles errors internally and returns error messages as strings
    const response = await geminiService.generateChatResponse(message, { 
      languageLevel, 
      useWebSearch, 
      context,
      chatHistory
    });
    
    // Check if response appears to be an error message (service now returns user-friendly errors)
    const isErrorResponse = response.includes("I apologize, but I encountered a technical issue") || 
                           response.includes("Sorry, I'm having trouble processing your request") ||
                           response.includes("Desculpe, ocorreu um problema técnico") ||
                           response.includes("Desculpe, estou com dificuldade para processar sua solicitação");
    
    // If it's an error message, still return 200 with the friendly message for the user to see
    res.status(200).json({
      text: response, // Keep 'text' for backward compatibility
      message: response, // Add 'message' for new format
      isError: isErrorResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    
    // In case the service threw an error instead of returning a string
    let errorMessage = 'Falha ao gerar a resposta';
    
    if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      text: `Desculpe, ocorreu um problema técnico ao processar sua solicitação. Tente novamente mais tarde.`, // Keep 'text' for backward compatibility
      message: `Desculpe, ocorreu um problema técnico ao processar sua solicitação. Tente novamente mais tarde.`, // Add 'message' for new format
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
};

// Helper functions for parsing the AI response
function extractBulletPoints(text: string): string[] {
  if (!text) return [];
  
  // Look for bullet points, numbered lists, or line breaks
  const points = text.split(/•|\n-|\n\d+\.|\n/).map(point => point.trim()).filter(Boolean);
  
  return points.length > 0 ? points : [text];
}

function extractRiskFactors(text: string): Array<{ level: string, description: string }> {
  if (!text) return [];
  
  const riskLevels = ['high', 'medium', 'low'];
  const risks = extractBulletPoints(text);
  
  return risks.map(risk => {
    // Try to determine risk level from the text
    const level = riskLevels.find(level => risk.toLowerCase().includes(level)) || 'medium';
    
    // Remove the risk level text from the description if found
    const description = risk.replace(new RegExp(`(${riskLevels.join('|')})`, 'i'), '').trim();
    
    return {
      level,
      description: description || risk
    };
  });
}

/**
 * Utility function to clean and format markdown text for better display
 * @param text The text containing markdown to clean
 * @returns Cleaned and formatted text
 */
function cleanMarkdownFormatting(text: string): string {
  if (!text) return '';

  return text
    // Handle headings
    .replace(/^#+\s+(.*)$/gm, '$1')
    // Remove bold
    .replace(/\*\*(.*?)\*\*/g, '$1')
    // Remove italic
    .replace(/\*(.*?)\*/g, '$1')
    // Remove bullet points
    .replace(/^\s*[-*+]\s+/gm, '')
    // Remove numbered lists while preserving the text
    .replace(/^\s*\d+\.\s+/gm, '')
    // Remove code blocks
    .replace(/```.*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove links but keep the text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Convert multiple newlines to a single one
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Formats a legal response to ensure proper structure and readability
 * @param text The raw response text
 * @returns Formatted legal response
 */
function formatLegalResponse(text: string): string {
  if (!text) return '';

  // First clean any markdown formatting
  let processed = cleanMarkdownFormatting(text);
  
  // For search enhanced queries, preserve the formatting but ensure section headers stand out
  if (processed.includes('Main Legal Concepts Involved:')) {
    // Process section by section to preserve formatting
    const sections = [
      'Main Legal Concepts Involved:',
      'Relevant Legal Terminology:',
      'Key Legal Principles or Doctrines:',
      'Suggested Jurisdictions or Areas of Law to Focus On:',
      'Potential Precedent Cases:'
    ];
    
    // Keep the formatted structure exactly as it came from the model
    return processed;
  }
  
  // For general legal responses
  // Ensure numbered points are preserved and properly spaced
  processed = processed.replace(/(\d+)\.\s+/g, '\n$1. ');
  
  // Ensure clean paragraph breaks with proper spacing
  processed = processed.replace(/\n{3,}/g, '\n\n');
  
  // Ensure the response starts clean
  processed = processed.trim();
  
  return processed;
}

/**
 * Generate contextual suggestions based on the query and response
 * @param query The user's query
 * @param response The AI-generated response
 * @returns Array of contextual suggestions
 */
function generateContextualSuggestions(query: string, response: string): string[] {
  // Extract legal terms and concepts from the query and response
  const legalTerms = extractLegalTerms(query, response);
  
  // Generate suggestions based on the query type and detected legal terms
  const suggestions: string[] = [];
  
  if (query.toLowerCase().includes('contract') || response.toLowerCase().includes('contract') || query.toLowerCase().includes('contrato') || response.toLowerCase().includes('contrato')) {
    suggestions.push('Quer ver um modelo para este tipo de contrato?');
  }
  
  if (query.toLowerCase().includes('case') || response.toLowerCase().includes('case law') || query.toLowerCase().includes('caso') || response.toLowerCase().includes('jurisprud')) {
    suggestions.push('Quer que eu encontre precedentes relevantes sobre esta questão?');
  }
  
  if (response.toLowerCase().includes('statute') || response.toLowerCase().includes('regulation') || response.toLowerCase().includes('lei ') || response.toLowerCase().includes('regulament')) {
    suggestions.push('Quer que eu explique as normas específicas aplicáveis a este caso?');
  }
  
  // Add some default suggestions if we don't have enough context-specific ones
  if (suggestions.length < 2) {
    suggestions.push('Quer que eu explique isso com mais detalhes?');
    suggestions.push('Precisa de ajuda para redigir um documento jurídico sobre este assunto?');
  }
  
  // Always add this general suggestion
  suggestions.push('Quer fazer outra pergunta sobre esta questão jurídica?');
  
  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

/**
 * Extract legal terms and concepts from text
 * @param texts Text strings to analyze
 * @returns Array of legal terms
 */
function extractLegalTerms(...texts: string[]): string[] {
  // This is a simplified implementation - in production you would use NLP or a legal term dictionary
  const legalTermPatterns = [
    /contract/i, /tort/i, /liability/i, /statute/i, /regulation/i, 
    /plaintiff/i, /defendant/i, /jurisdiction/i, /precedent/i,
    /damages/i, /negligence/i, /breach/i, /obligation/i
  ];
  
  const terms = new Set<string>();
  
  texts.forEach(text => {
    if (!text) return;
    
    legalTermPatterns.forEach(pattern => {
      const match = text.match(pattern);
      if (match && match[0]) {
        terms.add(match[0].toLowerCase());
      }
    });
  });
  
  return Array.from(terms);
}

// Compare two documents
export const compareDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { document1, document2, options } = req.body;
    
    if (!document1 || !document2) {
      return res.status(400).json({ message: 'Os dois documentos são obrigatórios para a comparação' });
    }

    // Extract options
    const fileType1 = options?.fileType1 || 'pdf';
    const fileType2 = options?.fileType2 || 'pdf';
    const mimeType1 = options?.mimeType1 || 'application/pdf';
    const mimeType2 = options?.mimeType2 || 'application/pdf';
    const compareType = options?.compareType || 'all';
    
    // Custom prompt for document comparison
    const comparisonPrompt = `
      Compare these two documents and identify the ${compareType === 'all' ? 'differences and similarities' : 
      compareType === 'changes' ? 'all changes' : 
      compareType === 'additions' ? 'additions in the second document' : 
      'removals from the first document'}.
      
      Provide your analysis as a detailed comparison with the following sections:
      1. Summary of comparison
      2. Key differences
      3. Important similarities (if applicable)
      4. Detailed changes by section
      5. Recommendations or notable concerns
      
      Format your response with clear headings, bullet points, and numbered lists where appropriate.
    `;
    
    // Call the Gemini service for comparison (note: this will need to be implemented in gemini service)
    const comparisonResult = await geminiService.compareDocuments(
      document1,
      document2,
      mimeType1,
      mimeType2,
      comparisonPrompt
    );
    
    // Return the formatted analysis
    res.json({
      success: true,
      text: comparisonResult
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao comparar os documentos', 
      error: (error as Error).message,
      text: `Erro: ${(error as Error).message}. Tente novamente com outros documentos.`
    });
  }
};

// Create an agreement based on user inputs
export const createAgreement = async (req: AuthRequest, res: Response) => {
  try {
    const { data, options } = req.body;
    
    if (!data) {
      return res.status(400).json({ message: 'Os dados do contrato são obrigatórios' });
    }

    // Extract options
    const title = options?.title || 'Contrato Jurídico';
    const templateType = options?.templateType || 'standard';
    const specialRequirements = options?.specialRequirements || '';
    
    // Prepare the prompt for agreement creation
    let agreementPrompt = `Create a legal agreement with the following details:`;
    
    // Add specific agreement fields if they exist
    if (data.parties) agreementPrompt += `\nParties: ${data.parties}`;
    if (data.purpose) agreementPrompt += `\nPurpose: ${data.purpose}`;
    if (data.obligations) agreementPrompt += `\nObligations: ${data.obligations}`;
    if (data.consequences) agreementPrompt += `\nConsequences for Breach: ${data.consequences}`;
    if (data.dates) agreementPrompt += `\nTerm & Dates: ${data.dates}`;
    if (data.jurisdiction) agreementPrompt += `\nJurisdiction: ${data.jurisdiction}`;
    
    // Add template details and special requirements
    agreementPrompt += `\nTemplate Type: ${templateType}`;
    if (specialRequirements) agreementPrompt += `\nSpecial Requirements: ${specialRequirements}`;
    
    // Instructions for formatting the output
    agreementPrompt += `\n\nFormat the agreement with proper sections, numbered clauses, and legal terminology appropriate for this type of document. Ensure it's formatted in a professional legal style with proper headings, indentation, and clause numbering.`;
    
    // Call the Gemini service for agreement creation
    const agreementResult = await geminiService.generateLegalResponse(agreementPrompt);
    
    // Process the response to ensure proper formatting
    const formattedAgreement = await geminiService.generateChatResponse(agreementResult, {});
    
    // Return the formatted agreement
    res.json({
      success: true,
      title: title,
      text: formattedAgreement
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao criar o contrato', 
      error: (error as Error).message 
    });
  }
};

// Translate a document
export const translateDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { document, options } = req.body;
    
    if (!document) {
      return res.status(400).json({ message: 'O conteúdo do documento é obrigatório' });
    }

    // Extract options
    const sourceLanguage = options?.sourceLanguage || 'auto';
    const targetLanguage = options?.targetLanguage;
    const preserveFormatting = options?.preserveFormatting || true;
    const includeLegalGlossary = options?.includeLegalGlossary || false;
    
    if (!targetLanguage) {
      return res.status(400).json({ message: 'O idioma de destino é obrigatório' });
    }
    
    // Prepare the translation prompt
    let translationPrompt = `Translate this document from ${sourceLanguage === 'auto' ? 'its original language' : sourceLanguage} to ${targetLanguage}.`;
    
    // Add options to the prompt
    if (preserveFormatting) {
      translationPrompt += ' Preserve the original formatting, including headings, bullet points, and paragraph structure.';
    }
    
    if (includeLegalGlossary) {
      translationPrompt += ' Include precise legal terminology appropriate for the target language and legal system.';
    }
    
    // Call the Gemini service for document translation
    const mimeType = options?.mimeType || 'application/pdf';
    const translationResult = await geminiService.analyzeDocument(
      document,
      mimeType,
      undefined,
      translationPrompt
    );
    
    // Return the translated document
    res.json({
      success: true,
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguage,
      text: translationResult
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao traduzir o documento', 
      error: (error as Error).message 
    });
  }
};

// Create an advanced document with specific template and style
export const createDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { documentType, templateStyle, specialRequirements, referenceDocumentText } = req.body;
    
    if (!documentType || !templateStyle) {
      return res.status(400).json({ message: 'O tipo de documento e o estilo do modelo são obrigatórios' });
    }

    // Create a prompt for the AI to generate the document
    let prompt = `Create a professional ${documentType} using the ${templateStyle} format.`;
    
    if (specialRequirements) {
      prompt += ` Include the following special requirements: ${specialRequirements}.`;
    }
    
    if (referenceDocumentText) {
      prompt += ` Reference document for style and terminology: ${referenceDocumentText.substring(0, 1000)}...`;
    }
    
    // Add template style-specific instructions
    switch (templateStyle) {
      case 'Standard Employment Contract':
      case 'Executive Employment Agreement':
      case 'Contractor Agreement':
      case 'Internship Agreement':
      case 'Contrato de Trabalho Padrão':
      case 'Contrato de Trabalho de Executivo':
      case 'Contrato com Prestador Autônomo':
      case 'Termo de Compromisso de Estágio':
        prompt += ` Use appropriate language for a ${templateStyle.toLowerCase()}.`;
        break;
      // Add cases for other template styles with specific instructions
      case 'Standard Real Estate Lease':
      case 'Commercial Lease':
      case 'Residential Lease':
      case 'Vacation Property Lease':
      case 'Locação Imobiliária Padrão':
      case 'Locação Comercial':
      case 'Locação Residencial':
      case 'Locação para Temporada':
        prompt += ` Use appropriate language for a ${templateStyle.toLowerCase()}.`;
        break;
      // NDA templates
      case 'Standard NDA':
      case 'Mutual NDA':
      case 'Employee NDA':
      case 'Vendor NDA':
      case 'NDA Padrão':
      case 'NDA Mútuo':
      case 'NDA para Funcionários':
      case 'NDA para Fornecedores':
        prompt += ` Use appropriate language for a ${templateStyle.toLowerCase()}.`;
        break;
      // Other document types can follow a similar pattern
    }
    
    // Based on document type, add specific sections to include
    switch (documentType) {
      case 'Real Estate Lease':
      case 'Locação Imobiliária':
        prompt += ` Include sections for: PROPERTY DESCRIPTION, TERM OF TENANCY, RENTAL PAYMENT, SECURITY DEPOSIT, UTILITIES, MAINTENANCE, RULES AND REGULATIONS, TERMINATION CONDITIONS, and SIGNATURES.`;
        break;
      case 'Employment Contract':
      case 'Contrato de Trabalho':
        prompt += ` Include sections for: PARTIES, POSITION AND DUTIES, COMPENSATION, TERM AND TERMINATION, CONFIDENTIALITY, INTELLECTUAL PROPERTY, NON-COMPETE, GOVERNING LAW, and SIGNATURES.`;
        break;
      case 'Non-Disclosure Agreement':
      case 'Acordo de Confidencialidade':
        prompt += ` Include sections for: PARTIES, DEFINITION OF CONFIDENTIAL INFORMATION, OBLIGATIONS OF RECEIVING PARTY, EXCLUSIONS FROM CONFIDENTIAL INFORMATION, TERM, RETURN OF INFORMATION, REMEDIES, and SIGNATURES.`;
        break;
      case 'Service Agreement':
      case 'Contrato de Prestação de Serviços':
        prompt += ` Include sections for: PARTIES, SERVICES TO BE PROVIDED, PAYMENT TERMS, TERM AND TERMINATION, INTELLECTUAL PROPERTY, WARRANTIES, LIMITATION OF LIABILITY, INDEMNIFICATION, and SIGNATURES.`;
        break;
      case 'Partnership Agreement':
      case 'Contrato de Sociedade':
        prompt += ` Include sections for: PARTIES, FORMATION, CAPITAL CONTRIBUTIONS, PROFITS AND LOSSES, MANAGEMENT, WITHDRAWAL AND DISSOLUTION, TRANSFER OF PARTNERSHIP INTEREST, DISPUTE RESOLUTION, and SIGNATURES.`;
        break;
      case 'Sales Contract':
      case 'Contrato de Compra e Venda':
        prompt += ` Include sections for: PARTIES, DESCRIPTION OF GOODS, PURCHASE PRICE, DELIVERY, INSPECTION, WARRANTIES, RISK OF LOSS, REMEDIES FOR BREACH, GOVERNING LAW, and SIGNATURES.`;
        break;
    }
    
    // Add formatting instructions
    prompt += " Format the document with proper section numbering, indentation, and whitespace for clarity. Ensure all numbers remain on the same line as their section headers. Use ALL CAPS for section headings. Include signature blocks at the end. Use [BLANK] or [INSERT TEXT HERE] for fields that need to be filled in.";
    
    // Call the Gemini service for document creation
    const documentContent = await geminiService.generateLegalResponse(prompt);
    
    // Return the generated document
    res.json({
      success: true,
      content: documentContent,
      documentType,
      templateStyle
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error creating document', 
      error: (error as Error).message 
    });
  }
}; 