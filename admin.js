// Store VIP & KeyMaster Admin Controller
const _origAdminJson = Response.prototype.json;
Response.prototype.json = async function() {
  const text = await this.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    const objStart = text.indexOf('{');
    const arrStart = text.indexOf('[');
    let start = -1;
    if (objStart !== -1 && arrStart !== -1) start = Math.min(objStart, arrStart);
    else if (objStart !== -1) start = objStart;
    else if (arrStart !== -1) start = arrStart;

    if (start !== -1) {
      return JSON.parse(text.substring(start));
    }
    throw err;
  }
};

// Tự động điều hướng các API thông minh giữa Node.js, file:// và PHP Web Hosting (AwardSpace)
const _originalAdminFetch = window.fetch;
window.fetch = function(url, options) {
  if (typeof url === 'string') {
    const isFileProtocol = window.location.protocol === 'file:';
    const isNodeServer = window.location.port === '3000';

    if (isFileProtocol) {
      // Khi người dùng mở tệp trực tiếp từ ổ đĩa máy tính (file:///)
      if (url.startsWith('api.php?endpoint=')) {
        const ep = url.replace(/^api\.php\?endpoint=/, '');
        url = 'http://localhost:3000/api/' + ep;
      } else if (url.startsWith('/api/')) {
        url = 'http://localhost:3000' + url;
      } else if (!url.startsWith('http')) {
        url = 'http://localhost:3000/' + url.replace(/^\//, '');
      }
    } else if (!isNodeServer) {
      // Khi chạy trên Web Hosting PHP (AwardSpace / Apache)
      const apiPhpBase = window.location.pathname.includes('/admin') ? '../api.php' : 'api.php';
      if (url.startsWith('/api/admin/files/')) {
        const id = url.replace('/api/admin/files/', '');
        url = `${apiPhpBase}?endpoint=admin/files&id=${encodeURIComponent(id)}`;
      } else if (url.startsWith('/api/admin/keys/')) {
        const id = url.replace('/api/admin/keys/', '');
        url = `${apiPhpBase}?endpoint=admin/keys&id=${encodeURIComponent(id)}`;
      } else if (url.startsWith('/api/')) {
        const endpoint = url.replace(/^\/api\//, '');
        if (endpoint.includes('?')) {
          const [ep, query] = endpoint.split('?');
          url = `${apiPhpBase}?endpoint=${ep}&${query}`;
        } else {
          url = `${apiPhpBase}?endpoint=${endpoint}`;
        }
      }
    }

    if (authToken && url.includes('api.php?endpoint=admin/') && !url.includes('admin/login')) {
      url += (url.includes('?') ? '&' : '?') + `admin_token=${encodeURIComponent(authToken)}`;
    }
  }
  return _originalAdminFetch(url, options);
};

let authToken = localStorage.getItem('admin_token') || '';
let loadedFiles = [];
let loadedKeys = [];

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.protocol === 'file:') {
    const banner = document.getElementById('file-protocol-banner');
    if (banner) banner.style.display = 'block';
  }
  initAdminNav();
  checkAuth();
  setupLoginForm();
  setupModals();
  setupFileForms();
  setupKeyForms();
  setupSettingsForm();
});

// 1. Điều hướng Tab Admin
function initAdminNav() {
  const menuBtns = document.querySelectorAll('.menu-btn[data-tab]');
  menuBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchAdminTab(tabId);
    });
  });
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));

  const btn = document.querySelector(`.menu-btn[data-tab="${tabId}"]`);
  const tab = document.getElementById(`tab-${tabId}`);

  if (btn) btn.classList.add('active');
  if (tab) tab.classList.add('active');

  const pageTitle = document.getElementById('page-title');
  if (tabId === 'overview') {
    if (pageTitle) pageTitle.innerText = 'Bảng Điều Khiển Tổng Quan';
    loadOverview();
  } else if (tabId === 'files') {
    if (pageTitle) pageTitle.innerText = 'Quản Lý Bản Tải & Direct Links';
    loadFiles();
  } else if (tabId === 'keys') {
    if (pageTitle) pageTitle.innerText = 'Quản Lý Kho Khóa (Tách Riêng Từng File)';
    loadFiles().then(() => loadKeys());
  } else if (tabId === 'settings') {
    if (pageTitle) pageTitle.innerText = 'Cấu Hình Hệ Thống & Link4M API';
    loadSettings();
  } else if (tabId === 'logs') {
    if (pageTitle) pageTitle.innerText = 'Nhật Ký Giám Sát Anti-Bypass';
    loadLogs();
  }
}

// 2. Xác thực Admin
async function checkAuth() {
  try {
    const res = await fetch('/api/admin/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      document.getElementById('login-modal').style.display = 'none';
      switchAdminTab('overview');
    } else {
      document.getElementById('login-modal').style.display = 'flex';
    }
  } catch (err) {
    document.getElementById('login-modal').style.display = 'flex';
  }
}

function setupLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-password-input').value;
    const errorBox = document.getElementById('login-error');
    errorBox.innerText = '';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (data.success && data.token) {
        authToken = data.token;
        localStorage.setItem('admin_token', authToken);
        document.getElementById('login-modal').style.display = 'none';
        showToast('Đăng nhập quản trị viên thành công!', 'success');
        switchAdminTab('overview');
      } else {
        errorBox.innerText = data.message || 'Mật khẩu không chính xác!';
      }
    } catch (err) {
      if (window.location.protocol === 'file:') {
        errorBox.innerHTML = '<span style="color:#f87171;font-weight:600;">Không thể kết nối API từ giao thức file:///</span><br><span style="font-size:12px;color:#94a3b8;">Vui lòng mở bằng đường dẫn:</span> <a href="http://localhost:3000/admin" style="color:#38bdf8;text-decoration:underline;font-weight:700;">http://localhost:3000/admin</a>';
      } else {
        errorBox.innerText = 'Lỗi kết nối máy chủ! ' + (err.message || '');
      }
    }
  });
}

