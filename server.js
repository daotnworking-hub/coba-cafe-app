/**
 * ===================================================================
 *  CÔ BA CAFE & TRÀ SỮA - MÁY CHỦ CHIA SẺ MẠNG LAN CÔNG TY (LOCAL IP)
 * ===================================================================
 *  Chạy trực tiếp bằng Node.js thuần (Không cần cài bất kỳ package nào)
 *  Tự động chia sẻ Menu Đặt Nước qua Wi-Fi / Mạng nội bộ công ty
 *  Cơ chế Deep Merge 2 chiều chống mất dữ liệu + Auto-Backup xoay vòng
 * ===================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const DEFAULT_PORT = 8080;
const DATA_FILE = path.join(__dirname, 'data_app.json');
const MIRROR_DATA_FILE = path.join('D:\\coba-cafe-app', 'data_app.json');
const CLIENT_HTML_FILE = path.join(__dirname, 'Menu_DatNuoc_NhanVien.html');
const ADMIN_HTML_FILE = path.join(__dirname, 'App_DatNuoc_TinhTien_CongTy.html');

let dataVersion = Date.now();
let lastBackupTime = 0;

// Tìm địa chỉ IP LAN (Wi-Fi hoặc Cáp mạng) của máy tính này
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (!iface.address.startsWith('169.254.')) {
          if (iface.address.startsWith('192.168.')) {
            candidates.unshift(iface.address);
          } else {
            candidates.push(iface.address);
          }
        }
      }
    }
  }

  return candidates.length > 0 ? candidates[0] : 'localhost';
}

// Đọc dữ liệu từ data_app.json
function readDatabase() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const stat = fs.statSync(DATA_FILE);
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed.deletedItemIds) parsed.deletedItemIds = [];
      if (parsed.dataVersion && parsed.dataVersion > dataVersion) {
        dataVersion = parsed.dataVersion;
      }
      if (stat.mtimeMs && Math.floor(stat.mtimeMs) > dataVersion) {
        dataVersion = Math.floor(stat.mtimeMs);
      }
      if (parsed.menu) {
        const hasOldSoda = parsed.menu.some(m => m.name && m.name.includes('Soda Đào (Việt Quất'));
        if (hasOldSoda) {
          const sodaItems = [
            { id: 'gk_18', name: 'Soda Bạc Hà', category: 'YAOURT', price: 20000 },
            { id: 'gk_18_dao', name: 'Soda Đào', category: 'YAOURT', price: 20000 },
            { id: 'gk_18_vietquat', name: 'Soda Việt Quất', category: 'YAOURT', price: 20000 },
            { id: 'gk_18_blue', name: 'Soda Blue', category: 'YAOURT', price: 20000 }
          ];
          parsed.menu = parsed.menu.filter(m => !m.name.includes('Soda Đào (Việt Quất'));
          sodaItems.forEach(s => {
            if (!parsed.menu.some(m => m.name === s.name)) parsed.menu.push(s);
          });
        }
      }
      return parsed;
    }
  } catch (err) {
    console.error('Lỗi khi đọc file data_app.json:', err.message);
  }
  return {
    members: [],
    menu: [],
    toppings: [],
    favorites: {},
    ordersData: {},
    config: {},
    memberAliases: {},
    salaryCyclesPaid: {},
    deletedItemIds: []
  };
}

const BACKUP_DIR = 'D:\\backups_coba_cafe';
if (!fs.existsSync(BACKUP_DIR)) {
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
}

// Deep Merge ordersData an toàn - Chống ghi đè hủy diệt, hỗ trợ cập nhật món theo updatedAt & tôn trọng deletedItemIds
function mergeOrdersData(baseOrders, incOrders, deletedItemIds = []) {
  if (!baseOrders || typeof baseOrders !== 'object') return incOrders || {};
  if (!incOrders || typeof incOrders !== 'object') return baseOrders || {};

  const merged = JSON.parse(JSON.stringify(baseOrders));
  const deletedSet = new Set((deletedItemIds || []).filter(Boolean));

  for (const monthKey of Object.keys(incOrders)) {
    if (!merged[monthKey]) {
      merged[monthKey] = JSON.parse(JSON.stringify(incOrders[monthKey]));
    }
    const incMonth = incOrders[monthKey];
    for (const member of Object.keys(incMonth)) {
      if (!merged[monthKey][member]) {
        merged[monthKey][member] = JSON.parse(JSON.stringify(incMonth[member]));
      }
      const baseM = merged[monthKey][member];
      const incM = incMonth[member];

      if (!baseM.days) baseM.days = {};
      if (!baseM.items) baseM.items = {};

      // Hỗ trợ cập nhật trạng thái paid theo timestamp mới nhất hoặc giữ true
      if (incM.paidUpdatedAt && (!baseM.paidUpdatedAt || incM.paidUpdatedAt >= baseM.paidUpdatedAt)) {
        baseM.paid = !!incM.paid;
        baseM.paidUpdatedAt = incM.paidUpdatedAt;
      } else if (!baseM.paidUpdatedAt && incM.paid !== undefined && incM.paid) {
        baseM.paid = true;
      }

      // Xóa trước các món nằm trong deletedSet khỏi baseM
      for (const day of Object.keys(baseM.items || {})) {
        if (Array.isArray(baseM.items[day])) {
          baseM.items[day] = baseM.items[day].filter(it => !it.id || !deletedSet.has(it.id));
        }
      }

      const incItems = incM.items || {};
      for (const day of Object.keys(incItems)) {
        if (!baseM.items[day]) baseM.items[day] = [];
        const existingMap = new Map();
        baseM.items[day].forEach((it, idx) => {
          if (it.id) existingMap.set(it.id, idx);
        });

        for (const item of incItems[day]) {
          if (!item) continue;
          if (item.id && deletedSet.has(item.id)) continue;
          if (item.id && existingMap.has(item.id)) {
            const existIdx = existingMap.get(item.id);
            const existItem = baseM.items[day][existIdx];
            if ((item.updatedAt || 0) > (existItem.updatedAt || 0)) {
              baseM.items[day][existIdx] = JSON.parse(JSON.stringify(item));
            }
            continue;
          }
          baseM.items[day].push(JSON.parse(JSON.stringify(item)));
          if (item.id) existingMap.set(item.id, baseM.items[day].length - 1);
        }

        let daySum = 0;
        baseM.items[day].forEach(it => daySum += (parseInt(it.total) || 0));
        if (daySum > 0) {
          baseM.days[day] = daySum;
        } else {
          delete baseM.days[day];
          delete baseM.items[day];
        }
      }

      const incDays = incM.days || {};
      for (const day of Object.keys(incDays)) {
        if (!baseM.days[day] && incDays[day] && (!baseM.items[day] || baseM.items[day].length > 0)) {
          baseM.days[day] = incDays[day] === 30 ? 30000 : incDays[day];
        }
      }

      // Đảm bảo mọi ngày có items thì days[day] luôn khớp chính xác tổng tiền của items[day]
      for (const day of Object.keys(baseM.items || {})) {
        if (Array.isArray(baseM.items[day])) {
          baseM.items[day] = baseM.items[day].filter(it => !it.id || !deletedSet.has(it.id));
          let s = 0;
          baseM.items[day].forEach(it => s += (parseInt(it.total) || 0));
          if (s > 0) {
            baseM.days[day] = s;
          } else {
            delete baseM.days[day];
            delete baseM.items[day];
          }
        }
      }
      for (const day of Object.keys(baseM.days || {})) {
        if (baseM.days[day] === 30) baseM.days[day] = 30000;
      }
    }
  }

  // Quét lại toàn bộ merged để dọn dẹp các món đã bị xóa
  if (deletedSet.size > 0) {
    for (const mKey of Object.keys(merged)) {
      for (const mem of Object.keys(merged[mKey] || {})) {
        const memObj = merged[mKey][mem];
        if (memObj.items) {
          for (const d of Object.keys(memObj.items)) {
            if (Array.isArray(memObj.items[d])) {
              memObj.items[d] = memObj.items[d].filter(it => !it.id || !deletedSet.has(it.id));
              let s = 0;
              memObj.items[d].forEach(it => s += (parseInt(it.total) || 0));
              if (s > 0) {
                if (!memObj.days) memObj.days = {};
                memObj.days[d] = s;
              } else {
                if (memObj.days) delete memObj.days[d];
                delete memObj.items[d];
              }
            }
          }
        }
      }
    }
  }

  return merged;
}

function formatBackupTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Ghi dữ liệu vào data_app.json kèm sao lưu xoay vòng tự động (Non-blocking backup cleanup)
function saveDatabase(data, forceBackup = false) {
  try {
    dataVersion = Date.now();
    data.dataVersion = dataVersion;

    const nowMs = Date.now();
    // Tạo bản backup có timestamp theo đúng chuẩn data_app_backup_YYYYMMDD_HHMMSS.json
    if (fs.existsSync(DATA_FILE) && (forceBackup || (nowMs - lastBackupTime > 10000))) {
      lastBackupTime = nowMs;
      try {
        const ts = formatBackupTimestamp(new Date());
        const backupPath = path.join(BACKUP_DIR, `data_app_backup_${ts}.json`);
        fs.copyFileSync(DATA_FILE, backupPath);

        // Dọn dẹp xoay vòng bất đồng bộ (giữ tối thiểu 55 bản mới nhất) để không làm chậm phản hồi HTTP
        setImmediate(() => {
          try {
            const files = fs.readdirSync(BACKUP_DIR)
              .filter(f => f.startsWith('data_app_') && f.endsWith('.json'))
              .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
              .sort((a, b) => b.time - a.time);

            if (files.length > 60) {
              for (let i = 60; i < files.length; i++) {
                try { fs.unlinkSync(path.join(BACKUP_DIR, files[i].name)); } catch (e) {}
              }
            }
          } catch (e) {}
        });
      } catch (bkErr) {
        console.warn('[BACKUP WARNING] Không thể tạo backup file:', bkErr.message);
      }
    }

    const jsonString = JSON.stringify(data, null, 2);
    fs.writeFileSync(DATA_FILE, jsonString, 'utf8');

    // Tự động đồng bộ sang thư mục repo git nếu khác đường dẫn
    if (path.resolve(DATA_FILE) !== path.resolve(MIRROR_DATA_FILE)) {
      setImmediate(() => {
        try {
          if (fs.existsSync(path.dirname(MIRROR_DATA_FILE))) {
            fs.writeFileSync(MIRROR_DATA_FILE, jsonString, 'utf8');
          }
        } catch (e) {}
      });
    }

    return true;
  } catch (err) {
    console.error('Lỗi khi lưu file data_app.json:', err.message);
    return false;
  }
}

// Helper gửi JSON phản hồi
function sendJson(res, statusCode, obj) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(obj));
}

// Tạo HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Xử lý CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // --- 1. GIAO DIỆN MENU CHO NHÂN VIÊN ---
  if (pathname === '/' || pathname === '/menu' || pathname === '/Menu_DatNuoc_NhanVien.html') {
    if (fs.existsSync(CLIENT_HTML_FILE)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(CLIENT_HTML_FILE).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Chưa tìm thấy file Menu_DatNuoc_NhanVien.html');
    }
  }

  // --- 2. GIAO DIỆN APP CHÍNH (ADMIN / SỔ NỢ) ---
  if (pathname === '/admin' || pathname === '/app' || pathname === '/App_DatNuoc_TinhTien_CongTy.html') {
    if (fs.existsSync(ADMIN_HTML_FILE)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(ADMIN_HTML_FILE).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Chưa tìm thấy file App_DatNuoc_TinhTien_CongTy.html');
    }
  }

  // --- 2.5. PHỤC VỤ HÌNH ẢNH MINH HỌA (/img/...) ---
  if (pathname.startsWith('/img/')) {
    const filename = path.basename(pathname);
    const imgPath = path.join(__dirname, 'img', filename);
    if (fs.existsSync(imgPath)) {
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      return fs.createReadStream(imgPath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Image not found');
    }
  }

  // --- 3. API: LẤY THÔNG TIN KẾT NỐI SERVER ---
  if (pathname === '/api/info' && method === 'GET') {
    const ip = getLocalIpAddress();
    const port = server.address().port;
    return sendJson(res, 200, {
      ip: ip,
      port: port,
      clientUrl: `http://${ip}:${port}/`,
      adminUrl: `http://${ip}:${port}/admin`,
      adminLocalUrl: `http://localhost:${port}/admin`
    });
  }

  // --- 4. API: LẤY TOÀN BỘ DỮ LIỆU APP ---
  if (pathname === '/api/data' && method === 'GET') {
    const data = readDatabase();
    data.dataVersion = dataVersion;
    return sendJson(res, 200, data);
  }

  // --- 5. API: POLLING KIỂM TRA ĐỔI MỚI DỮ LIỆU ---
  if (pathname === '/api/poll' && method === 'GET') {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const mtime = Math.floor(fs.statSync(DATA_FILE).mtimeMs);
        if (mtime > dataVersion) dataVersion = mtime;
      }
    } catch (e) {}
    return sendJson(res, 200, { dataVersion });
  }

  // --- 6. API: NHÂN VIÊN GỬI ĐẶT ĐƠN (POST /api/order) ---
  if (pathname === '/api/order' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { member, items, date, saveAsFavorite } = payload;

        if (!member || !items || !Array.isArray(items) || items.length === 0) {
          return sendJson(res, 400, { success: false, error: 'Thiếu thông tin người đặt hoặc danh sách món!' });
        }

        const orderDate = date || new Date().toISOString().split('T')[0];
        const [yyyy, mm, ddStr] = orderDate.split('-');
        const monthKey = `${yyyy}-${mm}`;
        const dayNum = parseInt(ddStr);

        const db = readDatabase();
        if (!db.members) db.members = [];
        if (!db.members.includes(member)) {
          db.members.push(member);
          console.log(`[TỰ ĐỘNG THÊM NHÂN VIÊN] Đã tự động thêm thành viên: ${member}`);
        }
        if (!db.ordersData) db.ordersData = {};
        if (!db.ordersData[monthKey]) db.ordersData[monthKey] = {};
        if (!db.ordersData[monthKey][member]) {
          db.ordersData[monthKey][member] = {
            paid: false,
            days: {},
            items: {}
          };
        }

        const mObj = db.ordersData[monthKey][member];
        if (!mObj.days) mObj.days = {};
        if (!mObj.items) mObj.items = {};
        if (!mObj.items[dayNum]) mObj.items[dayNum] = [];

        let totalAdded = 0;
        let countCups = 0;

        items.forEach(it => {
          const qty = parseInt(it.qty) || 1;
          const singlePrice = parseInt(it.singlePrice) || parseInt(it.basePrice) || 0;
          const total = parseInt(it.total) || (singlePrice * qty);

          const itemRecord = {
            id: it.id || ('ord_net_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
            name: it.name,
            basePrice: parseInt(it.basePrice) || singlePrice,
            toppings: it.toppings || [],
            toppingsPrice: parseInt(it.toppingsPrice) || 0,
            singlePrice: singlePrice,
            qty: qty,
            note: it.note || '',
            total: total,
            createdAt: new Date().toISOString(),
            updatedAt: Date.now()
          };

          mObj.items[dayNum].push(itemRecord);
          totalAdded += total;
          countCups += qty;

          // Lưu làm món quen thuộc nếu được yêu cầu
          if (saveAsFavorite || it.saveAsFav) {
            if (!db.favorites) db.favorites = {};
            if (!db.favorites[member]) db.favorites[member] = [];
            const exists = db.favorites[member].some(f => f.name === it.name && (f.note || '') === (it.note || ''));
            if (!exists) {
              db.favorites[member].unshift({
                id: 'fav_' + Date.now(),
                name: it.name,
                price: parseInt(it.basePrice) || singlePrice,
                toppings: it.toppings || [],
                toppingsPrice: parseInt(it.toppingsPrice) || 0,
                note: it.note || ''
              });
            }
          }
        });

        // Tính lại tổng tiền của ngày đó
        let daySum = 0;
        mObj.items[dayNum].forEach(it => daySum += it.total);
        mObj.days[dayNum] = daySum;

        saveDatabase(db, true);

        console.log(`[ĐƠN MỚI] ${member} vừa đặt ${countCups} ly nước (Tổng: ${totalAdded.toLocaleString('vi-VN')} đ) ngày ${orderDate}!`);

        return sendJson(res, 200, {
          success: true,
          message: `Đã ghi nhận ${countCups} ly cho ${member}!`,
          member: member,
          cups: countCups,
          totalAmount: totalAdded,
          dataVersion: dataVersion
        });

      } catch (err) {
        console.error('Lỗi xử lý đơn hàng:', err);
        return sendJson(res, 500, { success: false, error: 'Lỗi server: ' + err.message });
      }
    });
    return;
  }

  // --- 6.1. API: THÊM NHÂN VIÊN MỚI (POST /api/member/add) ---
  if (pathname === '/api/member/add' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const name = (payload.name || '').trim();
        if (!name) return sendJson(res, 400, { success: false, error: 'Thiếu tên nhân viên' });

        const db = readDatabase();
        if (!db.members) db.members = [];
        if (!db.members.includes(name)) {
          db.members.push(name);
          saveDatabase(db, true);
          console.log(`[THÊM NHÂN VIÊN] Đã thêm thành viên: ${name}`);
        }
        return sendJson(res, 200, { success: true, member: name, members: db.members, dataVersion });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- 6.2. API: XÓA NHÂN VIÊN (POST /api/member/delete) ---
  if (pathname === '/api/member/delete' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const name = (payload.name || '').trim();
        if (!name) return sendJson(res, 400, { success: false, error: 'Thiếu tên nhân viên' });

        const db = readDatabase();
        if (db.members) {
          db.members = db.members.filter(m => m !== name);
        }
        if (db.favorites && db.favorites[name]) {
          delete db.favorites[name];
        }
        saveDatabase(db, true);
        console.log(`[XÓA NHÂN VIÊN] Đã xóa thành viên: ${name}`);
        return sendJson(res, 200, { success: true, member: name, members: db.members, dataVersion });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- 6.3. API: XÓA 1 MÓN ĐÃ ĐẶT (POST /api/order/delete_item) ---
  if (pathname === '/api/order/delete_item' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { monthKey, member, dayNum, itemId } = payload;
        if (!monthKey || !member || !dayNum || !itemId) {
          return sendJson(res, 400, { success: false, error: 'Thiếu thông tin món cần xóa' });
        }

        const db = readDatabase();
        if (!db.deletedItemIds) db.deletedItemIds = [];
        if (!db.deletedItemIds.includes(itemId)) {
          db.deletedItemIds.push(itemId);
        }

        if (db.ordersData && db.ordersData[monthKey] && db.ordersData[monthKey][member]) {
          const mObj = db.ordersData[monthKey][member];
          if (mObj.items && mObj.items[dayNum]) {
            mObj.items[dayNum] = mObj.items[dayNum].filter(it => it.id !== itemId);
            let daySum = 0;
            mObj.items[dayNum].forEach(it => daySum += (parseInt(it.total) || 0));
            if (daySum > 0) {
              mObj.days[dayNum] = daySum;
            } else {
              delete mObj.days[dayNum];
              delete mObj.items[dayNum];
            }
          }
        }

        saveDatabase(db, true);
        console.log(`[XÓA MÓN THÀNH CÔNG] Đã xóa món ${itemId} của ${member} ngày ${dayNum}/${monthKey}`);
        return sendJson(res, 200, { success: true, itemId, dataVersion, deletedItemIds: db.deletedItemIds });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- 6.35. API: CẬP NHẬT / CHUYỂN NGƯỜI 1 MÓN ĐÃ ĐẶT (POST /api/order/update_item) ---
  if (pathname === '/api/order/update_item' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { monthKey, oldMember, newMember, dayNum, itemId, updatedItem, updatedFields, newItemId } = payload;
        const patchObj = updatedItem || updatedFields;
        if (!monthKey || !oldMember || !dayNum || !itemId || !patchObj) {
          return sendJson(res, 400, { success: false, error: 'Thiếu thông tin cập nhật món' });
        }

        const db = readDatabase();
        if (!db.deletedItemIds) db.deletedItemIds = [];
        const targetMember = newMember || oldMember;

        if (targetMember !== oldMember) {
          // Chuyển món sang người khác: đưa ID cũ vào deletedItemIds để chống hồi sinh
          if (!db.deletedItemIds.includes(itemId)) {
            db.deletedItemIds.push(itemId);
          }
          let origItem = null;
          if (db.ordersData?.[monthKey]?.[oldMember]?.items?.[dayNum]) {
            const oldMObj = db.ordersData[monthKey][oldMember];
            origItem = oldMObj.items[dayNum].find(it => it.id === itemId) || null;
            oldMObj.items[dayNum] = oldMObj.items[dayNum].filter(it => it.id !== itemId);
            let oldSum = 0;
            oldMObj.items[dayNum].forEach(it => oldSum += (parseInt(it.total) || 0));
            if (oldSum > 0) oldMObj.days[dayNum] = oldSum;
            else { delete oldMObj.days[dayNum]; delete oldMObj.items[dayNum]; }
          }

          if (!db.ordersData[monthKey]) db.ordersData[monthKey] = {};
          if (!db.ordersData[monthKey][targetMember]) {
            db.ordersData[monthKey][targetMember] = { paid: false, days: {}, items: {} };
          }
          const newMObj = db.ordersData[monthKey][targetMember];
          if (!newMObj.days) newMObj.days = {};
          if (!newMObj.items) newMObj.items = {};
          if (!newMObj.items[dayNum]) newMObj.items[dayNum] = [];

          const finalNewId = newItemId || (patchObj.id && patchObj.id !== itemId ? patchObj.id : ('ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)));
          const movedRecord = Object.assign({}, origItem || {}, patchObj, {
            id: finalNewId,
            updatedAt: Date.now()
          });
          if (!newMObj.items[dayNum].some(it => it.id === finalNewId)) {
            newMObj.items[dayNum].push(movedRecord);
          }
          let newSum = 0;
          newMObj.items[dayNum].forEach(it => newSum += (parseInt(it.total) || 0));
          newMObj.days[dayNum] = newSum;
        } else {
          // Cập nhật tại chỗ
          const mObj = db.ordersData?.[monthKey]?.[oldMember];
          if (mObj?.items?.[dayNum]) {
            const idx = mObj.items[dayNum].findIndex(it => it.id === itemId);
            if (idx !== -1) {
              mObj.items[dayNum][idx] = Object.assign({}, mObj.items[dayNum][idx], patchObj, {
                id: itemId,
                updatedAt: Date.now()
              });
              let s = 0;
              mObj.items[dayNum].forEach(it => s += (parseInt(it.total) || 0));
              mObj.days[dayNum] = s;
            }
          }
        }

        saveDatabase(db, true);
        return sendJson(res, 200, { success: true, dataVersion, deletedItemIds: db.deletedItemIds });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- 6.38. API: XÓA TRỐNG 1 Ô NGÀY CỦA 1 NHÂN VIÊN TRÊN SỔ NỢ (POST /api/order/clear_member_day) ---
  if (pathname === '/api/order/clear_member_day' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { monthKey, member, dayNum } = payload;
        if (!monthKey || !member || !dayNum) {
          return sendJson(res, 400, { success: false, error: 'Thiếu thông tin ô ngày cần xóa' });
        }

        const db = readDatabase();
        if (!db.deletedItemIds) db.deletedItemIds = [];

        const mObj = db.ordersData?.[monthKey]?.[member];
        if (mObj) {
          if (mObj.items && mObj.items[dayNum]) {
            mObj.items[dayNum].forEach(it => {
              if (it.id && !db.deletedItemIds.includes(it.id)) {
                db.deletedItemIds.push(it.id);
              }
            });
            delete mObj.items[dayNum];
          }
          if (mObj.days && mObj.days[dayNum] !== undefined) {
            delete mObj.days[dayNum];
          }
        }

        saveDatabase(db, true);
        return sendJson(res, 200, { success: true, dataVersion, deletedItemIds: db.deletedItemIds });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- 6.4. API: XÓA TOÀN BỘ ĐƠN CỦA 1 NGÀY (POST /api/order/clear_day) ---
  if (pathname === '/api/order/clear_day' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { monthKey, dayNum } = payload;
        if (!monthKey || !dayNum) {
          return sendJson(res, 400, { success: false, error: 'Thiếu thông tin ngày cần xóa' });
        }

        const db = readDatabase();
        if (!db.deletedItemIds) db.deletedItemIds = [];

        if (db.ordersData && db.ordersData[monthKey]) {
          Object.keys(db.ordersData[monthKey]).forEach(member => {
            const mObj = db.ordersData[monthKey][member];
            if (mObj.items && mObj.items[dayNum]) {
              mObj.items[dayNum].forEach(it => {
                if (it.id && !db.deletedItemIds.includes(it.id)) {
                  db.deletedItemIds.push(it.id);
                }
              });
              delete mObj.items[dayNum];
            }
            if (mObj.days && mObj.days[dayNum]) {
              delete mObj.days[dayNum];
            }
          });
        }

        saveDatabase(db, true);
        console.log(`[XÓA NGÀY THÀNH CÔNG] Đã xóa tất cả đơn ngày ${dayNum}/${monthKey}`);
        return sendJson(res, 200, { success: true, dayNum, monthKey, dataVersion, deletedItemIds: db.deletedItemIds });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- 7. API: APP CHÍNH LƯU TOÀN BỘ STATE (POST /api/save_all) ---
  if (pathname === '/api/save_all' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const db = readDatabase();

        if (payload.members) {
          db.members = Array.from(new Set([...(db.members || []), ...payload.members]));
        }
        if (payload.memberAliases && typeof payload.memberAliases === 'object') {
          db.memberAliases = Object.assign({}, db.memberAliases || {}, payload.memberAliases);
        }
        if (payload.menu) {
          const cleanMenu = [];
          const sodaItems = [
            { id: 'gk_18', name: 'Soda Bạc Hà', category: 'YAOURT', price: 20000 },
            { id: 'gk_18_dao', name: 'Soda Đào', category: 'YAOURT', price: 20000 },
            { id: 'gk_18_vietquat', name: 'Soda Việt Quất', category: 'YAOURT', price: 20000 },
            { id: 'gk_18_blue', name: 'Soda Blue', category: 'YAOURT', price: 20000 }
          ];
          payload.menu.forEach(m => {
            if (m.name && m.name.includes('Soda Đào (Việt Quất')) {
              sodaItems.forEach(s => cleanMenu.push(s));
            } else {
              cleanMenu.push(m);
            }
          });
          if (!cleanMenu.some(m => m.name === 'Soda Bạc Hà')) {
            sodaItems.forEach(s => {
              if (!cleanMenu.some(m => m.name === s.name)) cleanMenu.push(s);
            });
          }
          db.menu = cleanMenu;
        }
        if (payload.toppings) db.toppings = payload.toppings;
        if (payload.favorites) db.favorites = Object.assign({}, db.favorites, payload.favorites);
        if (payload.deletedItemIds && Array.isArray(payload.deletedItemIds)) {
          db.deletedItemIds = Array.from(new Set([...(db.deletedItemIds || []), ...payload.deletedItemIds]));
        }
        if (payload.ordersData) {
          // SAFE DEEP MERGE - Chống ghi đè mất ngày cũ nhưng tôn trọng các món đã chọn xóa và cập nhật món
          db.ordersData = mergeOrdersData(db.ordersData, payload.ordersData, db.deletedItemIds);
        }
        if (payload.config) db.config = payload.config;
        if (payload.salaryCyclesPaid) db.salaryCyclesPaid = Object.assign({}, db.salaryCyclesPaid, payload.salaryCyclesPaid);

        saveDatabase(db);
        return sendJson(res, 200, { success: true, dataVersion, deletedItemIds: db.deletedItemIds });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // 404 cho các route khác
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Không tìm thấy trang yêu cầu (404 Not Found)');
});

// Khởi chạy server
const PORT = process.env.PORT || DEFAULT_PORT;
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log('\n================================================================');
  console.log('       CÔ BA CAFE & TRÀ SỮA - HỆ THỐNG ĐẶT NƯỚC CÔNG TY        ');
  console.log('================================================================');
  console.log(`[+] MÁY CHỦ LAN ĐANG CHẠY TẠI CỔNG : ${PORT}`);
  console.log('');
  console.log(`👉 [1] LINK CHO MỌI NGƯỜI ĐẶT NƯỚC (Gửi qua Zalo công ty):`);
  console.log(`       http://${localIp}:${PORT}/`);
  console.log(`       (Bất kỳ ai kết nối chung Wi-Fi đều mở được trên ĐT/Máy tính)`);
  console.log('');
  console.log(`👉 [2] LINK APP CHÍNH CỦA BẠN (Gom Đơn & Sổ Nợ Cuối Tháng):`);
  console.log(`       http://localhost:${PORT}/admin`);
  console.log(`       hoặc: http://${localIp}:${PORT}/admin`);
  console.log('================================================================\n');
});

// Xử lý khi lỗi cổng bị chiếm
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`Cổng ${PORT} đang bận, thử chạy với cổng ${Number(PORT) + 1}...`);
    server.listen(Number(PORT) + 1, '0.0.0.0');
  } else {
    console.error('Lỗi khởi động máy chủ:', err);
  }
});
