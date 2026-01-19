document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  inicializarPagina()
})

function verificarAutenticacao() {
  const token = localStorage.getItem("token")
  const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado"))
  if (!token || !usuarioLogado) {
    window.location.href = "/"
    return
  }
}

function carregarDadosUsuario() {
  const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado"))
  if (usuarioLogado) {
    const userNameElement = document.getElementById("userName")
    const userRoleElement = document.getElementById("userRole")

    if (userNameElement) {
      userNameElement.textContent = usuarioLogado.nome || usuarioLogado.username
    }

    if (userRoleElement) {
      userRoleElement.textContent = formatarCargo(usuarioLogado.cargo)
    }

    const adminSection = document.getElementById("adminSection")
    if (adminSection) {
      const cargos = usuarioLogado.cargo?.toLowerCase().split(',').map(c => c.trim())
      if (cargos.includes("admin") || cargos.includes("head-admin")) {
        adminSection.style.display = "block"
        // Show the "Nova Captação" button for admins
        const btnNova = document.getElementById("btnNovaCaptacao")
        if (btnNova) btnNova.style.display = "inline-block"
      } else {
        adminSection.style.display = "none"
      }
    }

    // Apply permissions for captacoes
    aplicarPermissoesCaptacoes()
  }
}

function formatarCargo(cargo) {
  if (!cargo) return ""
  const cargos = cargo.split(',').map(c => c.trim())
  const map = {
    "head-admin": "Head Admin",
    admin: "Administrador",
    padrao: "Corretor",
  }
  return cargos.map(c => map[c.toLowerCase()] || c).join(", ")
}

let captacoes = []
let captacaoEmEdicao = null
let captacaoParaExcluir = null
let captacoesSelecionadas = []

async function inicializarPagina() {
  configurarEventos()
  await carregarCaptacoes()
}

async function carregarCaptacoes() {
  try {
    if (typeof obterCaptacoes === 'function') {
        captacoes = await obterCaptacoes()
    } else {
        console.warn("Função obterCaptacoes não encontrada")
        captacoes = []
    }

    renderizarTabela()
  } catch (error) {
    console.error("Erro ao carregar captações:", error)
    mostrarToast("Erro ao carregar captações", "erro")
  }
}

function atualizarEstatisticas() {
  const total = captacoes.length
  const altaPrioridade = captacoes.filter(c => c.prioridade === 'alta' || c.prioridade === 'imediata').length
  const concluidas = captacoes.filter(c => c.objetivo && c.objetivo.length > 0).length
  const ativas = captacoes.filter(c => c.objetivo && c.objetivo.length > 0).length

  document.getElementById("totalCaptacoes").textContent = total
  document.getElementById("captacoesAltaPrioridade").textContent = altaPrioridade
  document.getElementById("captacoesConcluidas").textContent = concluidas
  document.getElementById("captacoesAtivas").textContent = ativas
}

