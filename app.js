const API_URL = "https://script.google.com/macros/s/AKfycbybAvrCWk6Fbjhy3mk2sX5S3cDThtJ-awptfeCpRIc__Nf6pYN_-CSFqLc0jNu-HhPEcw/exec";

const state = {
  token: localStorage.getItem("officenet_token") || "",
  usuario: null,
  materiais: [],
  estoque: [],
  movimentacoes: [],
  lojas: [],
  lojaFiltro: "TODAS"
};

function getLojaLabel() {
  if (!state.usuario) return "Loja não identificada";

  if (
    state.usuario.perfil === "ADMIN" ||
    String(state.usuario.lojaId || "").trim().toUpperCase() === "TODAS"
  ) {
    return "Todas as lojas";
  }

  const lojaId = String(state.usuario.lojaId || "").trim();
  return lojaId ? "Loja " + lojaId : "Loja não vinculada";
}

const $ = (id) => document.getElementById(id);

function showMessage(element, message, type = "") {
  if (!element) return;
  element.textContent = message || "";
  element.className = "form-message " + type;
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

  Object.entries(params).forEach(([chave, valor]) => {
    if (
      valor !== undefined &&
      valor !== null &&
      String(valor).trim() !== ""
    ) {
      url.searchParams.set(chave, valor);
    }
  });

  const response = await fetch(url.toString(), {
    method: "GET"
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

  localStorage.setItem(
    "officenet_token",
    data.token
  );

  localStorage.setItem(
    "officenet_usuario",
    JSON.stringify(data.usuario)
  );
}

function clearSession() {
  state.token = "";
  state.usuario = null;
  state.estoque = [];
  state.movimentacoes = [];
  state.lojas = [];
  state.lojaFiltro = "TODAS";

  localStorage.removeItem("officenet_token");
  localStorage.removeItem("officenet_usuario");
}

function showLogin() {
  $("loginView").classList.remove("hidden");
  $("appView").classList.add("hidden");
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  $("userName").textContent = state.usuario.nome;
  $("userProfile").textContent = state.usuario.perfil;
  $("userStore").textContent = getLojaLabel();

  $("welcomeName").textContent = state.usuario.nome;

  if (state.usuario.perfil === "ADMIN") {
    $("welcomeStore").textContent =
      "Você está como administrador e possui acesso a todas as lojas da OfficeNET.";
  } else {
    $("welcomeStore").textContent =
      "Você está vinculado à " +
      getLojaLabel() +
      " e só poderá operar nessa loja.";
  }

  document
    .querySelectorAll(".admin-only")
    .forEach((element) => {
      element.classList.toggle(
        "hidden",
        state.usuario.perfil !== "ADMIN"
      );
    });
}

async function login(usuario, senha) {
  const data = await apiPost({
    acao: "login",
    usuario,
    senha
  });

  saveSession(data);

  state.lojaFiltro = "TODAS";

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

    localStorage.setItem(
      "officenet_usuario",
      JSON.stringify(state.usuario)
    );

    return true;
  } catch {
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
  } catch {
    // Mesmo que a API falhe, removemos a sessão local.
  }

  clearSession();

  showLogin();

  $("loginForm").reset();
}
function loadData() {
  const tarefas = [];

  tarefas.push(
    apiGet("materiais")
  );

  tarefas.push(
    apiGet("estoque")
  );

  tarefas.push(
    apiGet("movimentacoes")
  );

  return Promise.all(tarefas)
    .then(([materiaisData, estoqueData, movimentacoesData]) => {
      state.materiais = materiaisData.materiais || [];
      state.estoque = estoqueData.estoque || [];
      state.movimentacoes =
        movimentacoesData.movimentacoes || [];

      renderAll();

      return {
        materiais: state.materiais,
        estoque: state.estoque,
        movimentacoes: state.movimentacoes
      };
    });
}

function renderAll() {
  renderDashboard();
  renderStockTable();
  renderMovementTables();
  populateMaterialSelects();
  renderLojaFilter();
}

function renderDashboard() {
  const estoque = getEstoqueFiltrado();

  const totalItens = estoque.length;

  const estoqueBaixo = estoque.filter((item) => {
    const status = String(
      item.status || ""
    ).toUpperCase();

    return (
      status.includes("BAIXO") ||
      status.includes("CRÍTICO")
    );
  }).length;

  const estoqueZerado = estoque.filter((item) => {
    const quantidade = Number(
      item.quantidade ?? 0
    );

    return quantidade <= 0;
  }).length;

  const movimentacoes = getMovimentacoesFiltradas();

  const elementos = {
    totalItens: $("totalMateriais"),
    estoqueBaixo: $("estoqueBaixo"),
    estoqueZerado: $("estoqueZerado"),
    totalMovimentacoes: $("totalMovimentacoes")
  };

  if (elementos.totalItens) {
    elementos.totalItens.textContent =
      totalItens;
  }

  if (elementos.estoqueBaixo) {
    elementos.estoqueBaixo.textContent =
      estoqueBaixo;
  }

  if (elementos.estoqueZerado) {
    elementos.estoqueZerado.textContent =
      estoqueZerado;
  }

  if (elementos.totalMovimentacoes) {
    elementos.totalMovimentacoes.textContent =
      movimentacoes.length;
  }
}

function getEstoqueFiltrado() {
  if (state.usuario?.perfil !== "ADMIN") {
    return state.estoque;
  }

  if (
    !state.lojaFiltro ||
    String(state.lojaFiltro)
      .trim()
      .toUpperCase() === "TODAS"
  ) {
    return state.estoque;
  }

  const lojaId = String(
    state.lojaFiltro
  ).trim();

  return state.estoque.filter((item) => {
    return String(
      item.lojaId ?? ""
    ).trim() === lojaId;
  });
}

function getMovimentacoesFiltradas() {
  if (state.usuario?.perfil !== "ADMIN") {
    return state.movimentacoes;
  }

  if (
    !state.lojaFiltro ||
    String(state.lojaFiltro)
      .trim()
      .toUpperCase() === "TODAS"
  ) {
    return state.movimentacoes;
  }

  const lojaId = String(
    state.lojaFiltro
  ).trim();

  return state.movimentacoes.filter((item) => {
    return String(
      item.LOJA_ID ??
      item.lojaId ??
      ""
    ).trim() === lojaId;
  });
}

function getEstoqueItem(materialId, lojaId) {
  return state.estoque.find((item) => {
    return (
      String(item.materialId ?? "").trim() ===
        String(materialId ?? "").trim() &&
      String(item.lojaId ?? "").trim() ===
        String(lojaId ?? "").trim()
    );
  });
}

function formatNumber(value) {
  const numero = Number(value);

  if (!Number.isFinite(numero)) {
    return "0";
  }

  return numero.toLocaleString("pt-BR", {
    maximumFractionDigits: 2
  });
}

function getStatusClass(status) {
  const texto = String(
    status || ""
  ).toUpperCase();

  if (
    texto.includes("NORMAL") ||
    texto.includes("OK")
  ) {
    return "status-normal";
  }

  if (
    texto.includes("BAIXO") ||
    texto.includes("CRÍTICO")
  ) {
    return "status-baixo";
  }

  if (texto.includes("ZERADO")) {
    return "status-zerado";
  }

  return "";
}

function getMaterialField(item, ...nomes) {
  for (const nome of nomes) {
    if (
      item &&
      item[nome] !== undefined &&
      item[nome] !== null
    ) {
      return item[nome];
    }
  }

  return "";
}

function findMaterialById(id) {
  return state.materiais.find((material) => {
    return String(
      material.ID ??
      material.id ??
      material.Id ??
      ""
    ).trim() === String(id).trim();
  });
}

function getMaterialCode(material) {
  return getMaterialField(
    material,
    "Código",
    "CODIGO",
    "Codigo",
    "codigo",
    "Código Material"
  );
}

function getMaterialName(material) {
  return getMaterialField(
    material,
    "Material",
    "NOME",
    "Nome",
    "nome",
    "Descrição",
    "DESCRICAO",
    "descricao"
  );
}

function getMaterialCategory(material) {
  return getMaterialField(
    material,
    "Categoria",
    "CATEGORIA",
    "categoria"
  );
}

function getMaterialUnit(material) {
  return getMaterialField(
    material,
    "Unidade",
    "UNIDADE",
    "unidade"
  );
}

function renderStockTable() {
  const tabela = $("materiaisTable");

  if (!tabela) return;

  const estoque = getEstoqueFiltrado();

  if (!estoque.length) {
    tabela.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          Nenhum item de estoque encontrado.
        </td>
      </tr>
    `;
    return;
  }

  tabela.innerHTML = estoque.map((item) => {
    const material = findMaterialById(
      item.materialId
    );

    const codigo =
      item.codigo ||
      getMaterialCode(material) ||
      "—";

    const nome =
      item.material ||
      item.nome ||
      getMaterialName(material) ||
      "Material";

    const categoria =
      item.categoria ||
      getMaterialCategory(material) ||
      "—";

    const unidade =
      item.unidade ||
      getMaterialUnit(material) ||
      "—";

    const quantidade = Number(
      item.quantidade ?? 0
    );

    const minimo = Number(
      item.estoqueMinimo ?? 0
    );

    const status =
      item.status ||
      (quantidade <= 0
        ? "ESTOQUE ZERADO"
        : quantidade <= minimo
          ? "ESTOQUE BAIXO"
          : "NORMAL");

    const statusClass =
      getStatusClass(status);

    return `
      <tr>
        <td>
          <strong>${escapeHtml(codigo)}</strong>
        </td>

        <td>
          ${escapeHtml(nome)}
        </td>

        <td>
          ${escapeHtml(categoria)}
        </td>

        <td>
          ${escapeHtml(unidade)}
        </td>

        <td>
          <strong>${formatNumber(quantidade)}</strong>
        </td>

        <td>
          ${formatNumber(minimo)}
        </td>

        <td>
          <span class="status-badge ${statusClass}">
            ${escapeHtml(status)}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

function renderLojaFilter() {
  if (state.usuario?.perfil !== "ADMIN") {
    return;
  }

  const filtro =
    $("estoqueLojaFiltro");

  if (!filtro) {
    return;
  }

  const lojas = getLojasFromEstoque();

  const valorAtual =
    state.lojaFiltro || "TODAS";

  filtro.innerHTML = `
    <option value="TODAS">
      Todas as lojas
    </option>

    ${lojas.map((loja) => `
      <option value="${escapeHtml(loja.id)}">
        ${escapeHtml(loja.codigo)} —
        ${escapeHtml(loja.nome)}
      </option>
    `).join("")}
  `;

  filtro.value = valorAtual;

  if (filtro.value !== valorAtual) {
    filtro.value = "TODAS";
    state.lojaFiltro = "TODAS";
  }
}

function getLojasFromEstoque() {
  const mapa = new Map();

  state.estoque.forEach((item) => {
    const id = String(
      item.lojaId ?? ""
    ).trim();

    if (!id) return;

    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        codigo:
          item.lojaCodigo ||
          id,
        nome:
          item.lojaNome ||
          ("Loja " + id)
      });
    }
  });

  return Array.from(
    mapa.values()
  ).sort((a, b) =>
    String(a.codigo).localeCompare(
      String(b.codigo),
      "pt-BR"
    )
  );
}

