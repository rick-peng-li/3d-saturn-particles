// Global Variables
let scene, camera, renderer, composer;
let coreSystem, ringSystem;
let clock = new THREE.Clock();
let ringData = []; // Store initial data for physics calculations
let coreData = [];
let photoMeshes = []; // Store photo meshes
let photoData = []; // Store photo orbit data

// State
const state = {
    targetZoom: 0.35,
    currentZoom: 0.35,
    handDetected: false,
    chaosMode: false,
    firstResultReceived: false,
    firstFrameRendered: false
};

// Configuration
const CONFIG = {
    coreCount: 30000, // Increased for density
    ringCount: 80000, // Increased for density
    ringInner: 12,
    ringOuter: 28,
    chaosThreshold: 0.85,
    maxZoom: 20, // Closer for more impact
    minZoom: 80,
    baseBrightness: 0.45,
    maxBrightness: 1.5, // Bright when close
    photoSize: 1.5, // Size of photos on the ring
    photoGlowIntensity: 2.0 // Glow intensity for photos
};

// Initialize
window.onload = () => {
    initThree();
    createParticles();
    initHandTracking();
    initPhotoUpload();
    animate();

    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });
};

function initThree() {
    scene = new THREE.Scene();
    // Dark fog for depth
    scene.fog = new THREE.FogExp2(0x050505, 0.008);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = CONFIG.minZoom;
    camera.position.y = 6;
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false }); // Antialias off for post-processing perf
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for perf
    renderer.toneMapping = THREE.ReinhardToneMapping;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Post-processing: Bloom
    const renderScene = new THREE.RenderPass(scene, camera);
    
    // Resolution, Strength, Radius, Threshold
    const bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 
        1.5, 0.4, 0.85
    );
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;
    bloomPass.threshold = 0.1;

    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });
}

function createParticles() {
    // 1. Core Sphere (Saturn Body)
    const coreGeo = new THREE.BufferGeometry();
    const corePos = [];
    const coreColors = [];
    
    const color1 = new THREE.Color(0xeebb44); // Golden
    const color2 = new THREE.Color(0xcc8822); // Darker Orange

    for (let i = 0; i < CONFIG.coreCount; i++) {
        // Random point in sphere
        const r = 8 * Math.cbrt(Math.random()); // Radius distribution
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        corePos.push(x, y, z);
        
        // Color gradient based on radius (center is brighter/whiter, edge is darker)
        const mixedColor = color1.clone().lerp(color2, r / 8);
        coreColors.push(mixedColor.r, mixedColor.g, mixedColor.b);

        coreData.push({
            originalX: x,
            originalY: y,
            originalZ: z,
            vx: (Math.random() - 0.5) * 0.1,
            vy: (Math.random() - 0.5) * 0.1,
            vz: (Math.random() - 0.5) * 0.1
        });
    }

    coreGeo.setAttribute('position', new THREE.Float32BufferAttribute(corePos, 3));
    coreGeo.setAttribute('color', new THREE.Float32BufferAttribute(coreColors, 3));

    const coreMat = new THREE.PointsMaterial({
        size: 0.15,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.8
    });

    coreSystem = new THREE.Points(coreGeo, coreMat);
    scene.add(coreSystem);

    // 2. Rings (Keplerian)
    const ringGeo = new THREE.BufferGeometry();
    const ringPos = [];
    const ringColors = [];

    const ringColor1 = new THREE.Color(0xf0e68c); // Khaki
    const ringColor2 = new THREE.Color(0xffffff); // White
    const ringColor3 = new THREE.Color(0xa0522d); // Sienna

    for (let i = 0; i < CONFIG.ringCount; i++) {
        // Random radius between inner and outer
        const r = CONFIG.ringInner + Math.random() * (CONFIG.ringOuter - CONFIG.ringInner);
        const theta = Math.random() * Math.PI * 2;
        
        // Slight vertical spread for volume
        const y = (Math.random() - 0.5) * 0.5; 

        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);

        ringPos.push(x, y, z);

        // Keplerian Speed: v ~ 1/sqrt(r) -> angular speed w ~ 1/r^1.5
        const speed = 5.0 / Math.pow(r, 1.5);
        
        ringData.push({
            r: r,
            theta: theta,
            y: y,
            speed: speed,
            originalY: y
        });

        // Color based on bands
        let c;
        if (i % 3 === 0) c = ringColor1;
        else if (i % 3 === 1) c = ringColor2;
        else c = ringColor3;
        
        // Add some variation
        c = c.clone().multiplyScalar(0.8 + Math.random() * 0.4);
        ringColors.push(c.r, c.g, c.b);
    }

    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3));
    ringGeo.setAttribute('color', new THREE.Float32BufferAttribute(ringColors, 3));

    const ringMat = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.6
    });

    ringSystem = new THREE.Points(ringGeo, ringMat);
    // Tilt the rings slightly
    ringSystem.rotation.x = Math.PI * 0.1;
    ringSystem.rotation.z = Math.PI * 0.05;
    
    scene.add(ringSystem);
}

