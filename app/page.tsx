'use client';

import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
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
  BsFolderFill,
  BsFolder2Open,
  SiJavascript,
  SiReact,
  SiCss3,
  SiJson,
  FaSun,    // Day Mode Icon
  FaMoon    // Night Mode Icon
} from '@/lib/icons';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { UserButton } from '@/components/UserButton';
import { useApiRequest } from '@/hooks/useApiRequest';
import { motion } from 'framer-motion';
import CodeApplicationProgress, { type CodeApplicationState } from '@/components/CodeApplicationProgress';
import ApiKeySettings from '@/components/ApiKeySettings';
import { ApiKeysProvider } from '@/contexts/ApiKeysContext';
import { ThemeProvider } from 'next-themes';
import type { ConversationState, ConversationMessage } from '@/types/conversation';



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

interface ProjectSummary {
  id: string;
  name: string;
  description?: string | null;
  last_prompt?: string | null;
  sandbox_id?: string | null;
  updated_at: string;
  last_opened_at?: string | null;
}

function AISandboxPage({ isDarkMode, setIsDarkMode, theme }: { isDarkMode: boolean, setIsDarkMode: (value: boolean) => void, theme: any }) {
  const { makeRequest, makeRequestWithBody } = useApiRequest();
  const { data: session } = useSession();
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
  const [showApiKeysSettings, setShowApiKeysSettings] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const loadProjects = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`);
      }
      const data = await response.json();
      if (data.success && Array.isArray(data.projects)) {
        setProjects(data.projects);
      } else if (!data.success) {
        throw new Error(data.error || 'Failed to load projects');
      }
    } catch (error) {
      setProjectsError((error as Error).message);
    } finally {
      setProjectsLoading(false);
    }
  }, [session?.user?.id]);

  const syncConversationState = useCallback(
    async (
      action: 'reset' | 'update' | 'clear-old' | 'hydrate',
      payload: {
        projectId?: string | null;
        data?: Record<string, unknown>;
        state?: ConversationState;
      } = {}
    ) => {
      try {
        await fetch('/api/conversation-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            projectId: payload.projectId ?? activeProjectId ?? undefined,
            data: payload.data,
            state: payload.state,
          }),
        });
      } catch (error) {
        console.error('[conversation-state] sync error:', error);
      }
    },
    [activeProjectId]
  );

  const hydrateFromState = useCallback((state: ConversationState) => {
    const mapMetadata = (
      metadata: ConversationMessage['metadata']
    ): ChatMessage['metadata'] | undefined => {
      if (!metadata) return undefined;
      return {
        editedFiles: metadata.editedFiles,
        addedPackages: metadata.addedPackages,
        editType: metadata.editType,
        sandboxId: metadata.sandboxId,
      } as ChatMessage['metadata'];
    };

    const mappedMessages: ChatMessage[] = (state.context.messages || []).map(msg => ({
      content: msg.content,
      type: msg.role === 'assistant' ? 'ai' : 'user',
      timestamp: new Date(msg.timestamp),
      metadata: mapMetadata(msg.metadata),
    }));

    setChatMessages(mappedMessages);
    setConversationContext({
      generatedComponents: [],
      appliedCode: (state.context.edits || []).map(edit => ({
        files: edit.targetFiles,
        timestamp: new Date(edit.timestamp),
      })),
      currentProject: state.context.currentTopic || '',
      lastGeneratedCode: undefined,
    });
  }, []);
  
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

  // Netlify deployment states
  const [netlifyConnected, setNetlifyConnected] = useState(false);
  const [deploymentLoading, setDeploymentLoading] = useState(false);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [showDeploymentSuccess, setShowDeploymentSuccess] = useState(false);
  const [deploymentData, setDeploymentData] = useState<{
    url: string;
    siteId: string;
    deploymentId: string;
  } | null>(null);

  // Sandbox confirmation states
  const [showSandboxConfirmation, setShowSandboxConfirmation] = useState(false);
  const [pendingDescription, setPendingDescription] = useState<string | null>(null);
  const [techStack, setTechStack] = useState<'html' | 'react' | 'nextjs' | 'angular'>('react');
  const [showTechStackSelector, setShowTechStackSelector] = useState(false);
  const [pendingSandboxAction, setPendingSandboxAction] = useState<'home' | 'chat' | null>(null);

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
  const techSelectorNoticeRef = useRef({
    techPromptShown: false,
    sandboxWarningShown: false,
  });
  const htmlSanitizationNotifiedRef = useRef(false);
  const [lastEditedFile, setLastEditedFile] = useState<string | null>(null);
  const [lastCompletedFiles, setLastCompletedFiles] = useState<Array<{
    path: string;
    content: string;
    type: string;
    completed: boolean;
  }>>([]);
  const filesSignature = useMemo(
    () =>
      generationProgress.files
        .map(file => `${file.path}:${file.content.length}:${file.completed ? '1' : '0'}`)
        .join('|'),
    [generationProgress.files]
  );

  useEffect(() => {
    if (generationProgress.currentFile?.path) {
      setLastEditedFile(generationProgress.currentFile.path);
    }
  }, [generationProgress.currentFile?.path]);

  useEffect(() => {
    if (generationProgress.files.length > 0) {
      setLastCompletedFiles(generationProgress.files.map(file => ({ ...file })));
    }
  }, [filesSignature, generationProgress.files.length]);

  const sanitizeGeneratedOutput = useCallback(
    (code: string) => {
      if (techStack !== 'html' || !code) {
        return code;
      }

      const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;

      return code.replace(fileRegex, (match, filePath, fileContent) => {
        if (!filePath.endsWith('.html')) {
          return match;
        }

        let sanitizedContent = fileContent;

        sanitizedContent = sanitizedContent.replace(/className=/g, 'class=');
        sanitizedContent = sanitizedContent.replace(/htmlFor=/g, 'for=');
        sanitizedContent = sanitizedContent.replace(/tabIndex=/g, 'tabindex=');
        sanitizedContent = sanitizedContent.replace(/<\/?(React\.)?Fragment>/g, '');
        sanitizedContent = sanitizedContent.replace(/import\s+React[^;]*;?\s*/g, '');
        sanitizedContent = sanitizedContent.replace(/from\s+['"]react['"];?\s*/g, '');
        sanitizedContent = sanitizedContent.replace(/export\s+default[^;]*;?\s*/g, '');

        sanitizedContent = sanitizedContent.replace(/\son[a-zA-Z]+\s*=\s*\{[^}]+\}/g, '');
        sanitizedContent = sanitizedContent.replace(/\son[a-zA-Z]+\s*=\s*["'][^"']*["']/g, '');

        sanitizedContent = sanitizedContent.replace(
          /style=\{\s*{([^}]*)}\s*\}/g,
          (_, styleBody: string) => {
            const rules = styleBody
              .split(',')
              .map(rule => rule.trim())
              .filter(Boolean)
              .map(rule => {
                const [prop, value] = rule.split(':');
                if (!prop || !value) {
                  return null;
                }
                const kebabProp = prop
                  .trim()
                  .replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
                const cleanedValue = value.trim().replace(/^['"]|['"]$/g, '');
                return `${kebabProp}: ${cleanedValue}`;
              })
              .filter(Boolean)
              .join('; ');

            return rules ? `style="${rules}"` : '';
          }
        );

        sanitizedContent = sanitizedContent.replace(
          /(\s[\w:-]+)=\{([^}]+)\}/g,
          (_fullMatch, attrWithSpace: string, expression: string) => {
            const attributeName = attrWithSpace.trim();
            const cleanedExpression = expression
              .trim()
              .replace(/^['"]|['"]$/g, '')
              .replace(/^`|`$/g, '');

            return cleanedExpression
              ? ` ${attributeName}="${cleanedExpression}"`
              : ` ${attributeName}`;
          }
        );

        sanitizedContent = sanitizedContent.replace(
          /<script([^>]*)type=(["'])module\2([^>]*)>([\s\S]*?)<\/script>/gi,
          (_scriptMatch, beforeType, quote, afterType, scriptBody) =>
            `<script${beforeType}type="text/javascript"${afterType}>${scriptBody}</script>`
        );

        return `<file path="${filePath}">${sanitizedContent}</file>`;
      });
    },
    [techStack]
  );

  useEffect(() => {
    if (!session?.user?.id) {
      setProjects([]);
      setActiveProjectId(null);
      return;
    }

    loadProjects();
  }, [session?.user?.id, loadProjects]);

  // Clear old conversation data on component mount (NO AUTO-SANDBOX CREATION)
  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      // Clear old conversation
      try {
        await syncConversationState('clear-old');
        console.log('[home] Cleared old conversation data on mount');
      } catch (error) {
        console.error('[ai-sandbox] Failed to clear old conversation:', error);
        if (isMounted) {
          addChatMessage('Failed to clear old conversation data.', 'error');
        }
      }
      
      if (!isMounted) return;

      // Check if sandbox ID is in URL (restore existing sandbox)
      const sandboxIdParam = searchParams.get('sandbox');
      
      if (sandboxIdParam) {
        console.log('[home] Found sandbox in URL:', sandboxIdParam);
        // Check if sandbox is still active
        try {
          const response = await fetch('/api/sandbox-status');
          const data = await response.json();
          
          if (data.active && data.healthy) {
            console.log('[home] Sandbox is still active');
            // Sandbox is active, no need to create new one
          } else {
            console.log('[home] Sandbox is not active, user will need to create one');
            addChatMessage('⚠️ Previous sandbox is no longer active. Please start a new project or generate code to create a sandbox.', 'system');
          }
        } catch (error) {
          console.error('[home] Error checking sandbox status:', error);
        }
      } else {
        console.log('[home] No sandbox in URL, waiting for user action...');
        addChatMessage('👋 Welcome! Describe what you want to build and I\'ll create it for you. A sandbox will be created automatically when you start generating code.', 'system');
      }
    };
    
    initializePage();
    return () => {
      isMounted = false;
    };
  }, []);
  // Run only on mount
  
  // No longer needed - using direct token from API keys

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
  // Keep-alive mechanism to prevent sandbox from closing
  useEffect(() => {
    if (!sandboxData?.sandboxId) return;

    console.log('[keep-alive] Starting keep-alive mechanism for sandbox:', sandboxData.sandboxId);

    // Check sandbox status every 30 seconds to keep it alive
    const keepAliveInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/sandbox-status');
        const data = await response.json();
        
        if (data.active && data.healthy) {
          console.log('[keep-alive] Sandbox is healthy');
          updateStatus('Sandbox active', true);
        } else if (data.active && !data.healthy) {
          console.warn('[keep-alive] Sandbox is not responding, attempting to recover...');
          updateStatus('Reconnecting...', false);
        } else {
          console.error('[keep-alive] Sandbox is not active');
          updateStatus('Sandbox disconnected', false);
        }
      } catch (error) {
        console.error('[keep-alive] Health check failed:', error);
      }
    }, 30000); // Every 30 seconds

    return () => {
      console.log('[keep-alive] Stopping keep-alive mechanism');
      clearInterval(keepAliveInterval);
    };
  }, [sandboxData?.sandboxId]);

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

  const handleProjectSelect = useCallback(
    async (project: ProjectSummary) => {
      try {
        setProjects(prev => [project, ...prev.filter(p => p.id !== project.id)]);
        setActiveProjectId(project.id);
        
        // Show loading message
        addChatMessage(`📂 Loading project: ${project.name}...`, 'system');

        const response = await fetch(`/api/projects?projectId=${project.id}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Failed to load project (${response.status})`);
        }

        const data = await response.json();
        if (!data.success || !data.project) {
          throw new Error(data.error || 'Failed to load project');
        }

        const projectDetail = data.project as ProjectSummary & {
          last_state?: ConversationState | null;
        };

        if (projectDetail.last_prompt) {
          setHomeDescriptionInput(projectDetail.last_prompt);
        }

        // Check if sandbox is still active
        if (projectDetail.sandbox_id) {
          const sandboxResponse = await fetch('/api/sandbox-status');
          const sandboxData = await sandboxResponse.json();
          
          if (sandboxData.active && sandboxData.healthy) {
            addChatMessage('✅ Sandbox is still active and ready!', 'system');
          } else {
            addChatMessage('⚠️ Previous sandbox is no longer active. Create a new one if needed.', 'system');
          }
        }

        if (projectDetail.last_state) {
          // Restore conversation history
          hydrateFromState(projectDetail.last_state);
          addChatMessage(`✅ Loaded ${projectDetail.last_state.context.messages?.length || 0} previous messages`, 'system');
          
          await syncConversationState('hydrate', {
            projectId: projectDetail.id,
            state: projectDetail.last_state,
            data: {
              sandboxId: projectDetail.sandbox_id,
              lastPrompt: projectDetail.last_prompt,
            },
          });
        } else {
          addChatMessage(`📝 Project loaded: ${project.name}`, 'system');
          await syncConversationState('reset', {
            projectId: projectDetail.id,
            data: {
              sandboxId: projectDetail.sandbox_id,
              lastPrompt: projectDetail.last_prompt,
            },
          });
          setChatMessages([]);
        }

        if (session?.user?.id) {
          await loadProjects();
        }

        setShowHomeScreen(false);
        setHomeScreenFading(false);
      } catch (error) {
        console.error('[projects] select error:', error);
        addChatMessage('Failed to load project conversation state.', 'error');
      }
    },
    [hydrateFromState, syncConversationState, addChatMessage, session?.user?.id, loadProjects]
  );

  const ensureProjectForPrompt = useCallback(
    async (prompt: string) => {
      if (!session?.user?.id) {
        return null;
      }

      if (activeProjectId) {
        await syncConversationState('update', {
          projectId: activeProjectId,
          data: {
            lastPrompt: prompt,
            sandboxId: sandboxData?.sandboxId,
          },
        });
        return activeProjectId;
      }

      try {
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initialPrompt: prompt,
            sandboxId: sandboxData?.sandboxId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create project (${response.status})`);
        }

        const data = await response.json();
        if (!data.success || !data.project) {
          throw new Error(data.error || 'Failed to create project');
        }

        const { project } = data;
        setActiveProjectId(project.id);
        setProjects(prev => [project, ...prev.filter(p => p.id !== project.id)]);
        await loadProjects();

        await syncConversationState('reset', {
          projectId: project.id,
          data: {
            sandboxId: sandboxData?.sandboxId,
            lastPrompt: prompt,
          },
        });

        return project.id as string;
      } catch (error) {
        console.error('[projects] create error:', error);
        addChatMessage('Unable to create project record. Progress will not be saved.', 'error');
        return null;
      }
  },
  [session?.user?.id, activeProjectId, sandboxData?.sandboxId, syncConversationState, addChatMessage, loadProjects]
  );
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

  const createSandbox = async (fromHomeScreen = false, autoStartDescription?: string) => {
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
        setPendingSandboxAction(null);
        techSelectorNoticeRef.current = {
          techPromptShown: false,
          sandboxWarningShown: false,
        };
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
          addChatMessage(`✅ Sandbox created! ID: ${data.sandboxId}`, 'system');
  }
        
        setTimeout(() => {
          if (iframeRef.current) {
            iframeRef.current.src = data.url;
          }
        }, 100);
        
        // If there's a description to auto-start, begin generation after sandbox is ready
        if (autoStartDescription && fromHomeScreen) {
          addChatMessage('🚀 Starting code generation...', 'system');
          setTimeout(async () => {
            await generateWebsiteFromDescription(autoStartDescription);
          }, 2500); // Wait for sandbox to fully initialize
        }
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
          {/* File Explorer - Hide during edits and collapsible on mobile */}
          {!generationProgress.isEdit && (
            <div className={`hidden lg:flex w-[220px] xl:w-[250px] border-r ${theme.border_color} ${theme.bg_card} 
  flex-col flex-shrink-0 ${theme.text_main}`}>
            <div className={`p-2.5 lg:p-3 bg-gray-800/50 backdrop-blur-sm text-white flex items-center justify-between border-b border-gray-700/50`}>
              <div className="flex items-center gap-2">
                <BsFolderFill className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-blue-400" />
                <span className="text-xs lg:text-sm font-semibold tracking-wide">FILES</span>
              </div>
            
  </div>
            
            {/* File Tree */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
              <div className="text-sm">
                {/* Root app folder */}
                <div 
     
                  className={`flex items-center gap-1.5 py-1.5 px-2 hover:bg-gray-800/70 rounded-md cursor-pointer transition-colors group ${theme.text_main}`}
                  onClick={() => toggleFolder('app')}
                >
                  {expandedFolders.has('app') ?
  (
                    <FiChevronDown className={`w-3.5 h-3.5 text-gray-500 group-hover:text-gray-400`} />
                  ) : (
                    <FiChevronRight className={`w-3.5 h-3.5 text-gray-500 group-hover:text-gray-400`} />
                  )}
              
                  {expandedFolders.has('app') ? (
                    <BsFolder2Open className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <BsFolderFill className="w-3.5 h-3.5 text-blue-500" />
                  )}
        
                  <span className={`text-xs lg:text-sm font-medium ${theme.text_main} group-hover:text-white`}>app</span>
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
            
                              className={`flex items-center gap-1.5 py-1.5 px-2 hover:bg-gray-800/70 rounded-md cursor-pointer transition-colors group ${theme.text_main}`}
                              onClick={() => toggleFolder(dir)}
                            >
              
                              {expandedFolders.has(dir) ? (
                                <FiChevronDown className={`w-3 h-3 ${isDarkMode ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-600'}`} />
                              ) : (
              
                                <FiChevronRight className={`w-3 h-3 ${isDarkMode ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-600'}`} />
                              )}
                              {expandedFolders.has(dir) ? (
                
                                <BsFolder2Open className="w-3.5 h-3.5 text-yellow-400" />
                              ) : (
                                <BsFolderFill className="w-3.5 h-3.5 text-yellow-500" />
            
                              )}
                              <span className={`text-xs lg:text-sm ${theme.text_main} group-hover:text-white`}>{dir.split('/').pop()}</span>
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
                 
                                    className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-all group ${
                                      isSelected 
                                  
  ? 'bg-blue-600/90 text-white shadow-sm' 
                                        : `${theme.text_main} hover:bg-gray-800/70`
                                    }`}
             
                                    onClick={() => handleFileClick(fullPath)}
                                  >
                                    <div className={`flex-shrink-0 ${isSelected ? '' : 'group-hover:scale-110 transition-transform'}`}>
                                      {getFileIcon(fileInfo.name)}
                                    </div>
     
                                     <span className={`text-xs flex-1 flex items-center gap-1.5 truncate ${
                                       isSelected ? 'font-semibold' : 'font-normal group-hover:font-medium'
                                     }`}>
                                      <span className="truncate">{fileInfo.name}</span>
                                      {fileInfo.edited && (
                    
                                         <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                                          isSelected ? 'bg-blue-400/30 text-blue-100' : 'bg-orange-500/90 text-white'
                             
  }`}>M</span>
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
     
                  <div className={`${theme.code_bg} border ${theme.border_color} rounded-lg p-4 max-h-48 overflow-y-auto scrollbar-hide`}>
                    <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
                      {generationProgress.thinkingText}
                    </pre>
             
  </div>
                )}
              </div>
            )}
            
            {/* Live Code Display */}
            <div className="flex-1 p-2 sm:p-4 lg:p-6 flex flex-col min-h-0 overflow-hidden">
      
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide" ref={codeDisplayRef}>
                {/* Show selected file if one is selected */}
                {selectedFile ?
  (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className={`${theme.code_bg} border ${theme.border_color} rounded-xl overflow-hidden shadow-lg`}>
                      {/* File Tab */}
                      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700/50 text-white flex items-center justify-between">
                       
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="flex-shrink-0">{getFileIcon(selectedFile)}</div>
                          <span className="font-mono text-xs sm:text-sm truncate font-medium">{selectedFile}</span>
                          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" title="Active file" />
                        </div>
                  
                        <button
                          onClick={() => setSelectedFile(null)}
                          className="flex-shrink-0 hover:bg-gray-700/70 p-1.5 rounded-md transition-all hover:scale-110 ml-2"
                          title="Close file"
                        >
             
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                
                        </button>
                      </div>
                      {/* Code Content */}
                      <div className={`bg-gray-950`}>
                        <SyntaxHighlighter
                    
                          language={(() => {
                            const ext = selectedFile.split('.').pop()?.toLowerCase();
  if (ext === 'css') return 'css';
                            if (ext === 'json') return 'json';
                            if (ext === 'html') return 'html';
                            return 'jsx';
  })()}
                          style={vscDarkPlus}
                          showLineNumbers={true}
                          wrapLines={true}
                          lineNumberStyle={{
                            minWidth: '3em',
                            paddingRight: '1em',
                            color: '#6B7280',
                            textAlign: 'right',
                            userSelect: 'none',
                            fontSize: '11px'
                          }}
                          customStyle={{
                            margin: 0,
                   
                            padding: '1rem',
                            fontSize: '0.875rem',
                            background: 'transparent',
                          }}
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
          
                    <div className={`${theme.code_bg} border ${theme.border_color} rounded-lg overflow-hidden`}>
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
                      <div className={`${theme.code_bg} border-2 border-gray-400 rounded-lg overflow-hidden shadow-sm`}>
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
                      <div key={idx} className={`${theme.code_bg} border ${theme.border_color} rounded-lg overflow-hidden`}>
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
                      <div className={`${theme.code_bg} border ${theme.border_color} rounded-lg overflow-hidden`}>
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
          <div className={`relative w-full h-full ${theme.bg_main} flex items-center justify-center`}>
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
                title="Youssef AI Sandbox"
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
    
    // Check if sandbox needs to be created
    let sandboxPromise: Promise<void> | null = null;
    let sandboxCreating = false;
    
    if (!sandboxData) {
      if (!showSandboxConfirmation) {
        setShowSandboxConfirmation(true);
      }
      setPendingSandboxAction('chat');
      if (!techSelectorNoticeRef.current.sandboxWarningShown) {
        addChatMessage('⚠️ A sandbox environment needs to be created to run your code. This will use E2B credits. Please confirm to continue.', 'system');
        techSelectorNoticeRef.current.sandboxWarningShown = true;
      }
      return; // Stop here and wait for confirmation
    }
    
    // Determine if this is an edit
    const isEdit = conversationContext.appliedCode.length > 0;
    if (techStack === 'html') {
      htmlSanitizationNotifiedRef.current = false;
    }
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
                  // DON'T add code to chat - only show in code editor
                  // This prevents code from appearing in chat messages
                  let text = data.text || '';
                  
                  // Remove package tags and XML tags
                  text = text.replace(/<package>[^<]*<\/package>/g, '');
                  text = text.replace(/<packages>[^<]*<\/packages>/g, '');
                  text = text.replace(/<file[^>]*>[\s\S]*?<\/file>/g, '');
                  
                  // STRICT filter: Only allow non-code conversational text
                  // Don't show if it contains ANY code-like content
                  const hasCodeContent = text.includes('<file') || 
                                       text.includes('import ') || 
                                       text.includes('export ') || 
                                       text.includes('className') ||
                                       text.includes('function ') ||
                                       text.includes('const ') ||
                                       text.includes('return (') ||
                                       text.includes('```');
                  
                  if (!hasCodeContent && text.trim().length > 0 && text.trim().length < 500) {
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
                if (data.projectId) {
                  setActiveProjectId(data.projectId);
                }
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
        const normalizedCode = sanitizeGeneratedOutput(generatedCode);
        const sanitizedChanged = normalizedCode !== generatedCode;
        if (sanitizedChanged && techStack === 'html' && !htmlSanitizationNotifiedRef.current) {
          addChatMessage('✅ تم تحويل الكود إلى HTML متوافق بدون JSX لضمان عمل الموقع بشكل صحيح.', 'system');
          htmlSanitizationNotifiedRef.current = true;
        }
        generatedCode = normalizedCode;

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

  // Netlify deployment functions  
  const deployToNetlify = async () => {
    // Check if Netlify token is provided in API keys
    const netlifyToken = (window as any).apiKeys?.netlify;
    
    if (!netlifyToken) {
      addChatMessage('⚠️ Please add your Netlify Personal Access Token in API Keys settings first!\n\nGet your token from: https://app.netlify.com/user/applications#personal-access-tokens', 'system');
      setShowApiKeysSettings(true);
      return;
    }

    if (!sandboxData) {
      addChatMessage('Please create a sandbox first!', 'system');
      return;
    }

    setDeploymentLoading(true);
    setDeploymentLogs([]);
    const logs: string[] = [];
    
    const addLog = (message: string) => {
      logs.push(message);
      setDeploymentLogs([...logs]);
      console.log('[netlify-deploy]', message);
    };

    try {
      // Step 1: Fetch files
      addLog('🚀 Starting deployment process...');
      addChatMessage('🚀 Starting Netlify deployment...', 'system');
      
      addLog('📦 Fetching files from sandbox...');
      const filesResponse = await fetch('/api/get-sandbox-files', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!filesResponse.ok) {
        throw new Error('Failed to fetch sandbox files');
      }

      const filesData = await filesResponse.json();
      
      if (!filesData.success || !filesData.files) {
        throw new Error('No files available in sandbox');
      }

      const filesToDeploy = filesData.files;
      const fileCount = Object.keys(filesToDeploy).length;

      if (fileCount === 0) {
        throw new Error('No files found in sandbox. Please generate some code first!');
      }

      addLog(`✅ Found ${fileCount} files to deploy`);
      addChatMessage(`📝 Preparing ${fileCount} files...`, 'system');

      // List files
      Object.keys(filesToDeploy).slice(0, 5).forEach(file => {
        addLog(`   📄 ${file}`);
      });
      if (fileCount > 5) {
        addLog(`   ... and ${fileCount - 5} more files`);
      }

      // Step 2: Create deployment
      const siteName = `youssef-ai-${Date.now()}`;
      addLog(`🌐 Creating site: ${siteName}`);
      addChatMessage('🌐 Creating Netlify site...', 'system');
      
      addLog('⬆️ Uploading files to Netlify...');
      addChatMessage('⬆️ Uploading files...', 'system');

      const response = await fetch('/api/netlify/deploy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Netlify-Token': netlifyToken
        },
        body: JSON.stringify({
          siteName,
          files: filesToDeploy,
          netlifyToken,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        addLog(`❌ Deployment failed: ${data.error}`);
        throw new Error(data.error || 'Deployment failed');
      }

      // Step 3: Success!
      addLog('✅ Files uploaded successfully!');
      addLog('🔄 Processing deployment...');
      addChatMessage('🔄 Netlify is building your site...', 'system');

      addLog('✅ Files uploaded successfully!');
      addLog('🚧 Netlify is building your site...');
      addLog(`🌐 Your site will be live at: ${data.url}`);
      addLog('⏱️ Please wait 1-2 minutes for deployment to complete');
      addLog(`📊 Site ID: ${data.siteId}`);
      addLog(`🚀 Deployment ID: ${data.deploymentId}`);
      
      setDeploymentUrl(data.url);
      setSandboxFiles(filesToDeploy);
      
      // Store deployment data for sharing
      setDeploymentData({
        url: data.url,
        siteId: data.siteId,
        deploymentId: data.deploymentId
      });
      
      // Show success modal with sharing options
      setShowDeploymentSuccess(true);
      
      addChatMessage(
        `✅ Successfully uploaded to Netlify!\n\n🚧 Your site is being built...\n\n🌐 URL: ${data.url}\n\n⏱️ Please wait 1-2 minutes, then open the link!\n\n📝 Deployment Details:\n• Site ID: ${data.siteId}\n• Deployment ID: ${data.deploymentId}\n• Files deployed: ${fileCount}\n\n🔄 Tip: You can check your site at Netlify dashboard`,
        'system'
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
      addChatMessage(`❌ Deployment failed: ${error.message}\n\n📝 Check the logs for details.`, 'system');
      console.error('[netlify-deploy] Error:', error);
    } finally {
      setDeploymentLoading(false);
    }
  };

  // Vercel deployment function
  const deployToVercel = async () => {
    const vercelToken = (window as any).apiKeys?.vercel;
    
    if (!vercelToken) {
      addChatMessage('⚠️ Please add your Vercel API Token in API Keys settings first!\n\nGet your token from: https://vercel.com/account/tokens', 'system');
      setShowApiKeysSettings(true);
      return;
    }

    if (!sandboxData) {
      addChatMessage('Please create a sandbox first!', 'system');
      return;
    }

    setDeploymentLoading(true);
    setDeploymentLogs([]);
    const logs: string[] = [];
    
    const addLog = (message: string) => {
      logs.push(message);
      setDeploymentLogs([...logs]);
      console.log('[vercel-deploy]', message);
    };

    try {
      addLog('🚀 Starting Vercel deployment...');
      addChatMessage('🚀 Starting Vercel deployment...', 'system');
      
      addLog('📦 Fetching files from sandbox...');
      const filesResponse = await fetch('/api/get-sandbox-files', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!filesResponse.ok) {
        throw new Error('Failed to fetch sandbox files');
      }

      const filesData = await filesResponse.json();
      
      if (!filesData.success || !filesData.files) {
        throw new Error('No files available in sandbox');
      }

      const filesToDeploy = filesData.files;
      const fileCount = Object.keys(filesToDeploy).length;

      if (fileCount === 0) {
        throw new Error('No files found. Please generate some code first!');
      }

      addLog(`✅ Found ${fileCount} files to deploy`);
      addChatMessage(`📝 Preparing ${fileCount} files...`, 'system');

      Object.keys(filesToDeploy).slice(0, 5).forEach(file => {
        addLog(`   📄 ${file}`);
      });
      if (fileCount > 5) {
        addLog(`   ... and ${fileCount - 5} more files`);
      }

      const projectName = `youssef-ai-${Date.now()}`;
      addLog(`▲ Creating Vercel deployment: ${projectName}`);
      addChatMessage('▲ Creating Vercel deployment...', 'system');
      
      addLog('⬆️ Uploading files to Vercel...');
      addChatMessage('⬆️ Uploading files...', 'system');

      const response = await fetch('/api/vercel/deploy', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Vercel-Token': vercelToken
        },
        body: JSON.stringify({
          projectName,
          files: filesToDeploy,
          vercelToken,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        addLog(`❌ Deployment failed: ${data.error}`);
        throw new Error(data.error || 'Vercel deployment failed');
      }

      addLog('✅ Files uploaded successfully!');
      addLog('🚧 Vercel is building your site...');
      addLog(`🌐 Your site will be live at: ${data.url}`);
      addLog('⏱️ Please wait 30-60 seconds');
      addLog(`📊 Deployment ID: ${data.deploymentId}`);
      
      setDeploymentUrl(data.url);
      setSandboxFiles(filesToDeploy);
      
      setDeploymentData({
        url: data.url,
        siteId: data.deploymentId,
        deploymentId: data.deploymentId
      });
      
      setShowDeploymentSuccess(true);
      
      addChatMessage(
        `✅ Successfully deployed to Vercel!\n\n▲ Your site is being built...\n\n🌐 URL: ${data.url}\n\n⏱️ Please wait 30-60 seconds, then open the link!\n\n📝 Files deployed: ${fileCount}`,
        'system'
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
      addChatMessage(`❌ Vercel deployment failed: ${error.message}`, 'system');
      console.error('[vercel-deploy] Error:', error);
    } finally {
      setDeploymentLoading(false);
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

  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.round(diffMs / 60000));
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    }
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };







  const handleHomeScreenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeDescriptionInput.trim()) return;
    
      const newProjectId = await ensureProjectForPrompt(homeDescriptionInput);
      if (newProjectId) {
        setActiveProjectId(newProjectId);
    }
    
    setHomeScreenFading(true);
  // Clear messages and show the generation message
    setChatMessages([]);
    addChatMessage('🔍 جاري تحضير التفاصيل الأولية للمشروع...', 'system');
  // Set loading stage immediately before hiding home screen
    setLoadingStage('planning');
  // Also ensure we're on preview tab to show the loading overlay
    setActiveTab('preview');
    setTimeout(() => {
      setShowHomeScreen(false);
      setHomeScreenFading(false);

      // Start the generation process
        generateWebsiteFromDescription(homeDescriptionInput, newProjectId);
    }, 800);
  };

// Add the generateWebsiteFromDescription function here
const generateWebsiteFromDescription = async (description: string, projectIdOverride?: string | null) => {
  if (!description.trim()) {
    addChatMessage('Please provide a description of the website you want to create.', 'system');
    return;
  }

  const fallbackProjectId = projectIdOverride ?? activeProjectId;

  addChatMessage(`Creating website: ${description}`, 'system');

  setConversationContext(prev => ({
    ...prev,
    currentProject: `Website: ${description}`
  }));

  // Check if sandbox needs to be created
  if (!sandboxData) {
    // Store the description for later use
    setPendingDescription(description);
    setPendingSandboxAction('home');

    if (!showTechStackSelector) {
      setShowTechStackSelector(true);
    }

    if (!techSelectorNoticeRef.current.techPromptShown) {
      addChatMessage('🔧 اختر التقنية التي تريد أن أبني بها مشروعك، ثم أكد إنشاء الـ Sandbox للمتابعة.', 'system');
      techSelectorNoticeRef.current.techPromptShown = true;
    }
    if (!techSelectorNoticeRef.current.sandboxWarningShown) {
      addChatMessage('⚠️ سيتم إنشاء Sandbox جديدة وتشغيلها لمدة ساعة كاملة بعد اختيار التقنية والتأكيد.', 'system');
      techSelectorNoticeRef.current.sandboxWarningShown = true;
    }
    return; // Stop and wait for tech stack selection
  }

  let sandboxPromise: Promise<void> | null = null;

  if (techStack === 'html') {
    htmlSanitizationNotifiedRef.current = false;
  }

  // Generate message and prompt based on tech stack
  const techName = techStack === 'html' ? 'HTML/CSS/JS' : techStack === 'react' ? 'React' : techStack === 'nextjs' ? 'Next.js' : 'Angular';
  addChatMessage(`🚀 Generating your custom ${techName} application...`, 'system');

  let generatePrompt = '';
  
  if (techStack === 'html') {
    generatePrompt = `Create a complete, modern website using ONLY pure HTML, CSS, and JavaScript based on this description:

"${description}"

🚫 STRICT RULES - NO FRAMEWORKS ALLOWED:
- DO NOT use React, Vue, Angular, or any framework
- DO NOT use JSX syntax
- DO NOT use import/export statements
- ONLY use vanilla HTML, CSS, and JavaScript

🎯 REQUIREMENTS:
1. Create a single HTML file (index.html) with embedded CSS and JavaScript
2. Use semantic HTML5 elements (header, nav, main, section, footer, article)
3. Build all sections and features described by the user
4. Use modern, vanilla JavaScript for any interactivity (NO frameworks)
5. Implement responsive design with mobile-first approach
6. Use CSS Grid and Flexbox for layouts

📸 IMAGES:
- Use Unsplash images: https://source.unsplash.com/1920x1080/?{keyword}
- Add relevant keywords based on content
- Example: https://source.unsplash.com/1920x1080/?restaurant,food

🎨 DESIGN:
- Modern, professional look
- Smooth animations with CSS only
- Mobile-first responsive design
- Excellent accessibility

Focus on creating a fast, beautiful, functional website using ONLY HTML, CSS, and JavaScript.`;
  } else if (techStack === 'react') {
    generatePrompt = `Create a complete, modern React + Vite application based on this description:

"${description}"

🚫 STRICT RULES - REACT ONLY:
- Use ONLY React with Vite
- DO NOT use Next.js features (no getServerSideProps, getStaticProps, etc.)
- DO NOT use server components
- Use standard React components with .jsx extension
- Use Tailwind CSS for styling

🎯 REQUIREMENTS:
1. Create a COMPLETE React application with App.jsx as the main component
2. App.jsx MUST import and render all other components
3. Build all sections and features described by the user
4. Use a modern, professional design with excellent UX
5. Implement responsive design with mobile-first approach
6. Create reusable components for repeated elements

📸 IMAGES - USE UNSPLASH:
- Always use real images from Unsplash CDN
- Format: https://source.unsplash.com/{width}x{height}/?{keywords}
- Examples:
  * Hero: https://source.unsplash.com/1920x1080/?${description.split(' ').slice(0, 2).join(',')}
  * Products: https://source.unsplash.com/800x600/?product,${description.split(' ')[0]}
  * People: https://source.unsplash.com/800x600/?people,business
- Use multiple relevant keywords for better results
- NEVER use placeholder.com or fake images

🎨 DESIGN:
- Use Tailwind CSS for ALL styling
- Mobile-first responsive design
- Smooth animations and transitions
- Professional and polished look

TECHNICAL REQUIREMENTS:
- Use Tailwind CSS for ALL styling (no custom CSS files)
- Create ALL components that you reference in imports
- Use Unsplash images with relevant keywords
- Include realistic content that matches the description
- Use React hooks (useState, useEffect) where appropriate

Focus on creating a beautiful, functional website that matches the user's vision.`;
  } else if (techStack === 'nextjs') {
    generatePrompt = `Create a complete, modern Next.js 14+ App Router application based on this description:

"${description}"

🚫 STRICT RULES - NEXT.JS ONLY:
- Use ONLY Next.js 14+ with App Router
- DO NOT use React Router or other routers
- DO NOT use Pages Router (old Next.js)
- Use 'use client' directive when needed
- Use proper Next.js file structure (app directory)

🎯 REQUIREMENTS:
1. Use Next.js App Router with proper page.tsx/page.jsx structure
2. Create client components with 'use client' directive when using hooks
3. Build all sections and features described by the user
4. Optimize for SEO with metadata
5. Implement responsive design with mobile-first approach

📸 IMAGES - USE UNSPLASH:
- Use Unsplash CDN for all images
- Format: https://source.unsplash.com/{width}x{height}/?{keywords}
- Examples:
  * Hero: https://source.unsplash.com/1920x1080/?${description.split(' ').slice(0, 2).join(',')}
  * Feature: https://source.unsplash.com/800x600/?${description.split(' ')[0]},modern
  * Gallery: https://source.unsplash.com/600x400/?${description.split(' ')[0]},design
- Use relevant keywords from the description
- NEVER use placeholder images

🎨 DESIGN:
- Use Tailwind CSS for ALL styling
- Mobile-first responsive design
- Professional and modern look
- Smooth animations

TECHNICAL REQUIREMENTS:
- Use Tailwind CSS for styling
- Proper Next.js App Router structure
- Client components with 'use client' when using hooks
- SEO-friendly with metadata
- Unsplash images with relevant keywords

Focus on creating a high-performance, SEO-optimized Next.js application.`;
  } else {
    // Angular
    generatePrompt = `Create a complete, modern Angular 17+ application based on this description:

"${description}"

🚫 STRICT RULES - ANGULAR ONLY:
- Use ONLY Angular 17+ with standalone components
- DO NOT use React, Vue, or other frameworks
- Use TypeScript for all components
- Use Angular decorators (@Component, @Injectable, etc.)
- Follow Angular best practices

🎯 REQUIREMENTS:
1. Create standalone Angular components with TypeScript
2. Use modern Angular features (signals, standalone components)
3. Build all sections and features described by the user
4. Use Angular Material for UI components
5. Implement responsive design with mobile-first approach
6. Create reusable components

📸 IMAGES - USE UNSPLASH:
- Use Unsplash CDN for all images
- Format: https://source.unsplash.com/{width}x{height}/?{keywords}
- Examples:
  * Hero: https://source.unsplash.com/1920x1080/?${description.split(' ').slice(0, 2).join(',')}
  * Card: https://source.unsplash.com/600x400/?${description.split(' ')[0]},modern
  * Background: https://source.unsplash.com/1200x800/?${description.split(' ')[0]},abstract
- Use relevant keywords from the description
- NEVER use placeholder images

🎨 DESIGN:
- Use Angular Material + Tailwind CSS
- Mobile-first responsive design
- Professional enterprise look
- Smooth Material animations

TECHNICAL REQUIREMENTS:
- Standalone components (no NgModule)
- TypeScript with strict type checking
- Angular Material for UI
- Tailwind CSS for custom styling
- Unsplash images with relevant keywords
- Proper Angular services and dependency injection

Focus on creating an enterprise-grade Angular application.`;
  }

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
      isEdit: false,
      projectId: fallbackProjectId
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
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'status') {
              setGenerationProgress(prev => ({ ...prev, status: data.message }));
              addChatMessage(data.message, 'system');
            } else if (data.type === 'stream') {
              // Always accumulate the streamed text
              if (data.text) {
                generatedCode += data.text;
              }
            } else if (data.type === 'component') {
              setGenerationProgress(prev => ({
                ...prev,
                status: `Generated ${data.name}`,
                components: [
                  ...prev.components,
                  { name: data.name, path: data.path, completed: true }
                ],
                currentComponent: prev.currentComponent + 1
              }));
            } else if (data.type === 'complete') {
              // Use the full generated code from the complete message if available
              if (data.generatedCode && data.generatedCode.trim()) {
                generatedCode = data.generatedCode;
              }
              
              console.log('[generateWebsite] Code generation complete. Code length:', generatedCode.length);

              setGenerationProgress(prev => ({
                ...prev,
                isGenerating: false,
                isStreaming: false,
                status: 'Generation complete!'
              }));

              if (data.projectId) {
                setActiveProjectId(data.projectId);
              } else if (fallbackProjectId) {
                setActiveProjectId(fallbackProjectId);
              }

              break;
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (generatedCode.trim()) {
      const normalizedCode = sanitizeGeneratedOutput(generatedCode);
      const sanitizedChanged = normalizedCode !== generatedCode;
      if (sanitizedChanged && techStack === 'html' && !htmlSanitizationNotifiedRef.current) {
        addChatMessage('✅ تم تحسين الكود ليصبح HTML نظيف بدون أي JSX أو تعليمات غير مدعومة.', 'system');
        htmlSanitizationNotifiedRef.current = true;
      }
      generatedCode = normalizedCode;

      if (session?.user?.id) {
        loadProjects();
      }

      if (sandboxPromise) {
        await sandboxPromise;
      }

      await applyGeneratedCode(generatedCode, false);

      addChatMessage(
        `Successfully created your website! I've built a modern React application based on your description: "${description}". You can now ask me to modify specific sections, add features, or make any other changes.`,
        'ai',
        {
          websiteDescription: description,
          generatedCode
        }
      );

      setGenerationProgress(prev => ({
        ...prev,
        isGenerating: false,
        isStreaming: false,
        status: 'Generation complete!'
      }));

      setLoadingStage(null);

      setTimeout(() => setActiveTab('preview'), 100);
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

  const editingTargetPath = generationProgress.currentFile?.path || lastEditedFile;

  return (
    // Top-level container uses theme variables
    <div className={`font-sans ${theme.bg_main} ${theme.text_main} h-screen flex flex-col`}>
      {/* API Keys Settings Modal */}
      {showApiKeysSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`${theme.bg_card} rounded-lg shadow-lg p-6 w-full max-w-md`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">API Keys</h3>
              <button
                onClick={() => setShowApiKeysSettings(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ApiKeySettings onClose={() => setShowApiKeysSettings(false)} />
          </div>
        </div>
      )}
      {/* Home Screen Overlay */}
      {showHomeScreen && (
        <div className={`fixed inset-0 z-50 transition-opacity duration-500 ${homeScreenFading ? 'opacity-0' : 'opacity-100'}`}>
          {/* Custom Background from the image */}
          <div className="absolute inset-0 bg-[#0A0D1B] overflow-hidden">
             {/* Gradient Overlay */}
             <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle at center, rgba(29, 78, 216, 0.2) 0%, transparent 50%)',
              }}
            />
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
            <div className="absolute top-0 left-0 right-0 z-20 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between animate-[fadeIn_0.8s_ease-out]">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="relative w-9 h-9 sm:w-10 sm:h-10 bg-white/10 rounded-lg sm:rounded-xl border border-white/20 overflow-hidden">
                  <Image
                    src="/youssef-logo.png"
                    alt="Youssef AI logo"
                    fill
                    priority
                    sizes="40px"
                    className="object-contain"
                  />
                </div>
                <span className="text-white font-semibold text-lg sm:text-xl">Youssef AI</span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <UserButton />
          </div>
            </div>
          
          {/* Main content */}
          <div className="relative z-10 h-full flex items-center justify-center px-4">
            <div className="text-center max-w-4xl w-full mx-auto">
              {/* Enhanced Lovable-style Header */}
              
              <div className="text-center">
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-center text-white font-bold tracking-tight leading-[1.15] animate-[fadeIn_0.8s_ease-out] px-4 sm:px-6">
                  <span className="block sm:inline">Build something </span>
                    <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient-x">
                      unforgettable with Youssef AI
                    </span>
                </h1>
                <motion.p
                  className="text-base sm:text-lg md:text-xl lg:text-2xl max-w-2xl mx-auto mt-5 sm:mt-7 lg:mt-9 text-white/90 text-center text-balance px-4 sm:px-6"
                  transition={{ duration: 0.3, ease: "easeOut" }}
      
                  >
                  Create beautiful apps and websites by chatting with AI
                </motion.p>
                <motion.p
                  className="text-sm sm:text-base lg:text-lg max-w-xl mx-auto mt-3 sm:mt-4 lg:mt-5 text-white/60 text-center px-4 sm:px-6"
       
                  transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
                >
                  No coding required • Powered by AI • Open source
                </motion.p>
              </div>
         
      
              <form onSubmit={handleHomeScreenSubmit} className="mt-6 sm:mt-8 lg:mt-12 max-w-2xl mx-auto px-3 sm:px-4">
                <div className="w-full relative group">
                  <div className="relative bg-black/30 backdrop-blur-md rounded-xl sm:rounded-2xl border border-white/30 overflow-hidden shadow-2xl transition-all duration-300 group-hover:border-white/40 group-focus-within:border-white/50 group-focus-within:shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                    <input
      
                      type="text"
                      value={homeDescriptionInput}
                      onChange={(e) => {
                        const value = e.target.value;
  setHomeDescriptionInput(value);
                      }}
                      placeholder="Describe your dream app or website..."
                      className="h-14 sm:h-16 md:h-18 lg:h-20 w-full bg-transparent text-white placeholder-white/50 px-4 sm:px-5 md:px-7 pr-14 sm:pr-16 md:pr-18 focus:outline-none text-base sm:text-lg md:text-xl transition-all duration-200 focus:placeholder-white/70"
                      autoFocus
                 
    />
                    <button
                      type="submit"
                      disabled={!homeDescriptionInput.trim()}
                      className="absolute top-1/2 transform -translate-y-1/2 right-2 sm:right-3 md:right-5 w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 bg-white/20 hover:bg-white/30 disabled:bg-gray-700/50 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-200 disabled:cursor-not-allowed shadow-lg hover:shadow-xl disabled:opacity-50"
                      title="Create with AI"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-[20px] sm:h-[20px] md:w-[22px] md:h-[22px] text-white">
         
                        <path d="M5 12h14M12 5l7 7-7 7"></path>
                      </svg>
                    </button>
                  </div>

                  {/* Subtle 
  glow effect */}
                  <div className="absolute inset-0 bg-white/10 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 -z-10" />
                </div>

                {/* Example prompts */}
                <div className="mt-4 sm:mt-5 md:mt-7 flex flex-wrap justify-center gap-2 sm:gap-2.5 px-4 sm:px-6">
         
                  {[
                    "A modern portfolio website",
                    "E-commerce store with cart",
                    "Social media dashboard",
                    "Task management app"
 
                  ].map((example, index) => (
                    <button
                      key={example}
                      onClick={() => setHomeDescriptionInput(example)}
              
                      className="px-3.5 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 text-xs sm:text-sm md:text-base text-white/70 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full hover:bg-white/10 hover:text-white/90 transition-all duration-200 hover:scale-105"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      {example}
          
                      </button>
                  ))}
                </div>
              </form>

                  {session?.user?.id && projects.length > 0 && (
                  <div className="mt-6 sm:mt-8 lg:mt-10 max-w-3xl mx-auto px-3 sm:px-4 mb-4 sm:mb-6">
                    <details className="group" open={false}>
                      <summary className="text-left text-white/70 text-[10px] sm:text-[0.65rem] md:text-[0.7rem] uppercase tracking-[0.25em] sm:tracking-[0.3em] md:tracking-[0.4em] mb-2 sm:mb-3 md:mb-4 font-medium cursor-pointer hover:text-white/90 transition-colors list-none flex items-center gap-2">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 transform transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span>📁 Recent Projects ({projects.length})</span>
                      </summary>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-h-[35vh] sm:max-h-[40vh] overflow-y-auto scrollbar-hide pb-3 sm:pb-4 mt-2">
                      {projectsLoading ? (
                        <div className="flex items-center gap-2 text-white/70 text-base">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Loading projects...</span>
                        </div>
                      ) : (
                        <>
                        {projects.map(project => (
                          <div
                            key={project.id}
                            className={`relative group rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300 shadow-lg hover:shadow-xl ${activeProjectId === project.id ? 'ring-2 ring-blue-400/60 bg-white/10 shadow-blue-500/30' : ''}`}
                          >
                            <button
                              type="button"
                              onClick={() => handleProjectSelect(project)}
                              className="w-full text-left px-4 sm:px-5 md:px-6 py-3 sm:py-4 md:py-5"
                            >
                              <div className="flex items-start gap-3 sm:gap-4">
                                <div className="flex-shrink-0 mt-0.5">
                                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-500/20 flex items-center justify-center">
                                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                <div className="text-white font-semibold text-base sm:text-lg md:text-xl truncate pr-10 sm:pr-12">
                                  {project.name}
                                </div>
                                <div className="text-white/60 text-xs sm:text-sm md:text-base mt-1.5 sm:mt-2 line-clamp-2 leading-relaxed">
                                  {project.last_prompt || 'No description'}
                                </div>
                                <div className="flex items-center gap-2 text-white/40 text-xs sm:text-sm mt-2 sm:mt-2.5">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {formatRelativeTime(project.updated_at)}
                                  </div>
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`\u274c Delete "${project.name}"?\n\nThis action cannot be undone.`)) return;
                                try {
                                  const response = await fetch(`/api/projects?projectId=${project.id}`, {
                                    method: 'DELETE',
                                  });
                                  if (response.ok) {
                                    setProjects(prev => prev.filter(p => p.id !== project.id));
                                    if (activeProjectId === project.id) {
                                      setActiveProjectId(null);
                                    }
                                    addChatMessage(`Project "${project.name}" deleted successfully.`, 'system');
                                  }
                                } catch (error) {
                                  console.error('Failed to delete project:', error);
                                  addChatMessage('Failed to delete project. Please try again.', 'system');
                                }
                              }}
                              className="absolute top-3 sm:top-4 md:top-5 right-3 sm:right-4 md:right-5 opacity-0 group-hover:opacity-100 md:opacity-70 md:hover:opacity-100 touch-manipulation p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200 shadow-lg z-10"
                              title="Delete project"
                              aria-label="Delete project"
                            >
                              <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                        </>
                      )}
                    </div>
                    </details>
                    {projectsError && (
                      <p className="text-red-300 text-sm mt-2">{projectsError}</p>
                    )}
                  </div>
                )}
              
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
                    <option key={model} value={model} className={`${theme.code_bg} text-white`}>
      
                      {(appConfig.ai.modelDisplayNames as any)[model] || model}
                    </option>
                  ))}
                </select>
              </div>
            
  </div>
          </div>
        </div>
      )}
      
      {/* Main Header with gradient */}
      <div className={`px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 border-b ${theme.border_color} flex items-center justify-between ${theme.bg_card} bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900`}>
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
          <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3">
            <div className={`relative w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg sm:rounded-xl overflow-hidden border ${theme.border_color}`}>
              <Image
                src="/youssef-logo.png"
                alt="Youssef AI logo"
                fill
                sizes="40px"
                className="object-contain"
              />
            </div>
            <span className={`font-semibold text-base sm:text-lg md:text-xl ${theme.text_main}`}>Youssef AI</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2">
          <UserButton />
          {/* Model Selector - Left side */}
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
            className={`px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 md:py-1.5 text-[10px] sm:text-xs md:text-sm bg-gray-800 text-white border-gray-700 border rounded-md sm:rounded-lg md:rounded-[10px] focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-colors duration-200 max-w-[90px] sm:max-w-[120px] md:max-w-none`}
          >
            {appConfig.ai.availableModels.map(model => (
              <option key={model} value={model} className={`${theme.code_bg} text-white`}>
                {(appConfig.ai.modelDisplayNames as any)[model] || model}
              </option>
    
          ))}
          </select>
          <Button
            variant="code"
            onClick={() => setIsDarkMode(!isDarkMode)}
            size="sm"
            title="Toggle Theme"
            className="bg-gradient-to-r from-gray-800 to-gray-700 text-white hover:from-gray-700 hover:to-gray-600 transition-all duration-200 hidden sm:flex shadow-lg hover:shadow-xl"
          >
            {isDarkMode ? <FaSun /> : <FaMoon />}
          </Button>
          <Button
            variant="code"
            onClick={() => setShowApiKeysSettings(true)}
            size="sm"
            title="API Keys"
            className="bg-gradient-to-r from-purple-600 to-purple-500 text-white hover:from-purple-500 hover:to-purple-400 transition-all duration-200 p-1.5 sm:p-2 md:p-2.5 shadow-lg hover:shadow-purple-500/50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-[16px] sm:h-[16px] md:w-[18px] md:h-[18px] text-white">
              <path d="M12 1.5L21.5 6.5V17.5L12 22.5L2.5 17.5V6.5L12 1.5Z" />
              <path d="M12 1.5L2.5 6.5L12 11.5L21.5 6.5L12 1.5Z" />
              <path d="M12 11.5V22.5" />
              <path d="M2.5 6.5L12 11.5" />
              <path d="M21.5 6.5L12 11.5" />
            </svg>
          </Button>
          <Button 
            variant="code"
            onClick={() => createSandbox()}
            size="sm"
            title="Create new sandbox"
            className="bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-500 hover:to-green-400 transition-all duration-200 hidden md:flex p-2 sm:p-2.5 shadow-lg hover:shadow-green-500/50"
          >
         
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            className={`bg-gradient-to-r from-orange-600 to-orange-500 text-white hover:from-orange-500 hover:to-orange-400 disabled:from-gray-700 disabled:to-gray-600 transition-all duration-200 hidden lg:flex p-2 sm:p-2.5 shadow-lg hover:shadow-orange-500/50`}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </Button>
          <Button 
     
            variant="code"
            onClick={downloadZip}
            disabled={!sandboxData}
            size="sm"
            title="Download your Vite app as ZIP"
            className={`bg-gray-800 text-white hover:bg-gray-700 disabled:${theme.code_bg}/50 transition-colors duration-200 p-2 sm:p-2.5`}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </Button>
          <Button 
            variant="code"
            onClick={deployToNetlify}
            disabled={deploymentLoading}
            size="sm"
            title="Publish to Netlify"
            className="bg-gradient-to-r from-[#00C7B7] to-[#00A896] text-white hover:opacity-90 transition-all duration-200 flex items-center gap-1 sm:gap-1.5 px-1.5 py-1.5 sm:px-2 md:px-3 sm:py-1.5 md:py-2 shadow-lg hover:shadow-xl"
          >
            {deploymentLoading ? (
              <svg className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <>
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.001 2L2.001 19.5h20L12.001 2z"/>
                </svg>
                <span className="text-[10px] sm:text-xs md:text-sm font-medium hidden lg:inline">
                  {netlifyConnected ? 'Publish' : 'Connect'}
                </span>
              </>
            )}
          </Button>
          <Button 
            variant="code"
            onClick={deployToVercel}
            disabled={deploymentLoading}
            size="sm"
            title="Deploy to Vercel"
            className="bg-black text-white hover:bg-gray-900 transition-all duration-200 flex items-center gap-1 sm:gap-1.5 px-1.5 py-1.5 sm:px-2 md:px-3 sm:py-1.5 md:py-2 shadow-lg hover:shadow-xl border border-gray-700"
          >
            {deploymentLoading ? (
              <svg className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <>
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 22.525H0l12-21.05 12 21.05z"/>
                </svg>
                <span className="text-[10px] sm:text-xs md:text-sm font-medium hidden lg:inline">
                  Vercel
                </span>
              </>
            )}
          </Button>
          <div className={`hidden sm:inline-flex items-center gap-2 ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-900'} px-2 sm:px-3 py-1 sm:py-1.5 rounded-[10px] text-xs sm:text-sm font-medium [box-shadow:none]`}>
            <span id="status-text">{status.text}</span>
            <div className={`w-2 h-2 rounded-full ${status.active ?
  'bg-green-500' : 'bg-gray-500'}`} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Center Panel - AI Chat (1/3 of remaining width) */}
        <div className={`flex-1 w-full sm:max-w-[300px] md:max-w-[350px] lg:max-w-[400px] flex flex-col border-r ${theme.border_color} ${theme.bg_card}`}>


          <div className="flex-1 overflow-y-auto p-1.5 sm:p-2 md:p-4 flex flex-col gap-1 scrollbar-hide" ref={chatMessagesRef}>
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
                      <div className={`block rounded-lg sm:rounded-[10px] px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs sm:text-sm md:text-base shadow-lg ${
                        msg.type === 'user' ?
  `bg-gradient-to-r from-blue-600 to-blue-500 text-white ml-auto max-w-[85%] sm:max-w-[80%]` :
                        msg.type === 'ai' ?
  `bg-gradient-to-r from-gray-700 to-gray-600 text-white mr-auto max-w-[85%] sm:max-w-[80%]` :
                        msg.type === 'system' ?
  `bg-gray-800/80 backdrop-blur-sm text-gray-300 text-xs sm:text-sm border border-gray-700/50` :
                        msg.type === 'command' ?
  `bg-gray-900/80 backdrop-blur-sm text-gray-300 font-mono text-xs sm:text-sm border border-gray-700/50` :
                        msg.type === 'error' ?
  'bg-red-900/80 backdrop-blur-sm text-red-100 text-xs sm:text-sm border border-red-700/50' :
  `bg-gray-800/80 backdrop-blur-sm text-gray-300 text-xs sm:text-sm border border-gray-700/50`
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
                    <div className={`${theme.code_bg} border ${theme.border_color} rounded max-h-32 overflow-y-auto scrollbar-hide`}>
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
            {!generationProgress.isGenerating && lastCompletedFiles.length > 0 && activeTab === 'generation' && (
              <div className={`mt-3 inline-block ${theme.bg_card} border ${theme.border_color} rounded-lg p-3`}>
                <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  آخر تحديث: {lastCompletedFiles.length} ملف{lastCompletedFiles.length === 1 ? '' : 'ات'} جاهزة
                </div>
                <div className="flex flex-wrap items-start gap-1">
                  {lastCompletedFiles.slice(0, 8).map((file, idx) => (
                    <div
                      key={`recent-${file.path}-${idx}`}
                      className={`inline-flex items-center gap-1 px-2 py-1 ${theme.chat_user_bg} text-white rounded-[10px] text-xs`}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      {file.path.split('/').pop()}
                    </div>
                  ))}
                  {lastCompletedFiles.length > 8 && (
                    <div className="px-3 py-1 text-xs rounded-[10px] border border-dashed border-white/30 text-white/70">
                      +{lastCompletedFiles.length - 8} أخرى
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={`p-1.5 sm:p-2 md:p-4 border-t ${theme.border_color} ${theme.bg_card}`}>
            <div className="relative">
              <Textarea
         
                className={`min-h-[45px] sm:min-h-[50px] md:min-h-[60px] pr-9 sm:pr-10 md:pr-12 resize-y border-2 ${theme.border_color} focus:outline-none ${theme.bg_card} ${theme.text_main} bg-gray-800 text-white placeholder-gray-400 text-xs sm:text-sm md:text-base`}
                placeholder="Ask me to do something..."
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key 
  === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
  sendChatMessage();
                  }
                }}
                rows={2}
              />
              <button
                onClick={sendChatMessage}
                className={`absolute right-1.5 sm:right-2 bottom-1.5 sm:bottom-2 p-1 sm:p-1.5 md:p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg sm:rounded-[10px]
  [box-shadow:none] transition-all duration-200`}
                title="Send message (Enter)"
              >
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        
  </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Preview or Generation (2/3 of remaining width) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={`px-2 sm:px-4 py-2 ${theme.bg_card} border-b ${theme.border_color} flex 
  justify-between items-center`}>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className={`flex bg-gray-800 rounded-lg p-0.5 sm:p-1`}>
                <button
                  onClick={() => setActiveTab('generation')}
                  className={`p-1.5 sm:p-2 rounded-md transition-all ${
         
                    activeTab === 'generation' 
                      ?
  `bg-blue-600 text-white`
                      : `text-gray-400 hover:text-white hover:bg-gray-700`
                  }`}
                  title="Code"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" 
  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </button>
                <button
              
                  onClick={() => setActiveTab('preview')}
                  className={`p-1.5 sm:p-2 rounded-md transition-all ${
                    activeTab === 'preview' 
                      ?
  `bg-blue-600 text-white`
                      : `text-gray-400 hover:text-white hover:bg-gray-700`
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
            <div className="flex gap-1 sm:gap-2 items-center">
              {/* Live Code Generation Status - Moved to far right */}
              {activeTab === 'generation' && (generationProgress.isGenerating || generationProgress.files.length > 0) && (
                <div className="flex items-center gap-2 sm:gap-3">
                  {generationProgress.isEdit && editingTargetPath && (
                    <div className="hidden lg:flex flex-col text-[10px] sm:text-xs text-blue-200/90 text-right leading-tight pr-2">
                      <span className="uppercase tracking-[0.2em] text-blue-300/60">Editing</span>
                      <span className="font-mono text-blue-100 truncate max-w-[200px]">{editingTargetPath}</span>
                    </div>
                  )}
                  {!generationProgress.isEdit && (
                    <div className="text-gray-400 text-xs sm:text-sm hidden sm:block">
                      {generationProgress.files.length} files generated
                    </div>
                  )}
                  <div
                    className={`inline-flex items-center justify-center whitespace-nowrap rounded-[10px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${theme.chat_user_bg} text-white [box-shadow:none] h-8 px-3 py-1 text-sm gap-2`}
                  >
                    {generationProgress.isGenerating ? (
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




      {/* Deployment Logs Modal */}
      {deploymentLoading && deploymentLogs.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md w-full">
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                <h3 className="text-white font-semibold text-sm">Deploying to Netlify</h3>
              </div>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto bg-gray-950 font-mono text-xs">
              {deploymentLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  className="text-gray-300 py-1 animate-[fadeIn_0.3s_ease-out]"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Deployment Success Modal */}
      {showDeploymentSuccess && deploymentData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-2xl w-full p-6 sm:p-8 animate-[fadeIn_0.3s_ease-out]">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2">🎉 نُشر بنجاح!</h2>
              <p className="text-gray-400 text-xs sm:text-sm md:text-base">Your website is being deployed to Netlify</p>
              <p className="text-gray-500 text-[10px] sm:text-xs mt-1">Please wait 1-2 minutes for it to be fully live</p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">🌐 Live URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={deploymentData.url}
                  readOnly
                  className="flex-1 bg-gray-900 text-white px-4 py-3 rounded-lg text-sm font-mono border border-gray-700"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(deploymentData.url);
                    addChatMessage('✅ Link copied to clipboard!', 'system');
                  }}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  title="Copy link"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-3">📱 Share on Social Media</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => {
                    const text = encodeURIComponent('Check out my new website created with Youssef AI!');
                    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(deploymentData.url)}`, '_blank');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
                  </svg>
                  <span className="text-sm font-medium hidden sm:inline">Twitter</span>
                </button>
                
                <button
                  onClick={() => {
                    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(deploymentData.url)}`, '_blank');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-[#4267B2] hover:bg-[#365899] text-white rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span className="text-sm font-medium hidden sm:inline">Facebook</span>
                </button>
                
                <button
                  onClick={() => {
                    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(deploymentData.url)}`, '_blank');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0077b5] hover:bg-[#006399] text-white rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  <span className="text-sm font-medium hidden sm:inline">LinkedIn</span>
                </button>
                
                <button
                  onClick={() => {
                    const text = encodeURIComponent('Check out my new website created with Youssef AI!');
                    window.open(`https://wa.me/?text=${text}%20${encodeURIComponent(deploymentData.url)}`, '_blank');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  <span className="text-sm font-medium hidden sm:inline">WhatsApp</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.open(deploymentData.url, '_blank')}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg font-medium transition-all"
              >
                Open Website
              </button>
              <button
                onClick={() => setShowDeploymentSuccess(false)}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tech Stack Selector Dialog */}
      {showTechStackSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-2xl w-full p-6 sm:p-8 animate-[fadeIn_0.3s_ease-out]">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white">اختر التكنولوجيا</h3>
            </div>
            
            <p className="text-gray-300 mb-6 leading-relaxed">
              اختر التكنولوجيا المناسبة لمشروعك:
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {[
                { id: 'html', name: 'HTML/CSS/JS', icon: '🌐', desc: 'الأسرع - موقع ثابت بسيط', color: 'orange', speed: '⚡⚡⚡' },
                { id: 'react', name: 'React + Vite', icon: '⚛️', desc: 'تطبيق تفاعلي حديث', color: 'blue', speed: '⚡⚡' },
                { id: 'nextjs', name: 'Next.js', icon: '▲', desc: 'SEO ممتاز + Server-Side', color: 'gray', speed: '⚡' },
                { id: 'angular', name: 'Angular', icon: '🅰️', desc: 'تطبيقات مؤسسية', color: 'red', speed: '⚡' }
              ].map((tech) => (
                <button
                  key={tech.id}
                  onClick={() => setTechStack(tech.id as any)}
                  className={`group relative p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                    techStack === tech.id
                      ? `border-${tech.color}-500 bg-${tech.color}-500/10 shadow-lg shadow-${tech.color}-500/30`
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800/80'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{tech.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-bold text-lg">{tech.name}</h4>
                        <span className="text-xs">{tech.speed}</span>
                      </div>
                      <p className="text-gray-400 text-sm">{tech.desc}</p>
                    </div>
                  </div>
                  {techStack === tech.id && (
                    <div className="absolute top-3 right-3">
                      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
            
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-purple-300">
                💡 <strong>نصيحة:</strong> إذا كنت مبتدئ أو تريد موقع بسيط، اختر HTML/CSS/JS. 
                إذا تريد تطبيق متقدم، اختر React.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTechStackSelector(false);
                  setPendingDescription(null);
                  setPendingSandboxAction(null);
                  techSelectorNoticeRef.current = {
                    techPromptShown: false,
                    sandboxWarningShown: false,
                  };
                  addChatMessage('❌ تم الإلغاء', 'system');
                }}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
              >
                ✖ إلغاء
              </button>
              <button
                onClick={async () => {
                  setShowTechStackSelector(false);
                  setShowSandboxConfirmation(true);
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/50"
              >
                ✓ متابعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sandbox Creation Confirmation Dialog */}
      {showSandboxConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full mx-4 p-6 sm:p-8 animate-[fadeIn_0.3s_ease-out]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">تفعيل بيئة التطوير</h3>
            </div>
            
            <p className="text-gray-300 mb-4 leading-relaxed">
              سيتم إنشاء <span className="text-blue-400 font-semibold">Sandbox</span> جديدة لتشغيل مشروعك باستخدام <span className="text-purple-400 font-semibold">{techStack === 'html' ? 'HTML/CSS/JS' : techStack === 'react' ? 'React' : techStack === 'nextjs' ? 'Next.js' : 'Angular'}</span>.
            </p>
            
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-blue-300">
                  ✨ بيئة محمية بنظام Keep-Alive
                  <br/>
                  🔄 نشطة لمدة ساعة كاملة
                  <br/>
                  💾 حفظ تلقائي للمشروع
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSandboxConfirmation(false);
                  setShowTechStackSelector(true);
                }}
                className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
              >
                ← رجوع
              </button>
              <button
                onClick={async () => {
                  setShowSandboxConfirmation(false);
                  const techLabel = techStack === 'html' ? 'HTML/CSS/JS' : techStack === 'react' ? 'React' : techStack === 'nextjs' ? 'Next.js' : 'Angular';
                  if (pendingSandboxAction === 'home' && pendingDescription) {
                    addChatMessage(`🚀 إنشاء sandbox وبدء التوليد باستخدام ${techLabel}...`, 'system');
                    await createSandbox(true, pendingDescription);
                    setPendingDescription(null);
                  } else if (pendingSandboxAction === 'chat') {
                    addChatMessage(`🚀 إنشاء sandbox وتشغيل بيئة ${techLabel} للمحادثة الحالية...`, 'system');
                    await createSandbox();
                  }
                  setPendingSandboxAction(null);
                  techSelectorNoticeRef.current = {
                    techPromptShown: false,
                    sandboxWarningShown: false,
                  };
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-blue-500/50"
              >
                ✓ تأكيد وابدأ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  // End of AISandboxPage
}

export default function Page() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const theme = isDarkMode ? {
    bg_main: 'bg-[#0A0D1B]',
    text_main: 'text-gray-200',
    bg_card: 'bg-[#181C2A]',
    border_color: 'border-gray-800',
    chat_user_bg: 'bg-gray-700',
    chat_ai_bg: 'bg-gray-800',
    code_bg: 'bg-gray-900',
  } : {
    bg_main: 'bg-white',
    text_main: 'text-gray-900',
    bg_card: 'bg-gray-100',
    border_color: 'border-gray-200',
    chat_user_bg: 'bg-blue-500',
    chat_ai_bg: 'bg-gray-200',
    code_bg: 'bg-gray-50',
  };
    return (
    <ThemeProvider attribute="class">
      <ApiKeysProvider>
        <Suspense fallback={<div className={`flex items-center justify-center min-h-screen ${theme.bg_main} ${theme.text_main}`}>Loading...</div>}>
          <AISandboxPage isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} theme={theme} />
        </Suspense>
      </ApiKeysProvider>
    </ThemeProvider>
  );
}
