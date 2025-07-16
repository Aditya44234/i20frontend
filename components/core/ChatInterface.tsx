
import { Part } from '@google/genai';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Cog6ToothIcon, PaperAirplaneIcon, SparklesIcon, UserCircleIcon } from '../../assets/icons';
import { useAuth } from '../../contexts/AuthContext';
import { streamChatResponse } from '../../services/geminiService';
import { ChatMessage, GroundingChunk, UserRole } from '../../types';
import { Button } from '../shared/Button';
import { InfoTooltip } from '../shared/InfoTooltip';
import { TextAreaInput } from '../shared/TextAreaInput';

interface ChatInterfaceProps {
  systemInstruction?: string;
  initialMessages?: ChatMessage[];
  onNewAIMessage?: (message: ChatMessage) => void;
  placeholder?: string;
  allowRawPromptEdit?: boolean; 
  showThinkingConfig?: boolean; 
  className?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  systemInstruction,
  initialMessages = [],
  onNewAIMessage,
  placeholder = "Ask AI anything...",
  allowRawPromptEdit = false,
  showThinkingConfig = true, 
  className = ""
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();

  const [currentSystemInstruction, setCurrentSystemInstruction] = useState(systemInstruction);
  const [useThinking, setUseThinking] = useState(true); 

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    setCurrentSystemInstruction(systemInstruction);
  }, [systemInstruction]);


  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: input,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    const historyForAI: Part[] = messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model', 
        parts: [{ text: msg.text }]
    }));
    
    let aiResponseText = "";
    let aiResponseGroundingChunks: GroundingChunk[] = [];
    const aiMessageId = `msg_ai_${Date.now()}`;

    const aiPlaceholderMessage: ChatMessage = {
        id: aiMessageId,
        sender: 'ai',
        text: '',
        timestamp: new Date(),
        metadata: { isLoading: true }
    };
    setMessages(prev => [...prev, aiPlaceholderMessage]);

    await streamChatResponse(
      historyForAI,
      userMessage.text,
      (chunkText, isFinal, groundingChunks) => { 
        aiResponseText += chunkText;
        if (groundingChunks && groundingChunks.length > 0) {
            aiResponseGroundingChunks = [...aiResponseGroundingChunks, ...groundingChunks];
        }
        
        setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
            ? { ...msg, text: aiResponseText, metadata: { ...msg.metadata, isLoading: !isFinal, groundingChunks: aiResponseGroundingChunks } } 
            : msg
        ));

        if (isFinal) {
          setIsLoading(false);
          const finalAIMessage: ChatMessage = {
            id: aiMessageId, 
            sender: 'ai',
            text: aiResponseText,
            timestamp: new Date(),
            metadata: { groundingChunks: aiResponseGroundingChunks }
          };
          if (onNewAIMessage) {
            onNewAIMessage(finalAIMessage);
          }
        }
      },
      (err) => { 
        setError(err);
        setIsLoading(false);
        setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
            ? { ...msg, text: `Error: ${err}`, sender: 'system', metadata: { ...msg.metadata, isLoading: false, isError: true } } 
            : msg
        ));
      },
      { 
        systemInstruction: currentSystemInstruction,
        useThinking: useThinking 
      }
    );
  }, [input, messages, currentSystemInstruction, onNewAIMessage, useThinking]);

  const canEditSettings = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.RESEARCHER || allowRawPromptEdit;

  return (
    <div className={`flex flex-col h-[500px] max-h-[70vh] bg-white shadow-xl rounded-lg border border-gray-200 ${className}`}>
      {canEditSettings && (
        <div className="p-3 border-b border-gray-200 bg-gray-50 space-y-2">
           {allowRawPromptEdit && (
            <div>
              <label htmlFor="systemInstruction" className="text-xs font-medium text-gray-600 block mb-1">System Instruction (Advanced):</label>
              <TextAreaInput
                id="systemInstruction"
                value={currentSystemInstruction || ''}
                onChange={(e) => setCurrentSystemInstruction(e.target.value)}
                rows={2}
                className="text-xs"
                placeholder="e.g., You are a helpful clinical research assistant."
              />
            </div>
           )}
           {showThinkingConfig && (
            <div className="flex items-center space-x-2">
                <input 
                    type="checkbox" 
                    id="thinkingToggle" 
                    checked={useThinking} 
                    onChange={(e) => setUseThinking(e.target.checked)}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 bg-white"
                />
                <label htmlFor="thinkingToggle" className="text-xs font-medium text-gray-700">
                    Enable AI Thinking 
                </label>
                {/* model: "models/gemini-1.5-flash"
 */}
                <InfoTooltip text="Higher Quality/Slower for gemini-1.5-flash. Disable for low latency needs like game AI." position="right"/>
            </div>
           )}
        </div>
      )}
      <div className="flex-grow p-4 space-y-4 overflow-y-auto">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] p-3 rounded-xl shadow ${
              msg.sender === 'user' 
                ? 'bg-primary-500 text-white rounded-br-none' 
                : msg.sender === 'ai'
                ? 'bg-gray-200 text-gray-800 rounded-bl-none'
                : 'bg-red-100 text-red-700 rounded-bl-none' 
            }`}>
              <div className="flex items-start space-x-2 mb-1">
                {msg.sender === 'ai' && <SparklesIcon className="h-5 w-5 text-primary-500 flex-shrink-0" />}
                {msg.sender === 'user' && <UserCircleIcon className="h-5 w-5 text-primary-100 flex-shrink-0" />}
                {msg.sender === 'system' && <Cog6ToothIcon className="h-5 w-5 text-red-500 flex-shrink-0" />}
                <p className="text-xs font-semibold">
                  {msg.sender === 'user' ? (currentUser?.name || 'You') : msg.sender === 'ai' ? 'AI Assistant' : 'System'}
                </p>
              </div>
              <p className="text-sm whitespace-pre-wrap">{msg.text}
                {msg.metadata?.isLoading && <span className="italic text-xs"> (typing...)</span>}
              </p>
              {msg.metadata?.groundingChunks && (msg.metadata.groundingChunks as GroundingChunk[]).length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-300">
                  <p className="text-xs font-semibold mb-1">Sources:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {(msg.metadata.groundingChunks as GroundingChunk[]).map((chunk, idx) => (
                      (chunk.web || chunk.retrievedContext) && (
                        <li key={idx} className="text-xs">
                          <a 
                            href={chunk.web?.uri || chunk.retrievedContext?.uri} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {chunk.web?.title || chunk.retrievedContext?.title || chunk.web?.uri || chunk.retrievedContext?.uri}
                          </a>
                        </li>
                      )
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {error && <p className="p-2 text-xs text-red-600 text-center">{error}</p>}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-start space-x-2">
          <TextAreaInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={placeholder}
            rows={2}
            className="flex-grow resize-none"
            disabled={isLoading}
          />
          <Button onClick={handleSend} isLoading={isLoading} disabled={!input.trim()} className="h-full" variant="primary">
            <PaperAirplaneIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};