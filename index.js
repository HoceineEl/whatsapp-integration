const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory storage for client sessions and their statuses
const sessions = {};
const statuses = {}; // Possible statuses: 'initializing', 'qr', 'ready', 'authenticated', 'disconnected', 'error'

/**
 * Creates and initializes a new WhatsApp client session for a tenant.
 * @param {string} tenantId - The unique identifier for the tenant.
 */
const createSession = (tenantId) => {
    console.log(`[${tenantId}] Creating session...`);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: tenantId,
            dataPath: './.wwebjs_auth' // All sessions stored here
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for running in Docker/Linux
        }
    });

    client.on('qr', (qr) => {
        console.log(`[${tenantId}] QR code received.`);
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error(`[${tenantId}] Error generating QR code data URL.`, err);
                statuses[tenantId] = { status: 'error', message: 'Failed to generate QR code.' };
            } else {
                statuses[tenantId] = { status: 'qr', qr: url };
            }
        });
    });

    client.on('ready', () => {
        console.log(`[${tenantId}] Client is ready!`);
        statuses[tenantId] = { status: 'ready' };
    });

    client.on('authenticated', () => {
        console.log(`[${tenantId}] Client authenticated.`);
        statuses[tenantId] = { status: 'authenticated' };
    });

    client.on('auth_failure', (msg) => {
        console.error(`[${tenantId}] Authentication failure.`, msg);
        statuses[tenantId] = { status: 'error', message: 'Authentication failed. Please try again.' };
    });

    client.on('disconnected', (reason) => {
        console.log(`[${tenantId}] Client was logged out.`, reason);
        statuses[tenantId] = { status: 'disconnected' };
        client.destroy();
        delete sessions[tenantId];
    });

    client.initialize().catch(err => {
        console.error(`[${tenantId}] Initialization failed.`, err);
        statuses[tenantId] = { status: 'error', message: 'Initialization failed.' };
    });

    sessions[tenantId] = client;
    statuses[tenantId] = { status: 'initializing' };
};

/**
 * Cleans up a session by destroying the client, removing it from memory,
 * and deleting session files.
 * @param {string} tenantId - The unique identifier for the tenant.
 */
const cleanupSession = (tenantId) => {
    const client = sessions[tenantId];
    if (client) {
        // The 'disconnected' event should handle the rest of the cleanup.
        // We just need to trigger the logout.
        client.logout().catch(err => {
            console.error(`[${tenantId}] Error during client.logout() in cleanup, destroying directly.`, err);
            client.destroy().catch(e => console.error(`[${tenantId}] Error during client.destroy() in cleanup.`, e));
        });
        delete sessions[tenantId];
    }
    // Also remove the session files
    const sessionPath = `./.wwebjs_auth/session-${tenantId}`;
    if (fs.existsSync(sessionPath)) {
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`[${tenantId}] Session files removed.`);
        } catch (err) {
            console.error(`[${tenantId}] Error removing session files.`, err);
        }
    }
    statuses[tenantId] = { status: 'disconnected' };
    console.log(`[${tenantId}] Session cleaned up.`);
};

// --- API Endpoints ---

// Endpoint to get session info
app.get('/session/:tenantId/info', async (req, res) => {
    const { tenantId } = req.params;
    const client = sessions[tenantId];
    const statusInfo = statuses[tenantId];

    if (!client || !statusInfo || (statusInfo.status !== 'ready' && statusInfo.status !== 'authenticated')) {
        return res.status(409).json({ success: false, status: statusInfo?.status || 'disconnected', message: 'Client is not ready.' });
    }

    try {
        // Ensure client.info is available
        if (client.info) {
            const info = {
                name: client.info.pushname,
                number: client.info.wid.user,
            };
            res.status(200).json({ success: true, info });
        } else {
            // This can happen briefly during connection startup
            res.status(202).json({ success: false, message: 'Client info not available yet. Please try again.' });
        }
    } catch (error) {
        console.error(`[${tenantId}] Failed to get client info.`, error);
        res.status(500).json({ success: false, message: 'Failed to get client info.', error: error.message });
    }
});