function atualizarFiltroLoja() {
  const filtro =
    $("estoqueLojaFiltro");

  if (!filtro) return;

  state.lojaFiltro =
    filtro.value || "TODAS";

  renderDashboard();
  renderStockTable();
  renderMovementTables();
}
function renderMovementTables() {
  const tabela = $("movimentacoesTable");

  if (!tabela) return;

  const movimentacoes =
    getMovimentacoesFiltradas();

  if (!movimentacoes.length) {
    tabela.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">
          Nenhuma movimentação encontrada.
        </td>
      </tr>
    `;
    return;
  }

  const ordenadas = [...movimentacoes].reverse();

  tabela.innerHTML = ordenadas.map((item) => {
    const data =
      item.DATA ||
      item.data ||
      item.Timestamp ||
      "—";

    const tipo =
      item.TIPO ||
      item.tipo ||
      item.Tipo ||
      "—";

    const codigo =
      item.CODIGO ||
      item.codigo ||
      item["Código"] ||
      "—";

    const material =
      item.MATERIAL ||
      item.material ||
      item["Material"] ||
      "—";

    const antes =
      item.ESTOQUE_ANTES ??
      item["Estoque Antes"] ??
      item.estoqueAntes ??
      "—";

    const quantidade =
      item.QUANTIDADE ??
      item.quantidade ??
      "—";

    const depois =
      item.ESTOQUE_DEPOIS ??
      item["Estoque Depois"] ??
      item.estoqueDepois ??
      "—";

    const responsavel =
      item.RESPONSAVEL ||
      item.responsavel ||
      item.USUARIO ||
      item.usuario ||
      "—";

    const perfil =
      item.PERFIL ||
      item.perfil ||
      "—";

    const solicitante =
      item.SOLICITANTE ||
      item.solicitante ||
      "—";

    const motivo =
      item.MOTIVO ||
      item.motivo ||
      item.OBSERVACAO ||
      item.observacao ||
      "—";

    const tipoNormalizado =
      String(tipo)
        .trim()
        .toUpperCase();

    const classeTipo =
      tipoNormalizado.includes("ENTR")
        ? "entrada"
        : tipoNormalizado.includes("SAÍ")
          || tipoNormalizado.includes("SAI")
          ? "saida"
          : "";

    return `
      <tr>
        <td>
          ${escapeHtml(formatDateTime(data))}
        </td>

        <td>
          <span class="movement-type ${classeTipo}">
            ${escapeHtml(tipo)}
          </span>
        </td>

        <td>
          <strong>
            ${escapeHtml(codigo)}
          </strong>
        </td>

        <td>
          ${escapeHtml(material)}
        </td>

        <td>
          ${formatNumber(antes)}
        </td>

        <td>
          ${formatNumber(quantidade)}
        </td>

        <td>
          ${formatNumber(depois)}
        </td>

        <td>
          ${escapeHtml(responsavel)}
        </td>

        <td>
          ${escapeHtml(perfil)}
        </td>

        <td>
          ${escapeHtml(motivo)}
        </td>
      </tr>
    `;
  }).join("");
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  if (value instanceof Date) {
    return value.toLocaleString("pt-BR");
  }

  const texto = String(value).trim();

  if (!texto) {
    return "—";
  }

  const data = new Date(texto);

  if (!Number.isNaN(data.getTime())) {
    return data.toLocaleString("pt-BR");
  }

  return texto;
}

function populateMaterialSelects() {
  const selects = [
    $("entradaMaterial"),
    $("saidaMaterial")
  ];

  selects.forEach((select) => {
    if (!select) return;

    const valorAtual =
      select.value;

    select.innerHTML = `
      <option value="">
        Selecione o material
      </option>
    `;

    state.materiais.forEach((material) => {
      const id =
        material.ID ??
        material.id ??
        material.Id;

      if (
        id === undefined ||
        id === null ||
        String(id).trim() === ""
      ) {
        return;
      }

      const codigo =
        getMaterialCode(material);

      const nome =
        getMaterialName(material);

      const unidade =
        getMaterialUnit(material);

      const estoqueItem =
        getEstoqueItem(
          id,
          getOperacaoLojaId()
        );

      const quantidade =
        estoqueItem
          ? Number(
              estoqueItem.quantidade ?? 0
            )
          : 0;

      select.insertAdjacentHTML(
        "beforeend",
        `
          <option value="${escapeHtml(id)}">
            ${escapeHtml(codigo || "")}
            — ${escapeHtml(nome || "Material")}
            ${unidade
              ? " (" + escapeHtml(unidade) + ")"
              : ""}
            — Estoque: ${formatNumber(quantidade)}
          </option>
        `
      );
    });

    if (
      Array.from(select.options)
        .some(
          (option) =>
            option.value === valorAtual
        )
    ) {
      select.value = valorAtual;
    }
  });
}

function getOperacaoLojaId() {
  if (!state.usuario) {
    return "";
  }

  if (
    state.usuario.perfil === "ADMIN"
  ) {
    if (
      state.lojaFiltro &&
      String(state.lojaFiltro)
        .trim()
        .toUpperCase() !== "TODAS"
    ) {
      return String(
        state.lojaFiltro
      ).trim();
    }

    return "";
  }

  return String(
    state.usuario.lojaId || ""
  ).trim();
}

function getSelectedMaterialId(selectId) {
  const select = $(selectId);

  if (!select) {
    return "";
  }

  return String(
    select.value || ""
  ).trim();
}

function getSelectedMaterial(selectId) {
  const materialId =
    getSelectedMaterialId(selectId);

  if (!materialId) {
    return null;
  }

  return findMaterialById(
    materialId
  );
}

function updateOperationStockPreview(
  tipo
) {
  const selectId =
    tipo === "entrada"
      ? "entradaMaterial"
      : "saidaMaterial";

  const previewId =
    tipo === "entrada"
      ? "entradaEstoqueAtual"
      : "saidaEstoqueAtual";

  const preview =
    $(previewId);

  if (!preview) {
    return;
  }

  const material =
    getSelectedMaterial(selectId);

  if (!material) {
    preview.textContent = "—";
    return;
  }

  const materialId =
    material.ID ??
    material.id ??
    material.Id;

  let lojaId =
    getOperacaoLojaId();

  if (!lojaId) {
    preview.textContent =
      "Selecione uma loja";
    return;
  }

  const item =
    getEstoqueItem(
      materialId,
      lojaId
    );

  preview.textContent =
    item
      ? formatNumber(item.quantidade)
      : "0";
}

function updateOperationStoreInfo() {
  const entradaInfo =
    $("entradaLojaInfo");

  const saidaInfo =
    $("saidaLojaInfo");

  const label =
    getLojaLabel();

  if (entradaInfo) {
    entradaInfo.textContent =
      label;
  }

  if (saidaInfo) {
    saidaInfo.textContent =
      label;
  }
}

function clearOperationPreviews() {
  const ids = [
    "entradaEstoqueAtual",
    "saidaEstoqueAtual"
  ];

  ids.forEach((id) => {
    const element = $(id);

    if (element) {
      element.textContent = "—";
    }
  });
}

function handleMaterialSelection(
  tipo
) {
  updateOperationStockPreview(
    tipo
  );
}

function refreshInterfaceAfterStockChange() {
  renderDashboard();
  renderStockTable();
  renderMovementTables();
  populateMaterialSelects();
  updateOperationStoreInfo();
  clearOperationPreviews();
}

function ensureAdminStoreSelected() {
  if (
    state.usuario?.perfil !== "ADMIN"
  ) {
    return true;
  }

  const lojaId =
    getOperacaoLojaId();

  if (!lojaId) {
    alert(
      "Para realizar esta operação, selecione uma loja específica."
    );

    return false;
  }

  return true;
}

function getFormValue(
  form,
  selectors
) {
  for (const selector of selectors) {
    const element =
      form.querySelector(selector);

    if (
      element &&
      String(element.value).trim() !== ""
    ) {
      return String(
        element.value
      ).trim();
    }
  }

  return "";
}

function getQuantityValue(
  form,
  selectors
) {
  const value =
    getFormValue(
      form,
      selectors
    );

  const numero =
    Number(value);

  if (
    !Number.isFinite(numero) ||
    numero <= 0
  ) {
    return 0;
  }

  return numero;
}
function openView(viewName) {
  const views = document.querySelectorAll(".view");

  views.forEach((view) => {
    view.classList.add("hidden");
  });

  const target = $("view-" + viewName);

  if (!target) {
    return;
  }

  target.classList.remove("hidden");

  document
    .querySelectorAll(".menu-item")
    .forEach((item) => {
      item.classList.remove("active");
    });

  const menuItem = document.querySelector(
    `[data-view="${viewName}"]`
  );

  if (menuItem) {
    menuItem.classList.add("active");
  }

  if (viewName === "estoque") {
    renderStockTable();
    renderLojaFilter();
  }

  if (viewName === "movimentacoes") {
    renderMovementTables();
  }

  if (
    viewName === "entrada" ||
    viewName === "saida"
  ) {
    populateMaterialSelects();
    updateOperationStoreInfo();
    clearOperationPreviews();
  }

  if (viewName === "usuarios") {
    if (
      state.usuario?.perfil !== "ADMIN"
    ) {
      openView("dashboard");
      return;
    }
  }
}

function bindNavigation() {
  document
    .querySelectorAll("[data-view]")
    .forEach((element) => {
      element.addEventListener(
        "click",
        (event) => {
          event.preventDefault();

          const view =
            element.dataset.view;

          if (!view) {
            return;
          }

          if (
            view === "usuarios" &&
            state.usuario?.perfil !== "ADMIN"
          ) {
            return;
          }

          openView(view);
        }
      );
    });
}

function bindLogout() {
  const buttons =
    document.querySelectorAll(
      '[data-action="logout"], #logoutBtn'
    );

  buttons.forEach((button) => {
    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        await logout();
      }
    );
  });
}

function bindStockFilter() {
  const filtro =
    $("estoqueLojaFiltro");

  if (!filtro) {
    return;
  }

  filtro.addEventListener(
    "change",
    () => {
      atualizarFiltroLoja();
    }
  );
}

function bindMaterialPreviews() {
  const entrada =
    $("entradaMaterial");

  const saida =
    $("saidaMaterial");

  if (entrada) {
    entrada.addEventListener(
      "change",
      () => {
        handleMaterialSelection(
          "entrada"
        );
      }
    );
  }

  if (saida) {
    saida.addEventListener(
      "change",
      () => {
        handleMaterialSelection(
          "saida"
        );
      }
    );
  }
}

function bindLoginForm() {
  const form =
    $("loginForm");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const usuario =
        getFormValue(
          form,
          [
            "#loginUsuario",
            '[name="usuario"]',
            '[name="login"]'
          ]
        );

      const senha =
        getFormValue(
          form,
          [
            "#loginSenha",
            '[name="senha"]',
            '[name="password"]'
          ]
        );

      const mensagem =
        $("loginMessage");

      if (!usuario || !senha) {
        showMessage(
          mensagem,
          "Informe usuário e senha.",
          "error"
        );
        return;
      }

      const botao =
        form.querySelector(
          'button[type="submit"]'
        );

      if (botao) {
        botao.disabled = true;
      }

      showMessage(
        mensagem,
        "Entrando...",
        ""
      );

      try {
        await login(
          usuario,
          senha
        );

        showMessage(
          mensagem,
          "",
          ""
        );
      } catch (error) {
        showMessage(
          mensagem,
          error.message ||
            "Não foi possível realizar o login.",
          "error"
        );
      } finally {
        if (botao) {
          botao.disabled = false;
        }
      }
    }
  );
}

async function registrarEntrada(form) {
  if (!state.token) {
    throw new Error(
      "Sessão expirada. Faça login novamente."
    );
  }

  if (
    state.usuario?.perfil ===
    "ADMIN" &&
    !ensureAdminStoreSelected()
  ) {
    return;
  }

  const material =
    getSelectedMaterial(
      "entradaMaterial"
    );

  if (!material) {
    throw new Error(
      "Selecione um material."
    );
  }

  const quantidade =
    getQuantityValue(
      form,
      [
        "#entradaQuantidade",
        '[name="quantidade"]',
        '[name="qtd"]'
      ]
    );

  if (quantidade <= 0) {
    throw new Error(
      "Informe uma quantidade válida."
    );
  }

  const motivo =
    getFormValue(
      form,
      [
        "#entradaMotivo",
        '[name="motivo"]',
        '[name="observacao"]',
        '[name="observação"]'
      ]
    );

  const materialId =
    material.ID ??
    material.id ??
    material.Id;

  const lojaId =
    getOperacaoLojaId();

  if (!lojaId) {
    throw new Error(
      "Não foi possível identificar a loja da operação."
    );
  }

  const data =
    await apiPost({
      acao: "registrar_entrada",
      token: state.token,
      materialId: materialId,
      lojaId: lojaId,
      quantidade: quantidade,
      motivo: motivo
    });

  await loadData();

  refreshInterfaceAfterStockChange();

  return data;
}

async function registrarSaida(form) {
  if (!state.token) {
    throw new Error(
      "Sessão expirada. Faça login novamente."
    );
  }

  if (
    state.usuario?.perfil ===
    "ADMIN" &&
    !ensureAdminStoreSelected()
  ) {
    return;
  }

  const material =
    getSelectedMaterial(
      "saidaMaterial"
    );

  if (!material) {
    throw new Error(
      "Selecione um material."
    );
  }

  const quantidade =
    getQuantityValue(
      form,
      [
        "#saidaQuantidade",
        '[name="quantidade"]',
        '[name="qtd"]'
      ]
    );

  if (quantidade <= 0) {
    throw new Error(
      "Informe uma quantidade válida."
    );
  }

  const motivo =
    getFormValue(
      form,
      [
        "#saidaMotivo",
        '[name="motivo"]',
        '[name="observacao"]',
        '[name="observação"]'
      ]
    );

  const materialId =
    material.ID ??
    material.id ??
    material.Id;

  const lojaId =
    getOperacaoLojaId();

  if (!lojaId) {
    throw new Error(
      "Não foi possível identificar a loja da operação."
    );
  }

  const data =
    await apiPost({
      acao: "registrar_saida",
      token: state.token,
      materialId: materialId,
      lojaId: lojaId,
      quantidade: quantidade,
      motivo: motivo
    });

  await loadData();

  refreshInterfaceAfterStockChange();

  return data;
}

function bindEntryForm() {
  const form =
    $("entradaForm");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const mensagem =
        $("entradaMessage");

      const botao =
        form.querySelector(
          'button[type="submit"]'
        );

      if (botao) {
        botao.disabled = true;
      }

      showMessage(
        mensagem,
        "Registrando entrada...",
        ""
      );

      try {
        await registrarEntrada(
          form
        );

        showMessage(
          mensagem,
          "Entrada registrada com sucesso!",
          "success"
        );

        form.reset();

        clearOperationPreviews();
      } catch (error) {
        showMessage(
          mensagem,
          error.message ||
            "Não foi possível registrar a entrada.",
          "error"
        );
      } finally {
        if (botao) {
          botao.disabled = false;
        }
      }
    }
  );
}

function bindExitForm() {
  const form =
    $("saidaForm");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const mensagem =
        $("saidaMessage");

      const botao =
        form.querySelector(
          'button[type="submit"]'
        );

      if (botao) {
        botao.disabled = true;
      }

      showMessage(
        mensagem,
        "Registrando saída...",
        ""
      );

      try {
        await registrarSaida(
          form
        );

        showMessage(
          mensagem,
          "Saída registrada com sucesso!",
          "success"
        );

        form.reset();

        clearOperationPreviews();
      } catch (error) {
        showMessage(
          mensagem,
          error.message ||
            "Não foi possível registrar a saída.",
          "error"
        );
      } finally {
        if (botao) {
          botao.disabled = false;
        }
      }
    }
  );
}
function bindUserForm() {
  const form = $("usuarioForm");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      if (state.usuario?.perfil !== "ADMIN") {
        return;
      }

      const nome = getFormValue(form, [
        "#usuarioNome",
        '[name="nome"]'
      ]);

      const usuario = getFormValue(form, [
        "#usuarioLogin",
        '[name="usuario"]',
        '[name="login"]'
      ]);

      const senha = getFormValue(form, [
        "#usuarioSenha",
        '[name="senha"]',
        '[name="password"]'
      ]);

      const perfil = getFormValue(form, [
        "#usuarioPerfil",
        '[name="perfil"]'
      ]);

      const lojaId = getFormValue(form, [
        "#usuarioLoja",
        '[name="lojaId"]',
        '[name="loja"]'
      ]);

      const mensagem = $("usuarioMessage");

      if (!nome) {
        showMessage(
          mensagem,
          "Informe o nome do usuário.",
          "error"
        );
        return;
      }

      if (!usuario) {
        showMessage(
          mensagem,
          "Informe o login do usuário.",
          "error"
        );
        return;
      }

      if (!senha) {
        showMessage(
          mensagem,
          "Informe a senha do usuário.",
          "error"
        );
        return;
      }

      if (!perfil) {
        showMessage(
          mensagem,
          "Selecione o perfil do usuário.",
          "error"
        );
        return;
      }

      if (
        perfil === "PREENCHEDOR" &&
        !lojaId
      ) {
        showMessage(
          mensagem,
          "Selecione a loja do PREENCHEDOR.",
          "error"
        );
        return;
      }

      const botao = form.querySelector(
        'button[type="submit"]'
      );

      if (botao) {
        botao.disabled = true;
      }

      showMessage(
        mensagem,
        "Cadastrando usuário...",
        ""
      );

      try {
        await apiPost({
          acao: "cadastrar_usuario",
          token: state.token,
          nome: nome,
          usuario: usuario,
          senha: senha,
          perfil: perfil,
          lojaId:
            perfil === "ADMIN"
              ? "TODAS"
              : lojaId
        });

        showMessage(
          mensagem,
          "Usuário cadastrado com sucesso!",
          "success"
        );

        form.reset();
      } catch (error) {
        showMessage(
          mensagem,
          error.message ||
            "Não foi possível cadastrar o usuário.",
          "error"
        );
      } finally {
        if (botao) {
          botao.disabled = false;
        }
      }
    }
  );
}

function bindRefreshButtons() {
  const buttons = document.querySelectorAll(
    '[data-action="refresh"], #refreshBtn, #refreshEstoqueBtn, #refreshMovimentacoesBtn'
  );

  buttons.forEach((button) => {
    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        const textoOriginal =
          button.textContent;

        button.disabled = true;
        button.textContent =
          "Atualizando...";

        try {
          await loadData();
        } catch (error) {
          console.error(
            "Erro ao atualizar:",
            error
          );

          alert(
            error.message ||
              "Não foi possível atualizar os dados."
          );
        } finally {
          button.disabled = false;
          button.textContent =
            textoOriginal;
        }
      }
    );
  });
}

function bindForms() {
  bindLoginForm();
  bindEntryForm();
  bindExitForm();
  bindUserForm();
}

function bindEvents() {
  bindNavigation();
  bindLogout();
  bindStockFilter();
  bindMaterialPreviews();
  bindForms();
  bindRefreshButtons();
}

function restoreLocalUser() {
  try {
    const usuarioSalvo =
      localStorage.getItem(
        "officenet_usuario"
      );

    if (!usuarioSalvo) {
      return null;
    }

    const usuario =
      JSON.parse(usuarioSalvo);

    if (
      !usuario ||
      !usuario.perfil
    ) {
      return null;
    }

    return usuario;
  } catch {
    return null;
  }
}

async function initializeApp() {
  bindEvents();

  const possuiSessao =
    await validateSession();

  if (!possuiSessao) {
    showLogin();
    return;
  }

  if (!state.usuario) {
    state.usuario =
      restoreLocalUser();
  }

  if (!state.usuario) {
    clearSession();
    showLogin();
    return;
  }

  showApp();

  try {
    await loadData();

    openView("dashboard");
  } catch (error) {
    console.error(
      "Erro ao carregar o sistema:",
      error
    );

    alert(
      error.message ||
        "Não foi possível carregar os dados."
    );
  }
}

function setupInitialVisibility() {
  const loginView =
    $("loginView");

  const appView =
    $("appView");

  if (!state.token) {
    if (loginView) {
      loginView.classList.remove(
        "hidden"
      );
    }

    if (appView) {
      appView.classList.add(
        "hidden"
      );
    }
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        const modal =
          document.querySelector(
            ".modal:not(.hidden)"
          );

        if (modal) {
          modal.classList.add(
            "hidden"
          );
        }
      }
    }
  );
}

function startApplication() {
  setupInitialVisibility();
  setupKeyboardShortcuts();
  initializeApp();
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    startApplication
  );
} else {
  startApplication();
}
function atualizarInterfaceCompleta() {
  renderAll();
  updateOperationStoreInfo();
  clearOperationPreviews();
}

function selecionarLojaAdmin(lojaId) {
  if (
    state.usuario?.perfil !== "ADMIN"
  ) {
    return;
  }

  state.lojaFiltro =
    String(lojaId || "TODAS").trim();

  renderDashboard();
  renderStockTable();
  renderMovementTables();
  populateMaterialSelects();
  updateOperationStoreInfo();
}

function configurarSeletorLoja() {
  const filtro =
    $("estoqueLojaFiltro");

  if (!filtro) {
    return;
  }

  filtro.addEventListener(
    "change",
    (event) => {
      selecionarLojaAdmin(
        event.target.value
      );
    }
  );
}

function configurarLojaUsuario() {
  const perfil =
    $("usuarioPerfil");

  const loja =
    $("usuarioLoja");

  const lojaContainer =
    $("usuarioLojaContainer");

  if (
    !perfil ||
    !loja
  ) {
    return;
  }

  function atualizar() {
    const isPreenchedor =
      perfil.value === "PREENCHEDOR";

    loja.disabled =
      !isPreenchedor;

    if (lojaContainer) {
      lojaContainer.classList.toggle(
        "hidden",
        !isPreenchedor
      );
    }

    if (!isPreenchedor) {
      loja.value = "TODAS";
    }
  }

  perfil.addEventListener(
    "change",
    atualizar
  );

  atualizar();
}

function carregarLojasDoEstoque() {
  const select =
    $("usuarioLoja");

  if (!select) {
    return;
  }

  const lojas =
    getLojasFromEstoque();

  select.innerHTML = `
    <option value="">
      Selecione a loja
    </option>

    ${lojas.map((loja) => `
      <option value="${escapeHtml(loja.id)}">
        ${escapeHtml(loja.codigo)}
        — ${escapeHtml(loja.nome)}
      </option>
    `).join("")}
  `;
}

function configurarInterfaceMultiLoja() {
  carregarLojasDoEstoque();
  configurarSeletorLoja();
  configurarLojaUsuario();

  renderLojaFilter();
  updateOperationStoreInfo();
}

function verificarIntegridadeSessao() {
  if (!state.token) {
    return false;
  }

  if (!state.usuario) {
    return false;
  }

  if (
    state.usuario.perfil !== "ADMIN" &&
    state.usuario.perfil !== "PREENCHEDOR"
  ) {
    console.error(
      "Perfil de usuário inválido."
    );

    clearSession();
    showLogin();

    return false;
  }

  if (
    state.usuario.perfil === "PREENCHEDOR" &&
    (
      !state.usuario.lojaId ||
      String(
        state.usuario.lojaId
      )
        .trim()
        .toUpperCase() === "TODAS"
    )
  ) {
    console.error(
      "PREENCHEDOR sem loja vinculada."
    );

    clearSession();
    showLogin();

    return false;
  }

  return true;
}

async function inicializarSistemaMultiLoja() {
  const sessaoValida =
    await validateSession();

  if (!sessaoValida) {
    showLogin();
    return;
  }

  if (
    !verificarIntegridadeSessao()
  ) {
    return;
  }

  if (
    state.usuario.perfil ===
    "PREENCHEDOR"
  ) {
    state.lojaFiltro =
      String(
        state.usuario.lojaId
      ).trim();
  } else {
    state.lojaFiltro = "TODAS";
  }

  showApp();

  try {
    await loadData();

    configurarInterfaceMultiLoja();

    atualizarInterfaceCompleta();

    openView("dashboard");
  } catch (error) {
    console.error(
      "Erro na inicialização:",
      error
    );

    alert(
      error.message ||
        "Não foi possível carregar os dados do sistema."
    );
  }
}

function substituirInicializacaoAntiga() {
  /*
   * Esta função existe apenas para manter
   * compatibilidade com versões anteriores.
   */
  return inicializarSistemaMultiLoja();
}
function corrigirCompatibilidadeHTML() {
  // Mensagens
  const loginMensagem =
    $("loginMensagem");

  if (
    loginMensagem &&
    !$("loginMessage")
  ) {
    loginMensagem.id =
      "loginMessage";
  }

  const entradaMensagem =
    $("entradaMensagem");

  if (
    entradaMensagem &&
    !$("entradaMessage")
  ) {
    entradaMensagem.id =
      "entradaMessage";
  }

  const saidaMensagem =
    $("saidaMensagem");

  if (
    saidaMensagem &&
    !$("saidaMessage")
  ) {
    saidaMensagem.id =
      "saidaMessage";
  }

  const usuarioMensagem =
    $("usuarioMensagem");

  if (
    usuarioMensagem &&
    !$("usuarioMessage")
  ) {
    usuarioMensagem.id =
      "usuarioMessage";
  }

  // Select de materiais
  const entradaCodigo =
    $("entradaCodigo");

  if (
    entradaCodigo &&
    !$("entradaMaterial")
  ) {
    entradaCodigo.id =
      "entradaMaterial";
  }

  const saidaCodigo =
    $("saidaCodigo");

  if (
    saidaCodigo &&
    !$("saidaMaterial")
  ) {
    saidaCodigo.id =
      "saidaMaterial";
  }

  // Campo de busca do estoque
  const estoqueBusca =
    $("estoqueBusca");

  if (estoqueBusca) {
    estoqueBusca.addEventListener(
      "input",
      () => {
        const termo =
          String(
            estoqueBusca.value || ""
          )
            .trim()
            .toLowerCase();

        const linhas =
          document.querySelectorAll(
            "#materiaisTable tr"
          );

        linhas.forEach((linha) => {
          const texto =
            linha.textContent
              .toLowerCase();

          linha.style.display =
            !termo ||
            texto.includes(termo)
              ? ""
              : "none";
        });
      }
    );
  }

  // Campo de busca do histórico
  const movBusca =
    $("movBusca");

  if (movBusca) {
    movBusca.addEventListener(
      "input",
      () => {
        const termo =
          String(
            movBusca.value || ""
          )
            .trim()
            .toLowerCase();

        const linhas =
          document.querySelectorAll(
            "#movimentacoesTable tr"
          );

        linhas.forEach((linha) => {
          const texto =
            linha.textContent
              .toLowerCase();

          linha.style.display =
            !termo ||
            texto.includes(termo)
              ? ""
              : "none";
        });
      }
    );
  }
}

const inicializarCompatibilidade =
  corrigirCompatibilidadeHTML;
(function finalizarConfiguracaoMultiLoja() {
  const iniciar = () => {
    try {
      corrigirCompatibilidadeHTML();

      if (
        state.usuario &&
        state.estoque &&
        Array.isArray(state.estoque)
      ) {
        carregarLojasDoEstoque();
        configurarLojaUsuario();

        const filtro =
          $("estoqueLojaFiltro");

        if (filtro) {
          filtro.onchange = () => {
            selecionarLojaAdmin(
              filtro.value
            );
          };
        }

        renderLojaFilter();
        atualizarInterfaceCompleta();

        console.log(
          "OfficeNET: interface multi-loja configurada."
        );
      }
    } catch (error) {
      console.error(
        "Erro na configuração multi-loja:",
        error
      );
    }
  };

  /*
   * Aguarda o carregamento inicial dos dados.
   * Assim evitamos tentar montar os filtros
   * antes de o estoque chegar da API.
   */
  let tentativas = 0;

  const intervalo =
    setInterval(() => {
      tentativas++;

      if (
        state.usuario &&
        Array.isArray(state.estoque) &&
        state.estoque.length >= 0
      ) {
        iniciar();
        clearInterval(intervalo);
        return;
      }

      if (tentativas >= 20) {
        clearInterval(intervalo);

        console.warn(
          "OfficeNET: tempo limite ao aguardar os dados."
        );
      }
    }, 500);
})();
