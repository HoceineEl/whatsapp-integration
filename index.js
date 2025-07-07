const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS middleware for cross-origin requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
    next();
});

const PORT = process.env.PORT || 3000;
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS) || 50;
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT) || 300000; // 5 minutes

// In-memory storage for client sessions and their statuses
const sessions = {};
const statuses = {};
const sessionTimers = {};

// Health check endpoint
app.get('/health', (req, res) => {
    const activeSessionsCount = Object.keys(sessions).length;
    res.status(200).json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeSessions: activeSessionsCount,
        maxSessions: MAX_SESSIONS,
        uptime: process.uptime()
    });
});

// Service info endpoint
app.get('/info', (req, res) => {
    res.status(200).json({
        success: true,
        service: 'WhatsApp Integration Service',
        version: '1.0.0',
        endpoints: {
            health: 'GET /health',
            status: 'GET /session/:tenantId/status',
            qr: 'GET /session/:tenantId/qr',
            info: 'GET /session/:tenantId/info',
            profilePic: 'GET /session/:tenantId/profile-pic',
            send: 'POST /session/:tenantId/send',
            reconnect: 'POST /session/:tenantId/reconnect',
            logout: 'DELETE /session/:tenantId/logout'
        }
    });
});

/**
 * Validates tenant ID format
 */
const validateTenantId = (tenantId) => {
    return tenantId && /^[a-zA-Z0-9_-]+$/.test(tenantId) && tenantId.length <= 50;
};

/**
 * Middleware to validate tenant ID
 */
const validateTenantIdMiddleware = (req, res, next) => {
    const { tenantId } = req.params;
    if (!validateTenantId(tenantId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid tenant ID format. Use alphanumeric characters, hyphens, and underscores only.'
        });
    }
    next();
};

/**
 * Check if we can create a new session
 */
const canCreateSession = () => {
    return Object.keys(sessions).length < MAX_SESSIONS;
};

/**
 * Clean up inactive sessions
 */
const cleanupInactiveSessions = () => {
    const now = Date.now();
    Object.keys(sessionTimers).forEach(tenantId => {
        if (now - sessionTimers[tenantId] > SESSION_TIMEOUT) {
            console.log(`[${tenantId}] Session timeout, cleaning up...`);
            cleanupSession(tenantId);
        }
    });
};

// Run cleanup every 5 minutes
setInterval(cleanupInactiveSessions, 300000);

/**
 * Update session activity
 */
const updateSessionActivity = (tenantId) => {
    sessionTimers[tenantId] = Date.now();
};

/**
 * Creates and initializes a new WhatsApp client session for a tenant.
 */
const createSession = (tenantId) => {
    if (!canCreateSession()) {
        console.log(`[${tenantId}] Cannot create session: maximum sessions reached (${MAX_SESSIONS})`);
        statuses[tenantId] = {
            status: 'error',
            message: 'Maximum number of sessions reached. Please try again later.'
        };
        return false;
    }

    console.log(`[${tenantId}] Creating session...`);
    updateSessionActivity(tenantId);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: tenantId,
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', (qr) => {
        console.log(`[${tenantId}] QR code received.`);
        updateSessionActivity(tenantId);
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error(`[${tenantId}] Error generating QR code data URL.`, err);
                statuses[tenantId] = {
                    status: 'error',
                    message: 'Failed to generate QR code.',
                    timestamp: new Date().toISOString()
                };
            } else {
                statuses[tenantId] = {
                    status: 'qr',
                    qr: url,
                    timestamp: new Date().toISOString()
                };
            }
        });
    });

    client.on('ready', () => {
        console.log(`[${tenantId}] Client is ready!`);
        updateSessionActivity(tenantId);
        statuses[tenantId] = {
            status: 'ready',
            timestamp: new Date().toISOString()
        };
    });

    client.on('authenticated', () => {
        console.log(`[${tenantId}] Client authenticated.`);
        updateSessionActivity(tenantId);
        statuses[tenantId] = {
            status: 'authenticated',
            timestamp: new Date().toISOString()
        };
    });

    client.on('auth_failure', (msg) => {
        console.error(`[${tenantId}] Authentication failure.`, msg);
        statuses[tenantId] = {
            status: 'error',
            message: 'Authentication failed. Please try again.',
            timestamp: new Date().toISOString()
        };
    });

    client.on('disconnected', (reason) => {
        console.log(`[${tenantId}] Client was logged out.`, reason);
        statuses[tenantId] = {
            status: 'disconnected',
            reason: reason,
            timestamp: new Date().toISOString()
        };

        // Clean up the client
        if (client) {
            client.destroy().catch(e =>
                console.error(`[${tenantId}] Error during client.destroy() after disconnect.`, e)
            );
        }
        delete sessions[tenantId];
        delete sessionTimers[tenantId];
    });

    client.on('change_state', (state) => {
        console.log(`[${tenantId}] State changed: ${state}`);
        updateSessionActivity(tenantId);
    });

    client.initialize().catch(err => {
        console.error(`[${tenantId}] Initialization failed.`, err);
        statuses[tenantId] = {
            status: 'error',
            message: 'Initialization failed.',
            error: err.message,
            timestamp: new Date().toISOString()
        };
    });

    sessions[tenantId] = client;
    statuses[tenantId] = {
        status: 'initializing',
        timestamp: new Date().toISOString()
    };

    return true;
};