function initHandTracking() {
    const videoElement = document.getElementById('input_video');
    const statusElement = document.getElementById('status');
    let cameraStartFailed = false;

    const hands = new Hands({locateFile: (file) => {
        // Use unpkg which is generally more reliable in some regions or fallback to standard
        return `https://unpkg.com/@mediapipe/hands/${file}`;
    }});

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onHandResults);

    // Initialize hands explicitly to catch errors early
    statusElement.innerText = "正在加载 AI 模型...";
    
    // Start camera
    const cameraUtils = new Camera(videoElement, {
        onFrame: async () => {
            try {
                await hands.send({image: videoElement});
            } catch (error) {
                console.error("Hands processing error:", error);
            }
        },
        width: 640,
        height: 480
    });

    cameraUtils.start()
        .then(() => {
            console.log("Camera started");
            statusElement.innerText = "模型加载中...请稍候";
            
            // Timeout to hide loading if it takes too long (but warn user)
            setTimeout(() => {
                if (!state.firstResultReceived) {
                    const loadingText = document.getElementById('loading-text');
                    if (loadingText) {
                        loadingText.innerText = "模型加载较慢，请继续等待...";
                    }
                }
            }, 8000);
        })
        .catch(err => {
            cameraStartFailed = true;
            console.error("Camera error:", err);
            statusElement.innerText = "摄像头启动失败，请检查权限";
        });
}

function onHandResults(results) {
    const statusElement = document.getElementById('status');
    const loadingElement = document.getElementById('loading');
    
    // Mark as initialized on first result
    if (!state.firstResultReceived) {
        state.firstResultReceived = true;
        if (loadingElement) loadingElement.classList.add('hidden');
        console.log("First MediaPipe result received");
    }
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        state.handDetected = true;
        statusElement.innerText = "🖐️ 手势已识别 - 控制中";
        statusElement.style.color = "#00ff88";

        const landmarks = results.multiHandLandmarks[0];
        
        // Calculate "Openness"
        // Measure distance between Wrist (0) and Middle Finger Tip (12)
        // Also Wrist (0) and Index Finger Tip (8)
        
        // Simple distance check: 
        // Wrist: 0
        // Tips: 4 (Thumb), 8 (Index), 12 (Middle), 16 (Ring), 20 (Pinky)
        
        const wrist = landmarks[0];
        const tips = [4, 8, 12, 16, 20];
        let totalDist = 0;
        
        tips.forEach(idx => {
            const tip = landmarks[idx];
            const d = Math.sqrt(
                Math.pow(tip.x - wrist.x, 2) + 
                Math.pow(tip.y - wrist.y, 2)
            );
            totalDist += d;
        });
        
        const avgDist = totalDist / 5;
        
        // Mapping: 
        // Closed fist ~ avgDist 0.1 - 0.2
        // Open palm ~ avgDist 0.4 - 0.6
        // Normalize to 0-1 range
        
        const minVal = 0.2;
        const maxVal = 0.55;
        let normalized = (avgDist - minVal) / (maxVal - minVal);
        normalized = Math.max(0, Math.min(1, normalized));
        
        state.targetZoom = normalized; // 0 = small/far, 1 = big/close

    } else {
        state.handDetected = false;
        statusElement.innerText = "等待手势指令...";
        statusElement.style.color = "#ffaa00";
        // Do not reset targetZoom immediately, let it stay or drift back slowly?
        // Let's drift back to default (0.2) if no hand
        state.targetZoom = state.targetZoom * 0.95 + 0.35 * 0.05;
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // 1. Smooth Zoom Interpolation
    state.currentZoom += (state.targetZoom - state.currentZoom) * 0.1;

    // 2. Update Camera Position based on Zoom
    // minZoom (100) -> maxZoom (30)
    // 0 -> 1
    const targetZ = CONFIG.minZoom - (state.currentZoom * (CONFIG.minZoom - CONFIG.maxZoom));
    camera.position.z = targetZ;
    camera.lookAt(0, 0, 0);

    // 3. Brightness Physics
    // Small (dim) -> Large (bright)
    // Non-linear brightness curve for more drama
    // When far (zoom=0), brightness is baseBrightness (0.1)
    // When close (zoom=1), brightness is maxBrightness (1.5)
    // Curve: Exponential or Quadratic
    const zoomFactor = Math.pow(state.currentZoom, 2.5); // Steep curve
    const brightness = CONFIG.baseBrightness + zoomFactor * (CONFIG.maxBrightness - CONFIG.baseBrightness);
    
    // Core Brightness
    coreSystem.material.opacity = Math.min(1, brightness);
    coreSystem.material.size = 0.15 * (1 + state.currentZoom * 2); // Particles get significantly bigger

    // Ring Brightness
    ringSystem.material.opacity = Math.min(0.8, brightness * 0.8);
    ringSystem.material.size = 0.1 * (1 + state.currentZoom * 1.5);

    // 4. Chaos Mode Trigger
    state.chaosMode = state.currentZoom > CONFIG.chaosThreshold;

    // 5. Update Particles
    updateRings(delta);
    updateCore(delta);
    updatePhotos(delta);

    // Use composer instead of renderer
    composer.render();

    if (!state.firstFrameRendered) {
        state.firstFrameRendered = true;
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.classList.add('hidden');
            setTimeout(() => {
                if (loadingElement.classList.contains('hidden')) {
                    loadingElement.style.display = 'none';
                }
            }, 900);
        }
    }
}

