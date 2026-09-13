const API_URL = "https://script.google.com/macros/s/AKfycbybAvrCWk6Fbjhy3mk2sX5S3cDThtJ-awptfeCpRIc__Nf6pYN_-CSFqLc0jNu-HhPEcw/exec";

const state = {
  token: localStorage.getItem("officenet_token") || "",
  usuario: null,
  materiais: [],
  estoque: [],
  movimentacoes: [],
  lojaFiltro: "TODAS"
};

const $ = (id) => document.getElementById(id);

function showMessage(element, message, type = "") {
  if (!element) return;
  element.textContent = message || "";
  element.className = "form-message " + type;
}

function showGlobalMessage(message, type = "") {
  const element = $("globalMessage");
  if (!element) return;

  element.textContent = message || "";
  element.className = "global-message " + type;

  if (message) {
    setTimeout(() => {
      element.textContent = "";
      element.className = "global-message";
    }, 5000);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function apiGet(acao, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("acao", acao);

  if (state.token) {
    url.searchParams.set("token", state.token);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), { method: "GET" });

  if (!response.ok) {
    throw new Error("Erro HTTP " + response.status);
  }

  const data = await response.json();

  if (!data.sucesso) {
    throw new Error(data.mensagem || "Erro na API.");
  }

  return data;
}

async function apiPost(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Erro HTTP " + response.status);
  }

  const data = await response.json();

  if (!data.sucesso) {
    throw new Error(data.mensagem || "Erro na API.");
  }

  return data;
}

function saveSession(data) {
  state.token = data.token;
  state.usuario = data.usuario;
  state.lojaFiltro =
    state.usuario?.perfil === "PREENCHEDOR"
      ? String(state.usuario.lojaId || "")
      : "TODAS";

  localStorage.setItem("officenet_token", data.token);
  localStorage.setItem("officenet_usuario", JSON.stringify(data.usuario));
}

function clearSession() {
  state.token = "";
  state.usuario = null;
  state.materiais = [];
  state.estoque = [];
  state.movimentacoes = [];
  state.lojaFiltro = "TODAS";

  localStorage.removeItem("officenet_token");
  localStorage.removeItem("officenet_usuario");
}

function getLojaLabel() {
  if (!state.usuario) return "Loja não identificada";

  if (state.usuario.perfil === "ADMIN") {
    return "Todas as lojas";
  }

  const lojaId = String(state.usuario.lojaId || "").trim();
  return lojaId ? "Loja " + lojaId : "Loja não vinculada";
}

function showLogin() {
  const loginView = $("loginView");
  const appView = $("appView");

  if (loginView) loginView.classList.remove("hidden");
  if (appView) appView.classList.add("hidden");
}

function showApp() {
  const loginView = $("loginView");
  const appView = $("appView");

  if (loginView) loginView.classList.add("hidden");
  if (appView) appView.classList.remove("hidden");

  if ($("userName")) $("userName").textContent = state.usuario.nome;
  if ($("userProfile")) $("userProfile").textContent = state.usuario.perfil;
  if ($("userStore")) $("userStore").textContent = getLojaLabel();
  if ($("welcomeName")) $("welcomeName").textContent = state.usuario.nome;

  if ($("welcomeStore")) {
    $("welcomeStore").textContent =
      state.usuario.perfil === "ADMIN"
        ? "Você está como administrador e possui acesso a todas as lojas da OfficeNET."
        : "Você está vinculado à " + getLojaLabel() + " e só poderá operar nessa loja.";
  }

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", state.usuario.perfil !== "ADMIN");
  });

  atualizarVisibilidadeMultiLoja();
}

async function login(usuario, senha) {
  const data = await apiPost({
    acao: "login",
    usuario,
    senha
  });

  saveSession(data);
  showApp();
  await loadData();
  openView("dashboard");
}

