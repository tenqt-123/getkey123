/**
 * STORE VIP - CỔNG GET KEY & TẢI MOD GAME 2026
 * Frontend Engine & Smart Multi-Backend Link4M Anti-Bypass Integration
 */

// Global State
let currentStoreFiles = [];
let currentGetkeyFileId = null;
let currentPendingToken = null;
let currentVerifiedKeyData = null;
let detectedBackend = null; // 'node' (/api/...) or 'php' (api.php?endpoint=...)

/* ==========================================================
   SMART ZERO-FAILURE API ENGINE
   Tự động phát hiện và tương thích 100% giữa Node.js & PHP AwardSpace
   ========================================================== */
async function requestApi(endpoint, options = {}) {
    let cleanEp = endpoint;
    if (cleanEp.startsWith('/api/')) cleanEp = cleanEp.substring(5);
    else if (cleanEp.startsWith('api/')) cleanEp = cleanEp.substring(4);
    else if (cleanEp.startsWith('api.php?endpoint=')) cleanEp = cleanEp.substring(17);
    else if (cleanEp.startsWith('api.php?action=')) cleanEp = cleanEp.substring(15);

    if (window.location.protocol === 'file:') {
        try {
            return await fetch('http://localhost:3000/api/' + cleanEp, options);
        } catch (e) {
            throw new Error('Bạn đang mở tệp trực tiếp từ ổ đĩa (file://). Vui lòng truy cập qua máy chủ: http://localhost:3000 hoặc tải lên Hosting web!');
        }
    }
    
    // Tạo 2 URL ứng viên
    const nodeUrl = '/api/' + cleanEp;
    let phpUrl = 'api.php?endpoint=' + cleanEp;
    if (cleanEp.includes('?')) {
        const [epName, qs] = cleanEp.split('?');
        phpUrl = 'api.php?endpoint=' + epName + '&' + qs;
    }

    // Xác định thứ tự ưu tiên
    let candidates = [nodeUrl, phpUrl];
    if (detectedBackend === 'php' || window.location.pathname.endsWith('.php') || window.location.href.includes('.php')) {
        candidates = [phpUrl, nodeUrl];
    } else if (detectedBackend === 'node') {
        candidates = [nodeUrl, phpUrl];
    }

    let lastError = null;
    for (let i = 0; i < candidates.length; i++) {
        const url = candidates[i];
        try {
            const res = await fetch(url, options);
            if (res.status === 404 && i === 0 && candidates.length > 1) {
                // Thử ứng viên kế tiếp nếu 404
                continue;
            }
            if (url.startsWith('api.php')) {
                detectedBackend = 'php';
            } else if (url.startsWith('/api/')) {
                detectedBackend = 'node';
            }
            return res;
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('Không thể kết nối tới máy chủ!');
}

/* ==========================================================
   TOAST NOTIFICATION ENGINE
   ========================================================== */
function showToast(message, type = 'success') {
    let existingToast = document.querySelector('.toast-msg');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast-msg';

    let icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    if (type === 'danger' || type === 'error') {
        icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else if (type === 'warning') {
        icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fde047" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    } else if (type === 'info') {
        icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = icon + ' <span>' + escapeHtml(message) + '</span>';
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 20);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
    }, 3800);
}

/* ==========================================================
   CLIPBOARD & MODAL HELPERS
   ========================================================== */
function copyToClipboard(text, buttonElement) {
    if (!navigator.clipboard) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast("Đã sao chép vào bộ nhớ tạm!", "success");
        } catch (err) {
            showToast("Không thể sao chép tự động", "error");
        }
        document.body.removeChild(textArea);
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        showToast("Đã sao chép thành công!", "success");
        if (buttonElement) {
            const originalHtml = buttonElement.innerHTML;
            buttonElement.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Đã chép</span>';
            setTimeout(() => {
                buttonElement.innerHTML = originalHtml;
            }, 2000);
        }
    }).catch(err => {
        showToast("Lỗi sao chép: " + err, "error");
    });
}

