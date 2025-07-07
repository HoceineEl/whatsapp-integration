# WhatsApp Integration Service

A robust, production-ready WhatsApp messaging microservice built with Node.js and whatsapp-web.js. Designed for multi-tenant SaaS applications with Laravel backend integration.

## Features

- 🚀 **Multi-tenant support** - Handle multiple WhatsApp sessions simultaneously
- 🔄 **Always-on service** - Runs 24/7 with automatic session management
- 🛡️ **Production-ready** - Built with error handling, logging, and monitoring
- 📱 **QR Code generation** - Easy WhatsApp Web authentication
- 💬 **Message sending** - Send individual and bulk messages
- 🔍 **Health monitoring** - Built-in health checks and service info
- 🌐 **CORS support** - Ready for cross-origin requests
- ⚡ **Caching** - Optimized with intelligent caching strategies
- 🔧 **Configurable** - Environment-based configuration

## Quick Start

### 1. Deploy to Railway (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "initial commit"
   git push origin main
   ```

2. **Deploy to Railway**:
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub
   - Click "Deploy from GitHub repo"
   - Select this repository
   - Railway will automatically detect and deploy your Node.js app

3. **Your service will be available at**: `https://your-project-name-production.up.railway.app`

### 2. Alternative Deployment Options

- **Render**: [render.com](https://render.com)
- **Fly.io**: [fly.io](https://fly.io)
- **Koyeb**: [koyeb.com](https://koyeb.com)
- **Hostinger VPS**: See VPS deployment guide below

## Environment Configuration

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Session Management
MAX_SESSIONS=50
SESSION_TIMEOUT=300000

# Service Configuration
SERVICE_NAME=whatsapp-integration-service
SERVICE_VERSION=1.0.0

# Logging
LOG_LEVEL=info
```

## API Endpoints

### Health & Info
- `GET /health` - Service health check
- `GET /info` - Service information and available endpoints

### Session Management
- `GET /session/:tenantId/status` - Get session status
- `GET /session/:tenantId/qr` - Get QR code for authentication
- `GET /session/:tenantId/info` - Get session info (name, number)
- `GET /session/:tenantId/profile-pic` - Get profile picture URL
- `POST /session/:tenantId/reconnect` - Reconnect session
- `DELETE /session/:tenantId/logout` - Logout and cleanup session

### Messaging
- `POST /session/:tenantId/send` - Send a message

#### Send Message Example
```bash
curl -X POST https://your-service-url/session/1/send \
  -H "Content-Type: application/json" \
  -d '{
    "number": "1234567890",
    "message": "Hello from WhatsApp Integration Service!"
  }'
```

## Laravel Integration

### 1. Install the Service Class

Copy the `WhatsAppService.php` to your Laravel project:
```bash
cp WhatsAppService.php app/Services/WhatsAppService.php
```

### 2. Configure Laravel

Add to your `config/services.php`:

```php
'whatsapp' => [
    'url' => env('WHATSAPP_SERVICE_URL', 'https://your-railway-app.up.railway.app'),
    'timeout' => env('WHATSAPP_SERVICE_TIMEOUT', 30),
    'retry_attempts' => env('WHATSAPP_SERVICE_RETRY_ATTEMPTS', 3),
    'retry_delay' => env('WHATSAPP_SERVICE_RETRY_DELAY', 1000),
],
```

Add to your `.env`:
```env
WHATSAPP_SERVICE_URL=https://your-railway-app.up.railway.app
WHATSAPP_SERVICE_TIMEOUT=30
WHATSAPP_SERVICE_RETRY_ATTEMPTS=3
WHATSAPP_SERVICE_RETRY_DELAY=1000
```

### 3. Use in Your Laravel Application

```php
use App\Services\WhatsAppService;

class MessageController extends Controller
{
    public function __construct(
        private WhatsAppService $whatsapp
    ) {}

    public function sendMessage(Request $request)
    {
        $tenantId = auth()->user()->tenant_id;
        
        // Check if service is healthy
        $health = $this->whatsapp->healthCheck();
        if (!$health['service_available']) {
            return response()->json(['error' => 'WhatsApp service unavailable'], 503);
        }

        // Send message
        $result = $this->whatsapp->sendMessage(
            $tenantId,
            $request->number,
            $request->message
        );

        return response()->json($result);
    }

    public function getQrCode(Request $request)
    {
        $tenantId = auth()->user()->tenant_id;
        
        $result = $this->whatsapp->getQrCode($tenantId);
        
        return response()->json($result);
    }

    public function getStatus(Request $request)
    {
        $tenantId = auth()->user()->tenant_id;
        
        $result = $this->whatsapp->getStatus($tenantId);
        
        return response()->json($result);
    }
}
```

## Production Deployment

### Railway Deployment (Recommended)

1. **Environment Variables** (set in Railway dashboard):
   ```
   NODE_ENV=production
   MAX_SESSIONS=50
   SESSION_TIMEOUT=300000
   ```

2. **Automatic Features**:
   - ✅ Always-on (24/7)
   - ✅ Auto-restart on crash
   - ✅ Auto-deploy on git push
   - ✅ HTTPS included
   - ✅ Monitoring & logs

### VPS Deployment (Hostinger/DigitalOcean)

1. **Install dependencies**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   npm install -g pm2
   ```

2. **Deploy your app**:
   ```bash
   git clone your-repo-url
   cd whatsapp-integration
   npm install --production
   ```

3. **Start with PM2**:
   ```bash
   pm2 start index.js --name "whatsapp-service"
   pm2 startup
   pm2 save
   ```

4. **Set up reverse proxy** (Nginx):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## Monitoring & Maintenance

### Health Checks
```bash
# Check service health
curl https://your-service-url/health

# Get service info
curl https://your-service-url/info
```

### Logs (Railway)
- View in Railway dashboard → Deployments → Logs

### Logs (VPS with PM2)
```bash
pm2 logs whatsapp-service
pm2 monit
```

## Security Considerations

1. **Rate Limiting**: Implement rate limiting for production use
2. **Authentication**: Add API key authentication if needed
3. **CORS**: Configure CORS for your specific domains
4. **Firewall**: Restrict access to your VPS if using one

## Troubleshooting

### Common Issues

1. **Service not starting**:
   - Check logs for errors
   - Verify Node.js version (>=18.0.0)
   - Check environment variables

2. **QR code not generating**:
   - Wait 30-60 seconds after requesting
   - Check if session is initializing
   - Try reconnecting the session

3. **Messages not sending**:
   - Verify session status is "ready"
   - Check phone number format
   - Ensure WhatsApp Web is connected

4. **Memory issues**:
   - Increase server memory
   - Reduce MAX_SESSIONS
   - Monitor with health endpoint

### Debug Mode
Set `LOG_LEVEL=debug` in your environment variables for detailed logging.

## Support

For issues and questions:
1. Check the logs first
2. Verify your configuration
3. Test with the health endpoint
4. Check Railway/VPS service status

## License

ISC License - See LICENSE file for details.

---

**🚀 Your WhatsApp Integration Service is now ready for production!**

Test it with: `curl https://your-service-url/health` 