/* =========================================================
   MY EXAM WEB — app.js (REBUILT)
   ---------------------------------------------------------
   Bản này ưu tiên độ ổn định:
   - Chỉ đọc file được khai báo trong manifest.json.
   - Không probe thư mục. Không demo pool. Không tự bịa câu hỏi.
   - Timer theo mã môn: Toán + Ngữ văn = 90 phút, môn khác = 50 phút.
   - Chấm điểm được xử lý độc lập, chống double-submit.
   - Hỗ trợ 4 dạng VSAT + 3 dạng THPTQG.
   - MathJax 3 tải bất đồng bộ; khi không có mạng vẫn có fallback ký hiệu đẹp.
   ========================================================= */

(() => {
    "use strict";

    const APP = {
        storage: {
            theme: "myExam.theme",
            history: "myExam.history.v2",
            session: "myExam.activeSession.v2"
        },
        manifestFile: "manifest.json",
        warningSeconds: 10 * 60,
        dangerSeconds: 5 * 60,
        autosaveMs: 900,
        maxHistoryItems: 100,
        mathJaxSrc: "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"
    };

    const EXAMS = {
        vsat: {
            key: "vsat",
            name: "VSAT",
            maxScore: 150,
            description: "Bài thi đánh giá năng lực với 4 dạng câu hỏi.",
            subjects: [
                { key: "toan", name: "Toán", icon: "∑", accent: "#7c5cff", description: "Tư duy định lượng & logic" },
                { key: "ly", name: "Vật lý", icon: "⚛", accent: "#37d9ff", description: "Cơ học, điện, quang..." },
                { key: "hoa", name: "Hóa học", icon: "◇", accent: "#45e69d", description: "Vô cơ, hữu cơ & tính toán" },
                { key: "sinh", name: "Sinh học", icon: "⌬", accent: "#ff5f9e", description: "Di truyền, tế bào, sinh thái" },
                { key: "anh", name: "Tiếng Anh", icon: "A", accent: "#ffb84d", description: "Đọc hiểu & từ vựng" }
            ],
            blueprint: [
                { type: "true_false", count: 9, part: 1, title: "PHẦN I — Đúng / Sai" },
                { type: "mcq", count: 6, part: 2, title: "PHẦN II — Trắc nghiệm nhiều lựa chọn" },
                { type: "matching", count: 5, part: 3, title: "PHẦN III — Ghép hợp" },
                { type: "short_answer", count: 5, part: 4, title: "PHẦN IV — Trả lời ngắn" }
            ],
            scoring: {
                true_false: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 6 },
                mcq: { perCorrect: 6 },
                matching: { perCorrect: 1.5, max: 6 },
                short_answer: { perCorrect: 6 }
            }
        },
        thptqg: {
            key: "thptqg",
            name: "THPTQG",
            maxScore: 10,
            description: "Luyện theo cấu trúc nhiều lựa chọn, đúng/sai và trả lời ngắn.",
            subjects: [
                { key: "toan", name: "Toán", icon: "∑", accent: "#7c5cff", description: "12 MCQ + 4 Đúng/Sai + 6 trả lời ngắn" },
                { key: "ly", name: "Vật lý", icon: "⚡", accent: "#37d9ff", description: "Luyện tập theo bộ đề" },
                { key: "hoa", name: "Hóa học", icon: "⚗", accent: "#45e69d", description: "Luyện tập theo bộ đề" },
                { key: "sinh", name: "Sinh học", icon: "⌬", accent: "#ff5f9e", description: "Luyện tập theo bộ đề" },
                { key: "ngu_van", name: "Ngữ văn", icon: "V", accent: "#ffb84d", description: "Đọc hiểu & kiến thức" },
                { key: "tieng_anh", name: "Tiếng Anh", icon: "A", accent: "#a98cff", description: "Từ vựng & đọc hiểu" }
            ],
            blueprint: [
                { type: "mcq", count: 12, part: 1, title: "PHẦN I — Trắc nghiệm nhiều lựa chọn" },
                { type: "true_false", count: 4, part: 2, title: "PHẦN II — Trắc nghiệm Đúng / Sai" },
                { type: "short_answer", count: 6, part: 3, title: "PHẦN III — Trắc nghiệm trả lời ngắn" }
            ],
            scoring: {
                mcq: { perCorrect: 0.25 },
                true_false: { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 },
                short_answer: { perCorrect: 0.5 }
            }
        }
    };

    let currentUser = null;

    const state = {
        screen: "home",
        examKey: null,
        subjectKey: null,
        subjectName: null,
        examConfig: null,
        questions: [],
        answers: {},
        flags: {},
        currentIndex: 0,
        durationMinutes: 0,
        durationSeconds: 0,
        endAt: 0,
        startAt: 0,
        remainingSeconds: 0,
        timerId: null,
        autosaveId: null,
        hasSubmitted: false,
        isSubmitting: false,
        submitReason: null,
        result: null,
        loadedSources: [],
        pendingResumeSession: null,
        audioEnabled: true
    };

    const DOM = {};
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function cacheDOM() {
        DOM.html = document.documentElement;
        DOM.body = document.body;
        DOM.screens = $$(".screen");
        DOM.headerTimer = $("#headerTimer");
        DOM.headerTimerValue = $("#headerTimerValue");
        DOM.themeIcon = $("#themeIcon");
        DOM.currentYear = $("#currentYear");

        DOM.selectedExamBreadcrumb = $("#selectedExamBreadcrumb");
        DOM.selectionExamName = $("#selectionExamName");
        DOM.selectionTitle = $("#selectionTitle");
        DOM.selectionDescription = $("#selectionDescription");
        DOM.subjectGrid = $("#subjectGrid");
        DOM.subjectLoading = $("#subjectLoading");
        DOM.questionCountStat = $("#questionCountStat");

        DOM.examScreen = $("#examScreen");
        DOM.examTitle = $("#examTitle");
        DOM.examPartLabel = $("#examPartLabel");
        DOM.examPartTitle = $("#examPartTitle");
        DOM.flagQuestionButton = $("#flagQuestionButton");
        DOM.currentQuestionNumber = $("#currentQuestionNumber");
        DOM.totalQuestionNumber = $("#totalQuestionNumber");
        DOM.questionProgressText = $("#questionProgressText");
        DOM.questionProgressFill = $("#questionProgressFill");
        DOM.questionContainer = $("#questionContainer");
        DOM.sidebarTimer = $("#sidebarTimer");
        DOM.sidebarTimerValue = $("#sidebarTimerValue");
        DOM.timerProgressFill = $("#timerProgressFill");
        DOM.questionPalette = $("#questionPalette");
        DOM.paletteCount = $("#paletteCount");

        DOM.resultTitle = $("#resultTitle");
        DOM.resultSubtitle = $("#resultSubtitle");
        DOM.resultScore = $("#resultScore");
        DOM.resultMaxScore = $("#resultMaxScore");
        DOM.resultMessage = $("#resultMessage");
        DOM.correctCount = $("#correctCount");
        DOM.wrongCount = $("#wrongCount");
        DOM.unansweredCount = $("#unansweredCount");
        DOM.usedTime = $("#usedTime");
        DOM.scoreRing = $("#scoreRing");
        DOM.resultBreakdown = $("#resultBreakdown");
        DOM.reviewSummary = $("#reviewSummary");
        DOM.reviewList = $("#reviewList");
        DOM.resultCelebration = $("#resultCelebration");
        DOM.confettiCanvas = $("#confettiCanvas");

        DOM.historyList = $("#historyList");
        DOM.historyEmpty = $("#historyEmpty");
        DOM.historyExamCount = $("#historyExamCount");
        DOM.historyBestScore = $("#historyBestScore");
        DOM.historyAverageScore = $("#historyAverageScore");
        DOM.historyStreak = $("#historyStreak");

        DOM.globalOverlay = $("#globalOverlay");
        DOM.guideModal = $("#guideModal");
        DOM.submitModal = $("#submitModal");
        DOM.submitAnsweredCount = $("#submitAnsweredCount");
        DOM.submitUnansweredCount = $("#submitUnansweredCount");
        DOM.submitRemainingTime = $("#submitRemainingTime");
        DOM.toastContainer = $("#toastContainer");
    }

    function isObject(v) { return v && typeof v === "object" && !Array.isArray(v); }
    function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
    function safeNumber(v, fallback = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }
    function roundScore(v) { return Math.round((safeNumber(v) + Number.EPSILON) * 100) / 100; }
    function deepClone(v) {
        try { return structuredClone(v); } catch (_) { return JSON.parse(JSON.stringify(v)); }
    }
    function uid(prefix = "id") {
        if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    }
    function shuffle(input) {
        const arr = Array.isArray(input) ? input.slice() : [];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function normalizeText(v) {
        return String(v ?? "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");
    }
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function nextFrame() { return new Promise(resolve => requestAnimationFrame(() => resolve())); }

    function prettyMathFallback(input) {
        let s = String(input ?? "");
        const sup = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ","x":"ˣ","y":"ʸ","z":"ᶻ","a":"ᵃ","b":"ᵇ","c":"ᶜ","d":"ᵈ","e":"ᵉ","f":"ᶠ","g":"ᵍ","h":"ʰ","j":"ʲ","k":"ᵏ","l":"ˡ","m":"ᵐ","o":"ᵒ","p":"ᵖ","q":"۹","r":"ʳ","s":"ˢ","t":"ᵗ","u":"ᵘ","v":"ᵛ","w":"ʷ" };
        const sub = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","=":"₌","(":"₍",")":"₎","n":"ₙ","i":"ᵢ","j":"ⱼ","x":"ₓ","y":"ᵧ","z":"𝓏","a":"ₐ","e":"ₑ","o":"ₒ","p":"ₚ","s":"ₛ","t":"ₜ","u":"ᵤ","v":"ᵥ" };

        // Keep LaTeX-delimited text untouched; MathJax handles it.
        if (s.includes("\\(") || s.includes("\\[") || s.includes("$$") || s.includes("$")) return s;

        s = s.replace(/(^|[^A-Za-z])sqrt\(([^()]+)\)/g, "$1√($2)");
        s = s.replace(/([A-Za-z0-9)\]])\^\((-?[A-Za-z0-9]+)\)/g, (_, base, power) => base + [...power].map(ch => sup[ch] || ch).join(""));
        s = s.replace(/([A-Za-z0-9)\]])\^([0-9]+)/g, (_, base, power) => base + [...power].map(ch => sup[ch] || ch).join(""));
        s = s.replace(/([A-Za-z])_([A-Za-z0-9]+)/g, (_, base, index) => base + [...index].map(ch => sub[ch] || ch).join(""));
        s = s.replace(/\^bar\b/g, "̄");
        s = s.replace(/\s<=\s/g, " ≤ ").replace(/\s>=\s/g, " ≥ ").replace(/\s!=\s/g, " ≠ ");
        s = s.replace(/\s\*\s/g, " × ");
        s = s.replace(/(^|\s)(\d+)\s*\/\s*(\d+)(?=\s|$)/g, "$1$2/$3");
        return s;
    }

    function richText(value, className = "math-content") {
        const prepared = prettyMathFallback(value).replace(/\r?\n/g, "\n");
        return `<span class="${className}">${escapeHTML(prepared).replace(/\n/g, "<br>")}</span>`;
    }

    let mathReady = null;
    function ensureMathJax() {
        if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax);
        if (mathReady) return mathReady;
        window.MathJax = window.MathJax || {
            tex: {
                inlineMath: [["\\(", "\\)"], ["$", "$"]],
                displayMath: [["\\[", "\\]"], ["$$", "$$"]]
            },
            options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code", "select", "option"] }
        };
        mathReady = new Promise((resolve) => {
            const existing = document.querySelector('script[data-myexam-mathjax="1"]');
            if (existing) {
                existing.addEventListener("load", () => resolve(window.MathJax), { once: true });
                existing.addEventListener("error", () => resolve(null), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = APP.mathJaxSrc;
            script.async = true;
            script.dataset.myexamMathjax = "1";
            script.onload = () => resolve(window.MathJax);
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
        });
        return mathReady;
    }

    async function typesetMath(root) {
        if (!root || !root.isConnected) return;
        const mj = await ensureMathJax();
        if (!mj?.typesetPromise) return;
        try {
            if (mj.typesetClear) mj.typesetClear([root]);
            await mj.typesetPromise([root]);
        } catch (error) {
            console.warn("[My Exam] MathJax typeset failed:", error);
        }
    }

    function formatTimer(seconds) {
        const n = Math.max(0, Math.floor(safeNumber(seconds, 0)));
        const mins = Math.floor(n / 60);
        const secs = n % 60;
        // Exam durations are intentionally shown as MM:SS (90:00 / 50:00), never as hours.
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    function formatDateTime(ts) {
        const date = new Date(ts);
        if (Number.isNaN(date.getTime())) return "—";
        return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
    }
    function formatScore(score) {
        const n = roundScore(score);
        if (Number.isInteger(n)) return String(n);
        return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }

    function getExamConfig(examKey) { return EXAMS[examKey] || null; }
    function getSubjectConfig(examKey, subjectKey) {
        return getExamConfig(examKey)?.subjects?.find(s => s.key === subjectKey) || null;
    }

    function getDurationMinutes(examKey, subjectKey) {
        // User requirement: Toán + Ngữ văn = 90m; every other subject = 50m.
        return ["toan", "ngu_van"].includes(String(subjectKey)) ? 90 : 50;
    }

    function typeLabel(type) {
        return {
            mcq: "Trắc nghiệm nhiều lựa chọn",
            true_false: "Đúng / Sai",
            matching: "Ghép hợp",
            short_answer: "Trả lời ngắn"
        }[type] || "Câu hỏi";
    }
    function typeIcon(type) { return { mcq: "◉", true_false: "✓", matching: "⇄", short_answer: "✎" }[type] || "✦"; }

    /* ---------------- Local storage ---------------- */
    function loadJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.warn("[My Exam] storage read failed", error);
            return fallback;
        }
    }
    function saveJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn("[My Exam] storage write failed", error);
            return false;
        }
    }
    function loadHistory() {
        const value = loadJSON(APP.storage.history, []);
        return Array.isArray(value) ? value : [];
    }
    function saveHistory(item) {
        const next = [deepClone(item), ...loadHistory()].slice(0, APP.maxHistoryItems);
        saveJSON(APP.storage.history, next);
        apiPost('/api/attempts', item).catch(error => {
            console.warn('[My Exam] server history save failed', error);
            showToast('Không đồng bộ được điểm lên máy chủ.', 'warning', 5000);
        });
    }
    async function syncHistoryFromServer() {
        try {
            const data = await apiGet('/api/history');
            if (Array.isArray(data.items)) saveJSON(APP.storage.history, data.items);
            return data.items || [];
        } catch (error) {
            console.warn('[My Exam] history sync failed', error);
            return loadHistory();
        }
    }
    function clearHistory() {
        localStorage.removeItem(APP.storage.history);
        renderHistory();
    }
    function saveSession() {
        if (state.hasSubmitted || !state.questions.length || !state.examKey) return;
        const session = {
            version: 2,
            examKey: state.examKey,
            subjectKey: state.subjectKey,
            subjectName: state.subjectName,
            questions: state.questions,
            answers: state.answers,
            flags: state.flags,
            currentIndex: state.currentIndex,
            durationMinutes: state.durationMinutes,
            durationSeconds: state.durationSeconds,
            startAt: state.startAt,
            endAt: state.endAt,
            savedAt: Date.now()
        };
        saveJSON(APP.storage.session, session);
    }
    function clearSession() { try { localStorage.removeItem(APP.storage.session); } catch (_) {} }
    function getSavedSession() {
        const session = loadJSON(APP.storage.session, null);
        if (!session || !Array.isArray(session.questions) || !session.questions.length || !session.endAt) return null;
        const remaining = Math.max(0, Math.ceil((Number(session.endAt) - Date.now()) / 1000));
        if (remaining <= 0) { clearSession(); return null; }
        return { ...session, remainingSeconds: remaining };
    }

    /* ---------------- Theme / audio / toast ---------------- */
    function initTheme() {
        const stored = localStorage.getItem(APP.storage.theme);
        applyTheme(stored === "light" ? "light" : "dark", false);
    }
    function applyTheme(theme, persist = true) {
        const safe = theme === "light" ? "light" : "dark";
        DOM.html.dataset.theme = safe;
        if (DOM.themeIcon) DOM.themeIcon.textContent = safe === "dark" ? "☀" : "☾";
        if (persist) localStorage.setItem(APP.storage.theme, safe);
    }
    function toggleTheme() {
        applyTheme(DOM.html.dataset.theme === "light" ? "dark" : "light");
        playTone(520, 0.04, "sine", 0.018);
    }

    const audio = { ctx: null };
    function getAudioContext() {
        if (!state.audioEnabled || !window.AudioContext && !window.webkitAudioContext) return null;
        try {
            if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
            return audio.ctx;
        } catch (_) { return null; }
    }
    function playTone(frequency, duration = 0.06, wave = "sine", volume = 0.02, delay = 0) {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = wave;
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + duration + 0.01);
        } catch (_) {}
    }
    function playSound(kind) {
        if (kind === "click") playTone(520, 0.04, "sine", 0.018);
        else if (kind === "select") { playTone(460, 0.05, "triangle", 0.02); playTone(680, 0.07, "triangle", 0.014, 0.04); }
        else if (kind === "warning") { playTone(420, 0.1, "square", 0.018); playTone(320, 0.12, "square", 0.014, 0.12); }
        else if (kind === "success") { playTone(523.25, 0.1, "triangle", 0.023); playTone(659.25, 0.11, "triangle", 0.019, 0.09); playTone(783.99, 0.14, "triangle", 0.015, 0.18); }
    }

    function showToast(message, type = "info", duration = 2800) {
        if (!DOM.toastContainer) return null;
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        const label = type === "error" ? "Có lỗi" : type === "warning" ? "Lưu ý" : type === "success" ? "Thành công" : "My Exam";
        const icon = type === "success" ? "✓" : type === "warning" ? "!" : type === "error" ? "×" : "✦";
        toast.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-content"><strong>${label}</strong><span>${escapeHTML(message)}</span></div><button type="button" class="toast-close" aria-label="Đóng">×</button>`;
        toast.querySelector(".toast-close")?.addEventListener("click", () => dismissToast(toast));
        DOM.toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("is-visible"));
        window.setTimeout(() => dismissToast(toast), duration);
        return toast;
    }
    function dismissToast(toast) {
        if (!toast || toast.dataset.removing === "1") return;
        toast.dataset.removing = "1";
        toast.classList.remove("is-visible");
        setTimeout(() => toast.remove(), 220);
    }
    function setModal(modal, visible) {
        if (!modal) return;
        modal.classList.toggle("hidden", !visible);
        modal.setAttribute("aria-hidden", visible ? "false" : "true");
        DOM.globalOverlay?.classList.toggle("hidden", !visible);
        DOM.globalOverlay?.setAttribute("aria-hidden", visible ? "false" : "true");
        DOM.body.classList.toggle("modal-open", visible);
    }
    function closeModals() { setModal(DOM.guideModal, false); setModal(DOM.submitModal, false); }

    /* ---------------- Authentication / Server ---------------- */
    async function apiRequest(url, options = {}) {
        const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
        let data = null;
        try { data = await response.json(); } catch (_) { data = {}; }
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
    }
    function apiGet(url) { return apiRequest(url); }
    function apiPost(url, body) { return apiRequest(url, { method: 'POST', body: JSON.stringify(body ?? {}) }); }
    function apiPatch(url, body) { return apiRequest(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }); }

    function ensureAuthUI() {
        if ($('#authGate')) return;
        const gate = document.createElement('div');
        gate.id = 'authGate';
        gate.className = 'auth-gate';
        gate.innerHTML = `
          <div class="auth-card glass-card">
            <div class="auth-logo">✦</div>
            <div class="auth-kicker">MY EXAM WEB</div>
            <h1>Đăng nhập để làm bài</h1>
            <p>Tài khoản phải do quản trị viên cấp. Điểm và lịch sử được lưu theo tài khoản.</p>
            <form id="loginForm" class="auth-form">
              <label>Tên đăng nhập<input id="loginUsername" autocomplete="username" required></label>
              <label>Mật khẩu<input id="loginPassword" type="password" autocomplete="current-password" required></label>
              <button class="primary-button auth-submit" type="submit">Đăng nhập</button>
              <div id="loginError" class="auth-error hidden"></div>
            </form>
            <small class="auth-note">Admin mặc định lần đầu: <b>admin</b> / <b>Admin@123</b>. Hãy đổi/không chia sẻ mật khẩu này khi triển khai thật.</small>
          </div>`;
        document.body.appendChild(gate);
        $('#loginForm').addEventListener('submit', async e => {
            e.preventDefault();
            const btn = $('.auth-submit'); const error = $('#loginError');
            btn.disabled = true; btn.textContent = 'Đang đăng nhập...'; error.classList.add('hidden');
            try {
                const data = await apiPost('/api/login', { username: $('#loginUsername').value.trim(), password: $('#loginPassword').value });
                currentUser = data.user; updateUserUI(); gate.classList.add('hidden');
                await syncHistoryFromServer(); renderHistory();
                showToast(`Xin chào ${currentUser.fullName || currentUser.username}!`, 'success', 3000);
            } catch (err) { error.textContent = err.message; error.classList.remove('hidden'); }
            finally { btn.disabled = false; btn.textContent = 'Đăng nhập'; }
        });
    }
    function updateUserUI() {
        const name = $('.profile-name'); const avatar = $('.profile-avatar');
        if (name) name.textContent = currentUser ? (currentUser.fullName || currentUser.username) : 'Thí sinh';
        if (avatar) avatar.textContent = currentUser ? String(currentUser.fullName || currentUser.username).charAt(0).toUpperCase() : 'T';
        const old = $('#adminDashboardButton'); if (old) old.remove();
        if (currentUser?.role === 'admin') {
            const b = document.createElement('button'); b.id='adminDashboardButton'; b.className='icon-button glass-button'; b.dataset.action='open-admin'; b.title='Quản trị tài khoản'; b.textContent='⚙';
            $('.header-actions')?.prepend(b);
        }
    }
    async function authBoot() {
        ensureAuthUI();
        try { const data = await apiGet('/api/me'); currentUser = data.user; }
        catch (_) { currentUser = null; }
        updateUserUI();
        $('#authGate')?.classList.toggle('hidden', !!currentUser);
        if (!currentUser) showToast('Hãy đăng nhập bằng tài khoản được cấp.', 'warning', 4500);
    }
    async function logout() {
        try { await apiPost('/api/logout', {}); } catch (_) {}
        currentUser = null; stopTimer(); stopAutosave(); state.hasSubmitted = true; updateUserUI();
        $('#authGate')?.classList.remove('hidden'); setActiveScreen('home', false);
        showToast('Đã đăng xuất.', 'info', 2500);
    }
    async function renderAccountStats() {
        const host = document.getElementById('accountStatsPanel'); if (!host) return;
        try {
            const data = await apiGet('/api/stats');
            const card = (title, x) => `<div class="account-stat-card glass-card"><span>${title}</span><strong>${formatScore(x.best)} <small>/ ${formatScore(x.maxScore || (title==='VSAT' ? 150 : 10))}</small></strong><div>TB ${formatScore(x.average)} · ${x.attempts} lần thi</div><em>Lần gần nhất: ${formatScore(x.last)}</em></div>`;
            host.innerHTML = `<div class="stats-section-title"><span class="section-kicker">YOUR PERFORMANCE</span><h2>Thống kê riêng theo kỳ thi</h2></div><div class="account-stats-grid">${card('VSAT',data.vsat)}${card('THPTQG',data.thptqg)}</div>`;
        } catch (e) { host.innerHTML = '<div class="account-stat-card glass-card">Chưa lấy được thống kê từ máy chủ.</div>'; }
    }
    async function openProfile() {
        if (!currentUser) return;
        const old = document.getElementById('profileModal'); old?.remove();
        const modal = document.createElement('div'); modal.id='profileModal'; modal.className='floating-modal-wrap';
        modal.innerHTML=`<div class="floating-modal glass-card"><button class="modal-x" data-action="close-profile">×</button><div class="profile-big-avatar">${escapeHTML(String(currentUser.fullName||currentUser.username).charAt(0).toUpperCase())}</div><h2>${escapeHTML(currentUser.fullName||currentUser.username)}</h2><p>@${escapeHTML(currentUser.username)} · ${currentUser.role==='admin'?'Quản trị viên':'Thí sinh'}</p><div class="profile-modal-actions">${currentUser.role==='admin'?'<button class="secondary-button" data-action="open-admin">⚙ Quản trị tài khoản</button>':''}<button class="primary-button" data-action="logout">Đăng xuất</button></div></div>`;
        document.body.appendChild(modal);
    }
    async function openAdmin() {
        if (currentUser?.role !== 'admin') return;
        document.getElementById('profileModal')?.remove(); document.getElementById('adminModal')?.remove();
        const modal=document.createElement('div'); modal.id='adminModal'; modal.className='floating-modal-wrap';
        modal.innerHTML=`<div class="floating-modal glass-card admin-modal"><button class="modal-x" data-action="close-admin">×</button><div class="section-kicker">ADMIN</div><h2>Quản trị tài khoản</h2><form id="createUserForm" class="admin-create-form"><input id="newFullName" placeholder="Họ tên" required><input id="newUsername" placeholder="Username" required><input id="newPassword" placeholder="Mật khẩu ≥ 6 ký tự" type="password" required><button class="primary-button" type="submit">+ Cấp tài khoản</button></form><div id="adminUsers" class="admin-users">Đang tải...</div></div>`;
        document.body.appendChild(modal);
        $('#createUserForm').addEventListener('submit', async e=>{e.preventDefault(); try{await apiPost('/api/admin/users',{fullName:$('#newFullName').value.trim(),username:$('#newUsername').value.trim(),password:$('#newPassword').value}); e.target.reset(); showToast('Đã tạo tài khoản.', 'success'); loadAdminUsers();}catch(err){showToast(err.message,'error',5000);}});
        loadAdminUsers();
    }
    async function loadAdminUsers(){ const host=$('#adminUsers'); if(!host)return; try{const d=await apiGet('/api/admin/users'); host.innerHTML=d.users.map(u=>`<div class="admin-user-row"><div><b>${escapeHTML(u.fullName||u.username)}</b><span>@${escapeHTML(u.username)} · ${u.status==='active'?'Đang hoạt động':'Đã khóa'}</span></div>${u.role==='student'?`<button class="secondary-button small" data-admin-id="${u.id}" data-admin-status="${u.status==='active'?'disabled':'active'}">${u.status==='active'?'Khóa':'Mở'}</button>`:''}</div>`).join('')||'Chưa có tài khoản học sinh.'; }catch(e){host.textContent=e.message;} }

    /* ---------------- Navigation ---------------- */
    function setActiveScreen(name, writeHash = true) {
        DOM.screens.forEach(screen => screen.classList.toggle("is-active", screen.dataset.screen === name));
        state.screen = name;
        DOM.body.classList.toggle("is-exam", name === "exam");
        if (DOM.headerTimer) DOM.headerTimer.classList.toggle("hidden", name !== "exam");
        if (writeHash) {
            try { history.replaceState({ screen: name }, "", name === "home" ? "#home" : `#${name}`); } catch (_) {}
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function goHome() {
        if (state.screen === "exam" && state.questions.length && !state.hasSubmitted) {
            showToast("Phiên thi vẫn đang được lưu. Bấm Bắt đầu thi thử để tiếp tục.", "warning", 3600);
        }
        closeModals();
        setActiveScreen("home");
    }
    function openGuide() { setModal(DOM.guideModal, true); playSound("click"); }
    function openSubmitModal() {
        if (!state.questions.length || state.hasSubmitted || state.isSubmitting) return;
        const answered = countAnswered();
        DOM.submitAnsweredCount.textContent = String(answered);
        DOM.submitUnansweredCount.textContent = String(state.questions.length - answered);
        DOM.submitRemainingTime.textContent = formatTimer(getRemainingSeconds());
        setModal(DOM.submitModal, true);
        playSound("click");
    }

    function openExamSelector(examKey = null) {
        if (examKey && EXAMS[examKey]) {
            state.examKey = examKey;
            state.examConfig = EXAMS[examKey];
        }
        if (!state.examConfig) state.examConfig = EXAMS.vsat;
        state.examKey = state.examConfig.key;
        renderSubjectSelector();
        setActiveScreen("exam-selection");
        playSound("click");
    }
    function renderSubjectSelector() {
        const exam = state.examConfig || EXAMS.vsat;
        DOM.selectedExamBreadcrumb.textContent = exam.name;
        DOM.selectionExamName.textContent = exam.name;
        DOM.selectionTitle.textContent = `Chọn môn ${exam.name} để bắt đầu`;
        DOM.selectionDescription.textContent = `${exam.description} Dữ liệu chỉ lấy từ manifest.json, không tạo câu hỏi giả.`;
        DOM.subjectLoading.classList.add("hidden");
        DOM.subjectGrid.innerHTML = exam.subjects.map((subject, i) => {
            const duration = getDurationMinutes(exam.key, subject.key);
            return `<button class="subject-card glass-card fade-up" type="button" style="--subject-accent:${escapeHTML(subject.accent)};animation-delay:${Math.min(i * 0.05, 0.35)}s" data-action="choose-subject" data-exam="${escapeHTML(exam.key)}" data-subject="${escapeHTML(subject.key)}">
                <span class="subject-card-icon">${escapeHTML(subject.icon)}</span>
                <h3>${escapeHTML(subject.name)}</h3>
                <p>${escapeHTML(subject.description)}</p>
                <span class="subject-card-meta"><span>◷ ${duration} phút</span><span>↗ Bắt đầu</span></span>
            </button>`;
        }).join("");
    }

    /* ---------------- Manifest-only question DB ---------------- */
    async function fetchJSON(url, signal) {
        const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal });
        if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);
        return response.json();
    }
    function basePath(examKey, subjectKey) {
        return `./database/${encodeURIComponent(examKey)}/${encodeURIComponent(subjectKey)}/`;
    }
    function extractManifestFiles(manifest) {
        if (Array.isArray(manifest)) return manifest;
        if (!isObject(manifest)) return [];
        const raw = manifest.files ?? manifest.jsonFiles ?? manifest.entries ?? [];
        if (!Array.isArray(raw)) return [];
        return raw.map(item => isObject(item) ? (item.file ?? item.path ?? item.name) : item).filter(Boolean);
    }
    function safeManifestPath(fileName) {
        const path = String(fileName).trim();
        if (!path || path.startsWith("/") || path.includes("..") || /^https?:\/\//i.test(path)) return null;
        return path.replace(/^\.\//, "");
    }
    async function discoverFilesFromManifest(examKey, subjectKey) {
        const root = basePath(examKey, subjectKey);
        const manifestUrl = `${root}${APP.manifestFile}`;
        const subjectName = getSubjectConfig(examKey, subjectKey)?.name || subjectKey;

        // Nếu người dùng mở trực tiếp file:// thì fetch() thường bị trình duyệt chặn.
        // Khi đó lỗi trước đây bị báo nhầm thành "thiếu manifest".
        if (window.location.protocol === "file:") {
            throw new Error(`Bạn đang mở app bằng file://. Hãy chạy project bằng Live Server/localhost rồi tải lại. App đang cần đọc: ${manifestUrl}`);
        }

        let manifest;
        try {
            manifest = await fetchJSON(manifestUrl);
        } catch (error) {
            const detail = error?.message ? ` Chi tiết: ${error.message}` : "";
            throw new Error(`Không đọc được manifest.json của ${subjectName}. URL đang yêu cầu: ${manifestUrl}.${detail}`);
        }

        const rawFiles = extractManifestFiles(manifest);
        const files = rawFiles.map(safeManifestPath).filter(Boolean);
        if (!files.length) {
            throw new Error(`manifest.json của ${subjectName} đã được tải nhưng không có file hợp lệ. Cần có: "files": ["de1.json", "de2.json", ...].`);
        }
        // manifestUrl ở trên là đường dẫn tương đối; URL() yêu cầu base phải là absolute URL.
        // Chuyển manifestUrl thành absolute trước khi resolve các file trong mảng "files".
        let absoluteManifestUrl;
        try {
            absoluteManifestUrl = new URL(manifestUrl, window.location.href).href;
        } catch (error) {
            throw new Error(`Không tạo được URL tuyệt đối cho manifest.json: ${manifestUrl}. Hãy chạy bằng Live Server/localhost.`);
        }

        const resolvedFiles = [...new Set(files)].map(file => {
            try {
                return new URL(file, absoluteManifestUrl).href;
            } catch (error) {
                throw new Error(`File trong manifest không tạo được URL hợp lệ: ${file}`);
            }
        });

        return { root, manifestUrl: absoluteManifestUrl, files: resolvedFiles };
    }

    function extractQuestionArray(data, inherited = {}) {
        if (Array.isArray(data)) return data.flatMap(item => extractQuestionArray(item, inherited));
        if (!isObject(data)) return [];
        const nested = data.questions ?? data.items ?? data.data ?? data.questionBank;
        if (Array.isArray(nested)) return nested.flatMap(item => extractQuestionArray(item, { ...inherited, part: data.part ?? inherited.part, partTitle: data.partTitle ?? inherited.partTitle }));
        if (Array.isArray(data.sections)) return data.sections.flatMap(section => extractQuestionArray(section, { ...inherited, part: section.part ?? section.section ?? inherited.part, partTitle: section.partTitle ?? section.title ?? inherited.partTitle }));
        if (data.question || data.text || data.prompt || data.content) return [{ ...inherited, ...data }];
        const values = Object.values(data);
        if (values.some(v => isObject(v) && (v.question || v.text || v.prompt))) return values.flatMap(v => extractQuestionArray(v, inherited));
        return [];
    }

    const TYPE_ALIASES = {
        multiple_choice: "mcq", "multiple-choice": "mcq", choice: "mcq", trac_nghiem: "mcq", "trắc nghiệm": "mcq",
        truefalse: "true_false", "true-false": "true_false", boolean: "true_false", dung_sai: "true_false", "đúng_sai": "true_false",
        match: "matching", pairing: "matching", ghep_hop: "matching", "ghép_hợp": "matching",
        short: "short_answer", "short-answer": "short_answer", fill: "short_answer", tra_loi_ngan: "short_answer", "trả_lời_ngắn": "short_answer"
    };
    function normalizeOptions(input) {
        if (Array.isArray(input)) return input.map((item, i) => isObject(item) ? {
            key: String(item.key ?? item.id ?? item.label ?? String.fromCharCode(65 + i)),
            text: String(item.text ?? item.label ?? item.content ?? item.value ?? "")
        } : { key: String.fromCharCode(65 + i), text: String(item ?? "") });
        if (isObject(input)) return Object.entries(input).map(([key, value]) => ({ key, text: String(isObject(value) ? (value.text ?? value.label ?? value.content ?? value.value ?? "") : value ?? "") }));
        return [];
    }
    function normalizeStatements(input) {
        if (!Array.isArray(input)) return [];
        return input.map((item, i) => isObject(item) ? {
            key: String(item.key ?? item.id ?? String.fromCharCode(97 + i)),
            text: String(item.text ?? item.label ?? item.content ?? item.statement ?? "")
        } : { key: String.fromCharCode(97 + i), text: String(item ?? "") });
    }
    function normalizePairs(input) {
        if (!Array.isArray(input)) return [];
        return input.map((item, i) => isObject(item) ? {
            key: String(item.key ?? item.id ?? String(i + 1)),
            left: String(item.left ?? item.question ?? item.prompt ?? item.text ?? item.item ?? ""),
            options: normalizeOptions(item.options ?? item.choices ?? item.targets ?? item.right)
        } : { key: String(i + 1), left: String(item ?? ""), options: [] });
    }
    function normalizeBoolean(v) {
        if (typeof v === "boolean") return v;
        const n = normalizeText(v);
        if (["true", "1", "yes", "y", "dung", "đúng", "t"].includes(n)) return true;
        if (["false", "0", "no", "n", "sai", "f"].includes(n)) return false;
        return null;
    }
    function normalizeTFAnswer(answer, statements) {
        const keys = statements.map(s => s.key);
        const out = {};
        if (Array.isArray(answer)) {
            answer.forEach((v, i) => { if (keys[i]) { const b = normalizeBoolean(v); if (b !== null) out[keys[i]] = b; } });
        } else if (isObject(answer)) {
            keys.forEach(key => { if (Object.prototype.hasOwnProperty.call(answer, key)) { const b = normalizeBoolean(answer[key]); if (b !== null) out[key] = b; } });
        } else if (keys.length === 1) {
            const b = normalizeBoolean(answer); if (b !== null) out[keys[0]] = b;
        }
        return out;
    }
    function normalizeMatchingAnswer(answer, pairs) {
        const keys = pairs.map(p => p.key);
        const out = {};
        if (isObject(answer)) keys.forEach(key => { if (Object.prototype.hasOwnProperty.call(answer, key)) out[key] = String(answer[key]); });
        else if (Array.isArray(answer)) answer.forEach((v, i) => { if (keys[i]) out[keys[i]] = String(v); });
        return out;
    }
    function normalizeQuestion(raw, index, source, examKey) {
        const q = isObject(raw) ? deepClone(raw) : {};
        const rawType = String(q.type ?? q.questionType ?? q.kind ?? q.format ?? "mcq").trim().toLowerCase();
        const type = TYPE_ALIASES[rawType] || rawType;
        const text = String(q.question ?? q.text ?? q.prompt ?? q.content ?? "").trim();
        const id = String(q.id ?? q.uid ?? `${source}#q${index + 1}`);
        const options = normalizeOptions(q.options ?? q.choices ?? q.answers ?? q.luas);
        const statements = normalizeStatements(q.statements ?? q.subquestions ?? q.parts);
        const pairs = normalizePairs(q.pairs ?? q.leftItems ?? q.matching);
        let answer = q.answer ?? q.correctAnswer ?? q.correct ?? q.key ?? q.solution;
        const acceptedAnswers = Array.isArray(q.acceptedAnswers ?? q.accepted_answers)
            ? (q.acceptedAnswers ?? q.accepted_answers).filter(v => v != null)
            : [];
        if (type === "true_false") answer = normalizeTFAnswer(answer, statements);
        if (type === "matching") answer = normalizeMatchingAnswer(answer, pairs);
        if (type === "short_answer" && acceptedAnswers.length === 0 && answer != null) acceptedAnswers.push(answer);

        return {
            id, type, text, options, statements, pairs, answer,
            acceptedAnswers, explanation: String(q.explanation ?? q.solutionText ?? q.rationale ?? ""),
            image: String(q.image ?? q.imageUrl ?? q.img ?? ""),
            source,
            part: safeNumber(q.part ?? q.section ?? q.sectionNumber, null),
            partTitle: String(q.partTitle ?? q.sectionTitle ?? ""),
            points: q.points ?? q.score ?? null,
            difficulty: String(q.difficulty ?? q.level ?? ""),
            tags: Array.isArray(q.tags) ? q.tags : q.topic ? [q.topic] : [],
            examKey
        };
    }
    function validateQuestion(q) {
        if (!q.id || !q.type || !q.text) return "thiếu id/type/text";
        if (!["mcq", "true_false", "matching", "short_answer"].includes(q.type)) return `type=${q.type} chưa được hỗ trợ`;
        if (q.type === "mcq" && q.options.length < 2) return "MCQ phải có ít nhất 2 phương án";
        if (q.type === "true_false" && (!q.statements.length || !isObject(q.answer))) return "Đúng/Sai thiếu statements hoặc answer";
        if (q.type === "matching" && (!q.pairs.length || !isObject(q.answer))) return "Ghép hợp thiếu pairs hoặc answer";
        if (q.type === "short_answer" && !q.acceptedAnswers.length) return "Trả lời ngắn thiếu acceptedAnswers/answer";
        return null;
    }
    function resolveAsset(sourceUrl, asset) {
        if (!asset) return "";
        const raw = String(asset).trim();
        if (!raw) return "";
        // JSON hiện tại có thể lưu đường dẫn từ root project: database/...
        if (/^(?:\.\/)?database\//i.test(raw)) return `./${raw.replace(/^\.\//, "")}`;
        if (/^data:/i.test(raw) || /^https?:\/\//i.test(raw) || /^\//.test(raw)) return raw;
        try { return new URL(raw, sourceUrl).href; } catch (_) { return raw; }
    }

    async function loadQuestionPool(examKey, subjectKey) {
        const discovery = await discoverFilesFromManifest(examKey, subjectKey);
        const all = [];
        const sources = [];
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 15000);
        try {
            const results = await Promise.all(discovery.files.map(async url => ({ url, data: await fetchJSON(url, abort.signal) })));
            for (const result of results) {
                sources.push(result.url);
                const raw = extractQuestionArray(result.data, {});
                raw.forEach((item, i) => all.push(normalizeQuestion(item, i, result.url, examKey)));
            }
        } catch (error) {
            if (error.name === "AbortError") throw new Error("Tải dữ liệu quá lâu. Hãy kiểm tra server và manifest.json.");
            throw error;
        } finally {
            clearTimeout(timeout);
        }

        const errors = [];
        const usable = [];
        const seen = new Set();
        for (const q of all) {
            if (seen.has(q.id)) continue;
            seen.add(q.id);
            const issue = validateQuestion(q);
            if (issue) { errors.push(`${q.id}: ${issue}`); continue; }
            q.image = resolveAsset(q.source, q.image);
            usable.push(q);
        }
        if (!usable.length) {
            throw new Error(`Manifest có file nhưng không có câu hỏi hợp lệ. ${errors.slice(0, 3).join(" | ")}`);
        }
        state.loadedSources = sources;
        state.dataWarnings = errors;
        return usable;
    }

    function selectPaper(pool, examKey) {
        const exam = getExamConfig(examKey);
        if (!exam) throw new Error("Không tìm thấy cấu hình kỳ thi.");
        const selected = [];
        const used = new Set();
        for (const section of exam.blueprint) {
            let candidates = pool.filter(q => q.type === section.type && !used.has(q.id));
            const withPart = candidates.filter(q => q.part == null || Number(q.part) === Number(section.part));
            if (withPart.length >= section.count) candidates = withPart;
            candidates = shuffle(candidates).slice(0, section.count);
            if (candidates.length < section.count) {
                const have = candidates.length;
                throw new Error(`Không đủ câu ${typeLabel(section.type)} cho ${section.title}: cần ${section.count}, chỉ có ${have}. Kiểm tra manifest và file JSON.`);
            }
            candidates.forEach((q, index) => {
                used.add(q.id);
                selected.push({
                    ...deepClone(q),
                    blueprintPart: section.part,
                    blueprintTitle: section.title,
                    orderInPart: index + 1
                });
            });
        }
        return selected.map((q, i) => ({ ...q, displayNumber: i + 1 }));
    }

    /* ---------------- Timer ---------------- */
    function getRemainingSeconds() {
        if (!state.endAt) return Math.max(0, state.remainingSeconds);
        return Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
    }
    function stopTimer() {
        if (state.timerId) clearInterval(state.timerId);
        state.timerId = null;
    }
    function updateTimerUI() {
        const remaining = getRemainingSeconds();
        state.remainingSeconds = remaining;
        DOM.headerTimerValue && (DOM.headerTimerValue.textContent = formatTimer(remaining));
        DOM.sidebarTimerValue && (DOM.sidebarTimerValue.textContent = formatTimer(remaining));
        [DOM.headerTimer, DOM.sidebarTimer].forEach(node => {
            if (!node) return;
            node.classList.toggle("is-warning", remaining > APP.dangerSeconds && remaining <= APP.warningSeconds);
            node.classList.toggle("is-danger", remaining > 0 && remaining <= APP.dangerSeconds);
        });
        const ratio = state.durationSeconds ? clamp(remaining / state.durationSeconds, 0, 1) : 0;
        if (DOM.timerProgressFill) DOM.timerProgressFill.style.width = `${ratio * 100}%`;
        if (remaining === APP.warningSeconds || remaining === APP.dangerSeconds) {
            playSound("warning");
            showToast(remaining === APP.dangerSeconds ? "Chỉ còn 5 phút!" : "Còn 10 phút — kiểm tra lại đáp án.", "warning", 3800);
        }
    }
    function startTimer() {
        stopTimer();
        updateTimerUI();
        state.timerId = setInterval(() => {
            updateTimerUI();
            if (getRemainingSeconds() <= 0) {
                stopTimer();
                autoSubmit();
            }
        }, 250);
    }
    function stopAutosave() { if (state.autosaveId) clearInterval(state.autosaveId); state.autosaveId = null; }
    function startAutosave() {
        stopAutosave();
        state.autosaveId = setInterval(saveSession, APP.autosaveMs);
    }
    async function autoSubmit() {
        if (state.hasSubmitted || state.isSubmitting || !state.questions.length) return;
        state.submitReason = "timeout";
        closeModals();
        showToast("Hết giờ — đang chấm và nộp bài.", "warning", 2500);
        await sleep(120);
        await submitExam("timeout");
    }

    /* ---------------- Start / resume ---------------- */
    async function chooseSubject(examKey, subjectKey) {
        const exam = getExamConfig(examKey);
        const subject = getSubjectConfig(examKey, subjectKey);
        if (!exam || !subject) return showToast("Không tìm thấy cấu hình môn.", "error");

        // Resume only the same subject/exam.
        const saved = getSavedSession();
        if (saved && saved.examKey === examKey && saved.subjectKey === subjectKey) {
            state.pendingResumeSession = null;
            resumeSession(saved);
            return;
        }
        if (saved) state.pendingResumeSession = saved;
        await startExam(examKey, subjectKey, subject.name);
    }

    async function startExam(examKey, subjectKey, subjectName) {
        if (state.screen === "exam" && !state.hasSubmitted) return;
        const exam = getExamConfig(examKey);
        if (!exam) return showToast("Không tìm thấy kỳ thi.", "error");
        state.examKey = examKey;
        state.examConfig = exam;
        state.subjectKey = subjectKey;
        state.subjectName = subjectName;
        state.hasSubmitted = false;
        state.isSubmitting = false;
        state.result = null;
        state.answers = {};
        state.flags = {};
        state.currentIndex = 0;
        state.submitReason = null;
        DOM.questionContainer.innerHTML = `<div class="question-loading"><div class="loading-spinner"></div><span>Đang tải dữ liệu từ manifest.json...</span></div>`;
        setActiveScreen("exam");

        const toast = showToast("Đang nạp đề thật…", "info", 2200);
        try {
            const pool = await loadQuestionPool(examKey, subjectKey);
            state.questions = selectPaper(pool, examKey);
            state.durationMinutes = getDurationMinutes(examKey, subjectKey);
            state.durationSeconds = state.durationMinutes * 60;
            state.remainingSeconds = state.durationSeconds;
            state.startAt = Date.now();
            state.endAt = state.startAt + state.durationSeconds * 1000;
            clearSession();
            renderExamShell();
            startTimer();
            startAutosave();
            renderCurrentQuestion();
            playSound("success");
            showToast(`Đã tải ${state.questions.length} câu thật · ${state.durationMinutes} phút.`, "success", 2400);
        } catch (error) {
            stopTimer(); stopAutosave();
            state.questions = [];
            closeModals();
            console.error(error);
            showToast(error.message || "Không thể tạo đề.", "error", 7000);
            setActiveScreen("exam-selection");
        } finally {
            if (toast) dismissToast(toast);
        }
    }

    function resumeSession(session) {
        const exam = getExamConfig(session.examKey);
        const subject = getSubjectConfig(session.examKey, session.subjectKey);
        if (!exam || !subject) { clearSession(); return false; }
        state.examKey = session.examKey;
        state.examConfig = exam;
        state.subjectKey = session.subjectKey;
        state.subjectName = session.subjectName || subject.name;
        state.questions = deepClone(session.questions);
        state.answers = deepClone(session.answers || {});
        state.flags = deepClone(session.flags || {});
        state.currentIndex = clamp(safeNumber(session.currentIndex, 0), 0, state.questions.length - 1);
        state.durationMinutes = getDurationMinutes(state.examKey, state.subjectKey);
        state.durationSeconds = state.durationMinutes * 60;
        state.startAt = safeNumber(session.startAt, Date.now());
        state.endAt = safeNumber(session.endAt, Date.now() + state.durationSeconds * 1000);
        state.remainingSeconds = getRemainingSeconds();
        state.hasSubmitted = false;
        state.isSubmitting = false;
        setActiveScreen("exam");
        renderExamShell();
        startTimer();
        startAutosave();
        renderCurrentQuestion();
        showToast(`Đã khôi phục ${state.subjectName} · còn ${formatTimer(state.remainingSeconds)}.`, "success", 3000);
        return true;
    }

    /* ---------------- Exam rendering ---------------- */
    function renderExamShell() {
        DOM.examTitle.textContent = state.subjectName || "Môn học";
        DOM.totalQuestionNumber.textContent = String(state.questions.length);
        DOM.questionCountStat && (DOM.questionCountStat.textContent = String(state.questions.length));
        renderPalette();
        updateTimerUI();
    }
    function renderPalette() {
        if (!DOM.questionPalette) return;
        DOM.questionPalette.innerHTML = state.questions.map((q, i) => {
            const answered = isQuestionAnswered(q);
            return `<button class="palette-button ${answered ? "is-answered" : ""} ${state.flags[q.id] ? "is-flagged" : ""} ${i === state.currentIndex ? "is-current" : ""}" type="button" data-action="jump-question" data-index="${i}" aria-label="Đi tới câu ${i + 1}">${i + 1}</button>`;
        }).join("");
        updatePaletteCount();
    }
    function updatePaletteCount() {
        if (!DOM.paletteCount) return;
        const answered = countAnswered();
        DOM.paletteCount.textContent = `${answered}/${state.questions.length}`;
        $$(".palette-button", DOM.questionPalette).forEach(btn => {
            const i = safeNumber(btn.dataset.index, -1);
            const q = state.questions[i];
            if (!q) return;
            btn.classList.toggle("is-answered", isQuestionAnswered(q));
            btn.classList.toggle("is-flagged", Boolean(state.flags[q.id]));
            btn.classList.toggle("is-current", i === state.currentIndex);
        });
    }
    function toggleSidebar() { DOM.examScreen?.classList.toggle("sidebar-open"); }
    function closeSidebar() { DOM.examScreen?.classList.remove("sidebar-open"); }

    function renderCurrentQuestion(direction = 0) {
        if (!state.questions.length || !DOM.questionContainer) return;
        state.currentIndex = clamp(state.currentIndex, 0, state.questions.length - 1);
        const q = state.questions[state.currentIndex];
        DOM.currentQuestionNumber.textContent = String(state.currentIndex + 1);
        DOM.totalQuestionNumber.textContent = String(state.questions.length);
        const percent = Math.round((countAnswered() / state.questions.length) * 100);
        DOM.questionProgressText.textContent = `${percent}% hoàn thành`;
        DOM.questionProgressFill.style.width = `${percent}%`;
        DOM.examPartLabel.textContent = state.examKey === "thptqg" ? `PHẦN ${q.blueprintPart}` : "DẠNG CÂU HỎI";
        DOM.examPartTitle.textContent = q.blueprintTitle || typeLabel(q.type);
        DOM.flagQuestionButton?.classList.toggle("is-active", Boolean(state.flags[q.id]));
        DOM.flagQuestionButton?.setAttribute("aria-pressed", state.flags[q.id] ? "true" : "false");
        DOM.questionContainer.innerHTML = questionHTML(q);
        if (direction !== 0) {
            const cls = direction < 0 ? "question-slide-left" : "question-slide-right";
            DOM.questionContainer.classList.remove("question-slide-left", "question-slide-right");
            requestAnimationFrame(() => DOM.questionContainer.classList.add(cls));
        }
        bindQuestionEvents();
        updatePaletteCount();
        updateNavigationButtons();
        typesetMath(DOM.questionContainer);
    }
    function questionHTML(q) {
        const difficulty = q.difficulty ? `<span class="question-type-chip">${escapeHTML(q.difficulty)}</span>` : "";
        return `<div class="question-header"><div><span class="question-type-chip">${escapeHTML(typeIcon(q.type))} ${escapeHTML(typeLabel(q.type))}</span><span class="question-number-large">Câu ${q.displayNumber}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">${difficulty}<span class="question-type-chip">JSON</span></div></div>
            ${q.image ? `<div class="question-image-wrap"><img class="question-image" src="${escapeHTML(q.image)}" alt="Hình minh họa" loading="lazy"></div>` : ""}
            <h2 class="question-text math-content">${richText(q.text)}</h2>
            ${bodyHTML(q)}`;
    }
    function bodyHTML(q) {
        if (q.type === "mcq") return mcqHTML(q);
        if (q.type === "true_false") return trueFalseHTML(q);
        if (q.type === "matching") return matchingHTML(q);
        if (q.type === "short_answer") return shortAnswerHTML(q);
        return `<div class="empty-state glass-card"><h3>Type chưa hỗ trợ</h3></div>`;
    }
    function mcqHTML(q) {
        const selected = String(state.answers[q.id] ?? "");
        return `<div class="options-grid" role="radiogroup" aria-label="Các lựa chọn">${q.options.map((o, i) => {
            const key = String(o.key ?? String.fromCharCode(65 + i));
            const active = selected === key || selected === String(i);
            return `<button class="option-button ${active ? "is-selected" : ""}" type="button" data-answer-type="mcq" data-option-key="${escapeHTML(key)}" aria-pressed="${active}"><span class="option-letter">${escapeHTML(key)}</span><span class="option-content math-content">${richText(o.text)}</span></button>`;
        }).join("")}</div>`;
    }
    function trueFalseHTML(q) {
        const answer = isObject(state.answers[q.id]) ? state.answers[q.id] : {};
        return `<div class="boolean-grid">${q.statements.map((s, i) => {
            const key = String(s.key ?? String.fromCharCode(97 + i));
            const val = answer[key];
            return `<div class="sub-question" data-statement-key="${escapeHTML(key)}"><div class="sub-question-top"><span class="sub-question-label">${escapeHTML(key.toUpperCase())}</span><span class="sub-question-text math-content">${richText(s.text)}</span></div><div class="boolean-actions"><button type="button" class="boolean-choice ${val === true ? "is-selected true" : ""}" data-answer-type="true_false" data-boolean-value="true" data-key="${escapeHTML(key)}" aria-pressed="${val === true}">✓ Đúng</button><button type="button" class="boolean-choice ${val === false ? "is-selected false" : ""}" data-answer-type="true_false" data-boolean-value="false" data-key="${escapeHTML(key)}" aria-pressed="${val === false}">✕ Sai</button></div></div>`;
        }).join("")}</div>`;
    }
    function matchingHTML(q) {
        const answer = isObject(state.answers[q.id]) ? state.answers[q.id] : {};
        return `<div class="matching-grid">${q.pairs.map((p, i) => {
            const key = String(p.key ?? String(i + 1));
            return `<div class="sub-question"><div class="sub-question-top"><span class="sub-question-label">${escapeHTML(key.toUpperCase())}</span><span class="sub-question-text math-content">${richText(p.left)}</span></div><div style="margin-top:12px;"><select style="width:100%;min-height:44px;padding:9px 11px;border:1px solid var(--border);border-radius:11px;background:rgba(255,255,255,.035);color:var(--text);outline:none;" data-answer-type="matching" data-key="${escapeHTML(key)}" aria-label="Đáp án ghép cho mục ${escapeHTML(key)}"><option value="">— Chọn phương án —</option>${p.options.map(o => `<option value="${escapeHTML(o.key)}" ${String(answer[key] ?? "") === String(o.key) ? "selected" : ""}>${escapeHTML(o.key)} · ${escapeHTML(o.text)}</option>`).join("")}</select></div></div>`;
        }).join("")}</div>`;
    }
    function shortAnswerHTML(q) {
        const current = String(state.answers[q.id] ?? "");
        const inputId = `shortAnswer_${String(q.id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
        return `<div class="short-answer-box"><label for="${escapeHTML(inputId)}" style="font-size:10px;font-weight:700;color:var(--text-muted);">Nhập đáp án</label><input id="${escapeHTML(inputId)}" class="short-answer-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="120" value="${escapeHTML(current)}" placeholder="Ví dụ: 42" data-answer-type="short_answer"><button class="secondary-button" style="width:max-content;" type="button" data-answer-type="short_answer-save">Lưu câu trả lời</button><p style="margin:0;font-size:9px;color:var(--text-dim);">Đáp án được đối chiếu với acceptedAnswers/answer trong JSON.</p></div>`;
    }

    function bindQuestionEvents() {
        DOM.questionContainer?.querySelectorAll('[data-answer-type="mcq"]').forEach(btn => btn.addEventListener("click", () => {
            const q = currentQuestion(); if (!q || state.hasSubmitted) return;
            state.answers[q.id] = btn.dataset.optionKey;
            playSound("select"); saveSession(); renderCurrentQuestion();
        }));
        DOM.questionContainer?.querySelectorAll('[data-answer-type="true_false"]').forEach(btn => btn.addEventListener("click", () => {
            const q = currentQuestion(); if (!q || state.hasSubmitted) return;
            const map = isObject(state.answers[q.id]) ? { ...state.answers[q.id] } : {};
            map[btn.dataset.key] = btn.dataset.booleanValue === "true";
            state.answers[q.id] = map;
            playSound("select"); saveSession(); renderCurrentQuestion();
        }));
        DOM.questionContainer?.querySelectorAll('[data-answer-type="matching"]').forEach(select => select.addEventListener("change", () => {
            const q = currentQuestion(); if (!q || state.hasSubmitted) return;
            const map = isObject(state.answers[q.id]) ? { ...state.answers[q.id] } : {};
            if (select.value) map[select.dataset.key] = select.value; else delete map[select.dataset.key];
            state.answers[q.id] = map;
            saveSession(); updatePaletteCount(); typesetMath(DOM.questionContainer);
        }));
        const input = DOM.questionContainer?.querySelector('[data-answer-type="short_answer"]');
        const saveShort = () => {
            const q = currentQuestion(); if (!q || !input || state.hasSubmitted) return;
            state.answers[q.id] = input.value.trim(); saveSession(); updatePaletteCount(); playSound("select"); showToast("Đã lưu câu trả lời.", "success", 1400);
        };
        input?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveShort(); } });
        DOM.questionContainer?.querySelector('[data-answer-type="short_answer-save"]')?.addEventListener("click", saveShort);
    }
    function currentQuestion() { return state.questions[state.currentIndex] || null; }
    function isQuestionAnswered(q) {
        const a = state.answers[q.id];
        if (q.type === "mcq") return a != null && String(a) !== "";
        if (q.type === "short_answer") return a != null && String(a).trim() !== "";
        if (q.type === "true_false") return isObject(a) && q.statements.every(s => Object.prototype.hasOwnProperty.call(a, s.key));
        if (q.type === "matching") return isObject(a) && q.pairs.every(p => Object.prototype.hasOwnProperty.call(a, p.key));
        return false;
    }
    function countAnswered() { return state.questions.reduce((sum, q) => sum + (isQuestionAnswered(q) ? 1 : 0), 0); }
    function goToQuestion(index) {
        const next = clamp(safeNumber(index, 0), 0, Math.max(0, state.questions.length - 1));
        if (next === state.currentIndex) return;
        const direction = next > state.currentIndex ? 1 : -1;
        state.currentIndex = next;
        renderCurrentQuestion(direction); closeSidebar(); saveSession(); playSound("click");
    }
    function nextQuestion() {
        if (!state.questions.length) return;
        if (state.currentIndex >= state.questions.length - 1) return openSubmitModal();
        state.currentIndex += 1; renderCurrentQuestion(1); saveSession(); playSound("click");
    }
    function prevQuestion() {
        if (state.currentIndex <= 0) return showToast("Bạn đang ở câu đầu tiên.", "info", 1400);
        state.currentIndex -= 1; renderCurrentQuestion(-1); saveSession(); playSound("click");
    }
    function updateNavigationButtons() {
        $$('[data-action="prev-question"]').forEach(b => b.disabled = state.currentIndex <= 0);
    }
    function toggleFlag() {
        const q = currentQuestion(); if (!q || state.hasSubmitted) return;
        state.flags[q.id] = !state.flags[q.id]; updatePaletteCount(); saveSession(); playSound("click");
    }

    /* ---------------- Scoring ---------------- */
    function numericValue(value) {
        if (value == null || String(value).trim() === "") return null;
        let s = String(value).trim().replace(/\s/g, "").replace(/,/g, ".");
        if (/^[-+]?\d+(?:\.\d+)?\/[-+]?\d+(?:\.\d+)?$/.test(s)) {
            const [a,b] = s.split("/").map(Number); return b ? a / b : null;
        }
        if (/%$/.test(s)) s = s.slice(0, -1);
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }
    function shortEqual(user, candidate) {
        const a = numericValue(user); const b = numericValue(candidate);
        if (a !== null && b !== null) return Math.abs(a - b) <= 1e-6;
        return normalizeText(user) === normalizeText(candidate);
    }
    function getCorrectMCQKey(q) {
        let ans = q.answer;
        if (isObject(ans)) ans = ans.key ?? ans.option ?? ans.value;
        if (typeof ans === "number") return q.options[ans]?.key ?? String(ans);
        const s = String(ans ?? "").trim();
        const byKey = q.options.find(o => normalizeText(o.key) === normalizeText(s));
        if (byKey) return byKey.key;
        if (/^\d+$/.test(s)) return q.options[Number(s)]?.key ?? s;
        const byText = q.options.find(o => normalizeText(o.text) === normalizeText(s));
        return byText?.key ?? s;
    }
    function evaluateQuestion(q, userAnswer) {
        const scoring = state.examConfig?.scoring?.[q.type] || {};
        if (q.type === "mcq") {
            const correct = getCorrectMCQKey(q);
            const isCorrect = userAnswer != null && String(userAnswer) !== "" && normalizeText(userAnswer) === normalizeText(correct);
            const score = isCorrect ? safeNumber(scoring.perCorrect, q.points ?? 0) : 0;
            return { isCorrect, score: roundScore(score), earnedScore: roundScore(score), status: userAnswer == null || String(userAnswer) === "" ? "unanswered" : isCorrect ? "correct" : "wrong", correctCount: isCorrect ? 1 : 0, totalSubitems: 1, maxScore: safeNumber(scoring.perCorrect, q.points ?? 0) };
        }
        if (q.type === "true_false") {
            const user = isObject(userAnswer) ? userAnswer : {};
            const correct = isObject(q.answer) ? q.answer : {};
            const keys = q.statements.map(s => s.key).filter(key => Object.prototype.hasOwnProperty.call(correct, key));
            const right = keys.reduce((sum, key) => sum + (Object.prototype.hasOwnProperty.call(user, key) && user[key] === correct[key] ? 1 : 0), 0);
            const answered = keys.filter(key => Object.prototype.hasOwnProperty.call(user, key)).length;
            const earned = safeNumber(scoring[right], 0);
            return { isCorrect: right === keys.length && keys.length > 0, score: roundScore(earned), earnedScore: roundScore(earned), status: answered === 0 ? "unanswered" : answered === keys.length ? (right === keys.length ? "correct" : "wrong") : "partial", correctCount: right, totalSubitems: keys.length, maxScore: safeNumber(scoring[4], state.examKey === "vsat" ? 6 : 1) };
        }
        if (q.type === "matching") {
            const user = isObject(userAnswer) ? userAnswer : {};
            const correct = isObject(q.answer) ? q.answer : {};
            const keys = q.pairs.map(p => p.key).filter(key => Object.prototype.hasOwnProperty.call(correct, key));
            const right = keys.reduce((sum, key) => sum + (Object.prototype.hasOwnProperty.call(user, key) && String(user[key]) === String(correct[key]) ? 1 : 0), 0);
            const answered = keys.filter(key => String(user[key] ?? "") !== "").length;
            const earned = roundScore(right * safeNumber(scoring.perCorrect, 0));
            const maxScore = safeNumber(scoring.max, safeNumber(scoring.perCorrect, 0) * keys.length);
            return { isCorrect: right === keys.length && keys.length > 0, score: earned, earnedScore: earned, status: answered === 0 ? "unanswered" : answered === keys.length ? (right === keys.length ? "correct" : "wrong") : "partial", correctCount: right, totalSubitems: keys.length, maxScore };
        }
        if (q.type === "short_answer") {
            const candidates = q.acceptedAnswers.length ? q.acceptedAnswers : [q.answer];
            const isCorrect = candidates.some(candidate => shortEqual(userAnswer, candidate));
            const score = isCorrect ? safeNumber(scoring.perCorrect, q.points ?? 0) : 0;
            const answered = userAnswer != null && String(userAnswer).trim() !== "";
            return { isCorrect, score: roundScore(score), earnedScore: roundScore(score), status: answered ? (isCorrect ? "correct" : "wrong") : "unanswered", correctCount: isCorrect ? 1 : 0, totalSubitems: 1, maxScore: safeNumber(scoring.perCorrect, q.points ?? 0) };
        }
        return { isCorrect: false, score: 0, earnedScore: 0, status: "unknown", correctCount: 0, totalSubitems: 0, maxScore: 0 };
    }
    function calculateResult() {
        const evaluations = state.questions.map(q => ({ question: q, userAnswer: deepClone(state.answers[q.id]), evaluation: evaluateQuestion(q, state.answers[q.id]) }));
        const score = roundScore(evaluations.reduce((sum, item) => sum + item.evaluation.earnedScore, 0));
        const maxScore = safeNumber(state.examConfig?.maxScore, 0);
        const correctCount = evaluations.filter(x => x.evaluation.isCorrect).length;
        const unansweredCount = evaluations.filter(x => x.evaluation.status === "unanswered").length;
        const wrongCount = evaluations.filter(x => ["wrong"].includes(x.evaluation.status)).length;
        const percent = maxScore ? clamp(score / maxScore * 100, 0, 100) : 0;
        const usedSeconds = clamp(Math.round((Date.now() - state.startAt) / 1000), 0, state.durationSeconds);
        const breakdown = buildBreakdown(evaluations);
        return { id: uid("result"), createdAt: Date.now(), examKey: state.examKey, examName: state.examConfig?.name, subjectKey: state.subjectKey, subjectName: state.subjectName, score, maxScore, percent, correctCount, wrongCount, unansweredCount, usedSeconds, reason: state.submitReason || "manual", evaluations, breakdown, loadedSources: state.loadedSources };
    }
    function buildBreakdown(evaluations) {
        const map = new Map();
        evaluations.forEach(item => {
            const q = item.question; const key = `${q.blueprintPart}-${q.type}`;
            if (!map.has(key)) map.set(key, { part: q.blueprintPart, title: q.blueprintTitle || typeLabel(q.type), type: q.type, count: 0, correct: 0, earned: 0, max: 0 });
            const b = map.get(key); b.count += 1; b.correct += item.evaluation.isCorrect ? 1 : 0; b.earned = roundScore(b.earned + item.evaluation.earnedScore); b.max = roundScore(b.max + item.evaluation.maxScore);
        });
        return Array.from(map.values()).sort((a,b) => a.part - b.part);
    }

    /* ---------------- Submit/result ---------------- */
    function setSubmitBusy(busy) {
        state.isSubmitting = busy;
        const btn = $('[data-action="confirm-submit"]');
        if (!btn) return;
        btn.disabled = busy;
        btn.classList.toggle("submit-busy", busy);
        btn.innerHTML = busy ? '<span class="button-spinner" aria-hidden="true"></span><span>Đang chấm...</span>' : 'Nộp bài';
    }

    async function submitExam(reason = "manual") {
        if (state.hasSubmitted || state.isSubmitting || !state.questions.length) return;
        setSubmitBusy(true);
        state.submitReason = reason;
        closeModals();
        stopTimer(); stopAutosave();
        state.remainingSeconds = getRemainingSeconds();
        // Yield to browser before scoring/rendering result to prevent the UI from appearing frozen.
        await nextFrame();
        let result;
        try {
            result = calculateResult();
            state.hasSubmitted = true;
            state.result = result;
            clearSession();
            saveHistory(result);
            setActiveScreen("result");
            await nextFrame();
            renderResult(result);
            setSubmitBusy(false);
            if (result.percent >= 80) { startConfetti(); playSound("success"); }
            else playSound("click");
        } catch (error) {
            console.error("[My Exam] submit error", error);
            state.hasSubmitted = false;
            showToast(`Không thể chấm bài: ${error.message || error}`, "error", 7000);
            setSubmitBusy(false);
            startTimer(); startAutosave();
        }
    }
    function resultMessage(percent) {
        if (percent >= 90) return "Quá xuất sắc! Bạn đang vào form rất mạnh 🔥";
        if (percent >= 75) return "Phong độ rất tốt — tiếp tục giữ nhịp nhé ⚡";
        if (percent >= 60) return "Nền tảng ổn! Tập trung sửa lỗi để bứt tốc 🚀";
        if (percent >= 40) return "Bạn đã có nền tảng — luyện thêm để tăng độ chắc 💪";
        return "Mỗi lần làm đề là một lần tiến bộ. Tiếp tục nhé 🌱";
    }
    function renderResult(result) {
        DOM.resultTitle.textContent = `Hoàn thành ${result.examName} 🎉`;
        DOM.resultSubtitle.textContent = `${result.subjectName} · ${result.reason === "timeout" ? "Hệ thống tự động nộp khi hết giờ." : "Bạn đã chủ động nộp bài."}`;
        DOM.resultScore.textContent = formatScore(result.score);
        DOM.resultMaxScore.textContent = `/ ${formatScore(result.maxScore)}`;
        DOM.resultMessage.textContent = resultMessage(result.percent);
        DOM.correctCount.textContent = String(result.correctCount);
        DOM.wrongCount.textContent = String(result.wrongCount);
        DOM.unansweredCount.textContent = String(result.unansweredCount);
        DOM.usedTime.textContent = formatTimer(result.usedSeconds);
        DOM.reviewSummary.textContent = `${result.evaluations.length} câu · ${formatScore(result.score)}/${formatScore(result.maxScore)}`;
        const degree = clamp(result.percent, 0, 100) * 3.6;
        DOM.scoreRing?.style.setProperty("--score-degree", `${degree}deg`);
        if (DOM.scoreRing) DOM.scoreRing.style.background = `conic-gradient(var(--primary) 0deg, var(--cyan) var(--score-degree), rgba(255,255,255,.08) var(--score-degree), rgba(255,255,255,.08) 360deg)`;
        renderBreakdown(result);
        renderReview(result);
        resetConfettiCanvas();
        requestAnimationFrame(() => typesetMath(DOM.reviewList));
    }
    function renderBreakdown(result) {
        DOM.resultBreakdown.innerHTML = result.breakdown.map(item => {
            const pct = item.max ? clamp(item.earned / item.max * 100, 0, 100) : 0;
            return `<article class="breakdown-card glass-card"><div class="breakdown-card-top"><h3>${escapeHTML(item.title)}</h3><span class="breakdown-card-score">${formatScore(item.earned)} / ${formatScore(item.max)}</span></div><p style="margin-top:7px;">${escapeHTML(typeLabel(item.type))} · ${item.correct}/${item.count} câu trọn điểm</p><div class="breakdown-progress"><span style="width:${pct}%"></span></div></article>`;
        }).join("");
    }
    function renderUserAnswer(q, answer) {
        if (answer == null || answer === "") return "— Chưa trả lời";
        if (q.type === "mcq") return `<span class="answer-chip">${escapeHTML(String(answer))}</span>`;
        if (isObject(answer)) return Object.entries(answer).map(([k,v]) => `<span class="answer-chip">${escapeHTML(k)}: ${escapeHTML(String(v))}</span>`).join(" ");
        return escapeHTML(String(answer));
    }
    function renderCorrectAnswer(q) {
        if (q.type === "mcq") return `<span class="answer-chip">${escapeHTML(String(getCorrectMCQKey(q) ?? "—"))}</span>`;
        if (isObject(q.answer)) return Object.entries(q.answer).map(([k,v]) => `<span class="answer-chip">${escapeHTML(k)}: ${escapeHTML(String(v))}</span>`).join(" ");
        return escapeHTML(q.acceptedAnswers.join(" / ") || String(q.answer ?? "—"));
    }
    function renderReview(result) {
        DOM.reviewList.innerHTML = result.evaluations.map((item, i) => {
            const q = item.question; const e = item.evaluation;
            const status = e.status === "unanswered" ? "BỎ TRỐNG" : e.status === "partial" ? "ĐÚNG MỘT PHẦN" : e.isCorrect ? "ĐÚNG" : "SAI";
            const cls = e.status === "unanswered" ? "unanswered" : e.isCorrect ? "correct" : "wrong";
            return `<article class="review-item"><div class="review-item-top"><div class="review-item-title"><span class="review-question-number">${i + 1}</span><strong>${escapeHTML(typeLabel(q.type))}</strong></div><span class="review-item-status ${cls}">${status} · ${formatScore(e.earnedScore)}đ</span></div><div class="review-item-question math-content">${richText(q.text)}</div><div class="review-item-answer"><div class="review-answer-box ${e.isCorrect || e.status === "unanswered" ? "" : "answer-user-wrong"}"><span>Bạn trả lời</span><strong>${renderUserAnswer(q, item.userAnswer)}</strong></div><div class="review-answer-box answer-correct"><span>Đáp án đúng</span><strong>${renderCorrectAnswer(q)}</strong></div></div>${q.explanation ? `<div style="display:flex;gap:9px;margin-top:10px;padding:10px;border-radius:10px;background:var(--surface-soft);"><span>💡</span><div><strong style="font-size:9px;">Giải thích</strong><div class="math-content" style="margin-top:3px;font-size:9px;">${richText(q.explanation)}</div></div></div>` : ""}</article>`;
        }).join("");
    }

    /* ---------------- History ---------------- */
    function renderHistory() {
        const history = loadHistory().filter(item => item && item.examKey && Number.isFinite(Number(item.score)));
        DOM.historyExamCount.textContent = String(history.length);
        DOM.historyBestScore.textContent = formatScore(history.reduce((m, x) => Math.max(m, safeNumber(x.score)), 0));
        DOM.historyAverageScore.textContent = formatScore(history.length ? history.reduce((s,x) => s + safeNumber(x.score), 0) / history.length : 0);
        DOM.historyStreak.textContent = `${calculateStreak(history)} ngày`;
        if (!history.length) { DOM.historyList.innerHTML = ""; DOM.historyEmpty.classList.remove("hidden"); renderAccountStats(); return; }
        DOM.historyEmpty.classList.add("hidden");
        DOM.historyList.innerHTML = history.map((item, index) => `<article class="history-item glass-card"><div class="history-main"><div class="history-main-top"><span class="history-exam-chip">${escapeHTML(getExamConfig(item.examKey)?.name || item.examKey)}</span><span class="history-subject">${escapeHTML(item.subjectName || item.subjectKey)}</span></div><div class="history-date">${escapeHTML(formatDateTime(item.createdAt))} · ${Math.round(safeNumber(item.percent))}%</div></div><div class="history-score"><strong>${formatScore(item.score)}</strong><span>/ ${formatScore(item.maxScore)} điểm</span></div><div class="history-action"><button class="secondary-button" type="button" data-action="open-history-result" data-history-index="${index}">Xem lại</button></div></article>`).join("");
        renderAccountStats();
    }
    function calculateStreak(history) {
        const keys = [...new Set(history.map(item => {
            const d = new Date(item.createdAt); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("sv-SE");
        }).filter(Boolean))].sort().reverse();
        if (!keys.length) return 0;
        let streak = 1;
        for (let i = 1; i < keys.length; i++) {
            const a = new Date(`${keys[i - 1]}T00:00:00`); const b = new Date(`${keys[i]}T00:00:00`);
            if (Math.round((a - b) / 86400000) !== 1) break;
            streak++;
        }
        return streak;
    }
    function openHistory() { renderHistory(); setActiveScreen("history"); playSound("click"); }
    function renderHistoricalResult(item) {
        if (!item) return;
        state.result = deepClone(item); state.examKey = item.examKey; state.subjectKey = item.subjectKey; state.subjectName = item.subjectName; state.examConfig = getExamConfig(item.examKey); renderResult(item); setActiveScreen("result");
    }

    /* ---------------- Confetti ---------------- */
    let confettiRaf = 0;
    function resetConfettiCanvas() {
        if (!DOM.confettiCanvas) return;
        const rect = DOM.confettiCanvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        DOM.confettiCanvas.width = Math.max(1, Math.floor((rect.width || window.innerWidth) * dpr));
        DOM.confettiCanvas.height = Math.max(1, Math.floor((rect.height || 500) * dpr));
        DOM.confettiCanvas.getContext("2d")?.setTransform(dpr,0,0,dpr,0,0);
    }
    function startConfetti() {
        if (!DOM.resultCelebration || !DOM.confettiCanvas) return;
        DOM.resultCelebration.classList.remove("hidden"); resetConfettiCanvas(); cancelAnimationFrame(confettiRaf);
        const canvas = DOM.confettiCanvas; const ctx = canvas.getContext("2d"); if (!ctx) return;
        const rect = canvas.getBoundingClientRect(); const width = rect.width || window.innerWidth; const height = rect.height || 500;
        const particles = Array.from({ length: 150 }, (_, i) => ({ x: Math.random()*width, y: -20-Math.random()*height*.4, vx: (Math.random()-.5)*2.8, vy: 2+Math.random()*4.5, size: 4+Math.random()*7, rotation: Math.random()*Math.PI, vr: (Math.random()-.5)*.18, hue: (i*19+Math.random()*80)%360 }));
        let frame = 0;
        const draw = () => { frame++; ctx.clearRect(0,0,width,height); particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=.02; p.rotation+=p.vr; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rotation); ctx.globalAlpha=.9; ctx.fillStyle=`hsl(${p.hue} 90% 68%)`; ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.62); ctx.restore(); }); if(frame<220) confettiRaf=requestAnimationFrame(draw); else ctx.clearRect(0,0,width,height); };
        draw();
    }

    /* ---------------- Events ---------------- */
    function bindGlobalEvents() {
        document.addEventListener("click", async event => {
            const target = event.target.closest?.("[data-action]");
            if (!target) return;
            const action = target.dataset.action;
            if (action === "confirm-submit") { await submitExam("manual"); return; }
            if (!currentUser && !["toggle-theme"].includes(action)) return;
            switch (action) {
                case "go-home": goHome(); break;
                case "open-exams": openExamSelector(state.examKey || null); break;
                case "open-history": await syncHistoryFromServer(); openHistory(); break;
                case "select-exam": openExamSelector(target.dataset.exam); break;
                case "choose-subject": await chooseSubject(target.dataset.exam, target.dataset.subject); break;
                case "open-guide": openGuide(); break;
                case "toggle-theme": toggleTheme(); break;
                case "toggle-sidebar": toggleSidebar(); break;
                case "toggle-flag": toggleFlag(); break;
                case "prev-question": prevQuestion(); break;
                case "next-question": nextQuestion(); break;
                case "jump-question": goToQuestion(target.dataset.index); break;
                case "finish-exam": openSubmitModal(); break;
                case "close-modal": closeModals(); break;
                case "retry-exam": await retryExam(); break;
                case "open-history-result": { const history = loadHistory(); renderHistoricalResult(history[safeNumber(target.dataset.historyIndex, -1)]); break; }
                case "open-profile": await openProfile(); break;
                case "logout": await logout(); break;
                case "open-admin": await openAdmin(); break;
                case "close-profile": document.getElementById("profileModal")?.remove(); break;
                case "close-admin": document.getElementById("adminModal")?.remove(); break;
                default: break;
            }
        });
        document.addEventListener("click", async event => {
            const b = event.target.closest?.("[data-admin-id]");
            if (!b) return;
            try { await apiPatch(`/api/admin/users/${encodeURIComponent(b.dataset.adminId)}`, { status: b.dataset.adminStatus }); showToast('Đã cập nhật tài khoản.', 'success'); loadAdminUsers(); }
            catch (e) { showToast(e.message, 'error', 5000); }
        });
        DOM.globalOverlay?.addEventListener("click", closeModals);
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") { closeModals(); closeSidebar(); }
            if (state.screen !== "exam" || state.hasSubmitted || state.isSubmitting) return;
            if (event.key === "ArrowLeft") { event.preventDefault(); prevQuestion(); }
            if (event.key === "ArrowRight") { event.preventDefault(); nextQuestion(); }
        });
        window.addEventListener("beforeunload", saveSession);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.screen === "exam" && !state.hasSubmitted) updateTimerUI(); });
        window.addEventListener("resize", () => { if (!DOM.resultCelebration?.classList.contains("hidden")) resetConfettiCanvas(); });
        document.addEventListener("pointerdown", () => getAudioContext(), { once: true, passive: true });
    }

    async function retryExam() {
        if (!state.examKey || !state.subjectKey) return openExamSelector("vsat");
        await startExam(state.examKey, state.subjectKey, state.subjectName || getSubjectConfig(state.examKey, state.subjectKey)?.name || "Môn học");
    }

    function bindHashNavigation() {
        window.addEventListener("popstate", () => {
            const hash = location.hash.replace(/^#/, "");
            if (hash === "history") openHistory();
            else if (hash === "exam-selection") openExamSelector(state.examKey || "vsat");
            else setActiveScreen("home", false);
        });
    }

    async function boot() {
        cacheDOM();
        initTheme();
        bindGlobalEvents();
        bindHashNavigation();
        if (DOM.currentYear) DOM.currentYear.textContent = String(new Date().getFullYear());
        if (DOM.questionCountStat) DOM.questionCountStat.textContent = "DB thật";
        const historyScreen = document.getElementById('historyScreen');
        if (historyScreen && !document.getElementById('accountStatsPanel')) {
            const panel=document.createElement('div'); panel.id='accountStatsPanel'; panel.className='account-stats-panel';
            const list=document.getElementById('historyList'); list?.parentNode?.insertBefore(panel,list);
        }
        await authBoot();
        if (currentUser) { await syncHistoryFromServer(); renderHistory(); } else renderHistory();
        setActiveScreen("home", false);

        const saved = getSavedSession();
        if (saved) {
            state.pendingResumeSession = saved;
            const exam = getExamConfig(saved.examKey); const subject = getSubjectConfig(saved.examKey, saved.subjectKey);
            if (exam && subject) showToast(`Có phiên ${exam.name} — ${subject.name} chưa hoàn thành.`, "warning", 4800);
        }
        // Warm up MathJax in background; failure is non-fatal because plain-symbol fallback remains active.
        ensureMathJax().catch(() => {});
    }

    window.MyExamApp = {
        state,
        exams: EXAMS,
        loadQuestionPool,
        calculateResult,
        clearHistory,
        getDurationMinutes
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
