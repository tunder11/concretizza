let bugReports = []
let currentBugReport = null
let bugReportToDelete = null
let socket = null

document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  configurarDadosUsuario()
  conectarSocketIO()
  carregarBugReports()
  configurarEventos()
})

function verificarAutenticacao() {
  const token = localStorage.getItem("token")
  const usuario = JSON.parse(localStorage.getItem("usuarioLogado"))
  if (!token || !usuario || !isAdminOrHeadAdmin()) {
    window.location.href = "/"
  }
}

function conectarSocketIO() {
  const token = localStorage.getItem("token")
  if (!token) {
    console.error("Token não encontrado para conexão Socket.IO")
    return
  }

  socket = io({
    auth: {
      token: token
    }
  })

  socket.on('connect', () => {
    console.log('Conectado ao servidor via Socket.IO')
  })

  socket.on('disconnect', () => {
    console.log('Desconectado do servidor Socket.IO')
  })

  socket.on('connect_error', (error) => {
    console.error('Erro de conexão Socket.IO:', error.message)
  })

  socket.on('new-message', (messageData) => {
    // Adicionar mensagem ao chat em tempo real
    adicionarMensagemAoChat(messageData)
  })

  socket.on('message-sent', () => {
    // Mensagem enviada com sucesso
    mostrarNotificacao("Mensagem enviada com sucesso!", "sucesso")
  })

  socket.on('message-error', (error) => {
    console.error('Erro de mensagem:', error)
    mostrarNotificacao("Erro ao enviar mensagem", "erro")
  })
}

function adicionarMensagemAoChat(messageData) {
  const chatMessages = document.getElementById("chatMessages")
  if (!chatMessages) return

  const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado"))
  const isOwn = messageData.usuario_id === usuarioLogado.id
  const avatar = messageData.usuario_nome.charAt(0).toUpperCase()
  const time = formatarDataHora(messageData.criado_em)

  const messageElement = document.createElement('div')
  messageElement.className = `chat-message ${isOwn ? 'own' : ''}`
  messageElement.innerHTML = `
    <div class="chat-avatar">${avatar}</div>
    <div class="chat-content">
      <div class="chat-header">
        <span class="chat-author">${messageData.usuario_nome}</span>
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-text">${messageData.mensagem.replace(/\n/g, '<br>')}</div>
    </div>
  `

  chatMessages.appendChild(messageElement)

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight
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
  }
}

async function carregarBugReports() {
  try {
    const response = await fazerRequisicao("/api/bug-reports")
    bugReports = response || []
    atualizarTabela()
  } catch (error) {
    console.error("Erro ao carregar bug reports:", error)
    mostrarNotificacao("Erro ao carregar bug reports do servidor", "erro")
  }
}

function atualizarTabela() {
  const tbody = document.getElementById("bugReportsTable")

  if (bugReports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum bug report encontrado</td></tr>'
    return
  }

  tbody.innerHTML = bugReports
    .sort((a, b) => {
      const dataA = new Date(a.atualizado_em || 0)
      const dataB = new Date(b.atualizado_em || 0)
      return dataB - dataA
    })
    .map((report) => {
      const prioridadeBadge = obterBadgePrioridade(report.prioridade)
      const statusBadge = obterBadgeStatus(report.status)
      const categoriaBadge = obterBadgeCategoria(report.categoria)
      const dataFormatada = formatarData(report.criado_em)

      return `
        <tr onclick="visualizarBugReport(${report.id})" style="cursor: pointer;">
          <td>
            <div class="titulo-cell">
              <strong>${report.titulo}</strong>
              <small class="text-muted">${report.descricao.substring(0, 100)}${report.descricao.length > 100 ? '...' : ''}</small>
            </div>
          </td>
          <td>${prioridadeBadge}</td>
          <td>${statusBadge}</td>
          <td>${categoriaBadge}</td>
          <td>${report.usuario_nome}</td>
          <td>${dataFormatada}</td>
          <td>
            <div class="action-buttons">
              <button class="btn-action btn-edit" onclick="event.stopPropagation(); editarBugReport(${report.id})">
                <i class="fas fa-edit"></i> Editar
              </button>
              <button class="btn-action btn-delete" onclick="event.stopPropagation(); deletarBugReport(${report.id})">
                <i class="fas fa-trash"></i> Deletar
              </button>
            </div>
          </td>
        </tr>
      `
    })
    .join("")
}