function updateRings(delta) {
    const positions = ringSystem.geometry.attributes.position.array;
    
    // Chaos Intensity
    let chaosIntensity = 0;
    if (state.chaosMode) {
        // Map 0.85->1.0 to 0->1
        chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
    }

    // Optimization: Pre-calculate randomness for high freq noise if possible,
    // but for "flies buzzing" we need per-frame random.
    // Since we have 80k particles, Math.random() 80k times * 3 might be heavy.
    // But user said "ignore performance".
    
    const time = clock.getElapsedTime();

    for (let i = 0; i < CONFIG.ringCount; i++) {
        const data = ringData[i];
        
        // Update Angle (Keplerian)
        data.theta += data.speed * delta * 0.5;

        let x, y, z;

        if (state.chaosMode) {
            // Chaos: High frequency noise + Explosion
            // "Break orbit laws" -> move away from ring shape
            
            // Explosion factor: particles move outwards from center
            const explodeFactor = chaosIntensity * 20; 
            
            // High freq noise (Brownian-like)
            // Use sin/cos of high multiples of time + index to simulate random noise deterministically (cheaper than Math.random)
            // or just Math.random() if we want true chaos.
            const noiseAmp = chaosIntensity * 2.0; 
            
            // Base orbit position
            const bx = data.r * Math.cos(data.theta);
            const bz = data.r * Math.sin(data.theta);
            
            // "Explode" direction: normal vector from center (bx, 0, bz) normalized is (cos, 0, sin)
            // Let's add radial explosion
            x = bx + Math.cos(data.theta) * explodeFactor;
            z = bz + Math.sin(data.theta) * explodeFactor;
            y = data.y + (Math.random() - 0.5) * explodeFactor; // Explode vertically too

            // Add high frequency buzz
            x += (Math.random() - 0.5) * noiseAmp;
            y += (Math.random() - 0.5) * noiseAmp;
            z += (Math.random() - 0.5) * noiseAmp;
            
        } else {
            // Normal Orbit
            x = data.r * Math.cos(data.theta);
            y = data.y;
            z = data.r * Math.sin(data.theta);
        }

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
    }
    
    ringSystem.geometry.attributes.position.needsUpdate = true;
}

