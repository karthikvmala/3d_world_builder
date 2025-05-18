declare module 'postprocessing' {
    import { Camera, WebGLRenderer, Scene } from 'three';

    export class EffectComposer {
        constructor(renderer: WebGLRenderer);
        addPass(pass: Pass): void;
        render(): void;
        setSize(width: number, height: number): void;
    }

    export class Pass {
        enabled: boolean;
    }

    export class RenderPass extends Pass {
        constructor(scene: Scene, camera: Camera);
    }

    export class EffectPass extends Pass {
        constructor(camera: Camera, ...effects: Effect[]);
    }

    export class Effect {
        constructor(options?: any);
    }

    export class BloomEffect extends Effect {
        intensity: number;
        luminanceThreshold: number;
    }

    export class VignetteEffect extends Effect {
        darkness: number;
    }

    export class DepthOfFieldEffect extends Effect {
        focusDistance: number;
        focalLength: number;
        bokehScale: number;
    }
} 