import React from 'react';
import { Plus } from 'lucide-react';

interface NewChatCardProps {
    onClick: () => void;
}

const NewChatCard: React.FC<NewChatCardProps> = ({ onClick }) => {
    return (
        <button
            onClick={onClick}
            className='relative w-full flex items-center justify-center gap-2 px-4 py-3 [background:linear-gradient(45deg,#080b11,--theme(--color-slate-800)_50%,#172033)_padding-box,conic-gradient(from_var(--border-angle),--theme(--color-slate-600/.48)_80%,--theme(--color-indigo-500)_86%,--theme(--color-indigo-300)_90%,--theme(--color-indigo-500)_94%,--theme(--color-slate-600/.48))_border-box] rounded-xl border border-transparent animate-border hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 text-white font-medium shadow-lg hover:shadow-purple-500/25'
        >
            <Plus size={20} />
            <span>New Chat</span>
        </button>
    );
};

export default NewChatCard;
