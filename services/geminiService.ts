
import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { GEMINI_TEXT_MODEL } from '../constants';
import { GeminiResponse, GroundingChunk } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY environment variable is not set. Gemini API calls will fail.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_API_KEY" });

export const generateText = async (
  prompt: string,
  systemInstruction?: string,
  useThinking: boolean = true, // Default to enabled thinking for higher quality
  useGoogleSearch: boolean = false
): Promise<GeminiResponse> => {
  if (!API_KEY) {
    return { text: "Error: API_KEY is not configured.", error: "API_KEY not configured" };
  }
  try {
    const config: any = {};
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (GEMINI_TEXT_MODEL === 'models/gemini-1.5-flash') { // Only apply thinkingConfig to compatible models
        config.thinkingConfig = { thinkingBudget: useThinking ? undefined : 0 }; // undefined enables thinking, 0 disables
    }

    if (useGoogleSearch) {
      config.tools = [{ googleSearch: {} }];
      // IMPORTANT: Do not set responseMimeType to application/json when using googleSearch
    } else {
      // Only set responseMimeType if not using googleSearch, if needed
      // config.responseMimeType = "text/plain"; // Or application/json if expecting structured output
    }
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
      config: Object.keys(config).length > 0 ? config : undefined,
    });

    const groundingChunks: GroundingChunk[] = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(chunk => ({
        web: chunk.web ? { uri: chunk.web.uri, title: chunk.web.title } : undefined,
        retrievedContext: chunk.retrievedContext ? { uri: chunk.retrievedContext.uri, title: chunk.retrievedContext.title } : undefined,
    })) || [];
    
    return { text: response.text, groundingChunks };
  } catch (error) {
    console.error("Gemini API call failed:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred with the Gemini API.";
    return { text: `Error generating text: ${errorMessage}`, error: errorMessage };
  }
};

export const generateTextWithRAG = async (
  prompt: string,
  knowledgeBaseContent: string,
  systemInstruction?: string
): Promise<GeminiResponse> => {
  const combinedPrompt = `Context from knowledge base:
---
${knowledgeBaseContent}
---
User query: ${prompt}`;
  return generateText(combinedPrompt, systemInstruction);
};

export const generateJsonOutput = async <T,>(
  prompt: string,
  systemInstruction?: string
): Promise<{ data?: T; error?: string; rawText?: string }> => {
  if (!API_KEY) {
    return { error: "API_KEY is not configured." };
  }
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      },
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    try {
      const parsedData = JSON.parse(jsonStr) as T;
      return { data: parsedData, rawText: response.text };
    } catch (e) {
      console.error("Failed to parse JSON response:", e, "Raw text:", response.text);
      return { error: "Failed to parse AI JSON response.", rawText: response.text };
    }
  } catch (error) {
    console.error("Gemini API call for JSON failed:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred with the Gemini API.";
    return { error: errorMessage };
  }
};

export const streamChatResponse = async (
  chatHistory: Part[],
  newMessage: string,
  onChunk: (chunkText: string, isFinal: boolean, groundingChunks?: GroundingChunk[]) => void,
  onError: (error: string) => void,
  options?: {
    systemInstruction?: string;
    useThinking?: boolean;
  }
) => {
  if (!API_KEY) {
    onError("API_KEY is not configured.");
    return;
  }
  
  const contents = [...chatHistory, { role: "user", parts: [{text: newMessage}] }];

  try {
    const genAIConfig: any = {}; 
    if (options?.systemInstruction) {
      genAIConfig.systemInstruction = options.systemInstruction;
    }

    if (GEMINI_TEXT_MODEL === 'gemini-2.5-flash-preview-04-17') {
      // If options.useThinking is explicitly provided, use its value.
      // Otherwise, default to thinking enabled (budget undefined).
      if (options?.hasOwnProperty('useThinking')) {
        genAIConfig.thinkingConfig = { thinkingBudget: options.useThinking ? undefined : 0 };
      } else {
        genAIConfig.thinkingConfig = { thinkingBudget: undefined }; // Default to thinking enabled
      }
    }
    
    const stream = await ai.models.generateContentStream({
        model: GEMINI_TEXT_MODEL,
        contents: contents as any, 
        config: Object.keys(genAIConfig).length > 0 ? genAIConfig : undefined,
    });

    let fullResponseText = "";
    for await (const chunk of stream) {
      fullResponseText += chunk.text;
      const groundingChunks: GroundingChunk[] = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(c => ({
        web: c.web ? { uri: c.web.uri, title: c.web.title } : undefined,
        retrievedContext: c.retrievedContext ? { uri: c.retrievedContext.uri, title: c.retrievedContext.title } : undefined,
      })) || [];
      onChunk(chunk.text, false, groundingChunks); 
    }
    onChunk("", true); // Signal end of stream
  } catch (error) {
    console.error("Gemini streaming chat failed:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during streaming.";
    onError(errorMessage);
  }
};
