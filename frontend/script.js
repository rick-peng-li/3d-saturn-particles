// Global Variables
let scene, camera, renderer, composer;
let coreSystem, ringSystem;
let clock = new THREE.Clock();
let ringData = []; // Store initial data for physics calculations
let coreData = [];

// Image related variables
let uploadedImages = []; // Store multiple uploaded images
let currentEnlargedImageIndex = -1; // Index of currently enlarged image
let imageParticles = [];
let isPinching = false;
let pinchScale = 1;
let initialPinchDistance = 0;
let pinchStartTime = 0; // Track when pinch started for random selection

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
    maxBrightness: 1.5 // Bright when close
};

// Initialize
window.onload = () => {
    initThree();
    createParticles();
    initHandTracking();
    initImageUpload();
    initPinchGestures();
    animate();
    
    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });
};

// Initialize image upload
function initImageUpload() {
    const uploadBtn = document.getElementById('upload-btn');
    const imageInput = document.getElementById('image-input');
    
    uploadBtn.addEventListener('click', () => {
        imageInput.click();
    });
    
    imageInput.addEventListener('change', (e) => {
        const files = e.target.files;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file && file.type.startsWith('image/')) {
                handleImageUpload(file);
            }
        }
        // Clear input to allow uploading same files again
        imageInput.value = '';
    });
}

// Handle image upload
function handleImageUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Store image with unique ID
            const imageData = {
                id: Date.now() + Math.random(),
                image: img,
                src: e.target.result
            };
            uploadedImages.push(imageData);
            
            // Distribute this image to particles
            distributeSingleImageToParticles(imageData);
            
            const statusText = `已上传 ${uploadedImages.length} 张图片`;
            document.getElementById('status').innerText = statusText;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Create image texture
function createImageTexture(img) {
    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

// Distribute single image to particles
function distributeSingleImageToParticles(imageData) {
    const img = imageData.image;
    const imageId = imageData.id;
    
    // Create a canvas to extract pixel colors
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    const imageDataPixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageDataPixels.data;
    
    // Number of particles per image (adjust based on performance)
    const particlesPerImage = 100;
    
    // Create particles on Saturn's core (50%)
    for (let i = 0; i < particlesPerImage / 2; i++) {
        const particle = createImageParticle(pixels, canvas.width, canvas.height, true, imageId);
        imageParticles.push(particle);
        scene.add(particle);
    }
    
    // Create particles on Saturn's rings (50%)
    for (let i = 0; i < particlesPerImage / 2; i++) {
        const particle = createImageParticle(pixels, canvas.width, canvas.height, false, imageId);
        imageParticles.push(particle);
        scene.add(particle);
    }
}

// Create a single image particle
function createImageParticle(pixels, imgWidth, imgHeight, isCore, imageId) {
    // Get random pixel from image
    const x = Math.floor(Math.random() * imgWidth);
    const y = Math.floor(Math.random() * imgHeight);
    const pixelIndex = (y * imgWidth + x) * 4;
    
    // Get pixel color (skip transparent pixels)
    let r, g, b, a;
    let attempts = 0;
    do {
        const rx = Math.floor(Math.random() * imgWidth);
        const ry = Math.floor(Math.random() * imgHeight);
        const idx = (ry * imgWidth + rx) * 4;
        r = pixels[idx];
        g = pixels[idx + 1];
        b = pixels[idx + 2];
        a = pixels[idx + 3];
        attempts++;
    } while (a < 128 && attempts < 100);
    
    // Create geometry based on location
    let geometry, position;
    
    if (isCore) {
        // Position on Saturn's core (sphere surface)
        const radius = 8;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        position = new THREE.Vector3(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.sin(phi) * Math.sin(theta),
            radius * Math.cos(phi)
        );
        
        geometry = new THREE.SphereGeometry(0.2, 8, 8);
    } else {
        // Position on Saturn's rings
        const r = CONFIG.ringInner + Math.random() * (CONFIG.ringOuter - CONFIG.ringInner);
        const theta = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * 0.5;
        
        position = new THREE.Vector3(
            r * Math.cos(theta),
            y,
            r * Math.sin(theta)
        );
        
        geometry = new THREE.PlaneGeometry(0.3, 0.3);
    }
    
    const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        transparent: true,
        opacity: a / 255,
        side: THREE.DoubleSide
    });
    
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    
    // Store original position and add random rotation
    particle.userData = {
        originalPosition: position.clone(),
        rotationSpeed: {
            x: (Math.random() - 0.5) * 0.02,
            y: (Math.random() - 0.5) * 0.02,
            z: (Math.random() - 0.5) * 0.02
        },
        isCore: isCore,
        theta: Math.random() * Math.PI * 2,
        r: isCore ? 8 : position.length(),
        imageId: imageId // Store which image this particle belongs to
    };
    
    return particle;
}

