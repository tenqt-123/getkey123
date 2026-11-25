<?php
/**
 * KEYMASTER PRO - Backend API PHP cho AwardSpace
 * Tương thích 100% với PHP 7.x / 8.x
 * Chạy trực tiếp dưới dạng file trần, không cần cài đặt Node.js
 */

ob_start(function($buffer) {
    $trimmed = trim($buffer);
    if (($pos = strpos($trimmed, '{"')) !== false) {
        return substr($trimmed, $pos);
    }
    return $buffer;
});
error_reporting(0);
ini_set('display_errors', '0');
ini_set('default_socket_timeout', '3');

// Tối ưu kết nối & Giải phóng tài nguyên ngay lập tức (Chống lỗi Web Server: Too many connections)
header('Connection: close');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');

function sendJsonResponse($data, $statusCode = 200) {
    if (ob_get_length()) {
        ob_clean();
    }
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// Đường dẫn file dữ liệu phẳng (Flat JSON) ngay trong thư mục web
define('DATA_DIR', __DIR__);
define('SETTINGS_FILE', DATA_DIR . '/data_settings.json');
define('KEYS_FILE', DATA_DIR . '/data_keys.json');
define('FILES_FILE', DATA_DIR . '/data_files.json');
define('SESSIONS_FILE', DATA_DIR . '/data_sessions.json');
define('LOGS_FILE', DATA_DIR . '/data_logs.json');
define('IP_CLAIMS_FILE', DATA_DIR . '/data_ip_claims.json');
define('RATELIMIT_FILE', DATA_DIR . '/data_ratelimit.json');

// ==================== CÁC HÀM TIỆN ÍCH FILE ====================

function readJsonFile($path, $default = []) {
    if (!file_exists($path)) {
        writeJsonFile($path, $default);
        return $default;
    }
    $content = @file_get_contents($path);
    if ($content === false || trim($content) === '') {
        return $default;
    }
    $data = json_decode($content, true);
    return is_array($data) ? $data : $default;
}

function writeJsonFile($path, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) return false;

    // Cách 1: Ghi trực tiếp có khóa file
    $bytes = @file_put_contents($path, $json, LOCK_EX);
    if ($bytes !== false) {
        return true;
    }

    // Cách 2: Ghi trực tiếp không khóa (dành cho máy chủ shared hosting chặn LOCK_EX)
    $bytes = @file_put_contents($path, $json);
    if ($bytes !== false) {
        return true;
    }

    // Cách 3: Fallback dùng tệp tạm
    $tempPath = $path . '.' . uniqid() . '.tmp';
    if (@file_put_contents($tempPath, $json) !== false) {
        if (@unlink($path)) {
            if (@rename($tempPath, $path)) return true;
        } else {
            if (@copy($tempPath, $path)) {
                @unlink($tempPath);
                return true;
            }
        }
        @unlink($tempPath);
    }
    return false;
}

// Tự động dọn dẹp dữ liệu cũ định kỳ (chống phình to file làm chậm máy chủ)
function autoCleanData() {
    if (mt_rand(1, 25) !== 1) return;

    $now = round(microtime(true) * 1000);
    $twoHoursAgo = $now - (2 * 3600 * 1000);

    // 1. Dọn dẹp session quá 2 giờ
    $sessions = readJsonFile(SESSIONS_FILE, []);
    $activeSessions = [];
    $dirty = false;
    foreach ($sessions as $id => $s) {
        $created = $s['createdAt'] ?? 0;
        if ($created > $twoHoursAgo && count($activeSessions) < 300) {
            $activeSessions[$id] = $s;
        } else {
            $dirty = true;
        }
    }
    if ($dirty) writeJsonFile(SESSIONS_FILE, $activeSessions);

    // 2. Dọn dẹp log (giữ tối đa 120 log mới nhất)
    $logs = readJsonFile(LOGS_FILE, []);
    if (count($logs) > 120) {
        writeJsonFile(LOGS_FILE, array_slice($logs, 0, 120));
    }
}

// Giới hạn tần suất gọi API từ mỗi IP (Chống bot spam làm sập Web Server AwardSpace)
function checkRequestRateLimit() {
    $ip = getClientIp();
    $now = time();
    $data = readJsonFile(RATELIMIT_FILE, []);
    $dirty = false;

    foreach ($data as $k => $v) {
        if (($v['t'] ?? 0) < ($now - 60)) {
            unset($data[$k]);
            $dirty = true;
        }
    }

    if (!isset($data[$ip])) {
        $data[$ip] = ['c' => 1, 't' => $now];
        $dirty = true;
    } else {
        $data[$ip]['c']++;
        $dirty = true;
    }

    if ($dirty) {
        writeJsonFile(RATELIMIT_FILE, $data);
    }

    // Tối đa 50 requests / phút / IP
    if ($data[$ip]['c'] > 50) {
        sendJsonResponse([
            'success' => false,
            'message' => 'Bạn đang gửi quá nhiều yêu cầu trong thời gian ngắn! Vui lòng chờ 1 phút để tiếp tục.'
        ], 429);
    }
}

function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode($data) {
    return base64_decode(strtr($data, '-_', '+/'));
}

function getClientIp() {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    if (strpos($ip, ',') !== false) {
        $parts = explode(',', $ip);
        $ip = trim($parts[0]);
    }
    if ($ip === '::1' || $ip === '::ffff:127.0.0.1') {
        $ip = '127.0.0.1';
    }
    return $ip;
}

function getRequestBody() {
    $raw = @file_get_contents('php://input');
    if ($raw) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) return $decoded;
    }
    return $_POST;
}

function getSettings() {
    $defaultSettings = [
        'hmacSecret' => 'b8d7a6e5f4c3b2a1908976543210fedcba987654321abcdef0123456789abcdef',
        'link4mApiKey' => '', // Mặc định để rỗng, Admin nhập API Token của chính mình
        'link4mMode' => 'quicklink', // 'quicklink' (Siêu tốc 0ms, không treo máy chủ) hoặc 'api'
        'minWaitSeconds' => 20,
        'keyDurationHours' => 24,
        'siteUrl' => '',
        'maxKeysPerIp' => 2,
        'ipLimitHours' => 24,
        'adminPassword' => 'thai',
        'announcement' => '',
        'jwtSecret' => 'default_jwt_secret_token_1234567890'
    ];

    $settings = readJsonFile(SETTINGS_FILE, $defaultSettings);
    $modified = false;
    foreach ($defaultSettings as $key => $val) {
        if (!isset($settings[$key])) {
            $settings[$key] = $val;
            $modified = true;
        }
    }
    if ($modified) {
        writeJsonFile(SETTINGS_FILE, $settings);
    }
    return $settings;
}

// Chỉ khởi tạo mảng rỗng nếu file chưa tồn tại, tuyệt đối không tự chèn dữ liệu mẫu
if (!file_exists(KEYS_FILE)) {
    writeJsonFile(KEYS_FILE, []);
}
if (!file_exists(FILES_FILE)) {
    writeJsonFile(FILES_FILE, []);
}

function checkIpLimit($ip) {
    $settings = getSettings();
    $max = (int)($settings['maxKeysPerIp'] ?? 2);
    $hours = (int)($settings['ipLimitHours'] ?? 24);
    $timeWindow = $hours * 3600 * 1000;
    $now = round(microtime(true) * 1000);

    $claims = readJsonFile(IP_CLAIMS_FILE, []);
    $userTimestamps = $claims[$ip] ?? [];
    $validTimestamps = array_values(array_filter($userTimestamps, function($t) use ($now, $timeWindow) {
        return ($now - $t) < $timeWindow;
    }));

    $count = count($validTimestamps);
    return [
        'allowed' => $count < $max,
        'count' => $count,
        'max' => $max,
        'remaining' => max(0, $max - $count)
    ];
}

