'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
    FiFile, FiChevronRight, FiChevronDown, FiGithub, FiEdit2, FiEye, FiZap,
    FiRefreshCw, FiSend, FiKey, FiArrowUp, FiDownload, FiPlus, FiCode
} from 'react-icons/fi';
import { BsFolderFill, BsFolder2Open } from 'react-icons/bs';
import { SiJavascript, SiReact, SiCss3, SiJson } from 'react-icons/si';
import { FaSun, FaMoon, FaSpinner } from 'react-icons/fa';
import { UserButton } from '@/components/UserButton';
import { useApiRequest } from '@/hooks/useApiRequest';
import { motion, AnimatePresence } from 'framer-motion';
import CodeApplicationProgress, { type CodeApplicationState } from '@/components/CodeApplicationProgress';

// --- Interfaces ---
interface SandboxData {
    sandboxId: string;
    url: string;
    [key: string]: any;
}

interface ChatMessage {
    content: string;
    type: 'user' | 'ai' | 'system' | 'file-update' | 'command' | 'error' | 'thought';
    timestamp: Date;
    metadata?: {
        websiteDescription?: string;
        generatedCode?: string;
        appliedFiles?: string[];
        commandType?: 'input' | 'output' | 'error' | 'success';
        editedFiles?: string[];
        readFiles?: string[];
        duration?: number;
    };
}

