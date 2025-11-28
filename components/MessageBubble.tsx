'use client';

import { useState, useEffect } from 'react';
import { User, Bot } from 'lucide-react';
import ProductCard from './ProductCard';
import ToastdCarousel from './ToastdCarousel';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    products?: any[];
    toastdProducts?: any[];
}

interface MessageBubbleProps {
    message: Message;
    sessionId: string;
    onFeedbackSubmit: (data: any) => void;
}

export default function MessageBubble({ message, sessionId, onFeedbackSubmit }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const [displayedContent, setDisplayedContent] = useState(isUser ? message.content : '');
    const [isTyping, setIsTyping] = useState(!isUser);

    useEffect(() => {
        if (isUser) {
            setDisplayedContent(message.content);
            return;
        }

        // Simple typing effect
        let index = 0;
        const speed = 30; // ms per char (Slower)

        // If content is very long, speed it up slightly but still keep it readable
        const dynamicSpeed = message.content.length > 200 ? 15 : 30;

        const interval = setInterval(() => {
            if (index <= message.content.length) {
                setDisplayedContent(message.content.slice(0, index));
                index++;
            } else {
                setIsTyping(false);
                clearInterval(interval);
            }
        }, dynamicSpeed);

        return () => clearInterval(interval);
    }, [message.content, isUser]);

    return (
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Toastd Products (Top) */}
            {!isUser && message.toastdProducts && message.toastdProducts.length > 0 && (
                <ToastdCarousel
                    products={message.toastdProducts}
                    sessionId={sessionId}
                    messageId={message.id}
                    onFeedbackSubmit={onFeedbackSubmit}
                />
            )}

            {/* Main Products (Middle) */}
            {!isUser && message.products && message.products.length > 0 && (
                <div className="mb-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-700">
                    <p className="text-xs text-gray-500 mb-3 ml-1 font-medium tracking-wide uppercase">Recommended for you</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                        {message.products.map((product) => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                sessionId={sessionId}
                                messageId={message.id}
                                onFeedbackSubmit={onFeedbackSubmit}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Message Content (Bottom) */}
            <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${isUser ? 'bg-purple-600' : 'bg-transparent'}`}>
                    {isUser ? <User size={16} className="text-white" /> : <img src="/logo.png" alt="AI" className="w-full h-full object-cover" />}
                </div>

                <div className={`flex flex-col flex-1 min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className={`px-5 py-3 rounded-2xl text-sm leading-relaxed max-w-[85%] md:max-w-[75%] ${isUser
                        ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100 rounded-tr-none'
                        : 'glass text-gray-100 rounded-tl-none'
                        }`}>
                        {displayedContent}
                        {isTyping && <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-purple-400 animate-pulse" />}
                    </div>
                </div>
            </div>
        </div>
    );
}
