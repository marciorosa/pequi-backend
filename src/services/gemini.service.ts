import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content, Part, InlineDataPart } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Initialize the Gemini API
const apiKey = process.env.GEMINI_API_KEY;

// A missing key must not take the whole API down (login, vault, etc.); only AI calls will fail
if (!apiKey) {
  console.error('[startup] GEMINI_API_KEY não definida: os recursos de IA vão falhar até que ela seja configurada.');
}

const genAI = new GoogleGenerativeAI(apiKey || '');
const fileManager = new GoogleAIFileManager(apiKey || '');

// Create a system prompt that fine-tunes Gemini for legal assistance
const legalSystemPrompt = '';

// Response language for Brazilian users
const PT_BR_INSTRUCTION = 'LANGUAGE: Unless the task explicitly asks for a different output language (for example, a translation into another language), write the entire response in Brazilian Portuguese (pt-BR).';

// Configure safety settings
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// Get the gemini-2.0-flash model
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  safetySettings,
});

/**
 * Generate a legal response using Gemini AI
 * @param prompt User's legal question or request
 * @param context Additional context (previous conversation, document content, etc.)
 * @returns The AI-generated response
 */
export const generateLegalResponse = async (prompt: string, context?: any): Promise<string> => {
  try {
    // Create a chat session with no system prompting
    const chat = model.startChat({
      history: [],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 2048,
      },
    });

    // Prepare the prompt with context if available
    let fullPrompt = prompt;
    if (context) {
      if (typeof context === 'string') {
        fullPrompt = `Context: ${context}\n\n${prompt}`;
      } else if (typeof context === 'object') {
        const contextString = JSON.stringify(context);
        fullPrompt = `Context: ${contextString}\n\n${prompt}`;
      }
    }

    fullPrompt += `\n\n${PT_BR_INSTRUCTION}`;

    // Generate response
    const result = await chat.sendMessage(fullPrompt);
    const response = result.response;
    return response.text();
  } catch (error) {
    throw new Error('Falha ao gerar a resposta do modelo de IA');
  }
};

/**
 * Analyze a legal document using Gemini AI
 * @param documentContent The content of the document to analyze
 * @param options Optional parameters for analysis (focus areas, specific questions)
 * @returns Document analysis results
 */
export const analyzeLegalDocument = async (documentContent: string, options?: any): Promise<any> => {
  try {
    const documentAnalysisPrompt = `
    ${options?.focus ? `${options.focus}\n\n` : ''}
    ${documentContent}

    ${PT_BR_INSTRUCTION}
    `;

    const result = await model.generateContent(documentAnalysisPrompt);
    const response = result.response;

    // Parse the response and structure it
    const analysisText = response.text();

    // Return a structured analysis (in a real app, you'd parse the text more thoroughly)
    return {
      fullAnalysis: analysisText,
      // In a production environment, you would implement more sophisticated
      // parsing to extract specific sections from the response
    };
  } catch (error) {
    throw new Error('Falha ao analisar o documento com o modelo de IA');
  }
};

/**
 * Search legal database with AI assistance
 * @param query The search query
 * @param filters Optional filters for the search
 * @returns Enhanced search results with AI insights
 */
