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
async function compressImageFile(file, {maxDim=1600, mime='image/jpeg', quality=0.82} = {}){
  // usa createImageBitmap + canvas para redimensionar e reexportar como JPEG/PNG
}
```

Downscale para `maxDim` (maior lado, em pixels) e reexporta na `quality` pedida. Configurações atuais ([main.js:115-117](Controller/main.js#L115)):

| Campo | maxDim | mime | quality |
|---|---|---|---|
| Foto antes/depois | 1600px | JPEG | 0.82 |
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

Cada página assim criada é marcada com uma entrada customizada no próprio dicionário da página do PDF (`newPage.node.set(PDFName.of(ANEXO_MARK), PDFBool.True)`) — é assim que o passo de compressão (a seguir) sabe, mais tarde, quais páginas pode rasterizar e quais são conteúdo gerado pelo app (capa, separadores, índice, certificado) e devem continuar vetoriais. Essa marca é uma entrada de baixo nível do PDF, então **sobrevive** a `copyPages`, `save` e `load` — validado manualmente: uma página marcada continua marcada depois de passar pelo ciclo completo save→load→copyPages→save→load que o app usa em vários lugares (drawer de miniaturas, remoção de páginas no preview, editor de correções).

Como essa função não depende mais do PDF.js, a pré-visualização e o editor de sobreposição ficam **rápidos e sempre nítidos** — nada é rasterizado até o usuário decidir baixar o arquivo.

### 8.2 Compressão — só na hora de baixar (`comprimirDatabookFinal`)

`gerarPDF()` ([main.js:274](Controller/main.js#L274)) monta o databook (ou reusa `_correctedBytes`, se o usuário editou/rotacionou no preview), aplica remoções de página (drawer + preview) e só então, como último passo antes de criar o link de download, chama:

```js
bytes = await comprimirDatabookFinal(bytes);
```

`comprimirDatabookFinal()` ([main.js:1130](Controller/main.js#L1130)) recebe o PDF já pronto (com todas as edições do usuário já aplicadas) e:

1. Carrega o PDF com pdf-lib e lê, página a página, se ela tem a marca `ANEXO_MARK`.
2. Para as páginas **sem** a marca (geradas pelo app), embute de volta como vetor — sem custo de qualidade.
3. Para as páginas **com** a marca, renderiza no `<canvas>` via PDF.js numa resolução fixa (`COMPRESS_DPI`) e reexporta como JPEG numa qualidade fixa (`COMPRESS_QUALITY`), desenhando o resultado ajustado por `_fitRectoA4` na página A4.

```js
const COMPRESS_DPI     = 100;  // resolucao efetiva das paginas anexadas no PDF final
const COMPRESS_QUALITY = 0.45; // qualidade do JPEG re-codificado (0 a 1)
const MAX_RENDER_PX    = 1800; // teto de pixels no maior lado do canvas de renderizacao
```

Esses números são o único lugar a mexer para trocar o equilíbrio nitidez↔tamanho. Reduzir o DPI tem impacto **quadrático** no tamanho (metade do DPI ≈ 1/4 dos pixels); a qualidade JPEG tem impacto mais suave e não-linear. `MAX_RENDER_PX` é um teto de segurança independente do DPI configurado — protege contra páginas de origem com Caixa de Mídia fora do padrão (a mesma causa do bug da página gigante) gerando canvases enormes e mais pesados do que precisam.

**Importante para não desperdiçar a compressão:** só é embutido (`embedPdf`) o conteúdo vetorial das páginas que **não** serão rasterizadas — as páginas marcadas são deixadas de fora desse embed inicial, senão o PDF final carregaria o conteúdo pesado original de qualquer forma, mesmo sem desenhá-lo.

**Fallback de segurança:** cada página marcada tem um timeout de 20s de renderização; se estourar (ou qualquer outro erro), aquela página específica cai para o embed vetorial original (sem compressão), sem derrubar a geração do resto do documento — a lógica é idêntica à do antigo `anexarPdfComprimido`, só que rodando uma vez no final em vez de uma vez por anexo durante a montagem.

**Trade-off consciente:** a rasterização transforma texto pesquisável em imagem. Como a maioria dos anexos já são digitalizações (fotos/scans de RDO, RDE, certificados), isso normalmente não perde nada relevante — mas fichas técnicas com texto vetorial nativo (ex.: PDF gerado direto de um sistema, como a ficha da Vectorply) também passam por isso e perdem a seleção de texto, ficando só como imagem de alta resolução. Não existe hoje uma forma de marcar um anexo específico como "manter pesquisável, não comprimir" — o tratamento é uniforme para todo anexo.

**Nota de ambiente:** `_toU8()` ([main.js:331](Controller/main.js#L331)) sempre faz uma cópia independente (`.slice(0)`) dos bytes antes de passar para o PDF.js — necessário porque `pdfjsLib.getDocument()` **transfere/detacha** o `ArrayBuffer` original para o worker. Sem essa cópia, comprimir (ou gerar o PDF) uma segunda vez com os mesmos bytes falharia silenciosamente.

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

Estratégia **Cache First**: tudo que já está no cache (`databook-v2`) é servido direto, sem ir à rede — inclusive `main.js`, `draft.js` e o HTML do formulário.

```js
const CACHE_NAME = 'databook-v2';
const CORE_ASSETS = [ /* html, css, js, manifest, icones */ ];   // cacheados no install
const MODEL_ASSETS = [ /* Model/assets-*.json */ ];              // cacheados em background, depois do activate
```

**Gotcha importante:** se você editar `main.js`, `draft.js`, o HTML ou qualquer `Model/assets-*.json`, usuários que já instalaram o PWA (ou que só visitaram uma vez e o navegador registrou o SW) **não vão ver a mudança** até que:
1. O `CACHE_NAME` seja incrementado (`databook-v2` → `databook-v3`, por exemplo) — isso força o `activate` a apagar o cache antigo e recachear tudo.
2. Ou o usuário force um hard-refresh / limpe o cache do site manualmente.

Ou seja: **toda vez que alterar algo em `CORE_ASSETS` (html/css/js) ou quiser forçar a atualização de um `Model/assets-*.json`, bump o `CACHE_NAME` em `sw.js`.** Esquecer esse passo é a causa mais provável de "mudei o código mas não aparece" em produção (GitHub Pages).

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

---

## 14. Onde mexer para... (atalho rápido)

| Quero... | Vou em... |
|---|---|
| Adicionar ficha técnica / procedimento / PDA | `Model/assets-*.json` + checkbox em `View/index-form-databook.html` ([seção 5](#5-sistema-de-assets-modeljson)) |
| Adicionar técnico ou certificado | `Model/assets-tecnicos.json` (+ `assets-idcards.json` se tiver crachá Jotun) |
| Mudar layout da capa/contracapa/separador/certificado | `desenhaCapa`, `desenhaContracapa`, `desenhaSeparador`, `desenhaCertificadoGarantia` em `main.js` |
| Ajustar tamanho final do PDF (compressão) | `COMPRESS_DPI` / `COMPRESS_QUALITY` em `main.js` ([seção 8](#8-compressão-dos-anexos-em-pdf-anexarpdf)) |
| Ajustar compressão de fotos/logo/assinatura | Parâmetros passados para `compressImageFile()` em `setupFoto(...)` / no listener de `logoCliente` ([seção 7](#7-upload-e-compressão-de-imagens-fotos-logo-assinatura)) |
| Mudar a senha de acesso | `SENHA_HASH` em `index.html` |
| Mudar tema/cores da interface | `View/styles/style-global.css` |
| Mudar o que entra no rascunho `.json` | `Controller/draft.js` |
| Publicar uma alteração e garantir que usuários do PWA recebam | Bump `CACHE_NAME` em `sw.js` ([seção 11](#11-pwa--service-worker-swjs)) |

---

## 15. Limitações conhecidas

- A estimativa de páginas em `updateStatus()` é uma heurística fixa por seção (ex.: "+4 páginas por ficha marcada"), não conta as páginas reais dos PDFs anexados — pode divergir bastante do total real.
- `anexarPdf` rasteriza uniformemente todo anexo (uploads e assets), mesmo documentos nativamente vetoriais — não existe hoje uma forma de marcar um anexo específico como "manter pesquisável, não comprimir".
- Não há testes automatizados no projeto — qualquer mudança em `montarDatabook`/`anexarPdf` deve ser validada gerando um PDF de verdade e conferindo tamanho/legibilidade manualmente.