function recordIpClaim($ip) {
    $claims = readJsonFile(IP_CLAIMS_FILE, []);
    if (!isset($claims[$ip])) $claims[$ip] = [];
    $claims[$ip][] = round(microtime(true) * 1000);
    writeJsonFile(IP_CLAIMS_FILE, $claims);
}

function addLog($action, $status, $reason, $timeTakenSeconds = null, $ip = null, $userAgent = null) {
    $logs = readJsonFile(LOGS_FILE, []);
    $newLog = [
        'id' => 'log_' . uniqid(),
        'action' => $action,
        'status' => $status,
        'reason' => $reason,
        'timeTakenSeconds' => $timeTakenSeconds,
        'ip' => $ip ?? getClientIp(),
        'userAgent' => $userAgent ?? ($_SERVER['HTTP_USER_AGENT'] ?? ''),
        'timestamp' => date('c')
    ];
    array_unshift($logs, $newLog);
    if (count($logs) > 500) {
        $logs = array_slice($logs, 0, 500);
    }
    writeJsonFile(LOGS_FILE, $logs);
}

// ==================== BẢO MẬT HMAC & LINK4M ====================

function createHmacSignature($payload, $secret) {
    return hash_hmac('sha256', $payload, $secret);
}

function generateSessionToken($type = 'KEY', $targetFileId = null, $ip = '127.0.0.1', $userAgent = '', $step = 1, $parentSessionId = null) {
    $settings = getSettings();
    $secret = $settings['hmacSecret'];

    $sessionId = 'ses_' . round(microtime(true) * 1000) . '_' . bin2hex(random_bytes(6));
    $createdAt = round(microtime(true) * 1000);
    $nonce = bin2hex(random_bytes(8));

    $payload = "{$sessionId}:{$createdAt}:{$nonce}:{$ip}:{$step}";
    $signature = createHmacSignature($payload, $secret);

    $tokenObj = [
        's' => $sessionId,
        'c' => $createdAt,
        'n' => $nonce,
        'st' => (int)$step,
        'sig' => $signature
    ];
    $tokenStr = base64url_encode(json_encode($tokenObj));

    $sessions = readJsonFile(SESSIONS_FILE, []);
    $sessions[$sessionId] = [
        'id' => $sessionId,
        'nonce' => $nonce,
        'status' => 'PENDING',
        'type' => $type,
        'step' => $step,
        'parentSessionId' => $parentSessionId,
        'targetFileId' => $targetFileId,
        'ip' => $ip,
        'userAgent' => $userAgent,
        'createdAt' => $createdAt
    ];
    writeJsonFile(SESSIONS_FILE, $sessions);

    return [
        'sessionId' => $sessionId,
        'token' => $tokenStr,
        'step' => $step,
        'createdAt' => $createdAt
    ];
}

function shortenLink4m($destinationUrl) {
    $settings = getSettings();
    $apiKey = trim($settings['link4mApiKey'] ?? '');
    $mode = $settings['link4mMode'] ?? 'quicklink';

    if (empty($apiKey)) {
        return [
            'shortenedUrl' => $destinationUrl,
            'isSimulated' => true
        ];
    }

    $quickLink = "https://link4m.co/st?api=" . urlencode($apiKey) . "&url=" . urlencode($destinationUrl);

    // Chế độ QuickLink chuẩn (Khuyên dùng cho AwardSpace: 0ms, không treo máy chủ, không lỗi kết nối)
    if ($mode === 'quicklink') {
        return [
            'shortenedUrl' => $quickLink,
            'isSimulated' => false
        ];
    }

    // Chế độ API Rút gọn (Nếu bật, timeout tối đa 2s để không bao giờ treo tiến trình PHP)
    if (function_exists('curl_init')) {
        $apiUrl = "https://link4m.co/api?api=" . urlencode($apiKey) . "&url=" . urlencode($destinationUrl) . "&format=json";
        $ch = curl_init($apiUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
        $res = curl_exec($ch);
        curl_close($ch);
        if ($res) {
            $data = json_decode($res, true);
            if (!empty($data['shortenedUrl'])) {
                return ['shortenedUrl' => $data['shortenedUrl'], 'isSimulated' => false];
            }
        }
    }

    return ['shortenedUrl' => $quickLink, 'isSimulated' => false];
}

function verifyAdminAuth() {
    $token = '';
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$authHeader && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
    } elseif (!empty($_COOKIE['admin_token'])) {
        $token = trim($_COOKIE['admin_token']);
    } elseif (!empty($_GET['admin_token'])) {
        $token = trim($_GET['admin_token']);
    } elseif (!empty($_POST['admin_token'])) {
        $token = trim($_POST['admin_token']);
    }

    if (!$token) return false;
    $parts = explode('.', $token);
    if (count($parts) !== 2) return false;

    $payloadJson = base64url_decode($parts[0]);
    $payload = json_decode($payloadJson, true);
    if (!$payload || ($payload['role'] ?? '') !== 'admin') return false;

    if (!empty($payload['exp']) && $payload['exp'] < time()) return false;

    $settings = getSettings();
    $jwtSecret = $settings['jwtSecret'] ?? 'default_jwt_secret_token_1234567890';
    $expectedSig = hash_hmac('sha256', $parts[0], $jwtSecret);
    return hash_equals($expectedSig, $parts[1]);
}

// ==================== BỘ ĐIỀU HƯỚNG ROUTER ====================

$endpoint = $_GET['endpoint'] ?? ($_GET['action'] ?? '');
if (empty($endpoint)) {
    // Hỗ trợ nếu được rewrite bởi .htaccess
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    if (preg_match('#/api/(.*)#', $requestUri, $m)) {
        $endpoint = explode('?', $m[1])[0];
    }
}
$endpoint = trim($endpoint, '/');
// Hỗ trợ chuẩn hóa alias action cũ
if ($endpoint === 'create_session') $endpoint = 'session/create';
if ($endpoint === 'step2') $endpoint = 'session/step2';
if ($endpoint === 'check_key') $endpoint = 'keys/check';
$method = $_SERVER['REQUEST_METHOD'];
$clientIp = getClientIp();

// Tự động giải phóng dữ liệu rác
autoCleanData();

// Chặn flood request đối với các endpoint công khai
if (strpos($endpoint, 'admin/') !== 0) {
    checkRequestRateLimit();
}

// 1. GET info
if ($endpoint === 'info' && $method === 'GET') {
    $settings = getSettings();
    $keys = readJsonFile(KEYS_FILE, []);
    $unusedCount = 0;
    foreach ($keys as $k) {
        if (($k['status'] ?? '') === 'UNUSED') $unusedCount++;
    }
    $ipCheck = checkIpLimit($clientIp);

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $autoSiteUrl = "{$protocol}://{$host}";

    echo json_encode([
        'success' => true,
        'siteUrl' => !empty($settings['siteUrl']) ? $settings['siteUrl'] : $autoSiteUrl,
        'minWaitSeconds' => (int)($settings['minWaitSeconds'] ?? 20),
        'hasLink4mKey' => !empty(trim($settings['link4mApiKey'] ?? '')),
        'availableKeys' => $unusedCount,
        'clientIp' => $clientIp,
        'maxKeysPerIp' => $ipCheck['max'],
        'ipClaimsToday' => $ipCheck['count'],
        'ipRemainingClaims' => $ipCheck['remaining'],
        'ipLimitReached' => !$ipCheck['allowed'],
        'announcement' => $settings['announcement'] ?? ''
    ]);
    exit;
}