async function validateSession() {
  if (!state.token) return false;

  try {
    const data = await apiPost({
      acao: "validar_sessao",
      token: state.token
    });

    state.usuario = data.sessao;

    if (!state.usuario || !state.usuario.perfil) {
      throw new Error("Sessão inválida.");
    }

    state.lojaFiltro =
      state.usuario.perfil === "PREENCHEDOR"
        ? String(state.usuario.lojaId || "")
        : "TODAS";

    localStorage.setItem(
      "officenet_usuario",
      JSON.stringify(state.usuario)
    );

    return true;
  } catch (error) {
    clearSession();
    return false;
  }
}

async function logout() {
  try {
    if (state.token) {
      await apiPost({
        acao: "logout",
        token: state.token
      });
    }
  } catch (_) {
    // A sessão local será encerrada mesmo se a API falhar.
  }

  clearSession();
  showLogin();

  if ($("loginForm")) $("loginForm").reset();
}

async function loadData() {
  if (!state.token || !state.usuario) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  const params =
    state.usuario.perfil === "ADMIN" &&
    state.lojaFiltro !== "TODAS"
      ? { lojaId: state.lojaFiltro }
      : {};

  const resultados = await Promise.allSettled([
    apiGet("materiais"),
    apiGet("estoque", params),
    apiGet("movimentacoes", params)
  ]);

  const [materiaisResult, estoqueResult, movimentosResult] = resultados;

  const erros = [];

  if (materiaisResult.status === "fulfilled") {
    state.materiais = materiaisResult.value.materiais || [];
  } else {
    erros.push("materiais: " + materiaisResult.reason.message);
  }

  if (estoqueResult.status === "fulfilled") {
    state.estoque = estoqueResult.value.estoque || [];
  } else {
    erros.push("estoque: " + estoqueResult.reason.message);
  }

  if (movimentosResult.status === "fulfilled") {
    state.movimentacoes =
      movimentosResult.value.movimentacoes || [];
  } else {
    erros.push("movimentações: " + movimentosResult.reason.message);
  }

  if (erros.length) {
    throw new Error("Falha ao carregar dados: " + erros.join(" | "));
  }

  renderAll();
}

function renderAll() {
  renderStats();
  renderMaterials();
  renderMovementTables();
  populateMaterialSelects();
  atualizarListaDeLojas();
  populateLojaFiltro();
  atualizarContextoEstoque();
}

function getEstoqueVisivel() {
  if (state.usuario?.perfil !== "ADMIN") {
    return state.estoque;
  }

  if (state.lojaFiltro === "TODAS") {
    return state.estoque;
  }

  return state.estoque.filter(
    (item) =>
      String(item.lojaId || "").trim() ===
      String(state.lojaFiltro).trim()
  );
}

function getMovimentacoesVisiveis() {
  if (state.usuario?.perfil !== "ADMIN") {
    return state.movimentacoes;
  }

  if (state.lojaFiltro === "TODAS") {
    return state.movimentacoes;
  }

  return state.movimentacoes.filter((item) => {
    const lojaId = item.LOJA_ID ?? item.lojaId ?? "";
    return String(lojaId).trim() === String(state.lojaFiltro).trim();
  });
}

function findMaterialById(id) {
  return state.materiais.find((item) => {
    const materialId = item.ID ?? item.id ?? item.Id;
    return String(materialId).trim() === String(id).trim();
  });
}

function getMaterialCode(material) {
  return material?.Código ??
    material?.CODIGO ??
    material?.Codigo ??
    material?.codigo ??
    "";
}

function getMaterialName(material) {
  return material?.Material ??
    material?.MATERIAL ??
    material?.Nome ??
    material?.NOME ??
    material?.nome ??
    "";
}

function getMaterialCategory(material) {
  return material?.Categoria ??
    material?.CATEGORIA ??
    material?.categoria ??
    "";
}

function getMaterialUnit(material) {
  return material?.Unidade ??
    material?.UNIDADE ??
    material?.unidade ??
    "";
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";

  return number.toLocaleString("pt-BR", {
    maximumFractionDigits: 2
  });
}