function obterBadgePrioridade(prioridade) {
  const badges = {
    "baixa": "prioridade-badge prioridade-baixa",
    "media": "prioridade-badge prioridade-media",
    "alta": "prioridade-badge prioridade-alta",
    "critica": "prioridade-badge prioridade-critica"
  }
  return `<span class="badge ${badges[prioridade] || badges.media}">${prioridade.charAt(0).toUpperCase() + prioridade.slice(1)}</span>`
}

function obterBadgeStatus(status) {
  const badges = {
    "aberto": "status-badge status-aberto",
    "em-andamento": "status-badge status-em-andamento",
    "resolvido": "status-badge status-resolvido",
    "fechado": "status-badge status-fechado"
  }
  const statusText = {
    "aberto": "Aberto",
    "em-andamento": "Em Andamento",
    "resolvido": "Resolvido",
    "fechado": "Fechado"
  }
  return `<span class="badge ${badges[status] || badges.aberto}">${statusText[status] || status}</span>`
}

function obterBadgeCategoria(categoria) {
  return `<span class="badge categoria-badge">${categoria.charAt(0).toUpperCase() + categoria.slice(1)}</span>`
}

function configurarEventos() {
  // Sidebar toggle
  const sidebarToggle = document.getElementById("sidebarToggleMobile")
  const sidebar = document.querySelector(".sidebar")

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("active")
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

  // Delete confirmation modal
  const closeConfirmacaoDelete = document.getElementById("closeConfirmacaoDelete")
  if (closeConfirmacaoDelete) {
    closeConfirmacaoDelete.addEventListener("click", () => {
      document.getElementById("modalConfirmacaoDelete").style.display = "none"
    })
  }

  const btnCancelarDelete = document.getElementById("btnCancelarDelete")
  if (btnCancelarDelete) {
    btnCancelarDelete.addEventListener("click", () => {
      document.getElementById("modalConfirmacaoDelete").style.display = "none"
    })
  }

  const btnConfirmarDelete = document.getElementById("btnConfirmarDelete")
  if (btnConfirmarDelete) {
    btnConfirmarDelete.addEventListener("click", confirmarDeleteBugReport)
  }

  // Modal close
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.style.display = "none"
    }
  })

  // Filters
  const searchBugReports = document.getElementById("searchBugReports")
  if (searchBugReports) {
    searchBugReports.addEventListener("input", filtrarBugReports)
  }

  const filterStatus = document.getElementById("filterStatus")
  if (filterStatus) {
    filterStatus.addEventListener("change", filtrarBugReports)
  }

  const filterPrioridade = document.getElementById("filterPrioridade")
  if (filterPrioridade) {
    filterPrioridade.addEventListener("change", filtrarBugReports)
  }

  // New bug report
  const btnNovoBugReport = document.getElementById("btnNovoBugReport")
  if (btnNovoBugReport) {
    btnNovoBugReport.addEventListener("click", () => {
      abrirModalBugReport()
    })
  }

  // Bug report form
  const btnSalvarBugReport = document.getElementById("btnSalvarBugReport")
  if (btnSalvarBugReport) {
    btnSalvarBugReport.addEventListener("click", salvarBugReport)
  }

  // Real-time validation for form fields
  const tituloInput = document.getElementById("bugReportTitulo")
  const descricaoTextarea = document.getElementById("bugReportDescricao")

  if (tituloInput && descricaoTextarea && btnSalvarBugReport) {
    const validarCampos = () => {
      const tituloPreenchido = tituloInput.value.trim().length > 0
      const descricaoPreenchida = descricaoTextarea.value.trim().length > 0

      // Visual feedback - change button style
      if (tituloPreenchido && descricaoPreenchida) {
        btnSalvarBugReport.classList.remove("btn-disabled")
        btnSalvarBugReport.classList.add("btn-primary")
      } else {
        btnSalvarBugReport.classList.remove("btn-primary")
        btnSalvarBugReport.classList.add("btn-disabled")
      }
    }

    tituloInput.addEventListener("input", validarCampos)
    descricaoTextarea.addEventListener("input", validarCampos)

    // Initial validation
    validarCampos()
  }

  // Modal close buttons
  const modalCloseButtons = document.querySelectorAll(".modal-close, .modal-close-btn")
  modalCloseButtons.forEach(button => {
    button.addEventListener("click", (e) => {
      e.target.closest(".modal").style.display = "none"
    })
  })
}

