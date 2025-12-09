'use client';

import ProductCard from './ProductCard';

interface ToastdCarouselProps {
    products: any[];
    sessionId: string;
    messageId: string;
    onFeedbackSubmit: (data: any) => void;
}

export default function ToastdCarousel({ products, sessionId, messageId, onFeedbackSubmit }: ToastdCarouselProps) {
    if (!products || products.length === 0) return null;

    return (
        <div className="w-full mb-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="flex items-center gap-2 mb-3 ml-1">
                <span className="text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent uppercase tracking-wider">
                    Toastd Collection
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-amber-500/20 to-transparent" />
            </div>

            <div className="flex overflow-x-auto pb-4 gap-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                {products.map((product) => (
                    <div key={product.id} className="min-w-[180px] max-w-[180px] snap-center">
                        <ProductCard
                            product={product}
                            sessionId={sessionId}
                            messageId={messageId}
                            onFeedbackSubmit={onFeedbackSubmit}
                            variant="compact"
                            isToastd={true}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
