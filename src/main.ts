import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { ColorCorrectionShader } from 'three/addons/shaders/ColorCorrectionShader.js';
import { NatureScene } from './nature-scene';
import * as dat from 'dat.gui';
import { Howl } from 'howler';

interface LightSource {
    name: string;
    light: THREE.SpotLight | THREE.PointLight | THREE.DirectionalLight;
    helper?: THREE.SpotLightHelper | THREE.PointLightHelper | THREE.DirectionalLightHelper;
    color: THREE.Color;
    intensity: number;
    type: 'spot' | 'point' | 'directional';
    folder?: dat.GUI;
}

interface SceneObject {
    mesh: THREE.Mesh;
    name: string;
    material: THREE.MeshStandardMaterial;
}

class SoundManager {
    private sounds: { [key: string]: Howl } = {};
    private music: Howl | null = null;
    private isMusicPlaying: boolean = false;

    constructor() {
        // Initialize background music
        this.music = new Howl({
            src: ['/assets/ambient.mp3'],
            loop: true,
            volume: 3
        });

        // Start playing music immediately
        this.music.play();
        this.isMusicPlaying = true;

        // Initialize sound effects
        this.sounds = {
            rain: new Howl({
                src: ['/assets/rain.mp3'],
                loop: true,
                volume: 1000
            }),
            addObject: new Howl({
                src: ['/assets/pop.mp3'],
                volume: 0.4
            }),
            addLight: new Howl({
                src: ['/assets/light-on.mp3'],
                volume: 0.4
            }),
            removeObject: new Howl({
                src: ['/assets/remove.mp3'],
                volume: 0.4
            }),
            removeLight: new Howl({
                src: ['/assets/light-off.mp3'],
                volume: 0.4
            })
        };
    }

    toggleMusic() {
        if (!this.music) return;
        
        if (this.isMusicPlaying) {
            this.music.fade(0.5, 0, 1000);
            this.music.once('fade', () => this.music?.pause());
        } else {
            this.music.play();
            this.music.fade(0, 0.5, 1000);
        }
        this.isMusicPlaying = !this.isMusicPlaying;
    }

    playSound(name: string) {
        this.sounds[name]?.play();
    }

    toggleRainSound(enabled: boolean) {
        if (enabled) {
            this.sounds.rain?.fade(0, 0.3, 1000);
            this.sounds.rain?.play();
        } else {
            this.sounds.rain?.fade(0.3, 0, 1000);
            this.sounds.rain?.once('fade', () => this.sounds.rain?.pause());
        }
    }

    setVolume(type: 'music' | 'effects', value: number) {
        if (type === 'music' && this.music) {
            this.music.volume(value);
        } else {
            Object.values(this.sounds).forEach(sound => {
                sound.volume(value);
            });
        }
    }
}

