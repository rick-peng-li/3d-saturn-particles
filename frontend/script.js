// Global Variables
let scene, camera, renderer, composer;
let coreSystem, ringSystem;
let clock = new THREE.Clock();
let ringData = []; // Store initial data for physics calculations
let coreData = [];

// Custom Shape Data
let customShapePoints = null;
let customShapeType = 'default'; // 'default', 'draw', 'upload'

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
    colors: {
        core: 0xeebb44,
        ring1: 0xf0e68c,
        ring2: 0xffffff,
        ring3: 0xa0522d
    }
};

// Initialize
window.onload = () => {
    initThree();
    createParticles();
    initHandTracking();
    initCustomShapeUI();
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

    const color1 = new THREE.Color(CONFIG.colors.core);
    const color2 = new THREE.Color(CONFIG.colors.core).multiplyScalar(0.7);

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

    if (coreSystem) {
        scene.remove(coreSystem);
        coreSystem.geometry.dispose();
        coreSystem.material.dispose();
    }

    coreSystem = new THREE.Points(coreGeo, coreMat);
    scene.add(coreSystem);

    // 2. Rings (Keplerian)
    const ringGeo = new THREE.BufferGeometry();
    const ringPos = [];
    const ringColors = [];

    const ringColor1 = new THREE.Color(CONFIG.colors.ring1);
    const ringColor2 = new THREE.Color(CONFIG.colors.ring2);
    const ringColor3 = new THREE.Color(CONFIG.colors.ring3);

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

    if (ringSystem) {
        scene.remove(ringSystem);
        ringSystem.geometry.dispose();
        ringSystem.material.dispose();
    }

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

// ==================== Custom Shape UI ====================

function initCustomShapeUI() {
    const modal = document.getElementById('custom-shape-modal');
    const openBtn = document.getElementById('custom-shape-btn');
    const closeBtn = document.getElementById('close-modal');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Open modal
    openBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    // Close modal
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${tab}-tab`).classList.add('active');
        });
    });

    initDrawCanvas();
    initUploadCanvas();
    initColorSettings();
}

// ==================== Draw Canvas ====================

function initDrawCanvas() {
    const canvas = document.getElementById('draw-canvas');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clear-draw');
    const useBtn = document.getElementById('use-draw-shape');

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // Initialize canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function startDrawing(e) {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        lastX = (e.clientX || e.touches[0].clientX) - rect.left;
        lastY = (e.clientY || e.touches[0].clientY) - rect.top;
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();

        lastX = x;
        lastY = y;
    }

    function stopDrawing() {
        isDrawing = false;
    }

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);

    // Clear button
    clearBtn.addEventListener('click', () => {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    // Use shape button
    useBtn.addEventListener('click', () => {
        const points = extractPointsFromCanvas(canvas);
        if (points.length > 0) {
            customShapePoints = points;
            customShapeType = 'draw';
            updateParticlesWithCustomShape();
            document.getElementById('custom-shape-modal').classList.add('hidden');
        } else {
            alert('请先绘制形状！');
        }
    });
}

// ==================== Upload Canvas ====================

function initUploadCanvas() {
    const uploadArea = document.getElementById('upload-area');
    const imageInput = document.getElementById('image-input');
    const previewCanvas = document.getElementById('upload-preview');
    const clearBtn = document.getElementById('clear-upload');
    const useBtn = document.getElementById('use-upload-shape');

    uploadArea.addEventListener('click', () => {
        imageInput.click();
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.6)';
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleImageUpload(files[0]);
        }
    });

    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageUpload(e.target.files[0]);
        }
    });

    function handleImageUpload(file) {
        if (!file.type.startsWith('image/')) {
            alert('请上传图片文件！');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                processUploadedImage(img, previewCanvas);
                uploadArea.classList.add('has-image');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    clearBtn.addEventListener('click', () => {
        const ctx = previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        uploadArea.classList.remove('has-image');
        imageInput.value = '';
    });

    useBtn.addEventListener('click', () => {
        const points = extractPointsFromCanvas(previewCanvas);
        if (points.length > 0) {
            customShapePoints = points;
            customShapeType = 'upload';
            updateParticlesWithCustomShape();
            document.getElementById('custom-shape-modal').classList.add('hidden');
        } else {
            alert('请先上传图片！');
        }
    });
}

function processUploadedImage(img, canvas) {
    const ctx = canvas.getContext('2d');
    const size = 400;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Calculate scaling to fit image in canvas while maintaining aspect ratio
    const scale = Math.min(size / img.width, size / img.height);
    const x = (size - img.width * scale) / 2;
    const y = (size - img.height * scale) / 2;

    // Draw image
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

    // Get image data for edge detection
    const imageData = ctx.getImageData(0, 0, size, size);
    const edges = detectEdges(imageData);

    // Clear and draw edges
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#ffffff';
    for (const point of edges) {
        ctx.fillRect(point.x, point.y, 1, 1);
    }
}

function detectEdges(imageData) {
    const { width, height, data } = imageData;
    const edges = [];
    const threshold = 30;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;

            // Convert to grayscale
            const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

            // Check neighbors for edge detection
            const leftIdx = (y * width + (x - 1)) * 4;
            const rightIdx = (y * width + (x + 1)) * 4;
            const topIdx = ((y - 1) * width + x) * 4;
            const bottomIdx = ((y + 1) * width + x) * 4;

            const leftGray = (data[leftIdx] + data[leftIdx + 1] + data[leftIdx + 2]) / 3;
            const rightGray = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;
            const topGray = (data[topIdx] + data[topIdx + 1] + data[topIdx + 2]) / 3;
            const bottomGray = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;

            const gradient = Math.abs(leftGray - rightGray) + Math.abs(topGray - bottomGray);

            if (gradient > threshold) {
                edges.push({ x, y });
            }
        }
    }

    return edges;
}

// ==================== Point Extraction ====================

function extractPointsFromCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;
    const points = [];

    // Sample points from the canvas
    const sampleRate = 2; // Sample every 2 pixels

    for (let y = 0; y < height; y += sampleRate) {
        for (let x = 0; x < width; x += sampleRate) {
            const idx = (y * width + x) * 4;
            const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

            if (brightness > 100) {
                // Normalize coordinates to -1 to 1 range
                const nx = (x / width) * 2 - 1;
                const ny = -(y / height) * 2 + 1; // Flip Y axis
                points.push({ x: nx, y: ny });
            }
        }
    }

    return points;
}

// ==================== Update Particles with Custom Shape ====================

function updateParticlesWithCustomShape() {
    if (!customShapePoints || customShapePoints.length === 0) return;

    // Update core particles to follow custom shape
    const positions = coreSystem.geometry.attributes.position.array;
    const colors = coreSystem.geometry.attributes.color.array;

    const color1 = new THREE.Color(CONFIG.colors.core);
    const color2 = new THREE.Color(CONFIG.colors.core).multiplyScalar(0.7);

    // Clear existing data
    coreData = [];

    for (let i = 0; i < CONFIG.coreCount; i++) {
        // Pick a random point from the custom shape
        const pointIndex = Math.floor(Math.random() * customShapePoints.length);
        const point = customShapePoints[pointIndex];

        // Add some randomness around the point for volume
        const spread = 0.05;
        const x = point.x * 8 + (Math.random() - 0.5) * spread;
        const y = point.y * 8 + (Math.random() - 0.5) * spread;
        const z = (Math.random() - 0.5) * spread;

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // Update color
        const r = Math.sqrt(x * x + y * y + z * z) / 8;
        const mixedColor = color1.clone().lerp(color2, Math.min(r, 1));
        colors[i * 3] = mixedColor.r;
        colors[i * 3 + 1] = mixedColor.g;
        colors[i * 3 + 2] = mixedColor.b;

        coreData.push({
            originalX: x,
            originalY: y,
            originalZ: z,
            vx: (Math.random() - 0.5) * 0.1,
            vy: (Math.random() - 0.5) * 0.1,
            vz: (Math.random() - 0.5) * 0.1
        });
    }

    coreSystem.geometry.attributes.position.needsUpdate = true;
    coreSystem.geometry.attributes.color.needsUpdate = true;

    // Update status
    const status = document.getElementById('status');
    status.innerText = `✨ 已应用自定义${customShapeType === 'draw' ? '手绘' : '图片'}形状`;
    status.style.color = '#00ff88';
}

// ==================== Color Settings ====================

function initColorSettings() {
    const coreColorInput = document.getElementById('core-color');
    const ringColor1Input = document.getElementById('ring-color-1');
    const ringColor2Input = document.getElementById('ring-color-2');
    const ringColor3Input = document.getElementById('ring-color-3');
    const applyBtn = document.getElementById('apply-colors');

    // Set initial values
    coreColorInput.value = '#' + CONFIG.colors.core.toString(16).padStart(6, '0');
    ringColor1Input.value = '#' + CONFIG.colors.ring1.toString(16).padStart(6, '0');
    ringColor2Input.value = '#' + CONFIG.colors.ring2.toString(16).padStart(6, '0');
    ringColor3Input.value = '#' + CONFIG.colors.ring3.toString(16).padStart(6, '0');

    applyBtn.addEventListener('click', () => {
        CONFIG.colors.core = parseInt(coreColorInput.value.replace('#', ''), 16);
        CONFIG.colors.ring1 = parseInt(ringColor1Input.value.replace('#', ''), 16);
        CONFIG.colors.ring2 = parseInt(ringColor2Input.value.replace('#', ''), 16);
        CONFIG.colors.ring3 = parseInt(ringColor3Input.value.replace('#', ''), 16);

        // Recreate particles with new colors
        if (customShapePoints && customShapePoints.length > 0) {
            updateParticlesWithCustomShape();
        } else {
            createParticles();
        }

        const status = document.getElementById('status');
        status.innerText = '✨ 颜色已更新';
        status.style.color = '#00ff88';
    });
}
