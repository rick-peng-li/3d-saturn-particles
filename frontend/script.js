// Global Variables
let scene, camera, renderer, composer;
let coreSystem, ringSystem;
let customShapeSystem = null;
let clock = new THREE.Clock();
let ringData = [];
let coreData = [];

// State
const state = {
    targetZoom: 0.35,
    currentZoom: 0.35,
    handDetected: false,
    chaosMode: false,
    firstResultReceived: false,
    firstFrameRendered: false,
    useCustomShape: false,
    customShapePoints: []
};

// Custom Colors
const customColors = {
    primary: '#eebb44',
    secondary: '#cc8822',
    glow: '#ffffff'
};

// Configuration
const CONFIG = {
    coreCount: 30000,
    ringCount: 80000,
    ringInner: 12,
    ringOuter: 28,
    chaosThreshold: 0.85,
    maxZoom: 20,
    minZoom: 80,
    baseBrightness: 0.45,
    maxBrightness: 1.5,
    customShapeCount: 20000
};

// Initialize
window.onload = () => {
    initThree();
    createParticles();
    initHandTracking();
    initCustomShapePanel();
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
    scene.fog = new THREE.FogExp2(0x050505, 0.008);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = CONFIG.minZoom;
    camera.position.y = 6;
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const renderScene = new THREE.RenderPass(scene, camera);
    
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
    const coreGeo = new THREE.BufferGeometry();
    const corePos = [];
    const coreColors = [];
    
    const color1 = new THREE.Color(0xeebb44);
    const color2 = new THREE.Color(0xcc8822);

    for (let i = 0; i < CONFIG.coreCount; i++) {
        const r = 8 * Math.cbrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        corePos.push(x, y, z);
        
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

    const ringGeo = new THREE.BufferGeometry();
    const ringPos = [];
    const ringColors = [];

    const ringColor1 = new THREE.Color(0xf0e68c);
    const ringColor2 = new THREE.Color(0xffffff);
    const ringColor3 = new THREE.Color(0xa0522d);

    for (let i = 0; i < CONFIG.ringCount; i++) {
        const r = CONFIG.ringInner + Math.random() * (CONFIG.ringOuter - CONFIG.ringInner);
        const theta = Math.random() * Math.PI * 2;
        
        const y = (Math.random() - 0.5) * 0.5; 

        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);

        ringPos.push(x, y, z);

        const speed = 5.0 / Math.pow(r, 1.5);
        
        ringData.push({
            r: r,
            theta: theta,
            y: y,
            speed: speed,
            originalY: y
        });

        let c;
        if (i % 3 === 0) c = ringColor1;
        else if (i % 3 === 1) c = ringColor2;
        else c = ringColor3;
        
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
    ringSystem.rotation.x = Math.PI * 0.1;
    ringSystem.rotation.z = Math.PI * 0.05;
    
    scene.add(ringSystem);
}

function initHandTracking() {
    const videoElement = document.getElementById('input_video');
    const statusElement = document.getElementById('status');
    let cameraStartFailed = false;

    const hands = new Hands({locateFile: (file) => {
        return `https://unpkg.com/@mediapipe/hands/${file}`;
    }});

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onHandResults);

    statusElement.innerText = "正在加载 AI 模型...";
    
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
        
        const minVal = 0.2;
        const maxVal = 0.55;
        let normalized = (avgDist - minVal) / (maxVal - minVal);
        normalized = Math.max(0, Math.min(1, normalized));
        
        state.targetZoom = normalized;

    } else {
        state.handDetected = false;
        statusElement.innerText = "等待手势指令...";
        statusElement.style.color = "#ffaa00";
        state.targetZoom = state.targetZoom * 0.95 + 0.35 * 0.05;
    }
}

// ==================== 自定义粒子形状功能 ====================

function initCustomShapePanel() {
    const panel = document.getElementById('custom-shape-panel');
    const customBtn = document.getElementById('custom-shape-btn');
    const closeBtn = document.getElementById('close-panel-btn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    customBtn.addEventListener('click', () => {
        panel.classList.remove('hidden');
    });
    
    closeBtn.addEventListener('click', () => {
        panel.classList.add('hidden');
    });
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById(`${tabId}-tab`).classList.remove('hidden');
        });
    });
    
    initDrawCanvas();
    initImageUpload();
    initColorPickers();
    initResetButton();
}

