document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  carregarDados()
  configurarEventos()
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
      } else {
        adminSection.style.display = "none"
      }
    }
  }
}

let clientes = []
let usuariosData = []

async function carregarDados() {
  try {
    clientes = await obterClientes()
    atualizarEstatisticas()
    atualizarTabelaRecentes()
  } catch (error) {
    console.error("Erro ao carregar dados:", error)
    alert("Erro ao carregar dados: " + error.message)
  }
}

function atualizarEstatisticas() {
  const totalClientes = clientes.length
  const clientesNovos = clientes.filter((c) => c.status === "novo").length
  const clientesPrioridade = clientes.filter((c) => c.status === "prioridade").length
  const clientesAguardando = clientes.filter((c) => c.status === "aguardando").length

  document.getElementById("totalClientes").textContent = totalClientes
  document.getElementById("clientesNovos").textContent = clientesNovos
  document.getElementById("clientesPrioridade").textContent = clientesPrioridade
  document.getElementById("clientesAguardando").textContent = clientesAguardando
  document.getElementById("agendamentosProximos").textContent = "0"
}

function atualizarTabelaRecentes() {
  const tbody = document.getElementById("recentClientsTable")
  const recentes = clientes.slice(0, 5)

  if (recentes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum cliente cadastrado</td></tr>'
    return
  }

  tbody.innerHTML = recentes
    .map((cliente) => {
      return `
        <tr>
          <td>${cliente.nome}</td>
          <td>${cliente.telefone}</td>
          <td>${formatarData(cliente.data)}</td>
          <td>${formatarInteresse(cliente.interesse)}</td>
          <td><span class="badge badge-${cliente.status}">${formatarStatus(cliente.status)}</span></td>
        </tr>
      `
    })
    .join("")
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

  // Fechar modal ao clicar fora
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.style.display = "none"
      e.target.classList.remove("show")
      e.target.classList.remove("active")
    }
  })

  const navItems = document.querySelectorAll(".nav-item[data-page]")
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      const page = item.getAttribute("data-page")
      if (page === "clientes") {
        window.location.href = "/clientes"
      } else if (page === "usuarios") {
        window.location.href = "/usuarios"
      } else if (page === "logs") {
        window.location.href = "/logs"
      }
    })
  })

  const btnNovoCliente = document.getElementById("btnNovoCliente")
  if (btnNovoCliente) {
    btnNovoCliente.addEventListener("click", () => {
      document.getElementById("modalCliente").style.display = "flex"
    })
  }

  const formCliente = document.getElementById("formCliente")
  if (formCliente) {
    formCliente.addEventListener("submit", (e) => {
      e.preventDefault()
      salvarClienteRapido()
    })
  }

  const closeModal = document.querySelector("#modalCliente .modal-close")
  if (closeModal) {
    closeModal.addEventListener("click", () => {
      document.getElementById("modalCliente").style.display = "none"
    })
  }

  const cancelBtns = document.querySelectorAll(".modal-close-btn")
  cancelBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("modalCliente").style.display = "none"
    })
  })
}

async function salvarClienteRapido() {
  const nome = document.getElementById("clienteNome").value.trim()
  const telefone = document.getElementById("clienteTelefone").value.trim()
  const email = document.getElementById("clienteEmail").value.trim()
  const interesse = document.getElementById("clienteInteresse").value
  const valor = document.getElementById("clienteValor").value.trim()
  const status = document.getElementById("clienteStatus").value
  const observacoes = document.getElementById("clienteObservacoes").value.trim()

  if (!nome || !telefone || !interesse || !status) {
    alert("Preencha todos os campos obrigatórios")
    return
  }

  try {
    const cliente = {
      nome,
      telefone,
      email: email || null,
      interesse,
      valor: valor || null,
      status,
      observacoes: observacoes || null,
      data: new Date().toISOString().split("T")[0]
    }

    console.log("[DASHBOARD] Enviando cliente para criar:", cliente)
    
    const resultado = await criarCliente(cliente)
    console.log("[DASHBOARD] Resposta do servidor:", resultado)
    
    alert("Cliente criado com sucesso!")
    document.getElementById("modalCliente").style.display = "none"
    document.getElementById("formCliente").reset()
    await carregarDados()
  } catch (error) {
    console.error("[DASHBOARD] Erro ao criar cliente:", error)
    alert("Erro ao salvar cliente: " + error.message)
  }
}

function formatarData(data) {
  if (!data) return "-"
  const d = new Date(data)
  return d.toLocaleDateString("pt-BR")
}

function formatarStatus(status) {
  const map = {
    novo: "Novo",
    "em-atendimento": "Em Atendimento",
    prioridade: "Prioridade",
    aguardando: "Aguardando",
    finalizado: "Finalizado"
  }
  return map[status] || status
}

function formatarInteresse(interesse) {
  const map = {
    alugar: "Alugar",
    comprar: "Comprar",
    vender: "Vender"
  }
  return map[interesse] || interesse
}

function mostrarCarregando(show) {
  const modal = document.getElementById("modalCliente")
  const btn = modal?.querySelector(".btn-primary")
  if (btn) {
    btn.disabled = show
  }
}
