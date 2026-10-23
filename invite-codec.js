/* Cars · z1: lista UTF-8 comprimida con DEFLATE en base64url; acepta también JSON original. */
(function (global) {
  'use strict';
  const fields = ['title','name','age','date','time','venue','city','mapUrl','whatsapp','message','dressCode'];
/* Vigencia por invitación. Fechas de calendario, corte a medianoche de Perú. */
function retentionPolicy(value={}) {
  const retentionUnit=value.retentionUnit||'days';
  if(!['days','months','years','never'].includes(retentionUnit))throw Error('Selecciona días, meses, años o sin retirada.');
  if(retentionUnit==='never')return {retentionUnit,retentionValue:'30'};
  const raw=String(value.retentionValue??'30');
  const max={days:36500,months:1200,years:100}[retentionUnit];
  if(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>max)throw Error('La vigencia debe ser un entero entre 1 y '+max+'.');
  return {retentionUnit,retentionValue:String(Number(raw))};
}
function retentionDate(value) {
  const policy=retentionPolicy(value);
  if(policy.retentionUnit==='never'||!value.date)return null;
  const date=new Date(value.date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value.date)throw Error('Fecha de evento inválida.');
  const count=Number(policy.retentionValue);
  if(policy.retentionUnit==='days')date.setUTCDate(date.getUTCDate()+count);
  else {
    const day=date.getUTCDate();date.setUTCDate(1);
    if(policy.retentionUnit==='months')date.setUTCMonth(date.getUTCMonth()+count);
    else date.setUTCFullYear(date.getUTCFullYear()+count);
    const last=new Date(date.getTime());last.setUTCMonth(last.getUTCMonth()+1,0);
    date.setUTCDate(Math.min(day,last.getUTCDate()));
  }
  if(date.getUTCFullYear()>9999)throw Error('La fecha de retirada queda fuera del rango permitido.');
  return date.toISOString().slice(0,10);
}
function retentionTimestamp(value) {
  const expiry=retentionDate(value);
  return expiry===null?Infinity:new Date(expiry+'T00:00:00-05:00').getTime();
}

  function clean(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Datos inválidos.');
    const data = retentionPolicy(value);
    for (const key of fields) {
      if (value[key] !== undefined && typeof value[key] !== 'string') throw Error('Campo inválido: '+key);
      data[key] = (value[key] || '').trim();
      if (data[key].length > (key === 'message' || key === 'mapUrl' ? 2000 : 200)) throw Error('Campo demasiado largo: '+key);
    }
    if(value.photo){
      if(typeof value.photo!=='string'||value.photo.length>6000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value.photo))throw Error('La foto debe ser una miniatura JPEG válida (máximo 6.000 caracteres).');
      data.photo=value.photo;
    }
    if (!data.name) throw Error('Escribe el nombre del cumpleañero.');
    if (data.age && !/^\d{1,3}$/.test(data.age)) throw Error('La edad debe ser un número de hasta tres cifras.');
    if (data.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw Error('Fecha inválida.');
      const date = new Date(data.date+'T12:00:00Z');
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== data.date) throw Error('Fecha inválida.');
    }
    if (data.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) throw Error('Hora inválida.');
    if (data.mapUrl) {
      const url = new URL(data.mapUrl);
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw Error('Usa un enlace de mapa http o https.');
    }
    data.whatsapp = data.whatsapp.replace(/[+\s()-]/g,'');
    if (data.whatsapp && !/^[1-9]\d{6,14}$/.test(data.whatsapp)) throw Error('WhatsApp debe incluir código de país y entre 7 y 15 dígitos.');
    if (new TextEncoder().encode(JSON.stringify(data)).length > 16000) throw Error('La invitación es demasiado larga. Acorta el mensaje o el enlace del mapa.');
    return data;
  }
  function toBase64(bytes) {
    let binary=''; for(const byte of bytes) binary+=String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  async function readBounded(stream) {
    const reader=stream.getReader(), chunks=[]; let size=0;
    try {
      for(;;){const {done,value}=await reader.read();if(done)break;
        size+=value.length;if(size>16000){await reader.cancel();throw Error('Datos demasiado largos.');}chunks.push(value);}
    } finally {reader.releaseLock();}
    const result=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
  }
  function encode(value){return toBase64(new TextEncoder().encode(JSON.stringify(clean(value))));}
  function decode(hash){
    if(typeof hash!=='string'||hash.length>24000)return null;
    const m=hash.match(/^#invite=([A-Za-z0-9_-]+)$/);if(!m)return null;
    try{let b64=m[1].replace(/-/g,'+').replace(/_/g,'/');b64+='='.repeat((4-b64.length%4)%4);return clean(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)))));}catch{return null;}
  }
  async function encodeCompact(value) {
    const data=clean(value), utf8=new TextEncoder();
    const legacy=toBase64(utf8.encode(JSON.stringify(data)));
    if(data.retentionUnit!=='days'||data.retentionValue!=='30')return legacy;
    // Posiciones fijas evitan repetir las claves en cada enlace; z1 fija el formato.
    if(typeof CompressionStream!=='function')return legacy;
    const values=fields.map(key=>data[key]);if(data.photo)values.push(data.photo);
    const packed=utf8.encode(JSON.stringify(values));
    try{
      const stream=new Blob([packed]).stream().pipeThrough(new CompressionStream('deflate'));
      const compressed=(data.photo?'z2.':'z1.')+toBase64(await readBounded(stream));
      return compressed.length<legacy.length?compressed:legacy;
    }catch{return legacy;}
  }
  async function decodeAny(hash) {
    if(typeof hash!=='string'||hash.length>24000)return null;
    const match=hash.match(/^#invite=(z[12]\.)?([A-Za-z0-9_-]+)$/);if(!match)return null;
    try {
      let b64=match[2].replace(/-/g,'+').replace(/_/g,'/');
      b64+='='.repeat((4-b64.length%4)%4);
      let bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
      if(match[1]){
        if(typeof DecompressionStream!=='function')return null;
        bytes=await readBounded(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')));
      }
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(!match[1])return clean(value);
      const withPhoto=match[1]==='z2.';
      if(!Array.isArray(value)||value.length!==fields.length+(withPhoto?1:0))return null;
      const data=Object.fromEntries(fields.map((key,i)=>[key,value[i]]));
      if(withPhoto)data.photo=value[fields.length];
      return clean(data);
    } catch {return null;}
  }
  function baseUrl(input, allowLocal=false) {
    const url = new URL(input);
    const local = allowLocal && ['localhost','127.0.0.1'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || (local && !['http:','https:'].includes(url.protocol)) || url.username || url.password || url.search || url.hash) throw Error('Usa la URL base completa, sin parámetros ni fragmento.');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.href;
  }
  global.InviteCodec = Object.freeze({clean,encode,decode,encodeCompact,decodeAny,baseUrl,retentionPolicy,retentionDate,retentionTimestamp});
})(globalThis);