// 画板功能
function initDrawCanvas() {
    const canvas = document.getElementById('draw-canvas');
    const ctx = canvas.getContext('2d');
    const brushSizeInput = document.getElementById('brush-size');
    const clearBtn = document.getElementById('clear-canvas-btn');
    const applyBtn = document.getElementById('apply-draw-btn');
    
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        if (e.touches) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    
    function startDrawing(e) {
        isDrawing = true;
        const coords = getCanvasCoords(e);
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        
        const coords = getCanvasCoords(e);
        ctx.lineWidth = brushSizeInput.value;
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function stopDrawing() {
        isDrawing = false;
    }
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);
    
    clearBtn.addEventListener('click', () => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
    
    applyBtn.addEventListener('click', () => {
        const points = extractPointsFromCanvas(canvas);
        if (points.length > 0) {
            createCustomShapeParticles(points);
            document.getElementById('custom-shape-panel').classList.add('hidden');
        }
    });
}

// 从画布提取点
function extractPointsFromCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const points = [];
    
    for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
            const i = (y * canvas.width + x) * 4;
            if (data[i] > 100 || data[i + 1] > 100 || data[i + 2] > 100) {
                points.push({
                    x: (x / canvas.width - 0.5) * 20,
                    y: -(y / canvas.height - 0.5) * 20
                });
            }
        }
    }
    
    return points;
}

// 图片上传功能
function initImageUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('image-upload');
    const previewCanvas = document.getElementById('preview-canvas');
    const applyBtn = document.getElementById('apply-upload-btn');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            processImage(file);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            processImage(file);
        }
    });
    
    function processImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const ctx = previewCanvas.getContext('2d');
                
                const scale = Math.min(
                    previewCanvas.width / img.width,
                    previewCanvas.height / img.height
                );
                const width = img.width * scale;
                const height = img.height * scale;
                const x = (previewCanvas.width - width) / 2;
                const y = (previewCanvas.height - height) / 2;
                
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
                ctx.drawImage(img, x, y, width, height);
                
                previewCanvas.classList.remove('hidden');
                applyBtn.classList.remove('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    applyBtn.addEventListener('click', () => {
        const points = extractContourFromImage(previewCanvas);
        if (points.length > 0) {
            createCustomShapeParticles(points);
            document.getElementById('custom-shape-panel').classList.add('hidden');
        }
    });
}

// 从图片提取轮廓
function extractContourFromImage(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const points = [];
    
    const binaryData = new Array(canvas.height);
    for (let y = 0; y < canvas.height; y++) {
        binaryData[y] = new Array(canvas.width);
        for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            binaryData[y][x] = brightness > 50 ? 1 : 0;
        }
    }
    
    for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
            if (binaryData[y][x] === 1) {
                const neighbors = 
                    binaryData[y-1][x] + binaryData[y+1][x] +
                    binaryData[y][x-1] + binaryData[y][x+1];
                
                if (neighbors < 4) {
                    points.push({
                        x: (x / canvas.width - 0.5) * 20,
                        y: -(y / canvas.height - 0.5) * 20
                    });
                }
            }
        }
    }
    
    if (points.length < 100) {
        for (let y = 0; y < canvas.height; y += 3) {
            for (let x = 0; x < canvas.width; x += 3) {
                const i = (y * canvas.width + x) * 4;
                const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
                if (brightness > 50) {
                    points.push({
                        x: (x / canvas.width - 0.5) * 20,
                        y: -(y / canvas.height - 0.5) * 20
                    });
                }
            }
        }
    }
    
    return points;
}

