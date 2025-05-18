import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import gsap from 'gsap';

export class NatureScene {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private animals: THREE.Group[] = [];
    private clock: THREE.Clock;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private audioContext: AudioContext | null = null;
    private loadingManager: THREE.LoadingManager;
    private progressBar: HTMLElement | null;
    private loadingScreen: HTMLElement | null;
    private totalItems: number = 0;
    private loadedItems: number = 0;
    private simplex: SimplexNoise;
    private water: THREE.Mesh | null = null;
    private clouds: THREE.Group[] = [];
    private windSpeed: number = 0.2;
    private dayTime: number = 0;
    private skyMaterial: THREE.MeshBasicMaterial | null = null;

    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        this.scene = scene;
        this.camera = camera;
        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.progressBar = document.getElementById('progress');
        this.loadingScreen = document.getElementById('loading');
        this.simplex = new SimplexNoise();

        // Setup loading manager
        this.loadingManager = new THREE.LoadingManager();
        this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            this.loadedItems = itemsLoaded;
            this.totalItems = itemsTotal;
            this.updateProgress();
        };
        this.loadingManager.onLoad = () => {
            this.loadedItems = this.totalItems;
            this.updateProgress();
            this.hideLoadingScreen();
        };

        // Start loading
        this.loadScene();
    }

    private updateProgress() {
        if (this.progressBar) {
            const progress = (this.loadedItems / this.totalItems) * 100;
            this.progressBar.style.width = `${progress}%`;
        }
    }

    private hideLoadingScreen() {
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('hidden');
            setTimeout(() => {
                if (this.loadingScreen && this.loadingScreen.parentNode) {
                    this.loadingScreen.parentNode.removeChild(this.loadingScreen);
                }
            }, 500);
        }
    }

    private async loadScene() {
        try {
            this.totalItems = 6; // Sky, Terrain, Water, Trees, Animals, Clouds
            this.loadedItems = 0;
            this.updateProgress();

            // Create sky and lighting
            await this.createSky();
            this.loadedItems++;
            this.updateProgress();

            // Create terrain
            await this.createTerrain();
            this.loadedItems++;
            this.updateProgress();

            // Create water
            await this.createWater();
            this.loadedItems++;
            this.updateProgress();

            // Add trees
            await this.addTrees();
            this.loadedItems++;
            this.updateProgress();

            // Add animals
            await this.addAnimals();
            this.loadedItems++;
            this.updateProgress();

            // Add clouds
            await this.addClouds();
            this.loadedItems++;
            this.updateProgress();

            // Setup event listeners
            this.setupEventListeners();
            this.hideLoadingScreen();
        } catch (error) {
            console.error('Error loading scene:', error);
            if (this.loadingScreen) {
                this.loadingScreen.innerHTML = '<div class="loading-text">Error loading scene. Please refresh the page.</div>';
            }
        }
    }

    private async createSky() {
        // Create sky dome
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000, // Start with black
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);

        // Store reference to sky material for updates
        this.skyMaterial = skyMaterial;
    }

    private async createTerrain() {
        // Create ground plane
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a7e4f,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Create detailed terrain
        const size = 200;
        const resolution = 128;
        const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
        const material = new THREE.MeshStandardMaterial({
            color: 0x3a7e4f,
            roughness: 0.8,
            metalness: 0.2,
            wireframe: false
        });

        // Generate terrain height using multiple layers of noise
        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];
            
            // Large scale terrain features
            let height = this.simplex.noise(x * 0.01, z * 0.01) * 10;
            
            // Medium scale details
            height += this.simplex.noise(x * 0.05, z * 0.05) * 5;
            
            // Small scale details
            height += this.simplex.noise(x * 0.1, z * 0.1) * 2;
            
            vertices[i + 1] = height;
        }

        geometry.computeVertexNormals();
        const terrain = new THREE.Mesh(geometry, material);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        this.scene.add(terrain);
    }

    private async createWater() {
        const geometry = new THREE.PlaneGeometry(100, 100, 32, 32);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0x0077be,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.8,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        });

        this.water = new THREE.Mesh(geometry, material);
        this.water.rotation.x = -Math.PI / 2;
        this.water.position.y = -2;
        this.scene.add(this.water);
    }

    private async addTrees() {
        const treeCount = 50;
        const treeTypes = [
            { height: 4, width: 1.5, color: 0x2d5a27 },
            { height: 3, width: 1.2, color: 0x1e8449 },
            { height: 5, width: 1.8, color: 0x27ae60 }
        ];

        for (let i = 0; i < treeCount; i++) {
            const type = treeTypes[Math.floor(Math.random() * treeTypes.length)];
            const tree = new THREE.Group();

            // Create trunk
            const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, type.height * 0.3, 8);
            const trunkMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x4d2926,
                roughness: 0.9
            });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.y = type.height * 0.15;
            trunk.castShadow = true;

            // Create foliage
            const foliageGeometry = new THREE.ConeGeometry(type.width, type.height * 0.7, 8);
            const foliageMaterial = new THREE.MeshStandardMaterial({ 
                color: type.color,
                roughness: 0.8
            });
            const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
            foliage.position.y = type.height * 0.5;
            foliage.castShadow = true;

            tree.add(trunk, foliage);

            // Position tree
            const angle = Math.random() * Math.PI * 2;
            const radius = 20 + Math.random() * 60;
            tree.position.set(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            );

            // Random rotation and scale
            tree.rotation.y = Math.random() * Math.PI * 2;
            const scale = 0.8 + Math.random() * 0.4;
            tree.scale.set(scale, scale, scale);

            this.scene.add(tree);
        }
    }

    private async addAnimals() {
        // Add birds
        for (let i = 0; i < 5; i++) {
            const bird = new THREE.Group();
            
            // Bird body
            const bodyGeometry = new THREE.SphereGeometry(0.2, 16, 16);
            const bodyMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x2c3e50,
                roughness: 0.7
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            
            // Bird wings
            const wingGeometry = new THREE.BoxGeometry(0.4, 0.1, 0.05);
            const wingMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x34495e,
                roughness: 0.7
            });
            const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
            const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
            leftWing.position.set(-0.2, 0, 0);
            rightWing.position.set(0.2, 0, 0);
            
            bird.add(body, leftWing, rightWing);

            // Position bird
            bird.position.set(
                (Math.random() - 0.5) * 80,
                10 + Math.random() * 10,
                (Math.random() - 0.5) * 80
            );

            bird.castShadow = true;
            this.scene.add(bird);
            this.animals.push(bird);

            bird.userData = {
                type: 'bird',
                wings: [leftWing, rightWing],
                onClick: () => {
                    this.playBirdSound();
                    this.animateBird(bird);
                }
            };
        }

        // Add frogs
        for (let i = 0; i < 8; i++) {
            const frog = new THREE.Group();
            
            // Frog body
            const bodyGeometry = new THREE.SphereGeometry(0.3, 16, 16);
            const bodyMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x2d5a27,
                roughness: 0.8
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            
            // Frog eyes
            const eyeGeometry = new THREE.SphereGeometry(0.1, 16, 16);
            const eyeMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xffffff,
                roughness: 0.5
            });
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(-0.2, 0.2, 0.2);
            rightEye.position.set(0.2, 0.2, 0.2);
            
            frog.add(body, leftEye, rightEye);

            // Position frog
            frog.position.set(
                (Math.random() - 0.5) * 40,
                0.3,
                (Math.random() - 0.5) * 40
            );

            frog.castShadow = true;
            this.scene.add(frog);
            this.animals.push(frog);

            frog.userData = {
                type: 'frog',
                onClick: () => {
                    this.playFrogSound();
                    this.animateFrog(frog);
                }
            };
        }
    }

    private async addClouds() {
        const cloudCount = 10;
        const cloudGeometry = new THREE.SphereGeometry(1, 16, 16);
        const cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            roughness: 1,
            metalness: 0
        });

        for (let i = 0; i < cloudCount; i++) {
            const cloud = new THREE.Group();
            const cloudPieces = 5 + Math.floor(Math.random() * 5);

            for (let j = 0; j < cloudPieces; j++) {
                const piece = new THREE.Mesh(cloudGeometry, cloudMaterial);
                piece.position.set(
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 1,
                    (Math.random() - 0.5) * 2
                );
                piece.scale.setScalar(0.5 + Math.random() * 0.5);
                cloud.add(piece);
            }

            cloud.position.set(
                (Math.random() - 0.5) * 200,
                30 + Math.random() * 20,
                (Math.random() - 0.5) * 200
            );
            cloud.scale.setScalar(5 + Math.random() * 5);

            this.scene.add(cloud);
            this.clouds.push(cloud);
        }
    }

    private setupEventListeners() {
        window.addEventListener('click', (event) => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            const intersects = this.raycaster.intersectObjects(this.animals, true);
            
            if (intersects.length > 0) {
                const animal = intersects[0].object.parent;
                if (animal && animal.userData.onClick) {
                    animal.userData.onClick();
                }
            }
        });
    }

    private animateBird(bird: THREE.Group) {
        const randomX = (Math.random() - 0.5) * 40;
        const randomZ = (Math.random() - 0.5) * 40;
        const randomY = 10 + Math.random() * 10;
        
        gsap.to(bird.position, {
            x: randomX,
            y: randomY,
            z: randomZ,
            duration: 3,
            ease: "power1.inOut"
        });

        // Animate wings
        const wings = bird.userData.wings;
        if (wings) {
            wings.forEach(wing => {
                gsap.to(wing.rotation, {
                    x: Math.PI / 4,
                    duration: 0.2,
                    yoyo: true,
                    repeat: 5
                });
            });
        }
    }

    private animateFrog(frog: THREE.Group) {
        gsap.to(frog.position, {
            y: 0.8,
            duration: 0.2,
            yoyo: true,
            repeat: 1,
            ease: "bounce.out"
        });
    }

    private initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }

    private playBirdSound() {
        this.initAudioContext();
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(440, this.audioContext.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }

    private playFrogSound() {
        this.initAudioContext();
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(110, this.audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }

    public update() {
        const delta = this.clock.getDelta();
        this.dayTime += delta * 0.1;
        
        // Update water
        if (this.water) {
            const time = this.clock.elapsedTime;
            const material = this.water.material as THREE.MeshPhysicalMaterial;
            material.opacity = 0.6 + Math.sin(time) * 0.1;
            this.water.position.y = -2 + Math.sin(time * 0.5) * 0.1;
        }

        // Update clouds
        this.clouds.forEach(cloud => {
            cloud.position.x += this.windSpeed * delta;
            if (cloud.position.x > 100) {
                cloud.position.x = -100;
            }
        });

        // Update sky color based on time of day
        const time = (this.dayTime % 24) / 24;
        if (this.skyMaterial) {
            const skyColor = new THREE.Color();
            if (time >= 0.25 && time < 0.75) { // Day time (6:00 to 18:00)
                // Day sky - bright blue
                skyColor.setHSL(0.6, 0.9, 0.7);
            } else if (time >= 0.167 && time < 0.25) { // Sunrise (4:00 to 6:00)
                const sunriseProgress = (time - 0.167) / 0.083; // 0 at 4am, 1 at 6am
                skyColor.setHSL(0.6, 0.9, 0.05 + sunriseProgress * 0.65);
            } else { // Night time
                const nightProgress = Math.min(1, Math.max(0, (time - 0.75) / 0.083)); // 0 at sunset, 1 at full night
                skyColor.setHSL(0.6, 0.8, 0.05 + nightProgress * 0.05);
            }
            this.skyMaterial.color = skyColor;
        }
    }
} 