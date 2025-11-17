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
import Preview from '@/components/Preview';



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
  
  const handleSurfaceError = (errors: any[]) => {
    // Function kept for compatibility but Vite errors are now handled by template
    
    // Focus the input
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
  if (textarea) {
      textarea.focus();
    }
  };

  const displayStructure = (structure: any) => {
    if (typeof structure === 'object') {
      setStructureContent(JSON.stringify(structure, null, 2));
  } else {
      setStructureContent(structure || 'No structure available');
    }
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
      return (
        <div className="relative w-full h-full">
          <Preview code={generationProgress.streamedCode} />
        </div>
      );
      
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
        structure: structureContent,
        recentMessages: chatMessages.slice(-20),
        conversationContext: conversationContext,
        currentCode: promptInput
      };
  // Debug what we're sending
      console.log('[chat] Sending context to AI:');
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
              <a
                href="https://github.com/zainulabedeen123/Open-lovable-DIY.git"
                target="_blank"
                rel="noopener noreferrer"
               
  className="inline-flex items-center gap-2 sm:gap-3 bg-white/10 backdrop-blur-sm text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-semibold border border-white/30 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-xl min-w-[100px] sm:min-w-[120px] justify-center"
              >
                <FiGithub className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>GitHub</span>
              </a>
          
  </div>
          </div>
          
          {/* Main content */}
          <div className="relative z-10 h-full flex items-center justify-center px-4">
            <div className="text-center max-w-4xl min-w-[600px] mx-auto">
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
            <span className={`font-semibold text-lg ${theme.text_main}`}>Open-Lovable</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Day/Night Mode Toggle - NEW */}
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
          {/* Model Selector - Left side */}
          <select
 
            value={aiModel}
            onChange={(e) => {
              const newModel = e.target.value;
  setAiModel(newModel);
              const params = new URLSearchParams(searchParams);
              params.set('model', newModel);
              router.push(`/?${params.toString()}`);
  }}
            className={`px-3 py-1.5 text-sm ${isDarkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border rounded-[10px] focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-colors duration-200`}
          >
            {appConfig.ai.availableModels.map(model => (
              <option key={model} value={model} className={isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}>
                {(appConfig.ai.modelDisplayNames as any)[model] || model}
              </option>
    
          ))}
          </select>
          <div className={`inline-flex items-center gap-2 ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-900'} px-3 py-1.5 rounded-[10px] text-sm font-medium [box-shadow:none]`}>
            <span id="status-text">{status.text}</span>
            <div className={`w-2 h-2 rounded-full ${status.active ?
  'bg-green-500' : 'bg-gray-500'}`} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Center Panel - AI Chat (1/3 of remaining width) */}
        <div className={`flex-1 max-w-[400px] flex flex-col border-r ${theme.border_color} ${theme.bg_card}`}>


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
                placeholder=""
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

        {/* Right Panel - Preview or Generation (2/3 of remaining width) */}
        <div className="flex-1 flex flex-col overflow-hidden">
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