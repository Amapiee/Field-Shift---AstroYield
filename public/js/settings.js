// =============================================================================
// ⚙️ FARMSHIFT — End-User Settings, Theme, Layout & Full i18n (public/js/settings.js)
// =============================================================================

const I18N_DICT = {
  vi: {
    // Settings Modal
    settings_title: "⚙️ Cấu hình Ưu tiên & Hệ thống",
    stab_weights: "⚖️ Trọng số Canh tác",
    stab_ui: "🎨 Giao diện & Ngôn ngữ",
    weights_label: "⚖️ Trọng số Ưu tiên Canh tác",
    w_soil: "🌱 Bảo vệ Đất",
    w_water: "💧 Tiết kiệm Nước",
    w_profit: "💰 Tối đa Lợi nhuận",
    lang_label: "🌐 Ngôn ngữ hiển thị",
    theme_color_label: "🎨 Màu sắc chủ đạo (Theme Color)",
    ui_style_label: "✨ Phong cách Giao diện (Visual Style)",
    style_glass: "✨ Kính mờ (Glass)",
    style_hud: "🛡️ Sci-Fi HUD (Sắc nét)",
    layout_label: "🖥️ Bố cục & Kích thước (Layout)",
    layout_normal: "⬅️ Bố cục Chuẩn",
    layout_swap: "🔄 Đảo Trái / Phải",
    density_std: "📐 Kích thước Chuẩn",
    density_compact: "🔍 Thu gọn (Compact)",
    btn_reset: "🔄 Khôi phục giao diện mặc định",

    // Left Panel & Accordions
    panel_head: "🌾 Cấu hình Canh tác",
    acc_rotation: "Kế hoạch Luân canh",
    acc_location: "Tìm vị trí & Bản đồ",
    acc_coords: "Tọa độ Chi tiết",
    acc_heatmap: "Heatmap Khí hậu",
    acc_alerts: "Cảnh báo Thiên tai",
    season_1: "<span>Vụ Xuân</span> (Tháng 1–4)",
    season_2: "<span>Vụ Hè Thu</span> (Tháng 5–8)",
    season_3: "<span>Vụ Đông</span> (Tháng 9–12)",

    // Crops in <select>
    crops: {
      Rice: "🌾 Lúa Nước (Rice)",
      Soybean: "🌱 Đậu Tương (Soybean)",
      Peanut: "🥜 Lạc/Đậu (Peanut)",
      Maize: "🌽 Ngô (Maize)",
      Veggies: "🥬 Rau Màu (Veggies)",
      Fallow: "🏜️ Nghỉ Đất (Fallow)"
    },

    // Search, Map & Coords
    search_placeholder: "Phú Xuyên, Hà Nội, California…",
    btn_search: "🔍 Tìm",
    layer_pure: "🌍 Thuần",
    btn_random: "🎲 Thử vị trí ngẫu nhiên",

    // Heatmap Controls
    heat_toggle_text: "Hiện heatmap toàn cầu",
    heat_metric_label: "Chỉ số",
    heat_time_label: "📅 Thời gian",
    heat_opacity_label: "🔆 Độ đậm",
    heat_invert_text: " Đảo màu (nhiều = xanh, ít = đỏ)",
    heat_legend_mid: "ít → nhiều",

    // Footer Buttons & Map Hint
    btn_run: "⚛️ CHẠY PHÂN TÍCH QUANTUM",
    btn_trade: "🚚 TÍNH TUYẾN ĐƯỜNG THU MUA",
    map_hint: "🖱️ Nhấp vào bất kỳ đâu trên bản đồ để đặt vị trí nông trại",

    // Right Panel (Telemetry & Quantum Arena)
    tab_telemetry: "📡 Dữ liệu Vệ tinh",
    tab_arena: "⚛️ Đấu trường Quantum",
    match_label: "⚛️ Điểm Tương Thích Lượng Tử",
    match_desc_init: "Chạy phân tích để so sánh các chiến lược",
    user_strat_label: "🎮 Chiến lược của Bạn",
    user_tags_init: "Chọn cây trồng và bấm chạy phân tích…",
    q_strat_label: "⚛️ Lượng tử AI Tối ưu",
    q_method_init: "Đang chờ phân tích…",
    radar_title: "🕸️ BIỂU ĐỒ RADAR SO SÁNH CHIẾN LƯỢC",
    chart_temp_title: "🌡️ BIÊN ĐỘ NHIỆT ĐỘ (12 Tháng)",
    chart_rain_title: "🌧️ LƯỢNG MƯA + 💧 ĐỘ ẨM ĐẤT",
    chart_ndvi_title: "🌿 CHỈ SỐ THỰC VẬT NDVI"
  },

  en: {
    // Settings Modal
    settings_title: "⚙️ System & Priority Settings",
    stab_weights: "⚖️ Farming Weights",
    stab_ui: "🎨 Theme & Language",
    weights_label: "⚖️ Farming Priority Weights",
    w_soil: "🌱 Soil Protection",
    w_water: "💧 Water Conservation",
    w_profit: "💰 Maximize Profit",
    lang_label: "🌐 Display Language",
    theme_color_label: "🎨 Accent Theme Color",
    ui_style_label: "✨ Visual UI Style",
    style_glass: "✨ Glassmorphism",
    style_hud: "🛡️ Sci-Fi HUD (Sharp)",
    layout_label: "🖥️ Panel Layout & Density",
    layout_normal: "⬅️ Standard Layout",
    layout_swap: "🔄 Swap Left / Right",
    density_std: "📐 Standard Size",
    density_compact: "🔍 Compact Mode",
    btn_reset: "🔄 Reset to Default Settings",

    // Left Panel & Accordions
    panel_head: "🌾 Farming Configuration",
    acc_rotation: "Crop Rotation Plan",
    acc_location: "Location & Map Layers",
    acc_coords: "Detailed Coordinates",
    acc_heatmap: "Global Climate Heatmap",
    acc_alerts: "Weather & Disaster Alerts",
    season_1: "<span>Spring Crop</span> (Jan–Apr)",
    season_2: "<span>Summer-Autumn</span> (May–Aug)",
    season_3: "<span>Winter Crop</span> (Sep–Dec)",

    // Crops in <select>
    crops: {
      Rice: "🌾 Paddy Rice",
      Soybean: "🌱 Soybean",
      Peanut: "🥜 Peanut / Legume",
      Maize: "🌽 Maize (Corn)",
      Veggies: "🥬 Vegetables",
      Fallow: "🏜️ Fallow (Rest Soil)"
    },

    // Search, Map & Coords
    search_placeholder: "Search city, province, coordinates…",
    btn_search: "🔍 Search",
    layer_pure: "🌍 Pure",
    btn_random: "🎲 Try Random Farm Location",

    // Heatmap Controls
    heat_toggle_text: "Show global climate heatmap",
    heat_metric_label: "Metric",
    heat_time_label: "📅 Timeframe",
    heat_opacity_label: "🔆 Opacity",
    heat_invert_text: " Invert colors (high = blue, low = red)",
    heat_legend_mid: "low → high",

    // Footer Buttons & Map Hint
    btn_run: "⚛️ RUN QUANTUM ANALYSIS",
    btn_trade: "🚚 CALCULATE TRADE ROUTES",
    map_hint: "🖱️ Click anywhere on the map to place your farm marker",

    // Right Panel (Telemetry & Quantum Arena)
    tab_telemetry: "📡 Satellite Telemetry",
    tab_arena: "⚛️ Quantum Arena",
    match_label: "⚛️ Quantum Match Score",
    match_desc_init: "Run analysis to compare strategies",
    user_strat_label: "🎮 Your Strategy",
    user_tags_init: "Select crops and run analysis…",
    q_strat_label: "⚛️ Quantum AI Optimal",
    q_method_init: "Waiting for analysis…",
    radar_title: "🕸️ STRATEGY RADAR COMPARISON",
    chart_temp_title: "🌡️ TEMPERATURE PROFILE (12 Months)",
    chart_rain_title: "🌧️ RAINFALL + 💧 SOIL MOISTURE",
    chart_ndvi_title: "🌿 NDVI VEGETATION INDEX"
  }
};

