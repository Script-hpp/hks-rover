
// Theme Toggle Functionality
const themeToggle = document.getElementById('themeToggle');

// Load saved theme or default to dark
const savedTheme = localStorage.getItem('rover-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('rover-theme', newTheme);

    // Add a nice animation effect
    themeToggle.style.transform = 'scale(0.8) rotate(360deg)';
    setTimeout(() => {
        themeToggle.style.transform = '';
    }, 300);
}

if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
}

const commandToAnimation = {
    forward: 'forward',
    backward: 'backward',
    left: 'left',
    right: 'right',
    gas: 'gas',
    kicker: 'kicker',
    stop: 'stop'
};

// Global variables
let pressStartTime = null;
let client = null;
let isConnected = false;
let cameraConnected = false;
let gamepadConnected = false;
let commandInterval = null;
let lastFrameTime = Date.now();
let lastSentCommand = null;
let lastCommandTime = 0;
const COMMAND_THROTTLE_MS = 500; // Send commands at most every 500ms

// DOM elements
const mqttStatus = document.getElementById('mqtt-status');
const gamepadStatus = document.getElementById('gamepad-status');
const cameraFeed = document.getElementById('camera-feed');
const cameraPlaceholder = document.getElementById('camera-placeholder');
const cameraUrl = document.getElementById('camera-url');
const refreshCamera = document.getElementById('refresh-camera');
const cameraStatusIndicator = document.getElementById('camera-status-indicator');
const cameraStatusText = document.getElementById('camera-status-text');
const fpsCounter = document.getElementById('fps-counter');
const connectBtn = document.getElementById('connect-btn');
const serverInput = document.getElementById('mqtt-server');
const portInput = document.getElementById('mqtt-port');
const topicInput = document.getElementById('mqtt-topic');

// Control buttons
const controlButtons = {
    forward: document.getElementById('forward'),
    backward: document.getElementById('backward'),
    left: document.getElementById('left'),
    right: document.getElementById('right'),
    stop: document.getElementById('stop'),
    gas: document.getElementById('gas'),
    rotateLeft: document.getElementById('rotate-left'),
    rotateRight: document.getElementById('rotate-right'),
    kicker: document.getElementById('kicker')
};

// Update connection status
function updateMQTTStatus(connected, message = '') {
    isConnected = connected;
    const indicator = mqttStatus.querySelector('.status-indicator');
    const text = mqttStatus.querySelector('span');

    if (connected) {
        mqttStatus.className = 'status-badge connected';
        text.textContent = 'MQTT Connected';
        if (connectBtn) connectBtn.textContent = 'Reconnect to MQTT';
        enableControls();
    } else {
        mqttStatus.className = 'status-badge disconnected';
        text.textContent = message || 'MQTT Disconnected';
        if (connectBtn) connectBtn.textContent = 'Connect to MQTT';
        disableControls();
    }
}

function updateGamepadStatus(connected) {
    gamepadConnected = connected;
    if (connected) {
        gamepadStatus.style.display = 'flex';
    } else {
        gamepadStatus.style.display = 'none';
    }
}

function updateCameraStatus(connected, message = '') {
    cameraConnected = connected;
    if (connected) {
        cameraStatusIndicator.style.background = 'var(--success)';
        cameraStatusText.textContent = 'Camera Connected';
        cameraFeed.classList.add('active');
        cameraPlaceholder.style.display = 'none';
    } else {
        cameraStatusIndicator.style.background = 'var(--danger)';
        cameraStatusText.textContent = message || 'Camera Disconnected';
        cameraFeed.classList.remove('active');
        cameraPlaceholder.style.display = 'flex';
        cameraPlaceholder.innerHTML = `
                    <div style="font-size: 2rem;">📷</div>
                    <div>${message || 'Camera disconnected'}</div>
                `;
        if (fpsCounter) fpsCounter.textContent = 'FPS: 0';
    }
}