// --- Main Component ---
function AISandboxPage() {
    // --- State Management ---
    const { makeRequestWithBody } = useApiRequest();
    const [sandboxData, setSandboxData] = useState<SandboxData | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ text: 'Not connected', active: false });
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        {
            content: 'Welcome! Describe the app you want to build.',
            type: 'system',
            timestamp: new Date()
        }
    ]);
    const [aiChatInput, setAiChatInput] = useState('');
    const searchParams = useSearchParams();
    const router = useRouter();
    const [aiModel, setAiModel] = useState(() => {
        const modelParam = searchParams.get('model');
        const availableModels = [...appConfig.ai.availableModels, 'openrouter'];
        return availableModels.includes(modelParam || '') ? modelParam! : appConfig.ai.defaultModel;
    });
    const [showHomeScreen, setShowHomeScreen] = useState(true);
    const [homeScreenFading, setHomeScreenFading] = useState(false);
    const [homeDescriptionInput, setHomeDescriptionInput] = useState('');
    const [activeTab, setActiveTab] = useState<'generation' | 'preview'>('preview');
    const [lastGeneratedCode, setLastGeneratedCode] = useState<string | undefined>(undefined);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['app', 'src']));
    const [selectedFile, setSelectedFile] = useState<string | null>(null);

    // --- NEW: Theme & OpenRouter States ---
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [openRouterApiKey, setOpenRouterApiKey] = useState('');
    const [openRouterModelName, setOpenRouterModelName] = useState('');

    const [generationProgress, setGenerationProgress] = useState<{
        isGenerating: boolean;
        status: string;
        files: Array<{ path: string; content: string; type: string; completed: boolean; edited?: boolean }>;
        streamedCode: string;
        isStreaming: boolean;
        isThinking: boolean;
        thinkingText?: string;
    }>({
        isGenerating: false, status: '', files: [], streamedCode: '',
        isStreaming: false, isThinking: false, thinkingText: '',
    });

    const [codeApplicationState, setCodeApplicationState] = useState<CodeApplicationState>({ stage: null });

    // --- Refs ---
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const chatMessagesRef = useRef<HTMLDivElement>(null);
    const codeDisplayRef = useRef<HTMLDivElement>(null);


    // --- Effects ---
    useEffect(() => {
        const key = localStorage.getItem('openrouter_api_key');
        const model = localStorage.getItem('openrouter_model_name');
        if (key) setOpenRouterApiKey(key);
        if (model) setOpenRouterModelName(model);
    }, []);

    useEffect(() => {
        if (chatMessagesRef.current) {
            chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
    }, [chatMessages]);

    useEffect(() => {
        if (codeDisplayRef.current && generationProgress.isStreaming) {
            codeDisplayRef.current.scrollTop = codeDisplayRef.current.scrollHeight;
        }
    }, [generationProgress.streamedCode, generationProgress.isStreaming]);


    useEffect(() => {
        if (aiModel === 'openrouter' && !openRouterApiKey) {
            setIsApiKeyModalOpen(true);
        }
    }, [aiModel, openRouterApiKey]);

    // --- Functions ---
    const addChatMessage = (content: string, type: ChatMessage['type'], metadata?: ChatMessage['metadata']) => {
        const newMessage: ChatMessage = { content, type, timestamp: new Date(), metadata };
        setChatMessages(prev => [...prev, newMessage]);
    };

    const handleModelChange = (newModel: string) => {
        setAiModel(newModel);
        if (newModel === 'openrouter' && !localStorage.getItem('openrouter_api_key')) {
            setIsApiKeyModalOpen(true);
        }
        const params = new URLSearchParams(searchParams.toString());
        params.set('model', newModel);
        if (sandboxData) params.set('sandbox', sandboxData.sandboxId);
        router.push(`/?${params.toString()}`);
    };

    const saveApiKey = () => {
        localStorage.setItem('openrouter_api_key', openRouterApiKey);
        localStorage.setItem('openrouter_model_name', openRouterModelName);
        setIsApiKeyModalOpen(false);
        addChatMessage('OpenRouter settings saved successfully!', 'system');
    };

    const createSandbox = async () => {
        setLoading(true);
        addChatMessage('Creating sandbox...', 'system');
        try {
            const response = await makeRequestWithBody('/api/create-ai-sandbox', {});
            const data = await response.json();
            if (data.success) {
                setSandboxData(data);
                setStatus({ text: 'Sandbox active', active: true });
                if (iframeRef.current) iframeRef.current.src = data.url;
                addChatMessage(`Sandbox created! URL: ${data.url}`, 'system');
                const newParams = new URLSearchParams(searchParams.toString());
                newParams.set('sandbox', data.sandboxId);
                router.push(`/?${newParams.toString()}`, { scroll: false });
            } else { throw new Error(data.error || 'Unknown error'); }
        } catch (error: any) {
            addChatMessage(`Failed to create sandbox: ${error.message}`, 'error');
            setStatus({ text: 'Error', active: false });
        } finally { setLoading(false); }
    };

    const applyGeneratedCode = async (code: string) => {
        if (!sandboxData) {
            addChatMessage('Cannot apply code, no active sandbox.', 'error');
            return;
        }
        setCodeApplicationState({ stage: 'applying' });
        try {
            await makeRequestWithBody('/api/apply-ai-code-stream', {
                response: code,
                sandboxId: sandboxData.sandboxId,
                packages: (window as any).pendingPackages || []
            });
            addChatMessage('Code applied successfully! Refreshing preview...', 'system');
            setTimeout(() => {
                if (iframeRef.current) iframeRef.current.src = `${sandboxData.url}?t=${Date.now()}`;
            }, 2000);
        } catch (error: any) {
            addChatMessage(`Failed to apply code: ${error.message}`, 'error');
        } finally {
            setCodeApplicationState({ stage: null });
            (window as any).pendingPackages = [];
        }
    };

    const sendChatMessage = async () => {
        const message = aiChatInput.trim();
        if (!message) return;
        if (aiModel === 'openrouter' && (!openRouterApiKey || !openRouterModelName)) {
            setIsApiKeyModalOpen(true);
            return;
        }

        addChatMessage(message, 'user');
        setAiChatInput('');
        setGenerationProgress({
            isGenerating: true, status: 'Thinking...', isStreaming: false, streamedCode: '',
            files: [], isThinking: true, thinkingText: 'Analyzing request...'
        });
        setActiveTab('generation');

        let sandboxPromise: Promise<void> | null = null;
        if (!sandboxData) {
            sandboxPromise = createSandbox();
        }

        try {
            const response = await makeRequestWithBody('/api/generate-ai-code-stream', {
                prompt: message,
                model: aiModel,
                context: {
                    sandboxId: sandboxData?.sandboxId,
                    apiKey: aiModel === 'openrouter' ? openRouterApiKey : undefined,
                    modelName: aiModel === 'openrouter' ? openRouterModelName : undefined,
                }
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let currentGeneratedCode = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                switch (data.type) {
                                    case 'thought': addChatMessage(data.text, 'thought', { duration: data.duration }); break;
                                    case 'tool_code':
                                        if (data.tool_name === 'edit_file') { addChatMessage(`Edited: ${data.args.path}`, 'system', { editedFiles: [data.args.path] }); }
                                        else if (data.tool_name === 'read_file') { addChatMessage(`Read: ${data.args.path}`, 'system', { readFiles: [data.args.path] }); }
                                        break;
                                    case 'stream':
                                        currentGeneratedCode += data.text;
                                        setGenerationProgress(prev => ({ ...prev, isStreaming: true, isThinking: false, streamedCode: prev.streamedCode + data.text }));
                                        break;
                                    case 'complete':
                                        currentGeneratedCode = data.generatedCode;
                                        setLastGeneratedCode(currentGeneratedCode);
                                        if (sandboxPromise) await sandboxPromise;
                                        await applyGeneratedCode(currentGeneratedCode);
                                        addChatMessage('Code generation complete!', 'system');
                                        setTimeout(() => setActiveTab('preview'), 2000);
                                        break;
                                    case 'error': throw new Error(data.error);
                                }
                            } catch (e) { console.error('SSE parse error:', e); }
                        }
                    }
                }
            }
        } catch (error: any) {
            addChatMessage(`Error: ${error.message}`, 'error');
        } finally {
            setGenerationProgress(prev => ({ ...prev, isGenerating: false, isStreaming: false, isThinking: false }));
        }
    };
    
    const downloadZip = async () => {
        if (!sandboxData) return addChatMessage('No sandbox to download.', 'system');
        setLoading(true);
        addChatMessage('Preparing your project for download...', 'system');
        try {
            const response = await fetch('/api/create-zip', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success) {
                const link = document.createElement('a');
                link.href = data.dataUrl;
                link.download = data.fileName || 'lovable-project.zip';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                addChatMessage('Download started!', 'system');
            } else { throw new Error(data.error); }
        } catch (error: any) {
            addChatMessage(`Failed to create ZIP: ${error.message}`, 'error');
        } finally { setLoading(false); }
    };
    
    const handleHomeScreenSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!homeDescriptionInput.trim()) return;
        setHomeScreenFading(true);
        setTimeout(() => {
            setShowHomeScreen(false);
            setHomeScreenFading(false);
            setAiChatInput(homeDescriptionInput);
            setTimeout(() => sendChatMessage(), 100);
        }, 500);
    };

    const getFileIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (['jsx', 'tsx'].includes(ext!)) return <SiReact className="w-4 h-4 text-blue-400" />;
        if (['js', 'ts'].includes(ext!)) return <SiJavascript className="w-4 h-4 text-yellow-400" />;
        if (ext === 'css') return <SiCss3 className="w-4 h-4 text-sky-400" />;
        if (ext === 'json') return <SiJson className="w-4 h-4 text-green-400" />;
        return <FiFile className="w-4 h-4 text-gray-400" />;
    };

    const toggleFolder = (path: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) newSet.delete(path);
            else newSet.add(path);
            return newSet;
        });
    };

    // --- Render Methods ---
    const themeClasses = {
        bg: isDarkMode ? 'bg-black' : 'bg-gray-100',
        text: isDarkMode ? 'text-gray-200' : 'text-gray-800',
        cardBg: isDarkMode ? 'bg-gray-900' : 'bg-white',
        border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
        inputBg: isDarkMode ? 'bg-gray-800' : 'bg-white',
        button: isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300',
        accentButton: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    };

    const renderThoughtMessage = (msg: ChatMessage) => {
        const { content, metadata } = msg;
        const durationText = metadata?.duration ? ` for ${metadata.duration} seconds` : '';
        let files: string[] = [];
        let type: 'thought' | 'edit' | 'read' = 'thought';

        if (metadata?.editedFiles) { type = 'edit'; files = metadata.editedFiles; }
        else if (metadata?.readFiles) { type = 'read'; files = metadata.readFiles; }

        const icon = { thought: <FaSpinner className="animate-spin" />, edit: <FiEdit2 />, read: <FiEye /> }[type];

        return (
            <div className={`p-3 rounded-lg ${themeClasses.cardBg} border ${themeClasses.border} mb-2`}>
                <div className="flex items-center gap-3 text-sm text-gray-400 mb-2">{icon}<span>{content}{durationText}</span></div>
                {files.length > 0 && (
                    <div className="pl-5 border-l-2 border-gray-700 ml-2">
                        {files.map((file, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm py-1">
                                <FiFile className="w-4 h-4 text-gray-500" /><span className="font-mono">{file}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderGenerationContent = () => (
        <div className="absolute inset-0 flex flex-col md:flex-row overflow-hidden">
            {/* File Explorer (Desktop) */}
            <div className={`w-full md:w-1/3 lg:w-1/4 border-r ${themeClasses.border} ${themeClasses.cardBg} hidden md:flex flex-col`}>
                <div className={`p-3 font-bold border-b ${themeClasses.border}`}>File Explorer</div>
                <div className="flex-1 overflow-y-auto p-2">
                {Object.keys(generationProgress.files).length > 0 ? generationProgress.files.map(file => (
                    <div key={file.path} onClick={() => setSelectedFile(file.path)} className={`flex items-center gap-2 p-1 rounded cursor-pointer ${selectedFile === file.path ? 'bg-indigo-500 text-white' : 'hover:bg-gray-700'}`}>
                        {getFileIcon(file.path)}
                        <span className="text-sm truncate">{file.path.split('/').pop()}</span>
                    </div>
                )) : <div className="p-2 text-sm text-gray-500">No files generated yet.</div>}
                </div>
            </div>
            {/* Code Viewer */}
            <div ref={codeDisplayRef} className="flex-1 flex flex-col overflow-y-auto p-4 bg-black">
                {generationProgress.isThinking && (
                    <div className="flex-1 flex items-center justify-center flex-col text-gray-400">
                        <FaSpinner className="animate-spin text-4xl mb-4" />
                        <p>{generationProgress.thinkingText || 'Thinking...'}</p>
                    </div>
                )}
                 {generationProgress.files.map((file, idx) => (
                    <div key={idx} className={`mb-4 border rounded-lg overflow-hidden ${themeClasses.border}`}>
                        <div className={`flex justify-between items-center p-2 text-sm font-mono ${themeClasses.cardBg}`}>
                            <div className="flex items-center gap-2">{getFileIcon(file.path)} {file.path}</div>
                            {file.edited && <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded">EDITED</span>}
                        </div>
                        <SyntaxHighlighter language={file.type} style={vscDarkPlus} customStyle={{ margin: 0, background: '#121212' }} showLineNumbers>
                            {file.content}
                        </SyntaxHighlighter>
                    </div>
                ))}
                 {generationProgress.isStreaming && !generationProgress.files.length && (
                     <SyntaxHighlighter language="jsx" style={vscDarkPlus} customStyle={{ margin: 0, background: 'transparent' }} showLineNumbers>
                        {generationProgress.streamedCode}
                    </SyntaxHighlighter>
                 )}
            </div>
        </div>
    );

    const renderPreviewContent = () => (
        <div className="w-full h-full flex-1 relative bg-gray-800">
            {sandboxData?.url ? (
                <iframe ref={iframeRef} src={sandboxData.url} className="w-full h-full border-none" title="Sandbox Preview" sandbox="allow-scripts allow-same-origin allow-forms" />
            ) : (
                <div className="w-full h-full flex items-center justify-center flex-col text-gray-500">
                    <FiZap size={48} className="mb-4" />
                    <h3 className="text-xl">Sandbox Preview</h3><p>Your app preview will appear here.</p>
                </div>
            )}
            <div className="absolute top-2 right-2 flex gap-2">
                 <Button variant="ghost" size="sm" onClick={() => { if (iframeRef.current && sandboxData) iframeRef.current.src = sandboxData.url + `?t=${Date.now()}` }} disabled={!sandboxData} className={themeClasses.button}><FiRefreshCw/></Button>
                 {sandboxData && <Button variant="ghost" size="sm" asChild className={themeClasses.button}><a href={sandboxData.url} target="_blank" rel="noopener noreferrer"><FiArrowUp/></a></Button>}
            </div>
        </div>
    );

    // --- Main JSX ---
    return (
        <div className={`h-screen font-sans flex flex-col ${themeClasses.bg} ${themeClasses.text}`}>
            {/* --- Home Screen --- */}
            <AnimatePresence>
                {showHomeScreen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 ${homeScreenFading ? 'opacity-0' : 'opacity-100'}`}>
                        <div className="w-full max-w-2xl text-center">
                            <motion.h1 initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="text-4xl md:text-6xl font-bold text-white mb-4">
                                Build something <span className="text-indigo-400">lovable</span>
                            </motion.h1>
                            <motion.p initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }} className="text-lg text-gray-300 mb-8">
                                Create apps and websites by chatting with AI.
                            </motion.p>
                            <motion.form initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} onSubmit={handleHomeScreenSubmit} className="relative">
                                <input type="text" value={homeDescriptionInput} onChange={(e) => setHomeDescriptionInput(e.target.value)} placeholder="A modern portfolio for a photographer..." className={`w-full h-14 pl-5 pr-16 rounded-full text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${themeClasses.inputBg} ${themeClasses.text} border ${themeClasses.border}`} autoFocus />
                                <button type="submit" disabled={!homeDescriptionInput.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-500 transition-all">
                                    <FiArrowUp className="text-white" />
                                </button>
                            </motion.form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- Main UI --- */}
            <div className={`flex-1 flex flex-col md:flex-row overflow-hidden ${showHomeScreen ? 'hidden' : 'flex'}`}>
                {/* --- Left Panel (Main Controls & Chat) --- */}
                <aside className={`w-full md:w-2/5 lg:w-1/3 xl:w-1/4 flex flex-col ${themeClasses.cardBg} border-r ${themeClasses.border}`}>
                    <header className={`p-3 border-b ${themeClasses.border} flex justify-between items-center`}>
                        <div className="font-bold text-lg">Open Lovable</div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setIsDarkMode(!isDarkMode)} className={themeClasses.button}>{isDarkMode ? <FaSun /> : <FaMoon />}</Button>
                            <UserButton />
                        </div>
                    </header>

                    <div className="p-3 border-b ${themeClasses.border} space-y-3">
                        <div className="flex gap-2">
                             <Button onClick={createSandbox} disabled={loading} className="w-full flex-1"><FiPlus className="mr-2"/> New Sandbox</Button>
                             <Button onClick={downloadZip} disabled={!sandboxData || loading} variant="outline" className="w-full flex-1"><FiDownload className="mr-2"/> Download ZIP</Button>
                        </div>
                        <select value={aiModel} onChange={(e) => handleModelChange(e.target.value)} className={`w-full p-2 rounded-md text-sm ${themeClasses.inputBg} border ${themeClasses.border} focus:outline-none`}>
                            {appConfig.ai.availableModels.map(model => (<option key={model} value={model}>{(appConfig.ai.modelDisplayNames as any)[model] || model}</option>))}
                            <option value="openrouter">OpenRouter</option>
                        </select>
                         <div className={`text-xs p-2 rounded-md flex items-center gap-2 ${themeClasses.inputBg}`}>
                            <div className={`w-2 h-2 rounded-full ${status.active ? 'bg-green-500' : 'bg-red-500'}`}></div>{status.text}
                        </div>
                    </div>

                    <div ref={chatMessagesRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                        {chatMessages.map((msg, idx) => (
                            (msg.type === 'thought' || msg.metadata?.editedFiles || msg.metadata?.readFiles) ?
                                <div key={idx}>{renderThoughtMessage(msg)}</div> :
                                <div key={idx} className={`flex items-end gap-2 ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-xs md:max-w-md p-3 rounded-2xl ${msg.type === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : `${themeClasses.bg} rounded-bl-none`}`}>
                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                        ))}
                         {generationProgress.isGenerating && <div className="flex items-center gap-2 text-sm text-gray-400"><FaSpinner className="animate-spin" /><span>AI is working...</span></div>}
                         {codeApplicationState.stage && <CodeApplicationProgress state={codeApplicationState} />}
                    </div>

                    <footer className={`p-4 border-t ${themeClasses.border}`}>
                        <div className="relative">
                            <Textarea value={aiChatInput} onChange={(e) => setAiChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }} placeholder="Ask Lovable..." className={`w-full p-3 pr-12 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 ${themeClasses.inputBg} border ${themeClasses.border}`} rows={2}/>
                            <button onClick={sendChatMessage} className={`absolute right-3 bottom-3 p-2 rounded-md ${themeClasses.accentButton} disabled:bg-gray-500`} disabled={!aiChatInput.trim() || generationProgress.isGenerating}>
                                <FiSend />
                            </button>
                        </div>
                    </footer>
                </aside>

                {/* --- Right Panel (Tabs for Gen/Preview) --- */}
                <main className="flex-1 flex flex-col overflow-hidden">
                     <div className={`p-2 border-b ${themeClasses.border} flex justify-center items-center gap-2`}>
                        <Button onClick={() => setActiveTab('generation')} variant={activeTab === 'generation' ? 'secondary' : 'ghost'} size="sm"><FiCode className="mr-2"/> Generation</Button>
                        <Button onClick={() => setActiveTab('preview')} variant={activeTab === 'preview' ? 'secondary' : 'ghost'} size="sm"><FiEye className="mr-2"/> Preview</Button>
                    </div>
                    <div className="flex-1 relative">
                        {activeTab === 'generation' ? renderGenerationContent() : renderPreviewContent()}
                    </div>
                </main>
            </div>

            {/* API Key Modal */}
            <AnimatePresence>
                {isApiKeyModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setIsApiKeyModalOpen(false)}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className={`p-6 rounded-lg w-full max-w-md border ${themeClasses.cardBg} ${themeClasses.border}`}>
                            <div className="flex items-center gap-3 mb-4"><FiKey className="text-yellow-400" size={24} /><h3 className="text-lg font-bold">Configure OpenRouter</h3></div>
                            <p className="text-sm text-gray-400 mb-4">Enter your API Key and the model name. They will be saved in your browser's local storage.</p>
                            <label className="text-xs font-bold text-gray-400">API KEY</label>
                            <input type="password" value={openRouterApiKey} onChange={(e) => setOpenRouterApiKey(e.target.value)} placeholder="sk-or-..." className={`w-full p-2 rounded-md ${themeClasses.inputBg} border ${themeClasses.border} focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3`} />
                            <label className="text-xs font-bold text-gray-400">MODEL NAME</label>
                            <input type="text" value={openRouterModelName} onChange={(e) => setOpenRouterModelName(e.target.value)} placeholder="qwen/qwen2-72b-instruct" className={`w-full p-2 rounded-md ${themeClasses.inputBg} border ${themeClasses.border} focus:outline-none focus:ring-2 focus:ring-indigo-500`} />
                            <div className="mt-4 flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setIsApiKeyModalOpen(false)} className={themeClasses.button}>Cancel</Button>
                                <Button onClick={saveApiKey} className={themeClasses.accentButton}>Save</Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function Page() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-black text-white">Loading...</div>}>
            <AISandboxPage />
        </Suspense>
    );
}

