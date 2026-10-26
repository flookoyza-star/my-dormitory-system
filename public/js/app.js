// State management
let state = {
  rooms: [],
  bills: [],
  settings: {},
  currentTab: 'dashboard',
  editingRoomId: null
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadDashboard();
  await loadRooms();
  await loadBills();
  setupBillingMonthDefaults();
  lucide.createIcons();
});

// Setup default month string (เช่น มีนาคม 2025)
function setupBillingMonthDefaults() {
  const now = new Date();
  const thMonth = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const meterMonthInput = document.getElementById('meterBillingMonth');
  if (meterMonthInput) meterMonthInput.value = thMonth;

  const billMonthInput = document.getElementById('formBillMonth');
  if (billMonthInput) billMonthInput.value = thMonth;

  const dueDateInput = document.getElementById('formBillDueDate');
  if (dueDateInput) {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    dueDateInput.value = due.toISOString().split('T')[0];
  }
}

// Tab Switching
function switchTab(tabId) {
  state.currentTab = tabId;
  const tabs = ['dashboard', 'rooms', 'meter', 'bills', 'settings'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const navBtn = document.getElementById(`nav-${t}`);
    if (el) el.classList.add('hidden');
    if (navBtn) {
      navBtn.classList.remove('bg-blue-600', 'text-white');
      navBtn.classList.add('text-slate-300', 'hover:bg-slate-800');
    }
  });

  const activeEl = document.getElementById(`tab-${tabId}`);
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeEl) activeEl.classList.remove('hidden');
  if (activeNav) {
    activeNav.classList.add('bg-blue-600', 'text-white');
    activeNav.classList.remove('text-slate-300', 'hover:bg-slate-800');
  }

  // Update title
  const titles = {
    dashboard: ['ภาพรวมหอพัก', 'สถิติห้องพัก ยอดค้างชำระ และข้อมูลล่าสุด'],
    rooms: ['จัดการห้องพัก & ข้อมูลผู้เช่า', 'เพิ่ม แก้ไข ลบข้อมูลห้องพักและรายละเอียดผู้เช่า'],
    meter: ['จดมิเตอร์น้ำ - ไฟ', 'บันทึกหน่วยน้ำไฟประจำเดือน และสร้างบิลอัตโนมัติ'],
    bills: ['ออกบิล & ส่งการแจ้งเตือน LINE', 'รายการใบแจ้งหนี้ ตรวจสอบการชำระ และส่ง Flex Message เข้า LINE'],
    settings: ['ตั้งค่าหอพัก & ระบบ LINE Bot', 'กำหนดราคาค่าน้ำ ค่าไฟ และเชื่อมต่อ LINE Messaging API']
  };

  document.getElementById('pageTitle').innerText = titles[tabId][0];
  document.getElementById('pageSubtitle').innerText = titles[tabId][1];

  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'rooms') renderRoomsTable();
  if (tabId === 'meter') renderMeterTable();
  if (tabId === 'bills') renderBillsTable();

  setTimeout(() => lucide.createIcons(), 50);
}

