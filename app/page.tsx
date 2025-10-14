'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ✅ Import icons from centralized module to avoid Turbopack chunk issues
import {
  FiFile,
  FiChevronRight,
  FiChevronDown,
  FiGithub,
  BsFolderFill,
  BsFolder2Open,
  SiJavascript,
  SiReact,
  SiCss3,
  SiJson,
  FaSun,    // Day Mode Icon
  FaMoon    // Night Mode Icon
} from '@/lib/icons';

import { UserButton } from '@/components/UserButton';
import { useApiRequest } from '@/hooks/useApiRequest';
import { motion } from 'framer-motion';
import CodeApplicationProgress, { type CodeApplicationState } from '@/components/CodeApplicationProgress';



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

function AISandboxPage() {
  const { makeRequest, makeRequestWithBody, hasRequiredKeys } = useApiRequest();
  const [sandboxData, setSandboxData] = useState<SandboxData | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: 'Not connected', active: false });
  const [responseArea, setResponseArea] = useState<string[]>([]);
  const [structureContent, setStructureContent] = useState('No sandbox created yet');
  const [promptInput, setPromptInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      content: 'Welcome! I can help you generate code with full context of your sandbox files and structure. Just start chatting - I\'ll automatically create a sandbox for you if needed!\n\nTip: If you see package errors like "react-router-dom not found", just type "npm install" or "check packages" to automatically install missing packages.',
      type: 'system',
      timestamp: new Date()
    }
  ]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiEnabled] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [aiModel, setAiModel] = useState(() => {
    const modelParam = searchParams.get('model');
    return appConfig.ai.availableModels.includes(modelParam || '') ? modelParam! : appConfig.ai.defaultModel;
  });
  const [showHomeScreen, setShowHomeScreen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['app', 'src', 'src/components']));
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [homeScreenFading, setHomeScreenFading] = useState(false);
  const [homeDescriptionInput, setHomeDescriptionInput] = useState('');
  const [activeTab, setActiveTab] = useState<'generation' | 'preview'>('preview');
  const [showLoadingBackground, setShowLoadingBackground] = useState(false);
  const [loadingStage, setLoadingStage] = useState<'planning' | 'generating' | null>(null);
  const [sandboxFiles, setSandboxFiles] = useState<Record<string, string>>({});
  const [fileStructure, setFileStructure] = useState<string>('');
  
  const [conversationContext, setConversationContext] = useState<{
    generatedComponents: Array<{ name: string; path: string;
    content: string }>;
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
  const codeDisplayRef = useRef<HTMLDivElement>(null);
  const [codeApplicationState, setCodeApplicationState] = useState<CodeApplicationState>({
    stage: null
  });
  const [generationProgress, setGenerationProgress] = useState<{
    isGenerating: boolean;
    status: string;
    components: Array<{ name: string; path: string;
    completed: boolean }>;
    currentComponent: number;
    streamedCode: string;
    isStreaming: boolean;
    isThinking: boolean;
    thinkingText?: string;
    thinkingDuration?: number;
    currentFile?: { path: string;
    content: string; type: string };
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

  // NEW: Theme State and Toggle
  const [isDarkMode, setIsDarkMode] = useState(true); // Start in dark mode as default

  const toggleTheme = () => {
    setIsDarkMode(prev => {
      // Logic to update a global class on the body or documentElement if needed, 
      // but here we rely solely on React state and dynamic Tailwind classes.
      return !prev;
    });
  };

  // Helper for theme colors
  const theme = {
    bg_main: isDarkMode ? 'bg-gray-950' : 'bg-white',
    text_main: isDarkMode ? 'text-white' : 'text-gray-900',
    bg_card: isDarkMode ? 'bg-gray-900' : 'bg-gray-50',
    border_color: isDarkMode ? 'border-gray-800' : 'border-gray-200',
    chat_user_bg: isDarkMode ? 'bg-gray-700' : 'bg-gray-200',
    chat_ai_bg: isDarkMode ? 'bg-gray-800' : 'bg-gray-100',
    code_bg: isDarkMode ? 'bg-gray-900' : 'bg-gray-800', // Code block background remains dark for better contrast
  }

  // Clear old conversation data on component mount and create/restore sandbox
  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      // Clear old conversation
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

     
      // Check if sandbox ID is in URL
      const sandboxIdParam = searchParams.get('sandbox');
      
      setLoading(true);
      try {
        if (sandboxIdParam) {
          console.log('[home] Attempting to restore sandbox:', sandboxIdParam);
          // For now, just create a new sandbox - you could enhance this to actually restore
          // the specific sandbox 
          // if your backend supports it
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
      } finally {
        if (isMounted) {
          setLoading(false);
      }
      }
    };
    
    initializePage();
    return () => {
      isMounted = false;
    };
  }, []);
  // Run only on mount
  
  useEffect(() => {
    // Handle Escape key for home screen
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showHomeScreen) {
        setHomeScreenFading(true);
        setTimeout(() => {
          setShowHomeScreen(false);
          setHomeScreenFading(false);
        }, 500);
      }
    };
 
       
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHomeScreen]);
  useEffect(() => {
    // Only check sandbox status on mount and when user navigates to the page
    checkSandboxStatus();
    
    // Optional: Check status when window regains focus
    const handleFocus = () => {
      checkSandboxStatus();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);
  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);
  const updateStatus = (text: string, active: boolean) => {
    setStatus({ text, active });
  };
  const log = (message: string, type: 'info' | 'error' | 'command' = 'info') => {
    setResponseArea(prev => [...prev, `[${type}] ${message}`]);
  };

  const addChatMessage = (content: string, type: ChatMessage['type'], metadata?: ChatMessage['metadata']) => {
    setChatMessages(prev => {
      // Skip duplicate consecutive system messages
      if (type === 'system' && prev.length > 0) {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.type === 'system' && lastMessage.content === content) {
          return prev; // Skip duplicate
        }
      }
 
       return [...prev, { content, type, timestamp: new Date(), metadata }];
    });
  };
  const checkAndInstallPackages = async () => {
    if (!sandboxData) {
      addChatMessage('No active sandbox. Create a sandbox first!', 'system');
      return;
    }
    
    // Vite error checking removed - handled by template setup
    addChatMessage('Sandbox is ready. Vite configuration is handled by the template.', 'system');
  };
  
  const handleSurfaceError = (errors: any[]) => {
    // Function kept for compatibility but Vite errors are now handled by template
    
    // Focus the input
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
  if (textarea) {
      textarea.focus();
    }
  };
  const installPackages = async (packages: string[]) => {
    if (!sandboxData) {
      addChatMessage('No active sandbox. Create a sandbox first!', 'system');
      return;
    }
    
    try {
      const response = await fetch('/api/install-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages })
      });
  if (!response.ok) {
        throw new Error(`Failed to install packages: ${response.statusText}`);
  }
      
      const reader = response.body?.getReader();
  const decoder = new TextDecoder();
      
      while (reader) {
        const { done, value } = await reader.read();
  if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
  for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
  switch (data.type) {
                case 'command':
                  // Don't show npm install commands - they're handled by info messages
                  if (!data.command.includes('npm install')) {
                    addChatMessage(data.command, 'command', { commandType: 'input' });
  }
                  break;
  case 'output':
                  addChatMessage(data.message, 'command', { commandType: 'output' });
  break;
                case 'error':
                  if (data.message && data.message !== 'undefined') {
                    addChatMessage(data.message, 'command', { commandType: 'error' });
  }
                  break;
  case 'warning':
                  addChatMessage(data.message, 'command', { commandType: 'output' });
  break;
                case 'success':
                  addChatMessage(`${data.message}`, 'system');
  break;
                case 'status':
                  addChatMessage(data.message, 'system');
  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
  }
          }
        }
      }
    } catch (error: any) {
      addChatMessage(`Failed to install packages: ${error.message}`, 'system');
  }
  };

  const checkSandboxStatus = async () => {
    try {
      const response = await fetch('/api/sandbox-status');
  const data = await response.json();
      
      if (data.active && data.healthy && data.sandboxData) {
        setSandboxData(data.sandboxData);
  updateStatus('Sandbox active', true);
      } else if (data.active && !data.healthy) {
        // Sandbox exists but not responding
        updateStatus('Sandbox not responding', false);
  // Optionally try to create a new one
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
  setLoading(true);
    setShowLoadingBackground(true);
    updateStatus('Creating sandbox...', false);
    setResponseArea([]);
    
    try {
      const response = await makeRequestWithBody('/api/create-ai-sandbox', {});
  const data = await response.json();
      console.log('[createSandbox] Response data:', data);
      
      if (data.success) {
        setSandboxData(data);
  updateStatus('Sandbox active', true);
        log('Sandbox created successfully!');
        log(`Sandbox ID: ${data.sandboxId}`);
        log(`URL: ${data.url}`);
  // Update URL with sandbox ID
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('sandbox', data.sandboxId);
  newParams.set('model', aiModel);
        router.push(`/?${newParams.toString()}`, { scroll: false });
        
        // Fade out loading background after sandbox loads
        setTimeout(() => {
          setShowLoadingBackground(false);
        }, 3000);
  if (data.structure) {
          displayStructure(data.structure);
  }
        
        // Fetch sandbox files after creation
        setTimeout(fetchSandboxFiles, 1000);
  // Restart Vite server to ensure it's running
        setTimeout(async () => {
          try {
            console.log('[createSandbox] Ensuring Vite server is running...');
            const restartResponse = await fetch('/api/restart-vite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
    
          });
            
            if (restartResponse.ok) {
              const restartData = await restartResponse.json();
              if (restartData.success) {
                console.log('[createSandbox] Vite server started successfully');
            
  }
            }
          } catch (error) {
            console.error('[createSandbox] Error starting Vite server:', error);
          }
        }, 2000);
  // Only add welcome message if not coming from home screen
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
  log(`Failed to create sandbox: ${error.message}`, 'error');
      addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
  } finally {
      setLoading(false);
    }
  };
  const displayStructure = (structure: any) => {
    if (typeof structure === 'object') {
      setStructureContent(JSON.stringify(structure, null, 2));
  } else {
      setStructureContent(structure || 'No structure available');
    }
  };
  const applyGeneratedCode = async (code: string, isEdit: boolean = false) => {
    setLoading(true);
    log('Applying AI-generated code...');
  try {
      // Show progress component instead of individual messages
      setCodeApplicationState({ stage: 'analyzing' });
  // Get pending packages from tool calls
      const pendingPackages = ((window as any).pendingPackages || []).filter((pkg: any) => pkg && typeof pkg === 'string');
  if (pendingPackages.length > 0) {
        console.log('[applyGeneratedCode] Sending packages from tool calls:', pendingPackages);
  // Clear pending packages after use
        (window as any).pendingPackages = [];
  }
      
      // Use streaming endpoint for real-time feedback
      const response = await fetch('/api/apply-ai-code-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          response: code,
          isEdit: isEdit,
          packages: pendingPackages,
       
          sandboxId: sandboxData?.sandboxId // Pass the sandbox ID to ensure proper connection
        })
      });
  if (!response.ok) {
        throw new Error(`Failed to apply code: ${response.statusText}`);
  }
      
      // Handle streaming response
      const reader = response.body?.getReader();
  const decoder = new TextDecoder();
      let finalData: any = null;
  while (reader) {
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
                  // Don't add as chat message, just update state
                  setCodeApplicationState({ stage: 'analyzing' });
  break;
                  
                case 'step':
                  // Update progress state based on step
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
                  // Handle package installation progress
                  if (data.installedPackages) {
                    setCodeApplicationState(prev => ({ 
                      ...prev,
            
                      installedPackages: data.installedPackages 
                    }));
  }
                  break;
  case 'command':
                  // Don't show npm install commands - they're handled by info messages
                  if (data.command && !data.command.includes('npm install')) {
                    addChatMessage(data.command, 'command', { commandType: 'input' });
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
  case 'file-progress':
                  // Skip file progress messages, they're noisy
                  break;
  case 'file-complete':
                  // Could add individual file completion messages if desired
                  break;
  case 'command-progress':
                  addChatMessage(`${data.action} command: ${data.command}`, 'command', { commandType: 'input' });
  break;
                  
                case 'command-output':
                  addChatMessage(data.output, 'command', { 
                    commandType: data.stream === 'stderr' ? 'error' : 'output' 
                  });
  break;
                  
                case 'command-complete':
                  if (data.success) {
                    addChatMessage(`Command completed successfully`, 'system');
  } else {
                    addChatMessage(`Command failed with exit code ${data.exitCode}`, 'system');
  }
                  break;
  case 'complete':
                  finalData = data;
  setCodeApplicationState({ stage: 'complete' });
                  // Clear the state after a delay
                  setTimeout(() => {
                    setCodeApplicationState({ stage: null });
                  }, 3000);
  break;
                  
                case 'error':
                  addChatMessage(`Error: ${data.message || data.error || 'Unknown error'}`, 'system');
  break;
                  
                case 'warning':
                  addChatMessage(`${data.message}`, 'system');
  break;
                  
                case 'info':
                  // Show info messages, especially for package installation
                  if (data.message) {
                    addChatMessage(data.message, 'system');
  }
                  break;
  }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
      
      // Process final data
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
  // Log package installation results without duplicate messages
        if (results.packagesInstalled?.length > 0) {
          log(`Packages installed: ${results.packagesInstalled.join(', ')}`);
  }
        
        if (results.filesCreated?.length > 0) {
          log('Files created:');
  results.filesCreated.forEach((file: string) => {
            log(`  ${file}`, 'command');
          });
  // Verify files were actually created by refreshing the sandbox if needed
          if (sandboxData?.sandboxId && results.filesCreated.length > 0) {
            // Small delay to ensure files are written
            setTimeout(() => {
              // Force refresh the iframe to show new files
              if (iframeRef.current) {
  
                iframeRef.current.src = iframeRef.current.src;
              }
            }, 1000);
  }
        }
        
        if (results.filesUpdated?.length > 0) {
          log('Files updated:');
  results.filesUpdated.forEach((file: string) => {
            log(`  ${file}`, 'command');
          });
  }
        
        // Update conversation context with applied code
        setConversationContext(prev => ({
          ...prev,
          appliedCode: [...prev.appliedCode, {
            files: [...(results.filesCreated || []), ...(results.filesUpdated || [])],
            timestamp: new Date()
          }]
    
      }));
        
        if (results.commandsExecuted?.length > 0) {
          log('Commands executed:');
  results.commandsExecuted.forEach((cmd: string) => {
            log(`  $ ${cmd}`, 'command');
          });
  }
        
        if (results.errors?.length > 0) {
          results.errors.forEach((err: string) => {
            log(err, 'error');
          });
  }
        
        if (data.structure) {
          displayStructure(data.structure);
  }
        
        if (data.explanation) {
          log(data.explanation);
  }
        
        if ((data as any).autoCompleted) {
          log('Auto-generating missing components...', 'command');
  if ((data as any).autoCompletedComponents) {
            setTimeout(() => {
              log('Auto-generated missing components:', 'info');
              (data as any).autoCompletedComponents.forEach((comp: string) => {
                log(`  ${comp}`, 'command');
              });
            }, 
  1000);
          }
        } else if ((data as any).warning) {
          log((data as any).warning, 'error');
  if ((data as any).missingImports && (data as any).missingImports.length > 0) {
            const missingList = (data as any).missingImports.join(', ');
  addChatMessage(
              `Ask me to "create the missing components: ${missingList}" to fix these import errors.`,
              'system'
            );
  }
        }

        log('Code applied successfully!');
  console.log('[applyGeneratedCode] Response data:', data);
        console.log('[applyGeneratedCode] Debug info:', (data as any).debug);
        console.log('[applyGeneratedCode] Current sandboxData:', sandboxData);
        console.log('[applyGeneratedCode] Current iframe element:', iframeRef.current);
  console.log('[applyGeneratedCode] Current iframe src:', iframeRef.current?.src);
        
        if (results.filesCreated?.length > 0) {
          setConversationContext(prev => ({
            ...prev,
            appliedCode: [...prev.appliedCode, {
              files: results.filesCreated,
              timestamp: new Date()
            }]
          
  }));
          
          // Update the chat message to show success
          // Only show file list if not in edit mode
          if (isEdit) {
            addChatMessage(`Edit applied successfully!`, 'system');
  } else {
            // Check if this is part of a generation flow (has recent AI recreation message)
            const recentMessages = chatMessages.slice(-5);
  const isPartOfGeneration = recentMessages.some(m => 
              m.content.includes('AI recreation generated') || 
              m.content.includes('Code generated')
            );
  // Don't show files if part of generation flow to avoid duplication
            if (isPartOfGeneration) {
              addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system');
  } else {
              addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system', {
                appliedFiles: results.filesCreated
              });
  }
          }
          
          // If there are failed packages, add a message about checking for errors
          if (results.packagesFailed?.length > 0) {
            addChatMessage(`⚠️ Some packages failed to install. Check the error banner above for details.`, 'system');
  }
          
          // Fetch updated file structure
          await fetchSandboxFiles();
  // Automatically check and install any missing packages
          await checkAndInstallPackages();
  // Test build to ensure everything compiles correctly
          // Skip build test for now - it's causing errors with undefined activeSandbox
          // The build test was trying to access global.activeSandbox from the frontend,
          // but that's only available in the backend API routes
          console.log('[build-test] Skipping build test - would need API endpoint');
  // Force iframe refresh after applying code
          const refreshDelay = appConfig.codeApplication.defaultRefreshDelay;
  // Allow Vite to process changes
          
          setTimeout(() => {
            if (iframeRef.current && sandboxData?.url) {
              console.log('[home] Refreshing iframe after code application...');
              
              // Method 1: Change src with timestamp
    
              const urlWithTimestamp = `${sandboxData.url}?t=${Date.now()}&applied=true`;
              iframeRef.current.src = urlWithTimestamp;
              
              // Method 2: Force reload after a short delay
              setTimeout(() => {
                try {
  
                  if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.location.reload();
                    console.log('[home] Force reloaded iframe content');
                  }
                } catch (e) {
 
                  console.log('[home] Could not reload iframe (cross-origin):', e);
                }
              }, 1000);
            }
          }, refreshDelay);
  // Vite error checking removed - handled by template setup
        }
        
          // Give Vite HMR a moment to detect changes, then ensure refresh
          if (iframeRef.current && sandboxData?.url) {
            // Wait for Vite to process the file changes
            // If packages were installed, wait longer for 
  // Vite to restart
            const packagesInstalled = results?.packagesInstalled?.length > 0 ||
  data.results?.packagesInstalled?.length > 0;
            const refreshDelay = packagesInstalled ? appConfig.codeApplication.packageInstallRefreshDelay : appConfig.codeApplication.defaultRefreshDelay;
            console.log(`[applyGeneratedCode] Packages installed: ${packagesInstalled}, refresh delay: ${refreshDelay}ms`);
  setTimeout(async () => {
            if (iframeRef.current && sandboxData?.url) {
              console.log('[applyGeneratedCode] Starting iframe refresh sequence...');
              console.log('[applyGeneratedCode] Current iframe src:', iframeRef.current.src);
              console.log('[applyGeneratedCode] Sandbox URL:', sandboxData.url);
              
              
  // Method 1: Try direct navigation first
              try {
                const urlWithTimestamp = `${sandboxData.url}?t=${Date.now()}&force=true`;
                console.log('[applyGeneratedCode] Attempting direct navigation to:', urlWithTimestamp);
                
                // Remove any existing onload handler
  
                iframeRef.current.onload = null;
                
                // Navigate directly
                iframeRef.current.src = urlWithTimestamp;
                
                
  // Wait a bit and check if it loaded
                await new Promise(resolve => setTimeout(resolve, 2000));
  // Try to access the iframe content to verify it loaded
                try {
                  const iframeDoc = iframeRef.current.contentDocument ||
  iframeRef.current.contentWindow?.document;
                  if (iframeDoc && iframeDoc.readyState === 'complete') {
                    console.log('[applyGeneratedCode] Iframe loaded successfully');
  return;
                  }
                } catch (e) {
                  console.log('[applyGeneratedCode] Cannot access iframe content (CORS), assuming loaded');
  return;
                }
              } catch (e) {
                console.error('[applyGeneratedCode] Direct navigation failed:', e);
  }
              
              // Method 2: Force complete iframe recreation if direct navigation failed
              console.log('[applyGeneratedCode] Falling back to iframe recreation...');
  const parent = iframeRef.current.parentElement;
              const newIframe = document.createElement('iframe');
              
              // Copy attributes
              newIframe.className = iframeRef.current.className;
  newIframe.title = iframeRef.current.title;
              newIframe.allow = iframeRef.current.allow;
              // Copy sandbox attributes
              const sandboxValue = iframeRef.current.getAttribute('sandbox');
  if (sandboxValue) {
                newIframe.setAttribute('sandbox', sandboxValue);
  }
              
              // Remove old iframe
              iframeRef.current.remove();
  // Add new iframe
              newIframe.src = `${sandboxData.url}?t=${Date.now()}&recreated=true`;
  parent?.appendChild(newIframe);
              
              // Update ref
              (iframeRef as any).current = newIframe;
  console.log('[applyGeneratedCode] Iframe recreated with new content');
            } else {
              console.error('[applyGeneratedCode] No iframe or sandbox URL available for refresh');
  }
          }, refreshDelay);
  // Dynamic delay based on whether packages were installed
        }
        
        } else {
          throw new Error(finalData?.error || 'Failed to apply code');
  }
      } else {
        // If no final data was received, still close loading
        addChatMessage('Code application may have partially succeeded. Check the preview.', 'system');
  }
    } catch (error: any) {
      log(`Failed to apply code: ${error.message}`, 'error');
  } finally {
      setLoading(false);
      // Clear isEdit flag after applying code
      setGenerationProgress(prev => ({
        ...prev,
        isEdit: false
      }));
  }
  };

  const fetchSandboxFiles = async () => {
    if (!sandboxData) return;
  try {
      const response = await fetch('/api/get-sandbox-files', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
  if (response.ok) {
        const data = await response.json();
  if (data.success) {
          setSandboxFiles(data.files || {});
          setFileStructure(data.structure || '');
  console.log('[fetchSandboxFiles] Updated file list:', Object.keys(data.files || {}).length, 'files');
        }
      }
    } catch (error) {
      console.error('[fetchSandboxFiles] Error fetching files:', error);
  }
  };
  
  const restartViteServer = async () => {
    try {
      addChatMessage('Restarting Vite dev server...', 'system');
  const response = await fetch('/api/restart-vite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
  if (response.ok) {
        const data = await response.json();
  if (data.success) {
          addChatMessage('✓ Vite dev server restarted successfully!', 'system');
  // Refresh the iframe after a short delay
          setTimeout(() => {
            if (iframeRef.current && sandboxData?.url) {
              iframeRef.current.src = `${sandboxData.url}?t=${Date.now()}`;
            }
          }, 2000);
  } else {
          addChatMessage(`Failed to restart Vite: ${data.error}`, 'error');
  }
      } else {
        addChatMessage('Failed to restart Vite server', 'error');
  }
    } catch (error) {
      console.error('[restartViteServer] Error:', error);
  addChatMessage(`Error restarting Vite: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };
  const applyCode = async () => {
    const code = promptInput.trim();
  if (!code) {
      log('Please enter some code first', 'error');
  addChatMessage('No code to apply. Please generate code first.', 'system');
      return;
  }
    
    // Prevent double clicks
    if (loading) {
      console.log('[applyCode] Already loading, skipping...');
  return;
    }
    
    // Determine if this is an edit based on whether we have applied code before
    const isEdit = conversationContext.appliedCode.length > 0;
  await applyGeneratedCode(code, isEdit);
  };

  const renderMainContent = () => {
    if (activeTab === 'generation' && (generationProgress.isGenerating || generationProgress.files.length > 0)) {
      return (
        /* Generation Tab Content */
        <div className="absolute inset-0 flex overflow-hidden">
          {/* File Explorer - Hide during edits */}
          {!generationProgress.isEdit && (
            <div className={`w-[250px] border-r ${theme.border_color} ${theme.bg_card} 
  flex flex-col flex-shrink-0 ${theme.text_main}`}>
            <div className={`p-3 ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <BsFolderFill className="w-4 h-4" />
                <span className="text-sm font-medium">Explorer</span>
              </div>
            
  </div>
            
            {/* File Tree */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
              <div className="text-sm">
                {/* Root app folder */}
                <div 
     
                  className={`flex items-center gap-1 py-1 px-2 hover:${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'} rounded cursor-pointer ${theme.text_main}`}
                  onClick={() => toggleFolder('app')}
                >
                  {expandedFolders.has('app') ?
  (
                    <FiChevronDown className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  ) : (
                    <FiChevronRight className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  )}
              
                  {expandedFolders.has('app') ? (
                    <BsFolder2Open className="w-4 h-4 text-blue-400" />
                  ) : (
                    <BsFolderFill className="w-4 h-4 text-blue-400" />
                  )}
        
                  <span className={`font-medium ${theme.text_main}`}>app</span>
                </div>
                
                {expandedFolders.has('app') && (
                  <div className="ml-4">
                   
                   {/* Group files by directory */}
                    {(() => {
                      const fileTree: { [key: string]: Array<{ name: string; edited?: boolean }> } = {};
                      
               
                      // Create a map of edited files
                      const editedFiles = new Set(
                        generationProgress.files
                          .filter(f => (f as any).edited)
       
                          .map(f => f.path)
                      );
                      
                      // Process all files from generation progress
       
                      generationProgress.files.forEach(file => {
                        const parts = file.path.split('/');
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
                        const fileName = parts[parts.length - 1];
  if (!fileTree[dir]) fileTree[dir] = [];
                        fileTree[dir].push({
                          name: fileName,
                          edited: (file as any).edited || false
                        });
  });
                      
                      return Object.entries(fileTree).map(([dir, files]) => (
                        <div key={dir} className="mb-1">
                          {dir && (
                            <div 
            
                              className={`flex items-center gap-1 py-1 px-2 hover:${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'} rounded cursor-pointer ${theme.text_main}`}
                              onClick={() => toggleFolder(dir)}
                            >
              
                              {expandedFolders.has(dir) ? (
                                <FiChevronDown className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                              ) : (
              
                                <FiChevronRight className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                              )}
                              {expandedFolders.has(dir) ? (
                
                                <BsFolder2Open className="w-4 h-4 text-yellow-500" />
                              ) : (
                                <BsFolderFill className="w-4 h-4 text-yellow-500" />
            
                              )}
                              <span className={`${theme.text_main}`}>{dir.split('/').pop()}</span>
                            </div>
                       
                          )}
                          {(!dir ||
  expandedFolders.has(dir)) && (
                            <div className={dir ? 'ml-6' : ''}>
                              {files.sort((a, b) => a.name.localeCompare(b.name)).map(fileInfo => {
                              
  const fullPath = dir ? `${dir}/${fileInfo.name}` : fileInfo.name;
                                const isSelected = selectedFile === fullPath;
                                
                      
                          return (
                                  <div 
                                    key={fullPath} 
                 
                                    className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition-all ${
                                      isSelected 
                                  
  ? 'bg-blue-600 text-white' 
                                        : `${theme.text_main} hover:${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`
                                    }`}
             
                                    onClick={() => handleFileClick(fullPath)}
                                  >
                                    {getFileIcon(fileInfo.name)}
     
                                     <span className={`text-xs flex items-center gap-1 ${isSelected ?
  'font-medium' : ''}`}>
                                      {fileInfo.name}
                                      {fileInfo.edited && (
                    
                                         <span className={`text-[10px] px-1 rounded ${
                                          isSelected ? 'bg-blue-400' : 'bg-orange-500 text-white'
                             
  }`}>✓</span>
                                      )}
                                    </span>
               
                                     </div>
                                );
  })}
                            </div>
                          )}
                        </div>
                      
  ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
          
         
          {/* Code Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thinking Mode Display - Only show during active generation */}
            {generationProgress.isGenerating && (generationProgress.isThinking || generationProgress.thinkingText) && (
              <div className="px-6 pb-6">
                <div className="flex items-center gap-2 mb-2">
      
                  <div className="text-purple-400 font-medium flex items-center gap-2">
                    {generationProgress.isThinking ? (
                      <>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
         
                        AI is thinking...
                      </>
                    ) : (
                      <>
                 
                        <span className="text-purple-400">✓</span>
                        Thought for {generationProgress.thinkingDuration ||
  0} seconds
                      </>
                    )}
                  </div>
                </div>
                {generationProgress.thinkingText && (
     
                  <div className={`bg-gray-900 border border-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto scrollbar-hide`}>
                    <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
                      {generationProgress.thinkingText}
                    </pre>
             
  </div>
                )}
              </div>
            )}
            
            {/* Live Code Display */}
            <div className="flex-1 rounded-lg p-6 flex flex-col min-h-0 overflow-hidden">
      
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide" ref={codeDisplayRef}>
                {/* Show selected file if one is selected */}
                {selectedFile ?
  (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className={`bg-gray-900 border ${theme.border_color} rounded-lg overflow-hidden shadow-sm`}>
                      <div className="px-4 py-2 bg-gray-800 text-white flex items-center justify-between">
                       
                        <div className="flex items-center gap-2">
                          {getFileIcon(selectedFile)}
                          <span className="font-mono text-sm">{selectedFile}</span>
                        </div>
                  
                        <button
                          onClick={() => setSelectedFile(null)}
                          className="hover:bg-gray-700/50 p-1 rounded transition-colors"
                        >
             
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                
                        </button>
                      </div>
                      <div className={`bg-gray-950 border ${theme.border_color} rounded`}>
                        <SyntaxHighlighter
                    
                          language={(() => {
                            const ext = selectedFile.split('.').pop()?.toLowerCase();
  if (ext === 'css') return 'css';
                            if (ext === 'json') return 'json';
                            if (ext === 'html') return 'html';
                            return 'jsx';
  })()}
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                   
                            padding: '1rem',
                            fontSize: '0.875rem',
                            background: 'transparent',
                          }}
      
                          showLineNumbers={true}
                        >
                          {(() => {
                            
  // Find the file content from generated files
                            const file = generationProgress.files.find(f => f.path === selectedFile);
                            return file?.content || '// File content will appear here';
                      
  })()}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  </div>
            
    ) : /* If no files parsed yet, show loading or raw stream */
                generationProgress.files.length === 0 && !generationProgress.currentFile ?
  (
                  generationProgress.isThinking ? (
                    // Beautiful loading state while thinking
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
        
                        <div className="mb-8 relative">
                          <div className="w-24 h-24 mx-auto">
                            <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
                    
                          <div className="absolute inset-0 border-4 border-green-500 rounded-full animate-spin border-t-transparent"></div>
                          </div>
                        </div>
                        <h3 className="text-xl font-medium text-white mb-2">AI is analyzing your request</h3>
   
                        <p className="text-gray-400 text-sm">{generationProgress.status || 'Preparing to generate code...'}</p>
                      </div>
                    </div>
                  ) : (
          
                    <div className={`bg-gray-900 border ${theme.border_color} rounded-lg overflow-hidden`}>
                      <div className="px-4 py-2 bg-gray-800 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 
  border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                          <span className="font-mono text-sm">Streaming code...</span>
                        </div>
                      </div>
                    
  <div className={`p-4 ${theme.code_bg} rounded`}>
                        <SyntaxHighlighter
                          language="jsx"
                          style={vscDarkPlus}
                   
                          customStyle={{
                            margin: 0,
                            padding: '1rem',
                            fontSize: '0.875rem',
      
                            background: 'transparent',
                          }}
                          showLineNumbers={true}
                        >
 
                          {generationProgress.streamedCode ||
  'Starting code generation...'}
                        </SyntaxHighlighter>
                        <span className="inline-block w-2 h-4 bg-orange-400 ml-1 animate-pulse" />
                      </div>
                    </div>
 
                  )
                ) : (
                  <div className="space-y-4">
                    {/* Show current file being generated */}
                    
  {generationProgress.currentFile && (
                      <div className={`bg-gray-900 border-2 border-gray-400 rounded-lg overflow-hidden shadow-sm`}>
                        <div className="px-4 py-2 bg-gray-800 text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
          
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span className="font-mono text-sm">{generationProgress.currentFile.path}</span>
                            <span className={`px-2 py-0.5 text-xs rounded ${
           
                               generationProgress.currentFile.type === 'css' ?
  'bg-blue-600 text-white' :
                              generationProgress.currentFile.type === 'javascript' ?
  'bg-yellow-600 text-white' :
                              generationProgress.currentFile.type === 'json' ?
  'bg-green-600 text-white' :
                              'bg-gray-200 text-gray-700'
                            }`}>
                              {generationProgress.currentFile.type === 'javascript' ?
  'JSX' : generationProgress.currentFile.type.toUpperCase()}
                            </span>
                          </div>
                        </div>
                    
      <div className={`bg-gray-950 border ${theme.border_color} rounded`}>
                          <SyntaxHighlighter
                            language={
                              generationProgress.currentFile.type === 'css' ?
  'css' :
                              generationProgress.currentFile.type === 'json' ?
  'json' :
                              generationProgress.currentFile.type === 'html' ?
  'html' :
                              'jsx'
                            }
                            style={vscDarkPlus}
             
                              customStyle={{
                              margin: 0,
                              padding: '1rem',
                       
                                fontSize: '0.75rem',
                              background: 'transparent',
                            }}
                            showLineNumbers={true}
     
                          >
                            {generationProgress.currentFile.content}
                          </SyntaxHighlighter>
                         
  <span className="inline-block w-2 h-3 bg-orange-400 ml-4 mb-4 animate-pulse" />
                        </div>
                      </div>
                    )}
                    
     
                    {/* Show completed files */}
                    {generationProgress.files.map((file, idx) => (
                      <div key={idx} className={`bg-gray-900 border ${theme.border_color} rounded-lg overflow-hidden`}>
                        <div className={`px-4 py-2 ${theme.code_bg} text-white flex 
  items-center justify-between`}>
                          <div className="flex items-center gap-2">
                            <span className="text-green-500">✓</span>
                            <span className="font-mono text-sm">{file.path}</span>
           
  </div>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            file.type === 'css' ?
  'bg-blue-600 text-white' :
                            file.type === 'javascript' ?
  'bg-yellow-600 text-white' :
                            file.type === 'json' ?
  'bg-green-600 text-white' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {file.type === 'javascript' ?
  'JSX' : file.type.toUpperCase()}
                          </span>
                        </div>
                        <div className={`bg-gray-950 border ${theme.border_color} max-h-48 overflow-y-auto scrollbar-hide`}>
                 
                          <SyntaxHighlighter
                            language={
                              file.type === 'css' ?
  'css' :
                              file.type === 'json' ?
  'json' :
                              file.type === 'html' ?
  'html' :
                              'jsx'
                            }
                            style={vscDarkPlus}
             
                              customStyle={{
                              margin: 0,
                              padding: '1rem',
                       
                                fontSize: '0.75rem',
                              background: 'transparent',
                            }}
                            showLineNumbers={true}
     
                            wrapLongLines={true}
                          >
                            {file.content}
                       
  </SyntaxHighlighter>
                        </div>
                      </div>
                    ))}
                    
           
                    {/* Show remaining raw stream if there's content after the last file */}
                    {!generationProgress.currentFile && generationProgress.streamedCode.length > 0 && (
                      <div className={`bg-gray-900 border ${theme.border_color} rounded-lg overflow-hidden`}>
                        <div className={`px-4 
  py-2 ${theme.code_bg} text-white flex items-center justify-between`}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            <span className="font-mono 
  text-sm">Processing...</span>
                          </div>
                        </div>
                        <div className={`bg-gray-950 border ${theme.border_color} rounded`}>
                      
      <SyntaxHighlighter
                            language="jsx"
                            style={vscDarkPlus}
                            customStyle={{
            
                              margin: 0,
                              padding: '1rem',
                              fontSize: '0.75rem',
                   
                              background: 'transparent',
                            }}
                            showLineNumbers={false}
                          >
      
                          {(() => {
                              // Show only the tail of the stream after the last file
                              const lastFileEnd = generationProgress.files.length > 
  0 
                                ?
  generationProgress.streamedCode.lastIndexOf('</file>') + 7
                                : 0;
  let remainingContent = generationProgress.streamedCode.slice(lastFileEnd).trim();
                              
                              // Remove explanation tags and content
                              remainingContent = remainingContent.replace(/<explanation>[\s\S]*?<\/explanation>/g, '').trim();
  // If only whitespace or nothing left, show waiting message
                              return remainingContent ||
  'Waiting for next file...';
                            })()}
                          </SyntaxHighlighter>
                        </div>
                      </div>
                    )}
    
                  </div>
                )}
              </div>
            </div>
            
            {/* Progress indicator */}
            {generationProgress.components.length > 0 && (
 
              <div className="mx-6 mb-6">
                <div className={`h-2 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300"
                    style={{
 
                      width: `${(generationProgress.currentComponent / Math.max(generationProgress.components.length, 1)) * 100}%`
                    }}
                  />
                </div>
              </div>
     
          )}
          </div>
        </div>
      );
  } else if (activeTab === 'preview') {
      // Check loading stage FIRST to prevent showing old sandbox
      // Don't show loading overlay for edits
      if (loadingStage || (generationProgress.isGenerating && !generationProgress.isEdit)) {
        return (
          <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-8">
 
                <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto"></div>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {loadingStage === 'planning' && 'Planning your design...'}
                {(loadingStage === 'generating' || generationProgress.isGenerating) && (
  <>
    Generating <br /> your application...
  </>
)}
              </h3>
              <p className="text-gray-400 text-sm">
                {loadingStage === 'planning' && 'Creating the optimal React component architecture'}
                {(loadingStage === 'generating' ||
  generationProgress.isGenerating) && 'Writing clean, modern code for your app'}
              </p>
            </div>
          </div>
        );
  }
      
      // Show sandbox iframe only when not in any loading state
      if (sandboxData?.url && !loading) {
        return (
          <div className="relative w-full h-full">
            <iframe
              ref={iframeRef}
              src={sandboxData.url}
      
              className="w-full h-full border-none"
              title="Open Lovable Sandbox"
              allow="clipboard-write"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
            {/* Refresh button */}
            <button
   
              onClick={() => {
                if (iframeRef.current && sandboxData?.url) {
                  console.log('[Manual Refresh] Forcing iframe reload...');
                  const newSrc = `${sandboxData.url}?t=${Date.now()}&manual=true`;
                  iframeRef.current.src = newSrc;
    
              }
              }}
              className="absolute bottom-4 right-4 bg-white/90 hover:bg-white text-gray-700 p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105"
              title="Refresh sandbox"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" 
  stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        );
  }
      
      // Default state when no sandbox
      return (
        <div className={`flex items-center justify-center h-full ${theme.bg_card} ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} text-lg`}>
          {sandboxData ? (
            <div className="text-gray-500">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            
              <p className="text-sm">Loading preview...</p>
            </div>
          ) : (
            <div className="text-gray-500 text-center">
              <p className="text-sm">Describe your website to get started</p>
            </div>
          )}
        </div>
      );
  }
    return null;
  };

  const sendChatMessage = async () => {
    const message = aiChatInput.trim();
  if (!message) return;
    
    if (!aiEnabled) {
      addChatMessage('AI is disabled. Please enable it first.', 'system');
      return;
  }
    
    addChatMessage(message, 'user');
    setAiChatInput('');
  // Check for special commands
    const lowerMessage = message.toLowerCase().trim();
  if (lowerMessage === 'check packages' || lowerMessage === 'install packages' || lowerMessage === 'npm install') {
      if (!sandboxData) {
        addChatMessage('No active sandbox. Create a sandbox first!', 'system');
  return;
      }
      await checkAndInstallPackages();
      return;
  }
    
    // Start sandbox creation in parallel if needed
    let sandboxPromise: Promise<void> |
  null = null;
    let sandboxCreating = false;
    
    if (!sandboxData) {
      sandboxCreating = true;
  addChatMessage('Creating sandbox while I plan your app...', 'system');
      sandboxPromise = createSandbox(true).catch((error: any) => {
        addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
        throw error;
      });
  }
    
    // Determine if this is an edit
    const isEdit = conversationContext.appliedCode.length > 0;
  try {
      // Generation tab is already active from scraping phase
      setGenerationProgress(prev => ({
        ...prev,  // Preserve all existing state
        isGenerating: true,
        status: 'Starting AI generation...',
        components: [],
        currentComponent: 0,
        streamedCode: '',
        isStreaming: false,
       
        isThinking: true,
        thinkingText: 'Analyzing your request...',
        thinkingDuration: undefined,
        currentFile: undefined,
        lastProcessedPosition: 0,
        // Add isEdit flag to generation progress
        isEdit: isEdit,
        // Keep existing files for edits - we'll mark edited ones differently
        files: prev.files
      }));
  // Backend now manages file state - no need to fetch from frontend
      console.log('[chat] Using backend file cache for context');
  const fullContext = {
        sandboxId: sandboxData?.sandboxId ||
  (sandboxCreating ? 'pending' : null),
        structure: structureContent,
        recentMessages: chatMessages.slice(-20),
        conversationContext: conversationContext,
        currentCode: promptInput,
        sandboxUrl: sandboxData?.url,
        sandboxCreating: sandboxCreating
      };
  // Debug what we're sending
      console.log('[chat] Sending context to AI:');
      console.log('[chat] - sandboxId:', fullContext.sandboxId);
  console.log('[chat] - isEdit:', conversationContext.appliedCode.length > 0);
      
      const response = await makeRequestWithBody('/api/generate-ai-code-stream', {
        prompt: message,
        model: aiModel,
        context: fullContext,
        isEdit: conversationContext.appliedCode.length > 0
      });
  if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
  }
      
      const reader = response.body?.getReader();
  const decoder = new TextDecoder();
      let generatedCode = '';
      let explanation = '';
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
  if (data.type === 'status') {
                  setGenerationProgress(prev => ({ ...prev, status: data.message }));
  } else if (data.type === 'thinking') {
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    isThinking: true,
                    thinkingText: (prev.thinkingText || '') + data.text
      
                  }));
  } else if (data.type === 'thinking_complete') {
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    isThinking: false,
                    thinkingDuration: data.duration
          
                  }));
                } else if (data.type === 'conversation') {
                  // Add conversational text to chat only if it's not code
                  let text = data.text ||
  '';
                  
                  // Remove package tags from the text
                  text = text.replace(/<package>[^<]*<\/package>/g, '');
  text = text.replace(/<packages>[^<]*<\/packages>/g, '');
                  
                  // Filter out any XML tags and file content that slipped through
                  if (!text.includes('<file') && !text.includes('import React') && 
                      !text.includes('export default') && !text.includes('className=') &&
                      text.trim().length > 0) {
          
                      addChatMessage(text.trim(), 'ai');
  }
                } else if (data.type === 'stream' && data.raw) {
                  setGenerationProgress(prev => {
                    const newStreamedCode = prev.streamedCode + data.text;
                    
           
                    // Tab is already switched after scraping
                    
                    const updatedState = { 
                      ...prev, 
                  
                      streamedCode: newStreamedCode,
                      isStreaming: true,
                      isThinking: false,
                      status: 'Generating code...'
                    };
     
                        
                    // Process complete files from the accumulated stream
                    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                    let match;
             
                      const processedFiles = new Set(prev.files.map(f => f.path));
                    
                    while ((match = fileRegex.exec(newStreamedCode)) !== null) {
                      const filePath = match[1];
  const fileContent = match[2];
                      
                      // Only add if we haven't processed this file yet
                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() ||
  '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ?
  'javascript' :
                                        fileExt === 'css' ?
  'css' :
                                        fileExt === 'json' ?
  'json' :
                                        fileExt === 'html' ?
  'html' : 'text';
                        
                        // Check if file already exists
                        const existingFileIndex = updatedState.files.findIndex(f => f.path === filePath);
  if (existingFileIndex >= 0) {
                          // Update existing file and mark as edited
                          updatedState.files = [
                            ...updatedState.files.slice(0, existingFileIndex),
      
                            {
                              ...updatedState.files[existingFileIndex],
                              content: fileContent.trim(),
                 
                              type: fileType,
                              completed: true,
                              edited: true
                        
  } as any,
                            ...updatedState.files.slice(existingFileIndex + 1)
                          ];
  } else {
                          // Add new file
                          updatedState.files = [...updatedState.files, {
                            path: filePath,
           
                            content: fileContent.trim(),
                            type: fileType,
                            completed: true,
                        
  edited: false
                          } as any];
  }
                        
                        // Only show file status if not in edit mode
                        if (!prev.isEdit) {
                 
                          updatedState.status = `Completed ${filePath}`;
  }
                        processedFiles.add(filePath);
  }
                    }
                    
                    // Check for current file being generated (incomplete file at the end)
                    const lastFileMatch = newStreamedCode.match(/<file path="([^"]+)">([^]*?)$/);
     
                        if (lastFileMatch && !lastFileMatch[0].includes('</file>')) {
                      const filePath = lastFileMatch[1];
                      const partialContent = lastFileMatch[2];
                      
         
                      if (!processedFiles.has(filePath)) {
                        const fileExt = filePath.split('.').pop() || '';
                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                    
                          fileExt === 'css' ? 'css' :
                                        fileExt === 'json' ? 'json' :
                              
  fileExt === 'html' ? 'html' : 'text';
                        
                        updatedState.currentFile = { 
                          path: filePath, 
     
                          content: partialContent, 
                          type: fileType 
                        };
  // Only show file status if not in edit mode
                        if (!prev.isEdit) {
                          updatedState.status = `Generating ${filePath}`;
  }
                      }
                    } else {
                      updatedState.currentFile = undefined;
  }
                    
                    return updatedState;
  });
                } else if (data.type === 'app') {
                  setGenerationProgress(prev => ({ 
                    ...prev, 
                    status: 'Generated App.jsx structure'
                  }));
  } else if (data.type === 'component') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: `Generated ${data.name}`,
                    components: [...prev.components, { 
         
                      name: data.name, 
                      path: data.path, 
                      completed: true 
                    }],
                 
  currentComponent: data.index
                  }));
  } else if (data.type === 'package') {
                  // Handle package installation from tool calls
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: data.message || `Installing ${data.name}`
      
                  }));
  } else if (data.type === 'complete') {
                  generatedCode = data.generatedCode;
  explanation = data.explanation;
                  
                  // Save the last generated code
                  setConversationContext(prev => ({
                    ...prev,
                    lastGeneratedCode: generatedCode
                  }));
  // Clear thinking state when generation completes
                  setGenerationProgress(prev => ({
                    ...prev,
                    isThinking: false,
                    thinkingText: undefined,
            
                    thinkingDuration: undefined
                  }));
  // Store packages to install from tool calls
                  if (data.packagesToInstall && data.packagesToInstall.length > 0) {
                    console.log('[generate-code] Packages to install from tools:', data.packagesToInstall);
  // Store packages globally for later installation
                    (window as any).pendingPackages = data.packagesToInstall;
  }
                  
                  // Parse all files from the completed code if not already done
                  const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                  const parsedFiles: Array<{path: string; content: string; type: string; completed: boolean}> = [];
  
                  let fileMatch;
                  
                  while ((fileMatch = fileRegex.exec(data.generatedCode)) !== null) {
                    const filePath = fileMatch[1];
                  
  const fileContent = fileMatch[2];
                    const fileExt = filePath.split('.').pop() || '';
                    const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                    fileExt === 
  'css' ? 'css' :
                                    fileExt === 'json' ? 'json' :
                                    fileExt === 'html' ? 'html' : 'text';
              
        
                    parsedFiles.push({
                      path: filePath,
                      content: fileContent.trim(),
                      type: fileType,
     
                      completed: true
                    });
  }
                  
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: `Generated ${parsedFiles.length > 0 ? parsedFiles.length : prev.files.length} file${(parsedFiles.length > 0 ? parsedFiles.length : prev.files.length) !== 1 ? 's' : ''}!`,
 
                    isGenerating: false,
                    isStreaming: false,
                    isEdit: prev.isEdit,
                    // Keep the files that were already parsed during streaming
         
                    files: prev.files.length > 0 ? prev.files : parsedFiles
                  }));
  } else if (data.type === 'error') {
                  throw new Error(data.error);
  }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
  }
            }
          }
        }
      }
      
      if (generatedCode) {
        // Parse files from generated code for metadata
        const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
        const generatedFiles = [];
        let match;
   
        while ((match = fileRegex.exec(generatedCode)) !== null) {
          generatedFiles.push(match[1]);
        }
        
        // Show appropriate message based on edit mode
        if (isEdit && generatedFiles.length > 0) {
          // For edits, show which file(s) were edited
          const editedFileNames = generatedFiles.map(f => f.split('/').pop()).join(', ');
 
          addChatMessage(
            explanation || `Updated ${editedFileNames}`,
            'ai',
            {
              appliedFiles: [generatedFiles[0]] // Only show the first edited file
            }
          );
        
  } else {
          // For new generation, show all files
          addChatMessage(explanation || 'Code generated!', 'ai', {
            appliedFiles: generatedFiles
          });
  }
        
        setPromptInput(generatedCode);
  // Don't show the Generated Code panel by default
        // setLeftPanelVisible(true);
  // Wait for sandbox creation if it's still in progress
        if (sandboxPromise) {
          addChatMessage('Waiting for sandbox to be ready...', 'system');
  try {
            await sandboxPromise;
  // Remove the waiting message
            setChatMessages(prev => prev.filter(msg => msg.content !== 'Waiting for sandbox to be ready...'));
  } catch {
            addChatMessage('Sandbox creation failed. Cannot apply code.', 'system');
  return;
          }
        }
        
        if (sandboxData && generatedCode) {
          // Use isEdit flag that was determined at the start
          await applyGeneratedCode(generatedCode, isEdit);
  }
      }
      
      // Show completion status briefly then switch to preview
      setGenerationProgress(prev => ({
        ...prev,
        isGenerating: false,
        isStreaming: false,
        status: 'Generation complete!',
        isEdit: prev.isEdit,
        // Clear thinking state on completion
        
  isThinking: false,
        thinkingText: undefined,
        thinkingDuration: undefined
      }));
  setTimeout(() => {
        // Switch to preview but keep files for display
        setActiveTab('preview');
      }, 1000);
  // Reduced from 3000ms to 1000ms
    } catch (error: any) {
      setChatMessages(prev => prev.filter(msg => msg.content !== 'Thinking...'));
  addChatMessage(`Error: ${error.message}`, 'system');
      // Reset generation progress and switch back to preview on error
      setGenerationProgress({
        isGenerating: false,
        status: '',
        components: [],
        currentComponent: 0,
        streamedCode: '',
        isStreaming: false,
        isThinking: false,
        thinkingText: undefined,
        thinkingDuration: 
  undefined,
        files: [],
        currentFile: undefined,
        lastProcessedPosition: 0
      });
  setActiveTab('preview');
    }
  };


  const downloadZip = async () => {
    if (!sandboxData) {
      addChatMessage('No active sandbox to download. Create a sandbox first!', 'system');
  return;
    }
    
    setLoading(true);
    log('Creating zip file...');
  addChatMessage('Creating ZIP file of your Vite app...', 'system');
    
    try {
      const response = await fetch('/api/create-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
  const data = await response.json();
      
      if (data.success) {
        log('Zip file created!');
  addChatMessage('ZIP file created! Download starting...', 'system');
        
        const link = document.createElement('a');
        link.href = data.dataUrl;
        link.download = data.fileName || 'e2b-project.zip';
        document.body.appendChild(link);
        link.click();
  document.body.removeChild(link);
        
        addChatMessage(
          'Your Vite app has been downloaded! To run it locally:\n' +
          '1. Unzip the file\n' +
          '2. Run: npm install\n' +
          '3. Run: npm run dev\n' +
          '4. Open http://localhost:5173',
          'system'
        );
  } else {
        throw new Error(data.error);
  }
    } catch (error: any) {
      log(`Failed to create zip: ${error.message}`, 'error');
  addChatMessage(`Failed to create ZIP: ${error.message}`, 'system');
    } finally {
      setLoading(false);
    }
  };
  const reapplyLastGeneration = async () => {
    if (!conversationContext.lastGeneratedCode) {
      addChatMessage('No previous generation to re-apply', 'system');
  return;
    }
    
    if (!sandboxData) {
      addChatMessage('Please create a sandbox first', 'system');
  return;
    }
    
    addChatMessage('Re-applying last generation...', 'system');
    const isEdit = conversationContext.appliedCode.length > 0;
  await applyGeneratedCode(conversationContext.lastGeneratedCode, isEdit);
  };

  // Auto-scroll code display to bottom when streaming
  useEffect(() => {
    if (codeDisplayRef.current && generationProgress.isStreaming) {
      codeDisplayRef.current.scrollTop = codeDisplayRef.current.scrollHeight;
    }
  }, [generationProgress.streamedCode, generationProgress.isStreaming]);
  const toggleFolder = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
  if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
  }
    setExpandedFolders(newExpanded);
  };

  const handleFileClick = async (filePath: string) => {
    setSelectedFile(filePath);
  // TODO: Add file content fetching logic here
  };
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'jsx' || ext === 'js') {
      return <SiJavascript className="w-4 h-4 text-yellow-500" />;
  } else if (ext === 'tsx' || ext === 'ts') {
      return <SiReact className="w-4 h-4 text-blue-500" />;
  } else if (ext === 'css') {
      return <SiCss3 className="w-4 h-4 text-blue-500" />;
  } else if (ext === 'json') {
      return <SiJson className="w-4 h-4 text-gray-600" />;
  } else {
      return <FiFile className="w-4 h-4 text-gray-600" />;
    }
  };
  const clearChatHistory = () => {
    setChatMessages([{
      content: 'Chat history cleared. How can I help you?',
      type: 'system',
      timestamp: new Date()
    }]);
  };







  const handleHomeScreenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeDescriptionInput.trim()) return;
    
    setHomeScreenFading(true);
  // Clear messages and show the generation message
    setChatMessages([]);
    addChatMessage(`Creating website: ${homeDescriptionInput}`, 'system');
  // Set loading stage immediately before hiding home screen
    setLoadingStage('planning');
  // Also ensure we're on preview tab to show the loading overlay
    setActiveTab('preview');
  setTimeout(() => {
      setShowHomeScreen(false);
      setHomeScreenFading(false);

      // Start the generation process
      generateWebsiteFromDescription(homeDescriptionInput);
    }, 800);
  };

  // Add the generateWebsiteFromDescription function here
  const generateWebsiteFromDescription = async (description: string) => {
    if (!description.trim()) {
      addChatMessage('Please provide a description of the website you want to create.', 'system');
  return;
    }

    addChatMessage(`Creating website: ${description}`, 'system');

    setConversationContext(prev => ({
      ...prev,
      currentProject: `Website: ${description}`
    }));
  // Start sandbox creation in parallel with code generation
    let sandboxPromise: Promise<void> | null = null;
  if (!sandboxData) {
      addChatMessage('Creating sandbox while generating your React app...', 'system');
      sandboxPromise = createSandbox(true);
  }

    addChatMessage('Generating your custom React application...', 'system');
  const generatePrompt = `Create a complete, modern React application based on this description:

"${description}"

REQUIREMENTS:
1. Create a COMPLETE React application with App.jsx as the main component
2. App.jsx MUST import and render all other components
3. Build all sections and features described by the user
4. Use a modern, professional design with excellent UX
5. Use semantic HTML elements (header, nav, main, section, footer)
6. Implement responsive design with mobile-first approach
7. Include hover effects and smooth transitions
8. Use modern CSS Grid and Flexbox for layouts
9. Ensure excellent accessibility (ARIA labels, semantic markup)
10. Create reusable components for repeated elements

DESIGN GUIDELINES:
- Use a modern color scheme with excellent contrast
- 
  Choose appropriate fonts and typography
- Include proper spacing and visual hierarchy
- Add subtle animations and micro-interactions
- Ensure the design feels professional and polished

TECHNICAL REQUIREMENTS:
- Use Tailwind CSS for ALL styling (no custom CSS files)
- Make sure the app actually renders visible content
- Create ALL components that you reference in imports
- Use placeholder images from Unsplash or similar services when needed
- Include realistic content that matches the description

Focus on creating a beautiful, functional website that matches the user's vision.`;
  setGenerationProgress(prev => ({
      ...prev,
      isGenerating: true,
      isStreaming: true,
      status: 'Generating React application...',
      components: [],
      currentComponent: 0,
      streamedCode: '',
      isThinking: false,
      thinkingText: undefined,
      thinkingDuration: undefined,
      files: prev.files || [],
      currentFile: undefined,
      lastProcessedPosition: 0,
    
      isEdit: false
    }));

    try {
      const response = await makeRequestWithBody('/api/generate-ai-code-stream', {
        prompt: generatePrompt,
        model: aiModel,
        context: {
          sandboxId: sandboxData?.sandboxId,
          conversationContext: conversationContext
        },
        isEdit: false
      });
  if (!response.ok) {
        throw new Error(`Generation failed: ${response.status}`);
  }

      const reader = response.body?.getReader();
  if (!reader) {
        throw new Error('No response body');
  }

      let generatedCode = '';
      const decoder = new TextDecoder();
  try {
        while (true) {
          const { done, value } = await reader.read();
  if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
  for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
  if (data.type === 'status') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: data.message
                  }));
  } else if (data.type === 'stream') {
                  generatedCode += data.text;
  setResponseArea(prev => [...prev, data.text]);
                } else if (data.type === 'component') {
                  setGenerationProgress(prev => ({
                    ...prev,
                    status: `Generated ${data.name}`,
                    components: [...prev.components, {
      
                      name: data.name,
                      path: data.path,
                      completed: true
                    }],
                 
  currentComponent: prev.currentComponent + 1
                  }));
  } else if (data.type === 'complete') {
                  if (data.generatedCode) {
                    generatedCode = data.generatedCode;
  }
                  setGenerationProgress(prev => ({
                    ...prev,
                    isGenerating: false,
                    isStreaming: false,
                  
  status: 'Generation complete!'
                  }));
  break;
                } else if (data.type === 'error') {
                  throw new Error(data.error);
  }
              } catch (e) {
                console.error('Error parsing SSE data:', e);
  }
            }
          }
        }
      } finally {
        reader.releaseLock();
  }

      if (generatedCode.trim()) {
        // Wait for sandbox to be ready if it was being created
        if (sandboxPromise) {
          await sandboxPromise;
  }

        await applyGeneratedCode(generatedCode, false);
  addChatMessage(
          `Successfully created your website! I've built a modern React application based on your description: "${description}". You can now ask me to modify specific sections, add features, or make any other changes.`,
          'ai',
          {
            websiteDescription: description,
            generatedCode: generatedCode
          }
    
      );

        // Clear generation progress
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          isStreaming: false,
          status: 'Generation complete!'
        }));
  setLoadingStage(null);

        setTimeout(() => {
          setActiveTab('preview');
        }, 100);
  } else {
        throw new Error('No code was generated');
  }
    } catch (error: any) {
      addChatMessage(`Failed to generate website: ${error.message}`, 'system');
  setLoadingStage(null);
      setGenerationProgress(prev => ({
        ...prev,
        isGenerating: false,
        isStreaming: false,
        status: 'Generation failed'
      }));
  setActiveTab('preview');
    }
  };

  return (
    // Top-level container uses theme variables
    <div className={`font-sans ${theme.bg_main} ${theme.text_main} h-screen flex flex-col`}>
      {/* Home Screen Overlay */}
      {showHomeScreen && (
        <div className={`fixed inset-0 z-50 transition-opacity duration-500 ${homeScreenFading ? 'opacity-0' : 'opacity-100'}`}>
          {/* Custom B&W/Glow Background, similar to the attached image */}
          <div className="absolute inset-0 bg-gray-950 overflow-hidden">
            {/* Soft, subtle radial glow matching the image's aesthetic */}
            <div className="absolute inset-0 opacity-80" style={{
              background: 'radial-gradient(circle at center, rgba(255, 0, 127, 0.2) 0%, rgba(0, 0, 0, 0.9) 70%)',
            }} />
            
            {/* The main pink/blue glow ring from the image */}
            <div className="absolute inset-0" style={{
              boxShadow: '0 0 100px 50px rgba(128, 0, 128, 0.5) inset, 0 0 100px 50px rgba(0, 0, 255, 0.3) inset',
              mixBlendMode: 'screen',
              opacity: 0.3,
            }} />

            {/* Subtle B&W/grain overlay for a classic feel */}
            <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)`,
                backgroundSize: '60px 60px'
            }} />

            {/* Animated simple blur circles */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gray-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          </div>
         
          
          {/* Close button on hover */}
          <button
            onClick={() => {
              setHomeScreenFading(true);
  setTimeout(() => {
                setShowHomeScreen(false);
                setHomeScreenFading(false);
              }, 500);
  }}
            className="absolute top-8 right-8 text-white/60 hover:text-white transition-all duration-300 opacity-0 hover:opacity-100 bg-white/10 backdrop-blur-sm p-2 rounded-lg border border-white/20"
            style={{ opacity: 0 }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 
  0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 px-6 py-4 flex items-center justify-between animate-[fadeIn_0.8s_ease-out]">
         
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                <span className="text-white font-bold text-lg">❤️</span>
              </div>
              <span className="text-white font-semibold text-lg">Open-Lovable</span>
            </div>
         
            <div className="flex items-center gap-3 sm:gap-4">
              <UserButton />
              {/* ✅ GITHUB BUTTON REMOVED AS REQUESTED */}
            </div>
          </div>
          
          {/* Main content */}
          <div className="relative z-10 h-full flex items-center justify-center px-4">
            {/* ✅ RESPONSIVENESS FIX: Removed min-w-[600px] and adjusted width to be flexible */}
            <div className="text-center w-full max-w-4xl mx-auto">
              {/* Enhanced Lovable-style Header */}
              
              <div className="text-center">
                <h1 className="text-[2.5rem] sm:text-[3.5rem] lg:text-[4.2rem] text-center text-white font-bold tracking-tight leading-[1.1] animate-[fadeIn_0.8s_ease-out] px-4">
                  <span className="block sm:inline">Build something </span>
                  <span className="bg-gradient-to-r from-gray-300 via-white to-gray-400 bg-clip-text text-transparent whitespace-nowrap">
                    ❤️ Open-Lovable
     
                  </span>
                </h1>
                <motion.p
                  className="text-lg lg:text-xl max-w-2xl mx-auto mt-8 text-white/90 text-center text-balance px-4"
                  transition={{ duration: 0.3, ease: "easeOut" }}
      
                  >
                  Create beautiful apps and websites by chatting with AI
                </motion.p>
                <motion.p
                  className="text-sm lg:text-base max-w-xl mx-auto mt-4 text-white/60 text-center px-4"
       
                  transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
                >
                  No coding required • Powered by AI • Open source
                </motion.p>
              </div>
         
      
              <form onSubmit={handleHomeScreenSubmit} className="mt-12 max-w-2xl mx-auto px-4">
                <div className="w-full relative group">
                  <div className="relative bg-black/30 backdrop-blur-md rounded-2xl border border-white/30 overflow-hidden shadow-2xl transition-all duration-300 group-hover:border-white/40 group-focus-within:border-white/50 group-focus-within:shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                    <input
      
                      type="text"
                      value={homeDescriptionInput}
                      onChange={(e) => {
                        const value = e.target.value;
  setHomeDescriptionInput(value);
                      }}
                      placeholder="Describe your dream app or website..."
                      className="h-16 w-full bg-transparent text-white placeholder-white/50 px-6 pr-16 focus:outline-none text-base transition-all duration-200 focus:placeholder-white/70"
                      autoFocus
                 
    />
                    <button
                      type="submit"
                      disabled={!homeDescriptionInput.trim()}
                      className="absolute top-1/2 transform -translate-y-1/2 right-4 w-10 h-10 bg-white/20 hover:bg-white/30 disabled:bg-gray-700/50 rounded-xl flex items-center justify-center transition-all duration-200 disabled:cursor-not-allowed shadow-lg hover:shadow-xl disabled:opacity-50"
                      title="Create with AI"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
         
                        <path d="M5 12h14M12 5l7 7-7 7"></path>
                      </svg>
                    </button>
                  </div>

                  {/* Subtle 
  glow effect */}
                  <div className="absolute inset-0 bg-white/10 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 -z-10" />
                </div>

                {/* Example prompts */}
                <div className="mt-6 flex flex-wrap justify-center gap-2 px-4">
         
                  {[
                    "A modern portfolio website",
                    "E-commerce store with cart",
                    "Social media dashboard",
                    "Task management app"
 
                  ].map((example, index) => (
                    <button
                      key={example}
                      onClick={() => setHomeDescriptionInput(example)}
              
                      className="px-4 py-2 text-sm text-white/70 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full hover:bg-white/10 hover:text-white/90 transition-all duration-200 hover:scale-105"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      {example}
          
                      </button>
                  ))}
                </div>
              </form>
              
              {/* Enhanced Model Selector */}
          
              <div className="mt-10 flex flex-col items-center justify-center animate-[fadeIn_1s_ease-out] px-4">
                <div className="text-white/60 text-sm mb-3">Powered by</div>
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
                  className="px-6 py-3 text-sm bg-white/10 backdrop-blur-md text-white border border-white/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 transition-all duration-200 hover:bg-white/15 cursor-pointer"
                >
                  {appConfig.ai.availableModels.map(model => (
                    <option key={model} value={model} className="bg-gray-900 text-white">
      
                      {(appConfig.ai.modelDisplayNames as any)[model] || model}
                    </option>
                  ))}
                </select>
              </div>
            
            </div>
          </div>
        </div>
      )}
      
      {/* Main Header */}
      <div className={`px-4 py-4 border-b ${theme.border_color} flex items-center justify-between ${theme.bg_card}`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-lg flex items-center justify-center border ${theme.border_color}`}>
           
              <span className={`font-bold text-lg ${theme.text_main}`}>❤️</span>
            </div>
            {/* ✅ RESPONSIVENESS: Hide text on small screens */}
            <span className={`font-semibold text-lg ${theme.text_main} hidden sm:inline`}>Open-Lovable</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Day/Night Mode Toggle */}
          <Button 
            variant="code"
            onClick={toggleTheme}
            size="sm"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className={`${isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'} transition-colors duration-200`}
          >
            {isDarkMode ? <FaSun className="w-4 h-4 text-yellow-300" /> : <FaMoon className="w-4 h-4 text-gray-600" />}
          </Button>

          <UserButton />
          {/* Model Selector */}
          {/* ✅ RESPONSIVENESS: Hide on small screens */}
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
            className={`px-3 py-1.5 text-sm ${isDarkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border rounded-[10px] focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-colors duration-200 hidden md:inline-block`}
          >
            {appConfig.ai.availableModels.map(model => (
              <option key={model} value={model} className={isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}>
                {(appConfig.ai.modelDisplayNames as any)[model] || model}
              </option>
    
          ))}
          </select>
          <Button 
            variant="code"
            onClick={() => createSandbox()}
            size="sm"
            title="Create new sandbox"
            className={`${isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'} transition-colors duration-200`}
          >
         
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Button>
          <Button 
            variant="code"
            onClick={reapplyLastGeneration}
            
  size="sm"
            title="Re-apply last generation"
            disabled={!conversationContext.lastGeneratedCode ||
  !sandboxData}
            className={`${isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700 disabled:bg-gray-900/50' : 'bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:bg-gray-100/50'} transition-colors duration-200`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </Button>
          <Button 
     
            variant="code"
            onClick={downloadZip}
            disabled={!sandboxData}
            size="sm"
            title="Download your Vite app as ZIP"
            className={`${isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700 disabled:bg-gray-900/50' : 'bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:bg-gray-100/50'} transition-colors duration-200`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </Button>
          <div className={`inline-flex items-center gap-2 ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-900'} px-3 py-1.5 rounded-[10px] text-sm font-medium [box-shadow:none]`}>
            <span id="status-text">{status.text}</span>
            <div className={`w-2 h-2 rounded-full ${status.active ?
  'bg-green-500' : 'bg-gray-500'}`} />
          </div>
        </div>
      </div>

      {/* ✅ RESPONSIVENESS FIX: Reverted to flex-row to keep side-by-side layout */}
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* Center Panel - AI Chat */}
        {/* ✅ RESPONSIVENESS FIX: Adjusted width to be flexible on mobile (w-2/5) and fixed on large screens (lg:max-w-[400px]) */}
        <div className={`flex flex-col border-r ${theme.border_color} ${theme.bg_card} w-2/5 lg:w-auto lg:flex-1 lg:max-w-[400px]`}>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 scrollbar-hide" ref={chatMessagesRef}>
            {chatMessages.map((msg, 
  idx) => {
              // Check if this message is from a successful generation
              const isGenerationComplete = msg.content.includes('Successfully recreated') || 
                                         msg.content.includes('AI recreation generated!') ||
           
                                         msg.content.includes('Code generated!');
              
              // Get the files from metadata if this is a completion message
              const completedFiles = msg.metadata?.appliedFiles || [];
           
                
              return (
                <div key={idx} className="block">
                  <div className={`flex ${msg.type === 'user' ?
  'justify-end' : 'justify-start'} mb-1`}>
                    <div className="block">
                      <div className={`block rounded-[10px] px-4 py-2 ${
                        msg.type === 'user' ?
  `${theme.chat_user_bg} text-white ml-auto max-w-[80%]` :
                        msg.type === 'ai' ?
  `${theme.chat_ai_bg} ${theme.text_main} mr-auto max-w-[80%]` :
                        msg.type === 'system' ?
  `${theme.chat_user_bg} text-white text-sm` :
                        msg.type === 'command' ?
  `${theme.chat_user_bg} text-white font-mono text-sm` :
                        msg.type === 'error' ?
  'bg-red-800 text-red-100 text-sm border border-red-700' :
  `${theme.chat_user_bg} text-white text-sm`
                      }`}>
                    {msg.type === 'command' ?
  (
                      <div className="flex items-start gap-2">
                        <span className={`text-xs ${
                          msg.metadata?.commandType === 'input' ? 'text-blue-400' :
                  
                          msg.metadata?.commandType === 'error' ? 'text-red-400' :
                          msg.metadata?.commandType === 'success' ? 'text-green-400' :
                          'text-gray-400'
                        }`}>
      
                          {msg.metadata?.commandType === 'input' ? '$' : '>'}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap text-white">{msg.content}</span>
                      </div>
 
                    ) : msg.type === 'error' ?
  (
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-red-700 rounded-full flex items-center justify-center">
                 
                            <svg className="w-5 h-5 text-red-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
    
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold mb-1">Build 
  Errors Detected</div>
                          <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                          <div className="mt-2 text-xs opacity-70">Press 'F' or click the Fix button above to resolve</div>
                        </div>
         
                      </div>
                    ) : (
                      msg.content
                    )}
                      </div>
 
                  
                      {/* Show applied files if this is an apply success message */}
                      {msg.metadata?.appliedFiles && msg.metadata.appliedFiles.length > 0 && (
                    <div className={`mt-2 
  inline-block ${theme.bg_card} rounded-[10px] p-3`}>
                      <div className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`}>
                        {msg.content.includes('Applied') ?
  'Files Updated:' : 'Generated Files:'}
                      </div>
                      <div className="flex flex-wrap items-start gap-1">
                        {msg.metadata.appliedFiles.map((filePath, fileIdx) => {
                     
                          const fileName = filePath.split('/').pop() || filePath;
                          const fileExt = fileName.split('.').pop() || '';
                          const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                     
                            fileExt === 'css' ? 'css' :
                                          fileExt === 'json' ? 'json' : 'text';
                          
  
                          return (
                            <div
                              key={`applied-${fileIdx}`}
               
                              className={`inline-flex items-center gap-1 px-2 py-1 ${theme.chat_user_bg} text-white rounded-[10px] text-xs animate-fade-in-up`}
                              style={{ animationDelay: `${fileIdx * 30}ms` }}
                            >
             
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                                fileType === 'css' ?
  'bg-blue-400' :
                                fileType === 'javascript' ?
  'bg-yellow-400' :
                                fileType === 'json' ?
  'bg-green-400' :
                                'bg-gray-400'
                              }`} />
                              {fileName}
      
                            </div>
                          );
  })}
                      </div>
                    </div>
                  )}
                  
                      
  {/* Show generated files for completion messages - but only if no appliedFiles already shown */}
                      {isGenerationComplete && generationProgress.files.length > 0 && idx === chatMessages.length - 1 && !msg.metadata?.appliedFiles && !chatMessages.some(m => m.metadata?.appliedFiles) && (
                    <div className={`mt-2 inline-block ${theme.bg_card} rounded-[10px] p-3`}>
                    
  <div className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`}>Generated Files:</div>
                      <div className="flex flex-wrap items-start gap-1">
                        {generationProgress.files.map((file, fileIdx) => (
                          <div
              
                              key={`complete-${fileIdx}`}
                            className={`inline-flex items-center gap-1 px-2 py-1 ${theme.chat_user_bg} text-white rounded-[10px] text-xs animate-fade-in-up`}
                            style={{ animationDelay: `${fileIdx * 30}ms` }}
                
                          >
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                              file.type === 'css' ?
  'bg-blue-400' :
                              file.type === 'javascript' ?
  'bg-yellow-400' :
                              file.type === 'json' ?
  'bg-green-400' :
                              'bg-gray-400'
                            }`} />
                            {file.path.split('/').pop()}
            
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
  
                    </div>
                    </div>
                  </div>
              );
  })}
            
            {/* Code application progress */}
            {codeApplicationState.stage && (
              <CodeApplicationProgress state={codeApplicationState} />
            )}
            
            {/* File generation progress - inline 
  display (during generation) */}
            {generationProgress.isGenerating && (
              <div className={`inline-block ${theme.bg_card} rounded-lg p-3`}>
                <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-700'}`}>
                  {generationProgress.status}
                </div>
           
                <div className="flex flex-wrap items-start gap-1">
                  {/* Show completed files */}
                  {generationProgress.files.map((file, idx) => (
                    <div
                      key={`file-${idx}`}
      
                      className={`inline-flex items-center gap-1 px-2 py-1 ${theme.chat_user_bg} text-white rounded-[10px] text-xs animate-fade-in-up`}
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 
  24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      {file.path.split('/').pop()}
                    </div>
  
                  ))}
                  
                  {/* Show current file being generated */}
                  {generationProgress.currentFile && (
                    <div className={`flex 
  items-center gap-1 px-2 py-1 ${theme.chat_user_bg}/70 text-white rounded-[10px] text-xs animate-pulse`}
                      style={{ animationDelay: `${generationProgress.files.length * 30}ms` }}>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {generationProgress.currentFile.path.split('/').pop()}
             
                      </div>
                  )}
                </div>
                
                {/* Live streaming response display */}
                {generationProgress.streamedCode && (
    
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
          
                    transition={{ duration: 0.3 }}
                    className={`mt-3 border-t ${theme.border_color} pt-3`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      
  <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-gray-400">AI Response Stream</span>
                      </div>
                
                      <div className="flex-1 h-px bg-gradient-to-r from-gray-300 to-transparent" />
                    </div>
                    <div className={`bg-gray-900 border border-gray-700 rounded max-h-32 overflow-y-auto scrollbar-hide`}>
                      <SyntaxHighlighter
                   
                        language="jsx"
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                    
                          padding: '0.75rem',
                          fontSize: '11px',
                          lineHeight: '1.5',
                          background: 'transparent',
            
                          maxHeight: '8rem',
                          overflow: 'hidden'
                        }}
                      >
            
                        {(() => {
                          const lastContent = generationProgress.streamedCode.slice(-1000);
  // Show the last part of the stream, starting from a complete tag if possible
                          const startIndex = lastContent.indexOf('<');
  return startIndex !== -1 ? lastContent.slice(startIndex) : lastContent;
                        })()}
                      </SyntaxHighlighter>
                      <span className="inline-block w-2 h-3 bg-orange-400 ml-3 mb-3 animate-pulse" />
                    </div>
                  </motion.div>
  
                )}
              </div>
            )}
          </div>

          <div className={`p-4 border-t ${theme.border_color} ${theme.bg_card}`}>
            <div className="relative">
              <Textarea
         
                className={`min-h-[60px] pr-12 resize-y border-2 ${theme.border_color} focus:outline-none ${theme.bg_card} ${theme.text_main}`}
                placeholder="Ask AI to edit or add features..."
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key 
  === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
  sendChatMessage();
                  }
                }}
                rows={3}
              />
              <button
                onClick={sendChatMessage}
                className={`absolute right-2 bottom-2 p-2 ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-800 hover:bg-gray-900'} text-white rounded-[10px] 
  [box-shadow:none] transition-all duration-200`}
                title="Send message (Enter)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        
  </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Preview or Generation */}
        {/* ✅ RESPONSIVENESS FIX: Adjusted width to take remaining space */}
        <div className="flex-1 flex flex-col overflow-hidden w-3/5 lg:w-auto">
          <div className={`px-4 py-2 ${theme.bg_card} border-b ${theme.border_color} flex 
  justify-between items-center`}>
            <div className="flex items-center gap-4">
              <div className={`flex ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-lg p-1`}>
                <button
                  onClick={() => setActiveTab('generation')}
                  className={`p-2 rounded-md transition-all ${
         
                    activeTab === 'generation' 
                      ?
  `${theme.bg_main} text-white` 
                      : `${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-300'}`
                  }`}
                  title="Code"
                >
                  <svg className="w-4 h-4" 
  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </button>
                <button
              
                  onClick={() => setActiveTab('preview')}
                  className={`p-2 rounded-md transition-all ${
                    activeTab === 'preview' 
                      ?
  `${theme.bg_main} text-white` 
                      : `${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-300'}`
                  }`}
                  title="Preview"
                >
                  <svg className="w-4 h-4" 
  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
  
                </button>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {/* Live Code Generation Status - Moved to far right */}
              {activeTab === 'generation' && (generationProgress.isGenerating || generationProgress.files.length 
  > 0) && (
                <div className="flex items-center gap-3">
                  {!generationProgress.isEdit && (
                    <div className="text-gray-400 text-sm">
                      {generationProgress.files.length} files generated
            
                      </div>
                  )}
                  <div className={`inline-flex items-center justify-center whitespace-nowrap rounded-[10px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${theme.chat_user_bg} text-white [box-shadow:none] h-8 px-3 py-1 text-sm gap-2`}>
                    {generationProgress.isGenerating ?
  (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                        {generationProgress.isEdit ? 'Editing code' : 'Live code generation'}
                
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-gray-500 rounded-full" />
                     
  COMPLETE
                      </>
                    )}
                  </div>
                </div>
              )}
       
  {sandboxData && !generationProgress.isGenerating && (
                <>
                  <Button
                    variant="code"
                    size="sm"
               
                      asChild
                    className={`${isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'} transition-colors duration-200`}
                  >
                    <a 
                      href={sandboxData.url} 
                      target="_blank" 
          
                      rel="noopener noreferrer"
                      title="Open in new tab"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </Button>
        
  </>
              )}
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            {renderMainContent()}
          </div>
        </div>
      </div>
    </div>
  );
  // End of AISandboxPage
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">Loading...</div>}>
      <AISandboxPage />
    </Suspense>
  );
}
