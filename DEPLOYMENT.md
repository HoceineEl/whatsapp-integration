# Deployment Checklist

## Pre-Deployment

- [ ] Code is committed to GitHub
- [ ] All dependencies are listed in `package.json`
- [ ] Environment variables are configured
- [ ] README.md is updated with your service URL
- [ ] Test script works locally (`npm run test:local`)

## Railway Deployment Steps

1. **Prepare Repository**
   ```bash
   git add .
   git commit -m "feat: ready for production deployment"
   git push origin main
   ```

2. **Deploy to Railway**
   - [ ] Go to [railway.app](https://railway.app)
   - [ ] Sign up/login with GitHub
   - [ ] Click "Deploy from GitHub repo"
   - [ ] Select your repository
   - [ ] Wait for deployment to complete

3. **Configure Environment Variables**
   - [ ] Go to your project dashboard
   - [ ] Click "Variables" tab
   - [ ] Add these variables:
     ```
     NODE_ENV=production
     MAX_SESSIONS=50
     SESSION_TIMEOUT=300000
     ```

4. **Test Deployment**
   - [ ] Copy your Railway URL (e.g., `https://your-app.up.railway.app`)
   - [ ] Test health endpoint: `curl https://your-app.up.railway.app/health`
   - [ ] Run test script: `SERVICE_URL=https://your-app.up.railway.app npm test`

## Laravel Integration Setup

1. **Update Laravel Configuration**
   - [ ] Copy `WhatsAppService.php` to `app/Services/WhatsAppService.php`
   - [ ] Add WhatsApp config to `config/services.php` (see `config-example.php`)
   - [ ] Add environment variables to `.env`:
     ```
     WHATSAPP_SERVICE_URL=https://your-railway-app.up.railway.app
     WHATSAPP_SERVICE_TIMEOUT=30
     WHATSAPP_SERVICE_RETRY_ATTEMPTS=3
     WHATSAPP_SERVICE_RETRY_DELAY=1000
     ```

2. **Test Laravel Integration**
   - [ ] Create a test controller or route
   - [ ] Test health check: `$whatsapp->healthCheck()`
   - [ ] Test QR code generation: `$whatsapp->getQrCode($tenantId)`
   - [ ] Test message sending: `$whatsapp->sendMessage($tenantId, $number, $message)`

## Post-Deployment Verification

- [ ] Service is accessible at your Railway URL
- [ ] Health endpoint returns healthy status
- [ ] QR code generation works
- [ ] Session management works
- [ ] Laravel can communicate with the service
- [ ] Logs are visible in Railway dashboard

## Production Checklist

- [ ] Set up custom domain (optional)
- [ ] Configure SSL certificate (automatic on Railway)
- [ ] Set up monitoring/alerting
- [ ] Document your service URL for team
- [ ] Set up backup strategy for session data
- [ ] Configure log retention
- [ ] Set up rate limiting if needed

## URLs to Remember

- **Railway Dashboard**: https://railway.app/dashboard
- **Your Service URL**: `https://your-project-name-production.up.railway.app`
- **Health Check**: `https://your-project-name-production.up.railway.app/health`
- **Service Info**: `https://your-project-name-production.up.railway.app/info`

## Common Issues & Solutions

### Service Not Starting
- Check Railway logs for errors
- Verify `package.json` has correct start script
- Ensure Node.js version is compatible

### QR Code Not Working
- Wait 30-60 seconds after requesting
- Check session status endpoint
- Try reconnecting the session

### Laravel Can't Connect
- Verify `WHATSAPP_SERVICE_URL` in Laravel `.env`
- Check if service is healthy
- Verify network connectivity

### Memory Issues
- Reduce `MAX_SESSIONS` in Railway variables
- Monitor memory usage in Railway dashboard
- Consider upgrading Railway plan

---

**🚀 Your WhatsApp Integration Service is now live!**

Next steps:
1. Test with your Laravel application
2. Monitor logs and performance
3. Set up proper authentication for production use 