// MQTT Connection
function connectToMQTT() {
    const server = serverInput?.value || 'hks26.tech';
    const port = portInput?.value || '9001';

    if (client) {
        client.end();
    }

    const clientId = 'rover_control_web_' + Math.random().toString(16).substr(2, 8);
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${server}:${port}`;

    updateMQTTStatus(false, 'Connecting...');

    try {
        // eslint-disable-next-line no-undef
        client = mqtt.connect(wsUrl, {
            clientId,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 5000,
            protocolVersion: 4
        });

        client.on('connect', () => {
            updateMQTTStatus(true);
            console.log('Connected to MQTT Broker');
        });

        client.on('error', (err) => {
            updateMQTTStatus(false, `Error: ${err.message}`);
            console.error('Connection error: ', err);
        });

        client.on('reconnect', () => {
            updateMQTTStatus(false, 'Reconnecting...');
            console.log('Reconnecting...');
        });

        client.on('close', () => {
            updateMQTTStatus(false, 'Connection closed');
            console.log('Connection closed');
        });
    } catch (error) {
        updateMQTTStatus(false, `Failed to connect: ${error.message}`);
        console.error('Failed to connect:', error);
    }
}

// Send command
function sendCommand(command) {
    if (!isConnected || !client) {
        console.log('Not connected to MQTT broker');
        return;
    }

    // Throttle commands - don't send the same command too frequently
    const now = Date.now();
    if (lastSentCommand === command && (now - lastCommandTime) < COMMAND_THROTTLE_MS) {
        return;
    }

    if (window.roverPreview && window.roverPreview.playAnimation) {
        const animName = commandToAnimation[command];
        if (animName) {
            window.roverPreview.playAnimation(animName);
        }
    }

    // Speed logic: if command is movement, send speed value
    let speed = 170;
    if (pressStartTime && ['forward', 'backward', 'left', 'right', 'gas', 'rotate-left', 'rotate-right'].includes(command)) {
        const duration = Math.min(Date.now() - pressStartTime, 5000); // cap at 5s
        speed = 170 + Math.floor((duration / 2000) * 85);
        speed = Math.min(speed, 255); // cap at 255
    }

    const topic = topicInput?.value || 'rover/control';
    let payload = command;
    if (['forward', 'backward', 'left', 'right', 'gas', 'stop', 'rotate-left', 'rotate-right', 'kicker'].includes(command)) {
        payload = JSON.stringify({ command, speed });
    }

    lastSentCommand = command;
    lastCommandTime = now;

    console.log(`Publishing to ${topic}: ${payload}`);
    client.publish(topic, payload, { qos: 0, retain: false }, (error) => {
        if (error) {
            console.error('Publish error: ', error);
        } else {
            // Success
        }
    });
}

// Control functions
function press(command) {
    if (commandInterval) clearInterval(commandInterval);
    if (command) {
        pressStartTime = Date.now();
        sendCommand(command);
        // Repeatedly send command to keep it alive/update speed
        commandInterval = setInterval(() => sendCommand(command), 1000);
    }
}

function release() {
    if (commandInterval) {
        clearInterval(commandInterval);
        commandInterval = null;
        pressStartTime = null;
        lastSentCommand = null;
        sendCommand('stop');
    }
}

// Enable/disable controls
function enableControls() {
    Object.values(controlButtons).forEach(btn => {
        if (btn) {
            btn.disabled = false;
        }
    });
}

function disableControls() {
    Object.values(controlButtons).forEach(btn => {
        if (btn) {
            btn.disabled = true;
        }
    });
}

// Setup button events
function setupButton(btn, command) {
    if (!btn) return;

    ['mousedown', 'touchstart'].forEach(type => {
        btn.addEventListener(type, e => {
            e.preventDefault();
            if (isConnected) press(command);
        });
    });

    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(type => {
        btn.addEventListener(type, e => {
            e.preventDefault();
            if (isConnected) release();
        });
    });
}

// Camera functions
function updateCameraFeed() {
    const baseUrl = cameraUrl?.value || '/api/camera/stream';
    updateCameraStatus(false, 'Connecting...');

    function loadFrame() {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                updateCameraStatus(false, 'Invalid image');
                return;
            }

            if (!cameraConnected) {
                updateCameraStatus(true);
            }

            cameraFeed.src = img.src;

            // Calculate FPS
            const currentTime = Date.now();
            const timeDiff = currentTime - lastFrameTime;
            if (lastFrameTime > 0 && timeDiff > 0) {
                const fps = Math.round(1000 / timeDiff);
                if (fpsCounter) fpsCounter.textContent = `FPS: ${fps}`;
            }
            lastFrameTime = currentTime;

            if (cameraConnected) {
                // Throttle to ~10 FPS to prevent infinity bug
                setTimeout(() => requestAnimationFrame(loadFrame), 100);
            }
        };

        img.onerror = function () {
            updateCameraStatus(false, 'Connection Error');
            setTimeout(loadFrame, 2000);
        };

        img.src = `${baseUrl}?t=${Date.now()}`;
    }

    loadFrame();
}

// Gamepad handling
function handleGamepadConnected(event) {
    updateGamepadStatus(true);
    console.log(`Gamepad connected: ${event.gamepad.id}`);
    requestAnimationFrame(updateGamepad);
}

function handleGamepadDisconnected(event) {
    updateGamepadStatus(false);
    console.log(`Gamepad disconnected: ${event.gamepad.id}`);
}

function updateGamepad() {
    if (!gamepadConnected) return;

    const gamepads = navigator.getGamepads();
    if (!gamepads) return;

    const gamepad = gamepads[0];
    if (!gamepad) return;

    // Get axes
    const leftStickX = gamepad.axes[0] || 0;
    const leftStickY = gamepad.axes[1] || 0;
    const rightStickX = gamepad.axes[2] || 0;

    // Get buttons
    const buttonA = gamepad.buttons[0]?.pressed || false; // X
    const buttonB = gamepad.buttons[1]?.pressed || false; // Circle
    const buttonX = gamepad.buttons[2]?.pressed || false; // Square
    const buttonY = gamepad.buttons[3]?.pressed || false; // Triangle
    const buttonLB = gamepad.buttons[4]?.pressed || false; // L1
    const buttonRB = gamepad.buttons[5]?.pressed || false; // R1
    const buttonLT = gamepad.buttons[6]?.value > 0.5; // L2
    const buttonRT = gamepad.buttons[7]?.value > 0.5; // R2

    const deadzone = 0.3;
    let command = null;

    // Movement from left stick
    const isUp = leftStickY < -deadzone;
    const isDown = leftStickY > deadzone;
    const isLeft = leftStickX < -deadzone;
    const isRight = leftStickX > deadzone;

    // Rotation from right stick
    const isRotateLeft = rightStickX < -deadzone;
    const isRotateRight = rightStickX > deadzone;

    // Determine command
    if (buttonLT || buttonRT) {
        command = 'gas';
    } else if (buttonLB) {
        command = 'kicker';
    } else if (buttonA || buttonY) {
        command = 'forward';
    } else if (buttonB || buttonX) {
        command = 'backward';
    } else if (isUp) {
        command = 'forward';
    } else if (isDown) {
        command = 'backward';
    } else if (isRotateLeft) {
        command = 'rotate-left';
    } else if (isRotateRight) {
        command = 'rotate-right';
    } else if (isLeft) {
        command = 'left';
    } else if (isRight) {
        command = 'right';
    }

    if (command) {
        press(command);
    } else {
        release();
    }

    requestAnimationFrame(updateGamepad);
}

// Event listeners
if (connectBtn) connectBtn.addEventListener('click', connectToMQTT);
if (refreshCamera) refreshCamera.addEventListener('click', updateCameraFeed);
if (cameraUrl) cameraUrl.addEventListener('change', updateCameraFeed);

// Setup control buttons
setupButton(controlButtons.forward, 'forward');
setupButton(controlButtons.backward, 'backward');
setupButton(controlButtons.left, 'left');
setupButton(controlButtons.right, 'right');
setupButton(controlButtons.gas, 'gas');
setupButton(controlButtons.rotateLeft, 'rotate-left');
setupButton(controlButtons.rotateRight, 'rotate-right');
setupButton(controlButtons.kicker, 'kicker');

if (controlButtons.stop) {
    controlButtons.stop.addEventListener('click', () => {
        if (isConnected) {
            release();
            sendCommand('stop');
        }
    });
}

// Gamepad events
window.addEventListener('gamepadconnected', handleGamepadConnected);
window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    disableControls();
    updateCameraFeed();

    // Auto-connect if configured
    if (serverInput && portInput && topicInput) {
        // connectToMQTT(); // Optional: auto connect
    }

    // Check for existing gamepad
    if (navigator.getGamepads()[0]) {
        handleGamepadConnected({ gamepad: navigator.getGamepads()[0] });
    }

    const testAssignBtn = document.getElementById('connectButton');
    if (testAssignBtn) {
        testAssignBtn.addEventListener('click', () => {
            if (!isConnected) {
                connectToMQTT();
            }
        });
    }
});

// Make functions available globally for debugging
window.roverControl = {
    sendCommand,
    press,
    release,
    updateMQTTStatus,
    updateCameraStatus,
    updateGamepadStatus
};