function logout() {
  localStorage.removeItem('admin_token');
  fetch('/api/admin/logout', { method: 'POST' });
  window.location.reload();
}

function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
  }
  options.headers['Authorization'] = `Bearer ${authToken}`;
  return fetch(url, options);
}

// 3. Tab: Tổng quan (Overview)
async function loadOverview() {
  try {
    const res = await authFetch('/api/admin/stats');
    const data = await res.json();
    if (data.success) {
      const stats = data.stats;
      if (document.getElementById('stat-total-files')) {
        document.getElementById('stat-total-files').innerText = stats.totalFiles || 0;
      }
      if (document.getElementById('stat-unused-keys')) {
        document.getElementById('stat-unused-keys').innerText = stats.availableKeys ?? stats.unusedKeys ?? 0;
      }
      if (document.getElementById('stat-claimed-keys')) {
        document.getElementById('stat-claimed-keys').innerText = stats.claimedKeys || 0;
      }
      if (document.getElementById('stat-total-downloads')) {
        document.getElementById('stat-total-downloads').innerText = stats.totalDownloads || 0;
      }
      if (document.getElementById('stat-bypass-blocked')) {
        document.getElementById('stat-bypass-blocked').innerText = stats.totalBypassesBlocked ?? stats.bypassBlocked ?? 0;
      }
    }
  } catch (err) {
    console.error('Lỗi tải thống kê:', err);
  }
}

// 4. Tab: Quản lý Bản Tải (Files)
async function loadFiles() {
  const tbody = document.getElementById('files-table-body');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Đang tải danh sách bản tải...</td></tr>`;
  }

  try {
    const res = await authFetch('/api/admin/files');
    const data = await res.json();
    if (data.success) {
      loadedFiles = data.files || [];
      populateFileDropdowns(loadedFiles);

      if (!tbody) return;
      if (loadedFiles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-dim);">Chưa có bản tải nào. Hãy nhấn "Thêm Bản Tải Mới"!</td></tr>`;
        return;
      }

      tbody.innerHTML = loadedFiles.map(f => {
        const availKeys = f.availableKeys !== undefined ? f.availableKeys : 0;
        const totalKeys = f.totalKeys !== undefined ? f.totalKeys : 0;
        let stockBadge = '';
        const hasKeys = availKeys > 0 || totalKeys > 0;
        if (f.requiresLink4m || hasKeys) {
          if (availKeys > 0) {
            stockBadge = `<span class="pill pill-success"><i class="fa-solid fa-key"></i> Còn <strong>${availKeys}</strong> / ${totalKeys} key</span>`;
          } else {
            stockBadge = `<span class="pill pill-danger"><i class="fa-solid fa-triangle-exclamation"></i> HẾT KEY (${totalKeys} tổng)</span>`;
          }
        } else {
          stockBadge = `<span class="pill pill-info"><i class="fa-solid fa-bolt"></i> Không cần key</span>`;
        }

        const link4mBadge = f.requiresLink4m 
          ? `<span class="pill pill-warning"><i class="fa-solid fa-shield-halved"></i> 2 Link4M</span>`
          : `<span class="pill pill-info"><i class="fa-solid fa-link"></i> Trực tiếp</span>`;

        return `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(0,240,255,0.1); border: 1px solid rgba(0,240,255,0.3); display: flex; align-items: center; justify-content: center; color: var(--admin-primary); font-size: 16px;">
                  <i class="fa-solid fa-box-archive"></i>
                </div>
                <div>
                  <strong style="color: #fff; font-size: 14px; display: block;">${escapeHtml(f.title)}</strong>
                  <small style="color: var(--text-dim);">${escapeHtml(f.id)}</small>
                </div>
              </div>
            </td>
            <td><span class="pill pill-purple">${escapeHtml(f.category || 'General')}</span></td>
            <td><code>${escapeHtml(f.version || 'v1.0')}</code></td>
            <td>${escapeHtml(f.fileSize || 'N/A')}</td>
            <td><strong style="color: var(--admin-cyan);">${f.downloadCount || 0}</strong></td>
            <td>${stockBadge}</td>
            <td>${link4mBadge}</td>
            <td>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button class="btn-admin btn-primary" style="padding: 4px 8px; font-size: 11.5px;" onclick="openAddKeysForFile('${f.id}', '${escapeHtml(f.title).replace(/'/g, "\\'")}')" title="Nạp key riêng cho app này">
                  <i class="fa-solid fa-plus"></i> Nạp Key
                </button>
                <button class="btn-admin btn-secondary" style="padding: 4px 8px; font-size: 11.5px; background: rgba(168, 85, 247, 0.15); border-color: rgba(168, 85, 247, 0.4); color: #c084fc;" onclick="openGenKeysForFile('${f.id}', '${escapeHtml(f.title).replace(/'/g, "\\'")}')" title="Sinh key riêng cho app này">
                  <i class="fa-solid fa-wand-magic-sparkles"></i> Sinh Key
                </button>
                <button class="btn-admin btn-secondary" style="padding: 4px 8px; font-size: 11.5px;" onclick="filterKeysBySelectedFile('${f.id}')" title="Xem danh sách key của app này">
                  <i class="fa-solid fa-eye"></i> Xem Key
                </button>
                <button class="btn-admin btn-secondary" style="padding: 4px 8px; font-size: 11.5px;" onclick="editFile('${f.id}')" title="Sửa bản tải">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-admin btn-danger" style="padding: 4px 8px; font-size: 11.5px;" onclick="deleteFile('${f.id}')" title="Xóa file">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="color: var(--admin-danger); text-align: center;">Lỗi tải danh sách file!</td></tr>`;
    }
  }
}