function renderizarTabela() {
  const tbody = document.getElementById("captacoesTable")
  const termoBusca = document.getElementById("searchCaptacoes").value.toLowerCase()
  const filtroPrioridade = document.getElementById("filterPrioridade").value

  // Check user permissions
  const usuarioLogado = obterUsuarioLogado()
  const cargos = getCargosAsArray(usuarioLogado?.cargo).map(c => c.toLowerCase()) || []
  const isCorretor = cargos.includes('corretor') && !cargos.includes('admin') && !cargos.includes('head-admin')
  const canEdit = !isCorretor

  let filtrados = captacoes.filter(c => {
    const matchBusca = c.titulo.toLowerCase().includes(termoBusca) ||
                       (c.regiao && c.regiao.toLowerCase().includes(termoBusca)) ||
                       (c.objetivo && c.objetivo.toLowerCase().includes(termoBusca)) ||
                       (c.observacoes && c.observacoes.toLowerCase().includes(termoBusca))

    const matchPrioridade = !filtroPrioridade || c.prioridade === filtroPrioridade

    return matchBusca && matchPrioridade
  })

  // Ordenar por prioridade (imediata > alta > média) e depois por data
  filtrados.sort((a, b) => {
    const prioridadeOrder = { imediata: 3, alta: 2, media: 1 }
    const prioridadeA = prioridadeOrder[a.prioridade] || 0
    const prioridadeB = prioridadeOrder[b.prioridade] || 0

    if (prioridadeA !== prioridadeB) {
      return prioridadeB - prioridadeA // Maior prioridade primeiro
    }

    // Se mesma prioridade, ordenar por data de criação (mais recente primeiro)
    return new Date(b.criado_em) - new Date(a.criado_em)
  })

  // Calculate colspan based on permissions
  let colspan = 9 // base columns
  if (!isCorretor) {
    colspan += 1 // add checkbox column for admins
  }

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center">Nenhuma captação encontrada</td></tr>`
    return
  }

  tbody.innerHTML = filtrados.map(c => `
    <tr onclick="mostrarDetalhesCaptacao(${c.id})" style="cursor: pointer;">
      ${!isCorretor ? `<td onclick="event.stopPropagation();">
        <input type="checkbox" class="checkbox-input captacao-checkbox" data-id="${c.id}" ${captacoesSelecionadas.includes(c.id) ? 'checked' : ''}>
      </td>` : ''}
      <td>${c.titulo}</td>
      <td>${c.regiao}</td>
      <td>${c.valor_estimado ? 'R$ ' + c.valor_estimado : '-'}</td>
      <td><span class="badge badge-${c.prioridade}">${formatarPrioridade(c.prioridade)}</span></td>
      <td>${c.objetivo || '-'}</td>
      <td>${c.usuario_nome || '-'}</td>
      <td>${formatarData(c.criado_em)}</td>
      ${canEdit ? `<td onclick="event.stopPropagation()">
        <button class="btn-action btn-edit" onclick="editarCaptacao(${c.id})">
          <i class="fas fa-edit"></i> Editar
        </button>
        <button class="btn-action btn-delete" onclick="excluirCaptacao(${c.id})">
          <i class="fas fa-trash"></i> Excluir
        </button>
      </td>` : ''}
    </tr>
  `).join('')

  atualizarCheckboxes()
  adicionarListenersCheckboxes()
}

function configurarEventos() {
  // Sidebar toggle
  const sidebarToggle = document.getElementById("sidebarToggleMobile")
  const sidebar = document.querySelector(".sidebar")
  const sidebarClose = document.getElementById("sidebarToggle")

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.add("active")
    })
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", () => {
      sidebar.classList.remove("active")
    })
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn")
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault()
      document.getElementById("modalConfirmacaoLogout").style.display = "flex"
    })
  }

  const closeConfirmacaoLogout = document.getElementById("closeConfirmacaoLogout")
  if (closeConfirmacaoLogout) {
    closeConfirmacaoLogout.addEventListener("click", () => {
      document.getElementById("modalConfirmacaoLogout").style.display = "none"
    })
  }

  const btnCancelarLogout = document.getElementById("btnCancelarLogout")
  if (btnCancelarLogout) {
    btnCancelarLogout.addEventListener("click", () => {
      document.getElementById("modalConfirmacaoLogout").style.display = "none"
    })
  }

  const btnConfirmarLogout = document.getElementById("btnConfirmarLogout")
  if (btnConfirmarLogout) {
    btnConfirmarLogout.addEventListener("click", fazerLogout)
  }

  // Modal Novo/Editar
  const btnNovo = document.getElementById("btnNovaCaptacao")
  const modal = document.getElementById("modalCaptacao")
  const closeModal = document.getElementById("closeModal")
  const cancelBtn = modal.querySelector(".modal-close-btn")

  if (btnNovo) {
    btnNovo.addEventListener("click", () => {
      if (!isAdminOrHeadAdmin()) {
        mostrarToast("Você não tem permissão para criar captações", "erro")
        return
      }
      captacaoEmEdicao = null
      document.getElementById("formCaptacao").reset()
      document.getElementById("modalTitle").textContent = "Nova Captação"
      modal.classList.add("show")
    })
  }

  if (closeModal) {
    closeModal.addEventListener("click", () => {
      modal.classList.remove("show")
    })
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.classList.remove("show")
    })
  }

  // Modal Exclusão
  const modalExclusao = document.getElementById("modalConfirmacaoExclusao")
  const closeExclusao = document.getElementById("closeConfirmacaoExclusao")
  const cancelExclusao = document.getElementById("btnCancelarExclusao")
  const confirmExclusao = document.getElementById("btnConfirmarExclusao")

  if (closeExclusao) {
    closeExclusao.addEventListener("click", () => {
      modalExclusao.classList.remove("show")
      captacaoParaExcluir = null
    })
  }

  if (cancelExclusao) {
    cancelExclusao.addEventListener("click", () => {
      modalExclusao.classList.remove("show")
      captacaoParaExcluir = null
    })
  }

  if (confirmExclusao) {
    confirmExclusao.addEventListener("click", confirmarExclusao)
  }

  // Modal Detalhes
  const modalDetalhes = document.getElementById("modalDetalhesCaptacao")
  const closeDetalhes = document.getElementById("closeModalDetalhes")
  const btnFecharDetalhes = document.getElementById("btnFecharDetalhes")

  if (closeDetalhes) {
    closeDetalhes.addEventListener("click", () => {
      modalDetalhes.classList.remove("show")
      window.captacaoDetalhesAtual = null
    })
  }

  if (btnFecharDetalhes) {
    btnFecharDetalhes.addEventListener("click", () => {
      modalDetalhes.classList.remove("show")
      window.captacaoDetalhesAtual = null
    })
  }

  // Form submit
  const form = document.getElementById("formCaptacao")
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault()
      salvarCaptacao()
    })
  }

  // Filters
  const inputs = ["searchCaptacoes", "filterPrioridade"]
  inputs.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      el.addEventListener("input", renderizarTabela)
      el.addEventListener("change", renderizarTabela)
    }
  })

  // Select all checkbox
  const selectAll = document.getElementById("selectAll")
  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      const checkboxes = document.querySelectorAll(".captacao-checkbox")
      checkboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked
      })
      atualizarCheckboxes()
    })
  }

  // Bulk delete button
  const btnExcluirSelecionados = document.getElementById("btnExcluirSelecionados")
  if (btnExcluirSelecionados) {
    btnExcluirSelecionados.addEventListener("click", excluirSelecionados)
  }

  // Fechar modal ao clicar fora
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.style.display = "none"
      e.target.classList.remove("show")
      e.target.classList.remove("active")
    }
  })
}