// Endpoint to get profile picture URL
app.get('/session/:tenantId/profile-pic', async (req, res) => {
    const { tenantId } = req.params;
    const client = sessions[tenantId];
    const statusInfo = statuses[tenantId];

    if (!client || !statusInfo || (statusInfo.status !== 'ready' && statusInfo.status !== 'authenticated')) {
        return res.status(409).json({ success: false, status: statusInfo?.status || 'disconnected', message: 'Client is not ready.' });
    }

    try {
        if (client.info) {
            const picUrl = await client.getProfilePicUrl(client.info.wid._serialized);
            res.status(200).json({ success: true, url: picUrl });
        } else {
            res.status(202).json({ success: false, message: 'Client info not available yet.' });
        }
    } catch (error) {
        console.error(`[${tenantId}] Failed to get profile picture.`, error);
        res.status(500).json({ success: false, message: 'Failed to get profile picture.', error: error.message });
    }
});

// Endpoint to initialize a session and get a QR code
app.get('/session/:tenantId/qr', (req, res) => {
    const { tenantId } = req.params;
    const statusInfo = statuses[tenantId];

    if (statusInfo && (statusInfo.status === 'ready' || statusInfo.status === 'authenticated')) {
        return res.status(200).json({ success: true, status: 'authenticated', message: 'Client is already connected.' });
    }

    if (statusInfo && statusInfo.status === 'qr' && statusInfo.qr) {
        return res.status(200).json({ success: true, status: 'qr', qr: statusInfo.qr });
    }

    // If session is initializing, tell client to wait
    if (statusInfo && statusInfo.status === 'initializing') {
        return res.status(202).json({ success: true, status: 'initializing', message: 'Session is initializing. Please poll again shortly.' });
    }

    // If no session or it's disconnected/error, start a new one
    if (!statusInfo || ['disconnected', 'error'].includes(statusInfo.status)) {
        createSession(tenantId);
        return res.status(202).json({ success: true, status: 'initializing', message: 'Session is initializing. Please poll again shortly.' });
    }

    // Fallback for any other state, ensures we always respond.
    res.status(200).json({ success: true, status: statusInfo.status, qr: statusInfo.qr, message: 'Current status.' });
});

// Endpoint to get the status of a session
app.get('/session/:tenantId/status', (req, res) => {
    const { tenantId } = req.params;
    const currentStatus = statuses[tenantId]?.status || 'disconnected';
    res.status(200).json({ success: true, status: currentStatus });
});

// Endpoint to send a message
app.post('/session/:tenantId/send', async (req, res) => {
    const { tenantId } = req.params;
    const { number, message } = req.body; // number format: 1234567890

    if (!number || !message) {
        return res.status(400).json({ success: false, message: 'The "number" and "message" fields are required.' });
    }

    const client = sessions[tenantId];
    const statusInfo = statuses[tenantId];

    if (!client || !statusInfo || statusInfo.status !== 'ready') {
        return res.status(409).json({ success: false, message: 'Client is not ready. Cannot send message.' });
    }

    try {
        const chatId = `${number.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(chatId, message);
        res.status(200).json({ success: true, message: 'Message sent successfully.' });
    } catch (error) {
        console.error(`[${tenantId}] Failed to send message to ${number}.`, error);
        res.status(500).json({ success: false, message: 'Failed to send message.', error: error.message });
    }
});

// Endpoint to force reconnect a session
app.post('/session/:tenantId/reconnect', (req, res) => {
    const { tenantId } = req.params;
    console.log(`[${tenantId}] Received request to reconnect.`);

    // Cleanup existing session and start a new one
    cleanupSession(tenantId);
    createSession(tenantId);

    res.status(200).json({ success: true, message: 'Reconnection process initiated.' });
});

// Endpoint to log out a session
app.delete('/session/:tenantId/logout', async (req, res) => {
    const { tenantId } = req.params;
    console.log(`[${tenantId}] Received request to logout.`);
    cleanupSession(tenantId);
    res.status(200).json({ success: true, message: 'Logout process initiated and session is being cleaned up.' });
});

// --- Service Initialization ---

// On startup, find all existing session files and attempt to reconnect.
const authPath = './.wwebjs_auth';
if (fs.existsSync(authPath)) {
    fs.readdir(authPath, (err, files) => {
        if (err) {
            console.error('Could not list session files for reconnection.', err);
            return;
        }
        files.forEach(file => {
            // The directory name for LocalAuth is "session-<clientId>"
            if (file.startsWith('session-')) {
                const tenantId = file.substring(8); // "session-".length
                if (tenantId) {
                    console.log(`[${tenantId}] Found existing session. Attempting to reconnect...`);
                    createSession(tenantId);
                }
            }
        });
    });
}

app.listen(PORT, () => {
    console.log(`WhatsApp service is running on http://localhost:${PORT}`);
});