export const aiEnhancedLegalSearch = async (query: string, filters?: Record<string, any>): Promise<any> => {
  try {
    // Construct a prompt for concise, scannable results
    const searchEnhancementPrompt = `
    ${query}
    ${filters ? `\nFilters: ${JSON.stringify(filters)}` : ''}
    
    You are a world-class legal expert with comprehensive knowledge of global legal systems, principles, and precedents. Your expertise spans common law, civil law, international law, and specialized legal domains.
    
    Provide a concise, authoritative analysis of this legal query in exactly this format:
    
    1. Start with a clear title (3-6 words) that captures the key legal concept. Do NOT use asterisks or stars.
    
    2. Write a 1-4 sentence introduction that summarizes the query
    
    3. Present exactly 5 to 7 key legal points as a numbered list (1-7), where each point:
       - Has a meaningful heading followed by a colon
       - Includes a 3 to 4 lines of explanation after each heading
       - Focuses on the most important legal principles relevant to the query
       - Uses precise legal terminology while remaining accessible
       - IMPORTANT: Do NOT use any asterisks (*) or markdown formatting in your response
    
    FORMATTING INSTRUCTION: DO NOT use any markdown syntax (no stars/asterisks, no hashes, no underscores) in your response.

    ${PT_BR_INSTRUCTION}
    `;

    // Set generation config for consistent responses
    const generationConfig = {
      temperature: 0.2, // Lower temperature for more consistent formatting
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 1000, // Shorter to encourage conciseness
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: searchEnhancementPrompt }] }],
      generationConfig,
    });

    const response = result.response;
    const responseText = response.text();

    // Format the response with HTML tags
    const formattedResponse = processResponseForDisplay(responseText);

    // Generate follow-up prompts based on the original query and response
    const followUpPrompts = await generateFollowUpPrompts(query, responseText);

    return {
      enhancedQuery: formattedResponse,
      originalQuery: query,
      followUpPrompts: followUpPrompts
    };
  } catch (error) {
    throw new Error('Falha ao aprimorar a pesquisa com o modelo de IA');
  }
};

/**
 * Generate follow-up prompts based on the original query and response
 * @param originalQuery The user's original query
 * @param responseText The AI's response to the original query
 * @returns An array of follow-up prompts
 */
async function generateFollowUpPrompts(originalQuery: string, responseText: string): Promise<string[]> {
  try {
    const followUpPrompt = `
    Original Query: ${originalQuery}
    
    Based on this query and your response, generate exactly 3 follow-up questions that a user might want to explore next.
    
    Requirements:
    1. Each follow-up should be directly related to the original topic but explore a different aspect or go deeper
    2. Each should be phrased as a complete question (with a question mark)
    3. Keep each follow-up between 5-10 words for quick readability
    4. Make them specific enough to generate a detailed response
    5. Format your response as a simple list of 3 questions, one per line, numbered 1-3
    
    For example:
    1. How does [topic] apply in California?
    2. What are recent changes to [topic]?
    3. How does [topic] differ internationally?

    ${PT_BR_INSTRUCTION}
    `;

    const generationConfig = {
      temperature: 0.7, // Higher temperature for more creative follow-ups
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 256, // Short responses only needed
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: followUpPrompt }] }],
      generationConfig,
    });

    const followUpResponse = result.response.text();

    // Extract and clean the follow-up questions
    const followUps = followUpResponse
      .split('\n')
      .filter(line => /^\d+\./.test(line.trim())) // Only keep numbered lines
      .map(line => line.replace(/^\d+\.\s*/, '').trim()) // Remove the number prefix
      .filter(line => line.length > 0); // Filter out empty lines

    // Ensure we have exactly 3 follow-ups; if not, return default ones
    if (followUps.length !== 3) {
      return [
        `Como isso se aplica em diferentes jurisdições?`,
        `Quais são os casos paradigmáticos recentes sobre o tema?`,
        `Quais cuidados práticos devem ser observados?`
      ];
    }

    return followUps;
  } catch (error) {
    // Return default follow-up prompts in case of error
    return [
      `Como isso se aplica em diferentes jurisdições?`,
      `Quais são os casos paradigmáticos recentes sobre o tema?`,
      `Quais cuidados práticos devem ser observados?`
    ];
  }
}

