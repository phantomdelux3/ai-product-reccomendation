'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ShoppingBag, DollarSign, User, Heart, ArrowRight, ArrowLeft, Check } from 'lucide-react';

import { RECIPIENTS, AESTHETIC_OPTIONS, BUDGET_OPTIONS, COLLECTION_MAP } from '@/lib/config/guided-mode';

interface GuidedSearchInterfaceProps {
    onGuidedSubmit: (payload: any) => void;
}

export default function GuidedSearchInterface({ onGuidedSubmit }: GuidedSearchInterfaceProps) {
    const [recipient, setRecipient] = useState<string>('');
    const [productTypes, setProductTypes] = useState<string[]>([]);
    const [aesthetics, setAesthetics] = useState<string[]>([]);
    const [budget, setBudget] = useState<string>('');
    const [optionsData, setOptionsData] = useState<Record<string, any>>({});
    const [availableTypes, setAvailableTypes] = useState<any[]>([]);

    // Mobile Wizard Step State
    const [step, setStep] = useState(0); // 0: Recipient, 1: Type, 2: Aesthetic, 3: Budget

    const recipients = RECIPIENTS;
    const aestheticOptions = AESTHETIC_OPTIONS;
    const budgetOptions = BUDGET_OPTIONS;

    // Load options from API
    useEffect(() => {
        fetch('/api/options')
            .then(res => res.json())
            .then(data => {
                setOptionsData(data);
            })
            .catch(err => console.error('Failed to load options:', err));
    }, []);

    // Update available product types when recipient changes
    useEffect(() => {
        if (recipient) {
            const key = COLLECTION_MAP[recipient.toLowerCase()] || recipient.toLowerCase();
            if (optionsData[key]) {
                setAvailableTypes(optionsData[key] || []);
            } else {
                setAvailableTypes([]);
            }
        } else {
            setAvailableTypes([]);
        }
        setProductTypes([]); // Reset product types
    }, [recipient, optionsData]);

    const toggleProductType = (type: string) => {
        setProductTypes(prev =>
            prev.includes(type)
                ? prev.filter(item => item !== type)
                : [...prev, type]
        );
    };

    const toggleAesthetic = (option: string) => {
        setAesthetics(prev =>
            prev.includes(option)
                ? prev.filter(item => item !== option)
                : [...prev, option]
        );
    };

    const handleSubmit = () => {
        if (!recipient) return;

        const payload = {
            recipient,
            productTypes,
            aesthetics,
            budget,
            is_guided: true
        };
        onGuidedSubmit(payload);
    };

    const nextStep = () => {
        if (step < 3) setStep(step + 1);
    };

    const prevStep = () => {
        if (step > 0) setStep(step - 1);
    };

    // Render Steps for Mobile
    const renderStepContent = () => {
        switch (step) {
            case 0: // Recipient
                return (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right duration-300">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <User className="text-yellow-400" size={20} /> Who is this for?
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {recipients.map(r => (
                                <button
                                    key={r}
                                    onClick={() => { setRecipient(r); setTimeout(nextStep, 200); }}
                                    className={`p-4 rounded-xl text-sm font-medium transition-all border text-left flex justify-between items-center ${recipient === r
                                        ? 'bg-yellow-600/20 border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.3)]'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        }`}
                                >
                                    {r}
                                    {recipient === r && <Check size={16} className="text-yellow-400" />}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            case 1: // Product Types
                return (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right duration-300">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <ShoppingBag className="text-orange-400" size={20} /> What are they into?
                        </h3>
                        <div className="flex flex-wrap gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                            {availableTypes.map((cat: any) => (
                                <button
                                    key={cat.id}
                                    onClick={() => toggleProductType(cat.label)}
                                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border ${productTypes.includes(cat.label)
                                        ? 'bg-orange-600/20 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            case 2: // Aesthetics
                return (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right duration-300">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Heart className="text-amber-400" size={20} /> What's their vibe?
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {aestheticOptions.map(a => (
                                <button
                                    key={a}
                                    onClick={() => toggleAesthetic(a)}
                                    className={`px-4 py-3 rounded-full text-sm font-medium transition-all border ${aesthetics.includes(a)
                                        ? 'bg-amber-600/20 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        }`}
                                >
                                    {a}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            case 3: // Budget
                return (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right duration-300">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <DollarSign className="text-yellow-400" size={20} /> What's your budget?
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {budgetOptions.map(b => (
                                <button
                                    key={b}
                                    onClick={() => setBudget(b)}
                                    className={`p-4 rounded-xl text-sm font-medium transition-all border text-left flex justify-between items-center ${budget === b
                                        ? 'bg-yellow-600/20 border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.3)]'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        }`}
                                >
                                    {b}
                                    {budget === b && <Check size={16} className="text-yellow-400" />}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* Desktop Grid Layout (Hidden on Mobile) */}
            <div className="hidden md:block overflow-y-auto custom-scrollbar p-1">
                <div className="grid grid-cols-2 gap-6">
                    {/* Recipient */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <User size={16} className="text-yellow-400" /> To Who?
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {recipients.map(r => (
                                <button
                                    key={r}
                                    onClick={() => setRecipient(r)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${recipient === r
                                        ? 'bg-yellow-600/20 border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.3)]'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        }`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Budget */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <DollarSign size={16} className="text-yellow-400" /> Budget
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {budgetOptions.map(b => (
                                <button
                                    key={b}
                                    onClick={() => setBudget(b)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${budget === b
                                        ? 'bg-yellow-600/20 border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.3)]'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        }`}
                                >
                                    {b}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Product Type */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <ShoppingBag size={16} className="text-orange-400" /> Product Type
                        </label>
                        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                            {availableTypes.length === 0 && (
                                <span className="text-xs text-gray-500 italic">
                                    {!recipient ? "Select a recipient first" : "No categories found for this recipient"}
                                </span>
                            )}
                            {availableTypes.map((cat: any) => (
                                <button
                                    key={cat.id}
                                    onClick={() => toggleProductType(cat.label)}
                                    disabled={!recipient}
                                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${productTypes.includes(cat.label)
                                        ? 'bg-orange-600/20 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Aesthetics */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <Heart size={16} className="text-amber-400" /> Aesthetics
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {aestheticOptions.map(a => (
                                <button
                                    key={a}
                                    onClick={() => toggleAesthetic(a)}
                                    className={`px-3 py-2 rounded-full text-xs font-medium transition-all border ${aesthetics.includes(a)
                                        ? 'bg-amber-600/20 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                        }`}
                                >
                                    {a}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-center pt-8">
                    <button
                        onClick={handleSubmit}
                        disabled={!recipient}
                        className="group relative px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-full text-white font-bold shadow-lg hover:shadow-yellow-500/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Find Perfect Gifts
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-yellow-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </button>
                </div>
            </div>

            {/* Mobile Wizard Layout */}
            <div className="md:hidden flex flex-col h-full">
                {/* Progress Bar */}
                <div className="flex gap-2 mb-6">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-yellow-500' : 'bg-white/10'}`} />
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
                    {renderStepContent()}
                </div>

                {/* Mobile Navigation */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/80 backdrop-blur-xl border-t border-white/10 flex justify-between items-center z-50">
                    <button
                        onClick={prevStep}
                        disabled={step === 0}
                        className="p-3 rounded-full bg-white/5 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ArrowLeft size={20} />
                    </button>

                    {step < 3 ? (
                        <button
                            onClick={nextStep}
                            disabled={step === 0 && !recipient}
                            className="px-6 py-3 bg-white text-black font-bold rounded-full flex items-center gap-2 disabled:opacity-50"
                        >
                            Next <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={!budget}
                            className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-600 text-white font-bold rounded-full flex items-center gap-2 shadow-lg shadow-yellow-500/30 disabled:opacity-50"
                        >
                            Find Gifts <Sparkles size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