function getStatusClass(status) {
  const value = String(status || "").toUpperCase();

  if (value.includes("BAIXO")) return "baixo";
  if (value.includes("ZERADO")) return "baixo";
  return "normal";
}

function renderStats() {
  const estoque = getEstoqueVisivel();
  const baixos = estoque.filter((item) => {
    const quantidade = Number(item.quantidade || 0);
    const minimo = Number(item.estoqueMinimo || 0);
    const status = String(item.status || "").toUpperCase();

    return (
      status.includes("BAIXO") ||
      status.includes("CRÍTICO") ||
      quantidade <= minimo
    );
  });

  if ($("statMateriais")) {
    $("statMateriais").textContent = estoque.length;
  }

  if ($("statBaixo")) {
    $("statBaixo").textContent = baixos.length;
  }

  if ($("statMovimentacoes")) {
    $("statMovimentacoes").textContent =
      getMovimentacoesVisiveis().length;
  }
}

function renderMaterials() {
  const tabela = $("materiaisTable");
  if (!tabela) return;

  const busca =
    ($("estoqueBusca")?.value || "")
      .trim()
      .toLowerCase();

  const estoque = getEstoqueVisivel();

  const filtrados = estoque.filter((item) => {
    const material = findMaterialById(item.materialId);

    const texto = [
      item.codigo,
      item.material,
      item.categoria,
      item.unidade,
      getMaterialCode(material),
      getMaterialName(material),
      getMaterialCategory(material),
      getMaterialUnit(material),
      item.lojaCodigo,
      item.lojaNome
    ]
      .join(" ")
      .toLowerCase();

    return texto.includes(busca);
  });

  if (!filtrados.length) {
    tabela.innerHTML =
      `<tr><td colspan="7">Nenhum material encontrado.</td></tr>`;
    return;
  }

  tabela.innerHTML = filtrados
    .map((item) => {
      const material = findMaterialById(item.materialId);

      const codigo =
        item.codigo || getMaterialCode(material) || "—";
      const nome =
        item.material || getMaterialName(material) || "—";
      const categoria =
        item.categoria || getMaterialCategory(material) || "—";
      const unidade =
        item.unidade || getMaterialUnit(material) || "—";

      const quantidade = Number(item.quantidade || 0);
      const minimo = Number(item.estoqueMinimo || 0);

      const status =
        item.status ||
        (quantidade <= minimo
          ? "ESTOQUE BAIXO"
          : "NORMAL");

      return `
        <tr>
          <td><strong>${escapeHtml(codigo)}</strong></td>
          <td>${escapeHtml(nome)}</td>
          <td>${escapeHtml(categoria)}</td>
          <td>${escapeHtml(unidade)}</td>
          <td><strong>${formatNumber(quantidade)}</strong></td>
          <td>${formatNumber(minimo)}</td>
          <td>
            <span class="status ${getStatusClass(status)}">
              ${escapeHtml(status)}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderMovementTables() {
  const movimentos = [...getMovimentacoesVisiveis()].reverse();

  const dashboard = $("dashboardMovimentacoes");

  if (dashboard) {
    const recentes = movimentos.slice(0, 8);

    dashboard.innerHTML = recentes.length
      ? recentes
          .map((item) => {
            const tipo = String(
              item.Tipo ?? item.tipo ?? ""
            ).toUpperCase();

            return `
              <tr>
                <td class="date-cell">
                  ${formatDate(item["Data/Hora"] ?? item.DATA ?? item.data)}
                </td>
                <td>
                  <span class="movement-badge ${
                    tipo === "ENTRADA" ? "entrada" : "saida"
                  }">
                    <span class="movement-dot"></span>
                    ${escapeHtml(tipo)}
                  </span>
                </td>
                <td class="material-cell">
                  ${escapeHtml(item.Material ?? item.material ?? "—")}
                </td>
                <td class="quantity-cell">
                  ${escapeHtml(item.Quantidade ?? item.quantidade ?? "0")}
                </td>
                <td class="responsible-cell">
                  ${escapeHtml(
                    item.Responsável ??
                    item.responsavel ??
                    "—"
                  )}
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5">Nenhuma movimentação encontrada.</td></tr>`;
  }

  const tabela = $("movimentacoesTable");
  if (!tabela) return;

  const busca =
    ($("movBusca")?.value || "")
      .trim()
      .toLowerCase();

  const filtrados = movimentos.filter((item) => {
    const texto = [
      item.Código,
      item.codigo,
      item.Material,
      item.material,
      item.Responsável,
      item.responsavel,
      item.Solicitante,
      item.solicitante,
      item.Motivo,
      item.motivo,
      item.Tipo,
      item.tipo
    ]
      .join(" ")
      .toLowerCase();

    return texto.includes(busca);
  });

  tabela.innerHTML = filtrados.length
    ? filtrados
        .map((item) => {
          const tipo = String(
            item.Tipo ?? item.tipo ?? ""
          ).toUpperCase();

          return `
            <tr>
              <td class="date-cell">
                ${formatDate(item["Data/Hora"] ?? item.DATA ?? item.data)}
              </td>
              <td>
                <span class="movement-badge ${
                  tipo === "ENTRADA" ? "entrada" : "saida"
                }">
                  <span class="movement-dot"></span>
                  ${escapeHtml(tipo)}
                </span>
              </td>
              <td><strong>${escapeHtml(item.Código ?? item.codigo ?? "—")}</strong></td>
              <td class="material-cell">
                ${escapeHtml(item.Material ?? item.material ?? "—")}
              </td>
              <td>${escapeHtml(item["Estoque Antes"] ?? item.estoqueAntes ?? "—")}</td>
              <td class="quantity-cell">
                ${escapeHtml(item.Quantidade ?? item.quantidade ?? "—")}
              </td>
              <td><strong>${escapeHtml(item["Estoque Depois"] ?? item.estoqueDepois ?? "—")}</strong></td>
              <td class="responsible-cell">
                ${escapeHtml(item.Responsável ?? item.responsavel ?? "—")}
              </td>
              <td>
                <span class="profile-badge">
                  ${escapeHtml(
                    item["Perfil do Registrador"] ??
                    item.perfilRegistrador ??
                    "—"
                  )}
                </span>
              </td>
              <td>${escapeHtml(item.Solicitante ?? item.solicitante ?? "—")}</td>
              <td>${escapeHtml(item.Motivo ?? item.motivo ?? "—")}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="11">Nenhuma movimentação encontrada.</td></tr>`;
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleString("pt-BR");
}

function getOperacaoLojaId() {
  if (!state.usuario) return "";

  if (state.usuario.perfil === "PREENCHEDOR") {
    return String(state.usuario.lojaId || "").trim();
  }

  if (state.usuario.perfil === "ADMIN") {
    return state.lojaFiltro === "TODAS"
      ? ""
      : String(state.lojaFiltro).trim();
  }

  return "";
}

function getEstoqueItem(materialId, lojaId) {
  return state.estoque.find((item) => {
    return (
      String(item.materialId || "").trim() === String(materialId).trim() &&
      String(item.lojaId || "").trim() === String(lojaId).trim()
    );
  });
}

function populateMaterialSelects() {
  const selects = [
    $("entradaCodigo"),
    $("saidaCodigo")
  ].filter(Boolean);

  selects.forEach((select) => {
    const current = select.value;

    select.innerHTML =
      `<option value="">Selecione o material...</option>`;

    state.materiais.forEach((material) => {
      const id = material.ID ?? material.id ?? material.Id;
      if (id === undefined || id === null) return;

      const codigo = getMaterialCode(material);
      const nome = getMaterialName(material);
      const unidade = getMaterialUnit(material);

      let estoqueTexto = "";

      if (state.usuario?.perfil === "PREENCHEDOR") {
        const item = getEstoqueItem(
          id,
          state.usuario.lojaId
        );
        estoqueTexto =
          " — Estoque: " +
          formatNumber(item?.quantidade || 0);
      } else if (state.lojaFiltro !== "TODAS") {
        const item = getEstoqueItem(
          id,
          state.lojaFiltro
        );
        estoqueTexto =
          " — Estoque: " +
          formatNumber(item?.quantidade || 0);
      } else {
        estoqueTexto = " — Selecione uma loja";
      }

      select.insertAdjacentHTML(
        "beforeend",
        `
          <option value="${escapeHtml(codigo)}">
            ${escapeHtml(codigo)} — ${escapeHtml(nome)}
            ${unidade ? " (" + escapeHtml(unidade) + ")" : ""}
            ${escapeHtml(estoqueTexto)}
          </option>
        `
      );
    });

    if (
      Array.from(select.options).some(
        (option) => option.value === current
      )
    ) {
      select.value = current;
    }
  });
}

function atualizarListaDeLojas() {
  // As lojas podem ser obtidas diretamente dos registros de ESTOQUE.
  // Isso evita depender de um endpoint adicional.
  state.lojas = [];

  const mapa = new Map();

  state.estoque.forEach((item) => {
    const id = String(item.lojaId || "").trim();
    if (!id || mapa.has(id)) return;

    mapa.set(id, {
      id,
      codigo: item.lojaCodigo || id,
      nome: item.lojaNome || ("Loja " + id)
    });
  });

  state.lojas = Array.from(mapa.values()).sort(
    (a, b) =>
      String(a.codigo).localeCompare(
        String(b.codigo),
        "pt-BR"
      )
  );
}

function populateLojaFiltro() {
  const filtro = $("estoqueLojaFiltro");

  if (!filtro || state.usuario?.perfil !== "ADMIN") {
    return;
  }

  const valorAtual = state.lojaFiltro || "TODAS";

  filtro.innerHTML = `
    <option value="TODAS">Todas as lojas</option>
    ${state.lojas
      .map(
        (loja) => `
          <option value="${escapeHtml(loja.id)}">
            ${escapeHtml(loja.codigo)} — ${escapeHtml(loja.nome)}
          </option>
        `
      )
      .join("")}
  `;

  filtro.value = valorAtual;

  if (filtro.value !== valorAtual) {
    state.lojaFiltro = "TODAS";
    filtro.value = "TODAS";
  }
}

function atualizarContextoEstoque() {
  const filtro = $("estoqueLojaFiltro");

  if (filtro) {
    filtro.classList.toggle(
      "hidden",
      state.usuario?.perfil !== "ADMIN"
    );
  }

  const titulo =
    $("estoqueContexto");

  if (titulo) {
    titulo.textContent =
      state.usuario?.perfil === "ADMIN"
        ? "Visualização administrativa das lojas."
        : "Visualização restrita à sua loja.";
  }

  if ($("userStore")) {
    $("userStore").textContent = getLojaLabel();
  }
}

function atualizarVisibilidadeMultiLoja() {
  const filtro = $("estoqueLojaFiltro");

  if (filtro) {
    filtro.classList.toggle(
      "hidden",
      state.usuario?.perfil !== "ADMIN"
    );
  }

  const container = $("usuarioLojaContainer");
  const perfil = $("usuarioPerfil");
  const loja = $("usuarioLoja");

  if (perfil && loja) {
    const preenchedor =
      perfil.value === "PREENCHEDOR";

    loja.disabled = !preenchedor;

    if (container) {
      container.classList.toggle(
        "hidden",
        !preenchedor
      );
    }

    if (!preenchedor) {
      loja.value = "TODAS";
    }
  }
}

function carregarLojasNoCadastro() {
  const select = $("usuarioLoja");

  if (!select) return;

  const lojas = state.lojas || [];

  select.innerHTML = `
    <option value="">Selecione a loja...</option>
    ${lojas
      .map(
        (loja) => `
          <option value="${escapeHtml(loja.id)}">
            ${escapeHtml(loja.codigo)} — ${escapeHtml(loja.nome)}
          </option>
        `
      )
      .join("")}
  `;
}

function openView(viewName) {
  const allowedViews = [
    "dashboard",
    "estoque",
    "entrada",
    "saida",
    "movimentacoes",
    "usuarios"
  ];

  if (!allowedViews.includes(viewName)) return;

  if (
    viewName === "usuarios" &&
    state.usuario?.perfil !== "ADMIN"
  ) {
    showGlobalMessage(
      "Acesso permitido somente ao ADMIN.",
      "error"
    );
    return;
  }

  // Sempre esconde todas as telas.
  document
    .querySelectorAll(".page-view")
    .forEach((view) => {
      view.classList.add("hidden");
    });

  // Mostra somente a tela escolhida.
  const target = $("view-" + viewName);

  if (target) {
    target.classList.remove("hidden");
  }

  // Somente um botão fica ativo.
  document
    .querySelectorAll(".nav-btn[data-view]")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.view === viewName
      );
    });

  const titles = {
    dashboard: [
      "Dashboard",
      "Visão geral do estoque"
    ],
    estoque: [
      "Estoque",
      "Materiais disponíveis"
    ],
    entrada: [
      "Entrada",
      "Registrar entrada de material"
    ],
    saida: [
      "Saída",
      "Registrar saída de material"
    ],
    movimentacoes: [
      "Histórico",
      "Auditoria das movimentações"
    ],
    usuarios: [
      "Usuários",
      "Gerenciamento de acessos"
    ]
  };

  if ($("pageTitle")) {
    $("pageTitle").textContent =
      titles[viewName][0];
  }

  if ($("pageSubtitle")) {
    $("pageSubtitle").textContent =
      titles[viewName][1];
  }

  if (viewName === "usuarios") {
    carregarLojasNoCadastro();
    atualizarVisibilidadeMultiLoja();
  }
}

