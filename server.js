/**
 * ===================================================================
 *  CÔ BA CAFE & TRÀ SỮA - MÁY CHỦ CHIA SẺ MẠNG LAN CÔNG TY (LOCAL IP)
 * ===================================================================
 *  Chạy trực tiếp bằng Node.js thuần (Không cần cài bất kỳ package nào)
 *  Tự động chia sẻ Menu Đặt Nước qua Wi-Fi / Mạng nội bộ công ty
 * ===================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const DEFAULT_PORT = 8080;
const DATA_FILE = path.join(__dirname, 'data_app.json');
const CLIENT_HTML_FILE = path.join(__dirname, 'Menu_DatNuoc_NhanVien.html');
const ADMIN_HTML_FILE = path.join(__dirname, 'App_DatNuoc_TinhTien_CongTy.html');

let dataVersion = Date.now();

// Tìm địa chỉ IP LAN (Wi-Fi hoặc Cáp mạng) của máy tính này
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Bỏ qua IPv6 và địa chỉ nội bộ 127.0.0.1
      if (iface.family === 'IPv4' && !iface.internal) {
        // Bỏ qua dải APIPA 169.254.x.x
        if (!iface.address.startsWith('169.254.')) {
          // Ưu tiên các dải mạng LAN văn phòng phổ biến: 192.168.x.x, 10.x.x.x, 172.x.x.x
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
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(content);
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
    salaryCyclesPaid: {}
  };
}

// Ghi dữ liệu vào data_app.json
function saveDatabase(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    dataVersion = Date.now();
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
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(CLIENT_HTML_FILE).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Chưa tìm thấy file Menu_DatNuoc_NhanVien.html');
    }
  }

  // --- 2. GIAO DIỆN APP CHÍNH (ADMIN / SỔ NỢ) ---
  if (pathname === '/admin' || pathname === '/app' || pathname === '/App_DatNuoc_TinhTien_CongTy.html') {
    if (fs.existsSync(ADMIN_HTML_FILE)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
            id: 'ord_net_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: it.name,
            basePrice: parseInt(it.basePrice) || singlePrice,
            toppings: it.toppings || [],
            toppingsPrice: parseInt(it.toppingsPrice) || 0,
            singlePrice: singlePrice,
            qty: qty,
            note: it.note || '',
            total: total,
            createdAt: new Date().toISOString()
          };

          mObj.items[dayNum].push(itemRecord);
          totalAdded += total;
          countCups += qty;

          // Lưu làm món quen thuộc nếu được yêu cầu
          if (saveAsFavorite) {
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

        saveDatabase(db);

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
          saveDatabase(db);
          dataVersion = Date.now();
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
        saveDatabase(db);
        dataVersion = Date.now();
        console.log(`[XÓA NHÂN VIÊN] Đã xóa thành viên: ${name}`);
        return sendJson(res, 200, { success: true, member: name, members: db.members, dataVersion });
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

        if (payload.members) db.members = payload.members;
        if (payload.menu) db.menu = payload.menu;
        if (payload.toppings) db.toppings = payload.toppings;
        if (payload.favorites) db.favorites = payload.favorites;
        if (payload.ordersData) db.ordersData = payload.ordersData;
        if (payload.config) db.config = payload.config;
        if (payload.salaryCyclesPaid) db.salaryCyclesPaid = payload.salaryCyclesPaid;

        saveDatabase(db);
        return sendJson(res, 200, { success: true, dataVersion });
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

  // Tự động mở trình duyệt vào App Quản lý ngay khi khởi động
  try {
    const { exec } = require('child_process');
    exec(`start http://localhost:${PORT}/admin`);
    console.log('[+] Đã tự động mở trình duyệt web vào App Quản lý!');
  } catch (err) {
    console.warn('Không thể tự động mở trình duyệt:', err.message);
  }
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
