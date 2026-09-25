const API_URL = "https://script.google.com/macros/s/AKfycbybAvrCWk6Fbjhy3mk2sX5S3cDThtJ-awptfeCpRIc__Nf6pYN_-CSFqLc0jNu-HhPEcw/exec";

const state = {
  token: localStorage.getItem("officenet_token") || "",
  usuario: null,
  materiais: [],
  estoque: [],
  movimentacoes: [],
  lojas: [],
  lojaFiltro: "TODAS",
  tokenPrimeiroAcesso: ""
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(element, message, type = "") {
  if (!element) return;
  element.textContent = message || "";
  element.className = "form-message" + (type ? " " + type : "");
}

function showGlobalMessage(message, type = "") {
  const element = $("globalMessage");
  if (!element) return;
  element.textContent = message || "";
  element.className = "global-message" + (type ? " " + type : "");

  if (message) {
    clearTimeout(showGlobalMessage.timer);
    showGlobalMessage.timer = setTimeout(() => {
      element.textContent = "";
      element.className = "global-message";
    }, 4500);
  }
}

async function apiGet(acao, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("acao", acao);

  if (state.token) url.searchParams.set("token", state.token);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) throw new Error("Erro HTTP " + response.status);

  const data = await response.json();
  if (!data.sucesso) throw new Error(data.mensagem || "Erro na API.");
  return data;
}

async function apiPost(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("Erro HTTP " + response.status);

  const data = await response.json();
  if (!data.sucesso) throw new Error(data.mensagem || "Erro na API.");
  return data;
}

function saveSession(data) {
  state.token = data.token;
  state.usuario = data.usuario;
  state.lojaFiltro = state.usuario?.perfil === "PREENCHEDOR"
    ? String(state.usuario.lojaId || "").trim()
    : "TODAS";

  localStorage.setItem("officenet_token", state.token);
  localStorage.setItem("officenet_usuario", JSON.stringify(state.usuario));
}

function clearSession() {
  state.token = "";
  state.usuario = null;
  state.materiais = [];
  state.estoque = [];
  state.movimentacoes = [];
  state.lojas = [];
  state.lojaFiltro = "TODAS";

  localStorage.removeItem("officenet_token");
  localStorage.removeItem("officenet_usuario");
}

function getLojaLabel() {
  if (!state.usuario) return "Loja não identificada";

  if (state.usuario.perfil === "ADMIN") {
    if (state.lojaFiltro !== "TODAS") {
      const loja = state.lojas.find(
        (item) => String(item.id) === String(state.lojaFiltro)
      );
      return loja
        ? `${loja.codigo} — ${loja.nome}`
        : `Loja ${state.lojaFiltro}`;
    }
    return "Todas as lojas";
  }

  const lojaId = String(state.usuario.lojaId || "").trim();
  if (!lojaId) return "Loja não vinculada";

  const loja = state.lojas.find(
    (item) => String(item.id) === lojaId
  );

  return loja
    ? `${loja.codigo} — ${loja.nome}`
    : `Loja ${lojaId}`;
}

function showLogin() {
  $("loginView")?.classList.remove("hidden");
  $("appView")?.classList.add("hidden");
}

function showApp() {
  $("loginView")?.classList.add("hidden");
  $("appView")?.classList.remove("hidden");

  if ($("userName")) $("userName").textContent = state.usuario?.nome || "Usuário";
  if ($("userProfile")) $("userProfile").textContent = state.usuario?.perfil || "PERFIL";
  if ($("userStore")) $("userStore").textContent = getLojaLabel();
  if ($("welcomeName")) $("welcomeName").textContent = state.usuario?.nome || "usuário";

  if ($("welcomeStore")) {
    $("welcomeStore").textContent = state.usuario?.perfil === "ADMIN"
      ? "Você está como administrador e possui acesso a todas as lojas da OfficeNET."
      : "Você está vinculado à sua loja e só poderá operar nela.";
  }

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", state.usuario?.perfil !== "ADMIN");
  });

  atualizarVisibilidadeMultiLoja();
}

async function login(usuario, senha) {

  const data = await apiPost({
    acao: "login",
    usuario,
    senha
  });

  // PRIMEIRO ACESSO
  if (data.primeiroAcesso === true) {

    await abrirTelaPrimeiroAcesso(data);

    return;
  }

  // LOGIN NORMAL
  saveSession(data);

  if (
    state.usuario?.perfil === "PREENCHEDOR" &&
    !state.usuario.lojaId
  ) {
    throw new Error(
      "Seu usuário está sem LOJA_ID vinculado. Corrija a aba USUARIOS no Google Sheets."
    );
  }

  showApp();

  await loadData();

  openView("dashboard");
}