// 2. GET files
if ($endpoint === 'files' && $method === 'GET') {
    $files = readJsonFile(FILES_FILE, []);
    $keys = readJsonFile(KEYS_FILE, []);

    $publicFiles = array_map(function($f) use ($keys) {
        $fileId = $f['id'];
        $avail = 0;
        $total = 0;
        foreach ($keys as $k) {
            if (($k['fileId'] ?? 'global') === $fileId) {
                $total++;
                if (($k['status'] ?? '') === 'UNUSED') $avail++;
            }
        }
        $isResource = preg_match('/(tài nguyên|tai nguyen|resource)/iu', $f['category'] ?? '');
        $hasKeys = ($total > 0 || $avail > 0);
        $isKeyReq = (!$isResource) && (!empty($f['requiresLink4m']) || $hasKeys);
        return [
            'id' => $f['id'],
            'title' => $f['title'],
            'description' => $f['description'] ?? '',
            'version' => $f['version'] ?? 'v1.0',
            'fileSize' => $f['fileSize'] ?? '0 MB',
            'category' => $f['category'] ?? 'General',
            'downloadCount' => $f['downloadCount'] ?? 0,
            'requiresLink4m' => $isKeyReq,
            'fileType' => $f['fileType'] ?? 'DIRECT_URL',
            'downloadUrl' => !empty($f['downloadUrl']) ? $f['downloadUrl'] : ($f['fileType'] === 'LOCAL' ? "api.php?endpoint=download&fileId={$f['id']}" : ''),
            'link_mediafire' => $f['link_mediafire'] ?? ($f['downloadUrl'] ?? ''),
            'link_drive' => $f['link_drive'] ?? ($f['downloadUrl'] ?? ''),
            'link_mega' => $f['link_mega'] ?? ($f['downloadUrl'] ?? ''),
            'link_direct' => $f['link_direct'] ?? ($f['downloadUrl'] ?? ''),
            'platform' => $f['platform'] ?? 'PC • WINDOWS',
            'getkeyName' => $f['getkeyName'] ?? $f['title'],
            'availableKeys' => $avail,
            'totalKeys' => $total,
            'createdAt' => $f['createdAt'] ?? date('c')
        ];
    }, $files);

    echo json_encode(['success' => true, 'files' => $publicFiles]);
    exit;
}

// 3. POST session/create
if ($endpoint === 'session/create' && $method === 'POST') {
    $body = getRequestBody();
    $type = $body['type'] ?? 'KEY';
    $targetFileId = $body['targetFileId'] ?? ($body['fileId'] ?? null);
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

    if ($type === 'KEY') {
        $ipCheck = checkIpLimit($clientIp);
        if (!$ipCheck['allowed']) {
            http_response_code(429);
            echo json_encode([
                'success' => false,
                'status' => 'IP_LIMIT_REACHED',
                'message' => "Địa chỉ IP của bạn ({$clientIp}) đã đạt giới hạn tối đa {$ipCheck['max']} lần lấy key trong 24 giờ. Vui lòng quay lại sau!"
            ]);
            exit;
        }

        $keys = readJsonFile(KEYS_FILE, []);
        $unusedCount = 0;
        foreach ($keys as $k) {
            if (($k['status'] ?? '') === 'UNUSED') {
                if ($targetFileId) {
                    if (($k['fileId'] ?? 'global') === $targetFileId) $unusedCount++;
                } else {
                    $unusedCount++;
                }
            }
        }
        if ($unusedCount <= 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'status' => 'OUT_OF_KEYS',
                'message' => 'Kho hiện tại đã hết key cho bản tải này! Quản trị viên chưa nạp thêm key mới. Vui lòng quay lại sau.'
            ]);
            exit;
        }
    }

    if ($type === 'FILE') {
        if (!$targetFileId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Thiếu mã file cần tải!']);
            exit;
        }
        $files = readJsonFile(FILES_FILE, []);
        $targetFile = null;
        foreach ($files as $f) {
            if ($f['id'] === $targetFileId) { $targetFile = $f; break; }
        }
        if (!$targetFile) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'File không tồn tại trên hệ thống!']);
            exit;
        }
        if (empty($targetFile['requiresLink4m'])) {
            echo json_encode([
                'success' => true,
                'direct' => true,
                'downloadUrl' => $targetFile['downloadUrl'] ?: "api.php?endpoint=download&fileId={$targetFile['id']}"
            ]);
            exit;
        }
    }

    $sessionToken = generateSessionToken($type, $targetFileId, $clientIp, $userAgent, 1);

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $settings = getSettings();
    $baseUrl = !empty($settings['siteUrl']) ? rtrim($settings['siteUrl'], '/') : "{$protocol}://{$host}";

    $destinationUrl = "{$baseUrl}/?token=" . urlencode($sessionToken['token']) . "&step=1";
    $shortened = shortenLink4m($destinationUrl);

    echo json_encode([
        'success' => true,
        'sessionId' => $sessionToken['sessionId'],
        'token' => $sessionToken['token'],
        'shortUrl' => $shortened['shortenedUrl'],
        'isSimulated' => $shortened['isSimulated'] ?? false,
        'step' => 1,
        'totalSteps' => 2,
        'type' => $type
    ]);
    exit;
}