// Helper function to process the response text for display
function processResponseForDisplay(text: string): string {
  // Convert markdown to HTML
  let processedText = text
    // Convert markdown bold (**text**) to HTML bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Convert markdown italic (*text*) to HTML italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Split the text by lines and process
  const lines = processedText.split('\n');
  let formattedHtml = '';
  let paragraphContent = '';
  let inPoint = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Process title (lines starting with # or headline-like text)
    if (line.startsWith('#') || (i === 0 && line.length < 60)) {
      const titleText = line.startsWith('#') ? line.substring(1).trim() : line;
      // Remove any remaining ** from the title
      const cleanTitle = titleText.replace(/\*\*/g, '');
      formattedHtml += `<h2 class="text-xl font-semibold mb-4">${cleanTitle}</h2>\n`;
    }
    // Process numbered points (e.g., "1. Something:")
    else if (/^\d+\.\s+.+:/.test(line)) {
      // If we were in a paragraph, add it
      if (paragraphContent) {
        formattedHtml += `<p class="mb-4">${paragraphContent}</p>\n`;
        paragraphContent = '';
      }

      // If we were already in a point, close the previous one
      if (inPoint) {
        formattedHtml += `</div>\n`;
      }

      // Extract the number and the heading
      const match = line.match(/^(\d+)\.\s+(.+?):/);
      if (match) {
        const number = match[1];
        let heading = match[2];

        // Remove any remaining ** from the heading
        heading = heading.replace(/\*\*/g, '');

        // Get the content that follows the colon on the same line
        const contentAfterColon = line.split(':').slice(1).join(':').trim();

        formattedHtml += `<div class="mb-4">
  <h3 class="text-md font-medium flex items-start">
    <span class="mr-2">${number}.</span>
    <span class="font-semibold">${heading}:</span>
  </h3>`;

        // If there's content after the colon on the same line, add it
        if (contentAfterColon) {
          formattedHtml += `\n  <p class="mt-1 pl-6">${contentAfterColon}</p>\n`;
          inPoint = true;
        } else {
          // Look ahead to the next line for content
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++; // Skip empty lines

          if (j < lines.length && !lines[j].trim().match(/^\d+\./)) {
            formattedHtml += `\n  <p class="mt-1 pl-6">${lines[j].trim()}</p>\n`;
            i = j; // Skip the line we just processed
            inPoint = true;
          } else {
            // No content found, add an empty paragraph to maintain structure
            formattedHtml += `\n  <p class="mt-1 pl-6">&nbsp;</p>\n`;
            inPoint = true;
          }
        }
      }
    }
    // Regular paragraphs (likely the introduction)
    else if (!inPoint) {
      paragraphContent += (paragraphContent ? ' ' : '') + line;
    }
    // Content that might belong to a point but on a new line
    else if (inPoint && !line.match(/^\d+\./)) {
      // Append to the last paragraph in the current point
      formattedHtml = formattedHtml.replace('</div>\n', `<p class="mt-1 pl-6">${line}</p>\n</div>\n`);
    }
  }

  // Add any remaining paragraph content
  if (paragraphContent) {
    formattedHtml += `<p class="mb-4">${paragraphContent}</p>\n`;
  }

  // Close any open point
  if (inPoint) {
    formattedHtml += `</div>\n`;
  }

  return formattedHtml;
}

/**
 * Advanced response formatter that converts AI output into premium structured HTML.
 * Handles markdown-to-html conversion, paragraph wrapping, and semantic structure detection.
 */