// ----------------------------------------------------
// 1. DASHBOARD
// ----------------------------------------------------
async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    const result = await res.json();
    if (result.success) {
      const d = result.data;
      document.getElementById('statTotalRooms').innerText = `${d.totalRooms} ห้อง`;
      document.getElementById('statOccupancyRate').innerText = `มีผู้เช่า ${d.occupancyRate}%`;
      document.getElementById('statOccupiedRooms').innerText = `${d.occupiedRooms} ห้อง`;
      document.getElementById('statVacantRooms').innerText = `${d.vacantRooms} ห้อง`;
      document.getElementById('statPendingAmount').innerText = `${d.totalPendingAmount.toLocaleString()} ฿`;
      document.getElementById('statPendingCount').innerText = d.pendingBillsCount;
      document.getElementById('statPaidAmount').innerText = `${d.totalPaidThisMonth.toLocaleString()} ฿`;
      document.getElementById('statMonthLabel').innerText = `รอบ: ${d.currentMonth}`;

      renderQuickRoomGrid();
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

function renderQuickRoomGrid() {
  const container = document.getElementById('quickRoomGrid');
  if (!container) return;

  container.innerHTML = state.rooms.map(room => {
    let colorClass = 'bg-emerald-50 border-emerald-300 text-emerald-800';
    let statusText = 'มีผู้เช่า';
    if (room.status === 'vacant') {
      colorClass = 'bg-slate-50 border-slate-200 text-slate-500';
      statusText = 'ห้องว่าง';
    } else if (room.status === 'maintenance') {
      colorClass = 'bg-amber-50 border-amber-300 text-amber-800';
      statusText = 'ซ่อมบำรุง';
    }

    return `
      <div class="border rounded-xl p-3 flex flex-col justify-between transition hover:shadow-md cursor-pointer ${colorClass}" onclick="openEditRoomModal('${room.number}')">
        <div class="flex items-center justify-between">
          <span class="font-bold text-base">ห้อง ${room.number}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/70">${statusText}</span>
        </div>
        <div class="mt-2 text-xs">
          <p class="font-semibold text-slate-700">${room.tenant ? room.tenant.name : '—'}</p>
          <p class="text-[11px] opacity-75">${Number(room.price).toLocaleString()} ฿/ด.</p>
        </div>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------
// 2. ROOMS MANAGEMENT
// ----------------------------------------------------
async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    const result = await res.json();
    if (result.success) {
      state.rooms = result.data;
      renderRoomsTable();
      renderQuickRoomGrid();
    }
  } catch (err) {
    console.error('Failed to load rooms:', err);
  }
}

function renderRoomsTable() {
  const tbody = document.getElementById('roomsTableBody');
  if (!tbody) return;

  const search = (document.getElementById('roomSearchInput')?.value || '').toLowerCase();
  const filter = document.getElementById('roomStatusFilter')?.value || 'all';

  const filtered = state.rooms.filter(room => {
    const matchSearch = room.number.toLowerCase().includes(search) ||
      (room.tenant && room.tenant.name.toLowerCase().includes(search));
    const matchStatus = filter === 'all' || room.status === filter;
    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">ไม่พบห้องพักตามเงื่อนไข</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(room => {
    let badge = `<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">มีผู้เช่า</span>`;
    if (room.status === 'vacant') badge = `<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">ว่าง</span>`;
    if (room.status === 'maintenance') badge = `<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">ซ่อมบำรุง</span>`;

    const tenant = room.tenant || {};
    const lineBadge = tenant.lineUserId 
      ? `<span class="font-mono text-[10px] text-emerald-600 font-medium truncate max-w-[120px] block" title="${tenant.lineUserId}">✓ เชื่อมแล้ว (${tenant.lineUserId.slice(0, 8)}...)</span>`
      : `<span class="text-[11px] text-slate-400">ยังไม่ระบุ</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-bold text-slate-800">ห้อง ${room.number}</td>
        <td class="px-6 py-4">${room.type || 'มาตรฐาน'} (ชั้น ${room.floor || 1})</td>
        <td class="px-6 py-4 font-semibold text-slate-700">${Number(room.price).toLocaleString()} ฿</td>
        <td class="px-6 py-4">${badge}</td>
        <td class="px-6 py-4 font-medium text-slate-800">${tenant.name || '—'}</td>
        <td class="px-6 py-4 text-xs">${tenant.phone || '—'}</td>
        <td class="px-6 py-4">${lineBadge}</td>
        <td class="px-6 py-4 text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="openEditRoomModal('${room.number}')" class="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition" title="แก้ไข">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteRoom('${room.number}')" class="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition" title="ลบ">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function openAddRoomModal() {
  state.editingRoomId = null;
  document.getElementById('roomModalTitle').innerText = 'เพิ่มห้องพักใหม่';
  document.getElementById('formRoomNumber').value = '';
  document.getElementById('formRoomNumber').disabled = false;
  document.getElementById('formRoomFloor').value = '1';
  document.getElementById('formRoomType').value = 'แอร์';
  document.getElementById('formRoomPrice').value = '4500';
  document.getElementById('formRoomStatus').value = 'occupied';
  document.getElementById('formTenantName').value = '';
  document.getElementById('formTenantPhone').value = '';
  document.getElementById('formTenantLineId').value = '';
  document.getElementById('formLastElecMeter').value = '0';
  document.getElementById('formLastWaterMeter').value = '0';
  toggleTenantFields();
  document.getElementById('roomModal').classList.remove('hidden');
}

function openEditRoomModal(roomNumber) {
  const room = state.rooms.find(r => r.number === String(roomNumber));
  if (!room) return;

  state.editingRoomId = room.number;
  document.getElementById('roomModalTitle').innerText = `แก้ไขห้อง ${room.number}`;
  document.getElementById('formRoomNumber').value = room.number;
  document.getElementById('formRoomNumber').disabled = true;
  document.getElementById('formRoomFloor').value = room.floor || 1;
  document.getElementById('formRoomType').value = room.type || '';
  document.getElementById('formRoomPrice').value = room.price || '';
  document.getElementById('formRoomStatus').value = room.status || 'occupied';

  const tenant = room.tenant || {};
  document.getElementById('formTenantName').value = tenant.name || '';
  document.getElementById('formTenantPhone').value = tenant.phone || '';
  document.getElementById('formTenantLineId').value = tenant.lineUserId || '';
  document.getElementById('formLastElecMeter').value = room.lastElectricMeter || 0;
  document.getElementById('formLastWaterMeter').value = room.lastWaterMeter || 0;

  toggleTenantFields();
  document.getElementById('roomModal').classList.remove('hidden');
}

function toggleTenantFields() {
  const status = document.getElementById('formRoomStatus').value;
  const tenantBox = document.getElementById('tenantFields');
  if (status === 'vacant') {
    tenantBox.classList.add('opacity-40', 'pointer-events-none');
  } else {
    tenantBox.classList.remove('opacity-40', 'pointer-events-none');
  }
}

function closeRoomModal() {
  document.getElementById('roomModal').classList.add('hidden');
}

async function saveRoomForm(e) {
  e.preventDefault();
  const number = document.getElementById('formRoomNumber').value.trim();
  const floor = Number(document.getElementById('formRoomFloor').value);
  const type = document.getElementById('formRoomType').value.trim();
  const price = Number(document.getElementById('formRoomPrice').value);
  const status = document.getElementById('formRoomStatus').value;

  const tenantName = document.getElementById('formTenantName').value.trim();
  const tenantPhone = document.getElementById('formTenantPhone').value.trim();
  const tenantLineId = document.getElementById('formTenantLineId').value.trim();

  const lastElectricMeter = Number(document.getElementById('formLastElecMeter').value || 0);
  const lastWaterMeter = Number(document.getElementById('formLastWaterMeter').value || 0);

  const roomData = {
    number,
    floor,
    type,
    price,
    status,
    tenant: status === 'occupied' ? {
      name: tenantName,
      phone: tenantPhone,
      lineUserId: tenantLineId
    } : null,
    lastElectricMeter,
    lastWaterMeter
  };

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    const result = await res.json();
    if (result.success) {
      closeRoomModal();
      await loadRooms();
      await loadDashboard();
      alert('บันทึกข้อมูลห้องพักเรียบร้อย!');
    } else {
      alert(`ผิดพลาด: ${result.error}`);
    }
  } catch (err) {
    alert(`เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message}`);
  }
}

async function deleteRoom(roomNumber) {
  if (!confirm(`คุณแน่ใจว่าต้องการลบห้อง ${roomNumber} หรือไม่?`)) return;
  try {
    const res = await fetch(`/api/rooms/${roomNumber}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      await loadRooms();
      await loadDashboard();
    } else {
      alert(result.error);
    }
  } catch (err) {
    alert(err.message);
  }
}

