/**
 * Database Layer for Dormitory Management System
 * Supports:
 * 1. PostgreSQL (When DATABASE_URL is set - recommended for Free Cloud Hosting like Supabase / Render)
 * 2. Pure JSON File DB (When running locally - zero compilation required, works 100% on any Windows/Mac/Linux)
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '../data');
const JSON_DB_PATH = path.join(DATA_DIR, 'dormitory_data.json');

const isPostgres = !!process.env.DATABASE_URL;
let pgPool = null;

if (isPostgres) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

// Initial default state
const initialData = {
  settings: {
    dormName: process.env.DORM_NAME || 'หอพักสุขสบาย (Suk-Sabai Residence)',
    dormAddress: process.env.DORM_ADDRESS || '123 ซอยสุขุมวิท กรุงเทพมหานคร',
    dormPhone: process.env.DORM_PHONE || '081-234-5678',
    promptpayId: process.env.PROMPTPAY_ID || '0812345678',
    promptpayName: 'นายสมชาย ผู้ดูแลหอ',
    electricRate: Number(process.env.ELECTRIC_RATE) || 8,
    waterRate: Number(process.env.WATER_RATE) || 18,
    commonFeeDefault: 300,
    lineToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
  },
  rooms: [
    {
      id: "101",
      number: "101",
      floor: 1,
      type: "แอร์ (Air Conditioner)",
      price: 4500,
      status: "occupied", // occupied, vacant, maintenance
      tenant: {
        name: "สมชาย รักสงบ",
        phone: "089-111-2233",
        lineUserId: "", // LINE User ID from tenant
        startDate: "2025-01-01"
      },
      lastElectricMeter: 1250,
      lastWaterMeter: 340
    },
    {
      id: "102",
      number: "102",
      floor: 1,
      type: "พัดลม (Fan Room)",
      price: 3200,
      status: "occupied",
      tenant: {
        name: "วิภา สดใส",
        phone: "086-555-7788",
        lineUserId: "",
        startDate: "2025-02-15"
      },
      lastElectricMeter: 890,
      lastWaterMeter: 210
    },
    {
      id: "103",
      number: "103",
      floor: 1,
      type: "แอร์ (Air Conditioner)",
      price: 4500,
      status: "vacant",
      tenant: null,
      lastElectricMeter: 500,
      lastWaterMeter: 100
    },
    {
      id: "201",
      number: "201",
      floor: 2,
      type: "แอร์ VIP (Balcony)",
      price: 5200,
      status: "occupied",
      tenant: {
        name: "อรรถพล ก้าวหน้า",
        phone: "091-888-9900",
        lineUserId: "",
        startDate: "2024-11-01"
      },
      lastElectricMeter: 2100,
      lastWaterMeter: 450
    },
    {
      id: "202",
      number: "202",
      floor: 2,
      type: "แอร์ (Air Conditioner)",
      price: 4500,
      status: "vacant",
      tenant: null,
      lastElectricMeter: 1420,
      lastWaterMeter: 310
    }
  ],
  bills: [
    {
      id: "BILL-2025-02-101",
      roomNumber: "101",
      month: "กุมภาพันธ์ 2025",
      createdAt: "2025-02-25T10:00:00Z",
      dueDate: "2025-03-05",
      rent: 4500,
      prevElectricMeter: 1200,
      currElectricMeter: 1250,
      electricUnits: 50,
      electricRate: 8,
      electricAmount: 400,
      prevWaterMeter: 330,
      currWaterMeter: 340,
      waterUnits: 10,
      waterRate: 18,
      waterAmount: 180,
      commonFee: 300,
      otherFee: 0,
      otherFeeRemark: "",
      discount: 0,
      totalAmount: 5380,
      status: "paid", // pending, paid, overdue
      paidAt: "2025-02-28T14:30:00Z",
      slipUrl: "",
      lineSent: true,
      lineSentAt: "2025-02-25T10:05:00Z"
    }
  ]
};

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Local JSON helper
function loadLocalData() {
  try {
    if (!fs.existsSync(JSON_DB_PATH)) {
      saveLocalData(initialData);
      return initialData;
    }
    const raw = fs.readFileSync(JSON_DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading JSON DB, fallback to initial:', err.message);
    return initialData;
  }
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing JSON DB:', err.message);
  }
}

// Database API Methods
const db = {
  isPostgres,
  
  async init() {
    if (isPostgres) {
      console.log('Connecting to PostgreSQL Cloud Database...');
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS dorm_store (
          key VARCHAR(50) PRIMARY KEY,
          data JSONB NOT NULL
        );
      `);
      // Check if data already exists
      const res = await pgPool.query(`SELECT data FROM dorm_store WHERE key = 'app_data'`);
      if (res.rows.length === 0) {
        await pgPool.query(`INSERT INTO dorm_store (key, data) VALUES ('app_data', $1)`, [JSON.stringify(initialData)]);
        console.log('PostgreSQL initialized with default schema and sample rooms!');
      } else {
        console.log('PostgreSQL ready with existing data.');
      }
    } else {
      console.log('Using Local JSON Database at:', JSON_DB_PATH);
      if (!fs.existsSync(JSON_DB_PATH)) {
        saveLocalData(initialData);
      }
    }
  },

  async getAllData() {
    if (isPostgres) {
      const res = await pgPool.query(`SELECT data FROM dorm_store WHERE key = 'app_data'`);
      return res.rows[0]?.data || initialData;
    } else {
      return loadLocalData();
    }
  },

  async saveData(fullData) {
    if (isPostgres) {
      await pgPool.query(`UPDATE dorm_store SET data = $1 WHERE key = 'app_data'`, [JSON.stringify(fullData)]);
    } else {
      saveLocalData(fullData);
    }
  },

  // Rooms
  async getRooms() {
    const data = await this.getAllData();
    return data.rooms || [];
  },

  async getRoomByNumber(roomNumber) {
    const rooms = await this.getRooms();
    return rooms.find(r => r.number === String(roomNumber));
  },

  async saveRoom(room) {
    const data = await this.getAllData();
    const index = data.rooms.findIndex(r => r.number === String(room.number));
    if (index >= 0) {
      data.rooms[index] = { ...data.rooms[index], ...room };
    } else {
      room.id = room.number;
      data.rooms.push(room);
    }
    await this.saveData(data);
    return room;
  },

  async deleteRoom(roomNumber) {
    const data = await this.getAllData();
    data.rooms = data.rooms.filter(r => r.number !== String(roomNumber));
    await this.saveData(data);
    return true;
  },

  // Bills
  async getBills() {
    const data = await this.getAllData();
    return data.bills || [];
  },

  async getBillById(id) {
    const bills = await this.getBills();
    return bills.find(b => b.id === id);
  },

  async saveBill(bill) {
    const data = await this.getAllData();
    const index = data.bills.findIndex(b => b.id === bill.id);
    if (index >= 0) {
      data.bills[index] = { ...data.bills[index], ...bill };
    } else {
      data.bills.unshift(bill);
    }

    // Automatically update the room's last known meter readings
    const room = data.rooms.find(r => r.number === bill.roomNumber);
    if (room) {
      if (bill.currElectricMeter !== undefined) room.lastElectricMeter = bill.currElectricMeter;
      if (bill.currWaterMeter !== undefined) room.lastWaterMeter = bill.currWaterMeter;
    }

    await this.saveData(data);
    return bill;
  },

  async updateBillStatus(id, status, paidAt = null) {
    const data = await this.getAllData();
    const bill = data.bills.find(b => b.id === id);
    if (bill) {
      bill.status = status;
      if (paidAt) bill.paidAt = paidAt;
      await this.saveData(data);
      return bill;
    }
    return null;
  },

  async deleteBill(id) {
    const data = await this.getAllData();
    data.bills = data.bills.filter(b => b.id !== id);
    await this.saveData(data);
    return true;
  },

  // Settings
  async getSettings() {
    const data = await this.getAllData();
    return data.settings || {};
  },

  async saveSettings(newSettings) {
    const data = await this.getAllData();
    data.settings = { ...data.settings, ...newSettings };
    await this.saveData(data);
    return data.settings;
  }
};

module.exports = db;