export function formatResponseToHTML(text: string): string {
  if (!text) return '';

  let cleaned = text
    // 1. Clean up AI metadata and markers
    .replace(/^```html\s*/i, '')
    .replace(/^<html>[\s\S]*?<body>/i, '')
    .replace(/^`html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    // Remove self-references and disclaimers
    .replace(/As an AI (lawyer|legal assistant|specializing in|with expertise in)[^.]*\./gi, '')
    .replace(/I'm an AI (lawyer|legal assistant|specializing in|with expertise in)[^.]*\./gi, '')
    .replace(/I am an AI (lawyer|legal assistant|specializing in|with expertise in)[^.]*\./gi, '')
    .replace(/As a language model[^.]*\./gi, '')
    .replace(/Please note that this is not legal advice\./gi, '')
    .trim();

  // 2. Initial Markdown-style Processing
  cleaned = cleaned
    // Bold: **text** or __text__
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_ (excluding within tags)
    .replace(/(?<![A-Za-z0-9])\*([^*]+)\*(?![A-Za-z0-9])/g, '<em>$1</em>')
    .replace(/(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/g, '<em>$1</em>');

  // 3. Line-by-Line Structural Analysis
  const lines = cleaned.split('\n');
  let finalHtml = '';
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      finalHtml += `<p class="mb-4">${paragraphBuffer.join(' ')}</p>\n`;
      paragraphBuffer = [];
    }
  };

  const closeList = () => {
    if (inList && listType) {
      finalHtml += `</${listType}>\n`;
      inList = false;
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    // A. Detect Explicit Markdown Headings (#)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length + 1; // # -> h2, ## -> h3...
      finalHtml += `<h${level} class="text-xl font-bold mt-8 mb-4">${headingMatch[2]}</h${level}>\n`;
      continue;
    }

    // B. Detect List Items (Unordered: -, *, •)
    const ulMatch = line.match(/^[\-\*•]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (!inList || listType !== 'ul') {
        closeList();
        finalHtml += '<ul class="list-disc pl-6 mb-4 space-y-2">\n';
        inList = true;
        listType = 'ul';
      }
      finalHtml += `  <li>${ulMatch[1]}</li>\n`;
      continue;
    }

    // C. Detect List Items (Ordered: 1., a.)
    const olMatch = line.match(/^(\d+\.|[a-z]\.)\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (!inList || listType !== 'ol') {
        closeList();
        finalHtml += '<ol class="list-decimal pl-6 mb-4 space-y-2">\n';
        inList = true;
        listType = 'ol';
      }
      finalHtml += `  <li>${olMatch[2]}</li>\n`;
      continue;
    }

    // D. Detect "Implied" Headings (Short lines, title-case, often ending with a colon)
    // Rules: Short line (< 50 chars), not in a list, maybe ending in ':'
    const isTitleCase = line.split(' ').every(word => 
      word.length === 0 || word[0] === word[0].toUpperCase() || /^(a|an|the|of|for|in|on|at|with|o|as|os|e|de|da|do|das|dos|em|na|no|nas|nos|para|com|por|ou)$/i.test(word)
    );
    
    if (line.length < 50 && line.length > 3 && !inList && (line.endsWith(':') || (isTitleCase && i < lines.length - 1 && lines[i+1].trim() !== ''))) {
      flushParagraph();
      const cleanLine = line.replace(/:$/, '');
      finalHtml += `<h3 class="text-lg font-bold mt-6 mb-3">${cleanLine}</h3>\n`;
      continue;
    }

    // E. Regular Content
    paragraphBuffer.push(line);
  }

  // Clear buffers
  flushParagraph();
  closeList();

  return finalHtml;
}

// Update the generateChatResponse function to properly handle multimedia content
export const generateChatResponse = async (
  prompt: string,
  options: {
    languageLevel?: 'professional' | 'regular' | 'simple',
    useWebSearch?: boolean,
    context?: {
      inlineData?: {
        data: string;
        mimeType: string;
      }
    },
    chatHistory?: Array<{ role: string, content: string }>
  }
): Promise<string> => {
  try {
    // Prepare chat history
    const history: Array<Content> = [];

    if (options.chatHistory && options.chatHistory.length > 0) {
      try {
        // Gemini requires first message to be from 'user'
        // First, properly map roles to Gemini expected format
        const mappedHistory = options.chatHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model', // Gemini expects 'model', not 'assistant'
          content: msg.content || '',
          originalRole: msg.role // Keep the original role for debugging
        }));

        // Verify if first message is from 'user', otherwise reorder or insert a dummy user message
        if (mappedHistory.length > 0 && mappedHistory[0].role !== 'user') {

          // Find the first user message
          const firstUserIndex = mappedHistory.findIndex(msg => msg.role === 'user');

          if (firstUserIndex > 0) {
            // If we found a user message, reorder to put it first
            const userMsg = mappedHistory[firstUserIndex];
            mappedHistory.splice(firstUserIndex, 1);
            mappedHistory.unshift(userMsg);
          } else {
            // If no user message found, insert a small context message
            mappedHistory.unshift({
              role: 'user',
              content: prompt ? prompt : 'Start of conversation',
              originalRole: 'user'
            });
          }
        }

        // Now construct the actual history for Gemini
        for (let i = 0; i < mappedHistory.length; i++) {
          // Skip adding pairs if they would make the history invalid
          // Gemini requires alternating user/model messages
          if (i > 0 && mappedHistory[i].role === mappedHistory[i - 1].role) {
            continue;
          }

          history.push({
            role: mappedHistory[i].role,
            parts: [{ text: mappedHistory[i].content }]
          });
        }

        // Log chat history for debugging
      } catch (historyError) {
        // Continue without history if there's an error
      }
    }

    // Create a chat session with history
    // Only use history if it's properly formatted
    let chat;
    try {
      chat = model.startChat({
        history: history.length > 0 ? history : undefined,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 64,
          maxOutputTokens: 2048,
        },
      });
    } catch (chatError) {
      // Fallback to starting chat without history
      chat = model.startChat({
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 64,
          maxOutputTokens: 2048,
        },
      });
    }

    // Prepare parts for the message
    const parts: Part[] = [];

    // Add text content if present
    if (prompt && prompt.trim() !== '') {
      parts.push({ text: prompt });
    }

    // Add file data if present
    if (options.context?.inlineData) {
      try {
        const { data, mimeType } = options.context.inlineData;

        // Validate data and mimeType before adding
        if (data && mimeType) {
          // Add inline data part
          const inlineData: InlineDataPart = {
            inlineData: {
              data,
              mimeType
            }
          };
          parts.push(inlineData);
        }
      } catch (dataError) {
        // Continue without the inline data
      }
    }

    // Only proceed if we have parts to send
    if (parts.length === 0) {
      // Use a fallback prompt instead of throwing an error
      parts.push({ text: "Please assist with my legal question." });
    }

    // Add language level instruction if specified
    let languageInstruction = '';
    if (options.languageLevel) {
      switch (options.languageLevel) {
        case 'professional':
          languageInstruction = 'Please respond in a professional legal tone with appropriate legal terminology.';
          break;
        case 'regular':
          languageInstruction = 'Please respond in a balanced tone, using some legal terms but explaining them clearly.';
          break;
        case 'simple':
          languageInstruction = 'Please respond in simple, plain language avoiding complex legal terminology.';
          break;
      }

      // Prepend language instruction if there's a text part
      if (parts.length > 0 && 'text' in parts[0]) {
        parts[0].text = `${languageInstruction} ${parts[0].text}`;
      } else {
        // Add as first part if no text part exists
        parts.unshift({ text: languageInstruction });
      }
    }

    // Add web search instruction if enabled
    if (options.useWebSearch) {
      const webSearchNote = 'Please include recent legal developments and cite sources when possible.';

      // Append to first text part or add as new part
      if (parts.length > 0 && 'text' in parts[0]) {
        parts[0].text = `${parts[0].text} ${webSearchNote}`;
      } else {
        parts.unshift({ text: webSearchNote });
      }
    }

    // Always answer in Brazilian Portuguese
    if (parts.length > 0 && 'text' in parts[0]) {
      parts[0].text = `${parts[0].text}\n\n${PT_BR_INSTRUCTION}`;
    } else {
      parts.push({ text: PT_BR_INSTRUCTION });
    }

    // Send message to model

    // Try to send the message with a timeout
    let result;
    try {
      result = await Promise.race([
        chat.sendMessage(parts),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout after 30 seconds')), 30000)
        )
      ]) as any;

      const response = result.response;

      // Process the text to convert markdown-like syntax to HTML
      let formattedResponse = formatResponseToHTML(response.text());

      return formattedResponse;
    } catch (apiError: any) {
      // Return a friendly error message
      return "Desculpe, ocorreu um problema técnico ao gerar a resposta. Tente fazer sua pergunta novamente ou entre em contato com o suporte se o problema continuar.";
    }
  } catch (error: any) {
    return "Desculpe, estou com dificuldade para processar sua solicitação no momento. Tente novamente mais tarde.";
  }
};

