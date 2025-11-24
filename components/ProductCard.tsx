'use client';

import { useState } from 'react';
import { MoreVertical, ExternalLink, Info } from 'lucide-react';
import FeedbackModal from './FeedbackModal';
import ProductDetailsModal from './ProductDetailsModal';

interface Product {
    id: string;
    title: string;
    price_numeric: number;
    image_url: string;
    product_url: string;
    description?: string;
    brand?: string;
}

interface ProductCardProps {
    product: Product;
    sessionId: string;
    messageId: string;
    onFeedbackSubmit: (data: any) => void;
}

export default function ProductCard({ product, sessionId, messageId, onFeedbackSubmit }: ProductCardProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [showDescription, setShowDescription] = useState(false);

    const handleFeedback = (data: any) => {
        onFeedbackSubmit({
            ...data,
            sessionId,
            messageId,
            productId: product.id,
            productTitle: product.title
        });
    };

    return (
        <>
            <div className="glass-card rounded-xl group relative flex flex-col h-full">
                <div className="relative aspect-square overflow-hidden rounded-t-xl">
                    <img
                        src={product.image_url}
                        alt={product.title}
                        className={`object-cover w-full h-full transition-transform duration-500 group-hover:scale-110`}
                    />

                    <div className="absolute top-2 right-2 z-10 flex gap-1">
                        <button
                            onClick={() => setShowDescription(true)}
                            className={`p-1.5 rounded-full backdrop-blur-md transition-colors bg-black/50 text-white hover:bg-black/70`}
                        >
                            <Info size={16} />
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className="p-1.5 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70 transition-colors"
                            >
                                <MoreVertical size={16} />
                            </button>

                            {showMenu && (
                                <div className="absolute right-0 mt-2 w-32 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20">
                                    <button
                                        onClick={() => {
                                            setShowFeedback(true);
                                            setShowMenu(false);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                                    >
                                        Give Feedback
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 flex flex-col flex-grow">
                    <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="font-medium text-white line-clamp-2 text-sm leading-tight">
                            {product.title}
                        </h3>
                        <span className="font-bold text-purple-400 whitespace-nowrap">
                            ₹{product.price_numeric}
                        </span>
                    </div>

                    {product.brand && (
                        <p className="text-xs text-gray-500 mb-3">{product.brand}</p>
                    )}

                    <div className="mt-auto pt-3">
                        <a
                            href={product.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-gray-300 transition-colors"
                        >
                            View Product <ExternalLink size={12} />
                        </a>
                    </div>
                </div>

                <FeedbackModal
                    isOpen={showFeedback}
                    onClose={() => setShowFeedback(false)}
                    onSubmit={handleFeedback}
                    productTitle={product.title}
                />

                <ProductDetailsModal
                    isOpen={showDescription}
                    onClose={() => setShowDescription(false)}
                    product={product}
                />
            </div>
        </>
    );
}
