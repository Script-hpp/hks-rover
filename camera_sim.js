const fs = require('node:fs');



const testFileName = 'stream_frame.jpg';

async function uploadFrame() {
    try {
        const fileBuffer = fs.readFileSync(testFileName);
        const blob = new Blob([fileBuffer], { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('frame', blob, testFileName);

        const response = await fetch('http://localhost:3000/api/camera/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            process.stdout.write(`\r✅ Upload Success | FPS: ${data.fps}   `);
        } else {
            const text = await response.text();
            console.error('\n❌ Upload Failed:', response.status, text);
        }

    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
            process.stdout.write(`\r❌ Connection Refused - Is Server Running?   `);
        } else {
            console.error('\n❌ Error testing upload:', error);
        }
    }
}

console.log("🚀 Starting Camera Simulation...");
console.log("Press Ctrl+C to stop");

// Upload every 200ms (approx 5 FPS)
setInterval(uploadFrame, 200);

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('\nStopping simulation...');

    process.exit();
});