// Cập nhật các Dropdown chọn File trong giao diện Admin (Tách riêng từng App)
function populateFileDropdowns(files) {
  // 1. Dropdown lọc Keys
  const filterSelect = document.getElementById('key-filter-file');
  if (filterSelect) {
    const currentVal = filterSelect.value || 'all';
    if (!files || files.length === 0) {
      filterSelect.innerHTML = `<option value="all">⚠️ Chưa có bản tải / app nào</option>`;
    } else {
      filterSelect.innerHTML = `<option value="all">📂 Tất Cả Bản Tải / App (${files.length} app)</option>` +
        files.map(f => `<option value="${f.id}">🎯 ${escapeHtml(f.title)} (${f.version}) - Còn ${f.availableKeys || 0} key</option>`).join('');
      if (Array.from(filterSelect.options).some(o => o.value === currentVal)) {
        filterSelect.value = currentVal;
      }
    }
  }

  // 2. Dropdown Bulk Add Keys (Bắt buộc chọn app, KHÔNG dùng key chung)
  const bulkSelect = document.getElementById('bulk-file-id');
  if (bulkSelect) {
    const currentVal = bulkSelect.value;
    if (!files || files.length === 0) {
      bulkSelect.innerHTML = `<option value="">⚠️ Chưa có App nào - Hãy tạo App trước!</option>`;
    } else {
      bulkSelect.innerHTML = files.map(f => `<option value="${f.id}">🎯 ${escapeHtml(f.title)} (${f.version}) [Còn ${f.availableKeys || 0} key]</option>`).join('');
      if (currentVal && Array.from(bulkSelect.options).some(o => o.value === currentVal)) {
        bulkSelect.value = currentVal;
      }
    }
  }

  // 3. Dropdown Auto Gen Keys (Bắt buộc chọn app, KHÔNG dùng key chung)
  const genSelect = document.getElementById('gen-file-id');
  if (genSelect) {
    const currentVal = genSelect.value;
    if (!files || files.length === 0) {
      genSelect.innerHTML = `<option value="">⚠️ Chưa có App nào - Hãy tạo App trước!</option>`;
    } else {
      genSelect.innerHTML = files.map(f => `<option value="${f.id}">🎯 ${escapeHtml(f.title)} (${f.version}) [Còn ${f.availableKeys || 0} key]</option>`).join('');
      if (currentVal && Array.from(genSelect.options).some(o => o.value === currentVal)) {
        genSelect.value = currentVal;
      }
    }
  }
}

// 5. Tab: Quản lý Keys (Tách riêng theo từng File)
async function loadKeys() {
  const tbody = document.getElementById('keys-table-body');
  if (!tbody) return;

  const filterFile = document.getElementById('key-filter-file');
  const selectedFileId = filterFile ? filterFile.value : 'all';

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Đang tải danh sách keys...</td></tr>`;

  try {
    let url = '/api/admin/keys';
    if (selectedFileId && selectedFileId !== 'all') {
      url += `?fileId=${encodeURIComponent(selectedFileId)}`;
    }
    const res = await authFetch(url);
    const data = await res.json();
    if (data.success) {
      loadedKeys = data.keys || [];
      renderFilteredKeys();
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--admin-danger); text-align: center;">Lỗi tải keys!</td></tr>`;
  }
}

