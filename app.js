/* =========================================================
   BLOUSE EXAM WEB V6 — app.js
   ---------------------------------------------------------
   Nâng cấp toàn diện V6:
   - Giao diện hiện đại, hỗ trợ Chọn đề cụ thể hoặc Trộn đề ngẫu nhiên.
   - Trắc nghiệm 4 lựa chọn (MCQ) hỗ trợ dạng ĐỌC NGỮ LIỆU và chọn phạm vi
     áp dụng từ câu trắc nghiệm nào đến câu nào (Từ câu X đến câu Y),
     hiển thị khung ngữ liệu song song/trên-dưới kèm thanh chuyển nhanh câu hỏi.
   - Hỗ trợ tải ảnh (upload/kéo thả/dán Ctrl+V) cho từng câu hỏi và ngữ liệu,
     kèm chế độ phóng to ảnh (Lightbox).
   - Admin Studio: Tạo đề mới, upload JSON, và sửa trực tiếp mọi đề thi ngay
     trên web (lưu vào PostgreSQL + đồng bộ local), không cần sửa file trên GitHub.
   ========================================================= */

(() => {
    "use strict";

    const APP = {
        storage: {
            theme: "myExam.theme",
            history: "myExam.history.v2",
            session: "myExam.activeSession.v2",
            customExams: "myExam.customExams.v6",
            passageLayout: "myExam.passageLayout.v6"
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
            description: "Bài thi đánh giá năng lực 4 phần (hỗ trợ Đọc ngữ liệu từ câu X đến câu Y).",
            subjects: [
                { key: "toan", name: "Toán", icon: "∑", accent: "#7c5cff", description: "Tư duy định lượng & giải tích" },
                { key: "ly", name: "Vật lý", icon: "⚛", accent: "#37d9ff", description: "Cơ học, điện từ, lượng tử..." },
                { key: "hoa", name: "Hóa học", icon: "◇", accent: "#45e69d", description: "Vô cơ, hữu cơ & thực nghiệm" },
                { key: "sinh", name: "Sinh học", icon: "⌬", accent: "#ff5f9e", description: "Di truyền, tế bào, sinh thái" },
                { key: "anh", name: "Tiếng Anh", icon: "A", accent: "#ffb84d", description: "Đọc hiểu ngữ liệu & ngôn ngữ" },
                { key: "ngu_van", name: "Ngữ văn", icon: "V", accent: "#a98cff", description: "Đọc hiểu văn bản & tiếng Việt" }
            ],
            blueprint: [
                { type: "true_false", count: 9, part: 1, title: "PHẦN I — Trắc nghiệm Đúng / Sai" },
                { type: "mcq", count: 6, part: 2, title: "PHẦN II — Đọc ngữ liệu & Trắc nghiệm 4 lựa chọn" },
                { type: "matching", count: 5, part: 3, title: "PHẦN III — Trắc nghiệm Ghép hợp" },
                { type: "short_answer", count: 5, part: 4, title: "PHẦN IV — Trắc nghiệm Trả lời ngắn" }
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
            description: "Luyện đề cấu trúc mới: Trắc nghiệm 4 lựa chọn (có đọc ngữ liệu), Đúng/Sai và Trả lời ngắn.",
            subjects: [
                { key: "toan", name: "Toán", icon: "∑", accent: "#7c5cff", description: "12 MCQ + 4 Đúng/Sai + 6 Trả lời ngắn" },
                { key: "ly", name: "Vật lý", icon: "⚡", accent: "#37d9ff", description: "18 MCQ + 4 Đúng/Sai + 6 Trả lời ngắn" },
                { key: "hoa", name: "Hóa học", icon: "⚗", accent: "#45e69d", description: "18 MCQ + 4 Đúng/Sai + 6 Trả lời ngắn" },
                { key: "sinh", name: "Sinh học", icon: "⌬", accent: "#ff5f9e", description: "18 MCQ + 4 Đúng/Sai + 6 Trả lời ngắn" },
                { key: "ngu_van", name: "Ngữ văn", icon: "V", accent: "#ffb84d", description: "Đọc hiểu ngữ liệu & làm văn" },
                { key: "tieng_anh", name: "Tiếng Anh", icon: "A", accent: "#a98cff", description: "Đọc hiểu đoạn văn & ngôn ngữ" }
            ],
            blueprint: [
                { type: "mcq", count: 12, part: 1, title: "PHẦN I — Trắc nghiệm 4 lựa chọn / Đọc ngữ liệu" },
                { type: "true_false", count: 4, part: 2, title: "PHẦN II — Trắc nghiệm Đúng / Sai" },
                { type: "short_answer", count: 6, part: 3, title: "PHẦN III — Trắc nghiệm Trả lời ngắn" }
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
        examKey: "vsat",
        subjectKey: null,
        subjectName: null,
        examConfig: EXAMS.vsat,
        selectedPaperId: null,
        selectedPaperTitle: null,
        currentPaperObj: null,
        subjectPapers: [],
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
        audioEnabled: true,
        passageLayout: "split", // "split" | "stacked"
        admin: {
            tab: "exams",
            examKey: "vsat",
            subjectKey: "sinh",
            papers: [],
            editingPaper: null,
            partFilter: "all",
            isSaving: false
        }
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
        DOM.navAdminStudioBtn = $("#navAdminStudioBtn");
        DOM.heroAdminButton = $("#heroAdminButton");

        DOM.selectedExamBreadcrumb = $("#selectedExamBreadcrumb");
        DOM.selectionExamName = $("#selectionExamName");
        DOM.selectionTitle = $("#selectionTitle");
        DOM.selectionDescription = $("#selectionDescription");
        DOM.subjectGrid = $("#subjectGrid");
        DOM.subjectPapersContainer = $("#subjectPapersContainer");
        DOM.subjectLoading = $("#subjectLoading");
        DOM.questionCountStat = $("#questionCountStat");
        DOM.switchVsatBtn = $("#switchVsatBtn");
        DOM.switchThptBtn = $("#switchThptBtn");

        DOM.examScreen = $("#examScreen");
        DOM.examTitle = $("#examTitle");
        DOM.examPaperSubtitle = $("#examPaperSubtitle");
        DOM.examPartLabel = $("#examPartLabel");
        DOM.examPartTitle = $("#examPartTitle");
        DOM.flagQuestionButton = $("#flagQuestionButton");
        DOM.togglePassageLayoutBtn = $("#togglePassageLayoutBtn");
        DOM.adminEditCurrentExamBtn = $("#adminEditCurrentExamBtn");
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

        DOM.adminStudioScreen = $("#adminStudioScreen");
        DOM.adminTabExamsBtn = $("#adminTabExamsBtn");
        DOM.adminTabUsersBtn = $("#adminTabUsersBtn");
        DOM.adminExamsTabPanel = $("#adminExamsTabPanel");
        DOM.adminUsersTabPanel = $("#adminUsersTabPanel");
        DOM.adminFilterExam = $("#adminFilterExam");
        DOM.adminFilterSubject = $("#adminFilterSubject");
        DOM.adminImportJsonInput = $("#adminImportJsonInput");
        DOM.adminExamListSection = $("#adminExamListSection");
        DOM.adminSubjectListTitle = $("#adminSubjectListTitle");
        DOM.adminExamCountHint = $("#adminExamCountHint");
        DOM.adminExamCardsGrid = $("#adminExamCardsGrid");
        DOM.adminExamEditorWrap = $("#adminExamEditorWrap");
        DOM.studioCreateUserForm = $("#studioCreateUserForm");
        DOM.studioAdminUsersList = $("#studioAdminUsersList");

        DOM.imageLightboxModal = $("#imageLightboxModal");
        DOM.imageLightboxImg = $("#imageLightboxImg");
        DOM.imageLightboxCaption = $("#imageLightboxCaption");

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
        if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID().slice(0, 8)}`;
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
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
        const sup = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","=":"⁼","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ","x":"ˣ","y":"ʸ","z":"ᶻ","a":"ᵃ","b":"ᵇ","c":"ᶜ","d":"ᵈ","e":"ᵉ","f":"ᶠ","g":"ᵍ","h":"ʰ","j":"ʲ","k":"ᵏ","l":"ˡ","m":"ᵐ","o":"ᵒ","p":"ᵖ","r":"ʳ","s":"ˢ","t":"ᵗ","u":"ᵘ","v":"ᵛ","w":"ʷ" };
        const sub = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","=":"₌","(":"₍",")":"₎","n":"ₙ","i":"ᵢ","j":"ⱼ","x":"ₓ","y":"ᵧ","a":"ₐ","e":"ₑ","o":"ₒ","p":"ₚ","s":"ₛ","t":"ₜ","u":"ᵤ","v":"ᵥ" };

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
        return ["toan", "ngu_van"].includes(String(subjectKey)) ? 90 : 50;
    }

    function typeLabel(type) {
        return {
            mcq: "Trắc nghiệm 4 lựa chọn",
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
    function loadLocalCustomExams() {
        const map = loadJSON(APP.storage.customExams, {});
        return isObject(map) ? map : {};
    }
    function saveLocalCustomExam(paper) {
        if (!paper || !paper.id) return;
        const map = loadLocalCustomExams();
        map[paper.id] = deepClone(paper);
        saveJSON(APP.storage.customExams, map);
    }
    function deleteLocalCustomExam(id) {
        const map = loadLocalCustomExams();
        delete map[id];
        saveJSON(APP.storage.customExams, map);
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
        });
    }
    async function syncHistoryFromServer() {
        try {
            const data = await apiGet('/api/history');
            if (Array.isArray(data.items)) saveJSON(APP.storage.history, data.items);
            return data.items || [];
        } catch (error) {
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
            version: 6,
            examKey: state.examKey,
            subjectKey: state.subjectKey,
            subjectName: state.subjectName,
            selectedPaperId: state.selectedPaperId,
            selectedPaperTitle: state.selectedPaperTitle,
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

    /* ---------------- Theme / audio / toast / lightbox ---------------- */
    function initTheme() {
        const stored = localStorage.getItem(APP.storage.theme);
        applyTheme(stored === "light" ? "light" : "dark", false);
        const layout = localStorage.getItem(APP.storage.passageLayout);
        if (layout === "stacked" || layout === "split") state.passageLayout = layout;
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
    function togglePassageLayout() {
        state.passageLayout = state.passageLayout === "split" ? "stacked" : "split";
        localStorage.setItem(APP.storage.passageLayout, state.passageLayout);
        renderCurrentQuestion();
        showToast(state.passageLayout === "split" ? "Chế độ: Chia đôi Ngữ liệu & Câu hỏi" : "Chế độ: Ngữ liệu nằm trên Câu hỏi", "info", 1800);
    }

    function openLightbox(src, caption = "") {
        if (!src || !DOM.imageLightboxModal) return;
        DOM.imageLightboxImg.src = src;
        DOM.imageLightboxCaption.textContent = caption || "Hình minh họa câu hỏi / ngữ liệu";
        DOM.imageLightboxModal.classList.remove("hidden");
        DOM.imageLightboxModal.setAttribute("aria-hidden", "false");
    }
    function closeLightbox() {
        if (!DOM.imageLightboxModal) return;
        DOM.imageLightboxModal.classList.add("hidden");
        DOM.imageLightboxModal.setAttribute("aria-hidden", "true");
        DOM.imageLightboxImg.src = "";
    }

    const audio = { ctx: null };
    function getAudioContext() {
        if (!state.audioEnabled || (!window.AudioContext && !window.webkitAudioContext)) return null;
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
        toast.className = `toast ${type} toast-${type}`;
        const label = type === "error" ? "Có lỗi" : type === "warning" ? "Lưu ý" : type === "success" ? "Thành công" : "Thông báo";
        const icon = type === "success" ? "✓" : type === "warning" ? "!" : type === "error" ? "×" : "✦";
        toast.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-content"><div class="toast-title"><strong>${label}</strong></div><div class="toast-message"><span>${escapeHTML(message)}</span></div></div><button type="button" class="toast-close icon-button" style="width:24px;height:24px;" aria-label="Đóng">×</button>`;
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
    function closeModals() {
        setModal(DOM.guideModal, false);
        setModal(DOM.submitModal, false);
        closeLightbox();
    }

    /* ---------------- Authentication / Server ---------------- */
    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
            ...options
        });
        let data = null;
        try { data = await response.json(); } catch (_) { data = {}; }
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
    }
    function apiGet(url) { return apiRequest(url); }
    function apiPost(url, body) { return apiRequest(url, { method: 'POST', body: JSON.stringify(body ?? {}) }); }
    function apiPut(url, body) { return apiRequest(url, { method: 'PUT', body: JSON.stringify(body ?? {}) }); }
    function apiPatch(url, body) { return apiRequest(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }); }
    function apiDelete(url) { return apiRequest(url, { method: 'DELETE' }); }

    function ensureAuthUI() {
        if ($('#authGate')) return;
        const gate = document.createElement('div');
        gate.id = 'authGate';
        gate.className = 'auth-gate';
        gate.innerHTML = `
          <div class="auth-card auth-portal-card glass-card">
            <div class="auth-visual-side">
              <div>
                <span class="promo-badge">BLOUSE EXAM PRO V6.5</span>
                <h2>Hệ thống Luyện thi Đánh giá Năng lực VSAT & THPTQG</h2>
                <p>Mô phỏng phòng thi thực tế với công nghệ hiển thị ngữ liệu đọc hiểu song song và chấm điểm phân tích chuyên sâu.</p>
                <div class="auth-feature-bullets">
                  <div class="auth-feature-bullet"><span>📖</span><span>Trắc nghiệm Đọc ngữ liệu (Từ câu X đến câu Y)</span></div>
                  <div class="auth-feature-bullet"><span>📷</span><span>Đính kèm & phóng to hình ảnh từng câu hỏi</span></div>
                  <div class="auth-feature-bullet"><span>🛠</span><span>Admin Studio tạo & sửa đề trực tiếp trên Web</span></div>
                </div>
              </div>
              <div style="font-size:11.5px;opacity:0.7;">© Blouse Exam Pro · Cloud PostgreSQL Synchronized</div>
            </div>
            <div class="auth-form-side">
              <div class="auth-logo" style="margin:0 0 12px;">✦</div>
              <div class="auth-kicker">CỔNG ĐĂNG NHẬP</div>
              <h1 style="margin:6px 0 8px;font-size:26px;">Chào mừng trở lại</h1>
              <p style="margin-bottom:18px;font-size:13px;">Đăng nhập bằng tài khoản học sinh hoặc tài khoản Quản trị viên (Admin).</p>
              <form id="loginForm" class="auth-form">
                <label>Tên đăng nhập<input id="loginUsername" autocomplete="username" placeholder="Nhập username (VD: admin)" required></label>
                <label>Mật khẩu<input id="loginPassword" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu" required></label>
                <button class="primary-button auth-submit" type="submit">Đăng nhập vào hệ thống →</button>
                <div id="loginError" class="auth-error hidden"></div>
              </form>
            </div>
          </div>`;
        document.body.appendChild(gate);
        $('#loginForm').addEventListener('submit', async e => {
            e.preventDefault();
            const btn = $('.auth-submit');
            const error = $('#loginError');
            btn.disabled = true;
            btn.textContent = 'Đang đăng nhập...';
            error.classList.add('hidden');
            try {
                const usernameInput = $('#loginUsername').value.trim();
                const passwordInput = $('#loginPassword').value;
                const data = await apiPost('/api/login', { username: usernameInput, password: passwordInput });
                currentUser = data.user;
                updateUserUI();
                gate.classList.add('hidden');
                await syncHistoryFromServer();
                renderHistory();
                showToast(`Xin chào ${currentUser.fullName || currentUser.username}!`, 'success', 3000);
            } catch (err) {
                error.textContent = err.message;
                error.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Đăng nhập';
            }
        });
    }

    function isAdmin() {
        return currentUser?.role === 'admin';
    }

    function updateUserUI() {
        const name = $('.profile-name');
        const avatar = $('.profile-avatar');
        if (name) name.textContent = currentUser ? (currentUser.fullName || currentUser.username) : 'Thí sinh';
        if (avatar) avatar.textContent = currentUser ? String(currentUser.fullName || currentUser.username).charAt(0).toUpperCase() : 'T';

        const adminActive = isAdmin();
        DOM.navAdminStudioBtn?.classList.toggle('hidden', !adminActive);
        DOM.heroAdminButton?.classList.toggle('hidden', !adminActive);
        DOM.adminEditCurrentExamBtn?.classList.toggle('hidden', !adminActive);

        const old = $('#adminDashboardButton');
        if (old) old.remove();
        if (adminActive) {
            const b = document.createElement('button');
            b.id = 'adminDashboardButton';
            b.className = 'icon-button glass-button';
            b.dataset.action = 'open-exam-studio';
            b.title = 'Mở Quản lý Đề & Tài khoản (Admin)';
            b.textContent = '⚙';
            $('.header-actions')?.prepend(b);
        }
    }

    async function authBoot() {
        ensureAuthUI();
        try {
            const data = await apiGet('/api/me');
            currentUser = data.user;
        } catch (_) {
            currentUser = null;
        }
        updateUserUI();
        $('#authGate')?.classList.toggle('hidden', !!currentUser);
        if (!currentUser) showToast('Hãy đăng nhập bằng tài khoản được cấp.', 'warning', 4000);
    }

    async function logout() {
        try { await apiPost('/api/logout', {}); } catch (_) {}
        currentUser = null;
        stopTimer();
        stopAutosave();
        state.hasSubmitted = true;
        updateUserUI();
        document.getElementById('profileModal')?.remove();
        $('#authGate')?.classList.remove('hidden');
        setActiveScreen('home', false);
        showToast('Đã đăng xuất.', 'info', 2500);
    }

    async function renderAccountStats() {
        const host = document.getElementById('accountStatsPanel');
        if (!host) return;
        try {
            const data = await apiGet('/api/stats');
            const card = (title, x) => `<div class="account-stat-card glass-card"><span>${title}</span><strong>${formatScore(x.best)} <small>/ ${formatScore(x.maxScore || (title === 'VSAT' ? 150 : 10))}</small></strong><div>TB ${formatScore(x.average)} · ${x.attempts} lần thi</div><em>Lần gần nhất: ${formatScore(x.last)}</em></div>`;
            host.innerHTML = `<div class="stats-section-title"><span class="section-kicker">YOUR PERFORMANCE</span><h2>Thống kê riêng theo kỳ thi</h2></div><div class="account-stats-grid">${card('VSAT', data.vsat)}${card('THPTQG', data.thptqg)}</div>`;
        } catch (e) {
            host.innerHTML = '<div class="account-stat-card glass-card">Thống kê đang hiển thị từ dữ liệu trình duyệt.</div>';
        }
    }

    async function openProfile() {
        if (!currentUser) return;
        document.getElementById('profileModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'profileModal';
        modal.className = 'floating-modal-wrap';
        modal.innerHTML = `<div class="floating-modal glass-card"><button class="modal-x" data-action="close-profile">×</button><div class="profile-big-avatar">${escapeHTML(String(currentUser.fullName || currentUser.username).charAt(0).toUpperCase())}</div><h2>${escapeHTML(currentUser.fullName || currentUser.username)}</h2><p>@${escapeHTML(currentUser.username)} · ${isAdmin() ? 'Quản trị viên (Admin)' : 'Thí sinh'}</p><div class="profile-modal-actions">${isAdmin() ? '<button class="primary-button" data-action="open-exam-studio">🛠 Quản lý & Sửa Đề thi trên Web</button><button class="secondary-button" data-action="open-admin-users">👥 Quản lý Tài khoản</button>' : ''}<button class="danger-button" data-action="logout">Đăng xuất</button></div></div>`;
        document.body.appendChild(modal);
    }

    /* ---------------- Image Compression Helper for Upload/Paste ---------------- */
    function readAndCompressImage(file, maxDimension = 1400, quality = 0.86) {
        return new Promise((resolve, reject) => {
            if (!file || !file.type.startsWith("image/")) {
                return reject(new Error("Vui lòng chọn file hình ảnh hợp lệ (PNG, JPG, WebP, GIF)."));
            }
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
            reader.onload = () => {
                const dataUrl = String(reader.result || "");
                const img = new Image();
                img.onload = () => {
                    try {
                        let { width, height } = img;
                        if (width <= maxDimension && height <= maxDimension && dataUrl.length < 450_000) {
                            return resolve(dataUrl);
                        }
                        if (width > height && width > maxDimension) {
                            height = Math.round((height * maxDimension) / width);
                            width = maxDimension;
                        } else if (height >= width && height > maxDimension) {
                            width = Math.round((width * maxDimension) / height);
                            height = maxDimension;
                        }
                        const canvas = document.createElement("canvas");
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext("2d");
                        ctx.fillStyle = "#ffffff";
                        ctx.fillRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);
                        const out = canvas.toDataURL("image/webp", quality);
                        resolve(out.startsWith("data:image/webp") ? out : canvas.toDataURL("image/jpeg", quality));
                    } catch (_) {
                        resolve(dataUrl);
                    }
                };
                img.onerror = () => resolve(dataUrl);
                img.src = dataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    /* ---------------- Navigation ---------------- */
    function setActiveScreen(name, writeHash = true) {
        DOM.screens.forEach(screen => screen.classList.toggle("is-active", screen.dataset.screen === name));
        $$(".nav-link[data-nav-screen]").forEach(btn => {
            btn.classList.toggle("is-active", btn.dataset.navScreen === name);
        });
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
            showToast("Phiên thi vẫn đang được lưu. Bạn có thể tiếp tục bất cứ lúc nào.", "warning", 3200);
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
        DOM.subjectPapersContainer?.classList.add("hidden");
        renderSubjectSelector();
        setActiveScreen("exam-selection");
        playSound("click");
    }

    function renderSubjectSelector() {
        const exam = state.examConfig || EXAMS.vsat;
        DOM.selectedExamBreadcrumb.textContent = exam.name;
        DOM.selectionExamName.textContent = exam.name;
        DOM.selectionTitle.textContent = `Chọn môn ${exam.name} để bắt đầu`;
        DOM.selectionDescription.textContent = exam.description;
        DOM.switchVsatBtn?.classList.toggle("is-active", exam.key === "vsat");
        DOM.switchThptBtn?.classList.toggle("is-active", exam.key === "thptqg");
        DOM.subjectLoading?.classList.add("hidden");

        DOM.subjectGrid.innerHTML = exam.subjects.map((subject, i) => {
            const duration = getDurationMinutes(exam.key, subject.key);
            const isSelected = state.subjectKey === subject.key;
            return `<button class="subject-card glass-card fade-up ${isSelected ? "is-selected" : ""}" type="button" style="--subject-accent:${escapeHTML(subject.accent)};animation-delay:${Math.min(i * 0.04, 0.3)}s" data-action="choose-subject" data-exam="${escapeHTML(exam.key)}" data-subject="${escapeHTML(subject.key)}">
                <span class="subject-card-icon">${escapeHTML(subject.icon)}</span>
                <h3>${escapeHTML(subject.name)}</h3>
                <p>${escapeHTML(subject.description)}</p>
                <span class="subject-card-meta"><span>◷ ${duration} phút</span><span>↗ Chọn đề / Thi ngay</span></span>
            </button>`;
        }).join("");
    }

    /* ---------------- Question & Passage Normalization ---------------- */
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
        if (isObject(input)) return Object.entries(input).map(([key, value]) => ({
            key,
            text: String(isObject(value) ? (value.text ?? value.label ?? value.content ?? value.value ?? "") : value ?? "")
        }));
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
        // Support BOTH Array format and { left: [...], right: [...] } format!
        if (Array.isArray(input)) {
            return input.map((item, i) => isObject(item) ? {
                key: String(item.key ?? item.id ?? String(i + 1)),
                left: String(item.left ?? item.question ?? item.prompt ?? item.text ?? item.item ?? ""),
                options: normalizeOptions(item.options ?? item.choices ?? item.targets ?? item.right)
            } : { key: String(i + 1), left: String(item ?? ""), options: [] });
        }
        if (isObject(input) && Array.isArray(input.left)) {
            const sharedRight = normalizeOptions(input.right ?? input.options ?? input.choices ?? []);
            return input.left.map((item, i) => ({
                key: String(isObject(item) ? (item.key ?? item.id ?? String(i + 1)) : String(i + 1)),
                left: String(isObject(item) ? (item.left ?? item.text ?? item.label ?? item.content ?? "") : item ?? ""),
                options: deepClone(sharedRight)
            }));
        }
        return [];
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
        if (isObject(answer)) keys.forEach(key => { if (Object.prototype.hasOwnProperty.call(answer, key) && String(answer[key]) !== "") out[key] = String(answer[key]); });
        else if (Array.isArray(answer)) answer.forEach((v, i) => { if (keys[i] && String(v) !== "") out[keys[i]] = String(v); });
        return out;
    }

    function resolveAsset(sourceUrl, asset) {
        if (!asset) return "";
        const raw = String(asset).trim();
        if (!raw) return "";
        if (/^data:/i.test(raw) || /^https?:\/\//i.test(raw) || /^\//.test(raw)) return raw;
        if (/^(?:\.\/)?database\//i.test(raw)) return `./${raw.replace(/^\.\//, "")}`;
        try {
            if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) return new URL(raw, sourceUrl).href;
        } catch (_) {}
        return raw;
    }

    function normalizePassages(rawPassages, sourceUrl = "") {
        if (!Array.isArray(rawPassages)) return [];
        return rawPassages.map((p, idx) => {
            if (!isObject(p)) return null;
            const fromQuestion = Math.max(1, Math.floor(safeNumber(p.fromQuestion ?? p.from ?? p.startQuestion, 1)));
            const toQuestion = Math.max(fromQuestion, Math.floor(safeNumber(p.toQuestion ?? p.to ?? p.endQuestion, fromQuestion)));
            const id = String(p.id || `passage_${idx + 1}_${fromQuestion}_${toQuestion}`);
            const title = String(p.title || `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${fromQuestion} đến câu ${toQuestion}:`).trim();
            const text = String(p.text ?? p.content ?? p.passage ?? "").trim();
            const image = resolveAsset(sourceUrl, p.image ?? p.imageUrl ?? p.img ?? "");
            return { id, fromQuestion, toQuestion, title, text, image };
        }).filter(Boolean);
    }

    function normalizeQuestion(raw, index, source, examKey, passages = []) {
        const q = isObject(raw) ? deepClone(raw) : {};
        const rawType = String(q.type ?? q.questionType ?? q.kind ?? q.format ?? "mcq").trim().toLowerCase();
        const type = TYPE_ALIASES[rawType] || rawType;
        const text = String(q.question ?? q.text ?? q.prompt ?? q.content ?? "").trim();
        const qNum = index + 1;
        const id = String(q.id ?? q.uid ?? `${source}#q${qNum}`);
        const options = normalizeOptions(q.options ?? q.choices ?? q.answers ?? q.luas);
        const statements = normalizeStatements(q.statements ?? q.subquestions ?? q.parts);
        const pairs = normalizePairs(q.pairs ?? q.leftItems ?? q.matching);
        let answer = q.answer ?? q.correctAnswer ?? q.correct ?? q.key ?? q.solution;
        const acceptedAnswers = Array.isArray(q.acceptedAnswers ?? q.accepted_answers)
            ? (q.acceptedAnswers ?? q.accepted_answers).filter(v => v != null && String(v).trim() !== "")
            : [];
        if (type === "true_false") answer = normalizeTFAnswer(answer, statements);
        if (type === "matching") answer = normalizeMatchingAnswer(answer, pairs);
        if (type === "short_answer" && acceptedAnswers.length === 0 && answer != null && String(answer).trim() !== "") {
            acceptedAnswers.push(String(answer).trim());
        }

        // Match reading passage from paper's passages array or question's own passage fields
        const matchedPassage = passages.find(p => qNum >= p.fromQuestion && qNum <= p.toQuestion) || null;
        const passageId = String(matchedPassage?.id ?? q.passageId ?? "").trim();
        const passageFrom = matchedPassage ? matchedPassage.fromQuestion : (q.passageFrom ? safeNumber(q.passageFrom, null) : null);
        const passageTo = matchedPassage ? matchedPassage.toQuestion : (q.passageTo ? safeNumber(q.passageTo, null) : null);
        const passageTitle = String(matchedPassage?.title ?? q.passageTitle ?? "").trim();
        const passageText = String(matchedPassage?.text ?? q.passageText ?? q.passage ?? q.context ?? "").trim();
        const passageImage = resolveAsset(source, matchedPassage?.image ?? q.passageImage ?? "");

        return {
            id,
            questionNumber: qNum,
            type,
            text,
            options,
            statements,
            pairs,
            answer,
            acceptedAnswers,
            explanation: String(q.explanation ?? q.solutionText ?? q.rationale ?? ""),
            image: resolveAsset(source, q.image ?? q.imageUrl ?? q.img ?? ""),
            passageId,
            passageFrom,
            passageTo,
            passageTitle,
            passageText,
            passageImage,
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

    /* ---------------- Unified Paper & Question Pool Loading ---------------- */
    async function fetchServerPapers(examKey, subjectKey) {
        const localMap = loadLocalCustomExams();
        const localItems = Object.values(localMap).filter(x =>
            (!examKey || x.examKey === examKey || x.exam === examKey) &&
            (!subjectKey || x.subjectKey === subjectKey || x.subject === subjectKey)
        );
        try {
            const q = new URLSearchParams();
            if (examKey) q.set("exam", examKey);
            if (subjectKey) q.set("subject", subjectKey);
            const data = await apiGet(`/api/exams?${q.toString()}`);
            const serverItems = Array.isArray(data.items) ? data.items : [];
            // Sync server items into local cache
            serverItems.forEach(item => saveLocalCustomExam(item));
            const mergedMap = new Map();
            localItems.forEach(item => mergedMap.set(item.id, item));
            serverItems.forEach(item => mergedMap.set(item.id, item));
            return Array.from(mergedMap.values());
        } catch (_) {
            return localItems;
        }
    }

    async function loadStaticPapersFromManifest(examKey, subjectKey) {
        const root = basePath(examKey, subjectKey);
        const manifestUrl = `${root}${APP.manifestFile}`;
        let manifest;
        try {
            manifest = await fetchJSON(manifestUrl);
        } catch (_) {
            return [];
        }
        const rawFiles = extractManifestFiles(manifest);
        const files = rawFiles.map(safeManifestPath).filter(Boolean);
        if (!files.length) return [];

        let absoluteManifestUrl;
        try {
            absoluteManifestUrl = new URL(manifestUrl, window.location.href).href;
        } catch (_) {
            return [];
        }

        const papers = [];
        await Promise.all([...new Set(files)].map(async (fileName) => {
            try {
                const fileUrl = new URL(fileName, absoluteManifestUrl).href;
                const rawData = await fetchJSON(fileUrl);
                const passages = normalizePassages(rawData.passages || [], fileUrl);
                const rawQuestions = Array.isArray(rawData.questions) ? rawData.questions : [];
                const questions = rawQuestions
                    .map((q, idx) => normalizeQuestion(q, idx, fileUrl, examKey, passages))
                    .filter(q => !validateQuestion(q));
                if (!questions.length) return;
                papers.push({
                    id: `static__${examKey}__${subjectKey}__${fileName}`,
                    examKey,
                    subjectKey,
                    code: String(rawData.sourceCode || fileName.replace(/\.json$/i, "")),
                    title: String(rawData.title || `${getExamConfig(examKey)?.name || examKey} - ${fileName}`),
                    sourceTitle: String(rawData.sourceTitle || ""),
                    sourceFile: fileName,
                    isStatic: true,
                    isCloud: false,
                    durationMinutes: getDurationMinutes(examKey, subjectKey),
                    maxScore: getExamConfig(examKey)?.maxScore || 150,
                    passages,
                    questions
                });
            } catch (e) {
                console.warn("[My Exam] static paper load skipped:", fileName, e);
            }
        }));
        return papers;
    }

    async function loadSubjectPapers(examKey, subjectKey) {
        const [serverPapers, staticPapers] = await Promise.all([
            fetchServerPapers(examKey, subjectKey),
            loadStaticPapersFromManifest(examKey, subjectKey)
        ]);

        const deletedIds = new Set();
        const overrideMap = new Map();

        for (const sp of serverPapers) {
            if (sp.isDeleted) {
                deletedIds.add(sp.id);
                if (sp.sourceFile) deletedIds.add(`static__${examKey}__${subjectKey}__${sp.sourceFile}`);
                continue;
            }
            const passages = normalizePassages(sp.passages || [], "");
            const questions = (Array.isArray(sp.questions) ? sp.questions : [])
                .map((q, idx) => normalizeQuestion(q, idx, sp.id, examKey, passages))
                .filter(q => !validateQuestion(q));
            if (!questions.length) continue;

            const normalizedPaper = {
                id: sp.id,
                examKey,
                subjectKey,
                code: String(sp.code || sp.sourceCode || "web"),
                title: String(sp.title || "Đề thi trên Web"),
                sourceTitle: String(sp.sourceTitle || "Cập nhật trực tiếp trên Web"),
                sourceFile: String(sp.sourceFile || ""),
                isStatic: false,
                isCloud: true,
                durationMinutes: Number(sp.durationMinutes) || getDurationMinutes(examKey, subjectKey),
                maxScore: Number(sp.maxScore) || (getExamConfig(examKey)?.maxScore || 150),
                passages,
                questions,
                updatedAt: sp.updatedAt || Date.now()
            };
            overrideMap.set(normalizedPaper.id, normalizedPaper);
            if (normalizedPaper.sourceFile) {
                overrideMap.set(`static__${examKey}__${subjectKey}__${normalizedPaper.sourceFile}`, normalizedPaper);
            }
        }

        const finalPapers = [];
        const addedIds = new Set();

        // Add cloud/web papers first
        for (const paper of overrideMap.values()) {
            if (addedIds.has(paper.id) || deletedIds.has(paper.id)) continue;
            addedIds.add(paper.id);
            finalPapers.push(paper);
        }

        // Add static papers that weren't overridden or deleted
        for (const st of staticPapers) {
            if (deletedIds.has(st.id) || overrideMap.has(st.id) || addedIds.has(st.id)) continue;
            addedIds.add(st.id);
            finalPapers.push(st);
        }

        return finalPapers;
    }

    function applyBlueprintMetadataToPaperQuestions(questions, examKey) {
        const exam = getExamConfig(examKey);
        return questions.map((q, idx) => {
            const sec = exam?.blueprint?.find(b => b.type === q.type) || exam?.blueprint?.[0] || { part: q.part || 1, title: typeLabel(q.type) };
            return {
                ...deepClone(q),
                blueprintPart: q.part || sec.part || 1,
                blueprintTitle: q.partTitle || sec.title || typeLabel(q.type),
                displayNumber: idx + 1
            };
        });
    }

    function selectRandomPaperFromPapers(papers, examKey) {
        const exam = getExamConfig(examKey);
        if (!exam) throw new Error("Không tìm thấy cấu hình kỳ thi.");
        const allQuestions = papers.flatMap(p => p.questions.map(q => ({ ...deepClone(q), _paperId: p.id })));
        if (!allQuestions.length) {
            throw new Error("Môn học này chưa có đề thi nào. Nếu bạn là Admin, hãy bấm '+ Tạo đề mới trên Web' để thêm đề.");
        }

        const selected = [];
        const used = new Set();

        for (const section of exam.blueprint) {
            const candidates = allQuestions.filter(q => q.type === section.type && !used.has(q.id));
            if (!candidates.length) continue;

            if (section.type === "mcq") {
                // Keep reading passage groups together when shuffling MCQ questions!
                const groupsMap = new Map();
                const singles = [];
                for (const q of candidates) {
                    if (q.passageId || (q.passageFrom && q.passageTo)) {
                        const gKey = `${q._paperId}__${q.passageId || `${q.passageFrom}_${q.passageTo}`}`;
                        if (!groupsMap.has(gKey)) groupsMap.set(gKey, []);
                        groupsMap.get(gKey).push(q);
                    } else {
                        singles.push([q]);
                    }
                }
                const blocks = shuffle([...Array.from(groupsMap.values()), ...singles]);
                const picked = [];
                for (const block of blocks) {
                    if (picked.length + block.length <= section.count) {
                        block.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
                        picked.push(...block);
                    }
                    if (picked.length >= section.count) break;
                }
                // Fill remaining slots if needed
                if (picked.length < section.count) {
                    for (const q of shuffle(candidates)) {
                        if (picked.length >= section.count) break;
                        if (!picked.some(x => x.id === q.id)) picked.push(q);
                    }
                }
                picked.forEach((q, idx) => {
                    used.add(q.id);
                    selected.push({
                        ...deepClone(q),
                        blueprintPart: section.part,
                        blueprintTitle: section.title,
                        orderInPart: idx + 1
                    });
                });
            } else {
                const picked = shuffle(candidates).slice(0, section.count);
                picked.forEach((q, idx) => {
                    used.add(q.id);
                    selected.push({
                        ...deepClone(q),
                        blueprintPart: section.part,
                        blueprintTitle: section.title,
                        orderInPart: idx + 1
                    });
                });
            }
        }

        const numbered = selected.map((q, i) => ({ ...q, displayNumber: i + 1 }));
        // Recalculate passageFrom / passageTo dynamically so "Từ câu X đến câu Y" matches actual displayNumber!
        const groupBounds = new Map();
        numbered.forEach(q => {
            if (q.passageId || q.passageText || q.passageImage) {
                const key = `${q._paperId || ""}__${q.passageId || q.passageTitle || q.passageText.slice(0, 40)}`;
                q._groupKey = key;
                const b = groupBounds.get(key) || { min: q.displayNumber, max: q.displayNumber };
                b.min = Math.min(b.min, q.displayNumber);
                b.max = Math.max(b.max, q.displayNumber);
                groupBounds.set(key, b);
            }
        });
        numbered.forEach(q => {
            if (q._groupKey && groupBounds.has(q._groupKey)) {
                const b = groupBounds.get(q._groupKey);
                q.passageFrom = b.min;
                q.passageTo = b.max;
                if (!q.passageTitle || /từ câu\s+\d+\s+đến câu\s+\d+/i.test(q.passageTitle)) {
                    q.passageTitle = `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${b.min} đến câu ${b.max}:`;
                }
            }
        });
        return numbered;
    }

    /* ---------------- Subject Click -> Show Paper Picker ---------------- */
    async function chooseSubject(examKey, subjectKey) {
        const exam = getExamConfig(examKey);
        const subject = getSubjectConfig(examKey, subjectKey);
        if (!exam || !subject) return showToast("Không tìm thấy cấu hình môn.", "error");

        state.examKey = examKey;
        state.examConfig = exam;
        state.subjectKey = subjectKey;
        state.subjectName = subject.name;
        if (state.screen !== "exam-selection") setActiveScreen("exam-selection");
        renderSubjectSelector();

        if (!DOM.subjectPapersContainer) {
            await startExam(examKey, subjectKey, subject.name, null);
            return;
        }

        DOM.subjectPapersContainer.classList.remove("hidden");
        DOM.subjectPapersContainer.innerHTML = `<div class="question-loading"><div class="loading-spinner"></div><span>Đang tải danh sách đề môn ${escapeHTML(subject.name)}...</span></div>`;
        DOM.subjectPapersContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });

        try {
            const papers = await loadSubjectPapers(examKey, subjectKey);
            state.subjectPapers = papers;
            renderSubjectPapersPicker(exam, subject, papers);
        } catch (err) {
            DOM.subjectPapersContainer.innerHTML = `<div class="empty-state glass-card"><h3>Chưa tải được danh sách đề</h3><p>${escapeHTML(err.message)}</p></div>`;
        }
    }

    function renderSubjectPapersPicker(exam, subject, papers) {
        const saved = getSavedSession();
        const hasResume = saved && saved.examKey === exam.key && saved.subjectKey === subject.key;
        const duration = getDurationMinutes(exam.key, subject.key);
        const totalQuestionsPool = papers.reduce((s, p) => s + p.questions.length, 0);

        const adminActions = isAdmin() ? `
            <button type="button" class="secondary-button" data-action="admin-new-for-subject" data-exam="${escapeHTML(exam.key)}" data-subject="${escapeHTML(subject.key)}">
                ✨ + Tạo đề mới cho môn ${escapeHTML(subject.name)}
            </button>
            <button type="button" class="secondary-button" data-action="open-exam-studio" data-exam="${escapeHTML(exam.key)}" data-subject="${escapeHTML(subject.key)}">
                🛠 Mở Quản lý Đề
            </button>
        ` : "";

        const resumeBanner = hasResume ? `
            <div class="glass-card" style="padding:16px 20px;border-radius:16px;margin-bottom:18px;border-color:rgba(255,184,77,0.45);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div>
                    <strong style="color:var(--warning);">◷ Bạn đang có phiên làm bài môn ${escapeHTML(subject.name)} chưa nộp</strong>
                    <p style="margin:3px 0 0;font-size:12px;">Còn lại ${formatTimer(saved.remainingSeconds)} · Đã lưu tự động</p>
                </div>
                <button type="button" class="primary-button" data-action="resume-saved-session">Tiếp tục bài đang làm →</button>
            </div>
        ` : "";

        const randomCard = papers.length ? `
            <article class="paper-card paper-card-random">
                <div>
                    <div class="paper-card-top">
                        <span class="paper-badge">🎲 TRỘN ĐỀ TỰ ĐỘNG</span>
                        <span class="paper-badge badge-passage">Giữ nguyên cụm Ngữ liệu</span>
                    </div>
                    <h3>Đề ngẫu nhiên chuẩn cấu trúc ${escapeHTML(exam.name)}</h3>
                    <p>Hệ thống rút ngẫu nhiên câu hỏi từ ${papers.length} đề (${totalQuestionsPool} câu hỏi) của môn ${escapeHTML(subject.name)}, giữ liền mạch các câu đọc ngữ liệu từ câu X đến câu Y.</p>
                </div>
                <div>
                    <div class="paper-meta-list" style="margin-bottom:12px;">
                        <span>◷ ${duration} phút</span>
                        <span>◉ Chuẩn cấu trúc</span>
                        <span>✦ ${totalQuestionsPool} câu trong kho</span>
                    </div>
                    <div class="paper-card-Buttons">
                        <button type="button" class="primary-button" data-action="start-paper" data-exam="${escapeHTML(exam.key)}" data-subject="${escapeHTML(subject.key)}" data-paper-id="__random__">
                            🚀 Bắt đầu đề ngẫu nhiên
                        </button>
                    </div>
                </div>
            </article>
        ` : "";

        const paperCards = papers.map((p, idx) => {
            const passageCount = p.passages?.length || new Set(p.questions.filter(q => q.passageId || q.passageText).map(q => q.passageId || `${q.passageFrom}-${q.passageTo}`)).size;
            const imgCount = p.questions.filter(q => q.image || q.passageImage).length;
            return `
                <article class="paper-card">
                    <div>
                        <div class="paper-card-top">
                            <span class="paper-badge ${p.isCloud ? "badge-cloud" : ""}">${p.isCloud ? "☁ Đề trên Web" : `📄 Đề gốc #${idx + 1}`}</span>
                            ${passageCount ? `<span class="paper-badge badge-passage">📖 ${passageCount} cụm đọc ngữ liệu</span>` : ""}
                        </div>
                        <h3>${escapeHTML(p.title)}</h3>
                        <p>${escapeHTML(p.sourceTitle || `Mã đề: ${p.code}`)}</p>
                    </div>
                    <div>
                        <div class="paper-meta-list" style="margin-bottom:12px;">
                            <span>◷ ${p.durationMinutes || duration} phút</span>
                            <span>◉ ${p.questions.length} câu</span>
                            ${imgCount ? `<span>📷 ${imgCount} câu có ảnh</span>` : ""}
                        </div>
                        <div class="paper-card-Buttons">
                            <button type="button" class="primary-button" data-action="start-paper" data-exam="${escapeHTML(exam.key)}" data-subject="${escapeHTML(subject.key)}" data-paper-id="${escapeHTML(p.id)}">
                                ▶ Làm đề này
                            </button>
                            ${isAdmin() ? `<button type="button" class="secondary-button" data-action="admin-edit-paper" data-exam="${escapeHTML(exam.key)}" data-subject="${escapeHTML(subject.key)}" data-paper-id="${escapeHTML(p.id)}" title="Sửa trực tiếp đề này trên Web">✏️ Sửa đề</button>` : ""}
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        const emptyState = !papers.length ? `
            <div class="empty-state glass-card" style="padding:32px;text-align:center;">
                <h3>Môn ${escapeHTML(subject.name)} (${escapeHTML(exam.name)}) chưa có đề thi nào</h3>
                <p>${isAdmin() ? "Bạn đang đăng nhập quyền Admin — hãy bấm nút bên dưới để tạo đề mới hoặc tải file JSON lên web ngay!" : "Quản trị viên đang cập nhật đề thi cho môn học này."}</p>
                ${isAdmin() ? `<button type="button" class="primary-button" data-action="admin-new-for-subject" data-exam="${escapeHTML(exam.key)}" data-subject="${escapeHTML(subject.key)}">✨ + Tạo đề đầu tiên cho môn ${escapeHTML(subject.name)}</button>` : ""}
            </div>
        ` : `<div class="paper-cards-grid">${randomCard}${paperCards}</div>`;

        DOM.subjectPapersContainer.innerHTML = `
            <div class="glass-card" style="padding:24px;border-radius:22px;">
                <div class="paper-picker-header">
                    <div>
                        <span class="section-kicker">BƯỚC 2 / CHỌN ĐỀ THI MÔN ${escapeHTML(subject.name.toUpperCase())}</span>
                        <h2>Danh sách đề môn ${escapeHTML(subject.name)} (${escapeHTML(exam.name)})</h2>
                        <p>Chọn làm một đề cụ thể bên dưới hoặc thi đề trộn ngẫu nhiên từ ngân hàng câu hỏi.</p>
                    </div>
                    <div class="paper-picker-actions">
                        ${adminActions}
                    </div>
                </div>
                ${resumeBanner}
                ${emptyState}
            </div>
        `;
    }

    /* ---------------- Start / Resume Exam ---------------- */
    async function startExam(examKey, subjectKey, subjectName, paperId = "__random__") {
        const exam = getExamConfig(examKey);
        if (!exam) return showToast("Không tìm thấy kỳ thi.", "error");
        state.examKey = examKey;
        state.examConfig = exam;
        state.subjectKey = subjectKey;
        state.subjectName = subjectName;
        state.selectedPaperId = paperId;
        state.hasSubmitted = false;
        state.isSubmitting = false;
        state.result = null;
        state.answers = {};
        state.flags = {};
        state.currentIndex = 0;
        state.submitReason = null;
        DOM.questionContainer.innerHTML = `<div class="question-loading"><div class="loading-spinner"></div><span>Đang chuẩn bị đề thi...</span></div>`;
        setActiveScreen("exam");

        try {
            const papers = state.subjectPapers?.length && state.subjectPapers[0]?.examKey === examKey && state.subjectPapers[0]?.subjectKey === subjectKey
                ? state.subjectPapers
                : await loadSubjectPapers(examKey, subjectKey);
            state.subjectPapers = papers;

            if (!papers.length) {
                throw new Error(`Chưa có đề thi cho môn ${subjectName}.`);
            }

            if (paperId && paperId !== "__random__") {
                const chosen = papers.find(p => p.id === paperId) || papers[0];
                state.currentPaperObj = chosen;
                state.selectedPaperId = chosen.id;
                state.selectedPaperTitle = chosen.title;
                state.questions = applyBlueprintMetadataToPaperQuestions(chosen.questions, examKey);
                state.durationMinutes = chosen.durationMinutes || getDurationMinutes(examKey, subjectKey);
            } else {
                state.currentPaperObj = null;
                state.selectedPaperId = "__random__";
                state.selectedPaperTitle = "Đề trộn ngẫu nhiên";
                state.questions = selectRandomPaperFromPapers(papers, examKey);
                state.durationMinutes = getDurationMinutes(examKey, subjectKey);
            }

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
            showToast(`Đã mở ${state.selectedPaperTitle} (${state.questions.length} câu · ${state.durationMinutes} phút).`, "success", 2400);
        } catch (error) {
            stopTimer();
            stopAutosave();
            state.questions = [];
            closeModals();
            console.error(error);
            showToast(error.message || "Không thể tạo đề.", "error", 5500);
            setActiveScreen("exam-selection");
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
        state.selectedPaperId = session.selectedPaperId || "__random__";
        state.selectedPaperTitle = session.selectedPaperTitle || "Phiên thi tiếp tục";
        state.questions = deepClone(session.questions);
        state.answers = deepClone(session.answers || {});
        state.flags = deepClone(session.flags || {});
        state.currentIndex = clamp(safeNumber(session.currentIndex, 0), 0, state.questions.length - 1);
        state.durationMinutes = session.durationMinutes || getDurationMinutes(state.examKey, state.subjectKey);
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
        if (DOM.headerTimerValue) DOM.headerTimerValue.textContent = formatTimer(remaining);
        if (DOM.sidebarTimerValue) DOM.sidebarTimerValue.textContent = formatTimer(remaining);
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

    /* ---------------- Exam Rendering (With Reading Passage & Lightbox) ---------------- */
    function renderExamShell() {
        DOM.examTitle.textContent = state.subjectName || "Môn học";
        if (DOM.examPaperSubtitle) DOM.examPaperSubtitle.textContent = state.selectedPaperTitle || "";
        DOM.totalQuestionNumber.textContent = String(state.questions.length);
        DOM.adminEditCurrentExamBtn?.classList.toggle("hidden", !isAdmin() || !state.currentPaperObj);
        renderPalette();
        updateTimerUI();
    }

    function renderPalette() {
        if (!DOM.questionPalette) return;
        DOM.questionPalette.innerHTML = state.questions.map((q, i) => {
            const answered = isQuestionAnswered(q);
            const hasPassage = Boolean(q.passageText || q.passageImage || (q.passageFrom && q.passageTo));
            return `<button class="palette-button ${answered ? "is-answered" : ""} ${state.flags[q.id] ? "is-flagged" : ""} ${i === state.currentIndex ? "is-current" : ""}" type="button" data-action="jump-question" data-index="${i}" title="Câu ${i + 1}${hasPassage ? ` (Đọc ngữ liệu Câu ${q.passageFrom || i + 1}–${q.passageTo || i + 1})` : ""}" aria-label="Đi tới câu ${i + 1}">${i + 1}</button>`;
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

    function hasReadingPassage(q) {
        return Boolean(q && (q.passageText || q.passageImage || (q.passageFrom && q.passageTo)));
    }

    function getPassageGroupQuestions(q) {
        if (!q) return [];
        if (q.passageFrom && q.passageTo) {
            return state.questions.filter(item => item.displayNumber >= q.passageFrom && item.displayNumber <= q.passageTo);
        }
        if (q.passageId) {
            return state.questions.filter(item => item.passageId === q.passageId);
        }
        return [q];
    }

    function renderCurrentQuestion(direction = 0) {
        if (!state.questions.length || !DOM.questionContainer) return;
        state.currentIndex = clamp(state.currentIndex, 0, state.questions.length - 1);
        const q = state.questions[state.currentIndex];
        DOM.currentQuestionNumber.textContent = String(state.currentIndex + 1);
        DOM.totalQuestionNumber.textContent = String(state.questions.length);
        const percent = Math.round((countAnswered() / state.questions.length) * 100);
        DOM.questionProgressText.textContent = `${percent}% hoàn thành`;
        DOM.questionProgressFill.style.width = `${percent}%`;
        DOM.examPartLabel.textContent = `PHẦN ${q.blueprintPart || q.part || 1}`;
        DOM.examPartTitle.textContent = q.blueprintTitle || typeLabel(q.type);
        DOM.flagQuestionButton?.classList.toggle("is-active", Boolean(state.flags[q.id]));
        DOM.flagQuestionButton?.setAttribute("aria-pressed", state.flags[q.id] ? "true" : "false");

        const withPassage = hasReadingPassage(q);
        DOM.togglePassageLayoutBtn?.classList.toggle("hidden", !withPassage);

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

    function renderImageBlock(src, caption = "Hình minh họa", className = "question-image-wrap") {
        if (!src) return "";
        return `
            <div class="${className}">
                <img class="question-image" src="${escapeHTML(src)}" alt="${escapeHTML(caption)}" loading="lazy" data-action="zoom-image" data-src="${escapeHTML(src)}" data-caption="${escapeHTML(caption)}">
                <button type="button" class="image-zoom-btn" data-action="zoom-image" data-src="${escapeHTML(src)}" data-caption="${escapeHTML(caption)}">🔍 Phóng to ảnh</button>
            </div>
        `;
    }

    function renderPassagePanelHTML(q) {
        const group = getPassageGroupQuestions(q);
        const fromNum = q.passageFrom || group[0]?.displayNumber || q.displayNumber;
        const toNum = q.passageTo || group[group.length - 1]?.displayNumber || q.displayNumber;
        const title = q.passageTitle || `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${fromNum} đến câu ${toNum}:`;

        const pillsHTML = group.map(item => {
            const idx = item.displayNumber - 1;
            const active = idx === state.currentIndex;
            const answered = isQuestionAnswered(item);
            return `<button type="button" class="passage-range-pill ${active ? "is-current" : ""} ${answered ? "is-answered" : ""}" data-action="jump-question" data-index="${idx}">Câu ${item.displayNumber}${answered ? " ✓" : ""}</button>`;
        }).join("");

        return `
            <aside class="passage-panel" aria-label="Ngữ liệu đọc hiểu">
                <div class="passage-panel-header">
                    <span class="passage-kicker-badge">📖 ĐỌC NGỮ LIỆU · TỪ CÂU ${fromNum} ĐẾN CÂU ${toNum}</span>
                    <div class="passage-range-pills">${pillsHTML}</div>
                </div>
                <h3 class="passage-title math-content">${richText(title)}</h3>
                ${q.passageText ? `<div class="passage-body-text math-content">${richText(q.passageText)}</div>` : ""}
                ${q.passageImage ? renderImageBlock(q.passageImage, `Hình ngữ liệu (Câu ${fromNum}–${toNum})`, "passage-image-wrap") : ""}
            </aside>
        `;
    }

    function questionHTML(q) {
        const withPassage = hasReadingPassage(q);
        const group = withPassage ? getPassageGroupQuestions(q) : [];
        const fromNum = q.passageFrom || group[0]?.displayNumber || q.displayNumber;
        const toNum = q.passageTo || group[group.length - 1]?.displayNumber || q.displayNumber;

        // Avoid showing duplicate image inside question card if question image is identical to passage image
        const showQuestionOwnImage = Boolean(q.image && (!withPassage || q.image !== q.passageImage));

        const questionCardInner = `
            <div class="question-card-body">
                <div class="question-header">
                    <div>
                        <span class="question-type-chip">${escapeHTML(typeIcon(q.type))} ${escapeHTML(typeLabel(q.type))}</span>
                        <span class="question-number-large">Câu ${q.displayNumber}</span>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                        ${withPassage ? `<span class="question-type-chip" style="color:var(--cyan);border-color:rgba(55,217,255,.3);">📖 Ngữ liệu Câu ${fromNum}–${toNum}</span>` : ""}
                        ${q.difficulty ? `<span class="question-type-chip">${escapeHTML(q.difficulty)}</span>` : ""}
                    </div>
                </div>
                ${showQuestionOwnImage ? renderImageBlock(q.image, `Hình minh họa Câu ${q.displayNumber}`) : ""}
                <h2 class="question-text math-content">${richText(q.text)}</h2>
                ${bodyHTML(q)}
            </div>
        `;

        if (!withPassage) return questionCardInner;

        return `
            <div class="question-with-passage ${state.passageLayout === "split" ? "layout-split" : "layout-stacked"}">
                ${renderPassagePanelHTML(q)}
                ${questionCardInner}
            </div>
        `;
    }

    function bodyHTML(q) {
        if (q.type === "mcq") return mcqHTML(q);
        if (q.type === "true_false") return trueFalseHTML(q);
        if (q.type === "matching") return matchingHTML(q);
        if (q.type === "short_answer") return shortAnswerHTML(q);
        return `<div class="empty-state glass-card"><h3>Dạng câu hỏi chưa hỗ trợ</h3></div>`;
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
            return `<div class="sub-question"><div class="sub-question-top"><span class="sub-question-label">${escapeHTML(key.toUpperCase())}</span><span class="sub-question-text math-content">${richText(p.left)}</span></div><div style="margin-top:12px;"><select style="width:100%;min-height:44px;padding:9px 11px;border:1px solid var(--border);border-radius:11px;background:var(--bg-soft);color:var(--text);outline:none;" data-answer-type="matching" data-key="${escapeHTML(key)}" aria-label="Đáp án ghép cho mục ${escapeHTML(key)}"><option value="">— Chọn phương án ghép —</option>${p.options.map(o => `<option value="${escapeHTML(o.key)}" ${String(answer[key] ?? "") === String(o.key) ? "selected" : ""}>${escapeHTML(o.key)} · ${escapeHTML(o.text)}</option>`).join("")}</select></div></div>`;
        }).join("")}</div>`;
    }

    function shortAnswerHTML(q) {
        const current = String(state.answers[q.id] ?? "");
        const inputId = `shortAnswer_${String(q.id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
        return `<div class="short-answer-box"><label for="${escapeHTML(inputId)}" style="font-size:11px;font-weight:700;color:var(--text-muted);">Nhập đáp án của bạn</label><input id="${escapeHTML(inputId)}" class="short-answer-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="120" value="${escapeHTML(current)}" placeholder="Ví dụ: 13.33 hoặc 42" data-answer-type="short_answer"><button class="secondary-button" style="width:max-content;" type="button" data-answer-type="short_answer-save">Lưu câu trả lời</button></div>`;
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
            state.answers[q.id] = input.value.trim();
            saveSession();
            updatePaletteCount();
            playSound("select");
            showToast("Đã lưu câu trả lời.", "success", 1400);
        };
        input?.addEventListener("input", () => {
            const q = currentQuestion(); if (!q || state.hasSubmitted) return;
            state.answers[q.id] = input.value.trim();
            saveSession();
            updatePaletteCount();
        });
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
        state.flags[q.id] = !state.flags[q.id];
        DOM.flagQuestionButton?.classList.toggle("is-active", Boolean(state.flags[q.id]));
        updatePaletteCount();
        saveSession();
        playSound("click");
    }

    /* ---------------- Scoring ---------------- */
    function numericValue(value) {
        if (value == null || String(value).trim() === "") return null;
        let s = String(value).trim().replace(/\s/g, "").replace(/,/g, ".");
        if (/^[-+]?\d+(?:\.\d+)?\/[-+]?\d+(?:\.\d+)?$/.test(s)) {
            const [a, b] = s.split("/").map(Number); return b ? a / b : null;
        }
        if (/%$/.test(s)) s = s.slice(0, -1);
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }
    function shortEqual(user, candidate) {
        const a = numericValue(user); const b = numericValue(candidate);
        if (a !== null && b !== null) return Math.abs(a - b) <= 1e-4;
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
            const keys = q.pairs.map(p => p.key).filter(key => Object.prototype.hasOwnProperty.call(correct, key) && String(correct[key]) !== "");
            const right = keys.reduce((sum, key) => sum + (Object.prototype.hasOwnProperty.call(user, key) && normalizeText(user[key]) === normalizeText(correct[key]) ? 1 : 0), 0);
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
        const wrongCount = evaluations.filter(x => ["wrong", "partial"].includes(x.evaluation.status)).length;
        const percent = maxScore ? clamp(score / maxScore * 100, 0, 100) : 0;
        const usedSeconds = clamp(Math.round((Date.now() - state.startAt) / 1000), 0, state.durationSeconds);
        const breakdown = buildBreakdown(evaluations);
        return {
            id: uid("result"),
            createdAt: Date.now(),
            examKey: state.examKey,
            examName: state.examConfig?.name,
            subjectKey: state.subjectKey,
            subjectName: state.subjectName,
            paperTitle: state.selectedPaperTitle,
            score,
            maxScore,
            percent,
            correctCount,
            wrongCount,
            unansweredCount,
            usedSeconds,
            reason: state.submitReason || "manual",
            evaluations,
            breakdown
        };
    }

    function buildBreakdown(evaluations) {
        const map = new Map();
        evaluations.forEach(item => {
            const q = item.question;
            const key = `${q.blueprintPart}-${q.type}`;
            if (!map.has(key)) map.set(key, { part: q.blueprintPart, title: q.blueprintTitle || typeLabel(q.type), type: q.type, count: 0, correct: 0, earned: 0, max: 0 });
            const b = map.get(key);
            b.count += 1;
            b.correct += item.evaluation.isCorrect ? 1 : 0;
            b.earned = roundScore(b.earned + item.evaluation.earnedScore);
            b.max = roundScore(b.max + item.evaluation.maxScore);
        });
        return Array.from(map.values()).sort((a, b) => a.part - b.part);
    }

    /* ---------------- Submit / Result ---------------- */
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
        stopTimer();
        stopAutosave();
        state.remainingSeconds = getRemainingSeconds();
        await nextFrame();
        try {
            const result = calculateResult();
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
            startTimer();
            startAutosave();
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
        DOM.resultSubtitle.textContent = `${result.subjectName}${result.paperTitle ? ` · ${result.paperTitle}` : ""} · ${result.reason === "timeout" ? "Hệ thống tự động nộp khi hết giờ." : "Bạn đã chủ động nộp bài."}`;
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
        DOM.resultBreakdown.innerHTML = (result.breakdown || []).map(item => {
            const pct = item.max ? clamp(item.earned / item.max * 100, 0, 100) : 0;
            return `<article class="breakdown-card glass-card"><div class="breakdown-card-top"><h3>${escapeHTML(item.title)}</h3><span class="breakdown-card-score">${formatScore(item.earned)} / ${formatScore(item.max)}</span></div><p style="margin-top:7px;">${escapeHTML(typeLabel(item.type))} · ${item.correct}/${item.count} câu trọn điểm</p><div class="breakdown-progress"><span style="width:${pct}%"></span></div></article>`;
        }).join("");
    }

    function renderUserAnswer(q, answer) {
        if (answer == null || answer === "") return "— Chưa trả lời";
        if (q.type === "mcq") return `<span class="answer-chip">${escapeHTML(String(answer))}</span>`;
        if (isObject(answer)) return Object.entries(answer).map(([k, v]) => `<span class="answer-chip">${escapeHTML(k)}: ${escapeHTML(typeof v === "boolean" ? (v ? "Đúng" : "Sai") : String(v))}</span>`).join(" ");
        return escapeHTML(String(answer));
    }

    function renderCorrectAnswer(q) {
        if (q.type === "mcq") return `<span class="answer-chip">${escapeHTML(String(getCorrectMCQKey(q) ?? "—"))}</span>`;
        if (isObject(q.answer)) return Object.entries(q.answer).map(([k, v]) => `<span class="answer-chip">${escapeHTML(k)}: ${escapeHTML(typeof v === "boolean" ? (v ? "Đúng" : "Sai") : String(v))}</span>`).join(" ");
        return escapeHTML((q.acceptedAnswers || []).join(" / ") || String(q.answer ?? "—"));
    }

    function renderReview(result) {
        DOM.reviewList.innerHTML = (result.evaluations || []).map((item, i) => {
            const q = item.question;
            const e = item.evaluation;
            const status = e.status === "unanswered" ? "BỎ TRỐNG" : e.status === "partial" ? "ĐÚNG MỘT PHẦN" : e.isCorrect ? "ĐÚNG" : "SAI";
            const cls = e.status === "unanswered" ? "unanswered" : e.isCorrect ? "correct" : "wrong";
            const hasPass = hasReadingPassage(q);
            return `<article class="review-item">
                <div class="review-item-top">
                    <div class="review-item-title">
                        <span class="review-question-number">${i + 1}</span>
                        <strong>${escapeHTML(typeLabel(q.type))}</strong>
                        ${hasPass ? `<span class="paper-badge badge-passage">📖 Ngữ liệu Câu ${q.passageFrom || i + 1}–${q.passageTo || i + 1}</span>` : ""}
                    </div>
                    <span class="review-item-status ${cls}">${status} · ${formatScore(e.earnedScore)}đ</span>
                </div>
                ${hasPass && q.passageText ? `<div style="margin:8px 0;padding:10px 12px;border-radius:10px;background:rgba(55,217,255,0.07);border:1px solid rgba(55,217,255,0.2);font-size:12px;"><strong>${escapeHTML(q.passageTitle || "Ngữ liệu đọc hiểu:")}</strong><div class="math-content" style="margin-top:4px;">${richText(q.passageText)}</div></div>` : ""}
                ${q.image ? renderImageBlock(q.image, `Hình Câu ${i + 1}`) : ""}
                <div class="review-item-question math-content">${richText(q.text)}</div>
                <div class="review-item-answer">
                    <div class="review-answer-box ${e.isCorrect || e.status === "unanswered" ? "" : "answer-user-wrong"}">
                        <span>Bạn trả lời</span>
                        <strong>${renderUserAnswer(q, item.userAnswer)}</strong>
                    </div>
                    <div class="review-answer-box answer-correct">
                        <span>Đáp án đúng</span>
                        <strong>${renderCorrectAnswer(q)}</strong>
                    </div>
                </div>
                ${q.explanation ? `<div style="display:flex;gap:9px;margin-top:10px;padding:12px;border-radius:10px;background:var(--surface-soft);"><span>💡</span><div><strong style="font-size:12px;">Giải thích chi tiết</strong><div class="math-content" style="margin-top:4px;font-size:12.5px;">${richText(q.explanation)}</div></div></div>` : ""}
            </article>`;
        }).join("");
    }

    /* ---------------- History ---------------- */
    function renderHistory() {
        const history = loadHistory().filter(item => item && item.examKey && Number.isFinite(Number(item.score)));
        DOM.historyExamCount.textContent = String(history.length);
        DOM.historyBestScore.textContent = formatScore(history.reduce((m, x) => Math.max(m, safeNumber(x.score)), 0));
        DOM.historyAverageScore.textContent = formatScore(history.length ? history.reduce((s, x) => s + safeNumber(x.score), 0) / history.length : 0);
        DOM.historyStreak.textContent = `${calculateStreak(history)} ngày`;
        if (!history.length) {
            DOM.historyList.innerHTML = "";
            DOM.historyEmpty.classList.remove("hidden");
            renderAccountStats();
            return;
        }
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
        state.result = deepClone(item);
        state.examKey = item.examKey;
        state.subjectKey = item.subjectKey;
        state.subjectName = item.subjectName;
        state.examConfig = getExamConfig(item.examKey);
        renderResult(item);
        setActiveScreen("result");
    }

    /* =========================================================
       ADMIN STUDIO — DIRECT WEB EXAM MANAGER & VISUAL EDITOR
       ========================================================= */
    function populateAdminSubjectSelect(examKey, selectedSubject = null) {
        const exam = getExamConfig(examKey) || EXAMS.vsat;
        if (!DOM.adminFilterSubject) return;
        const targetSub = selectedSubject || (exam.subjects.some(s => s.key === state.admin.subjectKey) ? state.admin.subjectKey : exam.subjects[0].key);
        state.admin.examKey = exam.key;
        state.admin.subjectKey = targetSub;
        if (DOM.adminFilterExam) DOM.adminFilterExam.value = exam.key;
        DOM.adminFilterSubject.innerHTML = exam.subjects.map(s => `<option value="${escapeHTML(s.key)}" ${s.key === targetSub ? "selected" : ""}>${escapeHTML(s.name)}</option>`).join("");
    }

    async function openAdminStudio(examKey = null, subjectKey = null, tab = "exams") {
        if (!isAdmin()) {
            showToast("Chỉ tài khoản Admin mới truy cập được Quản lý Đề.", "error");
            return;
        }
        document.getElementById("profileModal")?.remove();
        document.getElementById("adminModal")?.remove();
        populateAdminSubjectSelect(examKey || state.admin.examKey || "vsat", subjectKey || state.admin.subjectKey || "sinh");
        switchAdminTab(tab);
        setActiveScreen("admin-studio");
        await refreshAdminExamList();
    }

    function switchAdminTab(tab) {
        state.admin.tab = tab === "users" ? "users" : "exams";
        const isExams = state.admin.tab === "exams";
        DOM.adminTabExamsBtn?.classList.toggle("primary-button", isExams);
        DOM.adminTabExamsBtn?.classList.toggle("secondary-button", !isExams);
        DOM.adminTabUsersBtn?.classList.toggle("primary-button", !isExams);
        DOM.adminTabUsersBtn?.classList.toggle("secondary-button", isExams);
        DOM.adminExamsTabPanel?.classList.toggle("hidden", !isExams);
        DOM.adminUsersTabPanel?.classList.toggle("hidden", isExams);
        if (!isExams) loadStudioAdminUsers();
    }

    async function loadStudioAdminUsers() {
        const host = DOM.studioAdminUsersList;
        if (!host) return;
        try {
            const d = await apiGet('/api/admin/users');
            host.innerHTML = (d.users || []).map(u => `
                <div class="admin-user-row">
                    <div>
                        <b>${escapeHTML(u.fullName || u.username)}</b>
                        <span>@${escapeHTML(u.username)} · ${u.role === 'admin' ? 'Quản trị viên' : (u.status === 'active' ? 'Đang hoạt động' : 'Đã khóa')}</span>
                    </div>
                    ${u.role === 'student' ? `<button class="secondary-button small" data-admin-id="${escapeHTML(u.id)}" data-admin-status="${u.status === 'active' ? 'disabled' : 'active'}">${u.status === 'active' ? '🔒 Khóa' : '🔓 Mở khóa'}</button>` : ''}
                </div>
            `).join('') || 'Chưa có tài khoản học sinh.';
        } catch (e) {
            host.textContent = e.message;
        }
    }

    async function refreshAdminExamList() {
        const { examKey, subjectKey } = state.admin;
        const exam = getExamConfig(examKey) || EXAMS.vsat;
        const subject = getSubjectConfig(examKey, subjectKey) || exam.subjects[0];
        if (DOM.adminSubjectListTitle) {
            DOM.adminSubjectListTitle.textContent = `Đề thi môn ${subject.name} (${exam.name})`;
        }
        if (DOM.adminExamCardsGrid) {
            DOM.adminExamCardsGrid.innerHTML = `<div class="question-loading"><div class="loading-spinner"></div><span>Đang tải danh sách đề...</span></div>`;
        }
        const papers = await loadSubjectPapers(examKey, subjectKey);
        state.admin.papers = papers;
        if (DOM.adminExamCountHint) DOM.adminExamCountHint.textContent = `${papers.length} đề hiện có`;

        if (!DOM.adminExamCardsGrid) return;
        if (!papers.length) {
            DOM.adminExamCardsGrid.innerHTML = `
                <div class="empty-state glass-card" style="grid-column:1/-1;padding:34px;text-align:center;">
                    <h3>Chưa có đề nào cho môn ${escapeHTML(subject.name)} (${escapeHTML(exam.name)})</h3>
                    <p>Bấm <strong>✨ + Tạo đề mới trên Web</strong> hoặc <strong>📂 Nhập từ file JSON</strong> ở thanh công cụ phía trên để thêm đề ngay mà không cần vào GitHub.</p>
                </div>
            `;
            return;
        }

        DOM.adminExamCardsGrid.innerHTML = papers.map((p, idx) => {
            const passageCount = p.passages?.length || 0;
            const imgCount = p.questions.filter(q => q.image || q.passageImage).length;
            const mcqCount = p.questions.filter(q => q.type === "mcq").length;
            return `
                <article class="admin-exam-card glass-card">
                    <div>
                        <div class="paper-card-top">
                            <span class="paper-badge ${p.isCloud ? "badge-cloud" : ""}">${p.isCloud ? "☁ Đã lưu trên Web" : "📁 Đề gốc JSON"}</span>
                            <span class="paper-badge badge-passage">📖 ${passageCount} ngữ liệu · ${mcqCount} câu MCQ</span>
                        </div>
                        <h3>${escapeHTML(p.title)}</h3>
                        <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px;">Mã đề: <strong>${escapeHTML(p.code)}</strong> ${p.sourceFile ? `· File: ${escapeHTML(p.sourceFile)}` : ""}</p>
                        <div class="paper-meta-list">
                            <span>◉ ${p.questions.length} câu hỏi</span>
                            <span>📷 ${imgCount} câu có ảnh</span>
                            <span>◷ ${p.durationMinutes} phút</span>
                        </div>
                    </div>
                    <div class="admin-exam-card-actions">
                        <button type="button" class="primary-button small" data-action="admin-open-editor" data-paper-index="${idx}">
                            ✏️ Sửa trực tiếp trên Web
                        </button>
                        <button type="button" class="secondary-button small" data-action="start-paper" data-exam="${escapeHTML(p.examKey)}" data-subject="${escapeHTML(p.subjectKey)}" data-paper-id="${escapeHTML(p.id)}">
                            👁 Thi thử
                        </button>
                        <button type="button" class="secondary-button small" data-action="admin-export-json" data-paper-index="${idx}">
                            📥 Tải JSON
                        </button>
                        <button type="button" class="danger-button small" style="padding:8px 12px;font-size:12px;" data-action="admin-delete-paper" data-paper-index="${idx}">
                            🗑 Xóa
                        </button>
                    </div>
                </article>
            `;
        }).join("");
    }

    function createBlankQuestion(type, num, examKey = "vsat") {
        const exam = getExamConfig(examKey) || EXAMS.vsat;
        const bp = exam.blueprint.find(b => b.type === type) || exam.blueprint[0];
        const base = {
            id: `q_${Date.now().toString(36)}_${num}`,
            questionNumber: num,
            type,
            part: bp?.part || 1,
            partTitle: bp?.title || typeLabel(type),
            text: `Nội dung câu hỏi ${num}...`,
            image: "",
            explanation: "",
            passageId: "",
            passageFrom: null,
            passageTo: null,
            passageTitle: "",
            passageText: "",
            passageImage: ""
        };
        if (type === "mcq") {
            return {
                ...base,
                options: [
                    { key: "A", text: "Phương án A" },
                    { key: "B", text: "Phương án B" },
                    { key: "C", text: "Phương án C" },
                    { key: "D", text: "Phương án D" }
                ],
                answer: "A",
                statements: [],
                pairs: [],
                acceptedAnswers: []
            };
        }
        if (type === "true_false") {
            return {
                ...base,
                options: [],
                statements: [
                    { key: "a", text: "Mệnh đề a" },
                    { key: "b", text: "Mệnh đề b" },
                    { key: "c", text: "Mệnh đề c" },
                    { key: "d", text: "Mệnh đề d" }
                ],
                answer: { a: true, b: false, c: true, d: false },
                pairs: [],
                acceptedAnswers: []
            };
        }
        if (type === "matching") {
            const rightOpts = [
                { key: "A", text: "Mô tả ghép A" },
                { key: "B", text: "Mô tả ghép B" },
                { key: "C", text: "Mô tả ghép C" },
                { key: "D", text: "Mô tả ghép D" },
                { key: "E", text: "Mô tả ghép E" }
            ];
            return {
                ...base,
                options: [],
                statements: [],
                pairs: [
                    { key: "1", left: "Mục 1", options: deepClone(rightOpts) },
                    { key: "2", left: "Mục 2", options: deepClone(rightOpts) },
                    { key: "3", left: "Mục 3", options: deepClone(rightOpts) },
                    { key: "4", left: "Mục 4", options: deepClone(rightOpts) }
                ],
                answer: { "1": "A", "2": "B", "3": "C", "4": "D" },
                acceptedAnswers: []
            };
        }
        return {
            ...base,
            options: [],
            statements: [],
            pairs: [],
            answer: "0",
            acceptedAnswers: ["0"]
        };
    }

    function createNewPaperTemplate(examKey, subjectKey) {
        const exam = getExamConfig(examKey) || EXAMS.vsat;
        const subject = getSubjectConfig(examKey, subjectKey) || exam.subjects[0];
        const count = (state.admin.papers?.length || 0) + 1;
        const questions = [];
        let qNum = 1;
        for (const sec of exam.blueprint) {
            for (let i = 0; i < sec.count; i++) {
                const q = createBlankQuestion(sec.type, qNum, examKey);
                q.part = sec.part;
                q.partTitle = sec.title;
                questions.push(q);
                qNum++;
            }
        }
        // Default 2 reading passages for the MCQ section!
        const mcqIndices = questions.map((q, idx) => q.type === "mcq" ? idx + 1 : null).filter(Boolean);
        const passages = [];
        if (mcqIndices.length >= 6) {
            const f1 = mcqIndices[0], t1 = mcqIndices[2];
            const f2 = mcqIndices[3], t2 = mcqIndices[5];
            passages.push(
                {
                    id: uid("passage"),
                    fromQuestion: f1,
                    toQuestion: t1,
                    title: `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${f1} đến câu ${t1}:`,
                    text: "Nhập nội dung đoạn ngữ liệu đọc hiểu 1 tại đây...",
                    image: ""
                },
                {
                    id: uid("passage"),
                    fromQuestion: f2,
                    toQuestion: t2,
                    title: `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${f2} đến câu ${t2}:`,
                    text: "Nhập nội dung đoạn ngữ liệu đọc hiểu 2 tại đây...",
                    image: ""
                }
            );
        } else if (mcqIndices.length >= 1) {
            const f1 = mcqIndices[0], t1 = mcqIndices[Math.min(2, mcqIndices.length - 1)];
            passages.push({
                id: uid("passage"),
                fromQuestion: f1,
                toQuestion: t1,
                title: `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${f1} đến câu ${t1}:`,
                text: "Nhập nội dung đoạn ngữ liệu đọc hiểu tại đây...",
                image: ""
            });
        }

        const paper = {
            id: `exam_${examKey}_${subjectKey}_${Date.now()}`,
            examKey,
            subjectKey,
            code: `${subjectKey}_de${count}`,
            title: `${exam.name} ${subject.name} – Đề ${count}`,
            sourceTitle: "Tạo trực tiếp trên Web",
            sourceFile: "",
            isCloud: true,
            durationMinutes: getDurationMinutes(examKey, subjectKey),
            maxScore: exam.maxScore,
            passages,
            questions
        };
        syncPassagesToQuestions(paper);
        return paper;
    }

    function syncPassagesToQuestions(paper) {
        if (!paper || !Array.isArray(paper.questions)) return;
        const passages = Array.isArray(paper.passages) ? paper.passages : [];
        paper.questions.forEach((q, idx) => {
            const num = idx + 1;
            q.questionNumber = num;
            const pas = passages.find(p => num >= Number(p.fromQuestion) && num <= Number(p.toQuestion));
            if (pas) {
                q.passageId = pas.id;
                q.passageFrom = Number(pas.fromQuestion);
                q.passageTo = Number(pas.toQuestion);
                q.passageTitle = pas.title;
                q.passageText = pas.text;
                q.passageImage = pas.image || "";
            } else {
                q.passageId = "";
                q.passageFrom = null;
                q.passageTo = null;
                q.passageTitle = "";
                q.passageText = "";
                q.passageImage = "";
            }
        });
    }

    function openPaperInAdminEditor(paper) {
        const clone = deepClone(paper);
        // Ensure passages array is populated even if questions only had inline passage fields
        if (!Array.isArray(clone.passages)) clone.passages = [];
        if (!clone.passages.length) {
            const map = new Map();
            clone.questions.forEach((q, i) => {
                if (q.passageText || q.passageImage || (q.passageFrom && q.passageTo)) {
                    const f = q.passageFrom || (i + 1);
                    const t = q.passageTo || (i + 1);
                    const k = `${f}_${t}`;
                    if (!map.has(k)) {
                        map.set(k, {
                            id: q.passageId || uid("passage"),
                            fromQuestion: f,
                            toQuestion: t,
                            title: q.passageTitle || `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${f} đến câu ${t}:`,
                            text: q.passageText || "",
                            image: q.passageImage || ""
                        });
                    }
                }
            });
            clone.passages = Array.from(map.values());
        }
        syncPassagesToQuestions(clone);
        state.admin.editingPaper = clone;
        state.admin.partFilter = "all";
        DOM.adminExamListSection?.classList.add("hidden");
        DOM.adminExamEditorWrap?.classList.remove("hidden");
        renderAdminExamEditor();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function closeAdminEditor() {
        state.admin.editingPaper = null;
        DOM.adminExamEditorWrap?.classList.add("hidden");
        DOM.adminExamListSection?.classList.remove("hidden");
        refreshAdminExamList();
    }

    function renderAdminExamEditor() {
        const p = state.admin.editingPaper;
        if (!p || !DOM.adminExamEditorWrap) return;
        syncPassagesToQuestions(p);

        const totalQ = p.questions.length;
        const questionOptionsHTML = (selectedNum) => p.questions.map((q, idx) => {
            const n = idx + 1;
            return `<option value="${n}" ${Number(selectedNum) === n ? "selected" : ""}>Câu ${n} (${typeLabel(q.type)})</option>`;
        }).join("");

        const passagesHTML = (p.passages || []).map((pas, pIdx) => {
            const fromQ = Number(pas.fromQuestion) || 1;
            const toQ = Number(pas.toQuestion) || fromQ;
            const countInRange = Math.max(0, toQ - fromQ + 1);
            return `
                <div class="passage-editor-item" data-passage-index="${pIdx}">
                    <div class="question-editor-head">
                        <div class="passage-range-Highlight">
                            📖 Cụm Đọc Ngữ Liệu #${pIdx + 1} · Áp dụng: Từ Câu ${fromQ} đến Câu ${toQ} (${countInRange} câu trắc nghiệm)
                        </div>
                        <button type="button" class="danger-button small" style="padding:6px 12px;font-size:12px;" data-action="editor-delete-passage" data-passage-index="${pIdx}">
                            🗑 Xóa ngữ liệu này
                        </button>
                    </div>

                    <div class="passage-editor-row">
                        <label class="editor-field">
                            <span>Từ câu trắc nghiệm số:</span>
                            <select class="editor-input" data-passage-field="fromQuestion" data-passage-index="${pIdx}">
                                ${questionOptionsHTML(fromQ)}
                            </select>
                        </label>
                        <label class="editor-field">
                            <span>Đến câu trắc nghiệm số:</span>
                            <select class="editor-input" data-passage-field="toQuestion" data-passage-index="${pIdx}">
                                ${questionOptionsHTML(toQ)}
                            </select>
                        </label>
                        <label class="editor-field" style="grid-column: span 2;">
                            <span>Tiêu đề yêu cầu đọc ngữ liệu (hiển thị đầu đoạn):</span>
                            <input type="text" class="editor-input" data-passage-field="title" data-passage-index="${pIdx}" value="${escapeHTML(pas.title || "")}" placeholder="VD: Đọc ngữ liệu sau và trả lời các câu hỏi từ câu 10 đến câu 12:">
                        </label>
                    </div>

                    <label class="editor-field">
                        <span>Nội dung văn bản / đoạn đọc ngữ liệu (hỗ trợ nhiều dòng và công thức Toán/Lý/Hóa/Sinh $...$):</span>
                        <textarea class="editor-textarea" rows="4" data-passage-field="text" data-passage-index="${pIdx}" placeholder="Nhập đoạn văn bản, thông tin thí nghiệm, bảng biểu hoặc giả thiết dùng chung cho các câu từ ${fromQ} đến ${toQ}...">${escapeHTML(pas.text || "")}</textarea>
                    </label>

                    <div class="image-uploader-box ${pas.image ? "has-image" : ""}">
                        <div class="image-uploader-actions">
                            <strong style="font-size:12.5px;">📷 Ảnh của đoạn Ngữ liệu này (nếu có):</strong>
                            <label class="secondary-button small file-upload-btn">
                                <span>📤 Tải ảnh Ngữ liệu từ máy</span>
                                <input type="file" accept="image/*" data-passage-image-upload="${pIdx}" hidden>
                            </label>
                            <input type="text" class="editor-input" style="max-width:320px;padding:7px 11px;font-size:12px;" data-passage-field="image" data-passage-index="${pIdx}" value="${escapeHTML(pas.image?.startsWith("data:") ? "" : (pas.image || ""))}" placeholder="Hoặc dán URL / đường dẫn ảnh...">
                            ${pas.image ? `<button type="button" class="danger-button small" style="padding:6px 10px;font-size:11px;" data-action="editor-clear-passage-image" data-passage-index="${pIdx}">✕ Xóa ảnh</button>` : ""}
                        </div>
                        ${pas.image ? `
                            <div class="image-preview-box">
                                <img src="${escapeHTML(pas.image)}" alt="Ảnh ngữ liệu" data-action="zoom-image" data-src="${escapeHTML(pas.image)}" data-caption="Ảnh ngữ liệu Câu ${fromQ}–${toQ}">
                                <div style="font-size:12px;">
                                    <strong>Đã đính kèm ảnh ngữ liệu (Câu ${fromQ} → Câu ${toQ})</strong>
                                    <p style="margin:3px 0 0;color:#4e5970;">Bấm vào ảnh để phóng to kiểm tra độ nét.</p>
                                </div>
                            </div>
                        ` : `<div style="font-size:11.5px;color:var(--text-muted);">Chưa có ảnh ngữ liệu. Bạn có thể bấm "Tải ảnh Ngữ liệu từ máy" để đính kèm sơ đồ/bảng biểu chung cho các câu ${fromQ}–${toQ}.</div>`}
                    </div>
                </div>
            `;
        }).join("");

        const filteredQuestions = p.questions.map((q, idx) => ({ q, idx })).filter(({ q }) => {
            if (state.admin.partFilter === "all") return true;
            if (state.admin.partFilter === "mcq") return q.type === "mcq";
            if (state.admin.partFilter === "true_false") return q.type === "true_false";
            if (state.admin.partFilter === "matching") return q.type === "matching";
            if (state.admin.partFilter === "short_answer") return q.type === "short_answer";
            return true;
        });

        DOM.adminExamEditorWrap.innerHTML = `
            <!-- Thanh công cụ Lưu cố định -->
            <div class="editor-sticky-bar">
                <div class="editor-sticky-left">
                    <button type="button" class="secondary-button small" data-action="admin-close-editor">← Danh sách đề</button>
                    <div>
                        <strong style="font-size:15px;">✏️ Đang sửa: ${escapeHTML(p.title)}</strong>
                        <span style="display:block;font-size:11.5px;color:var(--text-muted);">${totalQ} câu hỏi · ${p.passages.length} cụm đọc ngữ liệu · Lưu trực tiếp trên Web</span>
                    </div>
                </div>
                <div class="editor-sticky-actions">
                    <button type="button" class="secondary-button small" data-action="admin-add-question">+ Thêm câu hỏi</button>
                    <button type="button" class="secondary-button small" data-action="admin-export-current-json">📥 Xuất file JSON</button>
                    <button type="button" class="primary-button" data-action="admin-save-paper" id="adminSavePaperBtn">
                        💾 Lưu đề trực tiếp lên Web
                    </button>
                </div>
            </div>

            <!-- 1. Thông tin chung của Đề thi -->
            <div class="editor-section-card glass-card">
                <span class="section-kicker">01 / THÔNG TIN CHUNG CỦA ĐỀ THI</span>
                <h3 style="margin:4px 0 0;">Cấu hình tiêu đề & thông số đề</h3>
                <div class="editor-meta-grid">
                    <label class="editor-field" style="grid-column: span 2;">
                        <span>Tên hiển thị của đề thi</span>
                        <input type="text" class="editor-input" id="editorPaperTitle" value="${escapeHTML(p.title)}">
                    </label>
                    <label class="editor-field">
                        <span>Mã đề (Code)</span>
                        <input type="text" class="editor-input" id="editorPaperCode" value="${escapeHTML(p.code)}">
                    </label>
                    <label class="editor-field">
                        <span>Thời gian làm bài (phút)</span>
                        <input type="number" class="editor-input" id="editorPaperDuration" min="5" max="300" value="${escapeHTML(p.durationMinutes)}">
                    </label>
                    <label class="editor-field" style="grid-column: span 2;">
                        <span>Ghi chú / Nguồn đề (Tùy chọn)</span>
                        <input type="text" class="editor-input" id="editorPaperSourceTitle" value="${escapeHTML(p.sourceTitle || "")}" placeholder="VD: Đề chính thức / Đề luyện tập...">
                    </label>
                </div>
            </div>

            <!-- 2. Quản lý Đọc Ngữ Liệu cho Trắc nghiệm 4 lựa chọn (Chọn từ câu nào đến câu nào) -->
            <div class="passage-manager-card">
                <div class="passage-manager-top">
                    <div>
                        <span class="section-kicker" style="color:var(--cyan);">02 / CẤU HÌNH ĐỌC NGỮ LIỆU (TRẮC NGHIỆM 4 LỰA CHỌN)</span>
                        <h3 style="margin:4px 0 6px;">Đoạn đọc ngữ liệu & Chọn phạm vi từ câu trắc nghiệm nào đến câu nào</h3>
                        <p style="margin:0;font-size:13px;">Thiết lập văn bản/hình ảnh ngữ liệu và chọn áp dụng <strong>Từ câu số mấy đến câu số mấy</strong> (VD: Từ Câu 10 đến Câu 12). Tất cả các câu trắc nghiệm nằm trong khoảng đó sẽ tự động hiển thị chung khung ngữ liệu này khi học sinh làm bài.</p>
                    </div>
                    <button type="button" class="primary-button" data-action="editor-add-passage">
                        📖 + Thêm Cụm Đọc Ngữ Liệu (Từ câu ... đến câu ...)
                    </button>
                </div>
                <div class="passage-editor-list">
                    ${passagesHTML || `<div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.03);font-size:13px;color:var(--text-muted);">Chưa có cụm đọc ngữ liệu nào. Bấm <strong>+ Thêm Cụm Đọc Ngữ Liệu</strong> để tạo đoạn văn đọc hiểu và chọn từ câu trắc nghiệm nào đến câu nào.</div>`}
                </div>
            </div>

            <!-- 3. Danh sách câu hỏi & sửa trực tiếp từng câu + tải ảnh từng câu -->
            <div class="editor-section-card glass-card">
                <div class="editor-questions-toolbar">
                    <div>
                        <span class="section-kicker">03 / DANH SÁCH CÂU HỎI (${filteredQuestions.length}/${totalQ} CÂU)</span>
                        <h3 style="margin:4px 0 0;">Chỉnh sửa trực tiếp nội dung, đáp án & tải ảnh từng câu hỏi</h3>
                    </div>
                    <div class="editor-part-pills">
                        <button type="button" class="editor-part-pill ${state.admin.partFilter === "all" ? "is-active" : ""}" data-action="editor-filter-part" data-filter="all">Tất cả (${totalQ})</button>
                        <button type="button" class="editor-part-pill ${state.admin.partFilter === "true_false" ? "is-active" : ""}" data-action="editor-filter-part" data-filter="true_false">Đúng / Sai (${p.questions.filter(x => x.type === "true_false").length})</button>
                        <button type="button" class="editor-part-pill ${state.admin.partFilter === "mcq" ? "is-active" : ""}" data-action="editor-filter-part" data-filter="mcq">Trắc nghiệm 4 lựa chọn (${p.questions.filter(x => x.type === "mcq").length})</button>
                        <button type="button" class="editor-part-pill ${state.admin.partFilter === "matching" ? "is-active" : ""}" data-action="editor-filter-part" data-filter="matching">Ghép hợp (${p.questions.filter(x => x.type === "matching").length})</button>
                        <button type="button" class="editor-part-pill ${state.admin.partFilter === "short_answer" ? "is-active" : ""}" data-action="editor-filter-part" data-filter="short_answer">Trả lời ngắn (${p.questions.filter(x => x.type === "short_answer").length})</button>
                    </div>
                </div>

                <div class="editor-question-list" id="editorQuestionList">
                    ${filteredQuestions.map(({ q, idx }) => renderQuestionEditorCardHTML(q, idx, p)).join("")}
                </div>

                <div style="margin-top:20px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <button type="button" class="secondary-button" data-action="admin-add-question">+ Thêm câu hỏi mới vào cuối đề</button>
                    <button type="button" class="primary-button" data-action="admin-save-paper">💾 Lưu toàn bộ đề lên Web</button>
                </div>
            </div>
        `;

        bindAdminEditorEvents();
    }

    function renderQuestionEditorCardHTML(q, idx, paper) {
        const qNum = idx + 1;
        const matchedPassageIdx = (paper.passages || []).findIndex(pas => qNum >= Number(pas.fromQuestion) && qNum <= Number(pas.toQuestion));
        const matchedPassage = matchedPassageIdx >= 0 ? paper.passages[matchedPassageIdx] : null;

        let typeSpecificHTML = "";
        if (q.type === "mcq") {
            const correctKey = getCorrectMCQKey(q);
            const opts = q.options?.length ? q.options : [
                { key: "A", text: "" }, { key: "B", text: "" }, { key: "C", text: "" }, { key: "D", text: "" }
            ];
            typeSpecificHTML = `
                <div style="padding:12px 14px;border-radius:12px;background:rgba(55,217,255,0.06);border:1px solid rgba(55,217,255,0.22);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                    <div style="font-size:12.5px;">
                        <strong style="color:var(--cyan);">📖 Chế độ Đọc ngữ liệu của Câu ${qNum}:</strong>
                        ${matchedPassage
                            ? `<span>Đang thuộc <strong>Ngữ liệu #${matchedPassageIdx + 1} (Từ Câu ${matchedPassage.fromQuestion} đến Câu ${matchedPassage.toQuestion})</strong></span>`
                            : `<span>Câu độc lập (chưa gắn vào cụm đọc ngữ liệu nào)</span>`}
                    </div>
                    <button type="button" class="secondary-button small" data-action="editor-quick-passage-from-q" data-q-index="${idx}">
                        ${matchedPassage ? "⚙ Sửa khoảng câu Ngữ liệu" : "📖 + Gắn / Tạo Ngữ liệu từ câu này"}
                    </button>
                </div>
                <div class="editor-field">
                    <span>4 Phương án lựa chọn (Tích chọn đáp án đúng A / B / C / D):</span>
                    <div class="editor-mcq-options">
                        ${opts.map((o, oIdx) => {
                            const key = String(o.key || String.fromCharCode(65 + oIdx));
                            const isCorrect = normalizeText(correctKey) === normalizeText(key);
                            return `
                                <div class="editor-mcq-option-row ${isCorrect ? "is-correct" : ""}">
                                    <label class="editor-option-radio" title="Chọn ${escapeHTML(key)} làm đáp án đúng">
                                        <input type="radio" name="mcq_correct_${idx}" value="${escapeHTML(key)}" ${isCorrect ? "checked" : ""} data-q-mcq-correct="${idx}">
                                        <span>${escapeHTML(key)}</span>
                                    </label>
                                    <input type="text" class="editor-input" data-q-mcq-opt="${idx}" data-opt-index="${oIdx}" value="${escapeHTML(o.text)}" placeholder="Nội dung đáp án ${escapeHTML(key)}">
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
            `;
        } else if (q.type === "true_false") {
            const ansObj = isObject(q.answer) ? q.answer : {};
            const stmts = q.statements?.length ? q.statements : [
                { key: "a", text: "" }, { key: "b", text: "" }, { key: "c", text: "" }, { key: "d", text: "" }
            ];
            typeSpecificHTML = `
                <div class="editor-field">
                    <span>Các mệnh đề Đúng / Sai (Chọn Đúng hoặc Sai cho từng ý a, b, c, d):</span>
                    <div class="editor-tf-list">
                        ${stmts.map((s, sIdx) => {
                            const key = String(s.key || String.fromCharCode(97 + sIdx));
                            const isTrue = ansObj[key] !== false;
                            return `
                                <div class="editor-tf-row">
                                    <span class="editor-tf-key">${escapeHTML(key)}</span>
                                    <input type="text" class="editor-input" data-q-tf-text="${idx}" data-stmt-index="${sIdx}" value="${escapeHTML(s.text)}" placeholder="Nội dung mệnh đề ${escapeHTML(key)}">
                                    <select class="admin-select" style="min-width:110px;" data-q-tf-ans="${idx}" data-stmt-key="${escapeHTML(key)}">
                                        <option value="true" ${isTrue ? "selected" : ""}>✓ Đúng</option>
                                        <option value="false" ${!isTrue ? "selected" : ""}>✕ Sai</option>
                                    </select>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
            `;
        } else if (q.type === "matching") {
            const ansObj = isObject(q.answer) ? q.answer : {};
            const pairs = q.pairs?.length ? q.pairs : [];
            const rightOptions = pairs[0]?.options?.length ? pairs[0].options : [
                { key: "A", text: "" }, { key: "B", text: "" }, { key: "C", text: "" }, { key: "D", text: "" }, { key: "E", text: "" }
            ];
            typeSpecificHTML = `
                <div class="editor-matching-grid">
                    <div class="editor-matching-col">
                        <strong style="font-size:12px;color:var(--text-soft);">Cột trái (Các mục cần ghép & Đáp án đúng):</strong>
                        ${pairs.map((pair, pIdx) => {
                            const key = String(pair.key || (pIdx + 1));
                            const curAns = String(ansObj[key] ?? "");
                            return `
                                <div class="editor-matching-row">
                                    <span class="editor-tf-key">${escapeHTML(key)}</span>
                                    <input type="text" class="editor-input" data-q-match-left="${idx}" data-pair-index="${pIdx}" value="${escapeHTML(pair.left)}" placeholder="Vế trái ${escapeHTML(key)}">
                                    <select class="admin-select" style="min-width:95px;" data-q-match-ans="${idx}" data-pair-key="${escapeHTML(key)}">
                                        <option value="">-- Đáp án --</option>
                                        ${rightOptions.map(ro => `<option value="${escapeHTML(ro.key)}" ${curAns === String(ro.key) ? "selected" : ""}>Ghép ${escapeHTML(ro.key)}</option>`).join("")}
                                    </select>
                                </div>
                            `;
                        }).join("")}
                    </div>
                    <div class="editor-matching-col">
                        <strong style="font-size:12px;color:var(--text-soft);">Cột phải (Các phương án lựa chọn A, B, C, D, E...):</strong>
                        ${rightOptions.map((ro, rIdx) => `
                            <div class="editor-matching-row" style="grid-template-columns:34px 1fr;">
                                <span class="editor-tf-key">${escapeHTML(ro.key)}</span>
                                <input type="text" class="editor-input" data-q-match-right="${idx}" data-right-index="${rIdx}" value="${escapeHTML(ro.text)}" placeholder="Nội dung phương án ${escapeHTML(ro.key)}">
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        } else if (q.type === "short_answer") {
            const joined = (q.acceptedAnswers?.length ? q.acceptedAnswers : [q.answer]).filter(Boolean).join("; ");
            typeSpecificHTML = `
                <label class="editor-field">
                    <span>Đáp án đúng (Có thể nhập nhiều cách viết tương đương cách nhau bởi dấu chấm phẩy <code>;</code> — VD: <code>13.33; 13,33</code>):</span>
                    <input type="text" class="editor-input" data-q-short-ans="${idx}" value="${escapeHTML(joined)}" placeholder="Nhập đáp án trả lời ngắn...">
                </label>
            `;
        }

        return `
            <article class="question-editor-card" data-q-card="${idx}">
                <div class="question-editor-head">
                    <div class="question-editor-badge">
                        <strong>Câu ${qNum}</strong>
                        <span>${escapeHTML(typeLabel(q.type))}</span>
                        ${matchedPassage ? `<span style="background:var(--cyan-soft);color:var(--cyan);">📖 Ngữ liệu Câu ${matchedPassage.fromQuestion}–${matchedPassage.toQuestion}</span>` : ""}
                    </div>
                    <div class="question-editor-controls">
                        <select class="admin-select" style="min-width:190px;padding:6px 10px;font-size:12px;" data-q-type-change="${idx}">
                            <option value="mcq" ${q.type === "mcq" ? "selected" : ""}>◉ Trắc nghiệm 4 lựa chọn</option>
                            <option value="true_false" ${q.type === "true_false" ? "selected" : ""}>✓ Đúng / Sai (4 ý)</option>
                            <option value="matching" ${q.type === "matching" ? "selected" : ""}>⇄ Ghép hợp</option>
                            <option value="short_answer" ${q.type === "short_answer" ? "selected" : ""}>✎ Trả lời ngắn</option>
                        </select>
                        <button type="button" class="secondary-button small" data-action="editor-move-q" data-q-index="${idx}" data-dir="-1" ${idx === 0 ? "disabled" : ""} title="Chuyển lên">↑</button>
                        <button type="button" class="secondary-button small" data-action="editor-move-q" data-q-index="${idx}" data-dir="1" ${idx === paper.questions.length - 1 ? "disabled" : ""} title="Chuyển xuống">↓</button>
                        <button type="button" class="danger-button small" style="padding:6px 10px;font-size:12px;" data-action="editor-delete-q" data-q-index="${idx}" title="Xóa câu hỏi này">🗑 Xóa câu</button>
                    </div>
                </div>

                <label class="editor-field">
                    <span>Nội dung câu hỏi ${qNum} (Hỗ trợ công thức LaTeX $...$):</span>
                    <textarea class="editor-textarea" rows="3" data-q-field="text" data-q-index="${idx}" placeholder="Nhập đề bài câu hỏi ${qNum}...">${escapeHTML(q.text)}</textarea>
                </label>

                <!-- KHUNG TẢI ẢNH RIÊNG CHO TỪNG CÂU HỎI -->
                <div class="image-uploader-box ${q.image ? "has-image" : ""}">
                    <div class="image-uploader-actions">
                        <strong style="font-size:12.5px;">📷 Ảnh đính kèm của Câu ${qNum} (nếu câu này có ảnh):</strong>
                        <label class="secondary-button small file-upload-btn">
                            <span>📤 Tải ảnh cho Câu ${qNum}</span>
                            <input type="file" accept="image/*" data-q-image-upload="${idx}" hidden>
                        </label>
                        <input type="text" class="editor-input" style="max-width:300px;padding:7px 11px;font-size:12px;" data-q-field="image" data-q-index="${idx}" value="${escapeHTML(q.image?.startsWith("data:") ? "" : (q.image || ""))}" placeholder="Hoặc dán link ảnh / Ctrl+V dán ảnh vào câu này">
                        ${q.image ? `<button type="button" class="danger-button small" style="padding:6px 10px;font-size:11px;" data-action="editor-clear-q-image" data-q-index="${idx}">✕ Xóa ảnh câu này</button>` : ""}
                    </div>
                    ${q.image ? `
                        <div class="image-preview-box">
                            <img src="${escapeHTML(q.image)}" alt="Ảnh câu ${qNum}" data-action="zoom-image" data-src="${escapeHTML(q.image)}" data-caption="Ảnh minh họa Câu ${qNum}">
                            <div style="font-size:12px;">
                                <strong>Đã có ảnh cho Câu ${qNum}</strong>
                                <p style="margin:3px 0 0;color:#4e5970;">Bấm vào ảnh để phóng to hoặc tải ảnh khác để thay thế.</p>
                            </div>
                        </div>
                    ` : `<div style="font-size:11.5px;color:var(--text-muted);">Câu hỏi này chưa có ảnh riêng. Bấm "📤 Tải ảnh cho Câu ${qNum}" hoặc nhấn Ctrl+V khi đang đặt chuột tại câu này để dán ảnh từ clipboard.</div>`}
                </div>

                ${typeSpecificHTML}

                <label class="editor-field">
                    <span>💡 Giải thích / Lời giải chi tiết (Tùy chọn — hiển thị sau khi nộp bài):</span>
                    <input type="text" class="editor-input" data-q-field="explanation" data-q-index="${idx}" value="${escapeHTML(q.explanation || "")}" placeholder="Nhập lời giải hoặc hướng dẫn chấm cho câu ${qNum}...">
                </label>
            </article>
        `;
    }

    function bindAdminEditorEvents() {
        const root = DOM.adminExamEditorWrap;
        const p = state.admin.editingPaper;
        if (!root || !p) return;

        // Paper meta inputs
        $("#editorPaperTitle", root)?.addEventListener("input", e => { p.title = e.target.value; });
        $("#editorPaperCode", root)?.addEventListener("input", e => { p.code = e.target.value; });
        $("#editorPaperDuration", root)?.addEventListener("input", e => { p.durationMinutes = safeNumber(e.target.value, 50); });
        $("#editorPaperSourceTitle", root)?.addEventListener("input", e => { p.sourceTitle = e.target.value; });

        // Passage fields
        $$("[data-passage-field]", root).forEach(el => {
            const eventName = el.tagName === "SELECT" ? "change" : "input";
            el.addEventListener(eventName, () => {
                const idx = safeNumber(el.dataset.passageIndex, -1);
                const pas = p.passages[idx];
                if (!pas) return;
                const field = el.dataset.passageField;
                if (field === "fromQuestion" || field === "toQuestion") {
                    pas[field] = Math.max(1, safeNumber(el.value, 1));
                    if (pas.toQuestion < pas.fromQuestion) pas.toQuestion = pas.fromQuestion;
                    pas.title = `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${pas.fromQuestion} đến câu ${pas.toQuestion}:`;
                    syncPassagesToQuestions(p);
                    renderAdminExamEditor();
                } else {
                    pas[field] = el.value;
                    syncPassagesToQuestions(p);
                }
            });
        });

        // Passage image file upload
        $$("[data-passage-image-upload]", root).forEach(input => {
            input.addEventListener("change", async () => {
                const file = input.files?.[0];
                const idx = safeNumber(input.dataset.passageImageUpload, -1);
                if (!file || !p.passages[idx]) return;
                try {
                    const dataUrl = await readAndCompressImage(file);
                    p.passages[idx].image = dataUrl;
                    syncPassagesToQuestions(p);
                    renderAdminExamEditor();
                    showToast(`Đã tải ảnh cho Ngữ liệu #${idx + 1}.`, "success");
                } catch (err) {
                    showToast(err.message, "error");
                }
            });
        });

        // Question text / image URL / explanation fields
        $$("[data-q-field]", root).forEach(el => {
            el.addEventListener("input", () => {
                const idx = safeNumber(el.dataset.qIndex, -1);
                const q = p.questions[idx];
                if (!q) return;
                q[el.dataset.qField] = el.value;
            });
        });

        // Question type change
        $$("[data-q-type-change]", root).forEach(sel => {
            sel.addEventListener("change", () => {
                const idx = safeNumber(sel.dataset.qTypeChange, -1);
                const oldQ = p.questions[idx];
                if (!oldQ) return;
                const replacement = createBlankQuestion(sel.value, idx + 1, p.examKey);
                replacement.id = oldQ.id;
                replacement.text = oldQ.text;
                replacement.image = oldQ.image;
                replacement.explanation = oldQ.explanation;
                p.questions[idx] = replacement;
                syncPassagesToQuestions(p);
                renderAdminExamEditor();
            });
        });

        // Per-question image upload
        $$("[data-q-image-upload]", root).forEach(input => {
            input.addEventListener("change", async () => {
                const file = input.files?.[0];
                const idx = safeNumber(input.dataset.qImageUpload, -1);
                if (!file || !p.questions[idx]) return;
                try {
                    const dataUrl = await readAndCompressImage(file);
                    p.questions[idx].image = dataUrl;
                    renderAdminExamEditor();
                    showToast(`Đã tải ảnh cho Câu ${idx + 1}.`, "success");
                } catch (err) {
                    showToast(err.message, "error");
                }
            });
        });

        // Paste image (Ctrl+V) directly onto a question card
        $$("[data-q-card]", root).forEach(card => {
            card.addEventListener("paste", async e => {
                const items = Array.from(e.clipboardData?.items || []);
                const imgItem = items.find(it => it.type.startsWith("image/"));
                if (!imgItem) return;
                e.preventDefault();
                const idx = safeNumber(card.dataset.qCard, -1);
                const file = imgItem.getAsFile();
                if (!file || !p.questions[idx]) return;
                try {
                    const dataUrl = await readAndCompressImage(file);
                    p.questions[idx].image = dataUrl;
                    renderAdminExamEditor();
                    showToast(`Đã dán ảnh (Ctrl+V) vào Câu ${idx + 1}.`, "success");
                } catch (err) {
                    showToast(err.message, "error");
                }
            });
        });

        // MCQ options & correct answer
        $$("[data-q-mcq-opt]", root).forEach(input => {
            input.addEventListener("input", () => {
                const qIdx = safeNumber(input.dataset.qMcqOpt, -1);
                const oIdx = safeNumber(input.dataset.optIndex, -1);
                const q = p.questions[qIdx];
                if (q && q.options[oIdx]) q.options[oIdx].text = input.value;
            });
        });
        $$("[data-q-mcq-correct]", root).forEach(radio => {
            radio.addEventListener("change", () => {
                const qIdx = safeNumber(radio.dataset.qMcqCorrect, -1);
                const q = p.questions[qIdx];
                if (!q) return;
                q.answer = radio.value;
                const card = radio.closest(".question-editor-card");
                card?.querySelectorAll(".editor-mcq-option-row").forEach(row => {
                    const r = row.querySelector('input[type="radio"]');
                    row.classList.toggle("is-correct", Boolean(r?.checked));
                });
            });
        });

        // True/False statements & answers
        $$("[data-q-tf-text]", root).forEach(input => {
            input.addEventListener("input", () => {
                const qIdx = safeNumber(input.dataset.qTfText, -1);
                const sIdx = safeNumber(input.dataset.stmtIndex, -1);
                const q = p.questions[qIdx];
                if (q && q.statements[sIdx]) q.statements[sIdx].text = input.value;
            });
        });
        $$("[data-q-tf-ans]", root).forEach(sel => {
            sel.addEventListener("change", () => {
                const qIdx = safeNumber(sel.dataset.qTfAns, -1);
                const key = sel.dataset.stmtKey;
                const q = p.questions[qIdx];
                if (!q) return;
                if (!isObject(q.answer)) q.answer = {};
                q.answer[key] = sel.value === "true";
            });
        });

        // Matching left, right, answer
        $$("[data-q-match-left]", root).forEach(input => {
            input.addEventListener("input", () => {
                const qIdx = safeNumber(input.dataset.qMatchLeft, -1);
                const pIdx = safeNumber(input.dataset.pairIndex, -1);
                const q = p.questions[qIdx];
                if (q && q.pairs[pIdx]) q.pairs[pIdx].left = input.value;
            });
        });
        $$("[data-q-match-right]", root).forEach(input => {
            input.addEventListener("input", () => {
                const qIdx = safeNumber(input.dataset.qMatchRight, -1);
                const rIdx = safeNumber(input.dataset.rightIndex, -1);
                const q = p.questions[qIdx];
                if (!q) return;
                q.pairs.forEach(pair => {
                    if (pair.options[rIdx]) pair.options[rIdx].text = input.value;
                });
            });
        });
        $$("[data-q-match-ans]", root).forEach(sel => {
            sel.addEventListener("change", () => {
                const qIdx = safeNumber(sel.dataset.qMatchAns, -1);
                const key = sel.dataset.pairKey;
                const q = p.questions[qIdx];
                if (!q) return;
                if (!isObject(q.answer)) q.answer = {};
                q.answer[key] = sel.value;
            });
        });

        // Short answer
        $$("[data-q-short-ans]", root).forEach(input => {
            input.addEventListener("input", () => {
                const qIdx = safeNumber(input.dataset.qShortAns, -1);
                const q = p.questions[qIdx];
                if (!q) return;
                const parts = input.value.split(";").map(s => s.trim()).filter(Boolean);
                q.acceptedAnswers = parts.length ? parts : [input.value.trim()];
                q.answer = q.acceptedAnswers[0] || "";
            });
        });
    }

    async function saveAdminEditingPaper() {
        const p = state.admin.editingPaper;
        if (!p || state.admin.isSaving) return;
        syncPassagesToQuestions(p);

        if (!String(p.title || "").trim()) {
            return showToast("Vui lòng nhập tên đề thi.", "warning");
        }
        if (!p.questions.length) {
            return showToast("Đề thi phải có ít nhất 1 câu hỏi.", "warning");
        }

        const btn = $("#adminSavePaperBtn");
        state.admin.isSaving = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = "⏳ Đang lưu lên Web...";
        }

        try {
            // Save to local cache immediately
            p.isCloud = true;
            p.updatedAt = Date.now();
            saveLocalCustomExam(p);

            // Save to Neon PostgreSQL via API
            try {
                const res = await apiPost("/api/admin/exams", p);
                if (res?.item) {
                    state.admin.editingPaper = res.item;
                    saveLocalCustomExam(res.item);
                }
                showToast("Đã lưu đề trực tiếp lên Web (Database) thành công!", "success", 3500);
            } catch (apiErr) {
                console.warn("[My Exam] Server save fallback to localStorage:", apiErr);
                showToast("Đã lưu đề trên trình duyệt (Chế độ Local). Khi kết nối Database trên Vercel sẽ tự đồng bộ.", "success", 4000);
            }
            playSound("success");
        } finally {
            state.admin.isSaving = false;
            if (btn) {
                btn.disabled = false;
                btn.textContent = "💾 Lưu đề trực tiếp lên Web";
            }
        }
    }

    function exportPaperAsJSON(paper) {
        if (!paper) return;
        syncPassagesToQuestions(paper);
        const exportObj = {
            exam: paper.examKey,
            subject: paper.subjectKey,
            title: paper.title,
            sourceTitle: paper.sourceTitle || "",
            sourceCode: paper.code || "",
            durationMinutes: paper.durationMinutes,
            maxScore: paper.maxScore,
            passages: paper.passages || [],
            questions: paper.questions
        };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(paper.code || "de_thi").replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("Đã tải xuống file JSON.", "success");
    }

    /* ---------------- Confetti ---------------- */
    let confettiRaf = 0;
    function resetConfettiCanvas() {
        if (!DOM.confettiCanvas) return;
        const rect = DOM.confettiCanvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        DOM.confettiCanvas.width = Math.max(1, Math.floor((rect.width || window.innerWidth) * dpr));
        DOM.confettiCanvas.height = Math.max(1, Math.floor((rect.height || 500) * dpr));
        DOM.confettiCanvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function startConfetti() {
        if (!DOM.resultCelebration || !DOM.confettiCanvas) return;
        DOM.resultCelebration.classList.remove("hidden");
        resetConfettiCanvas();
        cancelAnimationFrame(confettiRaf);
        const canvas = DOM.confettiCanvas;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const width = rect.width || window.innerWidth;
        const height = rect.height || 500;
        const particles = Array.from({ length: 150 }, (_, i) => ({
            x: Math.random() * width,
            y: -20 - Math.random() * height * 0.4,
            vx: (Math.random() - 0.5) * 2.8,
            vy: 2 + Math.random() * 4.5,
            size: 4 + Math.random() * 7,
            rotation: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.18,
            hue: (i * 19 + Math.random() * 80) % 360
        }));
        let frame = 0;
        const draw = () => {
            frame++;
            ctx.clearRect(0, 0, width, height);
            particles.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.rotation += p.vr;
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.globalAlpha = 0.9;
                ctx.fillStyle = `hsl(${p.hue} 90% 68%)`;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
                ctx.restore();
            });
            if (frame < 220) confettiRaf = requestAnimationFrame(draw);
            else ctx.clearRect(0, 0, width, height);
        };
        draw();
    }

    /* ---------------- Global Events ---------------- */
    function bindGlobalEvents() {
        document.addEventListener("click", async event => {
            const target = event.target.closest?.("[data-action]");
            if (!target) return;
            const action = target.dataset.action;

            if (action === "zoom-image") {
                openLightbox(target.dataset.src || target.getAttribute("src"), target.dataset.caption);
                return;
            }
            if (action === "close-lightbox") {
                closeLightbox();
                return;
            }
            if (action === "confirm-submit") {
                await submitExam("manual");
                return;
            }
            if (!currentUser && !["toggle-theme", "close-lightbox"].includes(action)) return;

            switch (action) {
                case "go-home": goHome(); break;
                case "open-exams": openExamSelector(state.examKey || "vsat"); break;
                case "open-history": await syncHistoryFromServer(); openHistory(); break;
                case "select-exam": openExamSelector(target.dataset.exam); break;
                case "choose-subject": await chooseSubject(target.dataset.exam, target.dataset.subject); break;
                case "start-paper": {
                    const exKey = target.dataset.exam || state.examKey || "vsat";
                    const subKey = target.dataset.subject || state.subjectKey || "sinh";
                    const subName = getSubjectConfig(exKey, subKey)?.name || subKey;
                    await startExam(exKey, subKey, subName, target.dataset.paperId || "__random__");
                    break;
                }
                case "resume-saved-session": {
                    const saved = getSavedSession();
                    if (saved) resumeSession(saved);
                    break;
                }
                case "open-guide": openGuide(); break;
                case "toggle-theme": toggleTheme(); break;
                case "toggle-passage-layout": togglePassageLayout(); break;
                case "toggle-sidebar": toggleSidebar(); break;
                case "toggle-flag": toggleFlag(); break;
                case "prev-question": prevQuestion(); break;
                case "next-question": nextQuestion(); break;
                case "jump-question": goToQuestion(target.dataset.index); break;
                case "finish-exam": openSubmitModal(); break;
                case "close-modal": closeModals(); break;
                case "retry-exam": await retryExam(); break;
                case "open-history-result": {
                    const history = loadHistory();
                    renderHistoricalResult(history[safeNumber(target.dataset.historyIndex, -1)]);
                    break;
                }
                case "open-profile": await openProfile(); break;
                case "logout": await logout(); break;
                case "close-profile": document.getElementById("profileModal")?.remove(); break;

                /* Admin Studio Actions */
                case "open-exam-studio":
                case "open-admin":
                    await openAdminStudio(target.dataset.exam || state.examKey, target.dataset.subject || state.subjectKey, "exams");
                    break;
                case "open-admin-users":
                    await openAdminStudio(state.examKey, state.subjectKey, "users");
                    break;
                case "admin-switch-tab":
                    switchAdminTab(target.dataset.tab);
                    break;
                case "admin-create-new-exam": {
                    const newPaper = createNewPaperTemplate(state.admin.examKey, state.admin.subjectKey);
                    openPaperInAdminEditor(newPaper);
                    showToast("Đã khởi tạo khung đề mới. Bạn có thể sửa câu hỏi, tải ảnh và bấm Lưu.", "info", 3200);
                    break;
                }
                case "admin-new-for-subject": {
                    const ex = target.dataset.exam || state.examKey || "vsat";
                    const sub = target.dataset.subject || state.subjectKey || "sinh";
                    await openAdminStudio(ex, sub, "exams");
                    const newPaper = createNewPaperTemplate(ex, sub);
                    openPaperInAdminEditor(newPaper);
                    break;
                }
                case "admin-edit-paper": {
                    const ex = target.dataset.exam || state.examKey || "vsat";
                    const sub = target.dataset.subject || state.subjectKey || "sinh";
                    const pid = target.dataset.paperId;
                    await openAdminStudio(ex, sub, "exams");
                    const found = state.admin.papers.find(p => p.id === pid);
                    if (found) openPaperInAdminEditor(found);
                    break;
                }
                case "edit-current-exam": {
                    if (isAdmin() && state.currentPaperObj) {
                        stopTimer();
                        stopAutosave();
                        await openAdminStudio(state.examKey, state.subjectKey, "exams");
                        openPaperInAdminEditor(state.currentPaperObj);
                    }
                    break;
                }
                case "admin-open-editor": {
                    const idx = safeNumber(target.dataset.paperIndex, -1);
                    const paper = state.admin.papers[idx];
                    if (paper) openPaperInAdminEditor(paper);
                    break;
                }
                case "admin-close-editor":
                    closeAdminEditor();
                    break;
                case "admin-save-paper":
                    await saveAdminEditingPaper();
                    break;
                case "admin-export-json": {
                    const idx = safeNumber(target.dataset.paperIndex, -1);
                    exportPaperAsJSON(state.admin.papers[idx]);
                    break;
                }
                case "admin-export-current-json":
                    exportPaperAsJSON(state.admin.editingPaper);
                    break;
                case "admin-delete-paper": {
                    const idx = safeNumber(target.dataset.paperIndex, -1);
                    const paper = state.admin.papers[idx];
                    if (!paper) break;
                    if (!window.confirm(`Bạn có chắc muốn xóa đề "${paper.title}" không?`)) break;
                    paper.isDeleted = true;
                    saveLocalCustomExam(paper);
                    try {
                        await apiDelete(`/api/admin/exams/${encodeURIComponent(paper.id)}?soft=1&exam=${encodeURIComponent(paper.examKey)}&subject=${encodeURIComponent(paper.subjectKey)}&sourceFile=${encodeURIComponent(paper.sourceFile || "")}`);
                    } catch (_) {}
                    showToast(`Đã xóa đề "${paper.title}".`, "info");
                    await refreshAdminExamList();
                    break;
                }
                case "editor-add-passage": {
                    const p = state.admin.editingPaper;
                    if (!p) break;
                    const mcqNums = p.questions.map((q, i) => q.type === "mcq" ? i + 1 : null).filter(Boolean);
                    const defFrom = mcqNums[0] || 1;
                    const defTo = mcqNums[Math.min(2, mcqNums.length - 1)] || defFrom;
                    p.passages.push({
                        id: uid("passage"),
                        fromQuestion: defFrom,
                        toQuestion: defTo,
                        title: `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${defFrom} đến câu ${defTo}:`,
                        text: "",
                        image: ""
                    });
                    syncPassagesToQuestions(p);
                    renderAdminExamEditor();
                    showToast(`Đã thêm Cụm Đọc Ngữ Liệu mới (Câu ${defFrom} → Câu ${defTo}).`, "success");
                    break;
                }
                case "editor-delete-passage": {
                    const p = state.admin.editingPaper;
                    const idx = safeNumber(target.dataset.passageIndex, -1);
                    if (!p || !p.passages[idx]) break;
                    p.passages.splice(idx, 1);
                    syncPassagesToQuestions(p);
                    renderAdminExamEditor();
                    showToast("Đã xóa cụm ngữ liệu.", "info");
                    break;
                }
                case "editor-clear-passage-image": {
                    const p = state.admin.editingPaper;
                    const idx = safeNumber(target.dataset.passageIndex, -1);
                    if (!p || !p.passages[idx]) break;
                    p.passages[idx].image = "";
                    syncPassagesToQuestions(p);
                    renderAdminExamEditor();
                    break;
                }
                case "editor-quick-passage-from-q": {
                    const p = state.admin.editingPaper;
                    const qIdx = safeNumber(target.dataset.qIndex, -1);
                    if (!p || !p.questions[qIdx]) break;
                    const qNum = qIdx + 1;
                    const existing = p.passages.find(pas => qNum >= pas.fromQuestion && qNum <= pas.toQuestion);
                    if (!existing) {
                        const toNum = Math.min(p.questions.length, qNum + 2);
                        p.passages.push({
                            id: uid("passage"),
                            fromQuestion: qNum,
                            toQuestion: toNum,
                            title: `Đọc ngữ liệu sau và trả lời các câu hỏi từ câu ${qNum} đến câu ${toNum}:`,
                            text: "",
                            image: ""
                        });
                        syncPassagesToQuestions(p);
                        renderAdminExamEditor();
                    }
                    const managerCard = $(".passage-manager-card", DOM.adminExamEditorWrap);
                    managerCard?.scrollIntoView({ behavior: "smooth", block: "center" });
                    showToast(`Hãy chỉnh khoảng câu (Từ câu ... đến câu ...) và nhập nội dung ngữ liệu ở khung Ngữ liệu.`, "info", 3200);
                    break;
                }
                case "editor-filter-part": {
                    state.admin.partFilter = target.dataset.filter || "all";
                    renderAdminExamEditor();
                    break;
                }
                case "admin-add-question": {
                    const p = state.admin.editingPaper;
                    if (!p) break;
                    const defaultType = state.admin.partFilter !== "all" ? state.admin.partFilter : "mcq";
                    const newQ = createBlankQuestion(defaultType, p.questions.length + 1, p.examKey);
                    p.questions.push(newQ);
                    syncPassagesToQuestions(p);
                    renderAdminExamEditor();
                    showToast(`Đã thêm Câu ${p.questions.length} (${typeLabel(defaultType)}).`, "success");
                    break;
                }
                case "editor-move-q": {
                    const p = state.admin.editingPaper;
                    const idx = safeNumber(target.dataset.qIndex, -1);
                    const dir = safeNumber(target.dataset.dir, 0);
                    const nextIdx = idx + dir;
                    if (!p || idx < 0 || nextIdx < 0 || nextIdx >= p.questions.length) break;
                    [p.questions[idx], p.questions[nextIdx]] = [p.questions[nextIdx], p.questions[idx]];
                    syncPassagesToQuestions(p);
                    renderAdminExamEditor();
                    break;
                }
                case "editor-delete-q": {
                    const p = state.admin.editingPaper;
                    const idx = safeNumber(target.dataset.qIndex, -1);
                    if (!p || !p.questions[idx]) break;
                    if (p.questions.length <= 1) return showToast("Đề phải có ít nhất 1 câu hỏi.", "warning");
                    p.questions.splice(idx, 1);
                    syncPassagesToQuestions(p);
                    renderAdminExamEditor();
                    break;
                }
                case "editor-clear-q-image": {
                    const p = state.admin.editingPaper;
                    const idx = safeNumber(target.dataset.qIndex, -1);
                    if (!p || !p.questions[idx]) break;
                    p.questions[idx].image = "";
                    renderAdminExamEditor();
                    break;
                }
                default:
                    break;
            }
        });

        // Admin user lock/unlock button
        document.addEventListener("click", async event => {
            const b = event.target.closest?.("[data-admin-id]");
            if (!b) return;
            try {
                await apiPatch(`/api/admin/users/${encodeURIComponent(b.dataset.adminId)}`, { status: b.dataset.adminStatus });
                showToast('Đã cập nhật trạng thái tài khoản.', 'success');
                loadStudioAdminUsers();
            } catch (e) {
                showToast(e.message, 'error', 5000);
            }
        });

        // Admin Studio filter changes
        DOM.adminFilterExam?.addEventListener("change", async () => {
            populateAdminSubjectSelect(DOM.adminFilterExam.value, null);
            closeAdminEditor();
        });
        DOM.adminFilterSubject?.addEventListener("change", async () => {
            state.admin.subjectKey = DOM.adminFilterSubject.value;
            closeAdminEditor();
        });

        // Admin Import JSON file input
        DOM.adminImportJsonInput?.addEventListener("change", async () => {
            const file = DOM.adminImportJsonInput.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const raw = JSON.parse(text);
                const examKey = String(raw.exam || raw.examKey || state.admin.examKey || "vsat").toLowerCase();
                const subjectKey = String(raw.subject || raw.subjectKey || state.admin.subjectKey || "sinh").toLowerCase();
                populateAdminSubjectSelect(examKey, subjectKey);

                const passages = normalizePassages(raw.passages || [], "");
                const rawQuestions = extractQuestionArray(raw, {});
                const questions = rawQuestions.map((q, idx) => normalizeQuestion(q, idx, file.name, examKey, passages));
                if (!questions.length) throw new Error("File JSON không chứa danh sách câu hỏi hợp lệ.");

                const importedPaper = {
                    id: `exam_${examKey}_${subjectKey}_${Date.now()}`,
                    examKey,
                    subjectKey,
                    code: String(raw.sourceCode || raw.code || file.name.replace(/\.json$/i, "")),
                    title: String(raw.title || `Đề nhập từ ${file.name}`),
                    sourceTitle: String(raw.sourceTitle || `Nhập từ ${file.name}`),
                    sourceFile: "",
                    isCloud: true,
                    durationMinutes: Number(raw.durationMinutes) || getDurationMinutes(examKey, subjectKey),
                    maxScore: Number(raw.maxScore) || (getExamConfig(examKey)?.maxScore || 150),
                    passages,
                    questions
                };
                openPaperInAdminEditor(importedPaper);
                showToast(`Đã nạp ${questions.length} câu hỏi từ "${file.name}". Kiểm tra và bấm Lưu lên Web!`, "success", 4000);
            } catch (err) {
                showToast(`Lỗi đọc file JSON: ${err.message}`, "error", 5000);
            } finally {
                DOM.adminImportJsonInput.value = "";
            }
        });

        // Studio Create User Form
        DOM.studioCreateUserForm?.addEventListener("submit", async e => {
            e.preventDefault();
            try {
                await apiPost('/api/admin/users', {
                    fullName: $('#studioNewFullName').value.trim(),
                    username: $('#studioNewUsername').value.trim(),
                    password: $('#studioNewPassword').value
                });
                e.target.reset();
                showToast('Đã cấp tài khoản học sinh mới.', 'success');
                loadStudioAdminUsers();
            } catch (err) {
                showToast(err.message, 'error', 5000);
            }
        });

        DOM.globalOverlay?.addEventListener("click", closeModals);
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") { closeModals(); closeSidebar(); }
            if (state.screen !== "exam" || state.hasSubmitted || state.isSubmitting) return;
            if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA" || event.target?.tagName === "SELECT") return;
            if (event.key === "ArrowLeft") { event.preventDefault(); prevQuestion(); }
            if (event.key === "ArrowRight") { event.preventDefault(); nextQuestion(); }
        });
        window.addEventListener("beforeunload", saveSession);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && state.screen === "exam" && !state.hasSubmitted) updateTimerUI();
        });
        window.addEventListener("resize", () => {
            if (!DOM.resultCelebration?.classList.contains("hidden")) resetConfettiCanvas();
        });
        document.addEventListener("pointerdown", () => getAudioContext(), { once: true, passive: true });
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

    async function retryExam() {
        if (!state.examKey || !state.subjectKey) return openExamSelector("vsat");
        await startExam(
            state.examKey,
            state.subjectKey,
            state.subjectName || getSubjectConfig(state.examKey, state.subjectKey)?.name || "Môn học",
            state.selectedPaperId || "__random__"
        );
    }

    function bindHashNavigation() {
        window.addEventListener("popstate", () => {
            const hash = location.hash.replace(/^#/, "");
            if (hash === "history") openHistory();
            else if (hash === "exam-selection") openExamSelector(state.examKey || "vsat");
            else if (hash === "admin-studio" && isAdmin()) openAdminStudio();
            else setActiveScreen("home", false);
        });
    }

    async function boot() {
        cacheDOM();
        initTheme();
        bindGlobalEvents();
        bindHashNavigation();
        if (DOM.currentYear) DOM.currentYear.textContent = String(new Date().getFullYear());
        const historyScreen = document.getElementById('historyScreen');
        if (historyScreen && !document.getElementById('accountStatsPanel')) {
            const panel = document.createElement('div');
            panel.id = 'accountStatsPanel';
            panel.className = 'account-stats-panel';
            const list = document.getElementById('historyList');
            list?.parentNode?.insertBefore(panel, list);
        }
        await authBoot();
        if (currentUser) {
            await syncHistoryFromServer();
            renderHistory();
        } else {
            renderHistory();
        }
        setActiveScreen("home", false);

        const saved = getSavedSession();
        if (saved) {
            state.pendingResumeSession = saved;
            const exam = getExamConfig(saved.examKey);
            const subject = getSubjectConfig(saved.examKey, saved.subjectKey);
            if (exam && subject) {
                showToast(`Có phiên ${exam.name} — ${subject.name} chưa hoàn thành.`, "warning", 4500);
            }
        }
        ensureMathJax().catch(() => {});
    }

    window.MyExamApp = {
        state,
        exams: EXAMS,
        loadSubjectPapers,
        calculateResult,
        clearHistory,
        getDurationMinutes,
        openAdminStudio
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
