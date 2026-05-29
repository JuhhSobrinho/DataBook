const ASSETS_CACHE = {};
async function getAsset(cat){
  if(!ASSETS_CACHE[cat]){
    const r = await fetch('../Model/assets-'+cat+'.json');
    const d = await r.json();
    ASSETS_CACHE[cat] = d[cat];
  }
  return ASSETS_CACHE[cat];
}
const STATE = { uploads: {}, uploadNames: {}, logoCliente: null, logoClienteType: null, fotoAntes: null, fotoAntesType: null, fotoDepois: null, fotoDepoisType: null };

function b64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function fileToBuffer(file){
  return new Promise(r=>{
    const fr = new FileReader();
    fr.onload = ()=>r(fr.result);
    fr.readAsArrayBuffer(file);
  });
}
function $(id){return document.getElementById(id)}
function fmtDate(iso){
  if(!iso) return '';
  const [y,m,d]=iso.split('-');
  return d+'/'+m+'/'+y;
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function cssEscape(s){return s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}
function normaliza(s){return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim()}

function updateDocPreview(){
  $('docPreview').textContent = 'TEAM-8104-'+($('doc1').value||'XX')+'-'+($('doc2').value||'XXXX')+'-RFE-REP-'+($('doc3').value||'XXXX')+'-SS-'+($('doc4').value||'XX')+'-'+($('doc5').value||'20XX');
}
['doc1','doc2','doc3','doc4','doc5'].forEach(id => $(id).addEventListener('input', updateDocPreview));
updateDocPreview();
$('capaData').valueAsDate = new Date();

function setupUpload(inputId, zoneId, nameId, stateKey){
  const inp = $(inputId), zone = $(zoneId), nameLbl = $(nameId);
  inp.addEventListener('change', async ()=>{
    if(!inp.files[0]) return;
    const buf = await fileToBuffer(inp.files[0]);
    STATE.uploads[stateKey] = buf;
    STATE.uploadNames[stateKey] = inp.files[0].name;
    nameLbl.textContent = '[OK] ' + inp.files[0].name;
    zone.classList.add('has-file');
    updateStatus();
  });
}
setupUpload('ssFile','ssZone','ssName','ss');
setupUpload('rdoFile','rdoZone','rdoName','rdo');
setupUpload('relFile','relZone','relName','rel');
setupUpload('memFile','memZone','memName','mem');
setupUpload('arptFile','arptZone','arptName','arpt');

$('logoCliente').addEventListener('change', async ()=>{
  const f = $('logoCliente').files[0];
  if(!f) return;
  STATE.logoCliente = await fileToBuffer(f);
  STATE.logoClienteType = f.type;
  $('logoClienteName').textContent = '[OK] ' + f.name;
  $('logoClienteZone').classList.add('has-file');
  updateStatus();
});

function setupFoto(inputId, zoneId, nameId, stateKey){
  const inp = $(inputId);
  if(!inp) return;
  inp.addEventListener('change', async ()=>{
    if(!inp.files[0]) return;
    STATE[stateKey]         = await fileToBuffer(inp.files[0]);
    STATE[stateKey+'Type']  = inp.files[0].type;
    $(nameId).textContent   = '[OK] ' + inp.files[0].name;
    $(zoneId).classList.add('has-file');
  });
}
setupFoto('fotoAntesFile','fotoAntesZone','fotoAntesName','fotoAntes');
setupFoto('fotoDepoisFile','fotoDepoisZone','fotoDepoisName','fotoDepois');

function updateCertifPreview(){
  const el = $('cgCertifPreview');
  if(!el) return;
  const data = ($('cgData')||{}).value||'';
  const plaqueta = (($('cgPlaqueta')||{}).value||'').trim();
  if(data && plaqueta){
    const [yy,mm,dd] = data.split('-');
    el.textContent = '# Certif: '+dd+mm+yy+'-'+plaqueta;
  } else {
    el.textContent = data ? '(informe a plaqueta)' : '';
  }
}
['cgData','cgPlaqueta'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('input', updateCertifPreview); });