// 4. session/step2 (Hỗ trợ cả POST và GET tự động chuyển hướng sang Bước 2)
if ($endpoint === 'session/step2') {
    $body = getRequestBody();
    $step1Token = $body['step1Token'] ?? ($_GET['token'] ?? '');
    if (empty($step1Token)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Thiếu mã xác thực Bước 1!']);
        exit;
    }

    $tokenObj = json_decode(base64url_decode($step1Token), true);
    if (!$tokenObj || empty($tokenObj['s']) || empty($tokenObj['sig'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Token Bước 1 không hợp lệ!']);
        exit;
    }

    $settings = getSettings();
    $secret = $settings['hmacSecret'];
    $sessionId = $tokenObj['s'];
    $createdAt = $tokenObj['c'] ?? 0;
    $nonce = $tokenObj['n'] ?? '';
    $step = (int)($tokenObj['st'] ?? 1);
    $signature = $tokenObj['sig'] ?? '';

    $sessions = readJsonFile(SESSIONS_FILE, []);
    $step1Session = $sessions[$sessionId] ?? null;

    // Kiểm tra tính hợp lệ của chữ ký HMAC Bước 1
    $candidateIps = array_unique([$clientIp, $step1Session['ip'] ?? '', '127.0.0.1', '::1']);
    $isSigValid = false;
    foreach ($candidateIps as $ipCheck) {
        if (!$ipCheck) continue;
        $expectedWithStep = "{$sessionId}:{$createdAt}:{$nonce}:{$ipCheck}:{$step}";
        $expectedLegacy = "{$sessionId}:{$createdAt}:{$nonce}:{$ipCheck}";
        if (hash_equals($signature, createHmacSignature($expectedWithStep, $secret)) ||
            hash_equals($signature, createHmacSignature($expectedLegacy, $secret))) {
            $isSigValid = true;
            break;
        }
    }
    if (!$isSigValid && $step1Session && ($step1Session['id'] ?? '') === $sessionId && ($step1Session['nonce'] ?? '') === $nonce) {
        $isSigValid = true;
    }

    if (!$isSigValid) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Chữ ký HMAC Bước 1 không hợp lệ hoặc đã bị chỉnh sửa!']);
        exit;
    }

    if (!$step1Session) {
        $step1Session = [
            'id' => $sessionId,
            'nonce' => $nonce,
            'status' => 'STEP1_COMPLETED',
            'type' => 'KEY',
            'step' => 1,
            'parentSessionId' => null,
            'targetFileId' => null,
            'ip' => $clientIp,
            'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
            'createdAt' => $createdAt,
            'claimedAt' => date('c')
        ];
    }

    $step1Session['status'] = 'STEP1_COMPLETED';
    $step1Session['step2Used'] = true;
    $sessions[$sessionId] = $step1Session;
    writeJsonFile(SESSIONS_FILE, $sessions);

    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $targetFileId = $step1Session['targetFileId'] ?? null;
    $sessionToken2 = generateSessionToken('KEY', $targetFileId, $clientIp, $userAgent, 2, $step1Session['id']);

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $baseUrl = !empty($settings['siteUrl']) ? rtrim($settings['siteUrl'], '/') : "{$protocol}://{$host}";

    $destinationUrl = "{$baseUrl}/?token=" . urlencode($sessionToken2['token']) . "&step=2";
    $shortened = shortenLink4m($destinationUrl);

    if ($method === 'GET' && !empty($shortened['shortenedUrl'])) {
        header('Location: ' . $shortened['shortenedUrl']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'sessionId' => $sessionToken2['sessionId'],
        'token' => $sessionToken2['token'],
        'shortUrl' => $shortened['shortenedUrl'],
        'isSimulated' => $shortened['isSimulated'] ?? false,
        'step' => 2,
        'totalSteps' => 2
    ]);
    exit;
}

// 5. GET verify
if ($endpoint === 'verify' && $method === 'GET') {
    $token = $_GET['token'] ?? '';
    if (empty($token)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'status' => 'INVALID_TOKEN', 'message' => 'Thiếu mã token xác thực!']);
        exit;
    }

    $tokenObj = json_decode(base64url_decode($token), true);
    if (!$tokenObj || empty($tokenObj['s']) || empty($tokenObj['c']) || empty($tokenObj['n']) || empty($tokenObj['sig'])) {
        addLog('VERIFY', 'INVALID_HMAC', 'Token sai định dạng mã hóa');
        http_response_code(400);
        echo json_encode(['success' => false, 'status' => 'INVALID_TOKEN', 'message' => 'Mã xác thực không hợp lệ hoặc đã bị chỉnh sửa!']);
        exit;
    }

    $sessionId = $tokenObj['s'];
    $createdAt = $tokenObj['c'];
    $nonce = $tokenObj['n'];
    $step = (int)($tokenObj['st'] ?? 1);
    $signature = $tokenObj['sig'];

    $settings = getSettings();
    $secret = $settings['hmacSecret'];
    $minWaitSeconds = (int)($settings['minWaitSeconds'] ?? 20);

    $sessions = readJsonFile(SESSIONS_FILE, []);
    $session = $sessions[$sessionId] ?? null;

    if ($session && ($session['status'] ?? '') === 'STEP1_COMPLETED' && $step === 1) {
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $targetFileId = $session['targetFileId'] ?? null;
        $sessionToken2 = generateSessionToken('KEY', $targetFileId, $clientIp, $userAgent, 2, $session['id']);
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $baseUrl = !empty($settings['siteUrl']) ? rtrim($settings['siteUrl'], '/') : "{$protocol}://{$host}";
        $destinationUrl2 = "{$baseUrl}/?token=" . urlencode($sessionToken2['token']) . "&step=2";
        $shortened2 = shortenLink4m($destinationUrl2);

        echo json_encode([
            'success' => true,
            'status' => 'STEP1_COMPLETED',
            'step' => 1,
            'totalSteps' => 2,
            'step1Token' => $token,
            'shortUrl' => $shortened2['shortenedUrl'],
            'step2Token' => $sessionToken2['token'],
            'isSimulated' => $shortened2['isSimulated'] ?? false,
            'elapsedSeconds' => round($session['timeTakenSeconds'] ?? 0, 1),
            'message' => 'Xác thực Bước 1/2 thành công! Bấm tiếp tục để làm Bước 2.'
        ]);
        exit;
    }

    if ($session && ($session['status'] ?? '') === 'CLAIMED') {
        addLog('VERIFY', 'REPLAY_ATTACK', 'Cố gắng sử dụng lại token đã nhận key');
        http_response_code(400);
        echo json_encode(['success' => false, 'status' => 'ALREADY_USED', 'message' => 'Link xác thực này đã được sử dụng trước đó!']);
        exit;
    }

    // Kiểm tra chữ ký HMAC
    $candidateIps = array_unique([$clientIp, $session['ip'] ?? '', '127.0.0.1', '::1']);
    $isSigValid = false;
    foreach ($candidateIps as $ipCheck) {
        if (!$ipCheck) continue;
        $expectedWithStep = "{$sessionId}:{$createdAt}:{$nonce}:{$ipCheck}:{$step}";
        $expectedLegacy = "{$sessionId}:{$createdAt}:{$nonce}:{$ipCheck}";
        if (hash_equals($signature, createHmacSignature($expectedWithStep, $secret)) ||
            hash_equals($signature, createHmacSignature($expectedLegacy, $secret))) {
            $isSigValid = true;
            break;
        }
    }

    if (!$isSigValid && $session && ($session['id'] ?? '') === $sessionId && ($session['nonce'] ?? '') === $nonce) {
        $isSigValid = true;
    }

    if (!$isSigValid) {
        addLog('VERIFY', 'INVALID_HMAC', 'Chữ ký HMAC không khớp');
        http_response_code(403);
        echo json_encode(['success' => false, 'status' => 'TAMPERED_TOKEN', 'message' => 'Cảnh báo: Chữ ký số HMAC không khớp hoặc token đã bị sửa đổi!']);
        exit;
    }

    $now = round(microtime(true) * 1000);
    $elapsedSeconds = max(0, ($now - $createdAt) / 1000.0);

    // Quá 15 phút -> Hết hạn
    if ($elapsedSeconds > 900) {
        if ($session) {
            $session['status'] = 'EXPIRED';
            $sessions[$sessionId] = $session;
            writeJsonFile(SESSIONS_FILE, $sessions);
        }
        addLog('VERIFY', 'EXPIRED', "Hết hạn sau {$elapsedSeconds}s");
        http_response_code(400);
        echo json_encode(['success' => false, 'status' => 'EXPIRED', 'message' => 'Phiên vượt link đã hết hạn (quá 15 phút). Vui lòng thử lại!']);
        exit;
    }

    // Đã gỡ bỏ chặn delta-time theo yêu cầu

    // Xác thực hợp lệ!
    $totalSteps = (int)($settings['totalSteps'] ?? 2);
    $isStep1 = ($step === 1 && $totalSteps > 1);
    if ($isStep1) {
        if ($session) {
            $session['status'] = 'STEP1_COMPLETED';
            $session['claimedAt'] = date('c');
            $session['timeTakenSeconds'] = round($elapsedSeconds, 1);
            $sessions[$sessionId] = $session;
        } else {
            $session = [
                'id' => $sessionId,
                'nonce' => $nonce,
                'status' => 'STEP1_COMPLETED',
                'type' => 'KEY',
                'step' => 1,
                'parentSessionId' => null,
                'targetFileId' => null,
                'ip' => $clientIp,
                'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
                'createdAt' => $createdAt,
                'claimedAt' => date('c'),
                'timeTakenSeconds' => round($elapsedSeconds, 1)
            ];
            $sessions[$sessionId] = $session;
        }
        writeJsonFile(SESSIONS_FILE, $sessions);
        addLog('VERIFY', 'SUCCESS', "Bước 1/2 hoàn thành hợp lệ trong " . round($elapsedSeconds, 1) . "s", round($elapsedSeconds, 1));

        // Tự động tạo luôn link bước 2/2 trả về ngay lập tức cho client
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $targetFileId = $session['targetFileId'] ?? null;
        $sessionToken2 = generateSessionToken('KEY', $targetFileId, $clientIp, $userAgent, 2, $session['id']);
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $baseUrl = !empty($settings['siteUrl']) ? rtrim($settings['siteUrl'], '/') : "{$protocol}://{$host}";
        $destinationUrl2 = "{$baseUrl}/?token=" . urlencode($sessionToken2['token']) . "&step=2";
        $shortened2 = shortenLink4m($destinationUrl2);

        echo json_encode([
            'success' => true,
            'status' => 'STEP1_COMPLETED',
            'step' => 1,
            'totalSteps' => 2,
            'step1Token' => $token,
            'targetFileId' => $targetFileId,
            'shortUrl' => $shortened2['shortenedUrl'],
            'step2Token' => $sessionToken2['token'],
            'isSimulated' => $shortened2['isSimulated'] ?? false,
            'elapsedSeconds' => round($elapsedSeconds, 1),
            'message' => 'Chúc mừng! Bạn đã hoàn thành Bước 1/2 thành công. Hãy tiếp tục vượt Bước 2/2 để nhận mã Key!'
        ]);
        exit;
    }

    // Hoàn thành Bước 2: Cấp Key hoặc File
    if ($session) {
        $session['status'] = 'CLAIMED';
        $session['claimedAt'] = date('c');
        $sessions[$sessionId] = $session;
        writeJsonFile(SESSIONS_FILE, $sessions);
    }

    if (($session['type'] ?? 'KEY') === 'KEY') {
        $keys = readJsonFile(KEYS_FILE, []);
        $targetFileId = $session['targetFileId'] ?? null;
        $targetFileName = '';
        if ($targetFileId) {
            $allFiles = readJsonFile(FILES_FILE, []);
            foreach ($allFiles as $f) {
                if ($f['id'] === $targetFileId) { $targetFileName = $f['title']; break; }
            }
        }

        $foundIndex = -1;
        if ($targetFileId) {
            foreach ($keys as $idx => $k) {
                if (($k['status'] ?? '') === 'UNUSED' && ($k['fileId'] ?? 'global') === $targetFileId) {
                    $foundIndex = $idx;
                    break;
                }
            }
        } else {
            foreach ($keys as $idx => $k) {
                if (($k['status'] ?? '') === 'UNUSED' && (empty($k['fileId']) || $k['fileId'] === 'global')) {
                    $foundIndex = $idx;
                    break;
                }
            }
            if ($foundIndex === -1) {
                foreach ($keys as $idx => $k) {
                    if (($k['status'] ?? '') === 'UNUSED') {
                        $foundIndex = $idx;
                        break;
                    }
                }
            }
        }

        if ($foundIndex === -1) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'status' => 'OUT_OF_KEYS',
                'message' => 'Rất tiếc! Bản tải [' . ($targetFileName ?: 'này') . '] hiện đã hết key trong kho. Vui lòng liên hệ Admin nạp thêm key.'
            ]);
            exit;
        }

        $durationHours = (int)($keys[$foundIndex]['durationHours'] ?? 24);
        $expiresAt = date('c', time() + ($durationHours * 3600));

        $keys[$foundIndex]['status'] = 'CLAIMED';
        $keys[$foundIndex]['claimedAt'] = date('c');
        $keys[$foundIndex]['expiresAt'] = $expiresAt;
        $keys[$foundIndex]['claimedByIp'] = $clientIp;
        writeJsonFile(KEYS_FILE, $keys);

        recordIpClaim($clientIp);

        addLog('VERIFY', 'SUCCESS', "Nhận key kích hoạt thành công", round($elapsedSeconds, 1));

        echo json_encode([
            'success' => true,
            'type' => 'KEY',
            'status' => 'SUCCESS',
            'step' => 2,
            'totalSteps' => 2,
            'key' => $keys[$foundIndex]['key'],
            'fileId' => $keys[$foundIndex]['fileId'] ?? $targetFileId,
            'fileTitle' => $keys[$foundIndex]['fileTitle'] ?? $targetFileName ?? 'Bản Tải Chung',
            'durationHours' => $durationHours,
            'expiresAt' => $expiresAt,
            'message' => 'Xuất sắc! Bạn đã nhận key kích hoạt thành công.'
        ]);
        exit;
    } else {
        // Mở khóa file
        $files = readJsonFile(FILES_FILE, []);
        $targetFile = null;
        foreach ($files as &$f) {
            if ($f['id'] === ($session['targetFileId'] ?? '')) {
                $f['downloadCount'] = ($f['downloadCount'] ?? 0) + 1;
                $targetFile = $f;
                break;
            }
        }
        writeJsonFile(FILES_FILE, $files);

        echo json_encode([
            'success' => true,
            'type' => 'FILE',
            'status' => 'SUCCESS',
            'fileTitle' => $targetFile['title'] ?? 'File',
            'downloadUrl' => $targetFile['downloadUrl'] ?: "api.php?endpoint=download&fileId={$targetFile['id']}",
            'message' => 'Mở khóa file thành công!'
        ]);
        exit;
    }
}

