// ─── FarmShift · Info Tooltips (Quantum Result tab) ───────────────────────────
// Cung cấp icon "?" nhỏ bên cạnh các thông số + popup giải thích ý nghĩa
// và nguồn gốc dữ liệu khi di/chạm vào icon. Không phụ thuộc file nào khác.

const PARAM_INFO = {
  match_pct: {
    title: "⚖️ Quantum Match Rating",
    desc: "Cho biết chiến lược luân canh bạn chọn \"ăn khớp\" đến đâu với gợi ý tối ưu của AI lượng tử. 100% nghĩa là bạn đã chọn đúng tổ hợp cây trồng tốt nhất; càng thấp, nghĩa là có một lựa chọn khác sẽ cân bằng Đất – Nước – Lợi nhuận tốt hơn so với lựa chọn hiện tại của bạn.",
    source: "Chỉ số tổng hợp, tính toán nội bộ từ các thông số vệ tinh và kinh tế bên dưới (không phải số đo trực tiếp từ một vệ tinh nào)."
  },
  rank: {
    title: "🏅 Rank (S / A / B / C)",
    desc: "Điểm xếp hạng chung cho một chiến lược 3 vụ, tổng hợp từ 3 chỉ số Đất, Nước và Lợi nhuận bên dưới theo đúng tỉ lệ ưu tiên bạn đã đặt ở Settings. S là tốt nhất, lần lượt đến A, B, và C là cần cân nhắc lại.",
    source: "Chỉ số tổng hợp, tính toán nội bộ từ các thông số vệ tinh và kinh tế bên dưới."
  },
  soil_hp: {
    title: "🌱 Soil & Nitrogen HP",
    desc: "Ước tính \"sức khoẻ\" của đất sau khi trồng đủ 3 vụ. Cây họ đậu (như đậu nành, đậu phộng) giúp cải tạo đất nên tăng điểm; để đất bỏ trống trong mùa mưa lớn dễ gây xói mòn nên bị trừ điểm.",
    source: "Dữ liệu thực vật/độ che phủ NDVI từ vệ tinh NASA, kết hợp đặc tính sinh học của từng loại cây trồng."
  },
  water_hp: {
    title: "💧 Water Budget HP",
    desc: "Ước tính lượng nước còn lại trong đất sau khi trồng đủ 3 vụ. Nếu đất đang khô mà bạn chọn cây cần nhiều nước, điểm sẽ giảm mạnh và hệ thống cảnh báo nguy cơ hạn hán.",
    source: "Dữ liệu độ ẩm đất tầng rễ từ vệ tinh NASA SMAP, kết hợp nhu cầu nước của từng loại cây trồng."
  },
  profit_hp: {
    title: "💰 Economic HP",
    desc: "Ước tính khả năng sinh lời của chiến lược luân canh, dựa trên giá trị kinh tế của từng cây và mức độ phù hợp của vùng đất. Lợi nhuận sẽ giảm nếu thời tiết quá nóng vượt ngưỡng chịu nhiệt của cây, hoặc nếu thiếu nước nghiêm trọng.",
    source: "Nhiệt độ bề mặt đất từ vệ tinh NASA ECOSTRESS/MODIS, kết hợp dữ liệu giá cả và độ phù hợp vùng trồng từ các API nông nghiệp bên thứ ba (CartoDrone, Every.Farm)."
  },
  quantum_method: {
    title: "⚛️ QAOA Method",
    desc: "Tên của \"bộ não\" đã tính ra tổ hợp 3 vụ tối ưu — một thuật toán mô phỏng máy tính lượng tử (QAOA) để tìm phương án cân bằng tốt nhất giữa Đất, Nước và Lợi nhuận, đồng thời tránh gợi ý trồng lặp lại một loại cây quá nhiều vụ liên tiếp (dễ làm bạc màu đất). Nếu việc mô phỏng gặp sự cố, hệ thống sẽ tự chuyển sang một thuật toán dự phòng đơn giản hơn để vẫn đưa ra kết quả.",
    source: "Kết quả tính toán nội bộ, không đến từ một bộ dữ liệu vệ tinh hay bên thứ ba nào — chỉ dựa trên 3 chỉ số Đất/Nước/Lợi nhuận ở trên."
  },

  // ─── Satellite Intel tab ───────────────────────────────────────────────
  power_temp: {
    title: "☀️ Nhiệt độ không khí (T2M)",
    desc: "Nhiệt độ không khí trung bình đo ở độ cao 2m so với mặt đất tại toạ độ nông trại của bạn, tính trung bình theo từng tháng trong năm. Đây là chỉ số cơ bản để biết khu vực của bạn nóng/lạnh ra sao theo mùa.",
    source: "Vệ tinh và mô hình tái phân tích khí hậu của NASA POWER."
  },
  smap_moisture: {
    title: "💧 Độ ẩm đất tầng rễ",
    desc: "Lượng nước có sẵn trong lớp đất nơi rễ cây hấp thụ, thể hiện bằng tỉ lệ phần trăm. Số càng thấp nghĩa là đất càng khô, cây càng dễ thiếu nước và có nguy cơ hạn hán cao hơn trong tháng đó.",
    source: "Vệ tinh NASA SMAP (Soil Moisture Active Passive) và chương trình Crop-CASMA."
  },
  gpm_rain: {
    title: "🌧️ Lượng mưa trung bình",
    desc: "Lượng mưa ước tính rơi xuống khu vực của bạn mỗi tháng (mm/tháng). Mưa quá ít kéo dài dễ dẫn đến hạn hán; mưa quá nhiều, dồn dập trong thời gian ngắn có thể gây ngập úng hoặc xói mòn đất nếu đất đang bỏ trống.",
    source: "Vệ tinh NASA GPM IMERG (Global Precipitation Measurement)."
  },
  ecostress_heat: {
    title: "🌡️ Nhiệt độ bề mặt & Sốc nhiệt",
    desc: "Nhiệt độ thực tế trên bề mặt đất/tán lá (không phải nhiệt độ không khí), cho biết cây trồng có đang bị \"sốc nhiệt\" hay không. Chỉ số ESI (Evaporative Stress Index) đi kèm cho biết mức độ cây đang thiếu nước để làm mát qua thoát hơi — ESI càng thấp, cây càng stress.",
    source: "Vệ tinh NASA ECOSTRESS và MODIS Land Surface Temperature (LST)."
  },
  modis_ndvi: {
    title: "🌿 Chỉ số thực vật & Độ phì nhiêu",
    desc: "NDVI cho biết mức độ xanh tốt, khoẻ mạnh của thảm thực vật tại khu vực (càng gần 1 càng xanh tốt). Kết hợp với dữ liệu độ phì nhiêu của đất để đánh giá đất có đang thuận lợi cho cây trồng phát triển hay không.",
    source: "Vệ tinh MODIS (chỉ số NDVI) kết hợp cơ sở dữ liệu đất toàn cầu SoilGrids."
  },
  risk_dri: {
    title: "🌵 Chỉ số rủi ro hạn hán (DRI)",
    desc: "Ước tính khả năng xảy ra hạn hán trong các tháng tới, dựa trên độ khô của đất và lượng mưa thấp kéo dài. Phần trăm càng cao, rủi ro mất mùa vì thiếu nước càng lớn.",
    source: "Tính toán từ độ ẩm đất (NASA SMAP) và lượng mưa (NASA GPM IMERG)."
  },
  risk_fri: {
    title: "🌊 Chỉ số rủi ro lũ lụt (FRI)",
    desc: "Ước tính khả năng xảy ra ngập úng/lũ lụt trong các tháng tới, dựa trên các đợt mưa cực đoan dồn dập. Phần trăm càng cao, rủi ro hư hại mùa màng vì ngập úng càng lớn.",
    source: "Tính toán từ dữ liệu lượng mưa cực đoan của NASA GPM IMERG."
  },
  ext_api: {
    title: "🌍 Độ phù hợp cây trồng & Giá thị trường",
    desc: "Thông tin về mức độ phù hợp của vùng đất với từng loại cây và giá thu mua tham khảo trên thị trường, giúp tính toán chỉ số Lợi nhuận (Economic HP) chính xác hơn theo vị trí thực tế của bạn. Nếu dịch vụ này tạm thời không phản hồi, hệ thống sẽ tự dùng công thức ước tính nội bộ thay thế.",
    source: "API nông nghiệp của bên thứ ba (CartoDrone, Every.Farm); dự phòng bằng công thức ước tính nội bộ khi không kết nối được."
  },

  // ─── Header badges (thanh dataset trên cùng) ───────────────────────────
  badge_power: {
    title: "🛰️ NASA POWER",
    desc: "Kho dữ liệu thời tiết của NASA, ghi lại nắng, nhiệt độ và mưa tại mọi nơi trên Trái Đất trong nhiều năm liền. App dùng dữ liệu này để biết khí hậu trung bình từng tháng ở nông trại của bạn, giống như xem \"lịch thời tiết nhiều năm\" của khu vực.",
    source: "NASA POWER (Prediction Of Worldwide Energy Resources) — dữ liệu khí hậu vệ tinh của NASA."
  },
  badge_smap: {
    title: "🛰️ NASA SMAP",
    desc: "Một vệ tinh chuyên \"nhìn xuyên\" mặt đất từ không gian để đo xem đất đang ẩm hay khô. Nhờ vậy app có thể cảnh báo sớm nguy cơ thiếu nước/hạn hán mà không cần bạn tự đo đất ngoài ruộng.",
    source: "NASA SMAP (Soil Moisture Active Passive)."
  },
  badge_gpm: {
    title: "🛰️ NASA GPM",
    desc: "Một nhóm vệ tinh theo dõi lượng mưa trên khắp thế giới theo thời gian gần thực. App dùng để biết khu vực của bạn mưa nhiều hay ít hơn bình thường, giúp phát hiện sớm nguy cơ hạn hán hoặc ngập úng.",
    source: "NASA GPM IMERG (Global Precipitation Measurement)."
  },
  badge_ecostress: {
    title: "🛰️ NASA ECOSTRESS",
    desc: "Một thiết bị gắn trên Trạm Vũ trụ Quốc tế, đo nhiệt độ thật sự trên bề mặt đất và cây trồng (khác với nhiệt độ không khí bạn thấy trên dự báo thời tiết). Nhờ đó app phát hiện được khi nào cây đang bị \"sốc nhiệt\" vì nắng nóng gay gắt.",
    source: "NASA ECOSTRESS (ECOsystem Spaceborne Thermal Radiometer Experiment)."
  },
  badge_modis: {
    title: "🛰️ NASA MODIS",
    desc: "Một thiết bị vệ tinh chụp ảnh toàn bộ Trái Đất mỗi ngày, dùng để tính xem cây cối, mùa màng ở một khu vực đang xanh tốt hay héo úa (gọi là chỉ số NDVI). Giúp app đánh giá sức khoẻ thực vật mà không cần đi khảo sát thực địa.",
    source: "NASA MODIS (Moderate Resolution Imaging Spectroradiometer)."
  },
  badge_qaoa: {
    title: "⚛️ Qiskit QAOA",
    desc: "Đây là \"bộ não\" tính toán của app — một thuật toán mô phỏng theo cách máy tính lượng tử hoạt động, dùng để thử rất nhiều tổ hợp cây trồng khác nhau và chọn ra 3 vụ luân canh cân bằng tốt nhất giữa đất, nước và lợi nhuận.",
    source: "Mô phỏng theo kiến trúc Qiskit (bộ công cụ tính toán lượng tử của IBM), chạy nội bộ trong app."
  },
  badge_source: {
    title: "📡 Nguồn dữ liệu đang dùng",
    desc: "Cho biết số liệu bạn đang xem lấy trực tiếp từ vệ tinh NASA theo thời gian thực, hay app đang tạm dùng số liệu ước tính nội bộ (vì mất kết nối internet hoặc máy chủ NASA đang bận). Số liệu ước tính vẫn được tính toán hợp lý dựa trên vị trí của bạn, chỉ không \"tươi mới\" bằng dữ liệu trực tiếp.",
    source: "Trạng thái kết nối tới các API vệ tinh NASA tại thời điểm bạn chạy phân tích."
  }
};

