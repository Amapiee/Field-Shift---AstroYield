/**
 * ==============================================================================
 * THUẬT TOÁN 09: SEASONAL CLIMATE & MULTI-SITE AGRO-ECOLOGICAL K-MEANS++ (V3)
 * ==============================================================================
 * 
 * 1. BỐI CẢNH KHOA HỌC & ĐỊNH DANH CHUẨN XÁC:
 *    - Phân biệt rõ hai cấp độ phân cụm không giám sát:
 *      1. `clusterSeasonalClimate`: Phân cụm mùa vụ vi khí hậu 12 tháng tại 1 điểm khảo sát
 *         (Seasonal Climate Regimes) nhằm nhận diện vụ khô kiệt, vụ tối ưu và vụ mưa thừa.
 *      2. `clusterMultiSiteAgroZones`: Phân vùng sinh thái nông nghiệp đa địa điểm toàn cầu/khu vực
 *         (Regional Agro-Ecological Zoning - AEZ) dựa trên vector đặc trưng vi khí hậu đa chiều.
 *    - Tối ưu hóa K-Means++ với n_init = 10 lần khởi tạo và giám sát quán tính (Inertia/WCSS).
 */

function standardizeFeatures(matrix) {
  const n = matrix.length;
  const d = matrix[0].length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);

  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += matrix[i][j];
    means[j] = sum / n;
  }

  for (let j = 0; j < d; j++) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += Math.pow(matrix[i][j] - means[j], 2);
    stds[j] = Math.sqrt(sumSq / n) || 1.0;
  }

  const normalized = matrix.map(row => row.map((val, j) => (val - means[j]) / stds[j]));
  return { normalized, means, stds };
}

function distSq(v1, v2) {
  let s = 0;
  for (let i = 0; i < v1.length; i++) {
    const d = v1[i] - v2[i];
    s += d * d;
  }
  return s;
}

function runSingleKMeans(features, k, maxIter = 100) {
  const n = features.length;
  const centroids = [];
  centroids.push(features[Math.floor(Math.random() * n)].slice());

  while (centroids.length < k) {
    const dists = features.map(x => {
      let minDist = Infinity;
      for (const c of centroids) {
        const d = distSq(x, c);
        if (d < minDist) minDist = d;
      }
      return minDist;
    });

    const sumDist = dists.reduce((a, b) => a + b, 0);
    let rand = Math.random() * sumDist;
    let chosenIdx = 0;

    for (let i = 0; i < n; i++) {
      rand -= dists[i];
      if (rand <= 0) {
        chosenIdx = i;
        break;
      }
    }
    centroids.push(features[chosenIdx].slice());
  }

  const labels = new Array(n).fill(0);
  let changed = true;
  let iter = 0;

  while (changed && iter < maxIter) {
    changed = false;
    iter++;

    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let bestLabel = 0;
      for (let j = 0; j < k; j++) {
        const d = distSq(features[i], centroids[j]);
        if (d < minDist) {
          minDist = d;
          bestLabel = j;
        }
      }
      if (labels[i] !== bestLabel) {
        labels[i] = bestLabel;
        changed = true;
      }
    }

    const counts = new Array(k).fill(0);
    const newCentroids = Array.from({ length: k }, () => new Array(features[0].length).fill(0));

    for (let i = 0; i < n; i++) {
      const l = labels[i];
      counts[l]++;
      for (let j = 0; j < features[0].length; j++) newCentroids[l][j] += features[i][j];
    }

    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        for (let f = 0; f < features[0].length; f++) newCentroids[j][f] /= counts[j];
        centroids[j] = newCentroids[j];
      }
    }
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) {
    inertia += distSq(features[i], centroids[labels[i]]);
  }

  return { labels, centroids, inertia, iterations: iter };
}

function runKMeansPlusPlus(features, k = 3, nInit = 10) {
  let bestRun = null;
  for (let r = 0; r < nInit; r++) {
    const run = runSingleKMeans(features, k);
    if (bestRun === null || run.inertia < bestRun.inertia) {
      bestRun = run;
    }
  }
  return bestRun;
}

/**
 * 1. Phân cụm mùa vụ vi khí hậu 12 tháng tại điểm khảo sát (Seasonal Climate Clustering)
 */
