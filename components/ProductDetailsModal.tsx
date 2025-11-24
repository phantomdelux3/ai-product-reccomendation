'use client';
import { X, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ProductDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: {
        title: string;
        price_numeric: number;
        image_url: string;
        description?: string;
        product_url: string;
        brand?: string;
    };
}

export default function ProductDetailsModal({ isOpen, onClose, product }: ProductDetailsModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-[90%] md:w-full max-w-lg bg-gray-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-lg font-semibold text-white truncate pr-4">Product Details</h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto p-6 custom-scrollbar">
                    <div className="flex flex-col gap-6">
                        {/* Image & Basic Info */}
                        <div className="flex gap-4 items-start">
                            <div className="w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden border border-white/10 bg-white/5">
                                <img
                                    src={product.image_url}
                                    alt={product.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-base font-medium text-white leading-snug mb-2">{product.title}</h4>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xl font-bold text-purple-400">₹{product.price_numeric}</span>
                                </div>
                                {product.brand && (
                                    <p className="text-sm text-gray-400">{product.brand}</p>
                                )}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</h5>
                            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {product.description || "No description available for this product."}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-black/20">
                    <a
                        href={product.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-purple-500/25"
                    >
                        View on Store <ExternalLink size={18} />
                    </a>
                </div>
            </div>
        </div>,
        document.body
    );
}
