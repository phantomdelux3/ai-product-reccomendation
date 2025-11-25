'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Menu, X, MessageSquare, Plus, RefreshCw } from 'lucide-react';
import MessageBubble from './MessageBubble';
import GradientBackground from './GradientBackground';
import NewChatCard from './NewChatCard';
import EmptyChatState from './EmptyChatState';
import { v4 as uuidv4 } from 'uuid';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    products?: any[];
}

interface Session {
    id: string;
    session_name: string;
    created_at: string;
}

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string>('');
    const [guestId, setGuestId] = useState<string>('');
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (messages.length > 0) {
            scrollToBottom();
        }
    }, [messages]);

    // GSAP Typing Animation for Placeholder
    useGSAP(() => {
        // Placeholder Animation
        const placeholders = ["Romantic anniversary gifts for girlfriend", "What to gift a boyfriend who loves gaming", "Unique gardening gifts for mom", "Minimalist room decor gifts for college students"];
        let currentIdx = 0;

        const typeText = () => {
            if (!inputRef.current) return;
            const text = placeholders[currentIdx];
            const chars = text.split('');

            const tl = gsap.timeline({
                onComplete: () => {
                    gsap.delayedCall(2, () => {
                        currentIdx = (currentIdx + 1) % placeholders.length;
                        typeText();
                    });
                }
            });

            // Reset placeholder
            inputRef.current.placeholder = "";

            // Type effect simulation
            let currentText = "";
            chars.forEach((char, i) => {
                tl.to({}, {
                    duration: 0.1,
                    onStart: () => {
                        if (inputRef.current) {
                            currentText += char;
                            inputRef.current.placeholder = currentText + "|";
                        }
                    }
                });
            });

            // Blink cursor at end
            tl.to({}, {
                duration: 0.5,
                repeat: 3,
                yoyo: true,
                onStart: () => {
                    if (inputRef.current) inputRef.current.placeholder = currentText + " ";
                },
                onRepeat: () => {
                    if (inputRef.current) inputRef.current.placeholder = currentText + "|";
                }
            });
        };

        typeText();

    }, { scope: containerRef });

    // Initialize Guest ID and fetch sessions
    useEffect(() => {
        let storedGuestId = localStorage.getItem('guest_uuid');
        if (!storedGuestId) {
            storedGuestId = uuidv4();
            localStorage.setItem('guest_uuid', storedGuestId);
        }
        setGuestId(storedGuestId);
        fetchSessions(storedGuestId);
    }, []);

    const fetchSessions = async (gId: string) => {
        try {
            const res = await fetch(`/api/sessions?guestId=${gId}`);
            const data = await res.json();
            if (data.sessions) {
                setSessions(data.sessions);
            }
        } catch (error) {
            console.error('Error fetching sessions:', error);
        }
    };

    const loadSession = async (sId: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/message/chat?sessionId=${sId}`);
            const data = await res.json();
            if (data.messages) {
                setMessages(data.messages);
                setSessionId(sId);
                setIsSidebarOpen(false); // Close sidebar after selection
            }
        } catch (error) {
            console.error('Error loading session:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const startNewChat = () => {
        setSessionId('');
        setMessages([]);
        setIsSidebarOpen(false);
    };

    const [thinkingStatus, setThinkingStatus] = useState<string>('');

    const handleSendMessage = async (isReload = false) => {
        let messageToSend = input.trim();

        if (isReload) {
            const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
            if (!lastUserMessage) return;
            messageToSend = lastUserMessage.content;
        } else {
            if (!messageToSend) return;
        }

        if (isLoading) return;

        setIsLoading(true);
        setThinkingStatus("Thinking...");

        if (!isReload) {
            const tempUserMessage: Message = {
                id: Date.now().toString(),
                role: 'user',
                content: messageToSend
            };
            setMessages(prev => [...prev, tempUserMessage]);
            setInput('');
        }

        try {
            const response = await fetch('/api/message/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageToSend,
                    sessionId: sessionId || undefined,
                    guestId,
                    isReload
                })
            });

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line);

                        if (event.type === 'status') {
                            setThinkingStatus(event.message);
                        } else if (event.type === 'result') {
                            const data = event.data;

                            if (data.sessionId && !sessionId) {
                                setSessionId(data.sessionId);
                                fetchSessions(guestId);
                            }

                            const assistantMessage: Message = {
                                id: data.messageId,
                                role: 'assistant',
                                content: data.assistantResponse,
                                products: data.products
                            };

                            setMessages(prev => [...prev, assistantMessage]);
                            setThinkingStatus(''); // Clear status on completion
                        } else if (event.type === 'error') {
                            console.error('Stream error:', event.message);
                            setThinkingStatus('');
                        }
                    } catch (e) {
                        console.error('Error parsing stream line:', e);
                    }
                }
            }

        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: "I'm having trouble connecting right now. Please try again."
            }]);
            setThinkingStatus('');
        } finally {
            setIsLoading(false);
            setThinkingStatus('');
        }
    };

    const handleFeedbackSubmit = async (feedbackData: any) => {
        // Clean messageId if it has suffixes (from history load)
        const cleanMessageId = feedbackData.messageId.replace(/_(user|assistant)$/, '');

        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...feedbackData,
                    messageId: cleanMessageId
                })
            });
            console.log('Feedback submitted successfully');
        } catch (error) {
            console.error('Error submitting feedback:', error);
        }
    };

    return (
        <div ref={containerRef} className="flex h-full w-full glass-card rounded-none md:rounded-3xl overflow-hidden shadow-2xl border-0 md:border border-white/10 relative bg-black">
            {/* Dynamic Shader Gradient Background */}
            <GradientBackground />

            {/* Sidebar (Mobile & Desktop - Always Hidden by Default) */}
            <div className={`absolute inset-y-0 left-0 z-30 w-72 bg-black/95 backdrop-blur-xl border-r border-white/10 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-white font-bold text-xl tracking-tight">History</h2>
                    <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4">
                    <NewChatCard onClick={startNewChat} />
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {sessions.map(session => (
                        <button
                            key={session.id}
                            onClick={() => loadSession(session.id)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all duration-200 flex items-center gap-3 group ${sessionId === session.id ? 'bg-white/10 text-white shadow-inner' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                        >
                            <MessageSquare size={16} className={`transition-colors ${sessionId === session.id ? 'text-pink-500' : 'text-gray-500 group-hover:text-gray-300'}`} />
                            <span className="truncate font-medium">{session.session_name || 'New Conversation'}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Overlay for sidebar */}
            {isSidebarOpen && (
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full relative w-full overflow-hidden">
                {/* Header */}
                <div className="flex-none p-4 md:p-6 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center gap-4 z-10">
                    <button onClick={() => setIsSidebarOpen(true)} className="text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <Menu size={24} />
                    </button>
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/5 flex items-center justify-center shadow-lg ring-1 ring-white/10 overflow-hidden">
                        <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">AI Gift Concierge</h1>
                        <p className="text-xs text-purple-300 font-medium">Powered by Toastd</p>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 space-y-6 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    {messages.length === 0 && (
                        <EmptyChatState />
                    )}

                    {messages.map((msg) => (
                        <MessageBubble
                            key={msg.id}
                            message={msg}
                            sessionId={sessionId}
                            onFeedbackSubmit={handleFeedbackSubmit}
                        />
                    ))}

                    {thinkingStatus && (
                        <div className="flex gap-4 mb-8 px-2 items-center animate-fade-in">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                                <Sparkles size={16} className="text-white animate-spin-slow" />
                            </div>
                            <div className="glass px-6 py-3 rounded-2xl rounded-tl-none border border-white/10 bg-white/5 backdrop-blur-md flex items-center gap-3">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                                    <span className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></span>
                                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                                </div>
                                <span className="text-sm font-medium text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 animate-pulse">
                                    {thinkingStatus}
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="flex-none p-4 md:p-6 bg-black/40 border-t border-white/10 backdrop-blur-xl z-10">
                    {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
                        <div className="flex justify-center mb-4">
                            <button
                                onClick={() => handleSendMessage(true)}
                                disabled={isLoading}
                                className="group flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-medium text-gray-300 transition-all hover:scale-105 hover:border-purple-500/50 hover:text-white hover:shadow-lg hover:shadow-purple-500/10"
                            >
                                <RefreshCw size={14} className={`group-hover:rotate-180 transition-transform duration-500 ${isLoading ? 'animate-spin' : ''}`} />
                                Reload Recommendations
                            </button>
                        </div>
                    )}
                    <div className="relative flex items-center max-w-4xl mx-auto group">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            className="w-full bg-gray-900/60 border border-gray-700/50 text-white rounded-full py-4 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 placeholder-gray-500 transition-all shadow-inner group-hover:bg-gray-900/80 group-hover:border-gray-600"
                            disabled={isLoading}
                        />
                        <button
                            onClick={() => handleSendMessage()}
                            disabled={!input.trim() || isLoading}
                            className="absolute right-2 p-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full text-white shadow-lg hover:shadow-purple-500/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                    <p className="text-center text-[10px] text-gray-500 mt-3 font-medium tracking-wide">
                        AI can make mistakes. Please verify product details.
                    </p>
                </div>
            </div>
        </div>
    );
}
