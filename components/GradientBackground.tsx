'use client';

import React from 'react';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';

export default function GradientBackground() {
    return (
        <div className='absolute inset-0 w-full h-full -z-10 overflow-hidden pointer-events-none'>
            <ShaderGradientCanvas
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
                pixelDensity={1}
                pointerEvents='none'
            >
                <ShaderGradient
                    animate='on'
                    type='sphere'
                    wireframe={false}
                    shader='defaults'
                    uTime={0}
                    uSpeed={0.2}
                    uStrength={0.3}
                    uDensity={0.8}
                    uFrequency={5.5}
                    uAmplitude={3.2}
                    positionX={-0.1}
                    positionY={0}
                    positionZ={0}
                    rotationX={0}
                    rotationY={130}
                    rotationZ={70}
                    color1='#000000'
                    color2='#ca8a04'
                    color3='#facc15'
                    reflection={0.4}
                    // View (camera) props
                    cAzimuthAngle={270}
                    cPolarAngle={180}
                    cDistance={0.5}
                    cameraZoom={15.1}
                    // Effect props
                    lightType='env'
                    brightness={0.8}
                    envPreset='city'
                    grain='on'
                    // Tool props
                    toggleAxis={false}
                    zoomOut={false}
                    hoverState=''
                    enableTransition={false}
                />
            </ShaderGradientCanvas>
        </div>
    );
}
