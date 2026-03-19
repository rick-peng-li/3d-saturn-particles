// Global Variables
let scene, camera, renderer, composer;
let coreSystem, ringSystem, imageParticles;
let clock = new THREE.Clock();
let ringData = []; // Store initial data for physics calculations
let coreData = [];
let uploadedImages = []; // 存储上传的图片纹理
let imageData = []; // 存储图片粒子数据
let selectedImageIndex = -1; // 当前选中的图片索引

// 图片放大状态
const imageZoomState = {
    isZoomed: false,
    currentImage: null,
    scale: 1,
    targetScale: 1
};

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
    maxImages: 10, // 最大上传图片数量
    imageParticleSize: 0.8, // 图片粒子大小
    pinchThreshold: 0.1 // 捏合手势阈值
};

// Initialize
window.onload = () => {
    initThree();
    createParticles();
    initHandTracking();
    initImageUpload();
    animate();
    
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });

    // 点击模态框关闭放大图片
    document.getElementById('image-modal').addEventListener('click', () => {
        closeImageModal();
    });
};

// 初始化图片上传功能
function initImageUpload() {
    const uploadBtn = document.getElementById('upload-btn');
    const imageUpload = document.getElementById('image-upload');

    uploadBtn.addEventListener('click', () => {
        imageUpload.click();
    });

    imageUpload.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            if (file && file.type.startsWith('image/')) {
                handleImageUpload(file);
            }
        });
        // 清除input值以便可以重复上传同一张图片
        imageUpload.value = '';
    });
}

// 处理图片上传
function handleImageUpload(file) {
    if (uploadedImages.length >= CONFIG.maxImages) {
        alert(`最多只能上传 ${CONFIG.maxImages} 张图片`);
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageUrl = e.target.result;
        createImageTexture(imageUrl, file.name);
    };
    reader.readAsDataURL(file);
}

// 创建图片纹理并添加到场景
function createImageTexture(imageUrl, imageName) {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        imageUrl,
        (texture) => {
            texture.needsUpdate = true;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;

            // 存储图片信息
            uploadedImages.push({
                texture: texture,
                url: imageUrl,
                name: imageName
            });

            // 创建图片粒子
            createImageParticle(texture, uploadedImages.length - 1);

            // 更新状态提示
            const statusElement = document.getElementById('status');
            statusElement.innerText = `已上传图片: ${uploadedImages.length}/${CONFIG.maxImages}`;
            statusElement.style.color = "#4cd137";
        },
        undefined,
        (error) => {
            console.error('图片加载失败:', error);
            const statusElement = document.getElementById('status');
            statusElement.innerText = '图片加载失败，请重试';
            statusElement.style.color = "#ff4444";
        }
    );
}

// 创建单个图片粒子
function createImageParticle(texture, imageIndex) {
    // 随机选择位置：土星本体或环上
    const isOnRing = Math.random() > 0.3; // 70%概率在环上，30%在土星本体
    let position;

    if (isOnRing) {
        // 在环上随机位置
        const r = CONFIG.ringInner + Math.random() * (CONFIG.ringOuter - CONFIG.ringInner);
        const theta = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * 0.5;
        position = new THREE.Vector3(
            r * Math.cos(theta),
            y,
            r * Math.sin(theta)
        );
    } else {
        // 在土星本体上随机位置
        const r = 8 * Math.cbrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        position = new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
        );
    }

    // 创建图片精灵
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthTest: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(CONFIG.imageParticleSize, CONFIG.imageParticleSize, 1);
    sprite.userData = {
        imageIndex: imageIndex,
        isOnRing: isOnRing,
        originalPosition: position.clone(),
        theta: isOnRing ? Math.atan2(position.z, position.x) : 0,
        r: isOnRing ? Math.sqrt(position.x * position.x + position.z * position.z) : 0,
        speed: isOnRing ? 5.0 / Math.pow(Math.sqrt(position.x * position.x + position.z * position.z), 1.5) * 0.3 : 0,
        bobOffset: Math.random() * Math.PI * 2 // 用于上下浮动效果
    };

    // 添加到场景
    if (!imageParticles) {
        imageParticles = new THREE.Group();
        scene.add(imageParticles);
    }
    imageParticles.add(sprite);

    // 存储图片粒子数据
    imageData.push({
        sprite: sprite,
        originalPosition: position.clone()
    });
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
        maxNumHands: 2, // 支持双手检测
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
        
        // 优先检测单手捏合手势
        const pinchDetected = detectPinchGesture(results.multiHandLandmarks[0], statusElement);
        
        // 如果没有捏合手势，检测张掌/握拳控制
        if (!pinchDetected) {
            handleOneHand(results.multiHandLandmarks[0], statusElement);
        }

    } else {
        state.handDetected = false;
        statusElement.innerText = "等待手势指令...";
        statusElement.style.color = "#ffaa00";
        // 没有手时，图片取消放大状态
        if (imageZoomState.isZoomed) {
            closeImageModal();
        }
        // Let's drift back to default (0.2) if no hand
        state.targetZoom = state.targetZoom * 0.95 + 0.35 * 0.05;
    }
}