function updateCore(delta) {
    // Rotate the core slowly
    coreSystem.rotation.y += delta * 0.05;

    if (state.chaosMode) {
        const positions = coreSystem.geometry.attributes.position.array;
        const chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
        const jitter = chaosIntensity * 3.0; // Strong jitter for core
        const explode = chaosIntensity * 5.0; // Core explosion

        for(let i=0; i < CONFIG.coreCount; i++) {
            const data = coreData[i];

            // Core explosion: push out from center
            // data.originalX/Y/Z is the vector from center

            const px = data.originalX * (1 + explode);
            const py = data.originalY * (1 + explode);
            const pz = data.originalZ * (1 + explode);

            // Add jitter
            positions[i*3] = px + (Math.random() - 0.5) * jitter;
            positions[i*3+1] = py + (Math.random() - 0.5) * jitter;
            positions[i*3+2] = pz + (Math.random() - 0.5) * jitter;
        }
        coreSystem.geometry.attributes.position.needsUpdate = true;
    } else {
        // Reset to original (only if we need to, optimization: check if we were just in chaos)
        // For visual consistency, let's reset always if not chaos
        const positions = coreSystem.geometry.attributes.position.array;
        // Optimization: check if first particle is misplaced
        if (Math.abs(positions[0] - coreData[0].originalX) > 0.001) {
             for(let i=0; i < CONFIG.coreCount; i++) {
                positions[i*3] = coreData[i].originalX;
                positions[i*3+1] = coreData[i].originalY;
                positions[i*3+2] = coreData[i].originalZ;
            }
            coreSystem.geometry.attributes.position.needsUpdate = true;
        }
    }
}

// Photo Upload and Management
function initPhotoUpload() {
    const fileInput = document.getElementById('photo-upload');
    const statusElement = document.getElementById('status');

    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length === 0) return;

        statusElement.innerText = `正在加载 ${files.length} 张照片...`;
        statusElement.style.color = '#00aaff';

        Array.from(files).forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                setTimeout(() => {
                    loadPhoto(file);
                }, index * 200); // Stagger loading
            }
        });

        // Reset input
        setTimeout(() => {
            fileInput.value = '';
            statusElement.innerText = `已添加 ${files.length} 张照片到土星环`;
            statusElement.style.color = '#00ff88';
        }, files.length * 200 + 500);
    });
}

function loadPhoto(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            createPhotoSprite(img);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function createPhotoSprite(image) {
    // Create a canvas to process the image with glow effect
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Calculate size maintaining aspect ratio
    const maxSize = 256;
    let width = image.width;
    let height = image.height;

    if (width > height) {
        if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
        }
    } else {
        if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
        }
    }

    // Add padding for glow
    const padding = 40;
    canvas.width = width + padding * 2;
    canvas.height = height + padding * 2;

    // Draw glow effect
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Create radial gradient for glow
    const gradient = ctx.createRadialGradient(centerX, centerY, Math.max(width, height) / 2, centerX, centerY, Math.max(width, height) / 2 + padding);
    gradient.addColorStop(0, 'rgba(255, 220, 150, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 180, 100, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 150, 50, 0)');

    // Draw glow
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw additional outer glow layers
    for (let i = 3; i > 0; i--) {
        ctx.save();
        ctx.globalAlpha = 0.3 * i;
        ctx.shadowColor = `rgba(255, 200, 100, ${0.5 * i})`;
        ctx.shadowBlur = 20 * i;
        ctx.drawImage(image, padding, padding, width, height);
        ctx.restore();
    }

    // Draw the main image
    ctx.drawImage(image, padding, padding, width, height);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create sprite material with the texture
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
    });

    // Create sprite
    const sprite = new THREE.Sprite(material);
    const aspectRatio = canvas.width / canvas.height;
    const baseSize = CONFIG.photoSize;
    sprite.scale.set(baseSize * aspectRatio, baseSize, 1);

    // Position on the ring with random distribution
    const r = CONFIG.ringInner + Math.random() * (CONFIG.ringOuter - CONFIG.ringInner);
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 0.8;

    // Calculate initial position matching ring tilt
    const ringTiltX = Math.PI * 0.1;
    const ringTiltZ = Math.PI * 0.05;

    // Base position on ring plane
    const baseX = r * Math.cos(theta);
    const baseZ = r * Math.sin(theta);

    // Apply ring rotation
    const cosX = Math.cos(ringTiltX);
    const sinX = Math.sin(ringTiltX);
    const cosZ = Math.cos(ringTiltZ);
    const sinZ = Math.sin(ringTiltZ);

    // Rotate around X then Z
    const y1 = y * cosX - baseZ * sinX;
    const z1 = y * sinX + baseZ * cosX;

    const x2 = baseX * cosZ - y1 * sinZ;
    const y2 = baseX * sinZ + y1 * cosZ;

    sprite.position.set(x2, y2, z1);

    // Store orbit data for animation
    const speed = 3.0 / Math.pow(r, 1.5); // Slightly slower than particles for visual interest

    photoData.push({
        r: r,
        theta: theta,
        y: y,
        speed: speed,
        baseX: baseX,
        baseZ: baseZ,
        ringTiltX: ringTiltX,
        ringTiltZ: ringTiltZ
    });

    photoMeshes.push(sprite);
    scene.add(sprite);
}