/**
 * Cleans up a session by destroying the client, removing it from memory,
 * and optionally deleting session files.
 */
const cleanupSession = (tenantId, deleteFiles = false) => {
    console.log(`[${tenantId}] Cleaning up session...`);

    const client = sessions[tenantId];
    if (client) {
        client.logout().catch(err => {
            console.error(`[${tenantId}] Error during client.logout() in cleanup, destroying directly.`, err);
            client.destroy().catch(e =>
                console.error(`[${tenantId}] Error during client.destroy() in cleanup.`, e)
            );
        });
        delete sessions[tenantId];
    }

    // Clean up timers
    if (sessionTimers[tenantId]) {
        delete sessionTimers[tenantId];
    }

    // Optionally remove session files
    if (deleteFiles) {
        const sessionPath = path.join('./.wwebjs_auth', `session-${tenantId}`);
        if (fs.existsSync(sessionPath)) {
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(`[${tenantId}] Session files removed.`);
            } catch (err) {
                console.error(`[${tenantId}] Error removing session files.`, err);
            }
        }
    }

    statuses[tenantId] = {
        status: 'disconnected',
        timestamp: new Date().toISOString()
    };
    console.log(`[${tenantId}] Session cleaned up.`);
};

// Apply tenant ID validation to all session routes
app.use('/session/:tenantId/*', validateTenantIdMiddleware);

// Endpoint to get session info
app.get('/session/:tenantId/info', async (req, res) => {
    const { tenantId } = req.params;
    updateSessionActivity(tenantId);

    const client = sessions[tenantId];
    const statusInfo = statuses[tenantId];

    if (!client || !statusInfo || (statusInfo.status !== 'ready' && statusInfo.status !== 'authenticated')) {
        return res.status(409).json({
            success: false,
            status: statusInfo?.status || 'disconnected',
            message: 'Client is not ready.'
        });
    }

    try {
        if (client.info) {
            const info = {
                name: client.info.pushname,
                number: client.info.wid.user,
                platform: client.info.platform,
                connected: true
            };
            res.status(200).json({ success: true, info });
        } else {
            res.status(202).json({
                success: false,
                message: 'Client info not available yet. Please try again.'
            });
        }
    } catch (error) {
        console.error(`[${tenantId}] Failed to get client info.`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to get client info.',
            error: error.message
        });
    }
});

// Endpoint to get profile picture URL
app.get('/session/:tenantId/profile-pic', async (req, res) => {
    const { tenantId } = req.params;
    updateSessionActivity(tenantId);

    const client = sessions[tenantId];
    const statusInfo = statuses[tenantId];

    if (!client || !statusInfo || (statusInfo.status !== 'ready' && statusInfo.status !== 'authenticated')) {
        return res.status(409).json({
            success: false,
            status: statusInfo?.status || 'disconnected',
            message: 'Client is not ready.'
        });
    }

    try {
        if (client.info) {
            const picUrl = await client.getProfilePicUrl(client.info.wid._serialized);
            res.status(200).json({ success: true, url: picUrl });
        } else {
            res.status(202).json({
                success: false,
                message: 'Client info not available yet.'
            });
        }
    } catch (error) {
        console.error(`[${tenantId}] Failed to get profile picture.`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to get profile picture.',
            error: error.message
        });
    }
});

// Endpoint to initialize a session and get a QR code
app.get('/session/:tenantId/qr', (req, res) => {
    const { tenantId } = req.params;
    updateSessionActivity(tenantId);

    const statusInfo = statuses[tenantId];

    if (statusInfo && (statusInfo.status === 'ready' || statusInfo.status === 'authenticated')) {
        return res.status(200).json({
            success: true,
            status: 'authenticated',
            message: 'Client is already connected.'
        });
    }

    if (statusInfo && statusInfo.status === 'qr' && statusInfo.qr) {
        return res.status(200).json({
            success: true,
            status: 'qr',
            qr: statusInfo.qr
        });
    }

    if (statusInfo && statusInfo.status === 'initializing') {
        return res.status(202).json({
            success: true,
            status: 'initializing',
            message: 'Session is initializing. Please poll again shortly.'
        });
    }

    if (!statusInfo || ['disconnected', 'error'].includes(statusInfo.status)) {
        const created = createSession(tenantId);
        if (!created) {
            return res.status(503).json({
                success: false,
                status: 'error',
                message: 'Service is at capacity. Please try again later.'
            });
        }
        return res.status(202).json({
            success: true,
            status: 'initializing',
            message: 'Session is initializing. Please poll again shortly.'
        });
    }

    res.status(200).json({
        success: true,
        status: statusInfo.status,
        qr: statusInfo.qr,
        message: 'Current status.'
    });
});