function renderFilteredKeys() {
  const tbody = document.getElementById('keys-table-body');
  if (!tbody) return;

  const statusFilter = document.getElementById('key-filter-status') ? document.getElementById('key-filter-status').value : 'all';
  let filtered = loadedKeys;

  if (statusFilter !== 'all') {
    filtered = filtered.filter(k => k.status === statusFilter);
  }

  const countSummary = document.getElementById('key-count-summary');
  if (countSummary) {
    const unused = filtered.filter(k => k.status === 'UNUSED').length;
    const claimed = filtered.filter(k => k.status === 'CLAIMED').length;
    countSummary.innerHTML = `Hiển thị <strong>${filtered.length}</strong> key (<strong>${unused}</strong> sẵn có, <strong>${claimed}</strong> đã cấp)`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-dim);">Không có key nào phù hợp với bộ lọc hiện tại.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(k => {
    let statusPill = '';
    if (k.status === 'UNUSED') statusPill = `<span class="pill pill-success">🟢 CHƯA DÙNG</span>`;
    else if (k.status === 'CLAIMED') statusPill = `<span class="pill pill-info">🔵 ĐÃ CẤP</span>`;
    else statusPill = `<span class="pill pill-danger">${escapeHtml(k.status)}</span>`;

    const expireStr = k.expiresAt ? new Date(k.expiresAt).toLocaleString('vi-VN') : '---';
    const fileTitleStr = k.fileTitle || (k.fileId && k.fileId !== 'global' ? k.fileId : 'Key Dùng Chung');

    return `
      <tr>
        <td>
          <code style="color: var(--admin-primary); font-family: var(--font-mono); font-weight: 700; font-size: 13.5px;">${escapeHtml(k.key)}</code>
          <button onclick="copyToClipboard('${escapeHtml(k.key)}')" style="background: none; border: none; color: var(--text-dim); cursor: pointer; margin-left: 6px;" title="Sao chép">
            <i class="fa-solid fa-copy"></i>
          </button>
        </td>
        <td>
          <span class="pill pill-purple" style="font-size: 12px; font-weight: 600;">
            <i class="fa-solid fa-box"></i> ${escapeHtml(fileTitleStr)}
          </span>
        </td>
        <td>${statusPill}</td>
        <td><strong>${k.durationHours || 24}h</strong></td>
        <td><small style="color: var(--text-dim);">${expireStr}</small></td>
        <td><small style="color: var(--text-dim);">${escapeHtml(k.note || '---')}</small></td>
        <td>
          <button class="btn-admin btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteKey('${k.id}')" title="Xóa key">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Chuyển nhanh sang tab Keys và lọc đúng file
function filterKeysBySelectedFile(fileId) {
  switchAdminTab('keys');
  setTimeout(() => {
    const filterSelect = document.getElementById('key-filter-file');
    if (filterSelect) {
      filterSelect.value = fileId;
      loadKeys();
    }
  }, 100);
}

// Mở modal nạp key riêng cho app/file
function openAddKeysForFile(fileId, fileTitle) {
  openModal('modal-add-keys');
  const bulkSelect = document.getElementById('bulk-file-id');
  if (bulkSelect) {
    bulkSelect.value = fileId;
  }
  const modalTitle = document.querySelector('#modal-add-keys h3');
  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fa-solid fa-plus-circle" style="color:var(--admin-primary);"></i> Nhập Kho Key Riêng Cho: <span style="color:var(--admin-primary); font-weight:700;">${escapeHtml(fileTitle)}</span>`;
  }
  const noteInput = document.getElementById('bulk-note');
  if (noteInput) {
    noteInput.value = `Kho Key riêng cho ${fileTitle}`;
  }
}

// Mở modal tự động sinh key riêng cho app/file
function openGenKeysForFile(fileId, fileTitle) {
  openModal('modal-gen-keys');
  const genSelect = document.getElementById('gen-file-id');
  if (genSelect) {
    genSelect.value = fileId;
  }
  const modalTitle = document.querySelector('#modal-gen-keys h3');
  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--admin-purple);"></i> Sinh Key Tự Động Cho: <span style="color:var(--admin-primary); font-weight:700;">${escapeHtml(fileTitle)}</span>`;
  }
  onGenFileChange();
}

function openBulkKeysModal() {
  if (!loadedFiles || loadedFiles.length === 0) {
    alert('⚠️ Bạn chưa tạo Bản Tải / App nào!\n\nVui lòng vào mục "Quản Lý Bản Tải" tạo App trước, sau đó mới nạp kho key riêng cho App đó để tránh lỗi không khớp key.');
    switchAdminTab('files');
    return;
  }
  const modalTitle = document.querySelector('#modal-add-keys h3');
  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fa-solid fa-plus-circle" style="color:var(--admin-primary);"></i> Nhập Kho Key Riêng Cho App`;
  }
  openModal('modal-add-keys');
}

function openGenKeysModal() {
  if (!loadedFiles || loadedFiles.length === 0) {
    alert('⚠️ Bạn chưa tạo Bản Tải / App nào!\n\nVui lòng vào mục "Quản Lý Bản Tải" tạo App trước, sau đó mới sinh kho key riêng cho App đó để tránh lỗi không khớp key.');
    switchAdminTab('files');
    return;
  }
  const modalTitle = document.querySelector('#modal-gen-keys h3');
  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--admin-purple);"></i> Sinh Key Tự Động Cho App`;
  }
  openModal('modal-gen-keys');
  onGenFileChange();
}

// 6. Form Quản lý Bản Tải (File)
function checkCategoryResource() {
  const catInput = document.getElementById('file-category');
  const reqCheck = document.getElementById('file-requires-link4m');
  const noticeEl = document.getElementById('file-category-resource-notice');
  if (!catInput || !reqCheck) return;
  const val = (catInput.value || '').toLowerCase();
  const isResource = val.includes('tài nguyên') || val.includes('tai nguyen') || val.includes('resource');
  if (isResource) {
    reqCheck.checked = false;
    if (noticeEl) noticeEl.style.display = 'block';
  } else {
    if (noticeEl) noticeEl.style.display = 'none';
  }
}