async function registrarEntrada(event) {
  event.preventDefault();

  const message = $("entradaMensagem");

  try {
    const codigo = $("entradaCodigo").value;
    const quantidade = Number(
      $("entradaQuantidade").value
    );

    if (!codigo) {
      throw new Error("Selecione o material.");
    }

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error("Informe uma quantidade válida.");
    }

    const lojaId = getOperacaoLojaId();

    if (!lojaId) {
      throw new Error(
        "Selecione uma loja antes de registrar a entrada."
      );
    }

    await apiPost({
      acao: "registrar_entrada",
      token: state.token,
      codigo,
      quantidade,
      lojaId,
      solicitante:
        $("entradaSolicitante")?.value.trim() || "",
      motivo:
        $("entradaMotivo")?.value.trim() ||
        "Entrada de material",
      observacao:
        $("entradaObservacao")?.value.trim() || ""
    });

    showMessage(
      message,
      "Entrada registrada com sucesso!",
      "success"
    );

    $("entradaForm").reset();

    await loadData();
  } catch (error) {
    showMessage(
      message,
      error.message ||
        "Não foi possível registrar a entrada.",
      "error"
    );
  }
}

async function registrarSaida(event) {
  event.preventDefault();

  const message = $("saidaMensagem");

  try {
    const codigo = $("saidaCodigo").value;
    const quantidade = Number(
      $("saidaQuantidade").value
    );

    if (!codigo) {
      throw new Error("Selecione o material.");
    }

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error("Informe uma quantidade válida.");
    }

    const lojaId = getOperacaoLojaId();

    if (!lojaId) {
      throw new Error(
        "Selecione uma loja antes de registrar a saída."
      );
    }

    await apiPost({
      acao: "registrar_saida",
      token: state.token,
      codigo,
      quantidade,
      lojaId,
      solicitante:
        $("saidaSolicitante")?.value.trim() || "",
      motivo:
        $("saidaMotivo")?.value.trim() ||
        "Saída de material",
      observacao:
        $("saidaObservacao")?.value.trim() || ""
    });

    showMessage(
      message,
      "Saída registrada com sucesso!",
      "success"
    );

    $("saidaForm").reset();

    await loadData();
  } catch (error) {
    showMessage(
      message,
      error.message ||
        "Não foi possível registrar a saída.",
      "error"
    );
  }
}