/**
 * Analyze a document (PDF or image) using Gemini AI's multimodal capabilities
 * @param fileData Base64 encoded file data
 * @param mimeType MIME type of the file (e.g., 'application/pdf', 'image/jpeg')
 * @param lawyerId Optional ID of the lawyer type to use for specialized analysis
 * @param prompt Optional custom prompt to guide the analysis
 * @returns Document analysis results as formatted HTML
 */
export const analyzeDocument = async (
  fileData: string,
  mimeType: string,
  lawyerId?: string,
  prompt?: string
): Promise<string> => {
  try {
    // Use gemini-2.0-flash for faster processing
    const multimodalModel = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      safetySettings,
    });

    // Prepare the base prompt based on file type
    let analysisPrompt = prompt || '';
    if (!analysisPrompt) {
      if (mimeType === 'application/pdf') {
        analysisPrompt = `Analyze this PDF document. Provide a comprehensive summary of its content, highlighting key information, legal implications, and any important details. Structure your response with clear headings and bullet points for better readability.`;
      } else if (mimeType.startsWith('image/')) {
        analysisPrompt = `Analyze this image. Identify and describe any legal documents, contracts, or relevant information visible in the image. Provide a detailed explanation of what you see and any legal implications. Structure your response with clear headings and bullet points for better readability.`;
      }
    }

    // Add specialty focus if lawyer ID is provided
    if (lawyerId) {
      const specialtyPrompts: Record<string, string> = {
        'criminal': 'Focus on identifying any criminal law matters, potential charges, defenses, and procedural issues.',
        'civil': 'Focus on civil law aspects, including torts, contracts, and property rights.',
        'family': 'Focus on family law matters, including custody, support, and divorce proceedings.',
        'corporate': 'Focus on business law aspects, including corporate governance, contracts, and compliance.',
        'real-estate': 'Focus on property law, including titles, leases, and zoning issues.',
        'intellectual-property': 'Focus on IP rights, including patents, trademarks, and copyrights.',
        'immigration': 'Focus on immigration law matters, including visas, citizenship, and deportation issues.',
        'tax': 'Focus on tax law aspects, including deductions, credits, and compliance.',
        'employment': 'Focus on labor law, including employment contracts, discrimination, and workplace rights.',
        'healthcare': 'Focus on healthcare law, including HIPAA compliance, medical malpractice, and healthcare regulations.',
        'cybersecurity': 'Focus on data security issues, privacy concerns, and compliance with regulations.',
        'entertainment': 'Focus on contract terms, IP rights, royalty structures, and entertainment law matters.',
      };

      if (specialtyPrompts[lawyerId]) {
        analysisPrompt += ` ${specialtyPrompts[lawyerId]}`;
      }
    }

    // Create the message parts with the inline data and prompt
    const messageParts: Part[] = [
      {
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      },
      { text: `${analysisPrompt}\n\n${PT_BR_INSTRUCTION}` }
    ];

    // Set a timeout for the API call
    const timeout = 30000; // 30 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Document analysis timed out')), timeout);
    });

    // Generate content with the file and prompt
    const resultPromise = multimodalModel.generateContent({
      contents: [{ role: "user", parts: messageParts }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });

    // Race between the API call and the timeout
    const result = await Promise.race([resultPromise, timeoutPromise]) as { response: { text: () => string } };
    const response = result.response;
    const analysisText = response.text();

    // Process the response for better formatting
    return formatResponseToHTML(analysisText);
  } catch (error: any) {
    if (error.message === 'Document analysis timed out') {
      throw new Error('A análise do documento demorou demais. Tente com um documento menor ou entre em contato com o suporte.');
    }
    throw new Error('Falha ao analisar o documento: ' + error.message);
  }
};