function filtrarBugReports() {
  const search = document.getElementById("searchBugReports").value.toLowerCase()
  const filterStatus = document.getElementById("filterStatus").value
  const filterPrioridade = document.getElementById("filterPrioridade").value

  let bugReportsFiltrados = bugReports.filter(report => {
    const matchStatus = !filterStatus || report.status === filterStatus
    const matchPrioridade = !filterPrioridade || report.prioridade === filterPrioridade
    const matchSearch = !search ||
      report.titulo?.toLowerCase().includes(search) ||
      report.descricao?.toLowerCase().includes(search) ||
      report.categoria?.toLowerCase().includes(search) ||
      report.usuario_nome?.toLowerCase().includes(search)

    return matchStatus && matchPrioridade && matchSearch
  })

  const tbody = document.getElementById("bugReportsTable")
  if (bugReportsFiltrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum bug report encontrado</td></tr>'
    return
  }

  tbody.innerHTML = bugReportsFiltrados
    .sort((a, b) => {
      const dataA = new Date(a.atualizado_em || 0)
      const dataB = new Date(b.atualizado_em || 0)
      return dataB - dataA
    })
    .map((report) => {
      const prioridadeBadge = obterBadgePrioridade(report.prioridade)
      const statusBadge = obterBadgeStatus(report.status)
      const categoriaBadge = obterBadgeCategoria(report.categoria)
      const dataFormatada = formatarData(report.criado_em)

      return `
        <tr onclick="visualizarBugReport(${report.id})" style="cursor: pointer;">
          <td>
            <div class="titulo-cell">
              <strong>${report.titulo}</strong>
              <small class="text-muted">${report.descricao.substring(0, 100)}${report.descricao.length > 100 ? '...' : ''}</small>
            </div>
          </td>
          <td>${prioridadeBadge}</td>
          <td>${statusBadge}</td>
          <td>${categoriaBadge}</td>
          <td>${report.usuario_nome}</td>
          <td>${dataFormatada}</td>
          <td>
            <div class="action-buttons">
              <button class="btn-action btn-edit" onclick="event.stopPropagation(); editarBugReport(${report.id})">
                <i class="fas fa-edit"></i> Editar
              </button>
              <button class="btn-action btn-delete" onclick="event.stopPropagation(); deletarBugReport(${report.id})">
                <i class="fas fa-trash"></i> Deletar
              </button>
            </div>
          </td>
        </tr>
      `
    })
    .join("")
}

function abrirModalBugReport(reportId = null) {
  const modal = document.getElementById("modalBugReport")
  const modalTitle = document.getElementById("modalBugReportTitle")
  const form = document.getElementById("formBugReport")

  // Always reset the form first
  form.reset()

  if (reportId) {
    // Edit mode
    const report = bugReports.find(r => r.id === reportId)
    if (report) {
      modalTitle.textContent = "Editar Bug Report"
      document.getElementById("bugReportTitulo").value = report.titulo || ""
      document.getElementById("bugReportDescricao").value = report.descricao || ""
      document.getElementById("bugReportPrioridade").value = report.prioridade || "media"
      document.getElementById("bugReportStatus").value = report.status || "aberto"
      document.getElementById("bugReportCategoria").value = report.categoria || "geral"
      form.dataset.editId = reportId
    }
  } else {
    // Create mode
    modalTitle.textContent = "Novo Bug Report"
    // Form is already reset, just ensure default values
    document.getElementById("bugReportPrioridade").value = "media"
    document.getElementById("bugReportStatus").value = "aberto"
    document.getElementById("bugReportCategoria").value = "geral"
    delete form.dataset.editId
  }

  // Trigger validation after setting values
  const tituloInput = document.getElementById("bugReportTitulo")
  const descricaoTextarea = document.getElementById("bugReportDescricao")
  const btnSalvarBugReport = document.getElementById("btnSalvarBugReport")

  if (tituloInput && descricaoTextarea && btnSalvarBugReport) {
    const validarCampos = () => {
      const tituloPreenchido = tituloInput.value.trim().length > 0
      const descricaoPreenchida = descricaoTextarea.value.trim().length > 0

      if (tituloPreenchido && descricaoPreenchida) {
        btnSalvarBugReport.classList.remove("btn-disabled")
        btnSalvarBugReport.classList.add("btn-primary")
      } else {
        btnSalvarBugReport.classList.remove("btn-primary")
        btnSalvarBugReport.classList.add("btn-disabled")
      }
    }

    // Run validation after modal opens
    validarCampos()
  }

  modal.style.display = "flex"
}

