// A small, debounced preview; moving the mouse never runs the quantum analysis.
const CropRecommendations = {
  timer:null, deadline:null, controller:null, version:0, cache:new Map(), activeKey:null, preview:false,
  el(id) { return document.getElementById(id); },
  status(text) { const el=this.el("crop-ranking-status"); if(el)el.textContent=text; },
  cancel() {
    this.version++;
    clearTimeout(this.timer); clearTimeout(this.deadline);
    this.timer=null; this.deadline=null;
    if(this.controller)this.controller.abort();
    this.controller=null;
  },
  render(result, coords, preview=false) {
    const body=this.el("crop-ranking-body"); if(!body)return;
    const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const score=row=>Number.isFinite(row.raw_score_pct)?row.raw_score_pct:
      Number.isFinite(row.score_pct)?row.score_pct:-Infinity;
    const rows=Array.isArray(result?.rows)?[...result.rows].sort((a,b)=>
      score(b)-score(a) || String(a.crop??a.label??"").localeCompare(String(b.crop??b.label??""))):[];
    const point=coords ? `${Number(coords.lat).toFixed(3)}°, ${Number(coords.lon).toFixed(3)}°` : "";
    this.status(`${preview?"Con trỏ":"Điểm chọn"}: ${point} · ${result?.status==="available"?"Mùa thuận lợi nhất":result?.reason || "Chưa có điểm"}`);
    body.innerHTML=rows.map((row,index)=>`<tr><td>${index+1}</td><td>${escape(row.label)}<small>${escape(row.grade)}${row.cold_risk?" · Có rủi ro rét":""}</small></td><td title="${escape(row.reason)}">${Number.isFinite(score(row))?Math.max(1,Math.min(100,score(row))).toFixed(1)+"%":"-%"}</td><td>${(row.months||[]).map(month=>"T"+escape(month)).join("–")}</td></tr>`).join("");
    const note=this.el("crop-ranking-note");
    if(note)note.textContent=result?.status==="available" ? (result.terrain_caution?"Độ cao tại điểm lệch ô khí hậu; cần kiểm tra tại chỗ. ":"") + result.note : "";
  },
  accept(data) {
    this.cancel(); this.activeKey=null;
    this.render(data.crop_rankings,data.coords,false);
  },
  select(lat,lon) { this.schedule(lat,lon,false); },
  schedule(lat,lon,preview=true) {
    if(!this.el("crop-ranking-body") || !Number.isFinite(lat) || !Number.isFinite(lon))return;
    if(preview && !this.el("crop-ranking-hover")?.checked)return;
    if(Math.abs(lat)>90)return;
    lon=((lon+180)%360+360)%360-180;
    lat=Number(lat.toFixed(preview?3:4));lon=Number(lon.toFixed(preview?3:4));
    const key=`${lat},${lon}`;
    if(key===this.activeKey && this.preview===preview)return;
    this.cancel(); this.activeKey=key;this.preview=preview;
    const version=this.version;
    this.timer=setTimeout(()=>this.load(lat,lon,key,version,preview),preview?900:250);
  },
  async load(lat,lon,key,version,preview) {
    if(version!==this.version)return;
    const cached=this.cache.get(key);
    if(cached && cached.expires>Date.now()) {this.render(cached.data.crop_rankings,cached.data.coords,preview);return;}
    this.render({status:"loading",rows:[],reason:"Đang tính mức tương thích…"},{lat,lon},preview);
    const controller=new AbortController();this.controller=controller;
    const deadline=setTimeout(()=>controller.abort(),20000);this.deadline=deadline;
    try {
      const response=await fetch(`/api/crop_suitability?lat=${lat}&lon=${lon}`,{signal:controller.signal});
      const data=await response.json();
      if(version!==this.version)return;
      if(!response.ok && !data.crop_rankings)throw new Error("Chưa tải được khí hậu.");
      if(data.ok) {
        if(this.cache.size>=32)this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key,{expires:Date.now()+300000,data});
      }
      this.render(data.crop_rankings,data.coords||{lat,lon},preview);
      if(!data.ok)this.activeKey=null;
    } catch(error) {
      if(version!==this.version)return;
      this.activeKey=null;
      this.render({status:"unavailable",rows:[],reason:error.name==="AbortError"?"Tải dữ liệu quá lâu; hãy thử lại.":"Chưa tải được khí hậu tại điểm này."},{lat,lon},preview);
    } finally {
      clearTimeout(deadline);
      if(this.controller===controller){this.controller=null;this.deadline=null;}
    }
  },
  init() {
    if(!this.el("crop-ranking-body"))return;
    map.on("mousemove",event=>this.schedule(event.latlng.lat,event.latlng.lng,true));
    map.on("movestart",()=>{this.cancel();this.activeKey=null;});
    map.on("moveend",()=>{if(this.activeKey===null)this.select(farmLat,farmLon);});
    map.on("mouseout",()=>{if(this.preview){this.cancel();this.activeKey=null;}});
    this.el("crop-ranking-hover")?.addEventListener("change",()=>{
      this.cancel();this.activeKey=null;
      this.select(farmLat,farmLon);
    });
    this.select(farmLat,farmLon);
  },
};
CropRecommendations.init();