// Initialize pinch gestures
function initPinchGestures() {
    // For touch devices
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    
    // For mouse wheel (as alternative zoom)
    document.addEventListener('wheel', handleWheel, { passive: false });
    
    // For desktop testing with mouse (hold Alt + drag)
    let isAltDragging = false;
    let lastMouseY = 0;
    
    document.addEventListener('mousedown', (e) => {
        if (e.altKey && uploadedImages.length > 0) {
            isAltDragging = true;
            lastMouseY = e.clientY;
            // Randomly select an image when Alt+drag starts
            selectRandomImage();
            showEnlargedImage();
            e.preventDefault();
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isAltDragging && uploadedImages.length > 0) {
            const deltaY = lastMouseY - e.clientY;
            pinchScale += deltaY * 0.01;
            pinchScale = Math.max(0.5, Math.min(3, pinchScale));
            updateEnlargedImage();
            lastMouseY = e.clientY;
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isAltDragging) {
            isAltDragging = false;
            pinchScale = 1;
            hideEnlargedImage();
        }
    });

    // Add keyboard shortcut for testing (press 'p' key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' && uploadedImages.length > 0) {
            if (!isPinching) {
                isPinching = true;
                selectRandomImage();
                showEnlargedImage();
                pinchScale = 1.5;
                updateEnlargedImage();
            }
        }
    });
    
    // Release pinch when 'p' key released
    document.addEventListener('keyup', (e) => {
        if (e.key === 'p') {
            if (isPinching) {
                isPinching = false;
                pinchScale = 1;
                hideEnlargedImage();
            }
        }
        // Also support '+' and '-' keys for zoom control (while 'p' is held down)
        if (e.key === '=' || e.key === '+') {
            if (isPinching) {
                pinchScale = Math.min(3, pinchScale + 0.2);
                updateEnlargedImage();
            }
        }
        if (e.key === '-') {
            if (isPinching) {
                pinchScale = Math.max(0.5, pinchScale - 0.2);
                updateEnlargedImage();
            }
        }
    });

    // Use keydown for continuous zoom
    document.addEventListener('keydown', (e) => {
        if (e.key === '=' || e.key === '+') {
            if (isPinching) {
                pinchScale = Math.min(3, pinchScale + 0.2);
                updateEnlargedImage();
            }
        }
        if (e.key === '-') {
            if (isPinching) {
                pinchScale = Math.max(0.5, pinchScale - 0.2);
                updateEnlargedImage();
            }
        }
    });
}

let touchStartDistance = 0;

function handleTouchStart(e) {
    if (e.touches.length === 2 && uploadedImages.length > 0) {
        isPinching = true;
        touchStartDistance = getDistanceBetweenTouches(e.touches);
        initialPinchDistance = touchStartDistance;
        pinchStartTime = Date.now();
        // Randomly select an image when pinch starts
        selectRandomImage();
        showEnlargedImage();
        e.preventDefault();
    }
}