async function cadastrarUsuario(event) {
  event.preventDefault();

  const message = $("usuarioMensagem");

  try {
    const perfil =
      $("usuarioPerfil").value;

    const lojaId =
      perfil === "ADMIN"
        ? "TODAS"
        : $("usuarioLoja").value;

    if (
      perfil === "PREENCHEDOR" &&
      !lojaId
    ) {
      throw new Error(
        "Selecione a loja do PREENCHEDOR."
      );
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

    showMessage(
      message,
      "Usuário cadastrado com sucesso!",
      "success"
    );

    $("usuarioForm").reset();

    atualizarVisibilidadeMultiLoja();
  } catch (error) {
    showMessage(
      message,
      error.message ||
        "Não foi possível cadastrar o usuário.",
      "error"
    );
  }
}

function setupEvents() {
  const loginForm = $("loginForm");
  const logoutBtn = $("logoutBtn");
  const entradaForm = $("entradaForm");
  const saidaForm = $("saidaForm");
  const usuarioForm = $("usuarioForm");
  const refreshStockBtn = $("refreshStockBtn");
  const refreshMovBtn = $("refreshMovBtn");
  const estoqueBusca = $("estoqueBusca");
  const movBusca = $("movBusca");
  const lojaFiltro = $("estoqueLojaFiltro");
  const usuarioPerfil = $("usuarioPerfil");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      showMessage(
        $("loginMensagem"),
        "Entrando..."
      );

      try {
        await login(
          $("loginUsuario").value.trim(),
          $("loginSenha").value
        );

        showMessage(
          $("loginMensagem"),
          ""
        );
      } catch (error) {
        showMessage(
          $("loginMensagem"),
          error.message,
          "error"
        );
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener(
      "click",
      logout
    );
  }

  document
    .querySelectorAll("[data-view]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          openView(button.dataset.view);
        }
      );
    });

  if (entradaForm) {
    entradaForm.addEventListener(
      "submit",
      registrarEntrada
    );
  }

  if (saidaForm) {
    saidaForm.addEventListener(
      "submit",
      registrarSaida
    );
  }

  if (usuarioForm) {
    usuarioForm.addEventListener(
      "submit",
      cadastrarUsuario
    );
  }

  if (refreshStockBtn) {
    refreshStockBtn.addEventListener(
      "click",
      async () => {
        try {
          await loadData();
          showGlobalMessage(
            "Estoque atualizado.",
            "success"
          );
        } catch (error) {
          showGlobalMessage(
            error.message,
            "error"
          );
        }
      }
    );
  }

  if (refreshMovBtn) {
    refreshMovBtn.addEventListener(
      "click",
      async () => {
        try {
          await loadData();
          showGlobalMessage(
            "Histórico atualizado.",
            "success"
          );
        } catch (error) {
          showGlobalMessage(
            error.message,
            "error"
          );
        }
      }
    );
  }

  if (estoqueBusca) {
    estoqueBusca.addEventListener(
      "input",
      renderMaterials
    );
  }

  if (movBusca) {
    movBusca.addEventListener(
      "input",
      renderMovementTables
    );
  }

  if (lojaFiltro) {
    lojaFiltro.addEventListener(
      "change",
      async () => {
        state.lojaFiltro =
          lojaFiltro.value || "TODAS";

        try {
          await loadData();
        } catch (error) {
          showGlobalMessage(
            error.message,
            "error"
          );
        }
      }
    );
  }

  if (usuarioPerfil) {
    usuarioPerfil.addEventListener(
      "change",
      () => {
        atualizarVisibilidadeMultiLoja();
      }
    );
  }
}

async function init() {
  // Uma única inicialização.
  setupEvents();

  const valid =
    await validateSession();

  if (!valid) {
    showLogin();
    return;
  }

  showApp();

  try {
    await loadData();
    openView("dashboard");
  } catch (error) {
    showGlobalMessage(
      error.message,
      "error"
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