// 检测单手捏合手势（拇指和食指捏合）
function detectPinchGesture(landmarks, statusElement) {
    // 获取拇指指尖和食指指尖的位置
    const thumbTip = landmarks[4];   // 拇指指尖
    const indexTip = landmarks[8];   // 食指指尖
    const middleTip = landmarks[12]; // 中指指尖
    const ringTip = landmarks[16];   // 无名指指尖
    const pinkyTip = landmarks[20];  // 小指指尖
    
    // 计算拇指与食指的距离
    const thumbIndexDistance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) + 
        Math.pow(thumbTip.y - indexTip.y, 2)
    );
    
    // 检测其他手指是否张开（相对于手腕）
    const wrist = landmarks[0];
    const middleOpen = Math.sqrt(
        Math.pow(middleTip.x - wrist.x, 2) + 
        Math.pow(middleTip.y - wrist.y, 2)
    ) > 0.3;
    
    const ringOpen = Math.sqrt(
        Math.pow(ringTip.x - wrist.x, 2) + 
        Math.pow(ringTip.y - wrist.y, 2)
    ) > 0.3;
    
    const pinkyOpen = Math.sqrt(
        Math.pow(pinkyTip.x - wrist.x, 2) + 
        Math.pow(pinkyTip.y - wrist.y, 2)
    ) > 0.3;
    
    // 捏合手势：拇指和食指距离很近，同时其他手指张开
    const isPinching = thumbIndexDistance < 0.08 && (middleOpen || ringOpen || pinkyOpen);
    
    if (isPinching) {
        statusElement.innerText = "🤏 捏合手势 - 放大图片";
        statusElement.style.color = "#00aaff";
        
        // 计算捏合强度：距离越近，强度越高
        const pinchIntensity = 1 - Math.min(1, thumbIndexDistance / 0.15);
        
        if (!imageZoomState.isZoomed && pinchIntensity > CONFIG.pinchThreshold) {
            // 激活图片放大状态 - 随机选择一张图片
            activateImageZoom();
        } else if (imageZoomState.isZoomed && pinchIntensity > CONFIG.pinchThreshold) {
            // 已经在放大状态时，根据捏合强度调整放大比例
            imageZoomState.targetScale = 1 + pinchIntensity * 2; // 最大放大3倍
            updateZoomedImageScale();
        }
        
        return true;
    } else {
        // 不是捏合手势时取消放大
        if (imageZoomState.isZoomed) {
            closeImageModal();
        }
        return false;
    }
}

// 处理单手手势 - 张掌/握拳控制缩放
function handleOneHand(landmarks, statusElement) {
    statusElement.innerText = "🖐️ 单手握拳/张掌 - 控制缩放";
    statusElement.style.color = "#00ff88";

    // Calculate "Openness"
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
    
    state.targetZoom = normalized; // 0 = small/far, 1 = big/close
}

// 激活图片放大状态
function activateImageZoom() {
    if (uploadedImages.length === 0) return;

    // 如果已经在放大状态，先关闭后再切换图片
    if (imageZoomState.isZoomed) {
        // 随机选择一张不同的图片
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * uploadedImages.length);
        } while (randomIndex === selectedImageIndex && uploadedImages.length > 1);
        
        selectedImageIndex = randomIndex;
        imageZoomState.currentImage = uploadedImages[randomIndex];
        
        const zoomedImage = document.getElementById('zoomed-image');
        zoomedImage.src = imageZoomState.currentImage.url;
        return;
    }

    imageZoomState.isZoomed = true;
    imageZoomState.scale = 0.1; // 从0.1开始，有放大过渡效果
    imageZoomState.targetScale = 1;

    // 随机选择一张图片
    const randomIndex = Math.floor(Math.random() * uploadedImages.length);
    selectedImageIndex = randomIndex;
    imageZoomState.currentImage = uploadedImages[randomIndex];

    // 显示模态框
    const modal = document.getElementById('image-modal');
    const zoomedImage = document.getElementById('zoomed-image');
    zoomedImage.src = imageZoomState.currentImage.url;
    zoomedImage.style.transform = `scale(${imageZoomState.scale})`;
    modal.classList.add('active');
}