function handleTouchMove(e) {
    if (isPinching && e.touches.length === 2) {
        const currentDistance = getDistanceBetweenTouches(e.touches);
        pinchScale = currentDistance / initialPinchDistance;
        pinchScale = Math.max(0.5, Math.min(3, pinchScale));
        updateEnlargedImage();
        e.preventDefault();
    }
}

function handleTouchEnd(e) {
    if (e.touches.length < 2) {
        isPinching = false;
        pinchScale = 1;
        hideEnlargedImage();
    }
}

function handleWheel(e) {
    if (uploadedImages.length > 0 && e.altKey) {
        if (!isPinching) {
            isPinching = true;
            selectRandomImage();
            showEnlargedImage();
        }
        pinchScale += e.deltaY * -0.001;
        pinchScale = Math.max(0.5, Math.min(3, pinchScale));
        updateEnlargedImage();
        e.preventDefault();
        
        // Auto hide after 2 seconds of inactivity
        clearTimeout(window.wheelTimeout);
        window.wheelTimeout = setTimeout(() => {
            isPinching = false;
            pinchScale = 1;
            hideEnlargedImage();
        }, 2000);
    }
}

function getDistanceBetweenTouches(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Select a random image from uploaded images
function selectRandomImage() {
    if (uploadedImages.length === 0) return;
    
    // Generate a random index
    const randomIndex = Math.floor(Math.random() * uploadedImages.length);
    currentEnlargedImageIndex = randomIndex;
}

function showEnlargedImage() {
    const overlay = document.getElementById('image-overlay');
    const img = document.getElementById('enlarged-image');
    
    if (currentEnlargedImageIndex >= 0 && currentEnlargedImageIndex < uploadedImages.length) {
        const selectedImage = uploadedImages[currentEnlargedImageIndex];
        img.src = selectedImage.src;
        
        // Remove zooming class for initial entrance animation
        img.classList.remove('zooming');
        
        // Trigger entrance animation
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        overlay.offsetHeight; // Force reflow
        overlay.classList.add('active');
    }
}

function updateEnlargedImage() {
    const img = document.getElementById('enlarged-image');
    // Add zooming class for smoother zooming during pinch
    img.classList.add('zooming');
    img.style.transform = `translate(-50%, -50%) scale(${pinchScale})`;
}

function hideEnlargedImage() {
    const overlay = document.getElementById('image-overlay');
    const img = document.getElementById('enlarged-image');
    
    // Remove zooming class to use smooth exit animation
    img.classList.remove('zooming');
    
    // Trigger exit animation
    overlay.classList.remove('active');
    
    // Wait for animation to complete before hiding
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
        // Reset scale for next time
        img.style.transform = 'scale(1)';
        currentEnlargedImageIndex = -1;
    }, 400); // Match CSS transition duration
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
        maxNumHands: 2,
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
        
        // Check each hand for pinch gesture (thumb + index finger pinch)
        let pinchDetected = false;
        let pinchIntensity = 0;
        
        for (let handIndex = 0; handIndex < results.multiHandLandmarks.length; handIndex++) {
            const landmarks = results.multiHandLandmarks[handIndex];
            
            // Check for pinch gesture: thumb tip (4) and index finger tip (8)
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            
            // Calculate distance between thumb and index finger tips
            const pinchDistance = Math.sqrt(
                Math.pow(thumbTip.x - indexTip.x, 2) + 
                Math.pow(thumbTip.y - indexTip.y, 2)
            );
            
            // Also check if other fingers are open (to distinguish from fist)
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];
            const wrist = landmarks[0];
            
            const middleDist = Math.sqrt(
                Math.pow(middleTip.x - wrist.x, 2) + 
                Math.pow(middleTip.y - wrist.y, 2)
            );
            
            // Pinch detection logic:
            // - Thumb and index finger tips are close together
            // - Other fingers are relatively open (not a closed fist)
            const isPinchGesture = pinchDistance < 0.15 && middleDist > 0.15;
            
            if (isPinchGesture && uploadedImages.length > 0) {
                pinchDetected = true;
                // Calculate pinch intensity for scaling: closer pinch = larger scale
                // Normalize pinchDistance (0.02 to 0.15) to scale (3 to 0.5)
                const normalizedDistance = Math.max(0.02, Math.min(0.15, pinchDistance));
                pinchIntensity = 0.5 + (0.15 - normalizedDistance) * 20;
                pinchIntensity = Math.max(0.5, Math.min(3, pinchIntensity));
                break;
            }
        }
        
        if (pinchDetected) {
            statusElement.innerText = "👆 捏合手势 - 放大图片";
            statusElement.style.color = "#00aaff";
            
            if (!isPinching) {
                isPinching = true;
                pinchStartTime = Date.now();
                // Randomly select an image when pinch starts
                selectRandomImage();
                showEnlargedImage();
            }
            
            // Update pinch scale
            pinchScale = pinchIntensity;
            updateEnlargedImage();
        } else if (results.multiHandLandmarks.length === 1) {
            // Single hand without pinch: normal zoom control
            statusElement.innerText = "🖐️ 手势已识别 - 控制中";
            statusElement.style.color = "#00ff88";
            
            // Stop pinching if pinch gesture ends
            if (isPinching) {
                isPinching = false;
                pinchScale = 1;
                hideEnlargedImage();
            }

            const landmarks = results.multiHandLandmarks[0];
            
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
        } else {
            // Multiple hands but no pinch detected
            if (isPinching) {
                isPinching = false;
                pinchScale = 1;
                hideEnlargedImage();
            }
            statusElement.innerText = "🖐️ 手势已识别 - 控制中";
            statusElement.style.color = "#00ff88";
        }

    } else {
        state.handDetected = false;
        statusElement.innerText = "等待手势指令...";
        statusElement.style.color = "#ffaa00";
        
        // Stop pinching if no hands
        if (isPinching) {
            isPinching = false;
            pinchScale = 1;
            hideEnlargedImage();
        }
        
        // Drift back to default zoom
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

// Update image particles
function updateImageParticles(delta) {
    if (imageParticles.length === 0) return;
    
    const time = clock.getElapsedTime();
    
    imageParticles.forEach(particle => {
        const userData = particle.userData;
        
        // Rotate the particle
        particle.rotation.x += userData.rotationSpeed.x;
        particle.rotation.y += userData.rotationSpeed.y;
        particle.rotation.z += userData.rotationSpeed.z;
        
        if (state.chaosMode) {
            // Chaos mode: particles move around randomly
            const chaosIntensity = (state.currentZoom - CONFIG.chaosThreshold) / (1 - CONFIG.chaosThreshold);
            const jitter = chaosIntensity * 2.0;
            
            particle.position.x = userData.originalPosition.x + (Math.random() - 0.5) * jitter;
            particle.position.y = userData.originalPosition.y + (Math.random() - 0.5) * jitter;
            particle.position.z = userData.originalPosition.z + (Math.random() - 0.5) * jitter;
        } else {
            // Normal mode: particles orbit with the rings/core
            if (userData.isCore) {
                // Rotate with the core
                userData.theta += delta * 0.05;
                const radius = 8;
                particle.position.x = radius * Math.sin(userData.theta) * Math.cos(time * 0.1);
                particle.position.y = radius * Math.sin(userData.theta) * Math.sin(time * 0.1);
                particle.position.z = radius * Math.cos(userData.theta);
            } else {
                // Orbit with the rings
                userData.theta += (5.0 / Math.pow(userData.r, 1.5)) * delta * 0.5;
                particle.position.x = userData.r * Math.cos(userData.theta);
                particle.position.z = userData.r * Math.sin(userData.theta);
            }
        }
    });
}
