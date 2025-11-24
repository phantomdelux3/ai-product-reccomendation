'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Star } from 'lucide-react';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: any) => void;
    productTitle: string;
}

export default function FeedbackModal({ isOpen, onClose, onSubmit, productTitle }: FeedbackModalProps) {
    const [rating, setRating] = useState(0);
    const [reason, setReason] = useState('');
    const [feedbackType, setFeedbackType] = useState('relevancy');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    const handleSubmit = () => {
        onSubmit({ rating, reason, feedback_type: feedbackType });
        onClose();
        // Reset form
        setRating(0);
        setReason('');
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="glass-card w-[90%] max-w-md rounded-2xl p-6 relative animate-in fade-in zoom-in duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <h3 className="text-xl font-semibold mb-1 text-white">Provide Feedback</h3>
                <p className="text-sm text-gray-400 mb-6">For: {productTitle}</p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Rating</label>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onClick={() => setRating(star)}
                                    className={`transition-all hover:scale-110 ${rating >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`}
                                >
                                    <Star size={24} fill={rating >= star ? "currentColor" : "none"} />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Feedback Type</label>
                        <select
                            value={feedbackType}
                            onChange={(e) => setFeedbackType(e.target.value)}
                            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                            <option value="relevancy">Relevancy</option>
                            <option value="quality">Quality</option>
                            <option value="price">Price</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Reason</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Why did you choose this rating?"
                            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-white h-24 resize-none focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={rating === 0}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Submit Feedback
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