// 6. POST keys/check
if ($endpoint === 'keys/check' && $method === 'POST') {
    $body = getRequestBody();
    $searchKey = trim($body['key'] ?? '');
    if (empty($searchKey)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Vui lòng nhập mã key cần kiểm tra!']);
        exit;
    }

    $keys = readJsonFile(KEYS_FILE, []);
    $found = null;
    foreach ($keys as $k) {
        if (trim(strtolower($k['key'])) === strtolower($searchKey)) {
            $found = $k;
            break;
        }
    }

    if (!$found) {
        echo json_encode(['success' => true, 'found' => false, 'message' => 'Khóa không tồn tại trong hệ thống!']);
        exit;
    }

    $isExpired = false;
    $remainingMinutes = 0;
    if (!empty($found['expiresAt'])) {
        $diff = strtotime($found['expiresAt']) - time();
        if ($diff <= 0) {
            $isExpired = true;
        } else {
            $remainingMinutes = round($diff / 60);
        }
    }

    echo json_encode([
        'success' => true,
        'found' => true,
        'key' => [
            'key' => $found['key'],
            'status' => $found['status'],
            'claimedAt' => $found['claimedAt'],
            'expiresAt' => $found['expiresAt'],
            'durationHours' => $found['durationHours'] ?? 24,
            'isExpired' => $isExpired,
            'remainingMinutes' => $remainingMinutes
        ]
    ]);
    exit;
}

// 7. GET download
if ($endpoint === 'download' && $method === 'GET') {
    $fileId = $_GET['fileId'] ?? '';
    $files = readJsonFile(FILES_FILE, []);
    $targetFile = null;
    foreach ($files as &$f) {
        if ($f['id'] === $fileId) {
            $f['downloadCount'] = ($f['downloadCount'] ?? 0) + 1;
            $targetFile = $f;
            break;
        }
    }
    writeJsonFile(FILES_FILE, $files);

    if ($targetFile) {
        // Nếu là file lưu trữ cục bộ trên hosting
        if (!empty($targetFile['filePath'])) {
            $fullPath = DATA_DIR . '/' . $targetFile['filePath'];
            if (file_exists($fullPath)) {
                $fileName = basename($fullPath);
                $downloadName = preg_replace('/^upload_\d+_/', '', $fileName);
                header('Content-Description: File Transfer');
                header('Content-Type: application/octet-stream');
                header('Content-Disposition: attachment; filename="' . $downloadName . '"');
                header('Expires: 0');
                header('Cache-Control: must-revalidate');
                header('Pragma: public');
                header('Content-Length: ' . filesize($fullPath));
                @readfile($fullPath);
                exit;
            }
        }
        // Nếu là link ngoài
        if (!empty($targetFile['downloadUrl'])) {
            header("Location: " . $targetFile['downloadUrl']);
            exit;
        }
    }
    http_response_code(404);
    echo "File không tồn tại trên hệ thống!";
    exit;
}

// ==================== ADMIN ENDPOINTS ====================

