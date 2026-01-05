import * as THREE from 'https://esm.run/three@0.154.0';
import { GLTFLoader } from 'https://esm.run/three@0.154.0/examples/jsm/loaders/GLTFLoader.js';

window.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("rover-3d-preview");
    if (!container) return;

    container.textContent = '';

    // Add overlay label for red arrow meaning
    if (!document.getElementById('rover-arrow-label')) {
        const arrowLabel = document.createElement('div');
        arrowLabel.id = 'rover-arrow-label';
        arrowLabel.textContent = 'Arrow = Forward Direction';
        arrowLabel.style.position = 'absolute';
        arrowLabel.style.left = '18px';
        arrowLabel.style.bottom = '12px';
        arrowLabel.style.color = '#fff';
        arrowLabel.style.background = 'rgba(34,34,34,0.7)';
        arrowLabel.style.padding = '4px 12px';
        arrowLabel.style.borderRadius = '8px';
        arrowLabel.style.zIndex = '101';
        arrowLabel.style.fontFamily = "'Inter', sans-serif";
        arrowLabel.style.pointerEvents = 'none';
        arrowLabel.style.fontSize = '0.95rem';
        container.appendChild(arrowLabel);
    }


    const scene = new THREE.Scene();
    // Set scene background to light grey
    scene.background = new THREE.Color(0x222222);
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    // Set camera to bird's-eye (isometric) perspective
    camera.position.set(2, 4, 2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    if (!document.getElementById('rover-3d-watermark')) {
        const watermark = document.createElement('div');
        watermark.id = 'rover-3d-watermark';
        watermark.textContent = 'Models by TheCooker';
        watermark.style.position = 'absolute';
        watermark.style.bottom = '12px';
        watermark.style.right = '18px';
        watermark.style.fontSize = '0.95rem';
        watermark.style.color = '#fff';
        watermark.style.background = 'rgba(34,34,34,0.6)';
        watermark.style.padding = '4px 12px';
        watermark.style.borderRadius = '8px';
        watermark.style.pointerEvents = 'none';
        watermark.style.zIndex = '100';
        watermark.style.fontFamily = "'Inter', sans-serif";
        container.appendChild(watermark);
    }
    // Add lights
    // Improved lighting: add multiple lights and shadows
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1.2);
    directional.position.set(4, 8, 6);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 1024;
    directional.shadow.mapSize.height = 1024;
    scene.add(directional);

    const fillLight = new THREE.PointLight(0x22c55e, 0.3, 10);
    fillLight.position.set(-3, 2, 2);
    scene.add(fillLight);

    // Add ground plane for shadow and orientation
    const groundGeo = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // Add 3D arrow for forward direction
    // Forward is along +X axis for your rover
    // Place arrow between two front motors (adjust origin as needed)
    // Forward is along -Z axis for most Blender/GLTF exports
    // Raise the arrow above the rover for visibility
    const arrowDir = new THREE.Vector3(0, 0, -1); // Forward along -Z
    const arrowOrigin = new THREE.Vector3(0, 0.8, 0.5); // Higher Y value
    const arrowLength = 1.2;
    const arrowColor = 0xff3333;
    const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowOrigin, arrowLength, arrowColor, 0.3, 0.2);
    scene.add(arrowHelper);

    let mixer;
    let actions = {};
    let activeAction = null;

    // Load 3D model
    const loader = new GLTFLoader();
    loader.load('/models/rover.glb', (gltf) => {
        const model = gltf.scene;
        model.position.set(0, 0, 0);
        scene.add(model);

        // Store all animation actions
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
                actions[clip.name] = mixer.clipAction(clip);
            });
            // Play default animation
            // playAnimation('anim1');
        }
    }, undefined, (error) => {
        console.error('Error loading 3D model:', error);
    });

    function playAnimation(name) {
        if (!actions[name]) {
            console.warn(`Animation "${name}" not found.`);
            return;
        }
        // Only switch if not already playing this animation
        if (activeAction === actions[name] && activeAction.isRunning()) {
            return; // Already playing, do nothing
        }
        if (activeAction) {
            activeAction.stop();
        }
        activeAction = actions[name];
        activeAction.reset().play();
    }

    // Expose to global scope for rover.js
    window.roverPreview = {
        playAnimation
    };

    function animate() {
        requestAnimationFrame(animate);
        // Spin camera around Y axis (closer zoom)
        if (!window._spinAngle) window._spinAngle = 0;
        window._spinAngle += 0.001; // Adjust speed as needed
        const spinRadius = 1.5;
        const spinHeight = 1.2;
        camera.position.x = Math.sin(window._spinAngle) * spinRadius;
        camera.position.z = Math.cos(window._spinAngle) * spinRadius;
        camera.position.y = spinHeight;
        camera.lookAt(0, 0, 0);
        if (mixer) {
            mixer.update(0.016); // ~60fps
        }
        renderer.render(scene, camera);
    }

    animate();
});