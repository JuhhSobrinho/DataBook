const ASSETS_CACHE = {};
async function getAsset(cat){
  if(!ASSETS_CACHE[cat]){
    const r = await fetch('../Model/assets-'+cat+'.json');
    const d = await r.json();
    ASSETS_CACHE[cat] = d[cat];
  }
  return ASSETS_CACHE[cat];
}
const STATE = { uploads: {}, uploadNames: {}, logoCliente: null };

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

  const bytes = await pdf.save();
  return new Blob([bytes], {type:'application/pdf'});
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
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  desenhaCabecalhoRodape(page, fontReg, fontBold, logoTeamPng, docNum);

  page.drawRectangle({x: MARGIN, y: PAGE_H-95, width: PAGE_W - 2*MARGIN, height: 32, color: rgb(0.94,0.96,0.98), borderColor: TEAM_BLUE, borderWidth: 0.6});
  page.drawText('Suplemento do Sistema de Qualidade Corporativo', {x: MARGIN+10, y: PAGE_H-78, size: 10, font: fontBold, color: TEAM_GRAY});
  page.drawText('FORM 104.6  -  Rev: 0', {x: PAGE_W - MARGIN - 110, y: PAGE_H-78, size: 9, font: fontReg, color: TEAM_GRAY});
  page.drawText('CERTIFICADO DE CONFORMIDADE', {x: (PAGE_W - fontBold.widthOfTextAtSize('CERTIFICADO DE CONFORMIDADE', 16))/2, y: PAGE_H - 125, size: 16, font: fontBold, color: TEAM_BLUE});

  page.drawText('TISI DO BRASIL SERVICOS INDUSTRIAIS LTDA.', {x: MARGIN, y: PAGE_H-160, size: 10, font: fontBold, color: BLACK});
  page.drawText('Av. Nossa Senhora do Bonsucesso, 3344 - Pindamonhangaba/SP - CEP 12421-200', {x: MARGIN, y: PAGE_H-173, size: 8.5, font: fontReg, color: BLACK});

  let y = PAGE_H - 200;
  function linha(label, value, x){
    page.drawText(label, {x, y: y+1, size: 8.5, font: fontBold, color: TEAM_GRAY});
    page.drawText(value || '-', {x: x + fontBold.widthOfTextAtSize(label, 8.5) + 6, y: y+1, size: 9, font: fontReg, color: BLACK});
  }

  linha('Cliente:', $('cgCliente').value || '-', MARGIN);
  linha('Data:', fmtDate($('cgData').value) || '-', PAGE_W - 200);
  y -= 16;
  linha('Endereco:', $('cgEndereco').value || '-', MARGIN);
  y -= 16;
  linha('# CONTRATO:', $('cgContrato').value || '-', MARGIN);
  linha('# PO:', $('cgPO').value || '-', PAGE_W/2);
  y -= 16;
  linha('# TEAM:', $('cgTeam').value || '-', MARGIN);
  linha('# Certif.:', $('cgCertif').value || '-', MARGIN+200);
  linha('Quant.:', $('cgQuant').value || '1', PAGE_W - 100);
  y -= 16;
  linha('# Serial:', $('cgSerial').value || '-', MARGIN);
  y -= 16;
  linha('PDA:', $('cgPDA').value || '-', MARGIN);

  y -= 28;
  page.drawText('Descricao do Servico:', {x: MARGIN, y, size: 9, font: fontBold, color: TEAM_GRAY});
  y -= 14;
  const desc = $('cgDescricao').value || '';
  const descLinhas = quebrarTexto(desc, fontReg, 9.5, PAGE_W - 2*MARGIN);
  for(const l of descLinhas){
    page.drawText(l, {x: MARGIN, y, size: 9.5, font: fontReg, color: BLACK});
    y -= 13;
  }

  y -= 12;
  const garantia = $('cgGarantia').value || '5';
  const textoFixo = [
    'Certificamos que o servico/material e/ou pecas fornecidos conforme o pedido de compra estao de acordo',
    'com os termos e especificacoes nele contidos, sendo ainda, projetados e calculados em atendimento as',
    'normas regulamentadoras e as condicoes de projeto dos equipamentos, especificado pelo cliente.',
    '',
    'Atestamos para devidos fins que o servico de instalacao do projeto acima desenvolvido pela TEAM',
    'Industrial Services, entre as condicoes de temperatura e pressao de operacao e projeto informados, se',
    'apresenta eficaz e com garantia contratual dentro do periodo de ' + garantia + ' ANOS a partir da data de instalacao.',
    'Para futuras revalidacoes e recertificacoes de reparos realizados e necessario que um tecnico da TEAM',
    'Industrial Services avalie o estado do reparo no local da execucao (in loco) do mesmo.'
  ];
  for(const l of textoFixo){
    page.drawText(l, {x: MARGIN, y, size: 8.5, font: fontReg, color: BLACK});
    y -= 11;
  }

  y -= 12;
  const linhasTec = [
    ['TAG EQUIPAMENTO:', $('cgTag').value || '-'],
    ['PRESSAO DE PROJETO:', ($('cgPProj').value || '-') + ' KPA'],
    ['PRESSAO OPERACAO:', ($('cgPOper').value || '-') + ' KPA'],
    ['TEMPERATURA DE PROJETO:', ($('cgTProj').value || '-') + ' C'],
    ['TEMPERATURA DE OPERACAO:', ($('cgTOper').value || '-') + ' C'],
    ['NORMAS APLICAVEIS:', $('cgNormas').value || '-'],
    ['VIDA UTIL DO REPARO PROJETADO:', ($('cgVida').value || '-') + ' ANOS']
  ];
  for(const [l,v] of linhasTec){
    page.drawText(l, {x: MARGIN, y, size: 9, font: fontBold, color: TEAM_GRAY});
    page.drawText(v, {x: MARGIN+220, y, size: 9.5, font: fontReg, color: BLACK});
    y -= 13;
  }

  y -= 6;
  const abs = (document.querySelector('input[name=cgAbs]:checked')||{}).value || 'SIM';
  const pfp = (document.querySelector('input[name=cgPfp]:checked')||{}).value || 'SIM';
  page.drawText('ENQUADRAMENTO NA CERTIFICADORA ABS:', {x: MARGIN, y, size: 9, font: fontBold, color: TEAM_GRAY});
  page.drawText(abs === 'SIM' ? '( X ) SIM    (   ) NAO' : '(   ) SIM    ( X ) NAO', {x: MARGIN+250, y, size: 9.5, font: fontReg, color: BLACK});
  y -= 14;
  page.drawText('FOI REALIZADO APLICACAO DE PFP:', {x: MARGIN, y, size: 9, font: fontBold, color: TEAM_GRAY});
  page.drawText(pfp === 'SIM' ? '( X ) SIM    (   ) NAO' : '(   ) SIM    ( X ) NAO', {x: MARGIN+210, y, size: 9.5, font: fontReg, color: BLACK});
  if(pfp === 'SIM'){
    page.drawText('Espessura: ' + ($('cgPfpEsp').value||'-') + ' mm    Comprimento: ' + ($('cgPfpComp').value||'-') + ' mm', {x: MARGIN+340, y, size: 9, font: fontReg, color: BLACK});
  }

  y -= 50;
  page.drawLine({start:{x: MARGIN, y}, end:{x: MARGIN+260, y}, thickness: 0.5, color: BLACK});
  y -= 12;
  page.drawText('Assinatura', {x: MARGIN, y, size: 9, font: fontBold, color: TEAM_GRAY});
  y -= 14;
  page.drawText('Nome: ' + ($('cgGerente').value || ''), {x: MARGIN, y, size: 9, font: fontReg, color: BLACK});
  y -= 13;
  page.drawText('Cargo: ' + ($('cgCargo').value || 'Gerente de Contrato'), {x: MARGIN, y, size: 9, font: fontReg, color: BLACK});

  const page2 = pdf.addPage([PAGE_W, PAGE_H]);
  desenhaCabecalhoRodape(page2, fontReg, fontBold, logoTeamPng, docNum);
  page2.drawText('CERTIFICADO DE CONFORMIDADE (cont.)', {x: (PAGE_W - fontBold.widthOfTextAtSize('CERTIFICADO DE CONFORMIDADE (cont.)', 14))/2, y: PAGE_H - 120, size: 14, font: fontBold, color: TEAM_BLUE});
  page2.drawText('FORM 104.6  -  Rev: 0  -  Page 2 of 2', {x: (PAGE_W - fontReg.widthOfTextAtSize('FORM 104.6  -  Rev: 0  -  Page 2 of 2', 9))/2, y: PAGE_H - 140, size: 9, font: fontReg, color: TEAM_GRAY});
  page2.drawText('Antes da Execucao', {x: MARGIN+50, y: PAGE_H-180, size: 11, font: fontBold, color: TEAM_GRAY});
  page2.drawRectangle({x: MARGIN, y: PAGE_H-430, width: 230, height: 240, borderColor: TEAM_BLUE, borderWidth: 0.8, color: rgb(0.97,0.98,0.99)});
  page2.drawText('Depois da Execucao', {x: PAGE_W-MARGIN-230+50, y: PAGE_H-180, size: 11, font: fontBold, color: TEAM_GRAY});
  page2.drawRectangle({x: PAGE_W-MARGIN-230, y: PAGE_H-430, width: 230, height: 240, borderColor: TEAM_BLUE, borderWidth: 0.8, color: rgb(0.97,0.98,0.99)});
  page2.drawLine({start:{x: MARGIN, y: 180}, end:{x: MARGIN+260, y: 180}, thickness: 0.5, color: BLACK});
  page2.drawText('Assinatura', {x: MARGIN, y: 165, size: 9, font: fontBold, color: TEAM_GRAY});
  page2.drawText('Cargo: ' + ($('cgCargo').value || 'Gerente de Contrato'), {x: MARGIN, y: 148, size: 9, font: fontReg, color: BLACK});
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
