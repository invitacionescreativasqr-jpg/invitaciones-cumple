/* Cars · formato compatible con los enlaces originales: JSON UTF-8 en base64url. */
(function (global) {
  'use strict';
  const fields = ['title','name','age','date','time','venue','city','mapUrl','whatsapp','message','dressCode'];
  function clean(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Datos inválidos.');
    const data = {};
    for (const key of fields) {
      if (value[key] !== undefined && typeof value[key] !== 'string') throw Error('Campo inválido: '+key);
      data[key] = (value[key] || '').trim();
      if (data[key].length > (key === 'message' || key === 'mapUrl' ? 2000 : 200)) throw Error('Campo demasiado largo: '+key);
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
  function encode(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(clean(value)));
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(hash) {
    if (typeof hash !== 'string' || hash.length > 24000) return null;
    const match = hash.match(/^#invite=([A-Za-z0-9_-]+)$/); if (!match) return null;
    try {
      let b64 = match[1].replace(/-/g,'+').replace(/_/g,'/');
      b64 += '='.repeat((4-b64.length%4)%4);
      const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
      return clean(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
    } catch { return null; }
  }
  function baseUrl(input, allowLocal=false) {
    const url = new URL(input);
    const local = allowLocal && ['localhost','127.0.0.1'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || (local && !['http:','https:'].includes(url.protocol)) || url.username || url.password || url.search || url.hash) throw Error('Usa la URL base completa, sin parámetros ni fragmento.');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.href;
  }
  global.InviteCodec = Object.freeze({clean,encode,decode,baseUrl});
})(globalThis);