async function buildTecnicosList(){
  const [tecnicos, idcards] = await Promise.all([getAsset('tecnicos'), getAsset('idcards')]);
  const list = $('tecnicosList');
  list.innerHTML = '';
  const nomes = Object.keys(tecnicos).sort();
  const idkeys = Object.keys(idcards);
  const idmap = {};
  for(const n of idkeys) idmap[normaliza(n)] = n;
  for(const nome of nomes){
    const certs = tecnicos[nome];
    const certKeys = Object.keys(certs).sort();
    const idcardMatch = encontraIdcard(nome, idmap);
    const row = document.createElement('div');
    row.className = 'tecnico-row';
    if(idcardMatch) row.classList.add('has-jotun');
    row.dataset.nome = nome;
    let optsHtml = '<option value="">Selecione um certificado</option>';
    for(const c of certKeys){
      optsHtml += '<option value="'+c+'">'+c.replace('-',' Nivel ')+'</option>';
    }
    optsHtml += '<option value="__ALL__">Todos os disponiveis</option>';
    row.innerHTML =
      '<input type="checkbox" class="tec-check" data-nome="'+escapeHtml(nome)+'">'+
      '<div class="nome">'+escapeHtml(nome)+'</div>'+
      '<select class="tec-cert" data-nome="'+escapeHtml(nome)+'">'+optsHtml+'</select>'+
      (idcardMatch ? '<label class="checkbox-inline" title="ID Card Jotachar"><input type="checkbox" class="tec-jotun" data-idcard="'+escapeHtml(idcardMatch)+'"> ID Jotachar</label>' : '');
    list.appendChild(row);
    row.querySelector('.tec-check').addEventListener('change', e=>{
      row.classList.toggle('selected', e.target.checked);
      updateStatus();
    });
    row.querySelector('.tec-cert').addEventListener('change', updateStatus);
    const j = row.querySelector('.tec-jotun');
    if(j) j.addEventListener('change', updateStatus);
  }
}
function encontraIdcard(nome, idmap){
  const n = normaliza(nome);
  if(idmap[n]) return idmap[n];
  const parts = n.split(' ');
  const primeiro = parts[0], ultimo = parts[parts.length-1];
  for(const k of Object.keys(idmap)){
    if(k.includes(primeiro) && k.includes(ultimo)) return idmap[k];
    if(primeiro.length>3 && ultimo.length>3){
      const kp = k.split(' ');
      if(kp[0] === primeiro && kp[kp.length-1] === ultimo) return idmap[k];
    }
  }
  return null;
}
buildTecnicosList();

$('searchTec').addEventListener('input', e=>{
  const q = normaliza(e.target.value);
  document.querySelectorAll('.tecnico-row').forEach(row=>{
    const n = normaliza(row.dataset.nome);
    row.style.display = n.includes(q) ? '' : 'none';
  });
});

function updateStatus(){
  let count = 0;
  if($('capaElab').value.trim()) count++;
  document.querySelector('aside li:nth-child(1) a').classList.toggle('done', !!$('capaElab').value.trim());
  const tag2 = !!$('tagEquip').value.trim();
  if(tag2) count++;
  document.querySelector('aside li:nth-child(2) a').classList.toggle('done', tag2);
  const ups = [['ss',3],['rdo',4],['rel',5],['mem',6],['arpt',10]];
  for(const [k,n] of ups){
    const ok = !!STATE.uploads[k];
    if(ok) count++;
    document.querySelector('aside li:nth-child('+n+') a').classList.toggle('done', ok);
  }
  const proc = document.querySelector('input[name=proc]:checked');
  if(proc) count++;
  document.querySelector('aside li:nth-child(7) a').classList.toggle('done', !!proc);
  const fichas = document.querySelectorAll('input[name=ficha]:checked');
  if(fichas.length) count++;
  document.querySelector('aside li:nth-child(8) a').classList.toggle('done', fichas.length>0);
  const pdas = document.querySelectorAll('input[name=pda]:checked');
  if(pdas.length) count++;
  document.querySelector('aside li:nth-child(9) a').classList.toggle('done', pdas.length>0);
  const cgOk = $('cgCliente').value.trim() && $('cgTag').value.trim();
  if(cgOk) count++;
  document.querySelector('aside li:nth-child(11) a').classList.toggle('done', cgOk);
  const tec = document.querySelectorAll('.tec-check:checked');
  if(tec.length) count++;
  document.querySelector('aside li:nth-child(12) a').classList.toggle('done', tec.length>0);
  $('statusCount').textContent = count;
  let pages = 3;
  for(let i=1;i<=10;i++) pages += 1;
  for(const k of ['ss','rdo','rel','mem','arpt']) if(STATE.uploads[k]) pages += 2;
  if(proc) pages += 21;
  pages += fichas.length * 4;
  pages += pdas.length * 3;
  if(cgOk) pages += 2;
  pages += tec.length * 1.5;
  $('totalPages').innerHTML = '- estimativa: <strong>' + Math.round(pages) + '</strong> paginas';
}
['capaElab','tagEquip','cgCliente','cgTag'].forEach(id=>$(id).addEventListener('input', updateStatus));
document.querySelectorAll('input[name=proc],input[name=ficha],input[name=pda]').forEach(el=>el.addEventListener('change', updateStatus));
document.querySelectorAll('.nav-link').forEach(a=>{
  a.addEventListener('click', e=>{
    document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
    a.classList.add('active');
  });
});
updateStatus();

const { PDFDocument, StandardFonts, rgb } = PDFLib;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const TEAM_BLUE = rgb(0/255, 94/255, 184/255);
const TEAM_GRAY = rgb(0.23, 0.27, 0.32);
const BLACK = rgb(0,0,0);