function abrirTelaPrimeiroAcesso(data) {

  const loginView = $("loginView");
  const primeiroAcessoView = $("primeiroAcessoView");

  if (!loginView || !primeiroAcessoView) {
    throw new Error(
      "Tela de primeiro acesso não encontrada."
    );
  }

  // Guarda temporariamente o token de primeiro acesso.
  state.tokenPrimeiroAcesso =
    data.tokenPrimeiroAcesso;

  // Mostra o nome do usuário.
  const nome =
    data.usuario?.nome ||
    "usuário";

  $("primeiroAcessoNome").textContent =
    nome;

  // Limpa os campos.
  $("primeiroAcessoForm")?.reset();

  // Limpa mensagens anteriores.
  showMessage(
    $("primeiroAcessoMensagem"),
    ""
  );

  // Esconde o login.
  loginView.classList.add("hidden");

  // Mostra a tela de primeiro acesso.
  primeiroAcessoView.classList.remove("hidden");

  // Coloca o cursor na senha.
  setTimeout(() => {
    $("primeiroAcessoNovaSenha")?.focus();
  }, 100);
}

async function validateSession() {
  if (!state.token) return false;

  try {
    const data = await apiPost({ acao: "validar_sessao", token: state.token });
    state.usuario = data.sessao;

    if (!state.usuario || !state.usuario.perfil) throw new Error("Sessão inválida.");

    if (state.usuario.perfil === "PREENCHEDOR" && !state.usuario.lojaId) {
      throw new Error("Sessão sem loja vinculada.");
    }

    state.lojaFiltro = state.usuario.perfil === "PREENCHEDOR"
      ? String(state.usuario.lojaId).trim()
      : "TODAS";

    localStorage.setItem("officenet_usuario", JSON.stringify(state.usuario));
    return true;
  } catch (error) {
    console.warn("Sessão encerrada:", error.message);
    clearSession();
    return false;
  }
}

async function logout() {
  try {
    if (state.token) await apiPost({ acao: "logout", token: state.token });
  } catch (_) {}

  clearSession();
  showLogin();
  $("loginForm")?.reset();
}

async function loadData() {

  if (!state.token || !state.usuario) {
    throw new Error(
      "Sessão inválida. Faça login novamente."
    );
  }

  const lojaId =
    state.usuario.perfil === "ADMIN" &&
    state.lojaFiltro !== "TODAS"
      ? state.lojaFiltro
      : undefined;

  const [
    materiaisData,
    lojasData,
    estoqueData,
    movimentacoesData
  ] = await Promise.all([

    apiGet("materiais"),

    apiGet("lojas"),

    apiGet(
      "estoque",
      lojaId
        ? { lojaId }
        : {}
    ),

    apiGet(
      "movimentacoes",
      lojaId
        ? { lojaId }
        : {}
    )

  ]);

  state.materiais =
    materiaisData.materiais || [];

  state.lojas =
    lojasData.lojas || [];

  state.estoque =
    estoqueData.estoque || [];

  state.movimentacoes =
    movimentacoesData.movimentacoes || [];

  renderAll();
}

function getEstoqueVisivel() {
  if (state.usuario?.perfil !== "ADMIN") return state.estoque;
  if (state.lojaFiltro === "TODAS") return state.estoque;

  return state.estoque.filter(
    (item) => String(item.lojaId || "").trim() === String(state.lojaFiltro).trim()
  );
}

function getMovimentacoesVisiveis() {
  if (state.usuario?.perfil !== "ADMIN") return state.movimentacoes;
  if (state.lojaFiltro === "TODAS") return state.movimentacoes;

  return state.movimentacoes.filter((item) => {
    const lojaId = item.LOJA_ID ?? item.lojaId ?? "";
    return String(lojaId).trim() === String(state.lojaFiltro).trim();
  });
}

function findMaterialById(id) {
  return state.materiais.find((material) => {
    const materialId = material.ID ?? material.id ?? material.Id;
    return String(materialId ?? "").trim() === String(id ?? "").trim();
  });
}

function materialField(material, names) {
  for (const name of names) {
    if (material?.[name] !== undefined && material?.[name] !== null) {
      return material[name];
    }
  }
  return "";
}

function getMaterialCode(material) {
  return materialField(material, ["CODIGO", "Código", "Codigo", "codigo"]);
}

function getMaterialName(material) {
  return materialField(material, ["MATERIAL", "Material", "NOME", "Nome", "nome"]);
}

