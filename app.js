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
