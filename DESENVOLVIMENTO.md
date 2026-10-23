# Guia de Desenvolvimento — DataBook

Documentação técnica para quem vai desenvolver/manter o projeto. O [README.md](README.md) explica o que o app faz e como usar; este documento é sobre **como o código funciona por dentro** — arquitetura, fluxo de dados, decisões de implementação e "receitas" para as manutenções mais comuns.

> Os números de linha citados aqui referem-se ao código no momento em que este guia foi escrito. Se o arquivo crescer/for reorganizado, use-os como ponto de partida e confirme pelo nome da função (busca por texto), não confie neles cegamente.

---

## 1. Arquitetura em uma frase

Tudo roda no navegador, sem back-end. O formulário lê assets estáticos de `Model/*.json` (arquivos em base64), monta o PDF inteiro em memória com **pdf-lib**, e usa **PDF.js** para renderizar miniaturas/preview e permitir edição visual antes do download. Hospedado como site estático (GitHub Pages), com Service Worker para funcionar offline.

```
index.html (portao de senha)
      │
      ▼
View/index-form-databook.html  ← formulario (HTML), carrega os scripts abaixo
      │
      ├── Controller/main.js    ← toda a logica: estado, geracao de PDF, preview, editor, compressao
      ├── Controller/draft.js   ← salvar/carregar rascunho em JSON
      └── Model/assets-*.json   ← assets estaticos em base64 (logo, fichas, certificados, procedimentos...)
```