function clusterSeasonalClimate(monthlyData, k = 3) {
  const { T2M, PRECTOTCORR, GWETROOT, ALLSKY_SFC_SW_DWN } = monthlyData;
  const rawFeatures = [];

  for (let m = 0; m < 12; m++) {
    rawFeatures.push([
      T2M[m],
      PRECTOTCORR ? PRECTOTCORR[m] : 50,
      GWETROOT ? GWETROOT[m] : 0.5,
      ALLSKY_SFC_SW_DWN ? ALLSKY_SFC_SW_DWN[m] : 15.0
    ]);
  }

  const { normalized } = standardizeFeatures(rawFeatures);
  const { labels, centroids, inertia } = runKMeansPlusPlus(normalized, k, 10);

  const clusterProfiles = Array.from({ length: k }, (_, cIdx) => {
    const memberMonths = [];
    labels.forEach((l, m) => { if (l === cIdx) memberMonths.push(m + 1); });

    const avgRain = memberMonths.reduce((sum, m) => sum + (PRECTOTCORR ? PRECTOTCORR[m - 1] : 50), 0) / (memberMonths.length || 1);
    const avgGwet = memberMonths.reduce((sum, m) => sum + (GWETROOT ? GWETROOT[m - 1] : 0.5), 0) / (memberMonths.length || 1);
    const avgTemp = memberMonths.reduce((sum, m) => sum + T2M[m - 1], 0) / (memberMonths.length || 1);

    let seasonCategory = "Vụ Ôn hòa / Sinh trưởng tối ưu";
    if (avgTemp < 5.0) {
      seasonCategory = "Vụ Đông lạnh / Hưu miên băng giá (Dormant/Cold Period)";
    } else if (avgGwet < 0.28 && avgRain < 40) {
      seasonCategory = "Vụ Khô hạn / Bốc thoát hơi nước cao (Dry Season)";
    } else if (avgRain > 150) {
      seasonCategory = "Vụ Mưa lũ / Ẩm ướt cao điểm (Wet/Rainy Season)";
    }

    return {
      cluster_id: cIdx + 1,
      season_type: seasonCategory,
      months: memberMonths.map(m => `T${m}`),
      avg_temperature: Math.round(avgTemp * 10) / 10,
      avg_rainfall_mm: Math.round(avgRain * 10) / 10,
      avg_soil_moisture: Math.round(avgGwet * 100) / 100
    };
  });

  return {
    labels,
    cluster_profiles: clusterProfiles,
    inertia: Math.round(inertia * 100) / 100,
    clustering_type: "Seasonal Climate Regimes (12-Month Single Location)"
  };
}

/**
 * 2. Phân cụm khí hậu đa địa điểm (Multi-Site Climate Clustering - Experimental)
 * Ghi chú khoa học: Đây là phân nhóm dựa trên 4 chỉ số khí hậu điểm trạm,
 * chưa cấu thành phân vùng FAO GAEZ hoàn chỉnh (đòi hỏi bản đồ thổ nhưỡng, độ dốc DEM và kiểm chứng).
 * @param {Array<{id: string, name: string, annual_rain: number, mean_temp: number, mean_gwet: number, solar_rad: number}>} sites Danh sách các trạm/điểm địa lý
 */
function clusterMultiSiteAgroZones(sites, k = 3) {
  if (!Array.isArray(sites) || sites.length < k) {
    throw new RangeError(`clusterMultiSiteAgroZones: Requires at least ${k} valid sites, received ${sites ? sites.length : 0}`);
  }

  const rawFeatures = sites.map(s => [
    Number(s.mean_temp) || 0,
    Number(s.annual_rain) || 0,
    Number(s.mean_gwet) || 0,
    Number(s.solar_rad) || 16.0
  ]);

  const { normalized } = standardizeFeatures(rawFeatures);
  const { labels, centroids, inertia } = runKMeansPlusPlus(normalized, k, 10);

  const zoneAssignments = sites.map((site, idx) => ({
    ...site,
    zone_cluster_id: labels[idx] + 1
  }));

  return {
    zone_assignments: zoneAssignments,
    k,
    inertia: Math.round(inertia * 100) / 100,
    clustering_type: "Multi-Site Climate Clustering (Experimental)"
  };
}

// Wrapper tương thích ngược
const clusterAgroEcologicalSeasons = clusterSeasonalClimate;

module.exports = {
  standardizeFeatures,
  runKMeansPlusPlus,
  clusterSeasonalClimate,
  clusterAgroEcologicalSeasons,
  clusterMultiSiteAgroZones
};
