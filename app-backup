const API_URL = "https://script.google.com/macros/s/AKfycbybAvrCWk6Fbjhy3mk2sX5S3cDThtJ-awptfeCpRIc__Nf6pYN_-CSFqLc0jNu-HhPEcw/exec";

const state = {
  token: localStorage.getItem("officenet_token") || "",
  usuario: null,
  materiais: [],
  movimentacoes: []
};

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

async function apiGet(acao) {
  const url = new URL(API_URL);
  url.searchParams.set("acao", acao);
  if (state.token) url.searchParams.set("token", state.token);

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
  localStorage.setItem("officenet_token", data.token);
  localStorage.setItem("officenet_usuario", JSON.stringify(data.usuario));
}

function clearSession() {
  state.token = "";
  state.usuario = null;
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
  $("welcomeName").textContent = state.usuario.nome;

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", state.usuario.perfil !== "ADMIN");
  });
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
    localStorage.setItem("officenet_usuario", JSON.stringify(state.usuario));
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

async function loadData() {
  const [materiaisData, movimentacoesData] = await Promise.all([
    apiGet("materiais"),
    apiGet("movimentacoes")
  ]);

  state.materiais = materiaisData.materiais || [];
  state.movimentacoes = movimentacoesData.movimentacoes || [];

  renderAll();
}

function renderAll() {
  renderStats();
  renderMaterials();
  renderMovementTables();
  populateMaterialSelects();
}

function renderStats() {
  const materiais = state.materiais;

  const baixos = materiais.filter((item) => {
    const status = String(item.Status || "").toUpperCase();
    return status.includes("BAIXO");
  });

  $("statMateriais").textContent = materiais.length;
  $("statBaixo").textContent = baixos.length;
  $("statMovimentacoes").textContent = state.movimentacoes.length;
}

