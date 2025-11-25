'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export default function EmptyChatState() {
    const containerRef = useRef<HTMLDivElement>(null);

    useGSAP(() => {
        // Rotating Text Animation
        const rotatingWords = ["your Girlfriend", "Boyfriend", "Christmas", "New Year", "Best Friend", "Birthday Gift"];
        let wordIdx = 0;

        const rotateText = () => {
            const target = document.getElementById('rotating-text');
            if (!target) return;

            const tl = gsap.timeline({
                onComplete: () => {
                    gsap.delayedCall(2, () => {
                        wordIdx = (wordIdx + 1) % rotatingWords.length;
                        rotateText();
                    });
                }
            });

            tl.to(target, {
                duration: 0.5,
                opacity: 0,
                y: -20,
                ease: "power2.in",
                onComplete: () => {
                    target.textContent = rotatingWords[wordIdx];
                    gsap.set(target, { y: 20 });
                }
            })
                .to(target, {
                    duration: 0.5,
                    opacity: 1,
                    y: 0,
                    ease: "back.out(1.7)"
                });
        };

        // Start rotating text after a short delay to sync with fade-in
        gsap.delayedCall(1, rotateText);

        // Main Logo Animation (slide down from top)
        gsap.fromTo("#main-logo",
            { y: -30, opacity: 0 },
            { y: 0, opacity: 1, duration: 1, ease: "power3.out", delay: 0.1 }
        );

    }, { scope: containerRef });

    return (
        <div ref={containerRef} className="h-full flex flex-col items-center justify-center text-center p-8 animate-in fade-in zoom-in duration-700">
            <div id="main-logo" className="w-64 md:w-80 mb-8 opacity-0">
                <img src="/toastdlogo.png" alt="Toastd" className="w-full h-auto drop-shadow-2xl" />
            </div>
            <h2 className="flex flex-col items-center text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight gap-3">
                <span className="opacity-90">Find gifts for</span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-purple-400 h-[1.3em] pb-2" id="rotating-text">your Girlfriend</span>
            </h2>
            <p className="text-gray-400 max-w-md text-lg md:text-xl leading-relaxed font-light">
                I can help you find the perfect gift based on occasion, interests, and budget.
            </p>
        </div>
    );
}
