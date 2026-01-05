const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');
const multer = require("multer");
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
const port = 3000;

// Update upload directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON and URL-encoded bodies
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Multer setup for local uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only .jpg, .jpeg, and .png formats are allowed'));
    }
};
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const cameraUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB for camera frames
});

// Camera stream memory storage
let latestFrame = null;
let lastFrameTime = 0;
let frameIntervals = []; // Track frame intervals for dynamic timeout
const MAX_INTERVALS = 10; // Keep last 10 intervals for averaging
const TIMEOUT_MULTIPLIER = 3; // Timeout = 3x average frame interval
const MIN_TIMEOUT = 1000; // Minimum 1 second timeout
const MAX_TIMEOUT = 10000; // Maximum 10 seconds timeout

// Calculate dynamic frame timeout based on recent frame intervals
function getDynamicFrameTimeout() {
    if (frameIntervals.length < 2) {
        return MIN_TIMEOUT; // Default timeout if not enough data
    }

    // Calculate average frame interval
    const avgInterval = frameIntervals.reduce((sum, interval) => sum + interval, 0) / frameIntervals.length;

    // Timeout should be 3x the average interval to account for network jitter
    const dynamicTimeout = Math.max(MIN_TIMEOUT, Math.min(MAX_TIMEOUT, avgInterval * TIMEOUT_MULTIPLIER));

    return dynamicTimeout;
}

// POST /api/camera/upload - For ESP32-CAM to upload frames
app.post('/api/camera/upload', cameraUpload.single('frame'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'No frame data received' });
        }

        const now = Date.now();

        // Track frame intervals for dynamic timeout calculation
        if (lastFrameTime > 0) {
            const interval = now - lastFrameTime;
            frameIntervals.push(interval);

            // Keep only the last MAX_INTERVALS for averaging
            if (frameIntervals.length > MAX_INTERVALS) {
                frameIntervals.shift();
            }
        }

        // Store the latest frame in memory (buffer is available with memoryStorage)
        latestFrame = req.file.buffer;
        lastFrameTime = now;

        const currentFPS = frameIntervals.length > 0 ? (1000 / (frameIntervals.reduce((sum, interval) => sum + interval, 0) / frameIntervals.length)).toFixed(1) : '0';
        const dynamicTimeout = getDynamicFrameTimeout();

        console.log(`Frame received: ${req.file.buffer.length} bytes | FPS: ${currentFPS} | Dynamic timeout: ${dynamicTimeout}ms`);

        res.status(200).json({
            status: 'success',
            message: 'Frame received',
            frameSize: req.file.buffer.length,
            fps: parseFloat(currentFPS),
            dynamicTimeout: dynamicTimeout
        });
    } catch (error) {
        console.error('Error processing camera frame:', error);
        res.status(500).json({ status: 'error', message: 'Failed to process frame' });
    }
});

// GET /api/camera/stream - For clients to receive the camera stream
app.get('/api/camera/stream', (req, res) => {
    try {
        const dynamicTimeout = getDynamicFrameTimeout();

        // Check if we have a recent frame using dynamic timeout
        if (!latestFrame || (Date.now() - lastFrameTime) > dynamicTimeout) {
            console.log('No active camera feed:', {
                hasFrame: !!latestFrame,
                lastFrameTime: lastFrameTime ? new Date(lastFrameTime).toISOString() : 'never',
                frameAge: latestFrame ? Date.now() - lastFrameTime : 'n/a',
                dynamicTimeout: dynamicTimeout
            });

            // Return a 1x1 transparent GIF when no frame is available
            const emptyGif = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
            res.set({
                'Content-Type': 'image/gif',
                'Content-Length': emptyGif.length,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Access-Control-Allow-Origin': '*',
                'Cross-Origin-Resource-Policy': 'cross-origin'
            });
            return res.end(emptyGif);
        }

        console.log('Serving frame:', {
            size: latestFrame.length,
            lastFrameTime: new Date(lastFrameTime).toISOString(),
            frameAge: Date.now() - lastFrameTime
        });

        // Set headers
        res.set({
            'Content-Type': 'image/jpeg',
            'Content-Length': latestFrame.length,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'X-Frame-Age': (Date.now() - lastFrameTime).toString()
        });

        // Send the image data
        res.end(latestFrame);
    } catch (error) {
        console.error('Error serving camera stream:', error);
        res.status(500).json({ status: 'error', message: 'Failed to serve camera stream' });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Serve static files from the 'public' directory
app.use(express.static('public'));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

