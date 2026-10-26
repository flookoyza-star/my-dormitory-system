require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');
const { sendBillToTenant, buildBillFlexMessage } = require('./services/lineService');
const { generatePromptPayDataUrl } = require('./services/promptpayService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to determine base public URL (handles Render / Cloud domains)
function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Dashboard summary
app.get('/api/dashboard', async (req, res) => {
  try {
    const rooms = await db.getRooms();
    const bills = await db.getBills();

    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
    const vacantRooms = rooms.filter(r => r.status === 'vacant').length;
    const maintenanceRooms = rooms.filter(r => r.status === 'maintenance').length;

    const currentMonth = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    
    // Revenue calculations
    let totalPendingAmount = 0;
    let totalPaidThisMonth = 0;
    let pendingBillsCount = 0;

    bills.forEach(bill => {
      if (bill.status === 'pending' || bill.status === 'overdue') {
        totalPendingAmount += Number(bill.totalAmount || 0);
        pendingBillsCount++;
      } else if (bill.status === 'paid') {
        totalPaidThisMonth += Number(bill.totalAmount || 0);
      }
    });

    res.json({
      success: true,
      data: {
        totalRooms,
        occupiedRooms,
        vacantRooms,
        maintenanceRooms,
        occupancyRate: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
        totalPendingAmount,
        totalPaidThisMonth,
        pendingBillsCount,
        currentMonth
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Rooms Endpoints
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await db.getRooms();
    res.json({ success: true, data: rooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const room = req.body;
    if (!room.number) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกเลขห้อง' });
    }
    const saved = await db.saveRoom(room);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/rooms/:number', async (req, res) => {
  try {
    await db.deleteRoom(req.params.number);
    res.json({ success: true, message: `ลบห้อง ${req.params.number} เรียบร้อย` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Billing & Calculation Endpoints
app.get('/api/bills', async (req, res) => {
  try {
    const bills = await db.getBills();
    res.json({ success: true, data: bills });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/bills/:id', async (req, res) => {
  try {
    const bill = await db.getBillById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, error: 'ไม่พบบิลนี้' });

    const settings = await db.getSettings();
    const room = await db.getRoomByNumber(bill.roomNumber);

    // Generate PromptPay QR
    let qrDataUrl = null;
    if (settings.promptpayId && bill.totalAmount > 0) {
      qrDataUrl = await generatePromptPayDataUrl(settings.promptpayId, bill.totalAmount);
    }

    res.json({
      success: true,
      data: {
        bill,
        room,
        settings,
        qrDataUrl
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bills', async (req, res) => {
  try {
    const data = req.body;
    const settings = await db.getSettings();
    const room = await db.getRoomByNumber(data.roomNumber);

    if (!room) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลห้องพักนี้' });
    }

    const electricRate = Number(data.electricRate) || Number(settings.electricRate) || 8;
    const waterRate = Number(data.waterRate) || Number(settings.waterRate) || 18;

    const prevElec = Number(data.prevElectricMeter || room.lastElectricMeter || 0);
    const currElec = Number(data.currElectricMeter || 0);
    const elecUnits = Math.max(0, currElec - prevElec);
    const electricAmount = Math.round(elecUnits * electricRate);

    const prevWater = Number(data.prevWaterMeter || room.lastWaterMeter || 0);
    const currWater = Number(data.currWaterMeter || 0);
    const waterUnits = Math.max(0, currWater - prevWater);
    const waterAmount = Math.round(waterUnits * waterRate);

    const rent = Number(data.rent || room.price || 0);
    const commonFee = Number(data.commonFee !== undefined ? data.commonFee : settings.commonFeeDefault || 0);
    const otherFee = Number(data.otherFee || 0);
    const discount = Number(data.discount || 0);

    const totalAmount = Math.max(0, rent + electricAmount + waterAmount + commonFee + otherFee - discount);

    const monthStr = data.month || new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const billId = data.id || `BILL-${Date.now().toString().slice(-6)}-${data.roomNumber}`;

    const newBill = {
      id: billId,
      roomNumber: String(data.roomNumber),
      month: monthStr,
      createdAt: new Date().toISOString(),
      dueDate: data.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      rent,
      prevElectricMeter: prevElec,
      currElectricMeter: currElec,
      electricUnits: elecUnits,
      electricRate,
      electricAmount,
      prevWaterMeter: prevWater,
      currWaterMeter: currWater,
      waterUnits,
      waterRate,
      waterAmount,
      commonFee,
      otherFee,
      otherFeeRemark: data.otherFeeRemark || '',
      discount,
      totalAmount,
      status: data.status || 'pending',
      lineSent: false,
      lineSentAt: null
    };

    const saved = await db.saveBill(newBill);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/bills/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const paidAt = status === 'paid' ? new Date().toISOString() : null;
    const updated = await db.updateBillStatus(req.params.id, status, paidAt);
    if (!updated) return res.status(404).json({ success: false, error: 'ไม่พบบิล' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/bills/:id', async (req, res) => {
  try {
    await db.deleteBill(req.params.id);
    res.json({ success: true, message: 'ลบบิลเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Send LINE Notification (Flex Message Bill)
app.post('/api/bills/:id/send-line', async (req, res) => {
  try {
    const bill = await db.getBillById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, error: 'ไม่พบบิล' });

    const room = await db.getRoomByNumber(bill.roomNumber);
    if (!room || !room.tenant || !room.tenant.lineUserId) {
      return res.status(400).json({
        success: false,
        error: `ห้อง ${bill.roomNumber} ยังไม่มี LINE User ID ของผู้เช่า! กรุณาระบุในข้อมูลห้องพักก่อน`
      });
    }

    const settings = await db.getSettings();
    const token = settings.lineToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'ยังไม่ได้ระบุ LINE Channel Access Token ในการตั้งค่าระบบ'
      });
    }

    const baseUrl = getBaseUrl(req);
    await sendBillToTenant(token, room.tenant.lineUserId, settings, bill, baseUrl);

    // Update bill LINE status
    bill.lineSent = true;
    bill.lineSentAt = new Date().toISOString();
    await db.saveBill(bill);

    res.json({
      success: true,
      message: `ส่งบิลห้อง ${bill.roomNumber} เข้า LINE สำเร็จเรียบร้อย!`
    });
  } catch (err) {
    console.error('Send LINE error:', err);
    res.status(500).json({
      success: false,
      error: `ส่ง LINE ล้มเหลว: ${err.message}`
    });
  }
});

// Batch Send LINE for all pending bills
app.post('/api/bills/batch-send-line', async (req, res) => {
  try {
    const bills = await db.getBills();
    const rooms = await db.getRooms();
    const settings = await db.getSettings();
    const token = settings.lineToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'ยังไม่ได้ระบุ LINE Channel Access Token ในการตั้งค่าระบบ'
      });
    }

    const baseUrl = getBaseUrl(req);
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const bill of bills) {
      if (bill.status !== 'paid') {
        const room = rooms.find(r => r.number === bill.roomNumber);
        if (room?.tenant?.lineUserId) {
          try {
            await sendBillToTenant(token, room.tenant.lineUserId, settings, bill, baseUrl);
            bill.lineSent = true;
            bill.lineSentAt = new Date().toISOString();
            await db.saveBill(bill);
            sentCount++;
          } catch (e) {
            failedCount++;
            errors.push(`ห้อง ${bill.roomNumber}: ${e.message}`);
          }
        }
      }
    }

    res.json({
      success: true,
      message: `ส่งบิลสำเร็จ ${sentCount} ห้อง, ไม่สำเร็จ/ไม่มี LINE ID ${failedCount} ห้อง`,
      details: { sentCount, failedCount, errors }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Settings Endpoints
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const updated = await db.saveSettings(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Webhook for LINE Bot (Auto-detects tenant User ID)
app.post('/api/webhook/line', async (req, res) => {
  // Always reply 200 OK to LINE Webhook quickly
  res.status(200).send('OK');

  const events = req.body.events;
  if (!events || !events.length) return;

  const settings = await db.getSettings();
  const token = settings.lineToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;

  const line = require('@line/bot-sdk');
  const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: token });

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userText = event.message.text.trim();
      const userId = event.source.userId;

      // When a user texts the bot, it tells them their User ID and instructions
      let replyText = `สวัสดีครับ/ค่ะ!\n\n🔑 LINE User ID ของคุณคือ:\n${userId}\n\n👉 สามารถคัดลอกรหัสนี้แจ้งเจ้าของหอพัก เพื่อเปิดรับบิลค่าเช่าห้องพักอัตโนมัติได้ทันทีครับ`;

      if (userText.toLowerCase().includes('บิล') || userText.includes('ห้อง')) {
        replyText += `\n\nระบบจะส่งบิลเข้า LINE ของท่านอัตโนมัติเมื่อเจ้าของหอพักออกบิลประจำเดือนครับ`;
      }

      try {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: replyText }]
        });
      } catch (err) {
        console.error('LINE Reply Error:', err.message);
      }
    }
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
async function startServer() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` Dormitory Management System is RUNNING!`);
    console.log(` Local URL: http://localhost:${PORT}`);
    console.log(` Mode: ${db.isPostgres ? 'PostgreSQL (Cloud Database)' : 'Local File JSON Database'}`);
    console.log(`=======================================================`);
  });
}

startServer();