function scrollToSection(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ==========================================================
   DOWNLOAD MODAL WITH ANTIVIRUS & CHECKSUM SCAN (4 SERVERS)
   ========================================================== */
function initiateDownload(data, fallbackSize = '38 MB') {
    const modal = document.getElementById('downloadModal');
    let file = (typeof data === 'string') ? {
        title: data,
        fileSize: fallbackSize,
        version: 'v2026',
        link_mediafire: 'https://www.mediafire.com',
        link_drive: 'https://drive.google.com',
        link_mega: 'https://mega.nz',
        link_direct: '#'
    } : data;

    if (!modal) {
        showToast('Đang chuẩn bị tải: ' + file.title, 'info');
        return;
    }

    const titleEl = document.getElementById('dlModalFileName');
    const sizeEl = document.getElementById('dlModalFileSize');
    const progressEl = document.getElementById('dlProgressBar');
    const statusEl = document.getElementById('dlModalStatus');
    const serverListEl = document.getElementById('dlModalServers');

    if (titleEl) titleEl.innerText = file.title;
    if (sizeEl) sizeEl.innerText = 'Phiên bản: ' + (file.version || 'v2026') + ' • Dung lượng: ' + (file.fileSize || file.size || '38 MB');
    if (progressEl) progressEl.style.width = '0%';
    if (statusEl) statusEl.innerText = 'Đang quét bảo mật Antivirus & Kiểm tra checksum...';
    if (serverListEl) serverListEl.style.display = 'none';

    openModal('downloadModal');

    let percent = 0;
    const interval = setInterval(() => {
        percent += 25;
        if (progressEl) progressEl.style.width = percent + '%';
        if (percent >= 100) {
            clearInterval(interval);
            if (statusEl) {
                statusEl.innerHTML = '<span style="color: #34d399; font-weight: 600;">✓ Tệp an toàn 100% (No Virus, Clean Checksum). Chọn server tải bên dưới:</span>';
            }

            if (serverListEl) {
                const mfLink = file.link_mediafire || file.downloadUrl || 'https://www.mediafire.com';
                const driveLink = file.link_drive || mfLink;
                const megaLink = file.link_mega || mfLink;
                const directLink = file.link_direct || mfLink;

                serverListEl.innerHTML = `
                    <!-- Server 1: MediaFire VIP -->
                    <div class="dl-modal-server-item">
                        <div class="dl-srv-left">
                            <div class="dl-srv-icon-badge" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path></svg>
                            </div>
                            <div>
                                <div class="dl-srv-title">
                                    <span>Server 1: MediaFire VIP</span>
                                    <span class="badge badge-green" style="font-size: 0.65rem;">Tốc độ cao</span>
                                </div>
                                <div class="dl-srv-sub">Tải không giới hạn băng thông, không mã captcha</div>
                            </div>
                        </div>
                        <div class="dl-srv-actions">
                            <button type="button" class="btn btn-glass btn-sm" onclick="copyToClipboard('${mfLink}', this)">
                                <span>Copy Link</span>
                            </button>
                            <a href="${mfLink}" target="_blank" rel="noopener noreferrer" class="btn btn-cta-glow btn-sm">
                                <span>Tải MediaFire</span>
                            </a>
                        </div>
                    </div>

                    <!-- Server 2: Google Drive VIP -->
                    <div class="dl-modal-server-item">
                        <div class="dl-srv-left">
                            <div class="dl-srv-icon-badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                            </div>
                            <div>
                                <div class="dl-srv-title">
                                    <span>Server 2: Google Drive VIP</span>
                                    <span class="badge badge-blue" style="font-size: 0.65rem;">Khuyên dùng</span>
                                </div>
                                <div class="dl-srv-sub">Đường truyền máy chủ Google ổn định 24/7</div>
                            </div>
                        </div>
                        <div class="dl-srv-actions">
                            <button type="button" class="btn btn-glass btn-sm" onclick="copyToClipboard('${driveLink}', this)">
                                <span>Copy Link</span>
                            </button>
                            <a href="${driveLink}" target="_blank" rel="noopener noreferrer" class="btn btn-primary-blue btn-sm">
                                <span>Tải Google Drive</span>
                            </a>
                        </div>
                    </div>

                    <!-- Server 3: Mega.nz Cloud -->
                    <div class="dl-modal-server-item">
                        <div class="dl-srv-left">
                            <div class="dl-srv-icon-badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>
                            </div>
                            <div>
                                <div class="dl-srv-title">
                                    <span>Server 3: Mega.nz Cloud</span>
                                    <span class="badge badge-yellow" style="font-size: 0.65rem;">Dự phòng</span>
                                </div>
                                <div class="dl-srv-sub">Lưu trữ đám mây mã hóa bảo mật quốc tế</div>
                            </div>
                        </div>
                        <div class="dl-srv-actions">
                            <button type="button" class="btn btn-glass btn-sm" onclick="copyToClipboard('${megaLink}', this)">
                                <span>Copy Link</span>
                            </button>
                            <a href="${megaLink}" target="_blank" rel="noopener noreferrer" class="btn btn-glass btn-sm">
                                <span>Tải Mega.nz</span>
                            </a>
                        </div>
                    </div>

                    <!-- Server 4: Tải Trực Tiếp -->
                    <div class="dl-modal-server-item">
                        <div class="dl-srv-left">
                            <div class="dl-srv-icon-badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </div>
                            <div>
                                <div class="dl-srv-title">
                                    <span>Server 4: Direct Link Gốc</span>
                                </div>
                                <div class="dl-srv-sub">Tải trực tiếp về thư mục Download của thiết bị</div>
                            </div>
                        </div>
                        <div class="dl-srv-actions">
                            <a href="${directLink}" target="_blank" rel="noopener noreferrer" class="btn btn-glass btn-sm" style="border-color: rgba(168, 85, 247, 0.4); color: #c084fc;">
                                <span>Tải Trực Tiếp</span>
                            </a>
                        </div>
                    </div>
                `;
                serverListEl.style.display = 'block';
            }
        }
    }, 160);
}

/* ==========================================================
   LOAD STORE FILES & DYNAMIC RENDER
   (Chỉ khi nào Admin up file thì mới hiển thị file)
   ========================================================== */
async function loadStoreFiles() {
    try {
        const res = await requestApi('files');
        if (!res.ok) throw new Error('Mã phản hồi: ' + res.status);
        const data = await res.json();
        
        currentStoreFiles = Array.isArray(data) ? data : (data.files || []);
        
        renderGetkeyCards(currentStoreFiles);
        renderDownloadCards(currentStoreFiles);
        
        const countEl = document.getElementById('heroFilesCount');
        if (countEl) countEl.innerText = currentStoreFiles.length;
    } catch (err) {
        console.warn('Lỗi load store files:', err.message);
        renderGetkeyCards([]);
        renderDownloadCards([]);
    }
}

function isResourceFile(file) {
    if (!file) return false;
    const cat = (file.category || '').toLowerCase();
    return cat.includes('tài nguyên') || cat.includes('tai nguyen') || cat.includes('resource');
}

function isKeyRequired(file) {
    if (!file) return false;
    // Nếu là mục Tài Nguyên: Tuyệt đối không cần key, không lên mục Get Key
    if (isResourceFile(file)) return false;

    // Tự động kích hoạt Get Key nếu file đã được nạp key vào kho (còn key hoặc tổng key > 0)
    const avail = Number(file.availableKeys) || 0;
    const total = Number(file.totalKeys) || 0;
    if (avail > 0 || total > 0) {
        return true;
    }

    if (file.requiresLink4m === false || file.requiresLink4m === 'false' || file.requiresLink4m === 0 || file.requiresLink4m === '0') {
        return false;
    }
    return Boolean(file.requiresLink4m);
}

function renderGetkeyCards(files) {
    const grid = document.getElementById('getkeyGrid');
    if (!grid) return;

    // Lọc: CHỈ các bản tải BẮT BUỘC có Key mới hiển thị ở Cổng Get Key (Tài nguyên không lên đây)
    const getkeyFiles = Array.isArray(files) ? files.filter(f => isKeyRequired(f)) : [];

    // Nếu chưa có file nào được tải lên: Hiển thị Empty State Cyber
    if (getkeyFiles.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-cyber">
                <div class="empty-icon-wrap">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <h4>Chưa Có Bản Tải Mở Nhận Key</h4>
                <p>Hiện chưa có bản mod hoặc tool nào mở nhận key. Khi Admin tải lên file mới trong bảng quản trị, bản tải sẽ hiển thị tại đây.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = getkeyFiles.map((file, idx) => {
        const stockCount = typeof file.availableKeys === 'number' ? file.availableKeys : (typeof file.unusedKeysCount === 'number' ? file.unusedKeysCount : 0);
        const isOutOfStock = stockCount <= 0;
        const stockText = isOutOfStock ? 'Hết key' : `Còn ${stockCount} key`;
        const stockColor = isOutOfStock ? '#fb7185' : '#34d399';
        const toolName = file.getkeyName || file.title;
        const platform = file.platform || 'PC • WINDOWS';
        const isAlternate = idx % 2 === 1;
        const iconClass = isAlternate ? 'icon-purple' : 'icon-red';

        return `
            <div class="getkey-card" data-selected-duration="24h" id="card_${escapeHtml(file.id)}">
                <div class="getkey-card-body">
                    <div class="getkey-card-head">
                        <div class="getkey-card-left">
                            <div class="getkey-card-icon ${iconClass}">
                                ${isAlternate ? 
                                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>' :
                                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>'
                                }
                            </div>
                            <div class="getkey-card-titles">
                                <h3>${escapeHtml(toolName)}</h3>
                                <span>${escapeHtml(platform)}</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span class="getkey-pill-badge badge-pro">VIP</span>
                        </div>
                    </div>

                    <p class="getkey-card-desc">${escapeHtml(file.description || 'Hệ thống tự động cấp phát mã key độc quyền qua Link4M.')}</p>

                    <div class="getkey-spec-box">
                        <div class="getkey-spec-item">
                            <div class="getkey-spec-left">
                                <div class="getkey-spec-icon-chk">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                                <span>Thời hạn</span>
                            </div>
                            <span class="getkey-spec-value">24h</span>
                        </div>
                        <div class="getkey-spec-item">
                            <div class="getkey-spec-left">
                                <div class="getkey-spec-icon-chk">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                                <span>Kho key</span>
                            </div>
                            <span class="getkey-spec-value" style="color: ${stockColor}; font-weight: 700;">${stockText}</span>
                        </div>
                        <div class="getkey-spec-item">
                            <div class="getkey-spec-left">
                                <div class="getkey-spec-icon-chk">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                                <span>Hỗ trợ</span>
                            </div>
                            <span class="getkey-spec-value">${escapeHtml(platform)}</span>
                        </div>
                        <div class="getkey-spec-item">
                            <div class="getkey-spec-left">
                                <div class="getkey-spec-icon-chk">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                                <span>Bypass</span>
                            </div>
                            <span class="getkey-spec-value">Link4m</span>
                        </div>
                    </div>

                    <div class="getkey-dur-single">
                        <div class="getkey-dur-single-tag">
                            <span class="dur-pulse-dot"></span>
                            <span>GÓI THỜI HẠN</span>
                        </div>
                        <div class="getkey-dur-single-val">
                            <span class="dur-main">24h</span>
                            <span class="dur-sub">VIP &bull; Kho key riêng</span>
                        </div>
                    </div>
                </div>

                <button type="button" class="getkey-btn-claim" ${isOutOfStock ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : ''} onclick="handleStartGetKey('${escapeHtml(file.id)}', '${escapeHtml(toolName)}', this)">
                    <span>${isOutOfStock ? 'HẾT KEY TẠM THỜI' : 'NHẬN KEY NGAY'}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </button>
            </div>
        `;
    }).join('');
}

function renderDownloadCards(files) {
    const grid = document.getElementById('downloadsGrid');
    if (!grid) return;

    if (!Array.isArray(files) || files.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-cyber">
                <div class="empty-icon-wrap">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </div>
                <h4>Kho Tải Xuống Đang Trống</h4>
                <p>Chưa có file nào được tải lên. Quản trị viên có thể vào ADMIN để thêm bản tải mới.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = files.map(file => {
        const cat = file.category || 'panel';
        const fileJson = escapeHtml(JSON.stringify(file));

        return `
            <div class="download-card" data-category="${escapeHtml(cat)}">
                <div>
                    <div class="dl-card-top">
                        <div class="dl-card-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        </div>
                        <div class="dl-card-meta">
                            <div class="dl-card-title">${escapeHtml(file.title)}</div>
                            <div class="dl-card-badges">
                                <span class="dl-badge-ver font-mono">${escapeHtml(file.version || 'v1.0')}</span>
                                <span class="dl-badge-size">&bull; ${escapeHtml(file.fileSize || '38 MB')}</span>
                            </div>
                        </div>
                    </div>

                    <p class="dl-card-desc">${escapeHtml(file.description || 'Bản cài đặt direct link tốc độ cao.')}</p>
                </div>

                <div class="dl-card-action">
                    <div class="dl-card-rating">
                        <span>★ 4.9</span>
                        <span style="color: var(--text-muted); font-size: 0.72rem; margin-left: 2px;">(10k)</span>
                    </div>

                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn btn-primary-blue btn-sm" onclick='initiateDownload(${fileJson})'>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            <span>Tải Xuống</span>
                        </button>
                        ${isKeyRequired(file) ? `
                            <button type="button" class="btn btn-glass btn-sm" style="border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;" onclick="handleStartGetKey('${escapeHtml(file.id)}', '${escapeHtml(file.title)}', this)">
                                <span>Lấy Key</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/* ==========================================================
   FILTER & SEARCH ENGINE
   ========================================================== */
function filterCategory(category, btnElement) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const searchInput = document.getElementById('dlSearchInput');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    filterCards(category, query);
}

function handleSearch(query) {
    const activeBtn = document.querySelector('.filter-btn.active');
    const category = activeBtn ? activeBtn.getAttribute('data-category') : 'all';
    filterCards(category, query.toLowerCase().trim());
}

function filterCards(category, query) {
    const cards = document.querySelectorAll('.download-card');
    cards.forEach(card => {
        const cardCat = card.getAttribute('data-category') || '';
        const title = (card.querySelector('.dl-card-title')?.innerText || '').toLowerCase();
        const desc = (card.querySelector('.dl-card-desc')?.innerText || '').toLowerCase();

        const matchCat = (category === 'all' || cardCat === category);
        const matchQuery = (!query || title.includes(query) || desc.includes(query));

        if (matchCat && matchQuery) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

/* ==========================================================
   GET KEY FLOW (LINK4M ANTI-BYPASS 2-STEP)
   ========================================================== */
async function handleStartGetKey(fileId, toolName, btnElement) {
    currentGetkeyFileId = fileId;
    const originalHtml = btnElement ? btnElement.innerHTML : '';

    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span>Đang tạo link Link4m...</span>
        `;
    }

    try {
        const res = await requestApi('session/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'KEY',
                targetFileId: fileId,
                fileId: fileId,
                durationHours: 24
            })
        });
        
        const data = await res.json();

        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalHtml;
        }

        const linkUrl = data.shortenedUrl || data.shortened_url || data.shortUrl || data.step1Url;
        if ((data.status === 'success' || data.success || data.shortenedUrl || data.shortUrl) && linkUrl) {
            openGetkeyLinkModal(toolName, linkUrl, 'BƯỚC 1/2: VƯỢT LINK LINK4M', 'VIP');
            showToast('Đã tạo link nhận key thành công! Vui lòng bấm Mở Link.', 'success');
        } else {
            showToast(data.message || data.error || 'Lỗi khi tạo phiên nhận key. Vui lòng thử lại!', 'error');
        }
    } catch (err) {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalHtml;
        }
        showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
    }
}

function openGetkeyLinkModal(toolName, shortenedUrl, stepText = 'BƯỚC 1/2', badge = 'VIP') {
    const titleSub = document.getElementById('modalLinkToolName');
    if (titleSub) titleSub.textContent = toolName;

    const badgeEl = document.getElementById('modalLinkToolBadge');
    if (badgeEl) badgeEl.textContent = badge;

    const stepEl = document.getElementById('modalLinkStepBadge');
    if (stepEl) stepEl.textContent = stepText;

    const linkText = document.getElementById('modalLinkUrlText');
    if (linkText) linkText.textContent = shortenedUrl;

    const openBtn = document.getElementById('modalBtnOpenLink');
    if (openBtn) {
        openBtn.href = shortenedUrl;
    }

    const copyBtn = document.getElementById('modalBtnCopyLink');
    if (copyBtn) {
        copyBtn.onclick = function() {
            copyToClipboard(shortenedUrl, copyBtn);
        };
    }

    openModal('getkeyLinkModal');
}

/* ==========================================================
   URL TOKEN VERIFICATION & STEP PROGRESSION
   ========================================================== */
async function checkUrlForVerification() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const step = urlParams.get('step');

    if (!token) return;

    currentPendingToken = token;

    // Nếu bước 1 quay lại
    if (step === '1') {
        openModal('step1SuccessModal');
        return;
    }

    // Xác thực token bước cuối
    await executeVerification(token);
}

async function continueStep2() {
    if (!currentPendingToken) {
        showToast('Không tìm thấy phiên làm việc', 'error');
        return;
    }

    const btn = document.getElementById('btnContinueStep2');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Đang chuyển hướng Bước 2...</span>';
    }

    try {
        const step2Endpoint = (detectedBackend === 'php' || window.location.pathname.endsWith('.php')) 
            ? 'api.php?endpoint=session/step2&token=' + encodeURIComponent(currentPendingToken)
            : '/api/session/step2?token=' + encodeURIComponent(currentPendingToken);
            
        window.location.href = step2Endpoint;
    } catch (err) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
        showToast('Lỗi khi mở Bước 2: ' + err.message, 'error');
    }
}

async function executeVerification(token) {
    showToast('Đang kiểm tra bảo mật Anti-Bypass HMAC...', 'info');

    try {
        const res = await requestApi('verify?token=' + encodeURIComponent(token));
        const data = await res.json();

        if (data.status === 'success' || data.success || data.key) {
            currentVerifiedKeyData = data;
            
            // Hiển thị Key Success Modal
            const codeEl = document.getElementById('successKeyCode');
            const titleEl = document.getElementById('successFileTitle');
            const durEl = document.getElementById('successKeyDuration');
            
            if (codeEl) codeEl.innerText = data.key || 'VIP-KEY-ACTIVATED';
            if (titleEl) titleEl.innerText = data.fileTitle || 'Bản Mod Game';
            if (durEl) durEl.innerText = (data.durationHours || 24) + ' Giờ';

            openModal('keySuccessModal');
            launchCelebrationConfetti();
            showToast('Kích hoạt bản quyền thành công!', 'success');

            // Xóa token khỏi thanh địa chỉ URL mà không reload trang
            if (window.history && window.history.replaceState) {
                const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
            }
        } else {
            showToast(data.message || data.error || 'Mã xác thực không hợp lệ hoặc đã hết hạn!', 'error');
        }
    } catch (err) {
        showToast('Lỗi xác thực: ' + err.message, 'error');
    }
}

function copySuccessKey(btn) {
    const codeEl = document.getElementById('successKeyCode');
    if (!codeEl) return;
    copyToClipboard(codeEl.innerText.trim(), btn);
}

function downloadAssociatedFile() {
    if (currentVerifiedKeyData && currentVerifiedKeyData.fileId) {
        const target = currentStoreFiles.find(f => f.id === currentVerifiedKeyData.fileId);
        if (target) {
            initiateDownload(target);
            return;
        }
    }
    scrollToSection('#downloads-box');
    closeModal('keySuccessModal');
}

/* ==========================================================
   TRA CỨU KEY MODAL (KEY LOOKUP)
   ========================================================== */
function openKeyCheckModal() {
    const resultBox = document.getElementById('checkKeyResult');
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }
    const input = document.getElementById('inputCheckKey');
    if (input) input.value = '';
    openModal('keyCheckModal');
}

async function submitCheckKey() {
    const input = document.getElementById('inputCheckKey');
    const resultBox = document.getElementById('checkKeyResult');
    if (!input || !resultBox) return;

    const keyVal = input.value.trim();
    if (!keyVal) {
        showToast('Vui lòng nhập mã key cần tra cứu', 'warning');
        return;
    }

    resultBox.style.display = 'block';
    resultBox.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Đang tra cứu dữ liệu máy chủ...</p>';

    try {
        const res = await requestApi('keys/check?key=' + encodeURIComponent(keyVal));
        const data = await res.json();

        if ((data.status === 'success' || data.success) && (data.data || data.key)) {
            const k = data.data || data;
            const isValid = k.isValid !== false && !k.isExpired;
            const badgeClass = isValid ? 'badge-green' : 'badge-red';
            const badgeText = isValid ? 'CÒN HẠN SỬ DỤNG' : 'HẾT HẠN';

            resultBox.innerHTML = `
                <div style="background: rgba(11, 17, 36, 0.85); border: 1px solid var(--border-cyber); border-radius: 12px; padding: 16px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span class="badge ${badgeClass}">${badgeText}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${escapeHtml(k.key)}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 6px;">
                        Bản tải áp dụng: <strong style="color: #38bdf8;">${escapeHtml(k.fileTitle || 'Tất cả file')}</strong>
                    </div>
                    <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 4px;">
                        Thời hạn: ${escapeHtml(k.durationHours || 24)} Giờ
                    </div>
                    ${k.expiresAt ? `<div style="font-size: 0.82rem; color: var(--text-muted);">Hết hạn lúc: ${new Date(k.expiresAt).toLocaleString('vi-VN')}</div>` : ''}
                </div>
            `;
        } else {
            resultBox.innerHTML = `
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 14px; color: #fb7185; font-size: 0.85rem;">
                    ✕ Không tìm thấy thông tin cho mã key này hoặc key chưa từng tồn tại trên hệ thống.
                </div>
            `;
        }
    } catch (err) {
        resultBox.innerHTML = `
            <div style="color: #fb7185; font-size: 0.85rem;">Lỗi tra cứu: ${escapeHtml(err.message)}</div>
        `;
    }
}

/* ==========================================================
   CONFETTI CELEBRATION ENGINE
   ========================================================== */
function launchCelebrationConfetti() {
    const canvas = document.getElementById('celebration-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#38bdf8', '#3b82f6', '#60a5fa', '#34d399', '#ffffff', '#a855f7'];

    for (let i = 0; i < 90; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 4,
            speedY: Math.random() * 3 + 2,
            speedX: Math.random() * 2 - 1,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 4 - 2
        });
    }

    let animationFrame;
    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.rotationSpeed;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();

            if (p.y > canvas.height) {
                p.y = -10;
                p.x = Math.random() * canvas.width;
            }
        });

        animationFrame = requestAnimationFrame(render);
    }

    render();

    setTimeout(() => {
        cancelAnimationFrame(animationFrame);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 4500);
}

/* ==========================================================
   DOM INITIALIZATION
   ========================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const mobileMenu = document.getElementById('mobileNavMenu');
    if (toggleBtn && mobileMenu) {
        toggleBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
        });
    }

    // Modal background overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    // FAQ accordion toggle
    document.querySelectorAll('.faq-item').forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                document.querySelectorAll('.faq-item').forEach(other => other.classList.remove('active'));
                if (!isActive) {
                    item.classList.add('active');
                }
            });
        }
    });

    // Enter auto submit cho ô tra cứu key
    const checkInput = document.getElementById('inputCheckKey');
    if (checkInput) {
        checkInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitCheckKey();
            }
        });
    }

    // Load store files (chỉ hiển thị khi admin up file) và kiểm tra token URL
    loadSiteAnnouncement();
    loadStoreFiles();
    checkUrlForVerification();
});

async function loadSiteAnnouncement() {
    const banner = document.getElementById('siteAnnouncementBanner');
    const textEl = document.getElementById('siteAnnouncementText');
    if (!banner || !textEl) return;

    try {
        const res = await requestApi('/api/info');
        const data = await res.json();
        if (data && data.success && data.announcement && data.announcement.trim() !== '') {
            textEl.innerHTML = escapeHtml(data.announcement.trim()).replace(/\n/g, '<br>');
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    } catch (err) {
        // Bỏ qua nếu chưa kết nối được API
    }
}
