let logs = []

document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  carregarLogs()
  configurarEventos()
  
  setInterval(carregarLogs, 5000)
})

function verificarAutenticacao() {
  const token = localStorage.getItem("token")
  const usuario = JSON.parse(localStorage.getItem("usuarioLogado"))
  if (!token || !usuario || !isAdminOrHeadAdmin()) {
    window.location.href = "/"
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

    if (usuarioLogado.cargo?.toLowerCase() === "admin") {
      const btnLimparLogs = document.getElementById("btnLimparLogs")
      if (btnLimparLogs) {
        btnLimparLogs.style.display = "none"
      }
    }
  }
}

async function carregarLogs() {
  try {
    const logsApi = await fazerRequisicao("/api/logs")
    logs = logsApi || []
    atualizarTabela()
  } catch (error) {
    console.error("Erro ao carregar logs:", error)
    mostrarNotificacao("Erro ao carregar logs do servidor", "erro")
  }
}

function atualizarTabela() {
  const tbody = document.getElementById("logsTable")

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum log encontrado</td></tr>'
    return
  }

  tbody.innerHTML = logs
    .slice()
    .reverse()
    .map((log) => {
      const index = logs.indexOf(log)
      const acaoBadge = obterBadgeAcao(log.acao)
      return `
        <tr onclick="abrirDetalhesLog(${index})">
          <td>${acaoBadge}</td>
          <td><span class="badge badge-info">${log.modulo || "-"}</span></td>
          <td>${log.dataFormatada || "-"} ${log.horaFormatada || "-"}</td>
          <td><strong>${log.usuarioLogado || "-"}</strong></td>
          <td>${log.usuarioAfetado || "-"}</td>
          <td>${log.descricao || "-"}</td>
        </tr>
      `
    })
    .join("")
  
  atualizarEstatisticas()
}

function obterIconoAcao(acao) {
  const iconMap = {
    "CRIAR": "fa-plus",
    "EDITAR": "fa-edit",
    "DELETAR": "fa-trash",
    "LOGOUT": "fa-sign-out-alt"
  }
  return iconMap[acao] || "fa-circle"
}

function obterBadgeAcao(acao) {
  const colors = {
    "CRIAR": "badge-success",
    "EDITAR": "badge-info",
    "DELETAR": "badge-danger"
  }
  const cor = colors[acao] || "badge-secondary"
  const icone = obterIconoAcao(acao)
  return `<span class="badge ${cor}"><i class="fas ${icone}"></i> ${acao}</span>`
}

function atualizarEstatisticas() {
  const totalLogs = logs.length
  const hoje = new Date().toLocaleDateString('pt-BR')
  const logsHoje = logs.filter(l => l.dataFormatada === hoje).length
  
  const totalElem = document.getElementById("totalLogs")
  const hojeElem = document.getElementById("logsHoje")
  
  if (totalElem) totalElem.textContent = totalLogs
  if (hojeElem) hojeElem.textContent = logsHoje
}

function configurarEventos() {
  const sidebarToggle = document.getElementById("sidebarToggleMobile")
  const sidebar = document.querySelector(".sidebar")

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("active")
    })
  }

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

  const btnLimparLogs = document.getElementById("btnLimparLogs")
  if (btnLimparLogs) {
    btnLimparLogs.addEventListener("click", () => {
      const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado"))
      if (usuarioLogado?.cargo?.toLowerCase() === "admin") {
        mostrarNotificacao("Admin não tem permissão para deletar logs", "aviso")
        return
      }
      if (confirm("Tem certeza que deseja limpar todos os logs?")) {
        limparLogs()
      }
    })
  }

  const btnExportarLogs = document.getElementById("btnExportarLogs")
  if (btnExportarLogs) {
    btnExportarLogs.addEventListener("click", exportarLogs)
  }

  const searchLogs = document.getElementById("searchLogs")
  if (searchLogs) {
    searchLogs.addEventListener("input", filtrarLogs)
  }

  const filterAcao = document.getElementById("filterAcao")
  if (filterAcao) {
    filterAcao.addEventListener("change", filtrarLogs)
  }

  const closeDetalhesLog = document.getElementById("closeDetalhesLog")
  if (closeDetalhesLog) {
    closeDetalhesLog.addEventListener("click", () => {
      document.getElementById("modalDetalhesLog").style.display = "none"
    })
  }
  
  window.addEventListener("click", (e) => {
    const modal = document.getElementById("modalDetalhesLog")
    if (e.target === modal) {
      modal.style.display = "none"
    }
  })
}

