'use client';

import { User, Bot } from 'lucide-react';
import ProductCard from './ProductCard';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    products?: any[];
}

interface MessageBubbleProps {
    message: Message;
    sessionId: string;
    onFeedbackSubmit: (data: any) => void;
}

export default function MessageBubble({ message, sessionId, onFeedbackSubmit }: MessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${isUser ? 'bg-purple-600' : 'bg-transparent'}`}>
                    {isUser ? <User size={16} className="text-white" /> : <img src="/logo.png" alt="AI" className="w-full h-full object-cover" />}
                </div>

                <div className={`flex flex-col flex-1 min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className={`px-5 py-3 rounded-2xl text-sm leading-relaxed max-w-[85%] md:max-w-[75%] ${isUser
                        ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100 rounded-tr-none'
                        : 'glass text-gray-100 rounded-tl-none'
                        }`}>
                        {message.content}
                    </div>
                </div>
            </div>

            {message.products && message.products.length > 0 && (
                <div className="mt-4 w-full animate-in fade-in slide-in-from-bottom-2 duration-700">
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
        </div>
    );
}