class LightingVisualizer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private composer: EffectComposer;
    private natureScene: NatureScene;
    private gui: dat.GUI;
    private rainGui: dat.GUI;
    private lights: THREE.Light[] = [];
    private objects: THREE.Object3D[] = [];
    private effects: {
        bloom: UnrealBloomPass;
        colorCorrection: ShaderPass;
        exposure: number;
        contrast: number;
    };
    private lightSources: LightSource[] = [];
    private sceneObjects: SceneObject[] = [];
    private ambientLight: THREE.AmbientLight;
    private room: THREE.Group;
    private time: number = 0;
    private sunLight: THREE.DirectionalLight;
    private sun: THREE.Mesh;
    private moon: THREE.Mesh;
    private timeSpeed: number = 1;
    private isPlaying: boolean = true;
    private isDay: boolean = true;
    private stars: THREE.Points;
    private rain: THREE.Points | null = null;
    private isRaining: boolean = false;
    private rainIntensity: number = 1.0;
    private soundManager: SoundManager;

    constructor() {
        // Initialize scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Initialize sound manager first
        this.soundManager = new SoundManager();

        // Initialize camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(50, 50, 50);
        this.camera.lookAt(0, 0, 0);

        // Initialize nature scene with camera
        this.natureScene = new NatureScene(this.scene, this.camera);

        // Create stars
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.6,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending
        });

        const starsVertices: number[] = [];
        for (let i = 0; i < 2000; i++) {
            const x = (Math.random() - 0.5) * 1000;
            const y = (Math.random() - 0.5) * 1000;
            const z = (Math.random() - 0.5) * 1000;
            starsVertices.push(x, y, z);
        }

        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        this.stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(this.stars);

        // Create sun and moon
        const sunGeometry = new THREE.SphereGeometry(2, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 1.0
        });
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
        this.scene.add(this.sun);

        const moonGeometry = new THREE.SphereGeometry(1.5, 32, 32);
        const moonMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0
        });
        this.moon = new THREE.Mesh(moonGeometry, moonMaterial);
        this.moon.visible = false;
        this.scene.add(this.moon);

        // Create directional light for sun/moon
        this.sunLight = new THREE.DirectionalLight(0xffffff, 5);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.sunLight.shadow.bias = -0.0001;
        this.scene.add(this.sunLight);

        // Initialize renderer with darker settings
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        document.body.appendChild(this.renderer.domElement);

        // Initialize controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 200;
        this.controls.maxPolarAngle = Math.PI; // Allow full vertical rotation
        this.controls.minPolarAngle = 0;
        this.controls.enablePan = true; // Enable panning
        this.controls.panSpeed = 1.0;
        this.controls.rotateSpeed = 0.8;
        this.controls.zoomSpeed = 1.2;

        // Initialize post-processing
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Initialize effects
        this.effects = {
            bloom: new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                0.5,
                0.4,
                0.85
            ),
            colorCorrection: new ShaderPass(ColorCorrectionShader),
            exposure: 1.2,
            contrast: 1.1
        };

        this.composer.addPass(this.effects.bloom);
        this.composer.addPass(this.effects.colorCorrection);

        // Initialize GUI
        this.gui = new dat.GUI();
        
        // Instructions folder
        const instructionsFolder = this.gui.addFolder('Controls');
        instructionsFolder.add({ message: 'Zoom: Scroll' }, 'message').name('').listen();
        instructionsFolder.add({ message: 'Move: L_click + Move' }, 'message').name('').listen();
        instructionsFolder.add({ message: 'Pan: R_click + Move' }, 'message').name('').listen();
        
        this.setupGUI();

        // Initialize rain GUI
        this.rainGui = new dat.GUI();
        this.rainGui.domElement.style.position = 'absolute';
        this.rainGui.domElement.style.left = '10px';
        this.rainGui.domElement.style.top = '10px';
        this.setupRainGUI();

        // Add initial lights
        this.addLight('Directional', new THREE.Vector3(5, 5, 5));
        this.addLight('Point', new THREE.Vector3(-5, 3, 0));
        this.addLight('Spot', new THREE.Vector3(0, 5, -5));

        // Add initial objects
        this.addObject('Sphere');
        this.addObject('Cube');
        this.addObject('Torus');

        // Initialize rain
        this.createRain();

        // Handle window resize
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Set initial time and update sky color
        this.time = 0; // Start at noon
        this.updateTimeOfDay();

        // Start animation loop
        this.animate();
    }

    private setupRainGUI() {
        // Create a container for the rain controls
        const rainContainer = {
            title: 'Special Feature: Rain',
            enabled: false,
            intensity: 1.0,
            color: '#ffffff',
            opacity: 0.8,
            size: 0.2
        };

        // Add title
        this.rainGui.add(rainContainer, 'title').name('').listen();

        // Add controls
        this.rainGui.add(rainContainer, 'enabled').name('Enable Rain').onChange((value) => {
            this.isRaining = value;
            this.soundManager.toggleRainSound(value);
            if (this.rain) {
                this.rain.visible = value;
                if (value) {
                    // Reset rain positions when enabled
                    const positions = this.rain.geometry.attributes.position.array as Float32Array;
                    for (let i = 0; i < positions.length; i += 3) {
                        positions[i] = (Math.random() - 0.5) * 200;
                        positions[i + 1] = Math.random() * 100;
                        positions[i + 2] = (Math.random() - 0.5) * 200;
                    }
                    this.rain.geometry.attributes.position.needsUpdate = true;
                }
            }
        });

        this.rainGui.add(rainContainer, 'intensity', 0.1, 3.0).name('Rain Intensity').onChange((value) => {
            this.rainIntensity = value;
        });

        this.rainGui.addColor(rainContainer, 'color').name('Rain Color').onChange((value) => {
            if (this.rain) {
                (this.rain.material as THREE.PointsMaterial).color.set(value);
            }
        });

        this.rainGui.add(rainContainer, 'opacity', 0.1, 1.0).name('Rain Opacity').onChange((value) => {
            if (this.rain) {
                (this.rain.material as THREE.PointsMaterial).opacity = value;
            }
        });

        this.rainGui.add(rainContainer, 'size', 0.05, 0.5).name('Rain Drop Size').onChange((value) => {
            if (this.rain) {
                (this.rain.material as THREE.PointsMaterial).size = value;
            }
        });

        // Style the GUI
        const style = document.createElement('style');
        style.textContent = `
            .dg.ac {
                z-index: 1000 !important;
            }
            .dg.main {
                margin-left: 10px !important;
            }
            .dg.main .close-button {
                display: none !important;
            }
            .dg.main .title {
                background: #2fa1d6 !important;
                font-weight: bold !important;
            }
        `;
        document.head.appendChild(style);
    }

    private setupGUI() {
        // Add custom styles for the main GUI
        const style = document.createElement('style');
        style.textContent = `
            .dg.main {
                margin-right: 10px !important;
            }
            .dg.main .title {
                background: rgb(0, 0, 0) !important;
                font-weight: bold !important;
            }
            .dg.main .folder {
                background: #34495e !important;
            }
            .dg.main .folder .title {
                background: rgb(0, 0, 0) !important;
            }
            .dg.main .folder .folder {
                background: #2c3e50 !important;
            }
            .dg.main .folder .folder .title {
                background: rgb(0, 0, 0) !important;
            }
            .dg.main .close-button {
                display: none !important;
            }
            .dg.main .folder .close-button {
                display: none !important;
            }
            .dg.main .folder .folder .close-button {
                display: none !important;
            }
            .dg.main .folder .folder .folder .close-button {
                display: none !important;
            }
        `;
        document.head.appendChild(style);

        // Camera controls as a top-level folder
        const cameraFolder = this.gui.addFolder('Camera');
        
        // Camera position controls
        const positionFolder = cameraFolder.addFolder('Position');
        positionFolder.add(this.camera.position, 'x', -100, 100).name('Position X').setValue(50).onChange(() => {
            this.camera.updateProjectionMatrix();
        });
        positionFolder.add(this.camera.position, 'y', 1, 100).name('Position Y').setValue(50).onChange(() => {
            this.camera.updateProjectionMatrix();
        });
        positionFolder.add(this.camera.position, 'z', -100, 100).name('Position Z').setValue(50).onChange(() => {
            this.camera.updateProjectionMatrix();
        });

        // Time controls as a top-level folder
        const timeFolder = this.gui.addFolder('Time Controls');
        timeFolder.add({ time: 0 }, 'time', 0, 24).name('Hour').onChange((value) => {
            this.time = value;
            this.updateTimeOfDay();
            if (this.natureScene) {
                (this.natureScene as any).dayTime = value;
                (this.natureScene as any).update();
            }
        });
        timeFolder.add({ speed: 1 }, 'speed', 0, 10).name('Time Speed').onChange((value) => {
            this.timeSpeed = value;
        });
        timeFolder.add({ play: this.isPlaying }, 'play').name('Play/Pause').onChange((value) => {
            this.isPlaying = value;
            this.timeSpeed = value ? 1 : 0;
        });

        // Ambient light controls
        const ambientFolder = this.gui.addFolder('Ambient Light');
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(this.ambientLight);
        ambientFolder.addColor(this.ambientLight, 'color').name('Ambient Light Color');

        // Lighting controls
        const lightingFolder = this.gui.addFolder('Add Lighting');
        lightingFolder.add({ addDirectional: () => this.addLight('Directional') }, 'addDirectional').name('Add Directional Light');
        lightingFolder.add({ addPoint: () => this.addLight('Point') }, 'addPoint').name('Add Point Light');
        lightingFolder.add({ addSpot: () => this.addLight('Spot') }, 'addSpot').name('Add Spot Light');

        // Post-processing controls
        const postFolder = this.gui.addFolder('Post-Processing');
        
        // Bloom controls
        const bloomFolder = postFolder.addFolder('Bloom');
        bloomFolder.add(this.effects.bloom, 'strength', 0, 5).name('Bloom Strength');
        bloomFolder.add(this.effects.bloom, 'radius', 0, 2).name('Bloom Radius');
        bloomFolder.add(this.effects.bloom, 'threshold', 0, 1).name('Bloom Threshold');

        // Object controls
        const objectFolder = this.gui.addFolder('Add Objects');
        const addObjectControls = {
            addSphere: () => this.addObject('Sphere'),
            addCube: () => this.addObject('Cube'),
            addTorus: () => this.addObject('Torus'),
            addCylinder: () => this.addObject('Cylinder'),
            addCone: () => this.addObject('Cone')
        };
        objectFolder.add(addObjectControls, 'addSphere').name('Add Sphere');
        objectFolder.add(addObjectControls, 'addCube').name('Add Cube');
        objectFolder.add(addObjectControls, 'addTorus').name('Add Torus');
        objectFolder.add(addObjectControls, 'addCylinder').name('Add Cylinder');
        objectFolder.add(addObjectControls, 'addCone').name('Add Cone');

        // Sound controls
        const soundFolder = this.gui.addFolder('Sound');
        soundFolder.add({ toggleMusic: () => this.soundManager.toggleMusic() }, 'toggleMusic').name('Toggle Music');
        soundFolder.add({ musicVolume: 0.5 }, 'musicVolume', 0, 1).name('Music Volume').onChange((value) => {
            this.soundManager.setVolume('music', value);
        });
        soundFolder.add({ effectsVolume: 0.4 }, 'effectsVolume', 0, 1).name('Effects Volume').onChange((value) => {
            this.soundManager.setVolume('effects', value);
        });
    }

    private addLight(type: string, position?: THREE.Vector3) {
        let light: THREE.SpotLight | THREE.PointLight | THREE.DirectionalLight;
        const color = new THREE.Color(0xffffff);
        const intensity = 5;
        const name = `${type} Light ${this.lightSources.length + 1} (edit or remove)`;

        switch (type) {
            case 'Directional':
                light = new THREE.DirectionalLight(color, intensity);
                if (position) light.position.copy(position);
                break;
            case 'Point':
                light = new THREE.PointLight(color, intensity);
                if (position) light.position.copy(position);
                break;
            case 'Spot':
                light = new THREE.SpotLight(color, intensity);
                if (position) light.position.copy(position);
                light.angle = Math.PI / 4;
                light.penumbra = 0.1;
                break;
            default:
                return;
        }

        light.castShadow = true;
        this.scene.add(light);

        // Create light helper
        let helper: THREE.SpotLightHelper | THREE.PointLightHelper | THREE.DirectionalLightHelper;
        switch (type) {
            case 'Directional':
                helper = new THREE.DirectionalLightHelper(light as THREE.DirectionalLight);
                break;
            case 'Point':
                helper = new THREE.PointLightHelper(light as THREE.PointLight);
                break;
            case 'Spot':
                helper = new THREE.SpotLightHelper(light as THREE.SpotLight);
                break;
        }
        this.scene.add(helper);

        // Add light controls to GUI
        const lightFolder = this.gui.addFolder(name);
        
        // Color controls
        const colorFolder = lightFolder.addFolder('Color');
        colorFolder.addColor(light, 'color').name('Light Color');
        colorFolder.add(light, 'intensity', 0, 10).setValue(5).name('Light Intensity');
        
        // Position controls
        const positionFolder = lightFolder.addFolder('Position');
        positionFolder.add(light.position, 'x', -50, 50).name('Position X');
        positionFolder.add(light.position, 'y', 0, 50).name('Position Y');
        positionFolder.add(light.position, 'z', -50, 50).name('Position Z');

        // Type-specific controls
        if (light instanceof THREE.SpotLight) {
            const spotFolder = lightFolder.addFolder('Spot Properties');
            spotFolder.add(light, 'angle', 0, Math.PI / 2).name('Spot Angle');
            spotFolder.add(light, 'penumbra', 0, 1).name('Spot Penumbra');
            spotFolder.add(light, 'distance', 0, 100).name('Spot Distance');
        }

        // Add remove button
        lightFolder.add({ remove: () => this.removeLight(name) }, 'remove').name('Remove Light');

        // Store light source
        this.lightSources.push({
            name,
            light,
            helper,
            color,
            intensity,
            type: type as 'spot' | 'point' | 'directional',
            folder: lightFolder
        });

        this.soundManager.playSound('addLight');
    }

    private removeLight(name: string) {
        const lightSource = this.lightSources.find(source => source.name === name);
        if (lightSource) {
            this.scene.remove(lightSource.light);
            if (lightSource.helper) {
                this.scene.remove(lightSource.helper);
            }
            if (lightSource.folder) {
                this.gui.removeFolder(lightSource.folder);
            }
            this.lightSources = this.lightSources.filter(source => source.name !== name);
            this.soundManager.playSound('removeLight');
        }
    }

    private addObject(type: string) {
        let geometry: THREE.BufferGeometry;
        let material: THREE.Material;

        switch (type) {
            case 'Sphere':
                geometry = new THREE.SphereGeometry(1, 32, 32);
                break;
            case 'Cube':
                geometry = new THREE.BoxGeometry(1, 1, 1);
                break;
            case 'Torus':
                geometry = new THREE.TorusGeometry(1, 0.3, 16, 100);
                break;
            case 'Cylinder':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 32);
                break;
            case 'Cone':
                geometry = new THREE.ConeGeometry(0.5, 2, 32);
                break;
            default:
                return;
        }

        material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.5,
            metalness: 0.5
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Position objects
        const height = type === 'Cylinder' || type === 'Cone' ? 1 : 
                      type === 'Torus' ? 2 : 0.5;
        mesh.position.set(
            (Math.random() - 0.5) * 5,
            height,
            (Math.random() - 0.5) * 5
        );

        this.scene.add(mesh);
        this.objects.push(mesh);

        // Add material controls to GUI
        const objectFolder = this.gui.addFolder(`${type} ${this.objects.length} (edit or remove)`);
        
        // Add delete button at the top
        objectFolder.add({ delete: () => this.deleteObject(mesh, objectFolder) }, 'delete').name('Delete Object');
        
        // Material properties
        const materialFolder = objectFolder.addFolder('Material');
        if (material instanceof THREE.MeshStandardMaterial) {
            materialFolder.addColor({ color: material.color.getHex() }, 'color').name('Object Color').onChange((value) => {
                material.color.set(value);
            });
            materialFolder.add(material, 'roughness', 0, 1).name('Surface Roughness');
            materialFolder.add(material, 'metalness', 0, 1).name('Metalness');
        }
        
        // Position controls
        const positionFolder = objectFolder.addFolder('Position');
        positionFolder.add(mesh.position, 'x', -10, 10).name('Position X');
        positionFolder.add(mesh.position, 'y', 0, 10).name('Position Y');
        positionFolder.add(mesh.position, 'z', -10, 10).name('Position Z');
        
        // Rotation controls
        const rotationFolder = objectFolder.addFolder('Rotation');
        rotationFolder.add(mesh.rotation, 'x', 0, Math.PI * 2).name('Rotation X');
        rotationFolder.add(mesh.rotation, 'y', 0, Math.PI * 2).name('Rotation Y');
        rotationFolder.add(mesh.rotation, 'z', 0, Math.PI * 2).name('Rotation Z');
        
        // Scale controls
        const scaleFolder = objectFolder.addFolder('Scale');
        scaleFolder.add(mesh.scale, 'x', 0.1, 3).name('Scale X');
        scaleFolder.add(mesh.scale, 'y', 0.1, 3).name('Scale Y');
        scaleFolder.add(mesh.scale, 'z', 0.1, 3).name('Scale Z');

        this.soundManager.playSound('addObject');
    }

    private deleteObject(mesh: THREE.Mesh, folder: dat.GUI) {
        this.soundManager.playSound('removeObject');
        // Remove from scene
        this.scene.remove(mesh);
        // Remove from objects array
        this.objects = this.objects.filter(obj => obj !== mesh);
        // Remove from GUI
        this.gui.removeFolder(folder);
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    private updateTimeOfDay() {
        // Calculate sun/moon position based on time
        const hour = this.time % 24;
        const angle = (hour / 24) * Math.PI * 2;
        
        // Update sun/moon visibility and position
        this.isDay = hour >= 6 && hour < 18;
        this.sun.visible = this.isDay;
        this.moon.visible = !this.isDay;
        
        // Update stars visibility
        if (this.stars) {
            this.stars.visible = !this.isDay;
            // Fade stars in/out during twilight
            const twilightStart = 18; // Sunset
            const twilightEnd = 20;   // Full night
            const dawnStart = 4;      // Start of dawn
            const dawnEnd = 6;        // Sunrise
            
            let opacity = 0;
            if (!this.isDay) {
                if (hour >= twilightStart && hour < twilightEnd) {
                    opacity = (hour - twilightStart) / (twilightEnd - twilightStart);
                } else if (hour >= dawnStart && hour < dawnEnd) {
                    opacity = 1 - (hour - dawnStart) / (dawnEnd - dawnStart);
                } else {
                    opacity = 1;
                }
            }
            (this.stars.material as THREE.PointsMaterial).opacity = opacity * 1.2;
        }
        
        // Calculate positions
        const radius = 50;
        const height = Math.sin(angle) * radius;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        // Update positions
        this.sun.position.set(x, height, z);
        this.moon.position.set(x, height, z);
        this.sunLight.position.copy(this.isDay ? this.sun.position : this.moon.position);
        
        // Update light intensity based on time
        let intensity = 0;
        if (this.isDay) {
            // Day time intensity
            const noon = 12;
            const distanceFromNoon = Math.abs(hour - noon);
            intensity = Math.max(0, 5 - (distanceFromNoon / 6) * 4);
        } else {
            // Night time intensity
            const midnight = 0;
            const distanceFromMidnight = Math.abs(hour - midnight);
            intensity = Math.max(0, 1 - (distanceFromMidnight / 6));
        }
        this.sunLight.intensity = intensity;
        
        // Update ambient light
        this.ambientLight.intensity = this.isDay ? 0.3 : 0.15;
        
        console.log(hour);
        // Update sky color with smooth transitions
        const skyColor = new THREE.Color();
        console.log(skyColor);
        if (this.isDay) {
            // Day sky - bright blue
            skyColor.setHSL(0.6, 0.9, 0.7); // More saturated blue
        } else {
            // Night sky - dark blue to black
            const nightProgress = Math.min(1, Math.max(0, (hour - 18) / 2)); // 0 at sunset, 1 at full night
            if (hour >= 4 && hour < 6) {
                // Sunrise transition
                const sunriseProgress = (hour - 4) / 2; // 0 at 4am, 1 at 6am
                skyColor.setHSL(0.6, 0.9, 0.05 + sunriseProgress * 0.65); // Transition to blue
            } else {
                skyColor.setHSL(0.6, 0.8, 0.05 + nightProgress * 0.05); // Darker as night progresses
            }
        }
        this.scene.background = skyColor;
    }

    private createRain() {
        const rainGeometry = new THREE.BufferGeometry();
        const rainCount = 15000; // Increased number of raindrops
        const positions = new Float32Array(rainCount * 3);
        const velocities = new Float32Array(rainCount);

        for (let i = 0; i < rainCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 200; // Wider spread
            positions[i * 3 + 1] = Math.random() * 100; // Higher starting point
            positions[i * 3 + 2] = (Math.random() - 0.5) * 200; // Wider spread
            velocities[i] = 0.5 + Math.random() * 0.5; // Faster rain
        }

        rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

        const rainMaterial = new THREE.PointsMaterial({
            color: 0xffffff, // Brighter color
            size: 0.2, // Larger drops
            transparent: true,
            opacity: 0.8, // More visible
            blending: THREE.AdditiveBlending,
            depthWrite: false // Fix visibility issues
        });

        this.rain = new THREE.Points(rainGeometry, rainMaterial);
        this.rain.visible = false;
        this.scene.add(this.rain);
    }

    private updateRain() {
        if (!this.rain || !this.isRaining) return;

        const positions = this.rain.geometry.attributes.position.array as Float32Array;
        const velocities = this.rain.geometry.attributes.velocity.array as Float32Array;

        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] -= velocities[i / 3] * this.rainIntensity;

            if (positions[i + 1] < 0) {
                positions[i + 1] = 100; // Reset higher
                positions[i] = (Math.random() - 0.5) * 200; // Wider spread
                positions[i + 2] = (Math.random() - 0.5) * 200; // Wider spread
            }
        }

        this.rain.geometry.attributes.position.needsUpdate = true;
    }

    private animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        // Update time
        if (this.timeSpeed > 0) {
            this.time += this.timeSpeed * 0.01;
            if (this.time >= 24) {
                this.time = 0;
            }
            this.updateTimeOfDay();
            if (this.natureScene) {
                (this.natureScene as any).dayTime = this.time;
                (this.natureScene as any).update();
            }
        }
        
        // Update rain
        this.updateRain();
        
        this.controls.update();
        this.natureScene.update();
        this.composer.render();
    }
}

// Initialize the visualizer
new LightingVisualizer();