function renderMaterials() {
  const busca = ($("estoqueBusca")?.value || "").trim().toLowerCase();

  const filtrados = state.materiais.filter((item) => {
    const texto = [
      item.Código,
      item.Material,
      item.Categoria,
      item.Unidade
    ].join(" ").toLowerCase();

    return texto.includes(busca);
  });

  $("materiaisTable").innerHTML = filtrados.length
    ? filtrados.map((item) => {
        const status = String(item.Status || "");
        const baixo = status.toUpperCase().includes("BAIXO");

        return `
          <tr>
            <td><strong>${escapeHtml(item.Código)}</strong></td>
            <td>${escapeHtml(item.Material)}</td>
            <td>${escapeHtml(item.Categoria)}</td>
            <td>${escapeHtml(item.Unidade)}</td>
            <td><strong>${escapeHtml(item.Estoque)}</strong></td>
            <td>${escapeHtml(item["Estoque Mínimo"])}</td>
            <td>
              <span class="status ${baixo ? "baixo" : "normal"}">
                ${escapeHtml(status || "NORMAL")}
              </span>
            </td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="7">Nenhum material encontrado.</td></tr>`;
}

function renderMovementTables() {
  const movimentos = [...state.movimentacoes].reverse();

  const recentes = movimentos.slice(0, 8);

  $("dashboardMovimentacoes").innerHTML = recentes.length
    ? recentes.map((item) => {
        const tipo = String(item.Tipo || "").toUpperCase();

        return `
          <tr>
            <td>${formatDate(item["Data/Hora"])}</td>
            <td class="tipo ${tipo === "ENTRADA" ? "entrada" : "saida"}">
              ${escapeHtml(tipo)}
            </td>
            <td>${escapeHtml(item.Material)}</td>
            <td>${escapeHtml(item.Quantidade)}</td>
            <td>${escapeHtml(item.Responsável)}</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="5">Nenhuma movimentação encontrada.</td></tr>`;

  const busca = ($("movBusca")?.value || "").trim().toLowerCase();

  const filtrados = movimentos.filter((item) => {
    const texto = [
      item.Código,
      item.Material,
      item.Responsável,
      item.Solicitante,
      item.Motivo,
      item.Tipo
    ].join(" ").toLowerCase();

    return texto.includes(busca);
  });

  $("movimentacoesTable").innerHTML = filtrados.length
    ? filtrados.map((item) => `
        <tr>
          <td>${formatDate(item["Data/Hora"])}</td>
          <td class="tipo ${String(item.Tipo).toUpperCase() === "ENTRADA" ? "entrada" : "saida"}">
            ${escapeHtml(item.Tipo)}
          </td>
          <td>${escapeHtml(item.Código)}</td>
          <td>${escapeHtml(item.Material)}</td>
          <td>${escapeHtml(item["Estoque Antes"])}</td>
          <td>${escapeHtml(item.Quantidade)}</td>
          <td>${escapeHtml(item["Estoque Depois"])}</td>
          <td>${escapeHtml(item.Responsável)}</td>
          <td>${escapeHtml(item["Perfil do Registrador"])}</td>
          <td>${escapeHtml(item.Solicitante)}</td>
          <td>${escapeHtml(item.Motivo)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="11">Nenhuma movimentação encontrada.</td></tr>`;
}

function populateMaterialSelects() {
  const selects = [$("entradaCodigo"), $("saidaCodigo")];

  selects.forEach((select) => {
    const current = select.value;

    select.innerHTML = `
      <option value="">Selecione o material...</option>
      ${state.materiais.map((item) => `
        <option value="${escapeHtml(item.Código)}">
          ${escapeHtml(item.Código)} — ${escapeHtml(item.Material)}
          (estoque: ${escapeHtml(item.Estoque)})
        </option>
      `).join("")}
    `;

    if (current) select.value = current;
  });
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleString("pt-BR");
}

function openView(viewName) {
  const allowedViews = ["dashboard", "estoque", "entrada", "saida", "movimentacoes", "usuarios"];

  if (!allowedViews.includes(viewName)) return;

  if (viewName === "usuarios" && state.usuario?.perfil !== "ADMIN") {
    showGlobalMessage("Acesso permitido somente ao ADMIN.", "error");
    return;
  }

  document.querySelectorAll(".page-view").forEach((view) => {
    view.classList.add("hidden");
  });

  const target = $("view-" + viewName);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  const titles = {
    dashboard: ["Dashboard", "Visão geral do estoque"],
    estoque: ["Estoque", "Materiais disponíveis"],
    entrada: ["Entrada", "Registrar entrada de material"],
    saida: ["Saída", "Registrar saída de material"],
    movimentacoes: ["Histórico", "Auditoria das movimentações"],
    usuarios: ["Usuários", "Gerenciamento de acessos"]
  };

  $("pageTitle").textContent = titles[viewName][0];
  $("pageSubtitle").textContent = titles[viewName][1];
}

function showGlobalMessage(message, type = "") {
  const element = $("globalMessage");
  element.textContent = message || "";
  element.className = "global-message " + type;

  if (message) {
    setTimeout(() => {
      element.textContent = "";
      element.className = "global-message";
    }, 4000);
  }
}

async function registrarEntrada(event) {
  event.preventDefault();

  const message = $("entradaMensagem");
  showMessage(message, "");

  try {
    await apiPost({
      acao: "registrar_entrada",
      token: state.token,
      codigo: $("entradaCodigo").value,
      quantidade: Number($("entradaQuantidade").value),
      solicitante: $("entradaSolicitante").value.trim(),
      motivo: $("entradaMotivo").value.trim(),
      observacao: $("entradaObservacao").value.trim()
    });

    showMessage(message, "Entrada registrada com sucesso!", "success");
    $("entradaForm").reset();

    await loadData();
  } catch (error) {
    showMessage(message, error.message, "error");
  }
}

async function registrarSaida(event) {
  event.preventDefault();

  const message = $("saidaMensagem");
  showMessage(message, "");

  try {
    await apiPost({
      acao: "registrar_saida",
      token: state.token,
      codigo: $("saidaCodigo").value,
      quantidade: Number($("saidaQuantidade").value),
      solicitante: $("saidaSolicitante").value.trim(),
      motivo: $("saidaMotivo").value.trim(),
      observacao: $("saidaObservacao").value.trim()
    });

    showMessage(message, "Saída registrada com sucesso!", "success");
    $("saidaForm").reset();

    await loadData();
  } catch (error) {
    showMessage(message, error.message, "error");
  }
}

async function cadastrarUsuario(event) {
  event.preventDefault();

  const message = $("usuarioMensagem");
  showMessage(message, "");

  try {
    await apiPost({
      acao: "cadastrar_usuario",
      token: state.token,
      nome: $("usuarioNome").value.trim(),
      usuario: $("usuarioLogin").value.trim(),
      senha: $("usuarioSenha").value,
      perfil: $("usuarioPerfil").value
    });

    showMessage(message, "Usuário cadastrado com sucesso!", "success");
    $("usuarioForm").reset();
  } catch (error) {
    showMessage(message, error.message, "error");
  }
}

function setupEvents() {
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    showMessage($("loginMensagem"), "Entrando...");

    try {
      await login(
        $("loginUsuario").value.trim(),
        $("loginSenha").value
      );
      showMessage($("loginMensagem"), "");
    } catch (error) {
      showMessage($("loginMensagem"), error.message, "error");
    }
  });

  $("logoutBtn").addEventListener("click", logout);

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.view));
  });

  $("entradaForm").addEventListener("submit", registrarEntrada);
  $("saidaForm").addEventListener("submit", registrarSaida);
  $("usuarioForm").addEventListener("submit", cadastrarUsuario);

  $("refreshStockBtn").addEventListener("click", async () => {
    try {
      await loadData();
      showGlobalMessage("Estoque atualizado.", "success");
    } catch (error) {
      showGlobalMessage(error.message, "error");
    }
  });

  $("refreshMovBtn").addEventListener("click", async () => {
    try {
      await loadData();
      showGlobalMessage("Histórico atualizado.", "success");
    } catch (error) {
      showGlobalMessage(error.message, "error");
    }
  });

  $("estoqueBusca").addEventListener("input", renderMaterials);
  $("movBusca").addEventListener("input", renderMovementTables);
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