// 创建自定义形状粒子
function createCustomShapeParticles(shapePoints) {
    if (customShapeSystem) {
        scene.remove(customShapeSystem);
        customShapeSystem.geometry.dispose();
        customShapeSystem.material.dispose();
    }
    
    const positions = [];
    const colors = [];
    
    const primaryColor = new THREE.Color(customColors.primary);
    const secondaryColor = new THREE.Color(customColors.secondary);
    const glowColor = new THREE.Color(customColors.glow);
    
    const particleCount = Math.min(CONFIG.customShapeCount, shapePoints.length * 50);
    
    for (let i = 0; i < particleCount; i++) {
        const basePoint = shapePoints[Math.floor(Math.random() * shapePoints.length)];
        
        const jitter = 0.3;
        const x = basePoint.x + (Math.random() - 0.5) * jitter;
        const y = basePoint.y + (Math.random() - 0.5) * jitter;
        const z = (Math.random() - 0.5) * 2;
        
        positions.push(x, y, z);
        
        const colorMix = Math.random();
        let particleColor;
        if (colorMix < 0.5) {
            particleColor = primaryColor.clone().lerp(secondaryColor, Math.random());
        } else if (colorMix < 0.8) {
            particleColor = secondaryColor.clone();
        } else {
            particleColor = glowColor.clone();
        }
        
        particleColor.multiplyScalar(0.8 + Math.random() * 0.4);
        colors.push(particleColor.r, particleColor.g, particleColor.b);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.9
    });
    
    customShapeSystem = new THREE.Points(geometry, material);
    scene.add(customShapeSystem);
    
    coreSystem.visible = false;
    state.useCustomShape = true;
}

// 颜色选择器
function initColorPickers() {
    const primaryInput = document.getElementById('primary-color');
    const secondaryInput = document.getElementById('secondary-color');
    const glowInput = document.getElementById('glow-color');
    
    const primaryPreview = document.getElementById('primary-preview');
    const secondaryPreview = document.getElementById('secondary-preview');
    const glowPreview = document.getElementById('glow-preview');
    
    function updatePreviews() {
        primaryPreview.style.backgroundColor = customColors.primary;
        secondaryPreview.style.backgroundColor = customColors.secondary;
        glowPreview.style.backgroundColor = customColors.glow;
    }
    
    updatePreviews();
    
    primaryInput.addEventListener('input', (e) => {
        customColors.primary = e.target.value;
        updatePreviews();
        updateExistingParticleColors();
    });
    
    secondaryInput.addEventListener('input', (e) => {
        customColors.secondary = e.target.value;
        updatePreviews();
        updateExistingParticleColors();
    });
    
    glowInput.addEventListener('input', (e) => {
        customColors.glow = e.target.value;
        updatePreviews();
        updateExistingParticleColors();
    });
}

// 更新现有粒子颜色
function updateExistingParticleColors() {
    if (!customShapeSystem) return;
    
    const colors = customShapeSystem.geometry.attributes.color.array;
    const positions = customShapeSystem.geometry.attributes.position.array;
    const count = colors.length / 3;
    
    const primaryColor = new THREE.Color(customColors.primary);
    const secondaryColor = new THREE.Color(customColors.secondary);
    const glowColor = new THREE.Color(customColors.glow);
    
    for (let i = 0; i < count; i++) {
        const colorMix = Math.random();
        let particleColor;
        if (colorMix < 0.5) {
            particleColor = primaryColor.clone().lerp(secondaryColor, Math.random());
        } else if (colorMix < 0.8) {
            particleColor = secondaryColor.clone();
        } else {
            particleColor = glowColor.clone();
        }
        
        particleColor.multiplyScalar(0.8 + Math.random() * 0.4);
        colors[i * 3] = particleColor.r;
        colors[i * 3 + 1] = particleColor.g;
        colors[i * 3 + 2] = particleColor.b;
    }
    
    customShapeSystem.geometry.attributes.color.needsUpdate = true;
}

// 重置按钮
function initResetButton() {
    const resetBtn = document.getElementById('reset-shape-btn');
    
    resetBtn.addEventListener('click', () => {
        if (customShapeSystem) {
            scene.remove(customShapeSystem);
            customShapeSystem.geometry.dispose();
            customShapeSystem.material.dispose();
            customShapeSystem = null;
        }
        
        coreSystem.visible = true;
        state.useCustomShape = false;
        
        const drawCanvas = document.getElementById('draw-canvas');
        const ctx = drawCanvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
        
        const previewCanvas = document.getElementById('preview-canvas');
        previewCanvas.classList.add('hidden');
        document.getElementById('apply-upload-btn').classList.add('hidden');
        
        customColors.primary = '#eebb44';
        customColors.secondary = '#cc8822';
        customColors.glow = '#ffffff';
        
        document.getElementById('primary-color').value = customColors.primary;
        document.getElementById('secondary-color').value = customColors.secondary;
        document.getElementById('glow-color').value = customColors.glow;
        
        document.getElementById('primary-preview').style.backgroundColor = customColors.primary;
        document.getElementById('secondary-preview').style.backgroundColor = customColors.secondary;
        document.getElementById('glow-preview').style.backgroundColor = customColors.glow;
    });
}