// ----------------------------------------------------
// 3. METER RECORDING & QUICK BILL
// ----------------------------------------------------
function renderMeterTable() {
  const tbody = document.getElementById('meterEntryTableBody');
  if (!tbody) return;

  const occupiedRooms = state.rooms.filter(r => r.status === 'occupied');
  if (occupiedRooms.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">ยังไม่มีห้องที่มีผู้เช่า</td></tr>`;
    return;
  }

  tbody.innerHTML = occupiedRooms.map(room => {
    return `
      <tr id="meter-row-${room.number}" class="hover:bg-slate-50">
        <td class="px-4 py-3 font-bold text-slate-800">ห้อง ${room.number}</td>
        <td class="px-4 py-3 text-xs font-medium text-slate-700">${room.tenant?.name || '—'}</td>
        <td class="px-4 py-3">
          <input type="number" id="m-prev-elec-${room.number}" value="${room.lastElectricMeter || 0}" readonly class="w-20 bg-slate-100 border border-slate-200 rounded px-2 py-1 text-xs text-slate-600">
        </td>
        <td class="px-4 py-3">
          <input type="number" id="m-curr-elec-${room.number}" placeholder="เลขใหม่" oninput="updateMeterRowCalc('${room.number}')" class="w-24 border border-blue-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500">
        </td>
        <td class="px-4 py-3 font-bold text-amber-600 text-xs" id="m-diff-elec-${room.number}">0 หน่วย</td>
        <td class="px-4 py-3">
          <input type="number" id="m-prev-water-${room.number}" value="${room.lastWaterMeter || 0}" readonly class="w-20 bg-slate-100 border border-slate-200 rounded px-2 py-1 text-xs text-slate-600">
        </td>
        <td class="px-4 py-3">
          <input type="number" id="m-curr-water-${room.number}" placeholder="เลขใหม่" oninput="updateMeterRowCalc('${room.number}')" class="w-24 border border-cyan-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-cyan-500">
        </td>
        <td class="px-4 py-3 font-bold text-cyan-600 text-xs" id="m-diff-water-${room.number}">0 หน่วย</td>
        <td class="px-4 py-3 text-center">
          <button onclick="createBillFromMeter('${room.number}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
            สร้างบิล
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateMeterRowCalc(roomNumber) {
  const prevElec = Number(document.getElementById(`m-prev-elec-${roomNumber}`).value || 0);
  const currElec = Number(document.getElementById(`m-curr-elec-${roomNumber}`).value || 0);
  const diffElec = Math.max(0, currElec - prevElec);
  document.getElementById(`m-diff-elec-${roomNumber}`).innerText = `${diffElec} หน่วย`;

  const prevWater = Number(document.getElementById(`m-prev-water-${roomNumber}`).value || 0);
  const currWater = Number(document.getElementById(`m-curr-water-${roomNumber}`).value || 0);
  const diffWater = Math.max(0, currWater - prevWater);
  document.getElementById(`m-diff-water-${roomNumber}`).innerText = `${diffWater} หน่วย`;
}

async function createBillFromMeter(roomNumber) {
  const room = state.rooms.find(r => r.number === String(roomNumber));
  if (!room) return;

  const month = document.getElementById('meterBillingMonth').value;
  const currElec = Number(document.getElementById(`m-curr-elec-${roomNumber}`).value);
  const currWater = Number(document.getElementById(`m-curr-water-${roomNumber}`).value);

  if (!currElec && currElec !== 0) {
    alert('กรุณากรอกเลขมิเตอร์ไฟใหม่');
    return;
  }

  const billPayload = {
    roomNumber: room.number,
    month: month,
    rent: room.price,
    prevElectricMeter: room.lastElectricMeter || 0,
    currElectricMeter: currElec,
    prevWaterMeter: room.lastWaterMeter || 0,
    currWaterMeter: currWater,
    commonFee: state.settings.commonFeeDefault || 300,
    electricRate: state.settings.electricRate || 8,
    waterRate: state.settings.waterRate || 18
  };

  try {
    const res = await fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(billPayload)
    });
    const result = await res.json();
    if (result.success) {
      alert(`สร้างบิลห้อง ${roomNumber} สำเร็จแล้ว!`);
      await loadBills();
      await loadRooms();
      await loadDashboard();
      switchTab('bills');
    } else {
      alert(`เกิดข้อผิดพลาด: ${result.error}`);
    }
  } catch (err) {
    alert(err.message);
  }
}

function openMeterModal() {
  switchTab('meter');
}

// ----------------------------------------------------
// 4. BILLS & INVOICES & LINE SENDING
// ----------------------------------------------------
async function loadBills() {
  try {
    const res = await fetch('/api/bills');
    const result = await res.json();
    if (result.success) {
      state.bills = result.data;
      renderBillsTable();
    }
  } catch (err) {
    console.error('Failed to load bills:', err);
  }
}

function renderBillsTable() {
  const tbody = document.getElementById('billsTableBody');
  if (!tbody) return;

  const search = (document.getElementById('billSearchInput')?.value || '').toLowerCase();
  const filter = document.getElementById('billStatusFilter')?.value || 'all';

  const filtered = state.bills.filter(bill => {
    const matchSearch = bill.roomNumber.toLowerCase().includes(search) ||
      (bill.month && bill.month.toLowerCase().includes(search));
    const matchStatus = filter === 'all' || bill.status === filter;
    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">ยังไม่มีข้อมูลบิลในระบบ</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(bill => {
    const isPaid = bill.status === 'paid';
    const statusBadge = isPaid
      ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> ชำระแล้ว</span>`
      : `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 flex items-center gap-1 w-fit"><i data-lucide="clock" class="w-3.5 h-3.5"></i> รอชำระ</span>`;

    const lineBadge = bill.lineSent
      ? `<span class="text-emerald-600 text-xs font-medium flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> ส่งแล้ว</span>`
      : `<span class="text-slate-400 text-xs font-medium">ยังไม่ส่ง</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-5 py-4">
          <p class="font-bold text-slate-800">${bill.id}</p>
          <p class="text-xs text-slate-400">${bill.month}</p>
        </td>
        <td class="px-5 py-4 font-bold text-blue-600 text-base">ห้อง ${bill.roomNumber}</td>
        <td class="px-5 py-4">${Number(bill.rent).toLocaleString()} ฿</td>
        <td class="px-5 py-4">
          <p class="font-semibold text-slate-800">${Number(bill.electricAmount).toLocaleString()} ฿</p>
          <p class="text-[11px] text-slate-400">(${bill.electricUnits} หน่วย)</p>
        </td>
        <td class="px-5 py-4">
          <p class="font-semibold text-slate-800">${Number(bill.waterAmount).toLocaleString()} ฿</p>
          <p class="text-[11px] text-slate-400">(${bill.waterUnits} หน่วย)</p>
        </td>
        <td class="px-5 py-4 font-bold text-slate-900 text-base">${Number(bill.totalAmount).toLocaleString()} ฿</td>
        <td class="px-5 py-4">
          ${statusBadge}
          <button onclick="toggleBillStatus('${bill.id}', '${isPaid ? 'pending' : 'paid'}')" class="text-[10px] text-blue-600 underline mt-1 block">
            ${isPaid ? 'เปลี่ยนเป็นรอชำระ' : 'กดเมื่อชำระแล้ว'}
          </button>
        </td>
        <td class="px-5 py-4">${lineBadge}</td>
        <td class="px-5 py-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <!-- Send LINE button -->
            <button onclick="sendLineBill('${bill.id}')" class="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition" title="ส่งบิลเข้า LINE">
              <i data-lucide="send" class="w-4 h-4"></i>
            </button>
            <!-- Print Bill button -->
            <button onclick="openPrintBill('${bill.id}')" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition" title="พิมพ์ใบแจ้งหนี้ / PDF">
              <i data-lucide="printer" class="w-4 h-4"></i>
            </button>
            <!-- View Online Bill button -->
            <button onclick="openOnlineBill('${bill.id}')" class="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition" title="เปิดหน้า QR จ่ายเงินผู้เช่า">
              <i data-lucide="qr-code" class="w-4 h-4"></i>
            </button>
            <!-- Delete Bill button -->
            <button onclick="deleteBill('${bill.id}')" class="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg transition" title="ลบบิล">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

async function sendLineBill(billId) {
  if (!confirm('ยืนยันส่งบิลนี้ไปยัง LINE ของผู้เช่า?')) return;
  try {
    const res = await fetch(`/api/bills/${billId}/send-line`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      alert(result.message);
      await loadBills();
    } else {
      alert(`ไม่สามารถส่งได้: ${result.error}`);
    }
  } catch (err) {
    alert(`ข้อผิดพลาด: ${err.message}`);
  }
}

async function batchSendLineBills() {
  if (!confirm('ยืนยันส่งบิล LINE ให้ทุกห้องที่ยังค้างชำระและมี LINE User ID?')) return;
  try {
    const res = await fetch('/api/bills/batch-send-line', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      alert(result.message);
      await loadBills();
    } else {
      alert(`ไม่สามารถส่งได้: ${result.error}`);
    }
  } catch (err) {
    alert(`ข้อผิดพลาด: ${err.message}`);
  }
}

async function toggleBillStatus(billId, newStatus) {
  try {
    const res = await fetch(`/api/bills/${billId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const result = await res.json();
    if (result.success) {
      await loadBills();
      await loadDashboard();
    }
  } catch (err) {
    alert(err.message);
  }
}

async function deleteBill(billId) {
  if (!confirm('ยืนยันลบบิลนี้ออกจากระบบ?')) return;
  try {
    const res = await fetch(`/api/bills/${billId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      await loadBills();
      await loadDashboard();
    }
  } catch (err) {
    alert(err.message);
  }
}

function openPrintBill(billId) {
  window.open(`/print-bill.html?billId=${billId}`, '_blank');
}

function openOnlineBill(billId) {
  window.open(`/tenant-portal.html?billId=${billId}`, '_blank');
}

// Bill Modal Management
function openCreateBillModal() {
  const roomSelect = document.getElementById('formBillRoomNumber');
  const occupiedRooms = state.rooms.filter(r => r.status === 'occupied');
  
  if (occupiedRooms.length === 0) {
    alert('ยังไม่มีห้องที่มีผู้เช่า กรุณาเพิ่มผู้เช่าในเมนูจัดการห้องพักก่อน');
    return;
  }

  roomSelect.innerHTML = occupiedRooms.map(r => `<option value="${r.number}">ห้อง ${r.number} (${r.tenant?.name || 'ไม่มีชื่อ'})</option>`).join('');

  onBillRoomSelect();
  document.getElementById('billModal').classList.remove('hidden');
}

function closeBillModal() {
  document.getElementById('billModal').classList.add('hidden');
}

function onBillRoomSelect() {
  const roomNumber = document.getElementById('formBillRoomNumber').value;
  const room = state.rooms.find(r => r.number === String(roomNumber));
  if (!room) return;

  document.getElementById('formBillRent').value = room.price || 4000;
  document.getElementById('formBillCommonFee').value = state.settings.commonFeeDefault || 300;
  document.getElementById('formBillPrevElec').value = room.lastElectricMeter || 0;
  document.getElementById('formBillCurrElec').value = (room.lastElectricMeter || 0) + 50;
  document.getElementById('formBillPrevWater').value = room.lastWaterMeter || 0;
  document.getElementById('formBillCurrWater').value = (room.lastWaterMeter || 0) + 8;
  document.getElementById('formBillOtherFee').value = 0;
  document.getElementById('formBillOtherRemark').value = '';

  document.getElementById('rateLabelElec').innerText = state.settings.electricRate || 8;
  document.getElementById('rateLabelWater').innerText = state.settings.waterRate || 18;

  calculateBillTotal();
}

function calculateBillTotal() {
  const rent = Number(document.getElementById('formBillRent').value || 0);
  const commonFee = Number(document.getElementById('formBillCommonFee').value || 0);

  const prevElec = Number(document.getElementById('formBillPrevElec').value || 0);
  const currElec = Number(document.getElementById('formBillCurrElec').value || 0);
  const elecRate = Number(state.settings.electricRate || 8);
  const elecUnits = Math.max(0, currElec - prevElec);
  const elecAmount = Math.round(elecUnits * elecRate);
  document.getElementById('calcElecAmount').innerText = `${elecAmount.toLocaleString()} ฿ (${elecUnits} หน่วย)`;

  const prevWater = Number(document.getElementById('formBillPrevWater').value || 0);
  const currWater = Number(document.getElementById('formBillCurrWater').value || 0);
  const waterRate = Number(state.settings.waterRate || 18);
  const waterUnits = Math.max(0, currWater - prevWater);
  const waterAmount = Math.round(waterUnits * waterRate);
  document.getElementById('calcWaterAmount').innerText = `${waterAmount.toLocaleString()} ฿ (${waterUnits} หน่วย)`;

  const otherFee = Number(document.getElementById('formBillOtherFee').value || 0);

  const grandTotal = rent + commonFee + elecAmount + waterAmount + otherFee;
  document.getElementById('calcGrandTotal').innerText = `${grandTotal.toLocaleString()} บาท`;
}

async function saveBillForm(e) {
  e.preventDefault();
  const roomNumber = document.getElementById('formBillRoomNumber').value;
  const month = document.getElementById('formBillMonth').value;
  const rent = Number(document.getElementById('formBillRent').value);
  const commonFee = Number(document.getElementById('formBillCommonFee').value);
  const prevElec = Number(document.getElementById('formBillPrevElec').value);
  const currElec = Number(document.getElementById('formBillCurrElec').value);
  const prevWater = Number(document.getElementById('formBillPrevWater').value);
  const currWater = Number(document.getElementById('formBillCurrWater').value);
  const otherFee = Number(document.getElementById('formBillOtherFee').value);
  const otherFeeRemark = document.getElementById('formBillOtherRemark').value;
  const dueDate = document.getElementById('formBillDueDate').value;

  const payload = {
    roomNumber,
    month,
    rent,
    commonFee,
    prevElectricMeter: prevElec,
    currElectricMeter: currElec,
    prevWaterMeter: prevWater,
    currWaterMeter: currWater,
    otherFee,
    otherFeeRemark,
    dueDate
  };

  try {
    const res = await fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeBillModal();
      await loadBills();
      await loadRooms();
      await loadDashboard();
      alert('สร้างบิลเรียบร้อยแล้ว!');
    } else {
      alert(`ผิดพลาด: ${result.error}`);
    }
  } catch (err) {
    alert(err.message);
  }
}

// ----------------------------------------------------
// 5. SETTINGS
// ----------------------------------------------------
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const result = await res.json();
    if (result.success) {
      state.settings = result.data;
      document.getElementById('sidebarDormName').innerText = state.settings.dormName || 'หอพักสุขสบาย';
      document.getElementById('settingDormName').value = state.settings.dormName || '';
      document.getElementById('settingDormPhone').value = state.settings.dormPhone || '';
      document.getElementById('settingDormAddress').value = state.settings.dormAddress || '';
      document.getElementById('settingElectricRate').value = state.settings.electricRate || 8;
      document.getElementById('settingWaterRate').value = state.settings.waterRate || 18;
      document.getElementById('settingCommonFee').value = state.settings.commonFeeDefault || 300;
      document.getElementById('settingPromptpayId').value = state.settings.promptpayId || '';
      document.getElementById('settingPromptpayName').value = state.settings.promptpayName || '';
      document.getElementById('settingLineToken').value = state.settings.lineToken || '';
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    dormName: document.getElementById('settingDormName').value.trim(),
    dormPhone: document.getElementById('settingDormPhone').value.trim(),
    dormAddress: document.getElementById('settingDormAddress').value.trim(),
    electricRate: Number(document.getElementById('settingElectricRate').value),
    waterRate: Number(document.getElementById('settingWaterRate').value),
    commonFeeDefault: Number(document.getElementById('settingCommonFee').value),
    promptpayId: document.getElementById('settingPromptpayId').value.trim(),
    promptpayName: document.getElementById('settingPromptpayName').value.trim(),
    lineToken: document.getElementById('settingLineToken').value.trim()
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      state.settings = result.data;
      document.getElementById('sidebarDormName').innerText = state.settings.dormName;
      alert('บันทึกการตั้งค่าเรียบร้อยแล้ว!');
    } else {
      alert(`ผิดพลาด: ${result.error}`);
    }
  } catch (err) {
    alert(err.message);
  }
}