// Admin Login
if ($endpoint === 'admin/login' && $method === 'POST') {
    $body = getRequestBody();
    $password = $body['password'] ?? '';
    $settings = getSettings();
    $adminPassword = $settings['adminPassword'] ?? 'thai';

    if ($password !== $adminPassword) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Mật khẩu quản trị viên không chính xác!']);
        exit;
    }

    $jwtSecret = $settings['jwtSecret'] ?? 'default_jwt_secret_token_1234567890';
    $payload = [
        'role' => 'admin',
        'iat' => time(),
        'exp' => time() + (7 * 24 * 3600)
    ];
    $payloadB64 = base64url_encode(json_encode($payload));
    $sig = hash_hmac('sha256', $payloadB64, $jwtSecret);
    $token = "{$payloadB64}.{$sig}";

    setcookie('admin_token', $token, time() + (7 * 24 * 3600), '/');

    echo json_encode(['success' => true, 'token' => $token, 'message' => 'Đăng nhập thành công!']);
    exit;
}

// Admin Logout
if ($endpoint === 'admin/logout' && $method === 'POST') {
    setcookie('admin_token', '', time() - 3600, '/');
    echo json_encode(['success' => true, 'message' => 'Đã đăng xuất!']);
    exit;
}

// Admin Check Me
if ($endpoint === 'admin/me') {
    if (!verifyAdminAuth()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Chưa đăng nhập!']);
        exit;
    }
    echo json_encode(['success' => true, 'role' => 'admin']);
    exit;
}

// Admin Stats
if ($endpoint === 'admin/stats') {
    if (!verifyAdminAuth()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Chưa đăng nhập!']);
        exit;
    }

    $keys = readJsonFile(KEYS_FILE, []);
    $files = readJsonFile(FILES_FILE, []);
    $logs = readJsonFile(LOGS_FILE, []);

    $totalKeys = count($keys);
    $availableKeys = 0;
    $claimedKeys = 0;
    foreach ($keys as $k) {
        if (($k['status'] ?? '') === 'UNUSED') $availableKeys++;
        if (($k['status'] ?? '') === 'CLAIMED') $claimedKeys++;
    }

    $totalFiles = count($files);
    $totalDownloads = 0;
    foreach ($files as $f) {
        $totalDownloads += (int)($f['downloadCount'] ?? 0);
    }

    $totalBypassesBlocked = 0;
    foreach ($logs as $l) {
        if (($l['status'] ?? '') === 'BYPASS_BLOCKED') $totalBypassesBlocked++;
    }

    echo json_encode([
        'success' => true,
        'stats' => [
            'totalKeys' => $totalKeys,
            'availableKeys' => $availableKeys,
            'claimedKeys' => $claimedKeys,
            'totalFiles' => $totalFiles,
            'totalDownloads' => $totalDownloads,
            'totalBypassesBlocked' => $totalBypassesBlocked
        ]
    ]);
    exit;
}

// Admin Files (GET / POST / DELETE)
if ($endpoint === 'admin/files' || strpos($endpoint, 'admin/files/') === 0) {
    if (!verifyAdminAuth()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Chưa đăng nhập!']);
        exit;
    }

    if ($method === 'GET') {
        $files = readJsonFile(FILES_FILE, []);
        $keys = readJsonFile(KEYS_FILE, []);
        $filesWithStats = array_map(function($f) use ($keys) {
            $fileId = $f['id'];
            $total = 0;
            $avail = 0;
            $claimed = 0;
            foreach ($keys as $k) {
                if (($k['fileId'] ?? 'global') === $fileId) {
                    $total++;
                    if (($k['status'] ?? '') === 'UNUSED') $avail++;
                    if (($k['status'] ?? '') === 'CLAIMED') $claimed++;
                }
            }
            $f['totalKeys'] = $total;
            $f['availableKeys'] = $avail;
            $f['claimedKeys'] = $claimed;
            return $f;
        }, $files);
        echo json_encode(['success' => true, 'files' => $filesWithStats]);
        exit;
    }

    if ($method === 'POST') {
        $body = getRequestBody();
        $files = readJsonFile(FILES_FILE, []);

        $fileType = trim($body['fileType'] ?? 'DIRECT_URL');
        $downloadUrl = trim($body['downloadUrl'] ?? '');
        $fileSize = trim($body['fileSize'] ?? '');
        $savedFilePath = '';
        $requiresLink4m = ($body['requiresLink4m'] === 'true' || $body['requiresLink4m'] === true || $body['requiresLink4m'] === '1' || $body['requiresLink4m'] === 1);

        // Xử lý upload file trực tiếp nếu có
        if (isset($_FILES['fileUpload']) && $_FILES['fileUpload']['error'] !== UPLOAD_ERR_NO_FILE) {
            if ($_FILES['fileUpload']['error'] !== UPLOAD_ERR_OK) {
                $errCode = $_FILES['fileUpload']['error'];
                $errMsg = 'Lỗi tải file lên máy chủ (mã: ' . $errCode . ')';
                if ($errCode === UPLOAD_ERR_INI_SIZE || $errCode === UPLOAD_ERR_FORM_SIZE) {
                    $errMsg = 'Tệp tin vượt quá dung lượng tối đa cho phép của hosting AwardSpace! Hãy dùng link Direct/Mediafire/Drive.';
                } elseif ($errCode === UPLOAD_ERR_PARTIAL) {
                    $errMsg = 'Tệp tin chỉ mới được tải lên một phần, vui lòng thử lại!';
                }
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => $errMsg]);
                exit;
            }

            $origName = basename($_FILES['fileUpload']['name']);
            $ext = pathinfo($origName, PATHINFO_EXTENSION);
            $cleanName = preg_replace('/[^a-zA-Z0-9_-]/', '_', pathinfo($origName, PATHINFO_FILENAME));
            $savedFileName = 'upload_' . time() . '_' . $cleanName . ($ext ? '.' . $ext : '');
            $destination = DATA_DIR . '/' . $savedFileName;

            if (move_uploaded_file($_FILES['fileUpload']['tmp_name'], $destination)) {
                $savedFilePath = $savedFileName;
                $fileType = 'LOCAL';

                // Tự động tính dung lượng file
                $bytes = filesize($destination);
                if ($bytes >= 1073741824) {
                    $fileSize = number_format($bytes / 1073741824, 2) . ' GB';
                } elseif ($bytes >= 1048576) {
                    $fileSize = number_format($bytes / 1048576, 1) . ' MB';
                } elseif ($bytes >= 1024) {
                    $fileSize = number_format($bytes / 1024, 1) . ' KB';
                } else {
                    $fileSize = $bytes . ' B';
                }
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Máy chủ không thể lưu file tải lên (vui lòng kiểm tra quyền ghi của thư mục)!']);
                exit;
            }
        }

        $targetId = trim($_GET['id'] ?? $body['id'] ?? $body['editId'] ?? '');
        if (empty($targetId) && preg_match('#^admin/files/(.+)$#', $endpoint, $m)) {
            $targetId = trim($m[1]);
        }

        // Xử lý XÓA FILE qua POST (action: delete)
        if (($body['action'] ?? '') === 'delete') {
            $newFiles = [];
            foreach ($files as $f) {
                if ($f['id'] === $targetId) {
                    if (!empty($f['filePath'])) {
                        $p = DATA_DIR . '/' . $f['filePath'];
                        if (file_exists($p)) @unlink($p);
                    }
                } else {
                    $newFiles[] = $f;
                }
            }
            writeJsonFile(FILES_FILE, $newFiles);
            echo json_encode(['success' => true, 'message' => 'Đã xóa bản tải thành công!']);
            exit;
        }

        // Cập nhật file nếu đang chỉnh sửa
        if (!empty($targetId)) {
            $found = false;
            $updatedFile = null;
            foreach ($files as &$f) {
                if ($f['id'] === $targetId) {
                    $f['title'] = trim($body['title'] ?? $f['title']);
                    $f['description'] = trim($body['description'] ?? $f['description']);
                    $f['version'] = trim($body['version'] ?? $f['version']);
                    $f['category'] = trim($body['category'] ?? $f['category']);
                    $f['requiresLink4m'] = $requiresLink4m;
                    if (!empty($fileSize)) $f['fileSize'] = $fileSize;
                    if (!empty($fileType)) $f['fileType'] = $fileType;
                    if (!empty($downloadUrl)) $f['downloadUrl'] = $downloadUrl;
                    if (!empty($savedFilePath)) {
                        if (!empty($f['filePath']) && $f['filePath'] !== $savedFilePath && file_exists(DATA_DIR . '/' . $f['filePath'])) {
                            @unlink(DATA_DIR . '/' . $f['filePath']);
                        }
                        $f['filePath'] = $savedFilePath;
                        if (empty($downloadUrl) || strpos($downloadUrl, 'api.php?endpoint=download') !== false) {
                            $f['downloadUrl'] = "api.php?endpoint=download&fileId={$targetId}";
                        }
                    }
                    $found = true;
                    $updatedFile = $f;
                    break;
                }
            }
            if ($found) {
                writeJsonFile(FILES_FILE, $files);
                echo json_encode(['success' => true, 'file' => $updatedFile, 'message' => 'Cập nhật tệp tin thành công!']);
                exit;
            }
        }

        $fileId = 'file_' . uniqid();
        if ($fileType === 'LOCAL' && empty($downloadUrl)) {
            $downloadUrl = "api.php?endpoint=download&fileId={$fileId}";
        }

        $newFile = [
            'id' => $fileId,
            'title' => trim($body['title'] ?? 'Tệp tin mới'),
            'description' => trim($body['description'] ?? ''),
            'version' => trim($body['version'] ?? 'v1.0'),
            'fileSize' => $fileSize ?: 'N/A',
            'category' => trim($body['category'] ?? 'General'),
            'downloadCount' => 0,
            'requiresLink4m' => $requiresLink4m,
            'fileType' => $fileType,
            'downloadUrl' => $downloadUrl,
            'filePath' => $savedFilePath,
            'createdAt' => date('c')
        ];

        array_unshift($files, $newFile);
        writeJsonFile(FILES_FILE, $files);

        echo json_encode(['success' => true, 'file' => $newFile, 'message' => 'Thêm file thành công!']);
        exit;
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? '';
        if (empty($id) && preg_match('#^admin/files/(.+)$#', $endpoint, $m)) {
            $id = trim($m[1]);
        }
        $files = readJsonFile(FILES_FILE, []);
        $newFiles = [];
        foreach ($files as $f) {
            if ($f['id'] === $id) {
                if (!empty($f['filePath'])) {
                    $p = DATA_DIR . '/' . $f['filePath'];
                    if (file_exists($p)) @unlink($p);
                }
            } else {
                $newFiles[] = $f;
            }
        }
        writeJsonFile(FILES_FILE, $newFiles);
        echo json_encode(['success' => true, 'message' => 'Đã xóa file!']);
        exit;
    }
}