// ==================== 动画循环 ====================

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    state.currentZoom += (state.targetZoom - state.currentZoom) * 0.1;

    const targetZ = CONFIG.minZoom - (state.currentZoom * (CONFIG.minZoom - CONFIG.maxZoom));
    camera.position.z = targetZ;
    camera.lookAt(0, 0, 0);

    const zoomFactor = Math.pow(state.currentZoom, 2.5);
    const brightness = CONFIG.baseBrightness + zoomFactor * (CONFIG.maxBrightness - CONFIG.baseBrightness);
    
    if (state.useCustomShape && customShapeSystem) {
        customShapeSystem.material.opacity = Math.min(1, brightness);
        customShapeSystem.material.size = 0.12 * (1 + state.currentZoom * 2);
        customShapeSystem.rotation.y += delta * 0.1;
        
        if (state.currentZoom > CONFIG.chaosThreshold) {
            updateCustomShapeChaos(delta);
        }
    } else {
        coreSystem.material.opacity = Math.min(1, brightness);
        coreSystem.material.size = 0.15 * (1 + state.currentZoom * 2);
    }

    ringSystem.material.opacity = Math.min(0.8, brightness * 0.8);
    ringSystem.material.size = 0.1 * (1 + state.currentZoom * 1.5);

    state.chaosMode = state.currentZoom > CONFIG.chaosThreshold;

    updateRings(delta);
    
    if (!state.useCustomShape) {
        updateCore(delta);
    }

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

function updateCustomShapeChaos(delta) {
    if (!customShapeSystem) return;
    
    const positions = customShapeSystem.geometry.attributes.position.array;
    const chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
    const jitter = chaosIntensity * 2.0;
    const count = positions.length / 3;
    
    for (let i = 0; i < count; i++) {
        positions[i * 3] += (Math.random() - 0.5) * jitter;
        positions[i * 3 + 1] += (Math.random() - 0.5) * jitter;
        positions[i * 3 + 2] += (Math.random() - 0.5) * jitter;
    }
    
    customShapeSystem.geometry.attributes.position.needsUpdate = true;
}

function updateRings(delta) {
    const positions = ringSystem.geometry.attributes.position.array;
    
    let chaosIntensity = 0;
    if (state.chaosMode) {
        chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
    }

    const time = clock.getElapsedTime();

    for (let i = 0; i < CONFIG.ringCount; i++) {
        const data = ringData[i];
        
        data.theta += data.speed * delta * 0.5;

        let x, y, z;

        if (state.chaosMode) {
            const explodeFactor = chaosIntensity * 20; 
            const noiseAmp = chaosIntensity * 2.0; 
            
            const bx = data.r * Math.cos(data.theta);
            const bz = data.r * Math.sin(data.theta);
            
            x = bx + Math.cos(data.theta) * explodeFactor;
            z = bz + Math.sin(data.theta) * explodeFactor;
            y = data.y + (Math.random() - 0.5) * explodeFactor;

            x += (Math.random() - 0.5) * noiseAmp;
            y += (Math.random() - 0.5) * noiseAmp;
            z += (Math.random() - 0.5) * noiseAmp;
            
        } else {
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
    coreSystem.rotation.y += delta * 0.05;

    if (state.chaosMode) {
        const positions = coreSystem.geometry.attributes.position.array;
        const chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
        const jitter = chaosIntensity * 3.0;
        const explode = chaosIntensity * 5.0;

        for(let i=0; i < CONFIG.coreCount; i++) {
            const data = coreData[i];
            
            const px = data.originalX * (1 + explode);
            const py = data.originalY * (1 + explode);
            const pz = data.originalZ * (1 + explode);
            
            positions[i*3] = px + (Math.random() - 0.5) * jitter;
            positions[i*3+1] = py + (Math.random() - 0.5) * jitter;
            positions[i*3+2] = pz + (Math.random() - 0.5) * jitter;
        }
        coreSystem.geometry.attributes.position.needsUpdate = true;
    } else {
        const positions = coreSystem.geometry.attributes.position.array;
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