function switchSettingsTab(paneId, btnEl) {
  document.querySelectorAll('#settings-modal .stab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#settings-modal .stab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(paneId)?.classList.add('active');
  btnEl?.classList.add('active');
}

const AppSettings = {
  storageKey: 'farmshift_user_prefs_v2',
  state: {
    lang: 'vi',
    themeHex: '#10b981',
    themeRgb: '16, 185, 129',
    uiStyle: 'glass',
    layoutSwap: false,
    compact: false
  },

  init() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) this.state = { ...this.state, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }

    this.setTheme(this.state.themeHex, this.state.themeRgb);
    this.setUIStyle(this.state.uiStyle);
    this.setLayoutSwap(this.state.layoutSwap);
    this.setCompact(this.state.compact);
    this.setLanguage(this.state.lang);
  },

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {}
  },

  // 1. Đổi màu sắc chủ đạo
  setTheme(hex, rgb) {
    this.state.themeHex = hex;
    this.state.themeRgb = rgb;
    document.documentElement.style.setProperty('--teal', hex);
    document.documentElement.style.setProperty('--primary-rgb', rgb);

    document.querySelectorAll('.theme-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-hex') === hex);
    });
    this.save();
  },

  // 2. Đổi kiểu dáng CSS (Glassmorphism vs Sci-Fi HUD)
  setUIStyle(style) {
    this.state.uiStyle = style;
    document.body.classList.toggle('ui-hud', style === 'hud');
    document.getElementById('btn-style-glass')?.classList.toggle('active', style === 'glass');
    document.getElementById('btn-style-hud')?.classList.toggle('active', style === 'hud');
    this.save();
  },

  // 3. Đảo vị trí 2 bảng Trái / Phải
  setLayoutSwap(isSwapped) {
    this.state.layoutSwap = Boolean(isSwapped);
    document.body.classList.toggle('layout-swap', this.state.layoutSwap);
    document.getElementById('btn-layout-normal')?.classList.toggle('active', !this.state.layoutSwap);
    document.getElementById('btn-layout-swap')?.classList.toggle('active', this.state.layoutSwap);
    this.save();
  },

  // 4. Chế độ Thu gọn (Compact Mode)
  setCompact(isCompact) {
    this.state.compact = Boolean(isCompact);
    document.body.classList.toggle('layout-compact', this.state.compact);
    document.getElementById('btn-density-std')?.classList.toggle('active', !this.state.compact);
    document.getElementById('btn-density-compact')?.classList.toggle('active', this.state.compact);
    this.save();
  },

  // 5. Dịch toàn bộ giao diện (i18n)
  setLanguage(lang) {
    if (!I18N_DICT[lang]) lang = 'vi';
    this.state.lang = lang;
    document.documentElement.lang = lang;
    const d = I18N_DICT[lang];

    const langSelect = document.getElementById('setting-lang');
    if (langSelect) langSelect.value = lang;

    // Dịch các thẻ có thuộc tính [data-i18n]
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (d[key]) el.textContent = d[key];
    });

    // Dịch tiêu đề 5 thẻ Accordion bên trái
    const accTitles = document.querySelectorAll('#left-panel .acc-btn-title span:last-child');
    const accKeys = ['acc_rotation', 'acc_location', 'acc_coords', 'acc_heatmap', 'acc_alerts'];
    accTitles.forEach((span, idx) => {
      if (d[accKeys[idx]]) span.textContent = d[accKeys[idx]];
    });

    // Dịch nhãn 3 mùa vụ
    const seasonLabels = document.querySelectorAll('#left-panel .acc-card:first-child .select-label');
    if (seasonLabels[0]) seasonLabels[0].innerHTML = d.season_1;
    if (seasonLabels[1]) seasonLabels[1].innerHTML = d.season_2;
    if (seasonLabels[2]) seasonLabels[2].innerHTML = d.season_3;

    // Dịch tên các loại cây trồng trong cả 3 thẻ <select>
    ['crop-s1', 'crop-s2', 'crop-s3'].forEach(selectId => {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      Array.from(sel.options).forEach(opt => {
        if (d.crops[opt.value]) opt.textContent = d.crops[opt.value];
      });
    });

    // Dịch ô tìm kiếm & nút bấm bên trái
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.placeholder = d.search_placeholder;

    const textMap = {
      '#left-panel .panel-head h2': d.panel_head,
      '#btn-search': d.btn_search,
      '#btn-layer-pure': d.layer_pure,
      '#left-panel .coord-box + .btn-random': d.btn_random,
      '.heat-switch-text': d.heat_toggle_text,
      '#heat-controls .select-label span': d.heat_metric_label,
      '#btn-run': d.btn_run,
      '#btn-trade-route': d.btn_trade,
      '#map-hint': d.map_hint,
      '.match-score-label': d.match_label,
      '.user-block .arena-label': d.user_strat_label,
      '.quantum-block .arena-label': d.q_strat_label,
      '.radar-wrap .mini-chart-title': d.radar_title
    };

    for (const [selector, text] of Object.entries(textMap)) {
      const el = document.querySelector(selector);
      if (el && text) el.textContent = text;
    }

    // Dịch các nhãn trong Heatmap Controls
    const heatSliders = document.querySelectorAll('#heat-controls .slider-name');
    if (heatSliders[0]) heatSliders[0].textContent = d.heat_time_label;
    if (heatSliders[1]) heatSliders[1].textContent = d.heat_opacity_label;

    const heatInvert = document.getElementById('heat-invert');
    if (heatInvert && heatInvert.parentElement) {
      const textNode = Array.from(heatInvert.parentElement.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.nodeValue = d.heat_invert_text;
    }

    const legendSpans = document.querySelectorAll('.heat-legend-labels span');
    if (legendSpans[1]) legendSpans[1].textContent = d.heat_legend_mid;

    // Dịch 2 nút Tab ở Right Panel & tiêu đề biểu đồ nhỏ
    const rightTabs = document.querySelectorAll('#right-panel .tab-btn');
    if (rightTabs[0]) rightTabs[0].textContent = d.tab_telemetry;
    if (rightTabs[1]) rightTabs[1].textContent = d.tab_arena;

    const miniCharts = document.querySelectorAll('#tab-telemetry .mini-chart-title');
    if (miniCharts[0]) miniCharts[0].textContent = d.chart_temp_title;
    if (miniCharts[1]) miniCharts[1].textContent = d.chart_rain_title;
    if (miniCharts[2]) miniCharts[2].textContent = d.chart_ndvi_title;

    this.save();
  },

  // 6. Khôi phục về mặc định
  resetAll() {
    localStorage.removeItem(this.storageKey);
    this.state = {
      lang: 'vi',
      themeHex: '#10b981',
      themeRgb: '16, 185, 129',
      uiStyle: 'glass',
      layoutSwap: false,
      compact: false
    };
    this.init();
  }
};

document.addEventListener('DOMContentLoaded', () => AppSettings.init());