async function salvarCaptacao() {
  console.log("[SALVAR CAPTAÇÃO] Iniciando salvarCaptacao")

  if (!isAdminOrHeadAdmin()) {
    console.log("[SALVAR CAPTAÇÃO] Usuário não é admin ou head-admin")
    mostrarToast("Você não tem permissão para salvar captações", "erro")
    return
  }

  const dadosCaptacao = {
    titulo: document.getElementById("captacaoTitulo").value,
    regiao: document.getElementById("captacaoRegiao").value,
    valor_estimado: document.getElementById("captacaoValor").value,
    prioridade: document.getElementById("captacaoPrioridade").value,
    objetivo: document.getElementById("captacaoObjetivo").value,
    observacoes: document.getElementById("captacaoObservacoes").value
  }

  console.log("[SALVAR CAPTAÇÃO] Dados da captação:", dadosCaptacao)

  try {
    if (captacaoEmEdicao) {
        console.log("[SALVAR CAPTAÇÃO] Editando captação existente, ID:", captacaoEmEdicao)
        await atualizarCaptacao(captacaoEmEdicao, dadosCaptacao)
        mostrarToast("Captação atualizada com sucesso!", "sucesso")
    } else {
        console.log("[SALVAR CAPTAÇÃO] Criando nova captação")
        await criarCaptacao(dadosCaptacao)
        mostrarToast("Captação criada com sucesso!", "sucesso")
    }

    document.getElementById("modalCaptacao").classList.remove("show")
    await carregarCaptacoes()
  } catch (error) {
    console.error("Erro ao salvar captação:", error)
    mostrarToast("Erro ao salvar: " + error.message, "erro")
  }
}

// Expose functions to global scope for onclick handlers
window.editarCaptacao = function(id) {
  if (!isAdminOrHeadAdmin()) {
    mostrarToast("Você não tem permissão para editar captações.", "erro")
    return
  }

  const captacao = captacoes.find(c => c.id === id)
  if (!captacao) return

  // Close the details modal first
  document.getElementById("modalDetalhesCaptacao").classList.remove("show")
  window.captacaoDetalhesAtual = null

  captacaoEmEdicao = id

  document.getElementById("captacaoTitulo").value = captacao.titulo
  document.getElementById("captacaoRegiao").value = captacao.regiao
  document.getElementById("captacaoValor").value = captacao.valor_estimado || ""
  document.getElementById("captacaoPrioridade").value = captacao.prioridade
  document.getElementById("captacaoObjetivo").value = captacao.objetivo || ""
  document.getElementById("captacaoObservacoes").value = captacao.observacoes || ""

  document.getElementById("modalTitle").textContent = "Editar Captação"
  document.getElementById("modalCaptacao").classList.add("show")
}

