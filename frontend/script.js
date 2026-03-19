// Global Variables
let scene, camera, renderer, composer;
let coreSystem, ringSystem;
let clock = new THREE.Clock();
let ringData = []; // Store initial data for physics calculations
let coreData = [];

// Drawing State
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let customShapePoints = [];
let uploadedImagePoints = [];

// State
const state = {
    targetZoom: 0.35,
    currentZoom: 0.35,
    handDetected: false,
    chaosMode: false,
    firstResultReceived: false,
    firstFrameRendered: false,
    customShapeMode: 'default',
    particleColor: '#00ffff'
};

// Configuration
const CONFIG = {
    coreCount: 30000, // Increased for density
    ringCount: 80000, // Increased for density
    customShapeCount: 8000, // Fewer particles for clear outline
    ringInner: 12,
    ringOuter: 28,
    chaosThreshold: 0.85,
    maxZoom: 20, // Closer for more impact
    minZoom: 80,
    baseBrightness: 0.45,
    maxBrightness: 1.5 // Bright when close
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

// Initialize Custom Shape UI
function initCustomShapeUI() {
    const panel = document.getElementById('custom-shape-panel');
    const openBtn = document.getElementById('custom-shape-btn');
    const closeBtn = document.getElementById('close-panel-btn');
    const drawModeBtn = document.getElementById('draw-mode-btn');
    const uploadModeBtn = document.getElementById('upload-mode-btn');
    const drawSection = document.getElementById('draw-section');
    const uploadSection = document.getElementById('upload-section');
    const drawCanvas = document.getElementById('draw-canvas');
    const imageCanvas = document.getElementById('image-canvas');
    const imageUpload = document.getElementById('image-upload');
    const uploadTriggerBtn = document.getElementById('upload-trigger-btn');
    const fileNameSpan = document.getElementById('file-name');
    const clearCanvasBtn = document.getElementById('clear-canvas');
    const applyDrawBtn = document.getElementById('apply-draw-shape');
    const applyImageBtn = document.getElementById('apply-image-shape');
    const resetBtn = document.getElementById('reset-shape');
    const colorPicker = document.getElementById('particle-color');

    // Panel Toggle
    openBtn.addEventListener('click', () => {
        panel.classList.remove('panel-hidden');
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.add('panel-hidden');
    });

    // Shape Mode Buttons
    function setActiveButton(btn) {
        drawModeBtn.classList.remove('active');
        uploadModeBtn.classList.remove('active');
        btn.classList.add('active');
    }

    drawModeBtn.addEventListener('click', () => {
        state.customShapeMode = 'draw';
        setActiveButton(drawModeBtn);
        drawSection.classList.remove('section-hidden');
        uploadSection.classList.add('section-hidden');
        initDrawCanvas();
    });

    uploadModeBtn.addEventListener('click', () => {
        state.customShapeMode = 'upload';
        setActiveButton(uploadModeBtn);
        drawSection.classList.add('section-hidden');
        uploadSection.classList.remove('section-hidden');
    });

    // Color Picker
    colorPicker.addEventListener('input', (e) => {
        state.particleColor = e.target.value;
        updateParticleColors();
    });

    // Upload Trigger
    uploadTriggerBtn.addEventListener('click', () => {
        imageUpload.click();
    });

    // Drawing Canvas
    function initDrawCanvas() {
        const ctx = drawCanvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    drawCanvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const rect = drawCanvas.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
        customShapePoints = [];
        customShapePoints.push({ x: lastX, y: lastY });
    });

    drawCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const rect = drawCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const ctx = drawCanvas.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        customShapePoints.push({ x, y });
        lastX = x;
        lastY = y;
    });

    drawCanvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });

    drawCanvas.addEventListener('mouseleave', () => {
        isDrawing = false;
    });

    // Clear Canvas
    clearCanvasBtn.addEventListener('click', () => {
        const ctx = drawCanvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
        customShapePoints = [];
    });

    // Apply Draw Shape
    applyDrawBtn.addEventListener('click', () => {
        if (customShapePoints.length < 10) {
            alert('请绘制一个完整的形状！');
            return;
        }
        
        // Optimize drawn points - reduce density for cleaner outline
        const optimizedPoints = [];
        const step = Math.max(1, Math.floor(customShapePoints.length / 1000));
        for (let i = 0; i < customShapePoints.length; i += step) {
            optimizedPoints.push(customShapePoints[i]);
        }
        
        createCustomParticles(optimizedPoints);
    });

    // Image Upload
    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        fileNameSpan.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const ctx = imageCanvas.getContext('2d');
                const size = Math.min(img.width, img.height);
                const offsetX = (img.width - size) / 2;
                const offsetY = (img.height - size) / 2;
                
                ctx.fillStyle = '#111';
                ctx.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
                ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, imageCanvas.width, imageCanvas.height);
                
                // Process image for contour detection
                processImageContour(imageCanvas);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Apply Image Shape
    applyImageBtn.addEventListener('click', () => {
        if (uploadedImagePoints.length < 10) {
            alert('请先上传一张图片！');
            return;
        }
        createCustomParticles(uploadedImagePoints);
    });

    // Reset Shape
    resetBtn.addEventListener('click', () => {
        state.customShapeMode = 'default';
        drawModeBtn.classList.remove('active');
        uploadModeBtn.classList.remove('active');
        drawSection.classList.add('section-hidden');
        uploadSection.classList.add('section-hidden');
        createParticles();
    });
}