// Endpoint to get the status of a session
app.get('/session/:tenantId/status', (req, res) => {
    const { tenantId } = req.params;
    updateSessionActivity(tenantId);

    const statusInfo = statuses[tenantId];
    const currentStatus = statusInfo?.status || 'disconnected';

    res.status(200).json({
        success: true,
        status: currentStatus,
        timestamp: statusInfo?.timestamp,
        message: statusInfo?.message
    });
});

// Endpoint to send a message
app.post('/session/:tenantId/send', async (req, res) => {
    const { tenantId } = req.params;
    const { number, message } = req.body;

    updateSessionActivity(tenantId);

    // Validate input
    if (!number || !message) {
        return res.status(400).json({
            success: false,
            message: 'The "number" and "message" fields are required.'
        });
    }

    if (typeof number !== 'string' || typeof message !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Number and message must be strings.'
        });
    }

    if (message.length > 4096) {
        return res.status(400).json({
            success: false,
            message: 'Message is too long. Maximum 4096 characters allowed.'
        });
    }

    const client = sessions[tenantId];
    const statusInfo = statuses[tenantId];

    if (!client || !statusInfo || statusInfo.status !== 'ready') {
        return res.status(409).json({
            success: false,
            status: statusInfo?.status || 'disconnected',
            message: 'Client is not ready. Cannot send message.'
        });
    }

    try {
        // Clean and validate phone number
        const cleanNumber = number.replace(/\D/g, '');
        if (cleanNumber.length < 10 || cleanNumber.length > 15) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number format.'
            });
        }

        const chatId = `${cleanNumber}@c.us`;
        await client.sendMessage(chatId, message);

        res.status(200).json({
            success: true,
            message: 'Message sent successfully.',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[${tenantId}] Failed to send message to ${number}.`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message.',
            error: error.message
        });
    }
});

// Endpoint to force reconnect a session
app.post('/session/:tenantId/reconnect', (req, res) => {
    const { tenantId } = req.params;
    console.log(`[${tenantId}] Received request to reconnect.`);

    updateSessionActivity(tenantId);
    cleanupSession(tenantId);

    const created = createSession(tenantId);
    if (!created) {
        return res.status(503).json({
            success: false,
            message: 'Service is at capacity. Please try again later.'
        });
    }

    res.status(200).json({
        success: true,
        message: 'Reconnection process initiated.',
        timestamp: new Date().toISOString()
    });
});

// Endpoint to log out a session
app.delete('/session/:tenantId/logout', async (req, res) => {
    const { tenantId } = req.params;
    console.log(`[${tenantId}] Received request to logout.`);

    cleanupSession(tenantId, true); // Delete files on logout

    res.status(200).json({
        success: true,
        message: 'Logout process initiated and session is being cleaned up.',
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        availableEndpoints: [
            'GET /health',
            'GET /info',
            'GET /session/:tenantId/status',
            'GET /session/:tenantId/qr',
            'GET /session/:tenantId/info',
            'GET /session/:tenantId/profile-pic',
            'POST /session/:tenantId/send',
            'POST /session/:tenantId/reconnect',
            'DELETE /session/:tenantId/logout'
        ]
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');

    // Clean up all sessions
    Object.keys(sessions).forEach(tenantId => {
        cleanupSession(tenantId);
    });

    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');

    // Clean up all sessions
    Object.keys(sessions).forEach(tenantId => {
        cleanupSession(tenantId);
    });

    process.exit(0);
});

// On startup, find all existing session files and attempt to reconnect
const authPath = './.wwebjs_auth';
if (fs.existsSync(authPath)) {
    fs.readdir(authPath, (err, files) => {
        if (err) {
            console.error('Could not list session files for reconnection.', err);
            return;
        }

        files.forEach(file => {
            if (file.startsWith('session-')) {
                const tenantId = file.substring(8);
                if (tenantId && validateTenantId(tenantId)) {
                    console.log(`[${tenantId}] Found existing session. Attempting to reconnect...`);
                    createSession(tenantId);
                }
            }
        });
    });
}

app.listen(PORT, () => {
    console.log(`WhatsApp service is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Service info: http://localhost:${PORT}/info`);
});