/**
 * Compare two documents and identify differences
 * @param document1 Base64 encoded document 1
 * @param document2 Base64 encoded document 2
 * @param mimeType1 MIME type of document 1
 * @param mimeType2 MIME type of document 2
 * @param prompt Custom comparison prompt
 * @returns Comparison analysis as formatted HTML
 */
export const compareDocuments = async (
  document1: string,
  document2: string,
  mimeType1: string,
  mimeType2: string,
  prompt: string
): Promise<string> => {
  try {
    // Get the multimodal capable model (gemini-2.0-flash)
    const multimodalModel = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      safetySettings,
    });

    // Create the message parts with the inline data and prompt
    const messageParts: Part[] = [
      {
        inlineData: {
          data: document1,
          mimeType: mimeType1
        }
      },
      {
        inlineData: {
          data: document2,
          mimeType: mimeType2
        }
      },
      { text: `${prompt}\n\n${PT_BR_INSTRUCTION}` }
    ];

    // Generate content with both files and the comparison prompt
    const result = await multimodalModel.generateContent({
      contents: [{ role: "user", parts: messageParts }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4096, // More tokens for detailed comparison
      },
    });

    const response = result.response;
    const comparisonText = response.text();

    // Process the response for better formatting
    return formatResponseToHTML(comparisonText);
  } catch (error: any) {
    throw new Error('Falha ao comparar os documentos: ' + error.message);
  }
};