// Admin Keys (GET / POST / DELETE)
if ($endpoint === 'admin/keys' || strpos($endpoint, 'admin/keys/') === 0) {
    if (!verifyAdminAuth()) {
        sendJsonResponse(['success' => false, 'message' => 'Chưa đăng nhập!'], 401);
    }

    if ($method === 'GET') {
        $fileId = $_GET['fileId'] ?? null;
        $keys = readJsonFile(KEYS_FILE, []);
        if ($fileId && $fileId !== 'all') {
            $keys = array_values(array_filter($keys, function($k) use ($fileId) {
                return ($k['fileId'] ?? 'global') === $fileId;
            }));
        }
        sendJsonResponse(['success' => true, 'keys' => $keys]);
    }

    if ($method === 'POST') {
        $body = getRequestBody();
        $keys = readJsonFile(KEYS_FILE, []);
        $files = readJsonFile(FILES_FILE, []);

        // Xử lý XÓA KEY qua POST (action: delete)
        if (($body['action'] ?? '') === 'delete') {
            $targetId = trim($_GET['id'] ?? $body['id'] ?? '');
            if (empty($targetId) && preg_match('#admin/keys/(.+)#', $endpoint, $km)) {
                $targetId = trim($km[1]);
            }
            if (!empty($targetId)) {
                $keys = array_values(array_filter($keys, function($k) use ($targetId) {
                    return $k['id'] !== $targetId;
                }));
                writeJsonFile(KEYS_FILE, $keys);
                sendJsonResponse(['success' => true, 'message' => 'Đã xóa key!']);
            }
            sendJsonResponse(['success' => false, 'message' => 'Không tìm thấy ID key cần xóa!'], 400);
        }

        $mode = $body['mode'] ?? '';
        $durationHours = (int)($body['durationHours'] ?? 24);
        $note = trim($body['note'] ?? '');
        $fileId = trim($body['fileId'] ?? 'global');
        $fileTitle = 'Tất Cả / Key Chung';
        if ($fileId && $fileId !== 'global') {
            foreach ($files as $f) {
                if ($f['id'] === $fileId) { $fileTitle = $f['title']; break; }
            }
        }

        // 1. Nhập danh sách key (Bulk mode)
        if ($mode === 'bulk' || !empty($body['keysText'])) {
            $rawText = $body['keysText'] ?? '';
            $lines = array_filter(array_map('trim', explode("\n", $rawText)), function($l) { return $l !== ''; });
            if (empty($lines)) {
                sendJsonResponse(['success' => false, 'message' => 'Vui lòng dán danh sách key!'], 400);
            }

            $addedCount = 0;
            foreach ($lines as $lineKey) {
                $keys[] = [
                    'id' => 'key_' . uniqid(),
                    'key' => $lineKey,
                    'fileId' => $fileId,
                    'fileTitle' => $fileTitle,
                    'status' => 'UNUSED',
                    'durationHours' => $durationHours,
                    'claimedAt' => null,
                    'expiresAt' => null,
                    'claimedByIp' => null,
                    'note' => $note ?: "Bulk Import for {$fileTitle}",
                    'createdAt' => date('c')
                ];
                $addedCount++;
            }
            writeJsonFile(KEYS_FILE, $keys);
            if ($fileId && $fileId !== 'global' && $fileId !== 'all') {
                $filesUpdated = false;
                foreach ($files as &$ff) {
                    if ($ff['id'] === $fileId && empty($ff['requiresLink4m'])) {
                        $ff['requiresLink4m'] = true;
                        $filesUpdated = true;
                        break;
                    }
                }
                if ($filesUpdated) writeJsonFile(FILES_FILE, $files);
            }
            sendJsonResponse(['success' => true, 'count' => $addedCount, 'message' => "Đã thêm thành công {$addedCount} key riêng cho [{$fileTitle}] vào kho!"]);
        }

        // 2. Sinh tự động hàng loạt (Generate mode)
        if ($mode === 'generate' || (!empty($body['count']) && is_numeric($body['count']))) {
            $count = min(200, max(1, (int)($body['count'] ?? 10)));
            $prefix = strtoupper(trim($body['prefix'] ?? 'KEY'));

            for ($i = 0; $i < $count; $i++) {
                $code = strtoupper(bin2hex(random_bytes(2)) . '-' . bin2hex(random_bytes(2)) . '-' . bin2hex(random_bytes(2)));
                $keys[] = [
                    'id' => 'key_' . uniqid(),
                    'key' => "{$prefix}-{$code}",
                    'fileId' => $fileId,
                    'fileTitle' => $fileTitle,
                    'status' => 'UNUSED',
                    'durationHours' => $durationHours,
                    'claimedAt' => null,
                    'expiresAt' => null,
                    'claimedByIp' => null,
                    'note' => $note ?: "Auto-Generated for {$fileTitle}",
                    'createdAt' => date('c')
                ];
            }
            writeJsonFile(KEYS_FILE, $keys);
            if ($fileId && $fileId !== 'global' && $fileId !== 'all') {
                $filesUpdated = false;
                foreach ($files as &$ff) {
                    if ($ff['id'] === $fileId && empty($ff['requiresLink4m'])) {
                        $ff['requiresLink4m'] = true;
                        $filesUpdated = true;
                        break;
                    }
                }
                if ($filesUpdated) writeJsonFile(FILES_FILE, $files);
            }
            sendJsonResponse(['success' => true, 'count' => $count, 'message' => "Đã sinh thành công {$count} key riêng cho [{$fileTitle}]!"]);
        }

        // 3. Thêm thủ công 1 key
        if (!empty($body['key'])) {
            $singleKey = trim($body['key']);
            $keys[] = [
                'id' => 'key_' . uniqid(),
                'key' => $singleKey,
                'status' => 'UNUSED',
                'durationHours' => $durationHours,
                'claimedAt' => null,
                'expiresAt' => null,
                'claimedByIp' => null,
                'note' => $note,
                'createdAt' => date('c')
            ];
            writeJsonFile(KEYS_FILE, $keys);
            sendJsonResponse(['success' => true, 'message' => 'Thêm key thành công!']);
        }

        sendJsonResponse(['success' => false, 'message' => 'Dữ liệu thêm key không hợp lệ!'], 400);
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? '';
        if (empty($id) && preg_match('#admin/keys/(.*)#', $endpoint, $km)) {
            $id = $km[1];
        }
        $keys = readJsonFile(KEYS_FILE, []);
        $keys = array_values(array_filter($keys, function($k) use ($id) {
            return $k['id'] !== $id;
        }));
        writeJsonFile(KEYS_FILE, $keys);
        sendJsonResponse(['success' => true, 'message' => 'Đã xóa key!']);
    }

    sendJsonResponse(['success' => false, 'message' => 'Phương thức không được hỗ trợ!'], 405);
}