function updatePhotos(delta) {
    const time = clock.getElapsedTime();

    for (let i = 0; i < photoMeshes.length; i++) {
        const mesh = photoMeshes[i];
        const data = photoData[i];

        // Update angle (Keplerian orbit)
        data.theta += data.speed * delta * 0.5;

        let x, y, z;

        if (state.chaosMode) {
            // Chaos mode: photos also get affected
            const chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
            const explodeFactor = chaosIntensity * 15;
            const noiseAmp = chaosIntensity * 1.5;

            // Base orbit position
            const bx = data.r * Math.cos(data.theta);
            const bz = data.r * Math.sin(data.theta);

            // Apply explosion
            const cosTheta = Math.cos(data.theta);
            const sinTheta = Math.sin(data.theta);

            x = bx + cosTheta * explodeFactor;
            z = bz + sinTheta * explodeFactor;
            y = data.y + (Math.random() - 0.5) * explodeFactor;

            // Add noise
            x += (Math.random() - 0.5) * noiseAmp;
            y += (Math.random() - 0.5) * noiseAmp;
            z += (Math.random() - 0.5) * noiseAmp;

            // Apply ring tilt
            const cosX = Math.cos(data.ringTiltX);
            const sinX = Math.sin(data.ringTiltX);
            const cosZ = Math.cos(data.ringTiltZ);
            const sinZ = Math.sin(data.ringTiltZ);

            const y1 = y * cosX - z * sinX;
            const z1 = y * sinX + z * cosX;

            const x2 = x * cosZ - y1 * sinZ;
            const y2 = x * sinZ + y1 * cosZ;

            mesh.position.set(x2, y2, z1);

            // Scale up in chaos mode
            const scaleMultiplier = 1 + chaosIntensity * 0.5;
            mesh.scale.set(
                CONFIG.photoSize * (mesh.material.map.image.width / mesh.material.map.image.height) * scaleMultiplier,
                CONFIG.photoSize * scaleMultiplier,
                1
            );
        } else {
            // Normal orbit with ring tilt
            const bx = data.r * Math.cos(data.theta);
            const bz = data.r * Math.sin(data.theta);

            const cosX = Math.cos(data.ringTiltX);
            const sinX = Math.sin(data.ringTiltX);
            const cosZ = Math.cos(data.ringTiltZ);
            const sinZ = Math.sin(data.ringTiltZ);

            const y1 = data.y * cosX - bz * sinX;
            const z1 = data.y * sinX + bz * cosX;

            const x2 = bx * cosZ - y1 * sinZ;
            const y2 = bx * sinZ + y1 * cosZ;

            mesh.position.set(x2, y2, z1);

            // Normal scale
            const aspectRatio = mesh.material.map.image.width / mesh.material.map.image.height;
            mesh.scale.set(CONFIG.photoSize * aspectRatio, CONFIG.photoSize, 1);
        }

        // Make photos always face the camera
        mesh.lookAt(camera.position);

        // Pulse glow effect based on time
        const pulse = 1 + Math.sin(time * 2 + i) * 0.1;
        mesh.material.opacity = 0.85 + Math.sin(time * 3 + i) * 0.1;
    }
}
