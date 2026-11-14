// ─── FarmShift · Info Tooltips (Quantum Result tab) ───────────────────────────
// Cung cấp icon "?" nhỏ bên cạnh các thông số + popup giải thích ý nghĩa
// và nguồn gốc dữ liệu khi di/chạm vào icon. Không phụ thuộc file nào khác.

const PARAM_INFO = {
  match_pct: {
    title: "⚖️ Quantum Match Rating",
    desc: "So sánh điểm tổng (overall score) của chiến lược luân canh bạn chọn so với chiến lược tối ưu mà thuật toán lượng tử QAOA tìm ra. 100% nghĩa là bạn đã trùng với lựa chọn tối ưu; càng thấp, QAOA càng có một tổ hợp cây trồng tốt hơn theo trọng số Đất/Nước/Lợi nhuận bạn đặt.",
    source: "Suy ra từ 2 điểm overall (User vs Quantum) — src/services/scoring.js, src/routes/api.js. Không phải số đo vệ tinh trực tiếp, mà là kết quả tính toán nội bộ."
  },
  rank: {
    title: "🏅 Rank (S / A / B / C)",
    desc: "Xếp hạng tổng quát của một chiến lược 3 vụ, quy đổi từ điểm overall = (w_soil·SoilHP + w_water·WaterHP + w_profit·ProfitHP) / tổng trọng số. S ≥ 80 · A ≥ 67 · B ≥ 44 · còn lại là C.",
    source: "Công thức chấm điểm nội bộ — src/services/scoring.js (hàm scoreScenario). Trọng số w_water/w_soil/w_profit do bạn chỉnh trong Settings → Farming Weights."
  },
  soil_hp: {
    title: "🌱 Soil & Nitrogen HP",
    desc: "\"Sức khoẻ\" đất ước tính sau 3 vụ: cộng dồn hệ số cải tạo/bạc màu đất riêng của từng loại cây (vd cây họ đậu như Soybean, Peanut giúp cố định đạm, cộng thêm điểm theo NDVI), và trừ điểm nếu bỏ đất trống (Fallow) gặp mưa lớn gây xói mòn.",
    source: "Hệ số sinh học cây trồng (soil) — src/config/crops.js · NDVI phái sinh từ NASA POWER (bức xạ, độ ẩm) — src/services/nasa.js, được dùng như proxy cho MODIS NDVI thực tế."
  },
  water_hp: {
    title: "💧 Water Budget HP",
    desc: "Ngân sách nước còn lại sau 3 vụ: mỗi cây trồng cộng/trừ điểm theo nhu cầu nước riêng (hệ số water). Nếu độ ẩm tầng rễ (GWETROOT) xuống dưới ngưỡng hạn và cây đó háo nước, hệ thống phạt nặng điểm và cảnh báo nguy cơ hạn hán.",
    source: "NASA SMAP · Crop-CASMA — GWETROOT (độ ẩm đất tầng rễ), tham chiếu NASA POWER làm nguồn dự phòng khi API lỗi — src/services/nasa.js · Ngưỡng hạn & hệ số nước cây trồng — src/utils/helpers.js, src/config/crops.js."
  },
  profit_hp: {
    title: "💰 Economic HP",
    desc: "Ước tính lợi nhuận: hệ số lợi nhuận gốc của cây × độ phù hợp vùng trồng (local suitability) × hệ số thị trường, rồi bị giảm nếu nhiệt độ đất (TS) vượt ngưỡng chịu nhiệt của cây hoặc nếu thiếu nước nghiêm trọng (WaterHP < 40).",
    source: "Hệ số lợi nhuận/chịu nhiệt cây trồng — src/config/crops.js · Nhiệt độ bề mặt (TS) — NASA ECOSTRESS/MODIS LST · Độ phù hợp vùng & giá thị trường — API bên thứ 3 (CartoDrone/Every.Farm) hoặc công thức nội bộ khi API lỗi — src/services/external.js, src/services/scoring.js."
  },
  quantum_method: {
    title: "⚛️ QAOA Method",
    desc: "Tên thuật toán/engine đã chọn ra tổ hợp 3 vụ tối ưu. \"Node.js Dynamic QAOA Simulator (18-qubit, γ=...)\" nghĩa là một mô phỏng QAOA (Quantum Approximate Optimization Algorithm) chạy trên statevector 18-qubit với tham số góc quay γ; nếu mô phỏng lỗi, hệ thống tự chuyển sang thuật toán tham lam cổ điển (Classical Greedy) để vẫn trả kết quả.",
    source: "Bộ mô phỏng Qubit tự viết (Hadamard/RZ/CX/RX, 1024 shots) — src/quantum/statevector.js, src/quantum/qaoa.js. Hàm chi phí QUBO dùng chính 3 chỉ số Soil/Water/Profit HP ở trên, cộng hình phạt độc canh (3 vụ liên tiếp cùng 1 cây)."
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

  document.addEventListener("mouseover", (e) => {
    const icon = e.target.closest(".info-q");
    if (icon) showTip(icon);
  });
  document.addEventListener("mouseout", (e) => {
    const icon = e.target.closest(".info-q");
    if (icon) hideTip(false);
  });
  document.addEventListener("focusin", (e) => {
    const icon = e.target.closest(".info-q");
    if (icon) showTip(icon);
  });
  document.addEventListener("focusout", (e) => {
    const icon = e.target.closest(".info-q");
    if (icon) hideTip(true);
  });
  // Hỗ trợ cảm ứng (mobile): chạm để bật/tắt, chạm ra ngoài để đóng
  document.addEventListener("click", (e) => {
    const icon = e.target.closest(".info-q");
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
