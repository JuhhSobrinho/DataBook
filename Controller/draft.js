function bufToB64(buffer){
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let bin = '';
  for(let i = 0; i < bytes.length; i += CHUNK)
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

function coletarRascunho(){
  const tecnicos = [];
  document.querySelectorAll('.tec-check:checked').forEach(cb => {
    const nome = cb.dataset.nome;
    const sel   = document.querySelector('.tec-cert[data-nome="'+cssEscape(nome)+'"]');
    const jotun = document.querySelector('.tecnico-row[data-nome="'+cssEscape(nome)+'"] .tec-jotun');
    tecnicos.push({ nome, cert: sel?.value||'', jotunChecked: jotun?.checked||false });
  });

  const uploads = {}, uploadNames = {};
  for(const [key, buf] of Object.entries(STATE.uploads)){
    if(buf){ uploads[key] = bufToB64(buf); uploadNames[key] = STATE.uploadNames[key]||key+'.pdf'; }
  }

  return {
    versao: 2,
    campos: {
      doc1: $('doc1').value, doc2: $('doc2').value, doc3: $('doc3').value,
      doc4: $('doc4').value, doc5: $('doc5').value,
      capaElab: $('capaElab').value, capaRev: $('capaRev').value, capaData: $('capaData').value,
      tagEquip: $('tagEquip').value,
      cgCliente: $('cgCliente').value, cgData: $('cgData').value,
      cgEndereco: $('cgEndereco').value, cgQuant: $('cgQuant').value,
      cgContrato: $('cgContrato').value, cgPO: $('cgPO').value, cgTeam: $('cgTeam').value,
      cgPlaqueta: ($('cgPlaqueta')||{value:''}).value, cgSerial: $('cgSerial').value,
      cgPDA: $('cgPDA').value, cgDescricao: $('cgDescricao').value,
      cgTag: $('cgTag').value, cgNormas: $('cgNormas').value,
      cgPProj: $('cgPProj').value, cgPOper: $('cgPOper').value,
      cgTProj: $('cgTProj').value, cgTOper: $('cgTOper').value,
      cgVida: $('cgVida').value, cgGarantia: $('cgGarantia').value,
      cgPfpEsp: $('cgPfpEsp').value, cgPfpComp: $('cgPfpComp').value,
      cgGerente: $('cgGerente').value, cgCargo: $('cgCargo').value,
    },
    radios: {
      cgAbs: (document.querySelector('input[name=cgAbs]:checked')||{}).value||'SIM',
      cgPfp: (document.querySelector('input[name=cgPfp]:checked')||{}).value||'SIM',
    },
    proc:   document.querySelector('input[name=proc]:checked')?.value||null,
    fichas: [...document.querySelectorAll('input[name=ficha]:checked')].map(el=>el.value),
    pdas:   [...document.querySelectorAll('input[name=pda]:checked')].map(el=>el.value),
    tecnicos,
    uploads,
    uploadNames,
    logoCliente:     STATE.logoCliente     ? bufToB64(STATE.logoCliente)     : null,
    logoClienteType: STATE.logoClienteType || null,
    fotoAntes:       STATE.fotoAntes       ? bufToB64(STATE.fotoAntes)       : null,
    fotoAntesType:   STATE.fotoAntesType   || null,
    fotoDepois:      STATE.fotoDepois      ? bufToB64(STATE.fotoDepois)      : null,
    fotoDepoisType:  STATE.fotoDepoisType  || null,
  };
}

function salvarRascunho(){
  const blob = new Blob([JSON.stringify(coletarRascunho())], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = getDocNumero()+'-rascunho.json';
  a.click();
  URL.revokeObjectURL(url);
}

function carregarRascunho(){
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.json';
  input.onchange = async () => {
    if(!input.files[0]) return;
    try{ await restaurarRascunho(JSON.parse(await input.files[0].text())); }
    catch(e){ alert('Erro ao carregar rascunho: '+e.message); }
  };
  input.click();
}

async function restaurarRascunho(estado){
  // Campos de texto
  for(const [id, val] of Object.entries(estado.campos||{})){
    const el=$(id); if(el) el.value=val;
  }
  updateDocPreview();
  if(typeof updateCertifPreview==='function') updateCertifPreview();

  // Radios
  for(const [name, val] of Object.entries(estado.radios||{})){
    const radio=document.querySelector('input[name='+name+'][value="'+val+'"]');
    if(radio) radio.checked=true;
  }

  // Proc
  if(estado.proc){
    const r=document.querySelector('input[name=proc][value="'+estado.proc+'"]');
    if(r) r.checked=true;
  }

  // Fichas e PDAs
  document.querySelectorAll('input[name=ficha]').forEach(el=>{ el.checked=(estado.fichas||[]).includes(el.value); });
  document.querySelectorAll('input[name=pda]').forEach(el=>{ el.checked=(estado.pdas||[]).includes(el.value); });

  // Técnicos
  for(const tec of (estado.tecnicos||[])){
    const row=document.querySelector('.tecnico-row[data-nome="'+cssEscape(tec.nome)+'"]');
    if(!row) continue;
    const check=row.querySelector('.tec-check');
    if(check){ check.checked=true; row.classList.add('selected'); }
    const sel=row.querySelector('.tec-cert');
    if(sel&&tec.cert) sel.value=tec.cert;
    const jotun=row.querySelector('.tec-jotun');
    if(jotun&&tec.jotunChecked) jotun.checked=true;
  }

  // Uploads (PDFs)
  for(const [key, b64] of Object.entries(estado.uploads||{})){
    if(!b64) continue;
    const bytes=b64ToBytes(b64);
    STATE.uploads[key]=bytes.buffer;
    const nome=(estado.uploadNames||{})[key]||key+'.pdf';
    STATE.uploadNames[key]=nome;
    const nameEl=$(key+'Name'), zoneEl=$(key+'Zone');
    if(nameEl) nameEl.textContent='[OK] '+nome;
    if(zoneEl) zoneEl.classList.add('has-file');
  }

  // Logo cliente
  if(estado.logoCliente){
    STATE.logoCliente=b64ToBytes(estado.logoCliente).buffer;
    STATE.logoClienteType=estado.logoClienteType;
    $('logoClienteName').textContent='[OK] logo-cliente';
    $('logoClienteZone').classList.add('has-file');
  }

  // Fotos
  if(estado.fotoAntes){
    STATE.fotoAntes=b64ToBytes(estado.fotoAntes).buffer;
    STATE.fotoAntesType=estado.fotoAntesType;
    const n=$('fotoAntesName'); if(n) n.textContent='[OK] foto-antes';
    const z=$('fotoAntesZone'); if(z) z.classList.add('has-file');
  }
  if(estado.fotoDepois){
    STATE.fotoDepois=b64ToBytes(estado.fotoDepois).buffer;
    STATE.fotoDepoisType=estado.fotoDepoisType;
    const n=$('fotoDepoisName'); if(n) n.textContent='[OK] foto-depois';
    const z=$('fotoDepoisZone'); if(z) z.classList.add('has-file');
  }

  updateStatus();
  alert('Rascunho carregado com sucesso!');
}
