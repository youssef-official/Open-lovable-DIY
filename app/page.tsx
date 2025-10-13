'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
// Import icons from centralized module to avoid Turbopack chunk issues
import {
  FiGithub,
} from '@/lib/icons';
import { UserButton } from '@/components/UserButton';
import { useApiRequest } from '@/hooks/useApiRequest';
import { motion, AnimatePresence } from 'framer-motion';

interface SandboxData {
  sandboxId: string;
  url: string;
  [key: string]: any;
}

interface ChatMessage {
  content: string;
  type: 'user' | 'ai' | 'system' | 'file-update' | 'command' | 'error';
  timestamp: Date;
  metadata?: {
    websiteDescription?: string;
    generatedCode?: string;
    appliedFiles?: string[];
    commandType?: 'input' | 'output' | 'error' | 'success';
  };
}

type CodeApplicationState = {
  stage: 'analyzing' | 'installing' | 'applying' | 'complete' | null;
  packages?: string[];
  installedPackages?: number;
  filesGenerated?: number;
};

function AISandboxPage() {
  const { makeRequestWithBody } = useApiRequest();
  const [sandboxData, setSandboxData] = useState<SandboxData | null>(null);
  const [status, setStatus] = useState({ text: 'Not connected', active: false });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      content: 'Welcome! I can help you generate code with full context of your sandbox files and structure. Just start chatting - I\'ll automatically create a sandbox for you if needed!\n\nTip: If you see package errors like "react-router-dom not found", just type "npm install" or "check packages" to automatically install missing packages.',
      type: 'system',
      timestamp: new Date()
    }
  ]);
  const [aiChatInput, setAiChatInput] = useState('');
  const searchParams = useSearchParams();
  const router = useRouter();
  const [aiModel, setAiModel] = useState(() => {
    const modelParam = searchParams.get('model');
    return appConfig.ai.availableModels.includes(modelParam || '') ? modelParam! : appConfig.ai.defaultModel;
  });
  const [showHomeScreen, setShowHomeScreen] = useState(true);
  const [homeDescriptionInput, setHomeDescriptionInput] = useState('');
  const [activeTab, setActiveTab] = useState<'generation' | 'preview'>('preview');
  
  const [conversationContext, setConversationContext] = useState<{
    generatedComponents: Array<{ name: string; path: string; content: string }>;
    appliedCode: Array<{ files: string[]; timestamp: Date }>;
    currentProject: string;
    lastGeneratedCode?: string;
  }>({
    generatedComponents: [],
    appliedCode: [],
    currentProject: '',
    lastGeneratedCode: undefined
  });
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  
  const [codeApplicationState, setCodeApplicationState] = useState<CodeApplicationState>({
    stage: null
  });
  
  const [generationProgress, setGenerationProgress] = useState<{
    isGenerating: boolean;
    status: string;
    components: Array<{ name: string; path: string; completed: boolean }>;
    currentComponent: number;
    streamedCode: string;
    isStreaming: boolean;
    isThinking: boolean;
    thinkingText?: string;
    thinkingDuration?: number;
    currentFile?: { path: string; content: string; type: string };
    files: Array<{ path: string; content: string; type: string; completed: boolean }>;
    lastProcessedPosition: number;
    isEdit?: boolean;
  }>({
    isGenerating: false,
    status: '',
    components: [],
    currentComponent: 0,
    streamedCode: '',
    isStreaming: false,
    isThinking: false,
    files: [],
    lastProcessedPosition: 0
  });

  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      try {
        await fetch('/api/conversation-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear-old' })
        });
        console.log('[home] Cleared old conversation data on mount');
      } catch (error) {
        console.error('[ai-sandbox] Failed to clear old conversation:', error);
        if (isMounted) {
          addChatMessage('Failed to clear old conversation data.', 'error');
        }
      }
      
      if (!isMounted) return;

      const sandboxIdParam = searchParams.get('sandbox');
      
      try {
        if (sandboxIdParam) {
          console.log('[home] Attempting to restore sandbox:', sandboxIdParam);
          await createSandbox(true);
        } else {
          console.log('[home] No sandbox in URL, creating new sandbox automatically...');
          await createSandbox(true);
        }
      } catch (error) {
        console.error('[ai-sandbox] Failed to create or restore sandbox:', error);
        if (isMounted) {
          addChatMessage('Failed to create or restore sandbox.', 'error');
        }
      }
    };
    
    initializePage();

    return () => {
      isMounted = false;
    };
  }, []); 

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showHomeScreen) {
        setShowHomeScreen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHomeScreen]);
  

  useEffect(() => {
    checkSandboxStatus();
    
    const handleFocus = () => {
      checkSandboxStatus();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []); 

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);


  const updateStatus = (text: string, active: boolean) => {
    setStatus({ text, active });
  };

  const addChatMessage = (content: string, type: ChatMessage['type'], metadata?: ChatMessage['metadata']) => {
    setChatMessages(prev => {
      if (type === 'system' && prev.length > 0) {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.type === 'system' && lastMessage.content === content) {
          return prev; 
        }
      }
      return [...prev, { content, type, timestamp: new Date(), metadata }];
    });
  };
  
  const checkSandboxStatus = async () => {
    try {
      const response = await fetch('/api/sandbox-status');
      const data = await response.json();
      
      if (data.active && data.healthy && data.sandboxData) {
        setSandboxData(data.sandboxData);
        updateStatus('Sandbox active', true);
      } else if (data.active && !data.healthy) {
        updateStatus('Sandbox not responding', false);
      } else {
        setSandboxData(null);
        updateStatus('No sandbox', false);
      }
    } catch (error) {
      console.error('Failed to check sandbox status:', error);
      setSandboxData(null);
      updateStatus('Error', false);
    }
  };

  const createSandbox = async (fromHomeScreen = false) => {
    console.log('[createSandbox] Starting sandbox creation...');
    updateStatus('Creating sandbox...', false);
    
    try {
      const response = await makeRequestWithBody('/api/create-ai-sandbox', {});
      
      const data = await response.json();
      console.log('[createSandbox] Response data:', data);
      
      if (data.success) {
        setSandboxData(data);
        updateStatus('Sandbox active', true);
        
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('sandbox', data.sandboxId);
        newParams.set('model', aiModel);
        router.push(`/?${newParams.toString()}`, { scroll: false });
        
        if (!fromHomeScreen) {
          addChatMessage(`Sandbox created! ID: ${data.sandboxId}. I now have context of your sandbox and can help you build your app. Just ask me to create components and I'll automatically apply them!

Tip: I automatically detect and install npm packages from your code imports (like react-router-dom, axios, etc.)`, 'system');
        }
        
        setTimeout(() => {
          if (iframeRef.current) {
            iframeRef.current.src = data.url;
          }
        }, 100);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('[createSandbox] Error:', error);
      updateStatus('Error', false);
      addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
    }
  };

  const applyGeneratedCode = async (code: string, isEdit: boolean = false) => {
    try {
      setCodeApplicationState({ stage: 'analyzing' });
      
      const pendingPackages = ((window as any).pendingPackages || []).filter((pkg: any) => pkg && typeof pkg === 'string');
      if (pendingPackages.length > 0) {
        console.log('[applyGeneratedCode] Sending packages from tool calls:', pendingPackages);
        (window as any).pendingPackages = [];
      }
      
      const response = await fetch('/api/apply-ai-code-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          response: code,
          isEdit: isEdit,
          packages: pendingPackages,
          sandboxId: sandboxData?.sandboxId 
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to apply code: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let finalData: any = null;
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                switch (data.type) {
                  case 'start':
                    setCodeApplicationState({ stage: 'analyzing' });
                    break;
                  
                  case 'step':
                    if (data.message.includes('Installing') && data.packages) {
                      setCodeApplicationState({ 
                        stage: 'installing', 
                        packages: data.packages 
                      });
                    } else if (data.message.includes('Creating files') || data.message.includes('Applying')) {
                      setCodeApplicationState({
                        stage: 'applying',
                        filesGenerated: data.filesCreated || 0
                      });
                    }
                    break;
                  
                  case 'package-progress':
                    if (data.installedPackages) {
                      setCodeApplicationState(prev => ({ 
                        ...prev,
                        installedPackages: data.installedPackages 
                      }));
                    }
                    break;
                  
                  case 'success':
                    if (data.installedPackages) {
                      setCodeApplicationState(prev => ({ 
                        ...prev,
                        installedPackages: data.installedPackages 
                      }));
                    }
                    break;
                  
                  case 'complete':
                    finalData = data;
                    setCodeApplicationState({ stage: 'complete' });
                    setTimeout(() => {
                      setCodeApplicationState({ stage: null });
                    }, 3000);
                    break;
                  
                  case 'error':
                    addChatMessage(`Error: ${data.message || data.error || 'Unknown error'}`, 'system');
                    break;
                  
                  case 'info':
                    if (data.message) {
                      addChatMessage(data.message, 'system');
                    }
                    break;
                }
              } catch (e) {
                // Ignore
              }
            }
          }
        }
      }
      
      if (finalData && finalData.type === 'complete') {
        const data = {
          success: true,
          results: finalData.results,
          explanation: finalData.explanation,
          structure: finalData.structure,
          message: finalData.message
        };
        
        if (data.success) {
          const { results } = data;
        
          if (results.filesCreated?.length > 0) {
            addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system', {
              appliedFiles: results.filesCreated
            });
          }
          
          if (iframeRef.current && sandboxData?.url) {
            const iframe = iframeRef.current;
            const url = sandboxData.url;
            const packagesInstalled = results?.packagesInstalled?.length > 0;
            const refreshDelay = packagesInstalled ? 5000 : 2000; // Example delays
            
            setTimeout(() => {
              iframe.src = `${url}?t=${Date.now()}`;
            }, refreshDelay);
          }
        }
      }
    } catch (error: any) {
      addChatMessage(`Error applying code: ${error.message}`, 'system');
    }
  };

  const sendChatMessage = async () => {
    if (!aiChatInput.trim() || !sandboxData) return;

    const message = aiChatInput.trim();
    setAiChatInput('');
    addChatMessage(message, 'user');

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          model: aiModel,
          conversationContext,
          sandboxId: sandboxData.sandboxId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        addChatMessage(data.response, 'ai');
        
        setConversationContext(data.updatedContext || conversationContext);
        
        if (data.generatedCode) {
          await applyGeneratedCode(data.generatedCode);
        }
      } else {
        addChatMessage(data.error || 'Failed to get AI response', 'error');
      }
    } catch (error) {
      addChatMessage('Error communicating with AI', 'error');
    }
  };

  const handleHomeScreenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeDescriptionInput.trim()) return;

    setShowHomeScreen(false);
    
    await createSandbox(true);
    
    addChatMessage(homeDescriptionInput, 'user', { websiteDescription: homeDescriptionInput });
    
    await sendChatMessage();
  };

  const downloadZip = async () => {
    if (!sandboxData) return;

    try {
      const response = await fetch('/api/download-zip');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sandbox.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error('Failed to download zip:', error);
    }
  };

  const reapplyLastGeneration = () => {
    if (conversationContext.lastGeneratedCode) {
      applyGeneratedCode(conversationContext.lastGeneratedCode);
    }
  };

  const renderMainContent = () => {
    if (activeTab === 'preview') {
      return (
        <div className="h-full relative">
          <iframe 
            ref={iframeRef}
            src={sandboxData?.url || 'about:blank'}
            className="w-full h-full border-0 rounded-lg shadow-2xl"
            title="Sandbox Preview"
          />
        </div>
      );
    } else {
      return (
        <div className="h-full overflow-auto p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow-inner">
          <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={{ borderRadius: '0.75rem' }}>
            {generationProgress.streamedCode || 'No code generated yet'}
          </SyntaxHighlighter>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 flex flex-col overflow-hidden">
      <AnimatePresence>
        {showHomeScreen && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden flex flex-col px-4 py-6"
          >
            <div className="flex items-center justify-between z-20">
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-2"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-pink-600 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-xl">❤️</span>
                </div>
                <span className="text-white font-bold text-2xl tracking-tight">Lovable</span>
              </motion.div>
              <motion.div 
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center gap-4"
              >
                <UserButton />
                <a
                  href="https://github.com/zainulabedeen123/Open-lovable-DIY.git"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-full text-base font-semibold border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:border-white/30 min-w-[140px] justify-center shadow-md"
                >
                  <FiGithub className="w-5 h-5" />
                  <span>GitHub</span>
                </a>
              </motion.div>
            </div>
            
            <div className="relative z-10 h-full flex items-center justify-center px-4">
              <div className="text-center max-w-4xl mx-auto">
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="text-center"
                >
                  <h1 className="text-6xl md:text-8xl text-white font-extrabold tracking-tighter leading-none px-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 animate-gradient-x">
                    Build something lovable
                  </h1>
                  <p className="text-xl md:text-2xl max-w-3xl mx-auto mt-8 text-white/80 font-medium px-4">
                    Create stunning apps and websites by chatting with AI - Global Edition
                  </p>
                  <p className="text-base max-w-xl mx-auto mt-4 text-white/60 px-4">
                    Powered by advanced AI • Open source • Available worldwide
                  </p>
                </motion.div>
                
                <motion.form 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                  onSubmit={handleHomeScreenSubmit} 
                  className="mt-12 max-w-3xl mx-auto px-4"
                >
                  <div className="w-full relative group">
                    <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 overflow-hidden shadow-2xl transition-all duration-300 group-hover:border-white/40 group-focus-within:border-white/50 group-focus-within:shadow-[0_0_40px_rgba(255,255,255,0.15)]">
                      <input
                        type="text"
                        value={homeDescriptionInput}
                        onChange={(e) => setHomeDescriptionInput(e.target.value)}
                        placeholder="Build something lovable"
                        className="h-16 w-full bg-transparent text-white placeholder-white/50 px-6 pr-16 focus:outline-none text-lg font-medium transition-all duration-200 focus:placeholder-white/30"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!homeDescriptionInput.trim()}
                        className="absolute top-1/2 right-4 -translate-y-1/2 w-12 h-12 bg-gradient-to-br from-indigo-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400 disabled:bg-gray-600 rounded-full flex items-center justify-center transition-all duration-300 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl hover:scale-105 disabled:scale-100 disabled:shadow-none disabled:opacity-70"
                        title="Create with AI"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                          <path d="M5 12h14M12 5l7 7-7 7"></path>
                        </svg>
                      </button>
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-3xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 -z-10 animate-pulse-slow" />
                  </div>

                  <div className="mt-8 flex flex-wrap justify-center gap-3 px-4">
                    {[
                      "A sleek portfolio website",
                      "E-commerce store with AI recommendations",
                      "Interactive social dashboard",
                      "Advanced task management app"
                    ].map((example, index) => (
                      <motion.button
                        key={example}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 + index * 0.1 }}
                        onClick={() => setHomeDescriptionInput(example)}
                        className="px-5 py-2.5 text-sm text-white/80 bg-white/5 backdrop-blur-md border border-white/10 rounded-full hover:bg-white/10 hover:text-white transition-all duration-300 hover:scale-105 hover:shadow-md"
                      >
                        {example}
                      </motion.button>
                    ))}
                  </div>
                </motion.form>
                
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.8, duration: 0.6 }}
                  className="mt-12 flex flex-col items-center justify-center px-4"
                >
                  <div className="text-white/60 text-sm mb-3 font-medium">Powered by</div>
                  <select
                    value={aiModel}
                    onChange={(e) => {
                      const newModel = e.target.value;
                      setAiModel(newModel);
                      const params = new URLSearchParams(searchParams);
                      params.set('model', newModel);
                      if (sandboxData?.sandboxId) {
                        params.set('sandbox', sandboxData.sandboxId);
                      }
                      router.push(`/?${params.toString()}`);
                    }}
                    className="px-8 py-3 text-base bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-white/30 transition-all duration-300 hover:bg-white/15 cursor-pointer shadow-md hover:shadow-lg"
                  >
                    {appConfig.ai.availableModels.map(model => (
                      <option key={model} value={model} className="bg-indigo-900 text-white">
                        {(appConfig.ai.modelDisplayNames as any)[model] || model}
                      </option>
                    ))}
                  </select>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {!showHomeScreen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col h-screen"
        >
          <div className="bg-gradient-to-r from-indigo-800 to-pink-800 px-6 py-4 flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-pink-600 rounded-full flex items-center justify-center shadow-md">
                  <span className="text-white font-bold text-xl">❤️</span>
                </div>
                <span className="text-white font-bold text-2xl tracking-tight">Lovable Global</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <UserButton />
              <select
                value={aiModel}
                onChange={(e) => {
                  const newModel = e.target.value;
                  setAiModel(newModel);
                  const params = new URLSearchParams(searchParams);
                  params.set('model', newModel);
                  if (sandboxData?.sandboxId) {
                    params.set('sandbox', sandboxData.sandboxId);
                  }
                  router.push(`/?${params.toString()}`);
                }}
                className="px-4 py-2 text-sm bg-white/10 border border-white/20 text-white rounded-full focus:outline-none focus:ring-2 focus:ring-white/30 transition-all duration-300 hover:bg-white/20"
              >
                {appConfig.ai.availableModels.map(model => (
                  <option key={model} value={model}>
                    {(appConfig.ai.modelDisplayNames as any)[model] || model}
                  </option>
                ))}
              </select>
              <Button 
                onClick={() => createSandbox()}
                size="sm"
                title="Create new sandbox"
                className="bg-indigo-600 text-white hover:bg-indigo-500 rounded-full px-4"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </Button>
              <Button 
                onClick={reapplyLastGeneration}
                size="sm"
                title="Re-apply last generation"
                disabled={!conversationContext.lastGeneratedCode || !sandboxData}
                className="bg-purple-600 text-white hover:bg-purple-500 rounded-full px-4"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
              <Button 
                onClick={downloadZip}
                disabled={!sandboxData}
                size="sm"
                title="Download your Vite app as ZIP"
                className="bg-pink-600 text-white hover:bg-pink-500 rounded-full px-4"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </Button>
              <div className="inline-flex items-center gap-2 bg-white/10 text-white px-4 py-2 rounded-full text-sm font-medium shadow-md">
                <span id="status-text">{status.text}</span>
                <div className={`w-3 h-3 rounded-full ${status.active ? 'bg-green-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'}`} />
              </div>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
            <div className="flex-1 max-w-[450px] flex flex-col border-r border-indigo-200/50 bg-white/30 backdrop-blur-sm shadow-inner">
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-purple-300 scrollbar-track-transparent" ref={chatMessagesRef}>
                <AnimatePresence>
                  {chatMessages.map((msg, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-md ${
                        msg.type === 'user' ? 'bg-indigo-100 text-indigo-900' :
                        msg.type === 'ai' ? 'bg-purple-100 text-purple-900' :
                        msg.type === 'system' ? 'bg-pink-100 text-pink-900' :
                        msg.type === 'command' ? 'bg-gray-100 text-gray-900 font-mono' :
                        msg.type === 'error' ? 'bg-red-100 text-red-900 border border-red-300' :
                        'bg-white text-gray-900'
                      }`}>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="p-6 border-t border-indigo-200/50 bg-white/20 backdrop-blur-md">
                <div className="relative">
                  <Textarea
                    className="min-h-[80px] pr-14 resize-none border-2 border-indigo-300 focus:border-indigo-500 focus:outline-none bg-white/50 backdrop-blur-sm rounded-2xl text-lg"
                    placeholder="Type your message..."
                    value={aiChatInput}
                    onChange={(e) => setAiChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    rows={2}
                  />
                  <button
                    onClick={sendChatMessage}
                    className="absolute right-4 bottom-4 p-3 bg-gradient-to-br from-indigo-500 to-pink-500 text-white rounded-full hover:scale-110 transition-all duration-300 shadow-lg hover:shadow-xl"
                    title="Send message"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-3 bg-white/20 backdrop-blur-md border-b border-indigo-200/50 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex bg-white/10 rounded-full p-1 shadow-md">
                    <button
                      onClick={() => setActiveTab('generation')}
                      className={`px-5 py-2 rounded-full transition-all duration-300 ${
                        activeTab === 'generation' 
                          ? 'bg-white text-indigo-900 font-medium shadow-inner' 
                          : 'text-white hover:text-indigo-200'
                      }`}
                      title="Code Generation"
                    >
                      Code
                    </button>
                    <button
                      onClick={() => setActiveTab('preview')}
                      className={`px-5 py-2 rounded-full transition-all duration-300 ${
                        activeTab === 'preview' 
                          ? 'bg-white text-indigo-900 font-medium shadow-inner' 
                          : 'text-white hover:text-indigo-200'
                      }`}
                      title="Live Preview"
                    >
                      Preview
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  {sandboxData && (
                    <a 
                      href={sandboxData.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all duration-300 shadow-md"
                      title="Open in new tab"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
              <div className="flex-1 relative overflow-hidden p-4 bg-white/10 backdrop-blur-sm">
                {renderMainContent()}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-100 to-pink-100 text-indigo-900 font-bold text-2xl">Loading Lovable...</div>}>
      <AISandboxPage />
    </Suspense>
  );
}