async function gerarPDF(){
  const btn = $('btnGerar');
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Gerando...';
  try{
    const blob = await montarDatabook();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getDocNumero() + '.pdf';
    a.click();
    URL.revokeObjectURL(url);
    btn.innerHTML = 'OK - PDF gerado!';
    setTimeout(()=>{btn.innerHTML = orig; btn.disabled=false;}, 2500);
  }catch(e){
    console.error(e);
    alert('Erro ao gerar PDF: '+e.message);
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}
function getDocNumero(){
  return 'TEAM-8104-'+($('doc1').value||'XX')+'-'+($('doc2').value||'XXXX')+'-RFE-REP-'+($('doc3').value||'XXXX')+'-SS-'+($('doc4').value||'XX')+'-'+($('doc5').value||'20XX');
}
async function abrirPreview(){
  $('previewModal').classList.add('show');
  $('previewFrame').src = 'about:blank';
  try{
    const blob = await montarDatabook();
    const url = URL.createObjectURL(blob);
    $('previewFrame').src = url;
  }catch(e){ alert('Erro: '+e.message) }
}
function fecharPreview(){ $('previewModal').classList.remove('show') }
function aprovarRevisao(){
  const nome = $('revisorNome').value.trim();
  if(!nome){ alert('Digite o nome do revisor.'); return; }
  $('capaRev').value = nome;
  alert('Revisor "'+nome+'" fixado na capa.');
  fecharPreview();
  updateStatus();
}

async function montarDatabook(){
  const pdf = await PDFDocument.create();
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [logo, procedimentos, fichas, pda, tecnicos, idcards] = await Promise.all([
    getAsset('logo'), getAsset('procedimentos'), getAsset('fichas'),
    getAsset('pda'), getAsset('tecnicos'), getAsset('idcards')
  ]);
  const logoTeamPng = await pdf.embedPng(b64ToBytes(logo));
  const docNum = getDocNumero();
  const tag = $('tagEquip').value.trim();

  await desenhaCapa(pdf, fontReg, fontBold, logoTeamPng, docNum);
  await desenhaContracapa(pdf, fontReg, fontBold, logoTeamPng, docNum, tag);
  await desenhaIndice(pdf, fontReg, fontBold, logoTeamPng, docNum);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '1', 'SOLICITACAO DE SERVICO');
  if(STATE.uploads.ss) await anexarPdf(pdf, STATE.uploads.ss);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '2', 'RELATORIO DIARIO DE OPERACOES');
  if(STATE.uploads.rdo) await anexarPdf(pdf, STATE.uploads.rdo);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '3', 'RELATORIO DE EXECUCAO');
  if(STATE.uploads.rel) await anexarPdf(pdf, STATE.uploads.rel);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '4', 'PROJETO');
  if(STATE.uploads.mem) await anexarPdf(pdf, STATE.uploads.mem);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '5', 'PROCEDIMENTOS');
  const proc = document.querySelector('input[name=proc]:checked');
  if(proc) await anexarPdf(pdf, b64ToBytes(procedimentos[proc.value]));

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '6', 'FICHA TECNICA');
  for(const c of document.querySelectorAll('input[name=ficha]:checked')){
    await anexarPdf(pdf, b64ToBytes(fichas[c.value]));
  }

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '7', 'PDA');
  for(const c of document.querySelectorAll('input[name=pda]:checked')){
    await anexarPdf(pdf, b64ToBytes(pda[c.value]));
  }

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '8', 'ANALISE DE RISCO DO REPARO');
  if(STATE.uploads.arpt) await anexarPdf(pdf, STATE.uploads.arpt);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '9', 'CERTIFICADO DE GARANTIA');
  await desenhaCertificadoGarantia(pdf, fontReg, fontBold, logoTeamPng);

  await desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, '10', 'CERTIFICADOS DE QUALIFICACAO DOS TECNICOS');
  for(const cb of document.querySelectorAll('.tec-check:checked')){
    const nome = cb.dataset.nome;
    const sel = document.querySelector('.tec-cert[data-nome="'+cssEscape(nome)+'"]');
    if(!sel || !sel.value) continue;
    const certs = tecnicos[nome];
    if(sel.value === '__ALL__'){
      for(const k of Object.keys(certs).sort()){
        await anexarPdf(pdf, b64ToBytes(certs[k]));
      }
    }else if(certs[sel.value]){
      await anexarPdf(pdf, b64ToBytes(certs[sel.value]));
    }
  }
  for(const cb of document.querySelectorAll('.tec-jotun:checked')){
    const idname = cb.dataset.idcard;
    const card = idcards[idname];
    if(card) await anexarPdf(pdf, b64ToBytes(card.pdf));
  }

  desenhaEncerramento(pdf, fontReg, fontBold, logoTeamPng, docNum);

  const bytes = await pdf.save();
  return new Blob([bytes], {type:'application/pdf'});
}