// 更新放大图片的缩放
function updateZoomedImageScale() {
    if (!imageZoomState.isZoomed) return;

    // 平滑过渡缩放
    imageZoomState.scale += (imageZoomState.targetScale - imageZoomState.scale) * 0.1;

    const zoomedImage = document.getElementById('zoomed-image');
    zoomedImage.style.transform = `scale(${imageZoomState.scale})`;
}

// 关闭图片模态框（带过渡效果）
function closeImageModal() {
    if (!imageZoomState.isZoomed) return;
    
    // 设置缩小目标
    imageZoomState.targetScale = 0.1;
    
    // 开始缩小动画
    const shrinkInterval = setInterval(() => {
        imageZoomState.scale += (imageZoomState.targetScale - imageZoomState.scale) * 0.15;
        
        const zoomedImage = document.getElementById('zoomed-image');
        zoomedImage.style.transform = `scale(${imageZoomState.scale})`;
        
        // 当缩小到足够小时，关闭模态框
        if (Math.abs(imageZoomState.scale - imageZoomState.targetScale) < 0.05) {
            clearInterval(shrinkInterval);
            
            imageZoomState.isZoomed = false;
            imageZoomState.scale = 1;
            imageZoomState.targetScale = 1;
            selectedImageIndex = -1;

            const modal = document.getElementById('image-modal');
            modal.classList.remove('active');
        }
    }, 16);
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
    updateImageParticles(delta);

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

// 更新图片粒子
function updateImageParticles(delta) {
    if (!imageParticles || imageParticles.children.length === 0) return;

    const time = clock.getElapsedTime();
    let chaosIntensity = 0;
    
    if (state.chaosMode) {
        chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
    }

    imageParticles.children.forEach((sprite, index) => {
        const userData = sprite.userData;
        
        if (userData.isOnRing) {
            // 环上的图片随环一起旋转
            userData.theta += userData.speed * delta * 0.5;
            
            let x, y, z;
            
            if (state.chaosMode) {
                // 混沌模式下的效果
                const explodeFactor = chaosIntensity * 20;
                const noiseAmp = chaosIntensity * 2.0;
                
                const bx = userData.r * Math.cos(userData.theta);
                const bz = userData.r * Math.sin(userData.theta);
                
                x = bx + Math.cos(userData.theta) * explodeFactor;
                z = bz + Math.sin(userData.theta) * explodeFactor;
                y = userData.y + (Math.random() - 0.5) * explodeFactor;
                
                x += (Math.random() - 0.5) * noiseAmp;
                y += (Math.random() - 0.5) * noiseAmp;
                z += (Math.random() - 0.5) * noiseAmp;
            } else {
                // 正常轨道运动，添加轻微的上下浮动效果
                x = userData.r * Math.cos(userData.theta);
                z = userData.r * Math.sin(userData.theta);
                y = userData.y + Math.sin(time * 2 + userData.bobOffset) * 0.3;
            }
            
            sprite.position.set(x, y, z);
        } else {
            // 土星本体上的图片
            if (state.chaosMode) {
                // 混沌模式下的爆炸效果
                const jitter = chaosIntensity * 3.0;
                const explode = chaosIntensity * 5.0;
                
                const px = userData.originalPosition.x * (1 + explode);
                const py = userData.originalPosition.y * (1 + explode);
                const pz = userData.originalPosition.z * (1 + explode);
                
                sprite.position.set(
                    px + (Math.random() - 0.5) * jitter,
                    py + (Math.random() - 0.5) * jitter,
                    pz + (Math.random() - 0.5) * jitter
                );
            } else {
                // 添加轻微的浮动效果
                const floatOffset = Math.sin(time * 1.5 + userData.bobOffset) * 0.2;
                sprite.position.x = userData.originalPosition.x + Math.sin(time * 0.5 + userData.bobOffset) * floatOffset;
                sprite.position.y = userData.originalPosition.y + floatOffset;
                sprite.position.z = userData.originalPosition.z + Math.cos(time * 0.5 + userData.bobOffset) * floatOffset;
            }
        }
        
        // 让图片始终面向相机
        sprite.lookAt(camera.position);
        
        // 根据缩放调整图片大小
        const sizeMultiplier = 1 + state.currentZoom * 0.5;
        sprite.scale.set(
            CONFIG.imageParticleSize * sizeMultiplier,
            CONFIG.imageParticleSize * sizeMultiplier,
            1
        );
    });
}
