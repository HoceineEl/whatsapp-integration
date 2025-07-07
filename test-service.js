const axios = require('axios');

// Configuration
const SERVICE_URL = (process.env.SERVICE_URL || 'http://localhost:3000').replace(/\/$/, ''); // Remove trailing slash
const TENANT_ID = process.env.TENANT_ID || 'test-tenant-1';

async function testService() {
    console.log('🧪 Testing WhatsApp Integration Service...\n');
    console.log(`Service URL: ${SERVICE_URL}`);
    console.log(`Tenant ID: ${TENANT_ID}\n`);

    try {
        // Test 1: Health Check
        console.log('1️⃣ Testing health check...');
        const healthResponse = await axios.get(`${SERVICE_URL}/health`);
        console.log('✅ Health check passed:', healthResponse.data);
        console.log('');

        // Test 2: Service Info
        console.log('2️⃣ Testing service info...');
        const infoResponse = await axios.get(`${SERVICE_URL}/info`);
        console.log('✅ Service info:', infoResponse.data);
        console.log('');

        // Test 3: Session Status
        console.log('3️⃣ Testing session status...');
        const statusResponse = await axios.get(`${SERVICE_URL}/session/${TENANT_ID}/status`);
        console.log('✅ Session status:', statusResponse.data);
        console.log('');

        // Test 4: QR Code Generation
        console.log('4️⃣ Testing QR code generation...');
        const qrResponse = await axios.get(`${SERVICE_URL}/session/${TENANT_ID}/qr`);
        console.log('✅ QR code response:', {
            success: qrResponse.data.success,
            status: qrResponse.data.status,
            hasQR: !!qrResponse.data.qr
        });
        console.log('');

        // Test 5: Invalid Endpoint
        console.log('5️⃣ Testing invalid endpoint (should return 404)...');
        try {
            await axios.get(`${SERVICE_URL}/invalid-endpoint`);
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('✅ 404 handling works correctly');
            } else {
                console.log('❌ Unexpected error:', error.response?.status);
            }
        }
        console.log('');

        // Test 6: Send Message (will fail without ready session)
        console.log('6️⃣ Testing message sending (without ready session)...');
        try {
            const messageResponse = await axios.post(`${SERVICE_URL}/session/${TENANT_ID}/send`, {
                number: '1234567890',
                message: 'Test message'
            });
            console.log('✅ Message response:', messageResponse.data);
        } catch (error) {
            if (error.response?.status === 409) {
                console.log('✅ Correctly rejected message (session not ready)');
            } else {
                console.log('❌ Unexpected error:', error.response?.data);
            }
        }
        console.log('');

        console.log('🎉 All tests completed successfully!');
        console.log('📱 To use the service:');
        console.log(`   1. Get QR code: GET ${SERVICE_URL}/session/${TENANT_ID}/qr`);
        console.log(`   2. Scan QR code with WhatsApp`);
        console.log(`   3. Send message: POST ${SERVICE_URL}/session/${TENANT_ID}/send`);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        process.exit(1);
    }
}

// Run tests
testService(); 