function desenhaEncerramento(pdf, fontReg, fontBold, logoTeamPng, docNum){
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  // ---- HEADER (mesmo estilo das outras páginas) ----
  const lw = 150, lh = Math.round(150 * 0.103);
  page.drawImage(logoTeamPng, {x: MARGIN, y: PAGE_H - 48, width: lw, height: lh});
  page.drawLine({start:{x: MARGIN+lw+18, y: PAGE_H-14}, end:{x: MARGIN+lw+18, y: PAGE_H-62}, thickness:1.5, color:TEAM_BLUE});
  const tx = MARGIN + lw + 30;
  page.drawText('RELATORIO FINAL DE EXECUCAO', {x:tx, y:PAGE_H-30, size:14, font:fontBold, color:TEAM_GRAY});
  page.drawText(docNum,                         {x:tx, y:PAGE_H-48, size:10, font:fontBold, color:TEAM_BLUE});
  page.drawLine({start:{x:MARGIN, y:PAGE_H-66}, end:{x:PAGE_W-MARGIN, y:PAGE_H-66}, thickness:1.8, color:TEAM_BLUE});

  // ---- SEÇÃO DE ENCERRAMENTO (parte inferior da página) ----
  let y = 345;
  page.drawText('Atenciosamente,', {x:MARGIN, y, size:10, font:fontReg, color:TEAM_BLUE});
  y -= 32;
  page.drawText('Anderson Andrade',       {x:MARGIN, y, size:13, font:fontBold, color:TEAM_BLUE});
  y -= 16;
  page.drawText('Gerente de LCR / OSR',   {x:MARGIN, y, size:10, font:fontReg,  color:TEAM_BLUE});
  y -= 14;
  page.drawText('Leak Repair Service Line',{x:MARGIN, y, size:10, font:fontReg, color:TEAM_BLUE});
  y -= 32;

  // Logo TEAM (versão maior na seção de contato)
  const cLw = 180, cLh = Math.round(180 * 0.103);
  page.drawImage(logoTeamPng, {x:MARGIN, y, width:cLw, height:cLh});
  y -= 22;

  // Dados de contato
  for(const l of [
    'Avenida Nossa Senhora do Bom Sucesso, 3344 | Alto do Cardoso | Pindamonhangaba-SP | Brazil',
    '+55 12 3645-9104 direct',
    'anderson.andrade@TeamInc.com',
    'www.TeamInc.com',
  ]){
    page.drawText(l, {x:MARGIN, y, size:8.5, font:fontReg, color:TEAM_BLUE});
    y -= 13;
  }

  // ---- RODAPÉ ----
  page.drawLine({start:{x:MARGIN, y:35}, end:{x:PAGE_W-MARGIN, y:35}, thickness:0.8, color:TEAM_BLUE});
  const boldLabel = 'TEAM Industrial Services';
  page.drawText(boldLabel, {x:MARGIN, y:23, size:7, font:fontBold, color:TEAM_GRAY});
  const bLw = fontBold.widthOfTextAtSize(boldLabel, 7);
  page.drawText(' Avenida Nossa Senhora do Bom Sucesso, 3344 - Alto do Cardoso - Pindamonhangaba/SP, Brazil 12420-010', {x:MARGIN+bLw, y:23, size:7, font:fontReg, color:TEAM_GRAY});
  page.drawText(docNum, {x:PAGE_W-MARGIN-fontReg.widthOfTextAtSize(docNum,7), y:23, size:7, font:fontReg, color:TEAM_GRAY});
  const foot2 = '+55 12 3645-9104 | anderson.andrade@TeamInc.com | ';
  page.drawText(foot2, {x:MARGIN, y:11, size:7, font:fontReg, color:TEAM_GRAY});
  page.drawText('www.TeamInc.com', {x:MARGIN+fontReg.widthOfTextAtSize(foot2,7), y:11, size:7, font:fontBold, color:TEAM_GRAY});
}

async function anexarPdf(targetPdf, source){
  try{
    const src = await PDFDocument.load(source, {ignoreEncryption:true});
    const idx = src.getPageIndices();
    const pages = await targetPdf.copyPages(src, idx);
    pages.forEach(p=>targetPdf.addPage(p));
  }catch(e){ console.error('anexarPdf:', e) }
}

function desenhaCabecalhoRodape(page, fontReg, fontBold, logoPng, docNum){
  const lw = 110, lh = 110*0.103;
  page.drawImage(logoPng, {x: MARGIN, y: PAGE_H - 38, width: lw, height: lh});
  const titulo = 'RELATORIO FINAL DE EXECUCAO';
  page.drawText(titulo, {x: PAGE_W - MARGIN - fontBold.widthOfTextAtSize(titulo,9), y: PAGE_H-25, size: 9, font: fontBold, color: TEAM_GRAY});
  page.drawText(docNum, {x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(docNum,8), y: PAGE_H-37, size: 8, font: fontReg, color: TEAM_GRAY});
  page.drawLine({start:{x:MARGIN,y:PAGE_H-50}, end:{x:PAGE_W-MARGIN,y:PAGE_H-50}, thickness:0.8, color: TEAM_BLUE});
  const footTxt = 'TEAM Industrial Services - Av. N. S. do Bom Sucesso, 3344 - Pindamonhangaba/SP - +55 12 3645-9104';
  page.drawLine({start:{x:MARGIN,y:35}, end:{x:PAGE_W-MARGIN,y:35}, thickness:0.5, color: TEAM_BLUE});
  page.drawText(footTxt, {x: MARGIN, y: 22, size:7, font: fontReg, color: TEAM_GRAY});
  page.drawText(docNum, {x: PAGE_W - MARGIN - fontReg.widthOfTextAtSize(docNum,7), y: 22, size:7, font: fontReg, color: TEAM_GRAY});
}