// Admin Link4M Save (Lưu trực tiếp & tức thì API Token Link4M)
if ($endpoint === 'admin/link4m/save' && $method === 'POST') {
    if (!verifyAdminAuth()) {
        sendJsonResponse(['success' => false, 'message' => 'Chưa đăng nhập!'], 401);
    }
    $body = getRequestBody();
    $newKey = trim($body['apiKey'] ?? '');
    $newMode = trim($body['mode'] ?? 'quicklink');
    if ($newMode !== 'api' && $newMode !== 'quicklink') {
        $newMode = 'quicklink';
    }

    $settings = getSettings();
    $settings['link4mApiKey'] = $newKey;
    $settings['link4mMode'] = $newMode;

    $saved = writeJsonFile(SETTINGS_FILE, $settings);
    if (!$saved) {
        sendJsonResponse(['success' => false, 'message' => 'Lỗi ghi file cấu hình data_settings.json trên hosting!'], 500);
    }

    sendJsonResponse([
        'success' => true,
        'link4mApiKey' => $newKey,
        'link4mMode' => $newMode,
        'message' => 'Đã lưu cấu hình API Link4M thành công!'
    ]);
}

// Admin Link4M Test API (Kiểm tra token với máy chủ Link4M)
if ($endpoint === 'admin/link4m/test' && $method === 'POST') {
    if (!verifyAdminAuth()) {
        sendJsonResponse(['success' => false, 'message' => 'Chưa đăng nhập!'], 401);
    }
    $body = getRequestBody();
    $testKey = trim($body['apiKey'] ?? '');
    if (empty($testKey)) {
        $settings = getSettings();
        $testKey = trim($settings['link4mApiKey'] ?? '');
    }
    if (empty($testKey)) {
        sendJsonResponse(['success' => false, 'message' => 'Vui lòng nhập API Key để kiểm tra!'], 400);
    }

    $testDest = "https://google.com";
    $quickLinkSample = "https://link4m.co/st?api=" . urlencode($testKey) . "&url=" . urlencode($testDest);

    if (function_exists('curl_init')) {
        $apiUrl = "https://link4m.co/api?api=" . urlencode($testKey) . "&url=" . urlencode($testDest) . "&format=json";
        $ch = curl_init($apiUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
        $res = curl_exec($ch);
        curl_close($ch);

        if ($res) {
            $data = json_decode($res, true);
            if (!empty($data['status']) && $data['status'] === 'success') {
                sendJsonResponse([
                    'success' => true,
                    'message' => 'API Token hợp lệ! Link4M đã xác thực tài khoản hoạt động bình thường.',
                    'sampleUrl' => $data['shortenedUrl'] ?? $quickLinkSample
                ]);
            } elseif (!empty($data['message'])) {
                sendJsonResponse([
                    'success' => false,
                    'message' => 'Link4M báo lỗi: ' . $data['message']
                ]);
            }
        }
    }

    sendJsonResponse([
        'success' => true,
        'warning' => true,
        'message' => 'Đã tạo QuickLink chuẩn thành công! Định dạng này chạy độc lập không phụ thuộc cURL của hosting Awardspace.',
        'sampleUrl' => $quickLinkSample
    ]);
}

// Admin Settings (GET / POST)
if ($endpoint === 'admin/settings') {
    if (!verifyAdminAuth()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Chưa đăng nhập!']);
        exit;
    }

    if ($method === 'GET') {
        $settings = getSettings();
        echo json_encode(['success' => true, 'settings' => $settings]);
        exit;
    }

    if ($method === 'POST') {
        $body = getRequestBody();
        $settings = getSettings();
        $fields = ['hmacSecret', 'link4mApiKey', 'link4mMode', 'minWaitSeconds', 'keyDurationHours', 'siteUrl', 'maxKeysPerIp', 'ipLimitHours', 'adminPassword', 'announcement'];
        foreach ($fields as $f) {
            if (isset($body[$f])) {
                $settings[$f] = $body[$f];
            }
        }
        if (!empty($body['newAdminPassword']) && strlen(trim($body['newAdminPassword'])) >= 4) {
            $settings['adminPassword'] = trim($body['newAdminPassword']);
        }
        $saved = writeJsonFile(SETTINGS_FILE, $settings);
        if (!$saved) {
            sendJsonResponse(['success' => false, 'message' => 'Lỗi ghi cấu hình! Vui lòng kiểm tra quyền thư mục.'], 500);
        }
        echo json_encode(['success' => true, 'settings' => $settings, 'message' => 'Đã lưu cấu hình thành công!']);
        exit;
    }
}

// Admin Reset IP Claims
if ($endpoint === 'admin/ip-claims/reset' && $method === 'POST') {
    if (!verifyAdminAuth()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Chưa đăng nhập!']);
        exit;
    }
    writeJsonFile(IP_CLAIMS_FILE, []);
    echo json_encode(['success' => true, 'message' => 'Đã xóa toàn bộ giới hạn IP!']);
    exit;
}

// Admin Logs
if ($endpoint === 'admin/logs' && $method === 'GET') {
    if (!verifyAdminAuth()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Chưa đăng nhập!']);
        exit;
    }
    $logs = readJsonFile(LOGS_FILE, []);
    echo json_encode(['success' => true, 'logs' => $logs]);
    exit;
}

// 404 cho các endpoint khác
http_response_code(404);
echo json_encode(['success' => false, 'message' => "Endpoint '{$endpoint}' không tồn tại trên hệ thống API!"]);