function filtrarLogs() {
  const search = document.getElementById("searchLogs").value.toLowerCase()
  const filterAcao = document.getElementById("filterAcao").value

  let logsFiltrados = logs.filter(log => {
    const matchAcao = !filterAcao || log.acao === filterAcao
    const matchSearch = !search || 
      log.acao?.toLowerCase().includes(search) ||
      log.modulo?.toLowerCase().includes(search) ||
      log.usuarioLogado?.toLowerCase().includes(search) ||
      log.descricao?.toLowerCase().includes(search)
    
    return matchAcao && matchSearch
  })

  const tbody = document.getElementById("logsTable")
  if (logsFiltrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum log encontrado</td></tr>'
    return
  }

  tbody.innerHTML = logsFiltrados
    .slice()
    .reverse()
    .map((log) => {
      const index = logs.indexOf(log)
      const acaoBadge = obterBadgeAcao(log.acao)
      return `
        <tr onclick="abrirDetalhesLog(${index})">
          <td>${acaoBadge}</td>
          <td><span class="badge badge-info">${log.modulo || "-"}</span></td>
          <td>${log.dataFormatada || "-"} ${log.horaFormatada || "-"}</td>
          <td><strong>${log.usuarioLogado || "-"}</strong></td>
          <td>${log.usuarioAfetado || "-"}</td>
          <td>${log.descricao || "-"}</td>
        </tr>
      `
    })
    .join("")
}

function exportarLogs() {
  const csv = [
    ['Ação', 'Módulo', 'Data', 'Hora', 'Usuário', 'Usuário Afetado', 'Descrição'].join(','),
    ...logs.map(l => [
      l.acao,
      l.modulo,
      l.dataFormatada,
      l.horaFormatada,
      l.usuarioLogado,
      l.usuarioAfetado || '-',
      `"${l.descricao}"`
    ].join(','))
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `logs_${new Date().toISOString().split('T')[0]}.csv`
  link.click()
}

function limparLogs() {
  localStorage.removeItem("logs")
  logs = []
  atualizarTabela()
  mostrarNotificacao("Logs limpos com sucesso!", "sucesso")
}

function adicionarLog(usuario, acao, modulo, descricao) {
  const log = {
    usuario,
    acao,
    modulo,
    descricao,
    data: new Date().toISOString()
  }

  const logsAtuais = JSON.parse(localStorage.getItem("logs")) || []
  logsAtuais.push(log)
  localStorage.setItem("logs", JSON.stringify(logsAtuais))
}

function formatarData(data) {
  if (!data) return "-"
  const d = new Date(data)
  return d.toLocaleString("pt-BR")
}

function formatarCargo(cargo) {
  const map = {
    "head-admin": "Head Admin",
    admin: "Admin",
    corretor: "Corretor(a)",
    visualizar: "Visualizar"
  }
  return map[cargo?.toLowerCase()] || (cargo ? cargo.charAt(0).toUpperCase() + cargo.slice(1) : "")
}

function abrirDetalhesLog(index) {
  const log = logs[index]
  if (!log) return

  const detailAcao = document.getElementById("detailAcao")
  const detailModulo = document.getElementById("detailModulo")
  const detailDataHora = document.getElementById("detailDataHora")
  const detailUsuario = document.getElementById("detailUsuario")
  const detailAfetado = document.getElementById("detailAfetado")
  const detailDescricao = document.getElementById("detailDescricao")
  const modal = document.getElementById("modalDetalhesLog")

  if (detailAcao) detailAcao.textContent = log.acao
  if (detailModulo) detailModulo.textContent = log.modulo
  if (detailDataHora) detailDataHora.textContent = `${log.dataFormatada} ${log.horaFormatada}`
  if (detailUsuario) detailUsuario.textContent = log.usuarioLogado
  if (detailAfetado) detailAfetado.textContent = log.usuarioAfetado || "N/A"
  if (detailDescricao) detailDescricao.textContent = log.descricao
  
  if (modal) modal.style.display = "flex"
}
