// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  atualizarDashboard()
  configurarEventos()
})

// ===== AUTENTICAÇÃO =====
function verificarAutenticacao() {
  const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado"))
  if (!usuarioLogado) {
    window.location.href = "index.html"
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
      userRoleElement.textContent = usuarioLogado.role || "User"
    }

    // Mostrar seção admin se for admin
    if (usuarioLogado.role === "Admin") {
      const adminSection = document.getElementById("adminSection")
      if (adminSection) {
        adminSection.style.display = "block"
      }
    }
  }
}

// ===== DASHBOARD =====
function atualizarDashboard() {
  const clientes = getClientes()

  const totalClientes = clientes.length
  const clientesNovos = clientes.filter((c) => c.status === "novo").length
  const clientesQuentes = clientes.filter((c) => c.status === "quente").length
  const clientesFrios = clientes.filter((c) => c.status === "frio").length

  document.getElementById("totalClientes").textContent = totalClientes
  document.getElementById("clientesNovos").textContent = clientesNovos
  document.getElementById("clientesQuentes").textContent = clientesQuentes
  document.getElementById("clientesFrios").textContent = clientesFrios

  const agendamentos = getAgendamentos()
  const hoje = new Date()
  const seteDiasDepois = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000)

  const agendamentosProximos = agendamentos.filter((a) => {
    const dataAgend = new Date(a.data)
    return dataAgend >= hoje && dataAgend <= seteDiasDepois
  }).length

  document.getElementById("agendamentosProximos").textContent = agendamentosProximos

  atualizarTabelaUltimosClientes(clientes)
}

function atualizarTabelaUltimosClientes(clientes) {
  const tbody = document.getElementById("recentClientsTable")

  if (!tbody) return

  const ultimosClientes = [...clientes].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5)

  if (ultimosClientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum cliente cadastrado</td></tr>'
    return
  }

  tbody.innerHTML = ultimosClientes
    .map(
      (cliente) => `
        <tr>
            <td>${cliente.nome}</td>
            <td>${cliente.telefone}</td>
            <td>${formatarData(cliente.data)}</td>
            <td>${formatarInteresse(cliente.interesse)}</td>
            <td><span class="badge badge-${cliente.status}">${formatarStatus(cliente.status)}</span></td>
        </tr>
    `,
    )
    .join("")
}

// ===== EVENTOS =====
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
      if (confirm("Deseja realmente sair?")) {
        localStorage.removeItem("usuarioLogado")
        window.location.href = "index.html"
      }
    })
  }

  // Navegação entre páginas
  const navItems = document.querySelectorAll(".nav-item[data-page]")
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      const page = item.dataset.page
      if (page && page !== "dashboard") {
        // Fechar sidebar no mobile
        if (sidebar) {
          sidebar.classList.remove("active")
        }
      }
    })
  })

  // Botão "Ver todos" na tabela de clientes
  const verTodosBtn = document.querySelector('[data-page="clientes"]')
  if (verTodosBtn) {
    verTodosBtn.addEventListener("click", (e) => {
      e.preventDefault()
      window.location.href = "clientes.html"
    })
  }
}

// ===== ATUALIZAÇÃO PERIÓDICA =====
// Atualizar dashboard a cada 30 segundos para refletir mudanças
setInterval(() => {
  atualizarDashboard()
}, 30000)

// ===== FUNÇÕES AUXILIARES =====
function getClientes() {
  // Implementação para obter clientes
  return JSON.parse(localStorage.getItem("clientes")) || []
}

function getAgendamentos() {
  // Implementação para obter agendamentos
  return JSON.parse(localStorage.getItem("agendamentos")) || []
}

function formatarData(data) {
  // Implementação para formatar data
  const date = new Date(data)
  return date.toLocaleDateString("pt-BR")
}

function formatarInteresse(interesse) {
  // Implementação para formatar interesse
  return interesse.charAt(0).toUpperCase() + interesse.slice(1)
}

function formatarStatus(status) {
  // Implementação para formatar status
  return status.charAt(0).toUpperCase() + status.slice(1)
}