window.excluirCaptacao = function(id) {
  if (!isAdminOrHeadAdmin()) {
    mostrarToast("Você não tem permissão para excluir captações", "erro")
    return
  }

  captacaoParaExcluir = id
  const captacao = captacoes.find(c => c.id === id)
  if (captacao) {
    document.getElementById("detalhesCaptacaoExcluir").textContent = `"${captacao.titulo}"`
  }
  document.getElementById("modalConfirmacaoExclusao").classList.add("show")
}

async function confirmarExclusao() {
  if (!captacaoParaExcluir) return

  if (!isAdminOrHeadAdmin()) {
    mostrarToast("Você não tem permissão para excluir captações", "erro")
    return
  }

  try {
    await deletarCaptacao(captacaoParaExcluir)
    mostrarToast("Captação excluída!", "sucesso")
    document.getElementById("modalConfirmacaoExclusao").classList.remove("show")
    captacaoParaExcluir = null
    await carregarCaptacoes()
  } catch (error) {
    console.error("Erro ao excluir captação:", error)
    mostrarToast("Erro ao excluir: " + error.message, "erro")
  }
}

function formatarData(data) {
  if (!data) return "-"
  const d = new Date(data + 'T12:00:00')
  return d.toLocaleDateString("pt-BR", { timeZone: 'America/Sao_Paulo' })
}

function formatarPrioridade(prioridade) {
  const map = {
    imediata: "Imediata",
    alta: "Alta",
    media: "Média",
    baixa: "Baixa"
  }
  return map[prioridade] || prioridade
}

function formatarStatus(status) {
  const map = {
    ativo: "Ativo",
    concluido: "Concluído",
    cancelado: "Cancelado"
  }
  return map[status] || status
}

// Expose functions to global scope for onclick handlers
window.mostrarDetalhesCaptacao = function(id) {
  const captacao = captacoes.find(c => c.id === id)
  if (!captacao) return

  // Atualizar header do perfil
  document.getElementById("detalheAvatar").textContent = (captacao.titulo || "C").charAt(0).toUpperCase()
  document.getElementById("detalheTituloHeader").textContent = captacao.titulo || "-"
  document.getElementById("detalhePrioridadeHeader").className = `badge badge-${captacao.prioridade}`
  document.getElementById("detalhePrioridadeHeader").textContent = formatarPrioridade(captacao.prioridade)

  // Atualizar campos de detalhes
  document.getElementById("detalheRegiao").textContent = captacao.regiao || "-"
  document.getElementById("detalheValor").textContent = captacao.valor_estimado ? 'R$ ' + captacao.valor_estimado : "-"
  document.getElementById("detalheDataCriacao").textContent = formatarData(captacao.criado_em) || "-"
  document.getElementById("detalheCriadoPor").textContent = captacao.usuario_nome || "-"
  document.getElementById("detalheDataAtualizacao").textContent = formatarData(captacao.atualizado_em) || "-"
  document.getElementById("detalheObjetivo").textContent = captacao.objetivo || "-"
  document.getElementById("detalheObservacoes").textContent = captacao.observacoes || "-"

  // Mostrar/esconder ações de admin
  const adminActions = document.getElementById("detailsAdminActions")
  if (adminActions) {
    adminActions.style.display = isAdminOrHeadAdmin() ? "flex" : "none"
  }

  // Armazenar captação atual para uso nos botões
  window.captacaoDetalhesAtual = captacao

  // Mostrar modal
  document.getElementById("modalDetalhesCaptacao").classList.add("show")
}