Não existe build step, bundler ou transpilação. Editar um `.js`/`.html`/`.css` e recarregar a página já reflete a mudança — **exceto** quando o Service Worker está ativo (ver [seção 10](#10-pwa--service-worker-swjs)).

Bibliotecas de terceiros (carregadas via CDN em `View/index-form-databook.html`):
- **pdf-lib 1.17.1** — cria e desenha o PDF final (vetorial: texto, linhas, retângulos, imagens).
- **PDF.js 3.11.174** — só *lê/renderiza* PDF para `<canvas>` (miniaturas, preview, editor de sobreposição, e agora também a compressão de anexos).

---

## 2. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| [index.html](index.html) | Tela de senha (`SENHA_HASH`, SHA-256) + splash animado, depois redireciona para o formulário |
| [View/index-form-databook.html](View/index-form-databook.html) | Formulário inteiro (~720 linhas): campos, checkboxes de fichas/PDA/procedimentos, modal de preview, editor de sobreposição. Também importa pdf-lib e PDF.js via `<script>` |
| [View/styles/style-global.css](View/styles/style-global.css) | Tema claro/escuro, componentes visuais (steps, choice-list, modal, drawer de miniaturas) |
| [Controller/main.js](Controller/main.js) | ~1630 linhas. Tudo: estado (`STATE`), assets, geração do PDF, preview, editor de páginas, compressão de anexos |
| [Controller/draft.js](Controller/draft.js) | Exportar/importar o preenchimento do formulário como `.json` (rascunho) |
| [Controller/ppci.js](Controller/ppci.js) | Importar um book (PDF) já gerado e montar o complemento PPCI ([seção 15](#15-importar-book-complemento-ppci)) |
| [Controller/pendencias.js](Controller/pendencias.js) | Aviso ao gerar o PDF com itens não preenchidos ([seção 17](#17-aviso-de-itens-pendentes-ao-gerar-o-pdf)) |
| [Controller/memorial.js](Controller/memorial.js) | Leitura do memorial de cálculo (modelos antigo e novo) e comparação com os campos do certificado ([seção 18](#18-memorial-de-cálculo-leitura-e-comparação-com-o-certificado)) |
| [Model/assets-*.json](Model/) | Cada arquivo é `{"<categoria>": {...}}` com PDFs/imagens em base64 puro (sem prefixo `data:`) |
| [manifest.json](manifest.json) | Manifesto PWA (nome, ícones, cor de tema, `display: standalone`) |
| [sw.js](sw.js) | Service Worker — estratégia de cache offline |
| [icons/](icons/) | Ícones do PWA (192px, 512px) |

---

## 3. Estado global (`main.js`)

Não há framework de estado — tudo vive em variáveis globais no topo do arquivo:

```js
const STATE = {
  uploads: {},          // { ss, rdo, rel, rdi, mem, arpt } → ArrayBuffer do PDF enviado
  uploadNames: {},       // { ss: 'nome-original.pdf', ... } → nome do arquivo pra reexibir
  logoCliente: null,     // ArrayBuffer (imagem comprimida) do logo do cliente
  logoClienteType: null, // mime type ('image/png' | 'image/jpeg')
  fotoAntes: null, fotoAntesType: null,     // fotos do certificado de garantia
  fotoDepois: null, fotoDepoisType: null,
  assinatura: null, assinaturaType: null,   // assinatura do responsável
};
```

Além do `STATE`, o **modo preview/edição** guarda seu próprio conjunto de variáveis ([main.js:350-365](Controller/main.js#L350)):

| Variável | Guarda |
|---|---|
| `_previewBytes` | Bytes do PDF montado (o que está sendo mostrado no modal) |
| `_persistedPreviewBytes` | Cópia que sobrevive a fechar/abrir o preview sem regenerar tudo |
| `_keptPageIndices` | Índices das páginas mantidas após remoção manual dentro do preview |
| `_drawerPageMask` | Array de booleans — seleção de páginas no drawer de miniaturas |
| `_editMode` / `_editTool` | Se está no editor de sobreposição, e qual ferramenta ativa (`'select'` \| `'add'`) |
| `_editCorrections` | Lista de caixas de texto sobrepostas: `{page, x, y, w, h, text, fontSize, color}` |
| `_editPageRotations` | `{numeroDaPagina: grausDeRotacao}` — rotações pendentes, ainda não gravadas no PDF |
| `_correctedBytes` | PDF final já com correções/rotações aplicadas (gerado por `aplicarCorrecoes()`) |

**Importante:** qualquer `input`/`change` fora do modal de preview invalida esse cache (`_invalidarPreviewSalvo()`, [main.js:369](Controller/main.js#L369)) — é por isso que editar um campo do formulário depois de já ter aberto o preview força a regeneração do zero na próxima vez.

---

## 4. Fluxo completo, passo a passo

1. **Preenchimento** — o usuário preenche os campos, faz upload de PDFs (`setupUpload`, [main.js:60](Controller/main.js#L60)) e fotos (`setupFoto`, [main.js:91](Controller/main.js#L91) — fotos passam por `compressImageFile` antes de entrar no `STATE`, ver [seção 7](#7-upload-e-compressão-de-imagens-fotos-logo-assinatura)). `updateStatus()` ([main.js:214](Controller/main.js#L214)) recalcula em tempo real o contador "X de 12 concluído" na sidebar e uma **estimativa** de número de páginas (heurística fixa por seção, não é exata).
2. **Pré-visualizar** → `abrirPreview()` chama `montarDatabook()` (se ainda não tiver um preview válido em cache) e renderiza o PDF resultante com PDF.js, página por página, dentro do modal.
3. Dentro do preview o usuário pode:
   - **Desmarcar páginas** no drawer de miniaturas lateral (`_drawerPageMask`) — não remove de fato, só marca o que *não* vai entrar no PDF final.
   - **Rotacionar** uma página (`rotatePage()`, [main.js:638](Controller/main.js#L638)) — fica pendente em `_editPageRotations` até aplicar.
   - **Editar** (`entrarModoEdicao()`) — cola caixas brancas com texto novo sobre trechos do documento digitalizado, útil para corrigir campos errados num RDO/RDE escaneado sem precisar reescanear o papel.
4. **Gerar PDF** (`gerarPDF()`, [main.js:271](Controller/main.js#L271)) — este é o ponto de saída, e ele baixa **dois arquivos**:
   1. O databook completo — `TEAM-8104-...-SS-XX-20XX.pdf` (nome vem de `getDocNumero()`).
   2. Um **Certificado de Conformidade separado** de 2 páginas (`montarCertificado()` → `desenhaCertificadoGarantia()`), baixado ~800ms depois — é a mesma seção 9 do databook, mas como arquivo avulso, nomeado `Certificado de Conformidade REP-<plaqueta>.pdf`.

   Se já existir `_correctedBytes` (usuário passou pelo editor e aplicou correções), esses bytes são usados diretamente; senão, remonta o PDF do zero, aplica a máscara do drawer (`_aplicarDrawerMask`) e as remoções manuais do preview (`_keptPageIndices`), nessa ordem.

---

## 5. Sistema de assets (`Model/*.json`)

Cada arquivo é carregado **uma vez** e cacheado em memória (`ASSETS_CACHE`, [main.js:1](Controller/main.js#L1)):

```js
async function getAsset(cat){
  if(!ASSETS_CACHE[cat]){
    const r = await fetch('../Model/assets-'+cat+'.json');
    const d = await r.json();
    ASSETS_CACHE[cat] = d[cat];
  }
  return ASSETS_CACHE[cat];
}
```

Estrutura por arquivo:

| Arquivo | Formato | Observação |
|---|---|---|
| `assets-fichas.json` | `{"fichas": {"<chave>": "<pdf base64>"}}` | Fichas técnicas de produtos (seção 6 do databook) |
| `assets-pda.json` | `{"pda": {"<chave>": "<pdf base64>"}}` | Certificados PDA (seção 7) |
| `assets-procedimentos.json` | `{"procedimentos": {"<chave>": "<pdf base64>"}}` | Procedimentos (seção 5) — só um selecionável por vez (radio, não checkbox) |
| `assets-tecnicos.json` | `{"tecnicos": {"<nome>": {"<certificado>": "<pdf base64>"}}}` | **O maior arquivo do repo** (~12MB) — todos os certificados de todos os técnicos |
| `assets-idcards.json` | `{"idcards": {"<chave>": {"pdf": "<base64>"}}}` | Carteirinhas/ID cards Jotachar, casadas por nome com `tecnicos` |
| `assets-cover.json` | `{"cover": {"background", "safetyfirst", "teamHeader", "img1".."img5"}}` | Imagens da capa (JPEG/PNG base64) |
| `assets-logo.json` | `{"logo": "<jpeg base64>"}` | Logo TEAM, usado no cabeçalho de toda página gerada |
| `assets-clientes.json` | `{"clientes": {"PETROBRAS": "<png base64>"}}` | Logos de clientes. A da Petrobras é a logo **padrão** da capa (`usarLogoPadrao()` em `main.js`, carregada na abertura do formulário se nenhuma logo foi restaurada). Para outro cliente o usuário importa o arquivo na etapa 1 (`STATE.logoCliente`); o botão "Voltar para a logo da Petrobras" desfaz |

Todos os valores de PDF são **base64 puro**, sem prefixo `data:application/pdf;base64,`. Decodifique com o helper já existente `b64ToBytes()` ([main.js:12](Controller/main.js#L12)).

### Receita: adicionar uma nova ficha técnica / procedimento / certificado PDA

1. Converta o PDF para base64 e adicione uma chave nova no JSON correspondente (exemplo em Node, sem dependências):
   ```js
   const fs = require('fs');
   const path = 'Model/assets-fichas.json'; // ou assets-pda.json / assets-procedimentos.json
   const data = JSON.parse(fs.readFileSync(path, 'utf8'));
   data.fichas['MinhaNovaChave'] = fs.readFileSync('caminho/arquivo.pdf').toString('base64');
   fs.writeFileSync(path, JSON.stringify(data)); // sem pretty-print — mantém o padrão do arquivo
   ```
2. Adicione o `<label class="choice">` correspondente em `View/index-form-databook.html`, dentro da lista certa (`#fichasList`, `#pdaList`, `#procList`), com `value` igual à chave usada no passo 1.
3. Pronto — `montarDatabook()` já lê qualquer checkbox/radio marcado daquele grupo automaticamente via `document.querySelectorAll('input[name=ficha]:checked')` (ou `pda`/`proc`). Não precisa mexer em `main.js`.
4. Se o arquivo `Model/assets-*.json` correspondente estiver na lista `MODEL_ASSETS` do Service Worker ([sw.js:17](sw.js#L17)), ele já vai ser recacheado automaticamente — mas só depois que o SW atualizar (ver [seção 10](#10-pwa--service-worker-swjs)).

### Receita: adicionar um novo técnico / certificado de técnico

Os certificados ficam em `assets-tecnicos.json`; a lista de linhas (`.tecnico-row`) é montada dinamicamente em `buildTecnicosList()` ([main.js:154](Controller/main.js#L154)), que:
- Lê `tecnicos` e `idcards`, ordena os nomes.
- Casa cada técnico com seu ID card Jotachar por nome normalizado (`encontraIdcard()`, [main.js:190](Controller/main.js#L190) — tolera pequenas diferenças de grafia comparando primeiro/último nome).
- Gera um `<select>` com todos os certificados daquele técnico + opção "Todos os disponíveis" (`__ALL__`).

Para adicionar um técnico novo, basta adicionar a entrada em `assets-tecnicos.json` (e em `assets-idcards.json` se ele tiver ID Jotachar) — a lista na tela é 100% gerada a partir desses dois arquivos, sem HTML fixo.

---

## 6. O motor de PDF (`montarDatabook`)

`montarDatabook()` ([main.js:943](Controller/main.js#L943)) monta o databook completo, seção por seção. Cada seção segue o padrão **separador + conteúdo**:

| # | Seção | Conteúdo vem de |
|---|---|---|
| — | Capa, contracapa, índice | Gerados (`desenhaCapa`, `desenhaContracapa`, `desenhaIndice`) — texto/imagens vetoriais |
| 1 | Solicitação de Serviço | `STATE.uploads.ss` |
| 2 | Relatório Diário de Operações | `STATE.uploads.rdo` |
| 3 | Relatório de Execução e Registro de Instalação | `STATE.uploads.rel` + `STATE.uploads.rdi` |
| 4 | Projeto | `STATE.uploads.mem` |
| 5 | Procedimentos | asset `procedimentos` (o radio marcado) |
| 6 | Ficha Técnica | asset `fichas` (todos os checkboxes marcados) |
| 7 | PDA | asset `pda` (todos os checkboxes marcados) |
| 8 | Avaliação de Risco do Reparo | `STATE.uploads.arpt` |
| 9 | Certificado de Garantia | Gerado (`desenhaCertificadoGarantia`) — mesmo conteúdo do certificado avulso |
| 10 | Certificados de Qualificação dos Técnicos | asset `tecnicos` (por técnico marcado) + `idcards` (Jotachar, se marcado) |

Constantes de layout usadas em **todas** as páginas geradas (topo de `main.js`, [main.js:263-269](Controller/main.js#L263)):

```js
const PAGE_W = 595.28;   // A4 em pontos (72pt/polegada)
const PAGE_H = 841.89;
const MARGIN = 50;
const TEAM_BLUE = rgb(0/255, 94/255, 184/255);
const TEAM_GRAY = rgb(0.23, 0.27, 0.32);
```

`desenhaCabecalhoRodape()` ([main.js:1136](Controller/main.js#L1136)) desenha o cabeçalho padrão (logo + número do documento) em toda página gerada pelo app — **não** nas páginas anexadas via `anexarPdf` (essas mantêm o layout original do PDF fonte).

`desenhaCertificadoGarantia()` ([main.js:1395](Controller/main.js#L1395)) é a função mais densa do arquivo: reproduz, com coordenadas fixas em pontos, o formulário físico `FORM 8701-123` da TEAM (2 páginas: dados do cliente/certificação + fotos antes/depois). Se o layout do formulário físico mudar, é aqui que se mexe — é trabalho manual de coordenadas, não tem grid/flexbox.

---

## 7. Upload e compressão de imagens (fotos, logo, assinatura)

Diferente dos anexos em PDF, imagens (foto antes/depois, logo do cliente, assinatura) já são comprimidas **no momento do upload**, por `compressImageFile()` ([main.js:25](Controller/main.js#L25)):

```js
async function compressImageFile(file, {maxDim=1600, mime='image/jpeg', quality=0.82, alvoBytes=0, minQuality=0.6, minDim=900} = {}){
  // usa createImageBitmap + canvas para redimensionar e reexportar como JPEG/PNG
}
```

Downscale para `maxDim` (maior lado, em pixels) e reexporta na `quality` pedida. Com `alvoBytes` (usado nas fotos do certificado, `FOTO_ALVO_BYTES` = 250KB), uma imagem que ainda fique mais pesada que o alvo é reduzida mais — primeiro a qualidade, até `minQuality`, depois as dimensões, até `minDim` —, enquanto fotos leves ficam como estão. Cada foto ocupa meia página do certificado (~3,5"), então 1400px já dá mais de 400 DPI e a redução não é perceptível. Configurações atuais ([main.js:115-117](Controller/main.js#L115)):

| Campo | maxDim | mime | quality |
|---|---|---|---|
| Foto antes/depois | 1400px, **reduz mais se passar de 250KB** (`FOTO_OPTS`) | JPEG | 0.85 (cai até 0.6; depois as dimensões, até 900px) |
| Logo do cliente | 900px | PNG/JPEG (conforme original) | 0.85 |
| Assinatura | 900px | PNG (mantém transparência) | — |

Se `createImageBitmap`/`canvas.toBlob` falhar por qualquer motivo, cai no arquivo original sem comprimir (fallback silencioso, só loga um `console.warn`).

---

## 8. Tamanho de página (A4) e compressão dos anexos

Dois problemas relacionados, resolvidos juntos: (1) o PDF final chegou a sair com **~20MB** porque cada PDF anexado (RDO, RDE, certificados escaneados etc.) era copiado sem nenhuma recompressão; (2) algumas páginas anexadas saíam com um tamanho físico diferente das demais (ex.: a ficha da Resimac saía enorme) porque `anexarPdf` usava o tamanho de página do PDF de origem — e um PDF de origem com Caixa de Mídia mal formada (ex.: gerado por uma ferramenta que grava pixels como se fossem pontos) produzia uma página gigante.

A arquitetura atual separa **montagem** (sempre vetorial/nítida — usada na pré-visualização, no editor e como base do PDF final) de **compressão** (só acontece uma vez, no exato momento em que o usuário clica em "Gerar PDF").

### 8.1 Montagem — sempre em qualidade total (`anexarPdf`)

`anexarPdf()` ([main.js:1112](Controller/main.js#L1112)) embute o PDF de origem inteiro via `pdf.embedPdf()` (API do pdf-lib que traz cada página como um XObject vetorial reutilizável) e desenha cada página numa página nova, sempre no tamanho A4 fixo (`PAGE_W x PAGE_H`), com o conteúdo original ajustado por **contain** (sem distorcer) e centralizado — `_fitRectoA4()` ([main.js:1101](Controller/main.js#L1101)) calcula esse retângulo. Isso resolve o problema do tamanho de página de uma vez por todas: **toda** página do databook final — gerada pelo app ou anexada — tem exatamente o mesmo tamanho físico.

```js
function _fitRectoA4(srcW, srcH){
  const scale = Math.min(PAGE_W / srcW, PAGE_H / srcH);
  const width  = srcW * scale, height = srcH * scale;
  return { x:(PAGE_W-width)/2, y:(PAGE_H-height)/2, width, height };
}
```

Cada página assim criada é marcada com uma entrada customizada no próprio dicionário da página do PDF (`newPage.node.set(PDFName.of(ANEXO_MARK), PDFBool.True)`) — é assim que o passo de compressão (a seguir) sabe, mais tarde, quais páginas são anexos (candidatos a recompressão, se pesados) e quais são conteúdo gerado pelo app (capa, separadores, índice, certificado), que nunca é tocado. Essa marca é uma entrada de baixo nível do PDF, então **sobrevive** a `copyPages`, `save` e `load` — validado manualmente: uma página marcada continua marcada depois de passar pelo ciclo completo save→load→copyPages→save→load que o app usa em vários lugares (drawer de miniaturas, remoção de páginas no preview, editor de correções).

Como essa função não depende mais do PDF.js, a pré-visualização e o editor de sobreposição ficam **rápidos e sempre nítidos** — nada é rasterizado até o usuário decidir baixar o arquivo.

### 8.2 Compressão — só na hora de baixar (`comprimirDatabookFinal`)

`gerarPDF()` monta o databook (ou reusa `_correctedBytes`, se o usuário editou/rotacionou no preview), aplica remoções de página (drawer + preview) e só então, como último passo antes de criar o link de download, chama:

```js
bytes = await comprimirDatabookFinal(bytes);
```

**Princípio: só se mexe no que é pesado, e só se compensar.** Medindo os assets reais do projeto (páginas × peso das imagens), os certificados de técnicos já são leves (~180KB/página; rasterizá-los a 140 DPI / 0,70 os deixaria **maiores**: 13,5MB contra 8,8MB), e procedimentos, PDA, fichas e ID cards têm no máximo ~85KB de imagem por página (a ficha da Resimac, um scan, tem ~490KB). Rasterizar tudo, como a versão anterior fazia, "economizava" degradando páginas que já eram leves. Por isso `comprimirDatabookFinal()` ([main.js](Controller/main.js)):

1. Carrega o PDF com pdf-lib e, para cada página com a marca `ANEXO_MARK`, mede o peso das imagens que ela usa (`_bytesImagensDaPagina()`: soma dos XObjects `/Image`, inclusive dentro de Forms).
2. Só são **candidatas** as páginas anexadas com mais de `ANEXO_PESADO_BYTES` (~200KB) de imagem — em geral scans e fotos de uploads (SS, RDO, RDE, memorial, avaliação de risco) e a ficha da Resimac.
3. Todas as outras páginas — capa, contracapa, índice, separadores, certificado de garantia e os anexos "leves" — são **copiadas como estão** (`copyPages`, numa única chamada para preservar o compartilhamento de fontes/logo). Continuam sendo páginas nativas, com texto real que o Acrobat reconhece, e os anexos leves mantêm nitidez total e texto selecionável.
4. Cada candidata é renderizada no `<canvas>` via PDF.js (`COMPRESS_DPI`) e reexportada como JPEG (`COMPRESS_QUALITY`), desenhada ajustada por `_fitRectoA4` numa página A4. **Se o JPEG não ficar pelo menos 15% menor que as imagens originais da página, a página original é mantida** — a compressão nunca aumenta o arquivo nem degrada à toa.

```js
const COMPRESS_DPI       = 140;        // resolucao das paginas pesadas recomprimidas
const COMPRESS_QUALITY   = 0.70;       // qualidade do JPEG re-codificado (0 a 1)
const ANEXO_PESADO_BYTES = 200 * 1024; // so paginas anexadas com mais de ~200KB de imagem sao recomprimidas
const MAX_RENDER_PX      = 1800;       // teto de pixels no maior lado do canvas de renderizacao
```

Esses números são o lugar a mexer para trocar o equilíbrio nitidez↔tamanho. Reduzir o DPI tem impacto **quadrático** no tamanho (metade do DPI ≈ 1/4 dos pixels); a qualidade JPEG tem impacto mais suave e não-linear. Referência medida com um scan A4 de 300 DPI (2,2MB): a 140 DPI / 0,70 ficou em ~210KB. A 100 DPI / 0,45 (valores usados antes) o texto ficava visivelmente borrado. `MAX_RENDER_PX` é um teto de segurança independente do DPI — protege contra páginas de origem com Caixa de Mídia fora do padrão gerando canvases enormes.

**Fallback de segurança:** cada candidata tem um timeout de 20s de renderização; se estourar (ou qualquer outro erro, ou "sem ganho"), aquela página específica é copiada como está, sem derrubar a geração do resto do documento. A marca `ANEXO_MARK` é removida de todas as páginas do arquivo final (já passaram pela compressão); a marca de seção (`SECAO_MARK`) é preservada porque `copyPages` a leva junto.

**Trade-off consciente:** páginas rasterizadas deixam de ter texto pesquisável — mas só são rasterizadas as pesadas, que na prática são scans e fotos, sem camada de texto de qualquer forma.

**Nota de ambiente:** `_toU8()` sempre faz uma cópia independente (`.slice(0)`) dos bytes antes de passar para o PDF.js — necessário porque `pdfjsLib.getDocument()` **transfere/detacha** o `ArrayBuffer` original para o worker. Sem essa cópia, comprimir (ou gerar o PDF) uma segunda vez com os mesmos bytes falharia silenciosamente. Ao testar no console, lembre que `pdfjsLib.getDocument` é somente leitura (atribuir a ele é ignorado em silêncio) e que a renderização do PDF.js só roda de forma confiável com a aba visível.

---

## 9. Editor de sobreposição e rotação de página

Funciona **depois** do PDF já estar montado (opera em cima de `_previewBytes`), então é totalmente independente de qualquer mudança em `montarDatabook`/`anexarPdf`:

- `entrarModoEdicao()` ([main.js:580](Controller/main.js#L580)) abre o modo de edição, carrega uma **cópia** de `_previewBytes` no PDF.js (mesmo motivo do `_toU8`: evitar detach do buffer original) e renderiza a página atual (`renderEditPage()`, [main.js:698](Controller/main.js#L698)).
- Clicar na página (`editCanvasClick()`, [main.js:729](Controller/main.js#L729)) cria uma caixa branca de texto (`_criarBoxDiv()`, [main.js:760](Controller/main.js#L760)) — visualmente "apaga" e permite reescrever um trecho digitalizado, sem precisar reescanear o papel original.
- `rotatePage()` ([main.js:638](Controller/main.js#L638)) só guarda a rotação pendente em `_editPageRotations`; a rotação real só é gravada no pdf-lib (`page.setRotation(degrees(rot))`) quando `aplicarCorrecoes()` ([main.js:829](Controller/main.js#L829)) roda — nesse momento as caixas de texto (`_editCorrections`) também são desenhadas de fato sobre o PDF e tudo é salvo em `_correctedBytes`.

---

## 10. Rascunho (`Controller/draft.js`)

Apesar do README mencionar "rascunho automático via localStorage", o comportamento real hoje é **manual**: `salvarRascunho()` baixa um `.json` com todo o estado do formulário (campos de texto, radios, revisões, fichas/PDA/procedimento marcados, técnicos selecionados, uploads em base64, fotos, logo, assinatura). `carregarRascunho()` lê esse `.json` de volta e repovoa o formulário inteiro via `restaurarRascunho()`. Existe também `compartilharRascunho()`, que tenta usar a Web Share API (mobile/desktop moderno) antes de cair para copiar-para-área-de-transferência ou, em último caso, download normal.

Não há autosave em `localStorage` — o único uso de `localStorage` no projeto é o tema claro/escuro (`team_tema`, em `View/index-form-databook.html`).

---

## 11. PWA / Service Worker (`sw.js`)

Estratégia **rede primeiro, com cache como reserva** (`redePrimeiro()` em `sw.js`):

- **Online:** toda requisição do app (HTML, JS, CSS, `Model/*.json`) vai ao servidor com `cache:'no-cache'`, ou seja, uma requisição *condicional*: se o arquivo não mudou o servidor responde 304 (nada é baixado de novo, mesmo para os ~12MB do `assets-tecnicos.json`); se mudou, traz a versão nova. A cópia do cache offline é atualizada, e só é regravada quando o `ETag`/`Last-Modified` mudou.
- **Offline:** serve a última cópia guardada. O primeiro acesso online guarda tudo (`CORE_ASSETS` no install; `MODEL_ASSETS` em background).

```js
const CACHE_NAME = 'databook-cache';   // nome FIXO de proposito
const CORE_ASSETS = [ /* html, css, js, manifest, icones */ ];   // baixados no install
const MODEL_ASSETS = [ /* Model/assets-*.json */ ];              // baixados em background se ainda nao estiverem no cache
```

**O que isso significa na prática:** depois de publicar qualquer alteração (código, HTML, CSS ou um `Model/assets-*.json` novo), basta **abrir/recarregar o app uma vez** para vir a versão nova — não é mais preciso trocar `CACHE_NAME` nem limpar o cache do dispositivo. O nome do cache é fixo; só mude se quiser descartar todo o cache offline. Se criar um arquivo novo que o app precise offline, inclua-o em `CORE_ASSETS` (ou `MODEL_ASSETS`).

**Aviso de versão nova:** quando o próprio `sw.js` muda, o novo Service Worker assume o controle e a página mostra a barra "Nova versão do DataBook disponível" (`#avisoAtualizacao` em `index-form-databook.html`), com o botão "Atualizar agora" — ela não recarrega sozinha para não perder um book que esteja sendo preenchido. O app também consulta se há `sw.js` novo sempre que a aba volta a ficar visível, e registra o SW com `updateViaCache:'none'` para essa consulta nunca usar uma cópia velha do cache HTTP.

**Limite conhecido:** se você publicar só mudanças em arquivos que não são o `sw.js`, quem já estiver com o app **aberto** só enxerga a versão nova ao recarregar (a barra de aviso depende de o `sw.js` mudar). Quem abre/reabre o app já pega a nova.

**Histórico (migração):** até a versão `databook-v8` a estratégia era *Cache First* com nome de cache versionado, o que exigia trocar o nome a cada alteração. Na transição de uma versão antiga para esta, o dispositivo precisa de **uma** atualização manual da página (a barra de aviso aparece sozinha; ou Ctrl+F5) — daí em diante é automático.

---

## 12. Autenticação

`index.html` guarda um hash SHA-256 da senha (`SENHA_HASH`) e compara no clique de "Entrar" (`verificarSenha()`). A senha atual em texto plano fica documentada num comentário logo acima do hash — **isso não é uma segurança real**, é só uma barreira simples contra acesso casual, não um controle de acesso de verdade (qualquer um que veja o código-fonte vê a senha). Para trocar:
1. Gere o SHA-256 da nova senha (o comentário no código aponta uma ferramenta online para isso).
2. Substitua `SENHA_HASH` em `index.html`.
3. Atualize o comentário "Senha atual: ..." para não ficar desatualizado.

---

## 13. Convenções do código

- Funções que **desenham** algo no PDF começam com `desenha*` (`desenhaCapa`, `desenhaSeparador`, `desenhaCertificadoGarantia`...).
- Funções que **montam** um documento inteiro (várias chamadas de `desenha*`/`anexarPdf` juntas) começam com `monta*` (`montarDatabook`, `montarCertificado`).
- Funções que **anexam** um PDF externo a outro começam com `anexar*`.
- Funções/variáveis com `_` no início (`_previewBytes`, `_invalidarPreviewSalvo`) são internas do módulo de preview/edição — não são chamadas a partir do HTML.
- `$('id')` é atalho para `document.getElementById('id')` ([main.js:43](Controller/main.js#L43)) — use-o em vez de `document.getElementById` em código novo, por consistência.
- Nomenclatura, comentários e mensagens de erro do projeto são em português — mantenha o padrão em código novo.
- Não há linter/formatter configurado — siga o estilo já presente no arquivo (ponto e vírgula, aspas simples, chaves na mesma linha).
- **Campos que não podem passar batido** (hoje `cgCliente` e `cgData`, lista `CAMPOS_ALERTA` em `main.js`) não têm preenchimento automático e recebem a classe `campo-vazio` (borda/fundo vermelho, em `style-global.css`) enquanto vazios. Para destacar outro campo, basta incluir o id em `CAMPOS_ALERTA`. A data do certificado **não** acompanha a data da capa: é a data do RDE e é digitada manualmente.

---

## 14. Onde mexer para... (atalho rápido)

| Quero... | Vou em... |
|---|---|
| Adicionar ficha técnica / procedimento / PDA | `Model/assets-*.json` + checkbox em `View/index-form-databook.html` ([seção 5](#5-sistema-de-assets-modeljson)) |
| Adicionar técnico ou certificado | `Model/assets-tecnicos.json` (+ `assets-idcards.json` se tiver crachá Jotun) |
| Cadastrar um contrato novo (nº do job `8104-AA-NNNN`, nº do contrato e plataformas) | Lista `PROJETOS` no script do fim de `View/index-form-databook.html`. É a **mesma lista** que preenche o contrato do certificado e que valida o número do documento: se `8104-<doc1>-<doc2>` (etapa 1) não estiver nela, os campos ficam em vermelho com "Contrato não existente (…)" — só aviso, não impede digitar nem gerar o book. A validação (`validarContratoDoc`) só roda com os dois campos completos e também ao restaurar rascunho/book importado |
| Mudar layout da capa/contracapa/separador/certificado | `desenhaCapa`, `desenhaContracapa`, `desenhaSeparador`, `desenhaCertificadoGarantia` em `main.js` |
| Ajustar tamanho final do PDF (compressão) | `COMPRESS_DPI` / `COMPRESS_QUALITY` / `ANEXO_PESADO_BYTES` em `main.js` ([seção 8](#8-compressão-dos-anexos-em-pdf-anexarpdf)) |
| Ajustar compressão de fotos/logo/assinatura | Parâmetros passados para `compressImageFile()` em `setupFoto(...)` / no listener de `logoCliente` ([seção 7](#7-upload-e-compressão-de-imagens-fotos-logo-assinatura)) |
| Mudar a senha de acesso | `SENHA_HASH` em `index.html` |
| Mudar tema/cores da interface | `View/styles/style-global.css` |
| Mudar o que entra no rascunho `.json` | `Controller/draft.js` |
| Publicar uma alteração para os usuários do PWA | Nada especial: é só publicar; quem abrir/recarregar o app recebe a versão nova ([seção 11](#11-pwa--service-worker-swjs)) |

---

## 15. Importar book (complemento PPCI)

Há casos em que o reparo é feito primeiro com compósito e o PPCI só é aplicado depois. Nesse caso gera-se um **segundo book** com os mesmos dados do primeiro, mais um RDE (da aplicação do PPCI) e mais um certificado de conformidade (mesmos dados, mas com PPCI). O botão **Importar Book** (rodapé do formulário) faz isso a partir do PDF do book original. Tudo está em [Controller/ppci.js](Controller/ppci.js).

**Como funciona (duas peças):**

1. **Todo book gerado leva os dados do formulário em anexo.** No fim de `gerarPDF()`, `embutirDadosNoPdf()` anexa ao PDF o arquivo `databook-dados.json` (API `attach` do pdf-lib) com o mesmo conteúdo do rascunho **sem os PDFs enviados** (`coletarRascunho({semUploads:true})` — os anexos já são páginas do próprio PDF). Pesa em geral ~1MB (logo, fotos e assinatura em base64). `lerDadosDoPdf()` lê esse anexo de volta pelo PDF.js (`getAttachments()`).
2. **Cada separador de seção carrega uma marca com o nº da seção** (`SECAO_MARK`, gravada em `desenhaSeparador`; mesmo mecanismo da `ANEXO_MARK`, [seção 8](#8-tamanho-de-página-a4-e-compressão-dos-anexos)). `comprimirDatabookFinal()` copia essa marca para as páginas novas que cria, senão ela se perderia na compressão. A importação usa a marca para achar onde as seções 3 e 9 terminam.

**Fluxo da importação (`importarBookPdf`):** lê o anexo → `restaurarRascunho(estado, {silencioso:true})` → guarda o PDF em `STATE.bookBase` → `_ativarModoPpci()` (atualiza a data da capa para hoje, mostra o painel "Complemento PPCI" e esconde as etapas que não se aplicam via `body.modo-ppci`, em `style-global.css`). Daí em diante `montarDatabook()` (pré-visualização, miniaturas e geração final) desvia para `montarBookPpci()`, que monta:

| Parte | Origem |
|---|---|
| Capa | **Regenerada** (`desenhaCapa`) com a data nova — os outros dados vêm do anexo |
| Contracapa até o fim da seção 3 | Páginas copiadas do book importado |
| RDE do PPCI | Upload novo (`STATE.uploads.rdePpci`), logo após o RDE do compósito |
| Seções 4 a 9 | Copiadas do book importado (inclui o certificado do compósito original) |
| Certificado PPCI | **Gerado** (`desenhaCertificadoGarantia` com `ovCertificadoPpci()`), fim da seção 9 |
| Seção 10 em diante | Copiadas do book importado |

**Certificado PPCI** = mesmos dados do certificado do compósito, com: data = campo manual `cgDataPpci` (data do RDE com PPCI; muda também o nº do certificado), PFP = SIM com espessura/comprimento próprios (`ppciEsp`/`ppciComp`), descrição com a frase do Jotachar (`ppciDesc`, pré-preenchida por `_descricaoPpci`), **normas aplicáveis em branco** e ABS mantido. Para isso `desenhaCertificadoGarantia` ganhou o parâmetro `ov`: valores que substituem os do formulário (`cgData`, `cgDescricao`, `cgNormas`, `cgPfpEsp`, `cgPfpComp`, `pfp`).

**Downloads no modo PPCI:** o book sai como `<nº do documento> PPCI.pdf` (para não sobrescrever o do compósito) e o certificado avulso como um único PDF de 4 páginas (compósito + PPCI). `montarCertificado()` usa `ovCertificadoComposito()` para o primeiro — um *snapshot* de `cgData`/`cgDescricao` tirado na importação (`STATE.ppci`), porque editar a data da capa sincroniza `cgData` automaticamente e o certificado do compósito não pode mudar.

**Limitações:**
- Só books gerados **depois** desta funcionalidade têm o anexo e podem ser importados; os antigos mostram um aviso.
- O RDE do PPCI e a data do RDE com PPCI são obrigatórios — sem eles `montarBookPpci()` lança erro (aparece como alerta na pré-visualização/geração).
- A capa é regenerada a partir dos dados: edições feitas à mão na capa pelo editor de sobreposição não são preservadas. As demais páginas, inclusive edições/rotações feitas no book original, são mantidas.
- Os cabeçalhos das páginas já geradas (separadores etc.) mantêm o número do documento do book importado; se mudar o número do documento no modo PPCI, só a capa muda.
- O Certificado Jotun Jotachar (seção 6) e os ID Cards (seção 10) **não** são adicionados automaticamente ao book PPCI.

---

## 16. Limitações conhecidas

- A estimativa de páginas em `updateStatus()` é uma heurística fixa por seção (ex.: "+4 páginas por ficha marcada"), não conta as páginas reais dos PDFs anexados — pode divergir bastante do total real.
- `anexarPdf` rasteriza uniformemente todo anexo (uploads e assets), mesmo documentos nativamente vetoriais — não existe hoje uma forma de marcar um anexo específico como "manter pesquisável, não comprimir".
- Não há testes automatizados no projeto — qualquer mudança em `montarDatabook`/`anexarPdf` deve ser validada gerando um PDF de verdade e conferindo tamanho/legibilidade manualmente.

---

## 17. Aviso de itens pendentes ao gerar o PDF

Ao clicar em **Gerar PDF Final** (ou em "Gerar PDF" dentro da pré-visualização), `gerarPDF()` chama `confirmarPendencias()` ([Controller/pendencias.js](Controller/pendencias.js)) antes de montar o book. Se algo não estiver preenchido, abre o modal `#modalPendencias` com a lista (etapa + item) e dois botões: **Cancelar** (volta ao formulário; é o botão focado, então Enter não gera sem querer; Esc e clique no fundo também cancelam) e **Gerar PDF mesmo assim** (segue a geração normalmente, com os itens pendentes em branco ou sem os documentos).

- **O que é checado:** tudo está na função `listarPendencias()`, uma lista de `add(etapa, item, estaPendente)`. Para incluir ou retirar um item da checagem, edite só ali. Deliberadamente **não** são checados: "Revisado por" (preenchido pelo revisor no preview), o Registro de Instalação (opcional) e campos que já vêm com valor padrão (endereço, normas, vida útil, garantia, ABS, cargo).
- **Regras condicionais:** a espessura/comprimento do PFP só são cobrados se o Certificado Jotachar estiver selecionado (PFP = SIM); técnico marcado **sem** certificado escolhido é listado, porque a geração o ignora em silêncio.
- **Modo PPCI (importar book):** a lista é outra (RDE do PPCI, data do RDE com PPCI, PFP, descrição, data da capa, cliente e data do certificado). O RDE do PPCI e a data do RDE com PPCI são **bloqueantes** (`bloqueia`): o modal mostra "Faltam itens obrigatórios" e só oferece "Voltar e preencher", já que sem eles `montarBookPpci()` não consegue montar o book.
- **Preview:** `gerarPDFDoPreview()` pergunta *antes* de fechar o preview (se o usuário cancelar, continua nele) e depois chama `gerarPDF(true)` para não perguntar duas vezes.
- A pré-visualização (botão "Pre-visualizar") não pergunta nada: só a geração final.

---

## 18. Memorial de cálculo: leitura e comparação com o certificado

Tudo está em [Controller/memorial.js](Controller/memorial.js). Ao anexar o memorial de cálculo (etapa 6), o app lê a camada de texto do PDF (PDF.js) e:

1. **Preenche** os campos do certificado (continuam editáveis, nada fica travado);
2. **Mostra embaixo de cada campo o valor do cálculo** — `✓ cálculo: 101 kPa (1,01 bar)` (verde) se o que está digitado confere, `⚠ cálculo: 101 kPa … — diferente do campo · usar` (laranja) se diverge. O link **usar** copia o valor do cálculo para o campo. É só informação: nunca bloqueia a digitação nem a geração do book.

**Dois modelos de memorial** (`interpretarMemorial()` reconhece os dois; o campo `modelo` indica qual):

| Dado | Campo do certificado | Modelo ANTIGO ("Composite Design Assessment") | Modelo NOVO (ISO 24817 2026) |
|---|---|---|---|
| Vida útil | `cgVida` | `Design Lifetime: 20` | `Repair design lifetime … 20 years` |
| Local da corrosão → garantia | `cgGarantia` | `Defect Location: External/Internal` | `Cause of defect Internal/External corrosion` |
| Pressão de projeto | `cgPProj` | `Internal Design Pressure: P 1,0 barg` (×100 → kPa) | `Maximum repair design pressure … 0.10 Nmm-2 101.0 kPa` |
| Pressão de operação | `cgPOper` | `Operating Pressure: 1,0` (barg) | `System internal operating pressure … 0.10 Nmm-2` |
| Temperatura de projeto | `cgTProj` | `Design Temperature: T d 70 °C` | `Maximum repair design temperature … 70 °C` |
| Temperatura de operação | `cgTOper` | *(não lida: sem rótulo inequívoco)* | `System operating temperature … 40 °C` |
| TAG / Lot No. | `cgTag` / `cgSerial` | só comparação: o texto do memorial contém a TAG / o nº do documento? | idem |
| Furo na linha (defeito passante) | checkbox `cgFuro` (marcada = SIM) | `Perforation/Leak` no bloco de defeito | `Defect type Perforation/leak` (outro tipo, p.ex. `Wall loss` → sem furo) |

**Furo na linha:** o certificado imprime `FURO NA LINHA (DEFEITO PASSANTE):  ( X ) SIM  (   ) NÃO` logo abaixo da linha do PFP, conforme a checkbox "Há furo na linha" (etapa 11; sem marcar = NÃO). Ao anexar o memorial, a checkbox é marcada/desmarcada sozinha e aparece a comparação `✓/⚠ cálculo: defeito passante (furo) — Perforation/leak` com o link "usar". Depois que o usuário clica na checkbox (`data-manual` em `#furoBloco`), um memorial novo não a sobrescreve. A escolha vai no rascunho/dados do book (`furo`).

**Regra da garantia:** corrosão **interna → 1 ano**, **externa → 5 anos** (o campo `cgGarantia` alimenta o texto "…garantia contratual dentro do período de N anos…" do certificado; `anosTxt()` em `main.js` cuida de "1 ano"/"5 anos").

**Quando preenche:** vida útil e garantia sempre (vêm com valor padrão e o memorial prevalece ao anexar); pressões e temperaturas só se o campo estiver vazio **ou ainda "automático"** (borda verde) — um valor digitado à mão nunca é sobrescrito por um memorial novo; ao editar o campo o verde some (lista de campos no script do fim de `index-form-databook.html`). O formato gravado é o do certificado: `101 KPA` para pressão, só o número para temperatura.

**Como compara:** pressão digitada pode vir com unidade (`kPa`, `bar`, `barg`, `MPa`, `N/mm²`, `kgf/cm²`, `psi`); sem unidade é ambígua e vale se bater como kPa **ou** como bar. Tolerância de 5% (mínimo 2 kPa) nas pressões, 0,5 °C nas temperaturas. A TAG é comparada ignorando espaços e tipo de aspas.

**Estados da nota `#memorialNota`:** lista o que foi lido e o que não foi encontrado; em vermelho quando o memorial é uma imagem (sem texto), quando o modelo não é reconhecido ou quando não foi possível ler. Ao carregar rascunho, `reanalisarMemorial()` refaz só a comparação (sem alterar campos). Não é feita no modo "Importar Book" (os anexos do book original não são relidos).

**Limites:** o modelo ANTIGO foi validado com um memorial real. O modelo NOVO foi construído a partir do "Guia técnico" (rótulos e valores das páginas do memorial) e validado com um texto sintético com essa mesma ordem de rótulos — se um memorial novo real vier com a ordem das células diferente na extração de texto, ajuste as expressões regulares em `interpretarMemorial()`. Só o campo do local da corrosão decide a garantia; a "causa" do defeito não é considerada. Pressão em barg é tratada como bar (1 barg = 100 kPa).