function setupFileForms() {
  const form = document.getElementById('file-form');
  if (!form) return;

  const catInput = document.getElementById('file-category');
  if (catInput) {
    catInput.addEventListener('input', checkCategoryResource);
    catInput.addEventListener('change', checkCategoryResource);
  }

  const fileInputEl = document.getElementById('file-upload-input');
  if (fileInputEl) {
    fileInputEl.addEventListener('change', () => {
      if (fileInputEl.files.length > 0) {
        const file = fileInputEl.files[0];
        const mb = file.size / (1024 * 1024);
        const str = mb >= 1 ? mb.toFixed(1) + ' MB' : (file.size / 1024).toFixed(0) + ' KB';
        const sizeInput = document.getElementById('file-size');
        if (sizeInput) sizeInput.value = str;
        const notice = document.getElementById('upload-file-notice');
        if (notice) {
          if (mb > 15) {
            notice.style.color = '#f87171';
            notice.innerHTML = `⚠️ <strong>Cảnh báo:</strong> Tệp tin nặng <strong>${str}</strong>! Máy chủ web hosting sẽ bị treo/lỗi nếu upload trực tiếp file nặng trên 15MB. Khuyên bạn nên up lên <strong>Mediafire / Google Drive</strong> rồi dán link để lưu siêu tốc trong 0.1s!`;
          } else {
            notice.style.color = '#34d399';
            notice.innerHTML = `✅ Đã chọn tệp: <strong>${file.name}</strong> (${str}).`;
          }
        }
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('file-edit-id').value;
    const title = document.getElementById('file-title').value.trim();
    const category = document.getElementById('file-category').value.trim();
    const version = document.getElementById('file-version').value.trim();
    const fileSize = document.getElementById('file-size').value.trim();
    const fileType = document.getElementById('file-type').value;
    let downloadUrl = document.getElementById('file-download-url').value.trim();
    const description = document.getElementById('file-description').value.trim();
    const requiresLink4m = document.getElementById('file-requires-link4m').checked;
    const fileInput = document.getElementById('file-upload-input');

    if (!title) {
      alert('Vui lòng nhập tên bản tải!');
      return;
    }

    if (downloadUrl && !downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) {
      downloadUrl = 'https://' + downloadUrl;
    }

    if (fileType === 'DIRECT_URL' && !downloadUrl) {
      alert('Vui lòng nhập liên kết tải file (URL) trực tiếp (Mediafire, Google Drive, Mega...)!');
      return;
    }

    if (fileType === 'LOCAL') {
      if (!editId && (!fileInput || fileInput.files.length === 0)) {
        alert('Vui lòng bấm "Chọn tệp tin" từ thiết bị của bạn để tải lên máy chủ!');
        return;
      }
      if (fileInput && fileInput.files.length > 0) {
        const chosen = fileInput.files[0];
        const mb = chosen.size / (1024 * 1024);
        if (mb > 15) {
          alert(`⚠️ Tệp tin bạn chọn có dung lượng ${mb.toFixed(1)} MB!\n\nMáy chủ web hosting (AwardSpace) sẽ bị nghẽn mạng và báo lỗi nếu upload trực tiếp file nặng trên 15MB.\n\n👉 CÁCH LÀM SIÊU TỐC (0.1 GIÂY):\n1. Upload file này lên Mediafire, Google Drive hoặc Mega.\n2. Chọn "🔗 Liên Kết Trực Tiếp (Mediafire, Mega, Drive...)" rồi dán link vào.\n3. Bấm Lưu là hoàn thành ngay lập tức!`);
          return;
        }
      }
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const origBtnHtml = submitBtn ? submitBtn.innerHTML : 'Lưu Bản Tải';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên... Vui lòng chờ...';
    }

    try {
      let res;
      if (fileType === 'LOCAL' && fileInput && fileInput.files.length > 0) {
        // Upload Multipart Form Data
        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('version', version);
        formData.append('fileSize', fileSize);
        formData.append('fileType', 'LOCAL');
        formData.append('downloadUrl', downloadUrl);
        formData.append('description', description);
        formData.append('requiresLink4m', requiresLink4m);
        formData.append('fileUpload', fileInput.files[0]);

        if (editId) {
          formData.append('id', editId);
          formData.append('editId', editId);
          res = await authFetch(`/api/admin/files/${editId}`, {
            method: 'POST',
            body: formData
          });
        } else {
          res = await authFetch('/api/admin/files', {
            method: 'POST',
            body: formData
          });
        }
      } else {
        // JSON Request
        const payload = {
          title,
          category,
          version,
          fileSize,
          fileType,
          downloadUrl,
          description,
          requiresLink4m
        };

        if (editId) {
          res = await authFetch(`/api/admin/files/${editId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
        } else {
          res = await authFetch('/api/admin/files', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
        }
      }

      let data;
      try {
        const resClone = res.clone();
        try {
          data = await res.json();
        } catch (_) {
          const txt = await resClone.text();
          if (txt.includes('504 Gateway') || txt.includes('Time-out') || txt.includes('Timeout')) {
            throw new Error('Máy chủ hosting bị Timeout (504) do file upload quá nặng hoặc mạng chậm. Hãy dùng link Mediafire/Drive để lưu tức thì 0.1s!');
          } else if (txt.includes('413') || txt.includes('Too Large')) {
            throw new Error('Tệp tin vượt quá dung lượng tối đa máy chủ cho phép (413 Payload Too Large)! Hãy dùng link Mediafire/Drive.');
          } else {
            const cleanTxt = txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            throw new Error(cleanTxt ? cleanTxt.substring(0, 140) : 'Phản hồi từ máy chủ không hợp lệ');
          }
        }
      } catch (parseErr) {
        throw parseErr;
      }

      if (res.ok && data.success) {
        showToast(editId ? 'Cập nhật bản tải thành công!' : 'Thêm bản tải mới thành công!', 'success');
        closeModal('modal-add-file');
        form.reset();
        document.getElementById('file-edit-id').value = '';
        loadFiles();
      } else {
        alert('Lỗi: ' + (data.message || 'Không thể lưu bản tải!'));
      }
    } catch (err) {
      console.error('Lỗi khi lưu bản tải:', err);
      if (window.location.protocol === 'file:') {
        alert('Không thể kết nối API máy chủ từ giao thức file:///.\nVui lòng mở trang web qua link:\nhttp://localhost:3000/admin');
      } else {
        alert('Lỗi máy chủ: ' + (err.message || 'Không thể gửi yêu cầu đến server!'));
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnHtml;
      }
    }
  });
}

function onFileTypeChange() {
  const type = document.getElementById('file-type').value;
  const groupUrl = document.getElementById('group-download-url');
  const groupUpload = document.getElementById('group-upload-file');
  if (type === 'LOCAL') {
    if (groupUrl) groupUrl.style.display = 'none';
    if (groupUpload) groupUpload.style.display = 'block';
  } else {
    if (groupUrl) groupUrl.style.display = 'block';
    if (groupUpload) groupUpload.style.display = 'none';
  }
}

function editFile(id) {
  const file = loadedFiles.find(f => f.id === id);
  if (!file) return;

  document.getElementById('file-edit-id').value = file.id;
  document.getElementById('modal-file-title').innerText = 'Chỉnh Sửa Bản Tải: ' + file.title;
  document.getElementById('file-title').value = file.title;
  document.getElementById('file-category').value = file.category || 'General';
  document.getElementById('file-version').value = file.version || 'v1.0';
  document.getElementById('file-size').value = file.fileSize || '';
  document.getElementById('file-type').value = file.fileType || 'DIRECT_URL';
  document.getElementById('file-download-url').value = file.downloadUrl || '';
  document.getElementById('file-description').value = file.description || '';
  document.getElementById('file-requires-link4m').checked = Boolean(file.requiresLink4m) || (Number(file.availableKeys) > 0) || (Number(file.totalKeys) > 0);
  checkCategoryResource();

  onFileTypeChange();
  openModal('modal-add-file');
}

async function deleteFile(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa bản tải này? Các key đã liên kết sẽ không còn dùng được.')) {
    return;
  }
  try {
    const res = await authFetch(`/api/admin/files/${id}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id: id })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa bản tải thành công!', 'success');
      loadFiles();
    } else {
      alert('Lỗi: ' + (data.message || 'Không thể xóa'));
    }
  } catch (err) {
    if (window.location.protocol === 'file:') {
      alert('Không thể kết nối API từ file:///.\nVui lòng mở: http://localhost:3000/admin');
    } else {
      alert('Lỗi kết nối máy chủ: ' + (err.message || ''));
    }
  }
}

// 7. Form Quản lý Keys (Bulk & Sinh tự động)
function setupKeyForms() {
  // Bulk Keys
  const bulkForm = document.getElementById('bulk-key-form');
  if (bulkForm) {
    bulkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileId = document.getElementById('bulk-file-id').value;
      if (!fileId || fileId === 'global' || fileId === 'all') {
        alert('⚠️ Vui lòng chọn đúng Bản Tải / App cụ thể cần nạp key!');
        return;
      }
      const keysText = document.getElementById('bulk-keys-text').value;
      const durationHours = document.getElementById('bulk-duration').value;
      const note = document.getElementById('bulk-note').value;

      try {
        const res = await authFetch('/api/admin/keys', {
          method: 'POST',
          body: JSON.stringify({ mode: 'bulk', fileId, keysText, durationHours, note })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          closeModal('modal-add-keys');
          bulkForm.reset();
          loadFiles();
          loadKeys();
        } else {
          alert('Lỗi: ' + data.message);
        }
      } catch (err) {
        alert('Lỗi kết nối máy chủ!');
      }
    });
  }

  // Auto Generate Keys
  const genForm = document.getElementById('gen-key-form');
  if (genForm) {
    genForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileId = document.getElementById('gen-file-id').value;
      if (!fileId || fileId === 'global' || fileId === 'all') {
        alert('⚠️ Vui lòng chọn đúng Bản Tải / App cụ thể cần sinh key!');
        return;
      }
      const count = document.getElementById('gen-count').value;
      const prefix = document.getElementById('gen-prefix').value;
      const durationHours = document.getElementById('gen-duration').value;

      try {
        const res = await authFetch('/api/admin/keys', {
          method: 'POST',
          body: JSON.stringify({ mode: 'generate', fileId, count, prefix, durationHours })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          closeModal('modal-gen-keys');
          loadFiles();
          loadKeys();
        } else {
          alert('Lỗi: ' + data.message);
        }
      } catch (err) {
        alert('Lỗi kết nối máy chủ!');
      }
    });
  }
}

function onGenFileChange() {
  const fileId = document.getElementById('gen-file-id').value;
  const prefixInput = document.getElementById('gen-prefix');
  if (!prefixInput) return;

  const file = loadedFiles.find(f => f.id === fileId);
  if (file) {
    const clean = file.title.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    prefixInput.value = clean.slice(0, 6) || 'VIP';
  } else {
    prefixInput.value = 'VIP';
  }
}

async function deleteKey(id) {
  if (!confirm('Xác nhận xóa mã key này?')) return;
  try {
    const res = await authFetch(`/api/admin/keys/${id}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id: id })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa key!', 'success');
      loadKeys();
      loadFiles();
    } else {
      alert('Lỗi: ' + (data.message || 'Không thể xóa key'));
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ: ' + (err.message || ''));
  }
}

// 8. Cài đặt & Anti-Bypass & Link4M API Direct Management
function updateLink4mStatusBadge(apiKey, mode) {
  const pill = document.getElementById('link4m-status-pill');
  if (!pill) return;
  const key = (apiKey || '').trim();
  if (!key) {
    pill.className = 'pill pill-warning';
    pill.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Chưa cấu hình (Chế độ Demo test)';
  } else {
    pill.className = 'pill pill-success';
    pill.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đang hoạt động (${mode === 'api' ? 'API' : 'QuickLink 0ms'})`;
  }
}

function toggleLink4mVisibility() {
  const input = document.getElementById('setting-link4m-key');
  const eye = document.getElementById('btn-toggle-eye');
  if (!input || !eye) return;
  if (input.type === 'password') {
    input.type = 'text';
    eye.className = 'fa-solid fa-eye-slash';
  } else {
    input.type = 'password';
    eye.className = 'fa-solid fa-eye';
  }
}

function copyLink4mKey() {
  const input = document.getElementById('setting-link4m-key');
  if (!input || !input.value.trim()) {
    showToast('Chưa có token để sao chép!', 'error');
    return;
  }
  navigator.clipboard.writeText(input.value.trim());
  showToast('Đã sao chép Link4M Token!', 'success');
}

async function saveLink4mKeyDirectly() {
  const input = document.getElementById('setting-link4m-key');
  const modeSelect = document.getElementById('setting-link4m-mode');
  const apiKey = (input ? input.value : '').trim();
  const mode = modeSelect ? modeSelect.value : 'quicklink';

  const resBox = document.getElementById('link4m-test-result');
  if (resBox) {
    resBox.style.display = 'block';
    resBox.style.background = 'rgba(0, 240, 255, 0.1)';
    resBox.style.border = '1px solid rgba(0, 240, 255, 0.3)';
    resBox.style.color = '#fff';
    resBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu cấu hình Link4M lên máy chủ...';
  }

  try {
    const res = await authFetch('/api/admin/link4m/save', {
      method: 'POST',
      body: JSON.stringify({ apiKey, mode })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã lưu cấu hình API Link4M thành công!', 'success');
      updateLink4mStatusBadge(apiKey, mode);
      if (resBox) {
        resBox.style.display = 'block';
        resBox.style.background = 'rgba(16, 185, 129, 0.15)';
        resBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
        resBox.style.color = '#a7f3d0';
        resBox.innerHTML = `
          <strong><i class="fa-solid fa-circle-check"></i> Lưu thành công!</strong><br>
          Token hoạt động: <code>${apiKey ? escapeHtml(apiKey.substring(0, 8)) + '...' : '(Để trống - Chế độ Demo)'}</code><br>
          Phương thức: <strong>${mode === 'api' ? 'API Link4M' : 'QuickLink Siêu Tốc (0ms)'}</strong>.<br>
          Người dùng vượt link từ lúc này sẽ được tính trực tiếp vào tài khoản Link4M của bạn!
        `;
      }
    } else {
      showToast('Lỗi lưu: ' + data.message, 'error');
      if (resBox) {
        resBox.style.display = 'block';
        resBox.style.background = 'rgba(239, 68, 68, 0.15)';
        resBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        resBox.style.color = '#fca5a5';
        resBox.innerHTML = `<strong><i class="fa-solid fa-circle-xmark"></i> Thất bại:</strong> ${escapeHtml(data.message)}`;
      }
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ!', 'error');
  }
}

async function testLink4mApi() {
  const input = document.getElementById('setting-link4m-key');
  const apiKey = (input ? input.value : '').trim();
  const resBox = document.getElementById('link4m-test-result');

  if (!apiKey) {
    alert('Vui lòng nhập API Token Link4M vào ô trước khi kiểm tra!');
    return;
  }

  if (resBox) {
    resBox.style.display = 'block';
    resBox.style.background = 'rgba(0, 240, 255, 0.1)';
    resBox.style.border = '1px solid rgba(0, 240, 255, 0.3)';
    resBox.style.color = '#fff';
    resBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi yêu cầu kiểm tra tới Link4M...';
  }

  try {
    const res = await authFetch('/api/admin/link4m/test', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    });
    const data = await res.json();
    if (resBox) {
      if (data.success) {
        resBox.style.background = data.warning ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)';
        resBox.style.border = data.warning ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)';
        resBox.style.color = data.warning ? '#fde68a' : '#a7f3d0';
        resBox.innerHTML = `
          <strong><i class="fa-solid ${data.warning ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> ${escapeHtml(data.message)}</strong><br>
          ${data.sampleUrl ? `Link thử nghiệm của bạn: <a href="${escapeHtml(data.sampleUrl)}" target="_blank" style="color: #38bdf8; text-decoration: underline; word-break: break-all;">${escapeHtml(data.sampleUrl)}</a>` : ''}
        `;
      } else {
        resBox.style.background = 'rgba(239, 68, 68, 0.15)';
        resBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        resBox.style.color = '#fca5a5';
        resBox.innerHTML = `<strong><i class="fa-solid fa-circle-xmark"></i> Kiểm tra thất bại:</strong> ${escapeHtml(data.message || 'Token không hợp lệ')}`;
      }
    }
  } catch (err) {
    if (resBox) {
      resBox.style.background = 'rgba(239, 68, 68, 0.15)';
      resBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
      resBox.style.color = '#fca5a5';
      resBox.innerHTML = '<strong><i class="fa-solid fa-circle-xmark"></i> Lỗi:</strong> Không thể kết nối kiểm tra API.';
    }
  }
}

async function loadSettings() {
  try {
    const res = await authFetch('/api/admin/settings');
    const data = await res.json();
    if (data.success) {
      const s = data.settings;
      const keyVal = s.link4mApiKey || '';
      const modeVal = s.link4mMode || 'quicklink';

      document.getElementById('setting-link4m-key').value = keyVal;
      if (document.getElementById('setting-link4m-mode')) {
        document.getElementById('setting-link4m-mode').value = modeVal;
      }
      updateLink4mStatusBadge(keyVal, modeVal);

      document.getElementById('setting-hmac-secret').value = s.hmacSecret || '';
      document.getElementById('setting-min-wait').value = s.minWaitSeconds !== undefined ? s.minWaitSeconds : 0;
      document.getElementById('setting-key-duration').value = s.keyDurationHours || 24;
      if (document.getElementById('setting-max-keys-ip')) {
        document.getElementById('setting-max-keys-ip').value = s.maxKeysPerIp || 2;
      }
      if (document.getElementById('setting-ip-limit-hours')) {
        document.getElementById('setting-ip-limit-hours').value = s.ipLimitHours || 24;
      }
      document.getElementById('setting-site-url').value = s.siteUrl || '';
      if (document.getElementById('setting-announcement')) {
        document.getElementById('setting-announcement').value = s.announcement || '';
      }
    }
  } catch (err) {
    console.error('Lỗi tải cài đặt:', err);
  }
}

function setupSettingsForm() {
  const form = document.getElementById('settings-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const link4mApiKey = document.getElementById('setting-link4m-key').value.trim();
    const link4mMode = document.getElementById('setting-link4m-mode') ? document.getElementById('setting-link4m-mode').value : 'quicklink';
    const hmacSecret = document.getElementById('setting-hmac-secret').value.trim();
    const minWaitSeconds = document.getElementById('setting-min-wait').value;
    const keyDurationHours = document.getElementById('setting-key-duration').value;
    const maxKeysPerIp = document.getElementById('setting-max-keys-ip') ? document.getElementById('setting-max-keys-ip').value : 2;
    const ipLimitHours = document.getElementById('setting-ip-limit-hours') ? document.getElementById('setting-ip-limit-hours').value : 24;
    const siteUrl = document.getElementById('setting-site-url').value.trim();
    const announcement = document.getElementById('setting-announcement') ? document.getElementById('setting-announcement').value.trim() : '';
    const newAdminPassword = document.getElementById('setting-new-password').value.trim();

    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          link4mApiKey,
          link4mMode,
          hmacSecret,
          minWaitSeconds,
          keyDurationHours,
          maxKeysPerIp,
          ipLimitHours,
          siteUrl,
          announcement,
          newAdminPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Đã lưu toàn bộ cấu hình thành công!', 'success');
        updateLink4mStatusBadge(link4mApiKey, link4mMode);
        document.getElementById('setting-new-password').value = '';
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ!');
    }
  });
}