async function desenhaCapa(pdf, fontReg, fontBold, logoTeamPng, docNum){
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({x:0, y:0, width:12, height: PAGE_H, color: TEAM_BLUE});
  const lw = 240, lh = 240*0.103;
  page.drawImage(logoTeamPng, {x: (PAGE_W-lw)/2, y: PAGE_H - 130, width: lw, height: lh});
  if(STATE.logoCliente){
    try{
      let img;
      const type = STATE.logoClienteType || 'image/png';
      if(type === 'image/jpeg' || type === 'image/jpg') img = await pdf.embedJpg(STATE.logoCliente);
      else img = await pdf.embedPng(STATE.logoCliente);
      const sc = Math.min(180 / img.width, 100 / img.height);
      const cw = img.width*sc, ch = img.height*sc;
      page.drawImage(img, {x:(PAGE_W-cw)/2, y: PAGE_H - 270, width:cw, height:ch});
    }catch(e){console.warn('logo cliente:', e)}
  }
  page.drawLine({start:{x:60,y:PAGE_H/2 + 50}, end:{x:PAGE_W-60,y:PAGE_H/2 + 50}, thickness:1.5, color: TEAM_BLUE});
  const t1 = 'RELATORIO FINAL DE EXECUCAO';
  page.drawText(t1, {x: (PAGE_W - fontBold.widthOfTextAtSize(t1, 20))/2, y: PAGE_H/2 + 15, size: 20, font: fontBold, color: TEAM_GRAY});
  page.drawText(docNum, {x: (PAGE_W - fontBold.widthOfTextAtSize(docNum, 16))/2, y: PAGE_H/2 - 25, size: 16, font: fontBold, color: TEAM_BLUE});
  page.drawLine({start:{x:60,y:PAGE_H/2 - 50}, end:{x:PAGE_W-60,y:PAGE_H/2 - 50}, thickness:1.5, color: TEAM_BLUE});

  const boxY = 180;
  page.drawRectangle({x: 60, y: boxY, width: PAGE_W-120, height: 80, borderColor: TEAM_BLUE, borderWidth: 1, color: rgb(0.97,0.98,0.99)});
  const elab = $('capaElab').value.trim() || '___________________';
  const rev = $('capaRev').value.trim() || '___________________';
  const dt = fmtDate($('capaData').value) || '___________';
  page.drawText('ELABORADO POR:', {x: 75, y: boxY+55, size:9, font: fontBold, color: TEAM_GRAY});
  page.drawText(elab, {x: 75, y: boxY+38, size:11, font: fontReg, color: BLACK});
  page.drawText('REVISADO POR:', {x: 230, y: boxY+55, size:9, font: fontBold, color: TEAM_GRAY});
  page.drawText(rev, {x: 230, y: boxY+38, size:11, font: fontReg, color: BLACK});
  page.drawText('DATA:', {x: 410, y: boxY+55, size:9, font: fontBold, color: TEAM_GRAY});
  page.drawText(dt, {x: 410, y: boxY+38, size:11, font: fontReg, color: BLACK});

  const endLines = [
    'TEAM do Brasil - Servicos Industriais Ltda',
    'Avenida Nossa Senhora do Bom Sucesso, 3344',
    'Alto do Cardoso - Pindamonhangaba/SP - CEP 12420-010',
    '+55 12 3645-9104  |  www.teaminc.com'
  ];
  let y = 110;
  for(const l of endLines){
    page.drawText(l, {x: (PAGE_W - fontReg.widthOfTextAtSize(l, 9))/2, y, size: 9, font: fontReg, color: TEAM_GRAY});
    y -= 13;
  }
  page.drawText('Furos em Carga | Reparo de Vazamentos | Usinagem de Campo | Reparo de Valvulas | Reparo com Compositos | Inspecao',
    {x: 40, y: 30, size: 6.5, font: fontReg, color: TEAM_GRAY});
}

async function desenhaContracapa(pdf, fontReg, fontBold, logoTeamPng, docNum, tag){
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  desenhaCabecalhoRodape(page, fontReg, fontBold, logoTeamPng, docNum);
  page.drawText(docNum, {x: (PAGE_W - fontBold.widthOfTextAtSize(docNum, 18))/2, y: PAGE_H/2 + 60, size: 18, font: fontBold, color: TEAM_BLUE});
  page.drawLine({start:{x:80,y:PAGE_H/2 + 40}, end:{x:PAGE_W-80,y:PAGE_H/2 + 40}, thickness:1, color: TEAM_BLUE});
  page.drawText('TAG do Equipamento / Linha Reparada', {x: (PAGE_W - fontReg.widthOfTextAtSize('TAG do Equipamento / Linha Reparada', 11))/2, y: PAGE_H/2 + 10, size: 11, font: fontReg, color: TEAM_GRAY});
  page.drawText(tag || '_________________', {x: (PAGE_W - fontBold.widthOfTextAtSize(tag || '_________________', 22))/2, y: PAGE_H/2 - 20, size: 22, font: fontBold, color: BLACK});
}