async function salvarBugReport(e) {
  const tituloInput = document.getElementById("bugReportTitulo")
  const descricaoTextarea = document.getElementById("bugReportDescricao")

  if (!tituloInput || !descricaoTextarea) {
    mostrarNotificacao("Erro: Campos do formulário não encontrados", "erro")
    return
  }

  const titulo = tituloInput.value
  const descricao = descricaoTextarea.value

  // Validação client-side
  const tituloTrimmed = titulo.trim()
  const descricaoTrimmed = descricao.trim()

  if (!tituloTrimmed) {
    mostrarNotificacao("Título é obrigatório", "erro")
    tituloInput.focus()
    tituloInput.select()
    return
  }

  if (!descricaoTrimmed) {
    mostrarNotificacao("Descrição é obrigatória", "erro")
    descricaoTextarea.focus()
    descricaoTextarea.select()
    return
  }

  const form = document.getElementById("formBugReport")
  const isEdit = form.dataset.editId
  const data = {
    titulo: tituloTrimmed,
    descricao: descricaoTrimmed,
    prioridade: document.getElementById("bugReportPrioridade").value,
    status: document.getElementById("bugReportStatus").value,
    categoria: document.getElementById("bugReportCategoria").value
  }

  try {
    if (isEdit) {
      await fazerRequisicao(`/api/bug-reports/${isEdit}`, {
        method: "PUT",
        body: JSON.stringify(data)
      })
      mostrarNotificacao("Bug report atualizado com sucesso!", "sucesso")
    } else {
      const response = await fazerRequisicao("/api/bug-reports", {
        method: "POST",
        body: JSON.stringify(data)
      })
      mostrarNotificacao("Bug report criado com sucesso!", "sucesso")
    }

    document.getElementById("modalBugReport").style.display = "none"
    await carregarBugReports()
  } catch (error) {
    console.error("Erro ao salvar bug report:", error)
    mostrarNotificacao("Erro ao salvar bug report", "erro")
  }
}

async function visualizarBugReport(id) {
  try {
    const response = await fazerRequisicao(`/api/bug-reports/${id}`)
    currentBugReport = response

    mostrarBugReportDetail()
  } catch (error) {
    console.error("Erro ao carregar bug report:", error)
    mostrarNotificacao("Erro ao carregar bug report", "erro")
  }
}

function mostrarBugReportDetail() {
  if (!currentBugReport) return

  // Update header info
  document.getElementById("bugReportTitleDetail").textContent = currentBugReport.titulo
  document.getElementById("bugReportPrioridadeDetail").textContent = currentBugReport.prioridade.charAt(0).toUpperCase() + currentBugReport.prioridade.slice(1)
  document.getElementById("bugReportPrioridadeDetail").className = `prioridade-badge prioridade-${currentBugReport.prioridade}`
  document.getElementById("bugReportStatusDetail").textContent = formatarStatus(currentBugReport.status)
  document.getElementById("bugReportStatusDetail").className = `status-badge status-${currentBugReport.status}`
  document.getElementById("bugReportCategoriaDetail").textContent = currentBugReport.categoria.charAt(0).toUpperCase() + currentBugReport.categoria.slice(1)
  document.getElementById("bugReportCriadoPor").textContent = `Criado por ${currentBugReport.usuario_nome}`
  document.getElementById("bugReportData").textContent = formatarData(currentBugReport.criado_em)

  // Update description
  document.getElementById("bugReportDescricaoDetail").textContent = currentBugReport.descricao

  // Update chat messages
  atualizarChatMessages()

  // Show detail page
  document.getElementById("bugReportsPage").classList.remove("active")
  document.getElementById("bugReportDetailPage").classList.add("active")

  // Setup chat form
  const formMensagem = document.getElementById("formNovaMensagem")
  if (formMensagem) {
    formMensagem.addEventListener("submit", enviarMensagem)
  }

  // Join the bug report room for real-time messages
  if (socket && currentBugReport.id) {
    socket.emit('join-bug-report', currentBugReport.id)
  }
}