/**
 * Generate content based on an uploaded file (PDF)
 * @param prompt Focus for the AI
 * @param fileBuffer The file content as a Buffer
 * @param fileName Name of the file
 * @param mimeType Mime type of the file
 */
export const generateContentWithFile = async (
  prompt: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string = 'application/pdf'
): Promise<string> => {
  try {
    // 1. Save buffer to temporary file for upload
    const tempPath = path.join(__dirname, `../../temp_${Date.now()}_${fileName}`);
    fs.writeFileSync(tempPath, fileBuffer);


    // 2. Upload to Google AI File API
    const uploadResult = await fileManager.uploadFile(tempPath, {
      mimeType,
      displayName: fileName,
    });

    const file = uploadResult.file;

    // 3. Cleanup temp file
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    // 4. Wait for processing if needed
    let getFile = await fileManager.getFile(file.name);
    while (getFile.state === 'PROCESSING') {
      process.stdout.write('.');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getFile = await fileManager.getFile(file.name);
    }

    if (getFile.state === 'FAILED') {
      throw new Error('Falha no processamento do arquivo pelo Google AI');
    }


    // 5. Generate content with the file URI
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: getFile.mimeType,
          fileUri: getFile.uri,
        },
      },
      { text: `${prompt}\n\nPlease respond in professional legal HTML format (headings, bullet points, bolding).\n\n${PT_BR_INSTRUCTION}` },
    ]);

    const resText = result.response.text();
    return formatResponseToHTML(resText);
  } catch (error: any) {
    throw new Error('Falha ao processar o documento com IA: ' + error.message);
  }
};

export default {
  generateLegalResponse,
  analyzeLegalDocument,
  aiEnhancedLegalSearch,
  generateChatResponse,
  analyzeDocument,
  compareDocuments,
  generateContentWithFile,
  formatResponseToHTML,
};