async function desenhaIndice(pdf, fontReg, fontBold, logoTeamPng, docNum){
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  desenhaCabecalhoRodape(page, fontReg, fontBold, logoTeamPng, docNum);
  page.drawText('INDICE', {x: (PAGE_W - fontBold.widthOfTextAtSize('INDICE', 22))/2, y: PAGE_H - 130, size: 22, font: fontBold, color: TEAM_GRAY});
  page.drawLine({start:{x:MARGIN+30,y:PAGE_H-150}, end:{x:PAGE_W-MARGIN-30,y:PAGE_H-150}, thickness:1, color: TEAM_BLUE});
  const itens = [
    ['1', 'SOLICITACAO DE SERVICO'],
    ['2', 'RELATORIO DIARIO DE OPERACOES'],
    ['3', 'RELATORIO DE EXECUCAO'],
    ['4', 'PROJETO'],
    ['5', 'PROCEDIMENTOS'],
    ['6', 'FICHA TECNICA'],
    ['7', 'PDA'],
    ['8', 'ANALISE DE RISCO DO REPARO'],
    ['9', 'CERTIFICADO DE GARANTIA'],
    ['10', 'CERTIFICADOS DE QUALIFICACAO DOS TECNICOS']
  ];
  let y = PAGE_H - 200;
  for(const [n, lbl] of itens){
    page.drawText(n, {x: MARGIN+50, y, size: 13, font: fontBold, color: TEAM_BLUE});
    page.drawText(lbl, {x: MARGIN+90, y, size: 13, font: fontReg, color: BLACK});
    y -= 32;
  }
}

async function desenhaSeparador(pdf, fontReg, fontBold, logoTeamPng, docNum, num, titulo){
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  desenhaCabecalhoRodape(page, fontReg, fontBold, logoTeamPng, docNum);
  page.drawText(num, {x: (PAGE_W - fontBold.widthOfTextAtSize(num, 80))/2, y: PAGE_H/2 + 30, size: 80, font: fontBold, color: TEAM_BLUE});
  page.drawText(titulo, {x: (PAGE_W - fontBold.widthOfTextAtSize(titulo, 18))/2, y: PAGE_H/2 - 30, size: 18, font: fontBold, color: TEAM_GRAY});
  page.drawLine({start:{x:100,y:PAGE_H/2 - 50}, end:{x:PAGE_W-100,y:PAGE_H/2 - 50}, thickness:1.5, color: TEAM_BLUE});
}