// Process Image Contour using edge detection
function processImageContour(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // Convert to grayscale and apply edge detection (Sobel operator)
    const grayscale = [];
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        grayscale.push(avg);
    }
    
    // Simple edge detection - use contrast threshold
    const edges = [];
    const threshold = 30; // Lower threshold for more sensitive edge detection
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const current = grayscale[idx];
            const neighbors = [
                grayscale[idx - 1], grayscale[idx + 1],
                grayscale[idx - width], grayscale[idx + width]
            ];
            
            // Check if current pixel is significantly different from neighbors
            let isEdge = false;
            for (const neighbor of neighbors) {
                if (Math.abs(current - neighbor) > threshold) {
                    isEdge = true;
                    break;
                }
            }
            
            if (isEdge) {
                edges.push({ x, y });
            }
        }
    }
    
    // Remove duplicate points and thin out edges
    const uniqueEdges = [];
    const gridSize = 2; // Group points in 2x2 grids
    const grid = {};
    
    edges.forEach(point => {
        const gridX = Math.floor(point.x / gridSize);
        const gridY = Math.floor(point.y / gridSize);
        const key = `${gridX},${gridY}`;
        
        if (!grid[key]) {
            grid[key] = true;
            uniqueEdges.push(point);
        }
    });
    
    uploadedImagePoints = uniqueEdges;
    
    // Draw edges on canvas for visualization
    ctx.fillStyle = '#ff0000';
    uploadedImagePoints.forEach(point => {
        ctx.fillRect(point.x, point.y, 2, 2); // Larger dots for visibility
    });
}

// Create Custom Particles from Shape Points (Outline only)
function createCustomParticles(shapePoints) {
    if (coreSystem) scene.remove(coreSystem);
    if (ringSystem) scene.remove(ringSystem);
    
    coreData = [];
    ringData = [];
    
    // Normalize points to [-1, 1] range
    const normalizedPoints = shapePoints.map(point => ({
        x: (point.x / 300 - 0.5) * 2,
        y: -(point.y / 300 - 0.5) * 2
    }));
    
    // Create Outline Particles only
    const outlineGeo = new THREE.BufferGeometry();
    const outlinePos = [];
    const outlineColors = [];
    
    const particleColor = new THREE.Color(state.particleColor);
    
    // Calculate total length of the shape outline
    let totalLength = 0;
    const segmentLengths = [];
    
    for (let i = 0; i < normalizedPoints.length; i++) {
        const point = normalizedPoints[i];
        const nextPoint = normalizedPoints[(i + 1) % normalizedPoints.length];
        const length = Math.sqrt(
            Math.pow(nextPoint.x - point.x, 2) + 
            Math.pow(nextPoint.y - point.y, 2)
        );
        segmentLengths.push(length);
        totalLength += length;
    }
    
    // Use fewer particles for clearer outline
    const totalParticles = CONFIG.customShapeCount;
    const scale = 25; // Scale up the shape
    const particleSize = 0.2; // Larger particles for better visibility
    
    // Distribute particles evenly along the outline
    for (let i = 0; i < totalParticles; i++) {
        // Find which segment this particle belongs to
        let distanceAlongOutline = (i / totalParticles) * totalLength;
        let segmentIndex = 0;
        let accumulatedLength = 0;
        
        for (let j = 0; j < segmentLengths.length; j++) {
            if (accumulatedLength + segmentLengths[j] >= distanceAlongOutline) {
                segmentIndex = j;
                break;
            }
            accumulatedLength += segmentLengths[j];
        }
        
        const point = normalizedPoints[segmentIndex];
        const nextPoint = normalizedPoints[(segmentIndex + 1) % normalizedPoints.length];
        const segmentLength = segmentLengths[segmentIndex];
        const distanceIntoSegment = distanceAlongOutline - accumulatedLength;
        const t = segmentLength > 0 ? distanceIntoSegment / segmentLength : 0;
        
        const x = point.x + (nextPoint.x - point.x) * t;
        const y = point.y + (nextPoint.y - point.y) * t;
        
        // Minimal depth variation - keep outline flat and clear
        const z = (Math.random() - 0.5) * 0.5;
        
        // Minimal jitter - keep outline sharp
        const jitter = (Math.random() - 0.5) * 0.01;
        
        outlinePos.push(
            (x + jitter) * scale,
            (y + jitter) * scale,
            z * scale
        );
        
        // Brighter, more consistent color
        const colorVariation = 0.95 + Math.random() * 0.1;
        outlineColors.push(
            particleColor.r * colorVariation,
            particleColor.g * colorVariation,
            particleColor.b * colorVariation
        );
        
        coreData.push({
            originalX: (x + jitter) * scale,
            originalY: (y + jitter) * scale,
            originalZ: z * scale,
            vx: (Math.random() - 0.5) * 0.1,
            vy: (Math.random() - 0.5) * 0.1,
            vz: (Math.random() - 0.5) * 0.1
        });
    }
    
    outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(outlinePos, 3));
    outlineGeo.setAttribute('color', new THREE.Float32BufferAttribute(outlineColors, 3));
    
    const outlineMat = new THREE.PointsMaterial({
        size: particleSize,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 1.0
    });
    
    coreSystem = new THREE.Points(outlineGeo, outlineMat);
    scene.add(coreSystem);
    
    // No ring system for custom shapes - keep it simple
    ringSystem = null;
}