function atualizarChatMessages() {
  const chatMessages = document.getElementById("chatMessages")
  if (!chatMessages || !currentBugReport?.messages) return

  const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado"))

  chatMessages.innerHTML = currentBugReport.messages
    .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em))
    .map(message => {
      const isOwn = message.usuario_id === usuarioLogado.id
      const avatar = message.usuario_nome.charAt(0).toUpperCase()
      const time = formatarDataHora(message.criado_em)

      return `
        <div class="chat-message ${isOwn ? 'own' : ''}">
          <div class="chat-avatar">${avatar}</div>
          <div class="chat-content">
            <div class="chat-header">
              <span class="chat-author">${message.usuario_nome}</span>
              <span class="chat-time">${time}</span>
            </div>
            <div class="chat-text">${message.mensagem.replace(/\n/g, '<br>')}</div>
          </div>
        </div>
      `
    })
    .join("")

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight
}

async function enviarMensagem(e) {
  e.preventDefault()

  const mensagemInput = document.getElementById("novaMensagem")
  const mensagem = mensagemInput.value.trim()

  if (!mensagem || !currentBugReport || !socket) return

  try {
    // Enviar mensagem via Socket.IO (que também salva no banco)
    socket.emit('send-message', {
      id: currentBugReport.id,
      mensagem: mensagem
    })

    mensagemInput.value = ""
    // Não precisa recarregar, a mensagem aparecerá via Socket.IO
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error)
    mostrarNotificacao("Erro ao enviar mensagem", "erro")
  }
}

function editarBugReport(id) {
  abrirModalBugReport(id)
}

function deletarBugReport(id) {
  bugReportToDelete = id
  document.getElementById("modalConfirmacaoDelete").style.display = "flex"
}

async function confirmarDeleteBugReport() {
  if (!bugReportToDelete) return

  const id = bugReportToDelete
  bugReportToDelete = null

  try {
    await fazerRequisicao(`/api/bug-reports/${id}`, {
      method: "DELETE"
    })

    mostrarNotificacao("Bug report deletado com sucesso!", "sucesso")
    document.getElementById("modalConfirmacaoDelete").style.display = "none"
    await carregarBugReports()

    // If we're on the detail page of the deleted bug report, go back to list
    if (currentBugReport && currentBugReport.id === id) {
      voltarParaLista()
    }
  } catch (error) {
    console.error("Erro ao deletar bug report:", error)
    mostrarNotificacao("Erro ao deletar bug report", "erro")
    document.getElementById("modalConfirmacaoDelete").style.display = "none"
  }
}

function voltarParaLista() {
  // Leave the bug report room
  if (socket && currentBugReport?.id) {
    socket.emit('leave-bug-report', currentBugReport.id)
  }

  document.getElementById("bugReportDetailPage").classList.remove("active")
  document.getElementById("bugReportsPage").classList.add("active")
  currentBugReport = null
}

// Utility functions
function formatarData(data) {
  if (!data) return "-"
  const d = new Date(data)
  return d.toLocaleDateString("pt-BR")
}

function formatarDataHora(data) {
  if (!data) return "-"
  const d = new Date(data)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
}

function formatarStatus(status) {
  const statusMap = {
    "aberto": "Aberto",
    "em-andamento": "Em Andamento",
    "resolvido": "Resolvido",
    "fechado": "Fechado"
  }
  return statusMap[status] || status
}

function formatarCargo(cargo) {
  if (!cargo) return ""
  const cargos = cargo.split(',').map(c => c.trim())
  const map = {
    "head-admin": "Head Admin",
    admin: "Admin",
    corretor: "Corretor(a)",
    visualizar: "Visualizar"
  }
  return cargos.map(c => map[c.toLowerCase()] || c).join(", ")
}

function isAdminOrHeadAdmin() {
  const usuario = JSON.parse(localStorage.getItem("usuarioLogado"))
  if (!usuario?.cargo) return false
  const cargos = usuario.cargo.toLowerCase().split(',').map(c => c.trim())
  return cargos.includes("admin") || cargos.includes("head-admin")
}

// Event listeners for detail page buttons
document.addEventListener("DOMContentLoaded", () => {
  const btnVoltar = document.getElementById("btnVoltar")
  if (btnVoltar) {
    btnVoltar.addEventListener("click", voltarParaLista)
  }

  const btnEditarBugReport = document.getElementById("btnEditarBugReport")
  if (btnEditarBugReport) {
    btnEditarBugReport.addEventListener("click", () => {
      if (currentBugReport) {
        editarBugReport(currentBugReport.id)
      }
    })
  }

  const btnDeletarBugReport = document.getElementById("btnDeletarBugReport")
  if (btnDeletarBugReport) {
    btnDeletarBugReport.addEventListener("click", () => {
      if (currentBugReport) {
        deletarBugReport(currentBugReport.id)
      }
    })
  }
})