async function desenhaCertificadoGarantia(pdf, fontReg, fontBold, logoTeamPng){
  const docNum = getDocNumero();
  const footTxt = 'TISI do Brasil Servicos Industriais Ltda  |  (12) 3645-9104';

  function gerarCertif(){
    const data = $('cgData').value;
    const plaqueta = (($('cgPlaqueta')||{}).value||'').trim();
    if(!data) return plaqueta||'-';
    const [yy,mm,dd] = data.split('-');
    return dd+mm+yy+(plaqueta?'-'+plaqueta:'');
  }

  function desenhaHeaderCert(pg, pageLabel){
    const HY=PAGE_H-75, HH=68, logoColW=115, rightColW=115;
    const midX=MARGIN+logoColW, rightX=PAGE_W-MARGIN-rightColW, fx=rightX+8;
    pg.drawRectangle({x:MARGIN, y:HY, width:PAGE_W-2*MARGIN, height:HH, borderColor:BLACK, borderWidth:0.8, color:rgb(1,1,1)});
    pg.drawLine({start:{x:midX,y:HY}, end:{x:midX,y:HY+HH}, thickness:0.8, color:BLACK});
    pg.drawLine({start:{x:rightX,y:HY}, end:{x:rightX,y:HY+HH}, thickness:0.8, color:BLACK});
    const lw=105, lh=Math.round(105*0.103);
    pg.drawImage(logoTeamPng, {x:MARGIN+(logoColW-lw)/2, y:HY+(HH-lh)/2, width:lw, height:lh});
    pg.drawText('Suplemento do Sistema de', {x:midX+10, y:HY+44, size:9.5, font:fontBold, color:TEAM_GRAY});
    pg.drawText('Qualidade Corporativo',    {x:midX+10, y:HY+29, size:9.5, font:fontBold, color:TEAM_GRAY});
    pg.drawText('FORM 104.6', {x:fx, y:HY+53, size:9, font:fontBold, color:BLACK});
    pg.drawLine({start:{x:rightX,y:HY+43}, end:{x:PAGE_W-MARGIN,y:HY+43}, thickness:0.4, color:BLACK});
    pg.drawText('Rev: 0',     {x:fx, y:HY+30, size:9, font:fontReg,  color:BLACK});
    pg.drawLine({start:{x:rightX,y:HY+20}, end:{x:PAGE_W-MARGIN,y:HY+20}, thickness:0.4, color:BLACK});
    pg.drawText(pageLabel,   {x:fx, y:HY+7,  size:9, font:fontReg,  color:BLACK});
    const titleY=HY-28;
    pg.drawRectangle({x:MARGIN, y:titleY, width:PAGE_W-2*MARGIN, height:25, borderColor:BLACK, borderWidth:0.8, color:rgb(1,1,1)});
    const t='CERTIFICADO DE CONFORMIDADE';
    pg.drawText(t, {x:(PAGE_W-fontBold.widthOfTextAtSize(t,13))/2, y:titleY+7, size:13, font:fontBold, color:TEAM_BLUE});
    return titleY;
  }

  // ---- PAGINA 1 ----
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const titleY1 = desenhaHeaderCert(page, 'Page 1 of 2');
  page.drawText(footTxt, {x:MARGIN, y:22, size:7, font:fontReg, color:TEAM_GRAY});
  page.drawText(docNum,  {x:PAGE_W-MARGIN-fontReg.widthOfTextAtSize(docNum,7), y:22, size:7, font:fontReg, color:TEAM_GRAY});

  let y = titleY1 - 16;
  for(const l of [
    'TISI DO BRASIL SERVICOS INDUSTRIAIS LTDA.',
    'Av. Nossa Senhora do Bonsucesso, 3344  -  Nossa Senhora Perpetuo Socorro',
    'CEP 12421-200    Fone: (12) 3645-9104'
  ]){
    page.drawText(l, {x:(PAGE_W-fontReg.widthOfTextAtSize(l,8.5))/2, y, size:8.5, font:fontReg, color:BLACK});
    y-=12;
  }
  y-=8;

  function hLine(yy){ page.drawLine({start:{x:MARGIN,y:yy}, end:{x:PAGE_W-MARGIN,y:yy}, thickness:0.35, color:rgb(0.75,0.75,0.75)}); }
  function campo(label, value, x, yy){
    page.drawText(label, {x, y:yy, size:8.5, font:fontBold, color:TEAM_GRAY});
    page.drawText(String(value||'-'), {x:x+fontBold.widthOfTextAtSize(label,8.5)+5, y:yy, size:9, font:fontReg, color:BLACK});
  }

  campo('Cliente:', $('cgCliente').value, MARGIN, y);
  campo('Data:', fmtDate($('cgData').value)||'-', PAGE_W-190, y);
  y-=14; hLine(y); y-=12;
  campo('Endereco:', $('cgEndereco').value, MARGIN, y);
  y-=14; hLine(y); y-=12;
  campo('#CONTRATO:', $('cgContrato').value, MARGIN, y);
  campo('# OS Cliente:', $('cgPO').value, MARGIN+260, y);
  y-=14; hLine(y); y-=12;
  campo('# TEAM:', $('cgTeam').value, MARGIN, y);
  y-=14; hLine(y); y-=12;
  campo('#Certif.:', gerarCertif(), MARGIN, y);
  campo('#Serial:', $('cgSerial').value, MARGIN+200, y);
  campo('Quant.:', $('cgQuant').value||'1', PAGE_W-110, y);
  y-=14; hLine(y); y-=14;

  page.drawText('Descricao:', {x:MARGIN, y, size:8.5, font:fontBold, color:TEAM_GRAY}); y-=12;
  for(const l of quebrarTexto($('cgDescricao').value||'', fontReg, 9, PAGE_W-2*MARGIN)){
    page.drawText(l, {x:MARGIN, y, size:9, font:fontReg, color:BLACK}); y-=12;
  }
  y-=8; hLine(y); y-=12;

  const garantia = $('cgGarantia').value||'5';
  for(const l of [
    'Certificamos que o servico/material e/ou pecas fornecidos conforme o pedido de compra estao de acordo com os termos e',
    'especificacoes nele contidos, sendo ainda, projetados e calculados em atendimento as normas regulamentadoras e as',
    'condicoes de projeto dos equipamentos, especificado pelo cliente.',
  ]){ page.drawText(l, {x:MARGIN, y, size:8, font:fontBold, color:BLACK}); y-=10; }
  y-=4;
  for(const l of [
    'Atestamos para devidos fins que o servico de instalacao do projeto acima desenvolvido pela Team Industrial Services,',
    'entre as condicoes de temperatura e pressao de operacao e projeto informados, se apresenta eficaz e com garantia',
    'contratual dentro do periodo de '+garantia+' ANOS a partir da data de instalacao. Para futuras revalidacoes e',
    'recertificacoes de reparos realizados e necessario que um tecnico da Team Industrial Services avalie o estado do reparo',
    'no local da execucao (In loco) do mesmo.',
  ]){ page.drawText(l, {x:MARGIN, y, size:8, font:fontReg, color:BLACK}); y-=10; }
  y-=10; hLine(y); y-=14;

  const labelW=220, tecStartX=(PAGE_W-(labelW+180))/2;
  for(const [l,v] of [
    ['TAG EQUIPAMENTO:',          $('cgTag').value||'-'],
    ['PRESSAO DE PROJETO:',       ($('cgPProj').value||'-')+' BAR'],
    ['PRESSAO OPERACAO:',         ($('cgPOper').value||'-')+' BAR'],
    ['TEMPERATURA DE PROJETO:',   ($('cgTProj').value||'-')+'° C'],
    ['TEMPERATURA DE OPERACAO:',  ($('cgTOper').value||'-')+'° C'],
    ['NORMAS APLICAVEIS:',        $('cgNormas').value||'-'],
    ['VIDA UTIL DO REPARO PROJETADO:', $('cgVida').value||'N/A'],
  ]){
    page.drawText(l, {x:tecStartX,       y, size:8.5, font:fontBold, color:TEAM_GRAY});
    page.drawText(v, {x:tecStartX+labelW, y, size:9,   font:fontReg,  color:BLACK});
    y-=12;
  }
  y-=8;

  const abs=(document.querySelector('input[name=cgAbs]:checked')||{}).value||'SIM';
  const pfp=(document.querySelector('input[name=cgPfp]:checked')||{}).value||'SIM';
  page.drawText('ENQUADRAMENTO NA CERTIFICADORA ABS:', {x:MARGIN, y, size:8.5, font:fontBold, color:TEAM_GRAY});
  page.drawText(abs==='SIM'?'( X ) SIM   (   ) NAO':'(   ) SIM   ( X ) NAO', {x:MARGIN+258, y, size:9, font:fontReg, color:BLACK});
  y-=14;
  page.drawText('REALIZADO APLICACAO DE PFP:', {x:MARGIN, y, size:8.5, font:fontBold, color:TEAM_GRAY});
  page.drawText(pfp==='SIM'?'( X ) SIM   (   ) NAO':'(   ) SIM   ( X ) NAO', {x:MARGIN+195, y, size:9, font:fontReg, color:BLACK});
  if(pfp==='SIM')
    page.drawText('ESPESSURA '+($('cgPfpEsp').value||'-')+' MM   COMP-'+($('cgPfpComp').value||'-')+'MM', {x:MARGIN+370, y, size:8.5, font:fontReg, color:BLACK});

  y-=45;
  page.drawLine({start:{x:MARGIN,y}, end:{x:MARGIN+280,y}, thickness:0.5, color:BLACK});
  y-=12; page.drawText('Assinatura :', {x:MARGIN, y, size:9, font:fontBold, color:TEAM_GRAY});
  y-=14; page.drawText('Cargo: '+($('cgCargo').value||'Gerente de Contrato'), {x:MARGIN, y, size:9, font:fontReg, color:BLACK});

  // ---- PAGINA 2 ----
  const page2 = pdf.addPage([PAGE_W, PAGE_H]);
  const titleY2 = desenhaHeaderCert(page2, 'Page 2 of 2');
  page2.drawText(footTxt, {x:MARGIN, y:22, size:7, font:fontReg, color:TEAM_GRAY});
  page2.drawText(docNum,  {x:PAGE_W-MARGIN-fontReg.widthOfTextAtSize(docNum,7), y:22, size:7, font:fontReg, color:TEAM_GRAY});

  const fotoW=230, fotoH=260, fotoY=titleY2-30-fotoH;
  const fotoAntesX=MARGIN, fotoDepoisX=PAGE_W-MARGIN-fotoW;

  page2.drawText('Antes da Execucao do Servico', {
    x:fotoAntesX+(fotoW-fontBold.widthOfTextAtSize('Antes da Execucao do Servico',9.5))/2,
    y:titleY2-18, size:9.5, font:fontBold, color:TEAM_GRAY});
  page2.drawText('Apos Execucao do Servico', {
    x:fotoDepoisX+(fotoW-fontBold.widthOfTextAtSize('Apos Execucao do Servico',9.5))/2,
    y:titleY2-18, size:9.5, font:fontBold, color:TEAM_GRAY});

  async function desenhaFoto(buf, tipo, x){
    page2.drawRectangle({x, y:fotoY, width:fotoW, height:fotoH, borderColor:BLACK, borderWidth:0.6, color:rgb(1,1,1)});
    if(!buf) return;
    try{
      const img = tipo&&tipo.includes('png')
        ? await pdf.embedPng(new Uint8Array(buf))
        : await pdf.embedJpg(new Uint8Array(buf));
      const d=img.scaleToFit(fotoW-8, fotoH-8);
      page2.drawImage(img, {x:x+(fotoW-d.width)/2, y:fotoY+(fotoH-d.height)/2, width:d.width, height:d.height});
    }catch(e){ console.error('foto embed:',e); }
  }
  await desenhaFoto(STATE.fotoAntes,  STATE.fotoAntesType,  fotoAntesX);
  await desenhaFoto(STATE.fotoDepois, STATE.fotoDepoisType, fotoDepoisX);

  const lblBoxY=fotoY-20;
  function labelBox(x, txt){
    page2.drawRectangle({x, y:lblBoxY, width:fotoW, height:18, borderColor:BLACK, borderWidth:0.6, color:rgb(1,1,1)});
    page2.drawText(txt, {x:x+(fotoW-fontBold.widthOfTextAtSize(txt,9))/2, y:lblBoxY+5, size:9, font:fontBold, color:BLACK});
  }
  labelBox(fotoAntesX,  'Antes da Execucao do Servico');
  labelBox(fotoDepoisX, 'Apos Execucao do Servico');

  const sig2Y=lblBoxY-55;
  page2.drawLine({start:{x:MARGIN,y:sig2Y}, end:{x:MARGIN+280,y:sig2Y}, thickness:0.5, color:BLACK});
  page2.drawText('Assinatura :', {x:MARGIN, y:sig2Y-12, size:9, font:fontBold, color:TEAM_GRAY});
  page2.drawText('Cargo: '+($('cgCargo').value||'Gerente de Contrato'), {x:MARGIN, y:sig2Y-26, size:9, font:fontReg, color:BLACK});
}

function quebrarTexto(txt, font, size, maxW){
  const palavras = txt.split(/\s+/);
  const linhas = [];
  let atual = '';
  for(const p of palavras){
    const test = atual ? atual + ' ' + p : p;
    if(font.widthOfTextAtSize(test, size) > maxW){
      if(atual) linhas.push(atual);
      atual = p;
    }else{
      atual = test;
    }
  }
  if(atual) linhas.push(atual);
  return linhas;
}