// Get shape bounds
function getShapeBounds(points) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    points.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    });
    
    return { minX, maxX, minY, maxY };
}

// Update Particle Colors
function updateParticleColors() {
    if (!coreSystem) return;
    
    const particleColor = new THREE.Color(state.particleColor);
    
    // Update core colors (outline)
    const coreColors = coreSystem.geometry.attributes.color.array;
    const totalParticles = coreColors.length / 3;
    
    for (let i = 0; i < totalParticles; i++) {
        // Add slight color variation
        const colorVariation = 0.8 + Math.random() * 0.4;
        coreColors[i * 3] = particleColor.r * colorVariation;
        coreColors[i * 3 + 1] = particleColor.g * colorVariation;
        coreColors[i * 3 + 2] = particleColor.b * colorVariation;
    }
    coreSystem.geometry.attributes.color.needsUpdate = true;
}

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
    const zoomFactor = Math.pow(state.currentZoom, 2.5); // Steep curve
    const brightness = CONFIG.baseBrightness + zoomFactor * (CONFIG.maxBrightness - CONFIG.baseBrightness);
    
    // Core Brightness (outline)
    if (coreSystem) {
        coreSystem.material.opacity = Math.min(1, brightness);
        // Larger base size for custom shapes to ensure visibility
        const baseSize = state.customShapeMode !== 'default' ? 0.2 : 0.12;
        coreSystem.material.size = baseSize * (1 + state.currentZoom * 2); // Particles get significantly bigger
    }

    // Ring Brightness - only for default Saturn shape
    if (ringSystem) {
        ringSystem.material.opacity = Math.min(0.8, brightness * 0.8);
        ringSystem.material.size = 0.1 * (1 + state.currentZoom * 1.5);
    }

    // 4. Chaos Mode Trigger
    state.chaosMode = state.currentZoom > CONFIG.chaosThreshold;

    // 5. Update Particles
    if (ringSystem) {
        updateRings(delta);
    }
    updateCore(delta);

    // Rotate custom shapes slowly
    if (state.customShapeMode !== 'default' && coreSystem) {
        coreSystem.rotation.y += delta * 0.2;
    }

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
    if (!coreSystem) return;
    
    // Rotate the core slowly (only for default Saturn shape)
    if (state.customShapeMode === 'default') {
        coreSystem.rotation.y += delta * 0.05;
    }

    if (state.chaosMode) {
        const positions = coreSystem.geometry.attributes.position.array;
        const chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
        const jitter = chaosIntensity * 3.0; // Strong jitter for core
        const explode = chaosIntensity * 5.0; // Core explosion

        const totalParticles = coreData.length;
        for(let i=0; i < totalParticles; i++) {
            const data = coreData[i];
            if (!data) continue;
            
            // Core explosion: push out from center
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
        const positions = coreSystem.geometry.attributes.position.array;
        if (coreData.length > 0 && Math.abs(positions[0] - coreData[0].originalX) > 0.001) {
            const totalParticles = coreData.length;
             for(let i=0; i < totalParticles; i++) {
                const data = coreData[i];
                if (!data) continue;
                positions[i*3] = data.originalX;
                positions[i*3+1] = data.originalY;
                positions[i*3+2] = data.originalZ;
            }
            coreSystem.geometry.attributes.position.needsUpdate = true;
        }
    }
}