function getMaterialCategory(material) {
  return materialField(material, ["CATEGORIA", "Categoria", "categoria"]);
}

function getMaterialUnit(material) {
  return materialField(material, ["UNIDADE", "Unidade", "unidade"]);
}

function getMaterialMinimum(material) {
  const value = materialField(material, [
    "ESTOQUE_MINIMO",
    "estoqueMinimo",
    "ESTOQUE MINIMO",
    "ESTOQUE MÍNIMO",
    "ESTOQUE_MIN",
    "MINIMO",
    "MÍNIMO",
    "minimo"
  ]);

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("pt-BR");
}

function statusClass(status) {
  const value = String(status || "").toUpperCase();
  return value.includes("BAIXO") || value.includes("ZERADO") || value.includes("CRÍTICO")
    ? "baixo"
    : "normal";
}

function renderAll() {
  renderStats();
  renderMaterials();
  renderMovementTables();
  renderProdutos();
  populateMaterialSelects();
  populateLojaFiltro();
  carregarLojasNoCadastro();
  atualizarVisibilidadeMultiLoja();
  atualizarContextos();
}

function renderStats() {
  const estoque = getEstoqueVisivel();
  const baixos = estoque.filter((item) => {
    const qtd = Number(item.quantidade || 0);
    const minimo = Number(
          item.estoqueMinimo ??
          item.ESTOQUE_MINIMO ??
          0
        );
    const status = String(item.status || "").toUpperCase();
    return status.includes("BAIXO") || status.includes("CRÍTICO") || qtd <= minimo;
  });

  if ($("statMateriais")) $("statMateriais").textContent = estoque.length;
  if ($("statBaixo")) $("statBaixo").textContent = baixos.length;
  if ($("statMovimentacoes")) $("statMovimentacoes").textContent = getMovimentacoesVisiveis().length;

  const tabelaDashboard = $("dashboardMovimentacoes");
  if (!tabelaDashboard) return;

  const recentes = [...getMovimentacoesVisiveis()].reverse().slice(0, 8);
  tabelaDashboard.innerHTML = recentes.length
    ? recentes.map((item) => {
        const tipo = String(item.TIPO ?? item.Tipo ?? item.tipo ?? "").toUpperCase();
        return `<tr>
          <td>${escapeHtml(formatDate(item.DATA ?? item.Data ?? item["Data/Hora"]))}</td>
          <td><span class="movement-badge ${tipo.includes("ENTR") ? "entrada" : "saida"}">${escapeHtml(tipo || "—")}</span></td>
          <td>${escapeHtml(item.CODIGO ?? item.Código ?? item.codigo ?? "—")}</td>
          <td>${escapeHtml(item.MATERIAL ?? item.Material ?? item.material ?? "—")}</td>
          <td>${escapeHtml(formatNumber(item.QUANTIDADE ?? item.Quantidade ?? item.quantidade ?? 0))}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="5">Nenhuma movimentação encontrada.</td></tr>`;
}

function renderMaterials() {
  const tabela = $("materiaisTable");
  if (!tabela) return;

  const busca = String($("estoqueBusca")?.value || "").trim().toLowerCase();
  const estoque = getEstoqueVisivel().filter((item) => {
    const material = findMaterialById(item.materialId);
    const texto = [
      item.codigo,
      item.material,
      item.categoria,
      item.unidade,
      item.lojaCodigo,
      item.lojaNome,
      getMaterialCode(material),
      getMaterialName(material),
      getMaterialCategory(material),
      getMaterialUnit(material)
    ].join(" ").toLowerCase();
    return texto.includes(busca);
  });

  tabela.innerHTML = estoque.length
    ? estoque.map((item) => {
        const material = findMaterialById(item.materialId);
        const codigo = item.codigo || getMaterialCode(material) || "—";
        const nome = item.material || getMaterialName(material) || "—";
        const categoria = item.categoria || getMaterialCategory(material) || "—";
        const unidade = item.unidade || getMaterialUnit(material) || "—";
        const quantidade = Number(item.quantidade || 0);
        const minimo = Number(
          item.estoqueMinimo ??
          item.ESTOQUE_MINIMO ??
          0
        );
        const status = item.status || (quantidade <= minimo ? "ESTOQUE BAIXO" : "NORMAL");

        return `<tr>
          <td><strong>${escapeHtml(codigo)}</strong></td>
          <td>${escapeHtml(nome)}</td>
          <td>${escapeHtml(categoria)}</td>
          <td>${escapeHtml(unidade)}</td>
          <td><strong>${formatNumber(quantidade)}</strong></td>
          <td>${formatNumber(minimo)}</td>
          <td><span class="status ${statusClass(status)}">${escapeHtml(status)}</span></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="7">Nenhum material encontrado.</td></tr>`;
}

function renderMovementTables() {
  const tabela = $("movimentacoesTable");
  if (!tabela) return;

  const busca = String($("movBusca")?.value || "").trim().toLowerCase();
  const movimentos = [...getMovimentacoesVisiveis()].reverse().filter((item) => {
    const texto = [
      item.CODIGO, item.Código, item.codigo,
      item.MATERIAL, item.Material, item.material,
      item.RESPONSAVEL, item.Responsável, item.responsavel,
      item.SOLICITANTE, item.Solicitante, item.solicitante,
      item.MOTIVO, item.Motivo, item.motivo,
      item.TIPO, item.Tipo, item.tipo
    ].join(" ").toLowerCase();
    return texto.includes(busca);
  });

  tabela.innerHTML = movimentos.length
    ? movimentos.map((item) => {
        const tipo = String(item.TIPO ?? item.Tipo ?? item.tipo ?? "").toUpperCase();
        return `<tr>
          <td>${escapeHtml(formatDate(item.DATA ?? item.Data ?? item["Data/Hora"]))}</td>
          <td><span class="movement-badge ${tipo.includes("ENTR") ? "entrada" : "saida"}">${escapeHtml(tipo || "—")}</span></td>
          <td><strong>${escapeHtml(item.CODIGO ?? item.Código ?? item.codigo ?? "—")}</strong></td>
          <td>${escapeHtml(item.MATERIAL ?? item.Material ?? item.material ?? "—")}</td>
          <td>${escapeHtml(formatNumber(item.ESTOQUE_ANTES ?? item["Estoque Antes"] ?? item.estoqueAntes ?? 0))}</td>
          <td>${escapeHtml(formatNumber(item.QUANTIDADE ?? item.Quantidade ?? item.quantidade ?? 0))}</td>
          <td>${escapeHtml(formatNumber(item.ESTOQUE_DEPOIS ?? item["Estoque Depois"] ?? item.estoqueDepois ?? 0))}</td>
          <td>${escapeHtml(item.RESPONSAVEL ?? item.Responsável ?? item.responsavel ?? "—")}</td>
          <td>${escapeHtml(item.PERFIL ?? item["Perfil do Registrador"] ?? item.perfilRegistrador ?? "—")}</td>
          <td>${escapeHtml(item.SOLICITANTE ?? item.Solicitante ?? item.solicitante ?? "—")}</td>
          <td>${escapeHtml(item.MOTIVO ?? item.Motivo ?? item.motivo ?? "—")}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="11">Nenhuma movimentação encontrada.</td></tr>`;
}

function populateLojaFiltro() {
  const filtro = $("estoqueLojaFiltro");
  if (!filtro) return;

  filtro.classList.toggle("hidden", state.usuario?.perfil !== "ADMIN");
  if (state.usuario?.perfil !== "ADMIN") return;

  const atual = state.lojaFiltro || "TODAS";
  filtro.innerHTML = `<option value="TODAS">Todas as lojas</option>` +
    state.lojas.map((loja) =>
      `<option value="${escapeHtml(loja.id)}">${escapeHtml(loja.codigo)} — ${escapeHtml(loja.nome)}</option>`
    ).join("");
  filtro.value = state.lojaFiltro = atual;

  if (filtro.value !== atual) {
    state.lojaFiltro = "TODAS";
    filtro.value = "TODAS";
  }
}

function carregarLojasNoCadastro() {
  const select = $("usuarioLoja");
  if (!select) return;

  const atual = select.value;
  select.innerHTML = `<option value="">Selecione a loja...</option>` +
    state.lojas.map((loja) =>
      `<option value="${escapeHtml(loja.id)}">${escapeHtml(loja.codigo)} — ${escapeHtml(loja.nome)}</option>`
    ).join("");

  if (state.lojas.some((loja) => String(loja.id) === String(atual))) {
    select.value = atual;
  }
}

function atualizarVisibilidadeMultiLoja() {
  const filtro = $("estoqueLojaFiltro");
  if (filtro) filtro.classList.toggle("hidden", state.usuario?.perfil !== "ADMIN");

  const container = $("usuarioLojaContainer");
  const perfil = $("usuarioPerfil");
  const loja = $("usuarioLoja");

  if (perfil && loja) {
    const preenchedor = perfil.value === "PREENCHEDOR";
    loja.disabled = !preenchedor;
    if (container) container.classList.toggle("hidden", !preenchedor);
    if (!preenchedor) loja.value = "";
  }
}

function atualizarContextos() {
  const label = getLojaLabel();
  if ($("userStore")) $("userStore").textContent = label;

  const contexto = $("estoqueContexto");
  if (contexto) {
    contexto.textContent = state.usuario?.perfil === "ADMIN"
      ? `Visualização: ${label}.`
      : `Visualização restrita à ${label}.`;
  }

  ["entradaLojaContext", "saidaLojaContext"].forEach((id) => {
    const element = $(id);
    if (!element) return;
    element.innerHTML = `Loja da operação: <strong>${escapeHtml(getLojaLabel())}</strong>`;
  });

  const resumo = $("estoqueResumoLoja");
  if (resumo) {
    resumo.textContent = state.usuario?.perfil === "ADMIN"
      ? `Administrador: selecione uma loja específica para registrar entrada ou saída. A opção “Todas as lojas” é somente para consulta.`
      : `PREENCHEDOR: você está limitado ao estoque da ${label}.`;
  }
}

function getOperacaoLojaId() {
  if (state.usuario?.perfil === "PREENCHEDOR") {
    return String(state.usuario.lojaId || "").trim();
  }

  if (state.usuario?.perfil === "ADMIN" && state.lojaFiltro !== "TODAS") {
    return String(state.lojaFiltro).trim();
  }

  return "";
}

function getEstoqueItem(materialId, lojaId) {
  return state.estoque.find((item) =>
    String(item.materialId || "").trim() === String(materialId || "").trim() &&
    String(item.lojaId || "").trim() === String(lojaId || "").trim()
  );
}

function populateMaterialSelects() {
  ["entradaCodigo", "saidaCodigo"].forEach((id) => {
    const select = $(id);
    if (!select) return;

    const atual = select.value;
    select.innerHTML = `<option value="">Selecione o material...</option>`;

    state.materiais.forEach((material) => {
      const materialId = material.ID ?? material.id ?? material.Id;
      const codigo = getMaterialCode(material);
      const nome = getMaterialName(material);
      const unidade = getMaterialUnit(material);
      if (materialId === undefined || !codigo) return;

      const lojaId = getOperacaoLojaId();
      let estoque = "";
      if (lojaId) {
        const item = getEstoqueItem(materialId, lojaId);
        estoque = ` — Estoque: ${formatNumber(item?.quantidade || 0)}`;
      } else if (state.usuario?.perfil === "ADMIN") {
        estoque = " — selecione uma loja";
      }

      select.insertAdjacentHTML("beforeend",
        `<option value="${escapeHtml(codigo)}">${escapeHtml(codigo)} — ${escapeHtml(nome)}${unidade ? ` (${escapeHtml(unidade)})` : ""}${escapeHtml(estoque)}</option>`
      );
    });

    if (Array.from(select.options).some((option) => option.value === atual)) {
      select.value = atual;
    }
  });
}

function openView(viewName) {
  const allowed = ["dashboard", "estoque", "entrada", "saida", "movimentacoes", "produtos", "usuarios"];
  if (!allowed.includes(viewName)) return;

  if (viewName === "usuarios" && state.usuario?.perfil !== "ADMIN") {
    showGlobalMessage("Acesso permitido somente ao ADMIN.", "error");
    return;
  }

  document.querySelectorAll(".page-view").forEach((view) => view.classList.add("hidden"));
  const target = $("view-" + viewName);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-btn[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  const titles = {
    dashboard: ["Dashboard", "Visão geral do estoque"],
    estoque: ["Estoque", "Materiais disponíveis"],
    entrada: ["Entrada", "Registrar entrada de material"],
    saida: ["Saída", "Registrar saída de material"],
    movimentacoes: ["Histórico", "Auditoria das movimentações"],
    produtos: ["Produtos", "Gerenciamento do catálogo"],
    usuarios: ["Usuários", "Gerenciamento de acessos"]
  };

  if ($("pageTitle")) $("pageTitle").textContent = titles[viewName][0];
  if ($("pageSubtitle")) $("pageSubtitle").textContent = titles[viewName][1];

  if (viewName === "estoque") renderMaterials();
  if (viewName === "movimentacoes") renderMovementTables();
  if (viewName === "produtos") renderProdutos();
  if (viewName === "usuarios") {
    carregarLojasNoCadastro();
    atualizarVisibilidadeMultiLoja();
  }
  atualizarContextos();
}


function renderProdutos() {
  const tabela = $("produtosTable");
  if (!tabela) return;

  if (state.usuario?.perfil !== "ADMIN") {
    tabela.innerHTML = `<tr><td colspan="6">Acesso permitido somente ao ADMIN.</td></tr>`;
    return;
  }

  const busca = String($("produtoBusca")?.value || "").trim().toLowerCase();

  const produtos = [...state.materiais]
    .filter((produto) => {
      const texto = [
        getMaterialCode(produto),
        getMaterialName(produto),
        getMaterialCategory(produto),
        getMaterialUnit(produto)
      ].join(" ").toLowerCase();

      return texto.includes(busca);
    })
    .sort((a, b) =>
      String(getMaterialCode(a)).localeCompare(
        String(getMaterialCode(b)),
        "pt-BR",
        { numeric: true, sensitivity: "base" }
      )
    );

  tabela.innerHTML = produtos.length
    ? produtos.map((produto) => {
        const id = produto.ID ?? produto.id ?? produto.Id;
        const codigo = getMaterialCode(produto);
        const nome = getMaterialName(produto);
        const categoria = getMaterialCategory(produto);
        const unidade = getMaterialUnit(produto);
        const minimo = getMaterialMinimum(produto);

        return `<tr>
          <td><strong>${escapeHtml(codigo || "—")}</strong></td>
          <td>${escapeHtml(nome || "—")}</td>
          <td>${escapeHtml(categoria || "—")}</td>
          <td>${escapeHtml(unidade || "—")}</td>
          <td>${escapeHtml(formatNumber(minimo))}</td>
          <td>
            <div class="product-actions">
              <button
                class="secondary-btn product-action-btn"
                type="button"
                data-product-edit="${escapeHtml(id)}"
              >Editar</button>
              <button
                class="danger-btn product-action-btn"
                type="button"
                data-product-delete="${escapeHtml(id)}"
              >Excluir</button>
            </div>
          </td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6">Nenhum produto encontrado.</td></tr>`;
}

function limparFormularioProduto() {
  $("produtoForm")?.reset();

  if ($("produtoId")) $("produtoId").value = "";
  if ($("produtoEstoqueMinimo")) $("produtoEstoqueMinimo").value = "0";

  if ($("produtoSubmitBtn")) {
    $("produtoSubmitBtn").textContent = "Cadastrar produto";
  }

  $("produtoCancelarBtn")?.classList.add("hidden");

  showMessage($("produtoMensagem"), "");
}

function preencherFormularioProduto(id) {
  const produto = findMaterialById(id);

  if (!produto) {
    showGlobalMessage("Produto não encontrado.", "error");
    return;
  }

  $("produtoId").value = produto.ID ?? produto.id ?? produto.Id ?? "";
  $("produtoCodigo").value = getMaterialCode(produto);
  $("produtoNome").value = getMaterialName(produto);
  $("produtoCategoria").value = getMaterialCategory(produto);
  $("produtoUnidade").value = getMaterialUnit(produto);
  $("produtoEstoqueMinimo").value = getMaterialMinimum(produto);

  $("produtoSubmitBtn").textContent = "Salvar alterações";
  $("produtoCancelarBtn")?.classList.remove("hidden");

  showMessage(
    $("produtoMensagem"),
    "Editando produto. Faça as alterações e salve."
  );

  $("produtoCodigo")?.focus();
  $("view-produtos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function salvarProduto(event) {
  event.preventDefault();

  if (state.usuario?.perfil !== "ADMIN") {
    showMessage(
      $("produtoMensagem"),
      "Somente ADMIN pode cadastrar ou editar produtos.",
      "error"
    );
    return;
  }

  const id = String($("produtoId")?.value || "").trim();

  try {
    const codigo = String($("produtoCodigo")?.value || "").trim();
    const material = String($("produtoNome")?.value || "").trim();
    const categoria = String($("produtoCategoria")?.value || "").trim();
    const unidade = String($("produtoUnidade")?.value || "").trim();
    const estoqueMinimo = Number($("produtoEstoqueMinimo")?.value);

    if (!codigo || !material || !categoria || !unidade) {
      throw new Error("Preencha todos os campos obrigatórios.");
    }

    if (!Number.isFinite(estoqueMinimo) || estoqueMinimo < 0) {
      throw new Error("Informe um estoque mínimo válido.");
    }

    const payload = {
      token: state.token,
      codigo,
      material,
      categoria,
      unidade,
      estoqueMinimo
    };

    if (id) {
      payload.acao = "editar_material";
      payload.id = id;
    } else {
      payload.acao = "cadastrar_material";
    }

    const resultado = await apiPost(payload);

    showMessage(
      $("produtoMensagem"),
      resultado.mensagem ||
        (id
          ? "Produto atualizado com sucesso!"
          : "Produto cadastrado com sucesso!"),
      "success"
    );

    // Reflete imediatamente o valor retornado pelo backend.
    if (id && resultado.material) {
      const indice = state.materiais.findIndex((item) => {
        const itemId = item.ID ?? item.id ?? item.Id;
        return String(itemId ?? "").trim() === String(id).trim();
      });

      if (indice >= 0) {
        state.materiais[indice] = {
          ...state.materiais[indice],
          ...resultado.material,
          ESTOQUE_MINIMO: Number(resultado.material.ESTOQUE_MINIMO) || 0,
          estoqueMinimo: Number(resultado.material.ESTOQUE_MINIMO) || 0
        };
      }
    }

    renderProdutos();
    limparFormularioProduto();
    await loadData();
    openView("produtos");
  } catch (error) {
    showMessage(
      $("produtoMensagem"),
      error.message || "Não foi possível salvar o produto.",
      "error"
    );
  }
}

async function excluirProduto(id) {
  if (state.usuario?.perfil !== "ADMIN") {
    showGlobalMessage("Somente ADMIN pode excluir produtos.", "error");
    return;
  }

  const produto = findMaterialById(id);

  if (!produto) {
    showGlobalMessage("Produto não encontrado.", "error");
    return;
  }

  const codigo = getMaterialCode(produto);
  const nome = getMaterialName(produto);

  const confirmado = window.confirm(
    `Excluir o produto "${codigo} — ${nome}"?\n\n` +
    "A exclusão só será permitida se não houver estoque e nem movimentações relacionadas."
  );

  if (!confirmado) return;

  try {
    const resultado = await apiPost({
      acao: "excluir_material",
      token: state.token,
      id
    });

    showGlobalMessage(
      resultado.mensagem || "Produto excluído com sucesso!",
      "success"
    );

    limparFormularioProduto();
    await loadData();
    openView("produtos");
  } catch (error) {
    showGlobalMessage(
      error.message || "Não foi possível excluir o produto.",
      "error"
    );
  }
}

async function registrarMovimentacao(tipo, event) {
  event.preventDefault();

  const prefixo = tipo === "entrada" ? "entrada" : "saida";
  const message = $(prefixo + "Mensagem");

  try {
    const codigo = $(prefixo + "Codigo").value;
    const quantidade = Number($(prefixo + "Quantidade").value);
    const lojaId = getOperacaoLojaId();

    if (!codigo) throw new Error("Selecione o material.");
    if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Informe uma quantidade válida.");
    if (!lojaId) throw new Error("Para esta operação, selecione uma loja específica.");

    await apiPost({
      acao: tipo === "entrada" ? "registrar_entrada" : "registrar_saida",
      token: state.token,
      codigo,
      quantidade,
      lojaId,
      solicitante: $(prefixo + "Solicitante")?.value.trim() || "",
      motivo: $(prefixo + "Motivo")?.value.trim() || (tipo === "entrada" ? "Entrada de material" : "Saída de material"),
      observacao: $(prefixo + "Observacao")?.value.trim() || ""
    });

    showMessage(message, tipo === "entrada" ? "Entrada registrada com sucesso!" : "Saída registrada com sucesso!", "success");
    $(prefixo + "Form").reset();
    await loadData();
  } catch (error) {
    showMessage(message, error.message || "Não foi possível concluir a operação.", "error");
  }
}

async function cadastrarUsuario(event) {
  event.preventDefault();

  const message = $("usuarioMensagem");

  try {
    if (state.usuario?.perfil !== "ADMIN") throw new Error("Somente ADMIN pode cadastrar usuários.");

    const perfil = $("usuarioPerfil").value;
    const lojaId = perfil === "ADMIN" ? "TODAS" : $("usuarioLoja").value;

    if (perfil === "PREENCHEDOR" && !lojaId) {
      throw new Error("Selecione a loja do PREENCHEDOR.");
    }

    await apiPost({
      acao: "cadastrar_usuario",
      token: state.token,
      nome: $("usuarioNome").value.trim(),
      usuario: $("usuarioLogin").value.trim(),
      senha: $("usuarioSenha").value,
      perfil,
      lojaId
    });

    showMessage(message, "Usuário cadastrado com sucesso!", "success");
    $("usuarioForm").reset();
    atualizarVisibilidadeMultiLoja();
  } catch (error) {
    showMessage(message, error.message || "Não foi possível cadastrar o usuário.", "error");
  }
}

function setupEvents() {
  $("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("loginMensagem");
    showMessage(message, "Entrando...");

    try {
      await login($("loginUsuario").value.trim(), $("loginSenha").value);
      showMessage(message, "");
    } catch (error) {
      showMessage(message, error.message || "Falha no login.", "error");
    }
  });

  $("logoutBtn")?.addEventListener("click", logout);

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openView(button.dataset.view);
    });
  });

  $("entradaForm")?.addEventListener("submit", (event) => registrarMovimentacao("entrada", event));
  $("saidaForm")?.addEventListener("submit", (event) => registrarMovimentacao("saida", event));
  $("usuarioForm")?.addEventListener("submit", cadastrarUsuario);

  $("produtoForm")?.addEventListener("submit", salvarProduto);

  $("produtoCancelarBtn")?.addEventListener("click", limparFormularioProduto);

  $("produtoBusca")?.addEventListener("input", renderProdutos);

  $("refreshProdutosBtn")?.addEventListener("click", async () => {
    try {
      await loadData();
      renderProdutos();
      showGlobalMessage("Produtos atualizados.", "success");
    } catch (error) {
      showGlobalMessage(error.message, "error");
    }
  });

  $("produtosTable")?.addEventListener("click", async (event) => {
    const editar = event.target.closest("[data-product-edit]");
    const excluir = event.target.closest("[data-product-delete]");

    if (editar) {
      preencherFormularioProduto(editar.dataset.productEdit);
      return;
    }

    if (excluir) {
      await excluirProduto(excluir.dataset.productDelete);
    }
  });

  $("refreshStockBtn")?.addEventListener("click", async () => {
    try {
      await loadData();
      showGlobalMessage("Estoque atualizado.", "success");
    } catch (error) {
      showGlobalMessage(error.message, "error");
    }
  });

  $("refreshMovBtn")?.addEventListener("click", async () => {
    try {
      await loadData();
      showGlobalMessage("Histórico atualizado.", "success");
    } catch (error) {
      showGlobalMessage(error.message, "error");
    }
  });

  $("estoqueBusca")?.addEventListener("input", renderMaterials);
  $("movBusca")?.addEventListener("input", renderMovementTables);

  $("estoqueLojaFiltro")?.addEventListener("change", async () => {
    state.lojaFiltro = $("estoqueLojaFiltro").value || "TODAS";
    try {
      await loadData();
    } catch (error) {
      showGlobalMessage(error.message, "error");
    }
  });

  $("usuarioPerfil")?.addEventListener("change", atualizarVisibilidadeMultiLoja);
}

async function init() {
  setupEvents();

  const valid = await validateSession();
  if (!valid) {
    showLogin();
    return;
  }

  showApp();

  try {
    await loadData();
    openView("dashboard");
  } catch (error) {
    showGlobalMessage(error.message, "error");
  }
}

document.addEventListener("DOMContentLoaded", init);
$("primeiroAcessoForm")?.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    const message =
      $("primeiroAcessoMensagem");

    const novaSenha =
      $("primeiroAcessoNovaSenha").value;

    const confirmarSenha =
      $("primeiroAcessoConfirmarSenha").value;

    try {

      if (!state.tokenPrimeiroAcesso) {
        throw new Error(
          "Sessão de primeiro acesso inválida. Faça login novamente."
        );
      }

      if (novaSenha.length < 6) {
        throw new Error(
          "A senha deve possuir pelo menos 6 caracteres."
        );
      }

      if (novaSenha !== confirmarSenha) {
        throw new Error(
          "As senhas não conferem."
        );
      }

      showMessage(
        message,
        "Salvando sua nova senha..."
      );

      const resultado = await apiPost({

        acao:
          "trocar_senha_primeiro_acesso",

        tokenPrimeiroAcesso:
          state.tokenPrimeiroAcesso,

        novaSenha:
          novaSenha,

        confirmarSenha:
          confirmarSenha
      });

      showMessage(
        message,
        resultado.mensagem ||
        "Senha criada com sucesso!",
        "success"
      );

      // O token temporário deixa de ser utilizado.
      state.tokenPrimeiroAcesso = "";

      // Aguarda um instante para o usuário
      // visualizar a mensagem.
      setTimeout(() => {

        $("primeiroAcessoView")
          ?.classList.add("hidden");

        $("loginView")
          ?.classList.remove("hidden");

        $("loginForm")
          ?.reset();

        showMessage(
          $("loginMensagem"),
          "Senha criada com sucesso. Agora faça login com sua nova senha.",
          "success"
        );

      }, 1200);

    } catch (error) {

      showMessage(
        message,
        error.message ||
        "Não foi possível alterar a senha.",
        "error"
      );
    }
  }
);