async function resetAllIpLimits() {
  if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử giới hạn IP? Các IP đã lấy đủ 2 lần sẽ được tính lại từ đầu.')) {
    return;
  }
  try {
    const res = await authFetch('/api/admin/ip-claims/reset', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Đã reset toàn bộ giới hạn IP!', 'success');
    } else {
      alert('Lỗi: ' + data.message);
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ!');
  }
}

function generateNewSecret() {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  document.getElementById('setting-hmac-secret').value = rand;
  showToast('Đã sinh khóa HMAC Secret mới! Hãy nhấn Lưu Cài Đặt.');
}

// 9. Tab: Logs / Anti-Bypass Monitor
async function loadLogs() {
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Đang tải lịch sử...</td></tr>`;

  try {
    const res = await authFetch('/api/admin/logs');
    const data = await res.json();
    if (data.success) {
      if (data.logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">Chưa có nhật ký nào</td></tr>`;
        return;
      }
      tbody.innerHTML = data.logs.map(l => {
        let pillClass = 'pill-info';
        if (l.status === 'SUCCESS') pillClass = 'pill-success';
        else if (l.status === 'BYPASS_BLOCKED') pillClass = 'pill-danger';
        else if (l.status === 'INVALID_HMAC' || l.status === 'TAMPERED_TOKEN') pillClass = 'pill-danger';
        else if (l.status === 'EXPIRED') pillClass = 'pill-warning';

        const timeStr = new Date(l.timestamp).toLocaleTimeString('vi-VN') + ' ' + new Date(l.timestamp).toLocaleDateString('vi-VN');

        return `
          <tr>
            <td><small style="color: var(--text-dim);">${timeStr}</small></td>
            <td><code style="color: #fff;">${escapeHtml(l.ip)}</code></td>
            <td><span class="pill ${pillClass}">${l.status}</span></td>
            <td>${l.timeTakenSeconds !== null ? `<strong>${l.timeTakenSeconds}s</strong>` : '---'}</td>
            <td>${escapeHtml(l.reason || '---')}</td>
            <td><small style="color: var(--text-dim);">${escapeHtml(l.userAgent ? l.userAgent.substring(0, 35) + '...' : '---')}</small></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--admin-danger); text-align: center;">Lỗi tải nhật ký</td></tr>`;
  }
}

// 10. Modals Helper
function setupModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}" style="color: ${type === 'success' ? 'var(--admin-success)' : 'var(--admin-danger)'};"></i>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Đã sao chép vào bộ nhớ tạm!', 'success');
  });
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}