function infoIcon(key) {
  if (!PARAM_INFO[key]) return "";
  return `<span class="info-q" data-tip-key="${key}" tabindex="0" role="button" aria-label="Thông tin">?</span>`;
}

(function () {
  let popupEl = null;
  let hideTimer = null;

  function ensurePopup() {
    if (popupEl) return popupEl;
    popupEl = document.createElement("div");
    popupEl.id = "fs-tooltip-popup";
    popupEl.innerHTML = `
      <div class="fs-tip-title"></div>
      <div class="fs-tip-desc"></div>
      <div class="fs-tip-source"><span class="fs-tip-source-label">Nguồn:</span> <span class="fs-tip-source-text"></span></div>`;
    document.body.appendChild(popupEl);
    return popupEl;
  }

  function showTip(iconEl) {
    const key = iconEl.getAttribute("data-tip-key");
    const info = PARAM_INFO[key];
    if (!info) return;
    clearTimeout(hideTimer);

    const el = ensurePopup();
    el.querySelector(".fs-tip-title").textContent = info.title;
    el.querySelector(".fs-tip-desc").textContent = info.desc;
    el.querySelector(".fs-tip-source-text").textContent = info.source;
    el.classList.add("visible");

    // Đo kích thước rồi định vị, tự lật nếu tràn viewport
    const rect = iconEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    el.style.left = "0px";
    el.style.top = "0px";
    const pw = el.offsetWidth, ph = el.offsetHeight;

    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, vw - pw - 8));

    let top = rect.top - ph - 10;
    let arrowBelow = true;
    if (top < 8) {
      top = rect.bottom + 10;
      arrowBelow = false;
    }
    top = Math.min(top, vh - ph - 8);

    el.style.left = left + "px";
    el.style.top = top + "px";
    el.classList.toggle("arrow-top", !arrowBelow);
    el.classList.toggle("arrow-bottom", arrowBelow);
    el.style.setProperty("--fs-arrow-x", (rect.left + rect.width / 2 - left) + "px");
  }

  function hideTip(immediate) {
    if (!popupEl) return;
    clearTimeout(hideTimer);
    if (immediate) {
      popupEl.classList.remove("visible");
    } else {
      hideTimer = setTimeout(() => popupEl.classList.remove("visible"), 120);
    }
  }

  // Bắt mọi phần tử có data-tip-key: icon "?" (.info-q) lẫn các badge hover-thẳng (.hbadge)
  const TIP_SELECTOR = "[data-tip-key]";

  document.addEventListener("mouseover", (e) => {
    const icon = e.target.closest(TIP_SELECTOR);
    if (icon) showTip(icon);
  });
  document.addEventListener("mouseout", (e) => {
    const icon = e.target.closest(TIP_SELECTOR);
    if (icon) hideTip(false);
  });
  document.addEventListener("focusin", (e) => {
    const icon = e.target.closest(TIP_SELECTOR);
    if (icon) showTip(icon);
  });
  document.addEventListener("focusout", (e) => {
    const icon = e.target.closest(TIP_SELECTOR);
    if (icon) hideTip(true);
  });
  // Hỗ trợ cảm ứng (mobile): chạm để bật/tắt, chạm ra ngoài để đóng
  document.addEventListener("click", (e) => {
    const icon = e.target.closest(TIP_SELECTOR);
    if (icon) {
      e.preventDefault();
      e.stopPropagation();
      const key = icon.getAttribute("data-tip-key");
      if (popupEl && popupEl.classList.contains("visible") && popupEl.dataset.key === key) {
        hideTip(true);
      } else {
        showTip(icon);
        if (popupEl) popupEl.dataset.key = key;
      }
      return;
    }
    hideTip(true);
  });
  window.addEventListener("scroll", () => hideTip(true), true);
  window.addEventListener("resize", () => hideTip(true));
})();
