// Download public-domain Natural Earth geometry once; runtime classification is entirely offline.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {gzipSync}=require('node:zlib');
const https=require('node:https');
function requestJson(url,timeout){return new Promise((resolve,reject)=>{
  const req=https.get(url,{timeout},res=>{
    if(res.statusCode!==200){res.resume();reject(Error('Natural Earth HTTP '+res.statusCode));return;}
    let body='';res.on('data',chunk=>{body+=chunk;});res.on('error',reject);
    res.on('end',()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}});
  });
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Natural Earth download timed out')));
});}
async function main(){
  const layers={},inputs=[];
  for(const [key,file] of [['land','land'],['water','lakes'],['glaciated','glaciated_areas']]){
    const url=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_${file}.geojson`;
    const data=await requestJson(url,30000);
    if(!Array.isArray(data.features) || !data.features.length)throw Error('Invalid Natural Earth '+key);
    layers[key]=[];
    for(const f of data.features){
      const polygons=f.geometry?.type==='Polygon'?[f.geometry.coordinates]:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates:[];
      for(const polygon of polygons){
        const rings=polygon.map(r=>r.map(c=>c.slice(0,2).map(v=>Math.round(v*1e6)/1e6)));
        let west=180,east=-180,south=90,north=-90;
        for(const [lon,lat] of rings[0]){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
        layers[key].push({bbox:[west,south,east,north],rings,name:f.properties?.name || f.properties?.NAME || ''});
      }
    }
    inputs.push({layer:key,url,sha256:crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),polygons:layers[key].length});
  }
  const output={source:'Natural Earth',scale:'1:10,000,000 (not 10-metre resolution)',license:'Public domain',
    retrieved_at:new Date().toISOString(),limitations:'Generalized coastlines, major lakes and historical glaciated areas; not cadastral coastline or live snow cover. Small islands and glacier retreat may be unresolved.',inputs,layers};
  fs.mkdirSync(path.resolve(__dirname,'../data'),{recursive:true});
  const file=path.resolve(__dirname,'../data/terrain-mask.json.gz');fs.writeFileSync(file,gzipSync(JSON.stringify(output),{level:9}));
  console.log(JSON.stringify({file,bytes:fs.statSync(file).size,inputs:inputs.map(({layer,polygons})=>({layer,polygons}))}));
}
if(require.main===module)main().catch(e=>{console.error(e.message || e.code);process.exitCode=1;});
module.exports={main};