function mostrarToast(mensagem, tipo = "info") {
  const toast = document.getElementById("toastNotification")
  let icon = "info-circle"

  if (tipo === "sucesso") icon = "check-circle"
  if (tipo === "erro") icon = "exclamation-circle"
  if (tipo === "aviso") icon = "exclamation-triangle"

  toast.className = `toast toast-${tipo} show`
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas fa-${icon}"></i>
      <span>${mensagem}</span>
    </div>
  `

  setTimeout(() => {
    toast.classList.remove("show")
  }, 3000)
}

function atualizarCheckboxes() {
  const checkboxes = document.querySelectorAll(".captacao-checkbox")
  captacoesSelecionadas = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => parseInt(cb.getAttribute("data-id")))

  const bulkActions = document.getElementById("bulkActions")
  if (captacoesSelecionadas.length > 0) {
    bulkActions.style.display = "flex"
    document.getElementById("selectedCount").textContent = `${captacoesSelecionadas.length} captação(ões) selecionada(s)`
  } else {
    bulkActions.style.display = "none"
  }
}

function adicionarListenersCheckboxes() {
  const checkboxes = document.querySelectorAll(".captacao-checkbox")
  checkboxes.forEach((checkbox) => {
    checkbox.removeEventListener("change", atualizarCheckboxes)
    checkbox.addEventListener("change", atualizarCheckboxes)
  })
}

async function excluirSelecionados() {
  if (captacoesSelecionadas.length === 0) {
    mostrarToast("Nenhuma captação selecionada", "aviso")
    return
  }

  if (!isAdminOrHeadAdmin()) {
    mostrarToast("Você não tem permissão para excluir captações", "erro")
    return
  }

  const nomes = captacoesSelecionadas
    .map(id => captacoes.find(c => c.id === id)?.titulo)
    .filter(Boolean)
    .join(", ")

  document.getElementById("detalhesCaptacaoExcluir").textContent = `${captacoesSelecionadas.length} captação(ões): ${nomes}`
  document.getElementById("btnConfirmarExclusao").onclick = () => executarExclusaoEmMassa()
  document.getElementById("modalConfirmacaoExclusao").classList.add("show")
}

async function executarExclusaoEmMassa() {
  if (!isAdminOrHeadAdmin()) {
    mostrarToast("Você não tem permissão para excluir captações", "erro")
    return
  }

  const btnConfirmar = document.getElementById("btnConfirmarExclusao")
  try {
    if (btnConfirmar) {
      btnConfirmar.disabled = true
    }
    for (const id of captacoesSelecionadas) {
      const captacao = captacoes.find((c) => c.id === id)
      await deletarCaptacao(id)
      console.log(`Captação "${captacao?.titulo}" deletada (em massa)`)
    }
    document.getElementById("modalConfirmacaoExclusao").classList.remove("show")
    mostrarToast("Captações deletadas com sucesso!", "sucesso")
    captacoesSelecionadas = []
    await carregarCaptacoes()
  } catch (error) {
    mostrarToast("Erro ao deletar captações: " + error.message, "erro")
  } finally {
    if (btnConfirmar) {
      btnConfirmar.disabled = false
    }
  }
}

function aplicarPermissoesCaptacoes() {
  const usuarioLogado = obterUsuarioLogado()
  if (!usuarioLogado) return

  const cargos = getCargosAsArray(usuarioLogado?.cargo).map(c => c.toLowerCase()) || []
  const isCorretor = cargos.includes('corretor') && !cargos.includes('admin') && !cargos.includes('head-admin')

  // Hide checkbox column header for corretores
  const headerCheckbox = document.getElementById("headerCheckbox")
  if (headerCheckbox) {
    headerCheckbox.style.display = isCorretor ? "none" : ""
  }

  // Hide select all checkbox for corretores
  const selectAll = document.getElementById("selectAll")
  if (selectAll && selectAll.parentElement) {
    selectAll.parentElement.style.display = isCorretor ? "none" : ""
  }

  // Hide actions column header for corretores
  const headerAcoes = document.getElementById("headerAcoes")
  if (headerAcoes) {
    headerAcoes.style.display = isCorretor ? "none" : ""
  }

  // Hide bulk actions for corretores
  const bulkActions = document.getElementById("bulkActions")
  if (bulkActions) {
    bulkActions.style.display = "none"
  }

  // Hide "Nova Captação" button for corretores
  const btnNova = document.getElementById("btnNovaCaptacao")
  if (btnNova) {
    btnNova.style.display = isCorretor ? "none" : "inline-block"
  }
}
