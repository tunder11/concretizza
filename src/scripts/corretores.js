document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  carregarCorretoresEClientes()
  configurarEventos()
  aplicarPermissoes()
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
      const cargo = usuarioLogado.cargo?.toLowerCase()
      if (cargo === "admin" || cargo === "head-admin") {
        adminSection.style.display = "block"
      } else {
        adminSection.style.display = "none"
      }
    }
  }
}

let corretores = []
let corretoresFiltrados = []
let clientes = []
let clientesFiltrados = []
let corretoresCompletos = {}
let corretorAtualSelecionado = null
let currentPageDisponiveis = 1
const itensPorPagina = 10

async function carregarCorretoresEClientes() {
  mostrarCarregando(true)
  try {
    const [corretoresResp, clientesResp] = await Promise.all([
      fazerRequisicao(`/api/corretores?t=${Date.now()}`, { method: "GET" }),
      fazerRequisicao(`/api/clientes-disponiveis?t=${Date.now()}`, { method: "GET" })
    ])
    
    corretores = corretoresResp || []
    clientes = clientesResp || []
    
    corretoresFiltrados = [...corretores]
    clientesFiltrados = clientes.filter(c => !c.atribuido_a)
    
    renderizarCorretores()
    atualizarClientesDisponiveis()
    atualizarEstatisticas()
    mostrarCarregando(false)
  } catch (error) {
    console.error("Erro ao carregar dados:", error)
    mostrarNotificacao("Erro ao carregar dados: " + error.message, "erro")
    mostrarCarregando(false)
    const container = document.getElementById("corretoresContainer")
    if (container) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Não foi possível carregar os dados.</p>
        </div>
      `
    }
    const tabela = document.getElementById("clientesDisponiveisTable")
    if (tabela) {
      tabela.innerHTML = `<tr><td colspan="6" class="text-center">Erro ao carregar clientes</td></tr>`
    }
  }
}

function atualizarEstatisticas() {
  const totalCorretores = corretores.length
  const totalClientes = clientes.length
  const clientesSemCorretor = clientes.filter(c => !c.atribuido_a).length
  const clientesAtribuidos = totalClientes - clientesSemCorretor
  
  document.getElementById("totalCorretores").textContent = totalCorretores
  document.getElementById("totalClientes").textContent = totalClientes
  document.getElementById("clientesSemCorretor").textContent = clientesSemCorretor
  document.getElementById("clientesAtribuidos").textContent = clientesAtribuidos
}

function renderizarCorretores() {
  const container = document.getElementById("corretoresContainer")
  if (!container) return
  container.removeAttribute("data-loading")
  
  if (corretoresFiltrados.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-search"></i>
        <p>Nenhum corretor encontrado</p>
      </div>
    `
    return
  }
  
  container.innerHTML = corretoresFiltrados.map(corretor => {
    const clientesCorretor = clientes.filter(c => c.atribuido_a === corretor.id)
    const statusClass = corretor.status === "ativo" ? "" : "inativo"
    
    return `
      <div class="corretor-card">
        <div class="corretor-header">
          <div class="corretor-info">
            <div class="corretor-name">${corretor.nome}</div>
            <span class="corretor-status ${statusClass}">${corretor.status}</span>
          </div>
        </div>
        
        <div class="corretor-stats">
          <div class="stat-item">
            <span class="stat-value">${clientesCorretor.length}</span>
            <span class="stat-label">Clientes</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${corretor.total_clientes || 0}</span>
            <span class="stat-label">Total</span>
          </div>
        </div>
        
        <div class="corretor-contacts">
          ${corretor.email ? `
            <div class="contact-item">
              <i class="fas fa-envelope"></i>
              <span class="contact-value" title="${corretor.email}">${corretor.email}</span>
            </div>
          ` : ""}
          ${corretor.telefone ? `
            <div class="contact-item">
              <i class="fas fa-phone"></i>
              <span class="contact-value">${corretor.telefone}</span>
            </div>
          ` : ""}
          ${corretor.departamento ? `
            <div class="contact-item">
              <i class="fas fa-briefcase"></i>
              <span class="contact-value">${corretor.departamento}</span>
            </div>
          ` : ""}
        </div>
        
        <div class="corretor-actions">
          <button class="btn-assign" onclick="abrirModalAtribuir(${corretor.id}, '${corretor.nome}')">
            <i class="fas fa-link"></i> Atribuir
          </button>
          <button class="btn-view-clients" onclick="abrirClientesCorretor(${corretor.id}, '${corretor.nome}')">
            <i class="fas fa-list"></i> Ver Clientes
          </button>
        </div>
      </div>
    `
  }).join("")
}

function atualizarClientesDisponiveis() {
  const tbody = document.getElementById("clientesDisponiveisTable")
  if (!tbody) return
  tbody.removeAttribute("data-loading")
  
  const clientesDisponiveis = clientes.filter(c => !c.atribuido_a)
  
  const inicio = (currentPageDisponiveis - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const clientesPagina = clientesDisponiveis.slice(inicio, fim)
  
  if (clientesPagina.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Nenhum cliente sem atribuição</td></tr>`
  } else {
    tbody.innerHTML = clientesPagina.map(cliente => `
      <tr>
        <td>${cliente.nome}</td>
        <td>${cliente.telefone}</td>
        <td>${cliente.email || "-"}</td>
        <td><span class="badge badge-${cliente.status}">${formatarStatus(cliente.status)}</span></td>
        <td>${cliente.valor || "-"}</td>
        <td>
          <button class="btn-action btn-edit" onclick="abrirModalAtribuirRapido(${cliente.id}, '${cliente.nome}')">
            <i class="fas fa-link"></i> Atribuir
          </button>
        </td>
      </tr>
    `).join("")
  }
  
  atualizarPaginacaoDisponiveis(clientesDisponiveis.length)
}

function atualizarPaginacaoDisponiveis(totalClientes = 0) {
  const total = totalClientes > 0 ? totalClientes : clientes.filter(c => !c.atribuido_a).length
  const totalPaginas = Math.ceil(total / itensPorPagina)
  document.getElementById("pageInfoDisponiveis").textContent = `Página ${currentPageDisponiveis} de ${totalPaginas}`
  document.getElementById("prevPageDisponiveis").disabled = currentPageDisponiveis === 1
  document.getElementById("nextPageDisponiveis").disabled = currentPageDisponiveis === totalPaginas
}

function abrirModalAtribuir(corretorId, corretorNome) {
  corretorAtualSelecionado = { id: corretorId, nome: corretorNome, clienteId: null }
  
  document.getElementById("groupCorretorNome").style.display = "flex"
  document.getElementById("groupCorretorSelect").style.display = "none"
  document.getElementById("groupClienteNome").style.display = "none"
  document.getElementById("groupClienteSelect").style.display = "flex"
  
  // Ajustar validação dos campos
  document.getElementById("corretorSelect").required = false
  document.getElementById("clienteAtribuir").required = true
  
  document.getElementById("corretorAtribuir").value = corretorNome
  
  const select = document.getElementById("clienteAtribuir")
  select.innerHTML = `<option value="">-- Selecione um cliente --</option>`
  select.disabled = false
  
  const clientesDisponiveis = clientes.filter(c => !c.atribuido_a)
  clientesDisponiveis.forEach(cliente => {
    const option = document.createElement("option")
    option.value = cliente.id
    option.textContent = cliente.nome
    select.appendChild(option)
  })
  
  document.getElementById("modalAtribuir").classList.add("show")
}

function abrirModalAtribuirRapido(clienteId, clienteNome) {
  corretorAtualSelecionado = { id: null, nome: null, clienteId: clienteId }
  
  document.getElementById("groupCorretorNome").style.display = "none"
  document.getElementById("groupCorretorSelect").style.display = "flex"
  document.getElementById("groupClienteNome").style.display = "flex"
  document.getElementById("groupClienteSelect").style.display = "none"
  
  // Ajustar validação dos campos
  document.getElementById("corretorSelect").required = true
  document.getElementById("clienteAtribuir").required = false
  
  document.getElementById("clienteAtribuirNome").value = clienteNome
  
  const selectCorretor = document.getElementById("corretorSelect")
  selectCorretor.innerHTML = `<option value="">-- Selecione um corretor --</option>`
  selectCorretor.disabled = false
  
  corretores.forEach(corretor => {
    const option = document.createElement("option")
    option.value = corretor.id
    option.textContent = corretor.nome
    selectCorretor.appendChild(option)
  })
  
  document.getElementById("modalAtribuir").classList.add("show")
}

async function abrirClientesCorretor(corretorId, corretorNome) {
  try {
    document.getElementById("nomeCorretorModal").textContent = corretorNome
    corretorAtualSelecionado = { id: corretorId, nome: corretorNome }
    
    const tbody = document.getElementById("clientesCorretorTable")
    tbody.innerHTML = `<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando clientes...</td></tr>`
    
    document.getElementById("modalClientesCorretor").classList.add("show")
    
    const clientesCorretor = await fazerRequisicao(`/api/corretores/${corretorId}/clientes?t=${Date.now()}`, { method: "GET" })
    
    if (clientesCorretor.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center">Este corretor não possui clientes atribuídos</td></tr>`
    } else {
      tbody.innerHTML = clientesCorretor.map(cliente => `
        <tr>
          <td>${cliente.nome}</td>
          <td>${cliente.telefone}</td>
          <td>${cliente.email || "-"}</td>
          <td><span class="badge badge-${cliente.status}">${formatarStatus(cliente.status)}</span></td>
          <td>${cliente.interesse ? formatarInteresse(cliente.interesse) : "-"}</td>
          <td>
            <button class="btn-action btn-delete" onclick="removerClienteCorretor(${corretorId}, ${cliente.id}, '${cliente.nome}')">
              <i class="fas fa-unlink"></i> Remover
            </button>
          </td>
        </tr>
      `).join("")
    }
  } catch (error) {
    console.error("Erro ao carregar clientes:", error)
    mostrarNotificacao("Erro ao carregar clientes: " + error.message, "erro")
    const tbody = document.getElementById("clientesCorretorTable")
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Erro ao carregar clientes</td></tr>`
  }
}

function aplicarPermissoes() {
  const usuario = obterUsuarioLogado()
  if (!usuario) return

  const podeEditar = isAdminOrHeadAdmin()
  
  if (!podeEditar) {
    window.location.href = "/"
    return
  }
}

function configurarEventos() {
  document.getElementById("logoutBtn").addEventListener("click", fazerLogout)
  
  document.getElementById("searchCorretores").addEventListener("input", filtrarCorretores)
  document.getElementById("filterStatus").addEventListener("change", filtrarCorretores)
  
  document.getElementById("searchClientesDisponiveis").addEventListener("input", filtrarClientesDisponiveis)
  document.getElementById("filterStatusClientes").addEventListener("change", filtrarClientesDisponiveis)
  
  document.getElementById("prevPageDisponiveis").addEventListener("click", () => {
    if (currentPageDisponiveis > 1) {
      currentPageDisponiveis--
      atualizarClientesDisponiveis()
    }
  })
  
  document.getElementById("nextPageDisponiveis").addEventListener("click", () => {
    const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina)
    if (currentPageDisponiveis < totalPaginas) {
      currentPageDisponiveis++
      atualizarClientesDisponiveis()
    }
  })
  
  document.getElementById("formAtribuir").addEventListener("submit", atribuirCliente)
  
  document.getElementById("closeAtribuirModal").addEventListener("click", () => {
    document.getElementById("modalAtribuir").classList.remove("show")
  })
  
  document.getElementById("closeClientesModal").addEventListener("click", () => {
    document.getElementById("modalClientesCorretor").classList.remove("show")
  })

  document.getElementById("closeConfirmarRemocao").addEventListener("click", () => {
    document.getElementById("modalConfirmarRemocao").classList.remove("show")
  })
  
  document.querySelectorAll(".modal-close-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const modal = e.target.closest(".modal")
      if (modal) {
        modal.classList.remove("show")
      }
    })
  })
  
  document.getElementById("searchClientesCorretor").addEventListener("input", filtrarClientesCorretor)
  
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    document.querySelector(".sidebar").style.transform = "translateX(-100%)"
  })
  
  document.getElementById("sidebarToggleMobile").addEventListener("click", () => {
    document.querySelector(".sidebar").style.transform = "translateX(0)"
  })

  const modalConfirmarRemocao = document.getElementById("modalConfirmarRemocao")
  if (modalConfirmarRemocao) {
    modalConfirmarRemocao.addEventListener("click", (e) => {
      if (e.target === modalConfirmarRemocao) {
        modalConfirmarRemocao.classList.remove("show")
      }
    })
  }
}

function filtrarCorretores() {
  const search = document.getElementById("searchCorretores").value.toLowerCase()
  const status = document.getElementById("filterStatus").value
  
  corretoresFiltrados = corretores.filter(corretor => {
    const matchSearch = corretor.nome.toLowerCase().includes(search)
    const matchStatus = !status || corretor.status === status
    return matchSearch && matchStatus
  })
  
  renderizarCorretores()
}

function filtrarClientesDisponiveis() {
  const search = document.getElementById("searchClientesDisponiveis").value.toLowerCase()
  const status = document.getElementById("filterStatusClientes").value
  
  const clientesDisponiveis = clientes.filter(cliente => {
    if (cliente.atribuido_a) return false
    const matchSearch = cliente.nome.toLowerCase().includes(search)
    const matchStatus = !status || cliente.status === status
    return matchSearch && matchStatus
  })
  
  currentPageDisponiveis = 1
  
  const tbody = document.getElementById("clientesDisponiveisTable")
  const inicio = (currentPageDisponiveis - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const clientesPagina = clientesDisponiveis.slice(inicio, fim)
  
  if (clientesPagina.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Nenhum cliente encontrado</td></tr>`
  } else {
    tbody.innerHTML = clientesPagina.map(cliente => `
      <tr>
        <td>${cliente.nome}</td>
        <td>${cliente.telefone}</td>
        <td>${cliente.email || "-"}</td>
        <td><span class="badge badge-${cliente.status}">${formatarStatus(cliente.status)}</span></td>
        <td>${cliente.valor || "-"}</td>
        <td>
          <button class="btn-action btn-edit" onclick="abrirModalAtribuirRapido(${cliente.id}, '${cliente.nome}')">
            <i class="fas fa-link"></i> Atribuir
          </button>
        </td>
      </tr>
    `).join("")
  }
  
  atualizarPaginacaoDisponiveis(clientesDisponiveis.length)
}

function filtrarClientesCorretor() {
  const search = document.getElementById("searchClientesCorretor").value.toLowerCase()
  const tbody = document.getElementById("clientesCorretorTable")
  
  const rows = tbody.querySelectorAll("tr")
  rows.forEach(row => {
    if (row.textContent.toLowerCase().includes(search)) {
      row.style.display = ""
    } else {
      row.style.display = "none"
    }
  })
}

async function atribuirCliente(e) {
  e.preventDefault()
  
  console.log("[ATRIBUIR] Iniciando atribuição...")
  console.log("[ATRIBUIR] Corretor selecionado:", corretorAtualSelecionado)
  
  let clienteId = corretorAtualSelecionado?.clienteId
  let corretorId = corretorAtualSelecionado?.id
  
  // Se não veio do objeto selecionado, tenta pegar dos selects
  if (!clienteId) {
    const selectCliente = document.getElementById("clienteAtribuir")
    clienteId = selectCliente ? selectCliente.value : null
  }
  
  if (!corretorId) {
    const selectCorretor = document.getElementById("corretorSelect")
    corretorId = selectCorretor ? selectCorretor.value : null
  }
  
  console.log("[ATRIBUIR] IDs finais:", { clienteId, corretorId })
  
  if (!clienteId || clienteId === "") {
    mostrarNotificacao("Selecione um cliente", "aviso")
    return
  }
  
  if (!corretorId || corretorId === "") {
    mostrarNotificacao("Selecione um corretor", "aviso")
    return
  }
  
  try {
    mostrarCarregando(true) // Mostrar loading durante a requisição
    
    await fazerRequisicao(`/api/corretores/${corretorId}/clientes/${clienteId}`, {
      method: "POST"
    })
    
    mostrarNotificacao("Cliente atribuído com sucesso!", "sucesso")
    document.getElementById("modalAtribuir").classList.remove("show")
    
    await carregarCorretoresEClientes()
  } catch (error) {
    console.error("Erro ao atribuir cliente:", error)
    mostrarNotificacao("Erro ao atribuir cliente: " + error.message, "erro")
  } finally {
    mostrarCarregando(false)
  }
}

function removerClienteCorretor(corretorId, clienteId, clienteNome) {
  document.getElementById("nomeClienteRemover").textContent = clienteNome
  document.getElementById("modalConfirmarRemocao").classList.add("show")
  
  const btnConfirmar = document.getElementById("btnConfirmarRemocao")
  const btnCancelar = document.getElementById("btnCancelarRemocao")
  const closeBtn = document.getElementById("closeConfirmarRemocao")
  
  const confirmarRemocao = async () => {
    try {
      await fazerRequisicao(`/api/corretores/${corretorId}/clientes/${clienteId}`, {
        method: "DELETE"
      })
      
      mostrarNotificacao("Cliente removido com sucesso!", "sucesso")
      document.getElementById("modalConfirmarRemocao").classList.remove("show")
      
      await carregarCorretoresEClientes()
      await abrirClientesCorretor(corretorId, document.getElementById("nomeCorretorModal").textContent)
    } catch (error) {
      console.error("Erro ao remover cliente:", error)
      mostrarNotificacao("Erro ao remover cliente: " + error.message, "erro")
      document.getElementById("modalConfirmarRemocao").classList.remove("show")
    }
  }
  
  const cancelarRemocao = () => {
    document.getElementById("modalConfirmarRemocao").classList.remove("show")
    btnConfirmar.removeEventListener("click", confirmarRemocao)
    btnCancelar.removeEventListener("click", cancelarRemocao)
    closeBtn.removeEventListener("click", cancelarRemocao)
  }
  
  btnConfirmar.addEventListener("click", confirmarRemocao)
  btnCancelar.addEventListener("click", cancelarRemocao)
  closeBtn.addEventListener("click", cancelarRemocao)
}

function mostrarCarregando(show) {
  const corretoresContainer = document.getElementById("corretoresContainer")
  const clientesTabela = document.getElementById("clientesDisponiveisTable")
  
  if (show) {
    if (corretoresContainer) {
      corretoresContainer.setAttribute("data-loading", "true")
      corretoresContainer.innerHTML = `
        <div class="carregando" style="grid-column: 1 / -1;">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Carregando dados...</p>
        </div>
      `
    }
    if (clientesTabela) {
      clientesTabela.setAttribute("data-loading", "true")
      clientesTabela.innerHTML = `<tr><td colspan="6" class="text-center">Carregando clientes...</td></tr>`
    }
    return
  }
  
  if (corretoresContainer?.getAttribute("data-loading") === "true") {
    corretoresContainer.removeAttribute("data-loading")
    corretoresContainer.innerHTML = ""
  }
  
  if (clientesTabela?.getAttribute("data-loading") === "true") {
    clientesTabela.removeAttribute("data-loading")
    clientesTabela.innerHTML = ""
  }
}

function mostrarNotificacao(mensagem, tipo = "info") {
  const toast = document.createElement("div")
  toast.className = `toast toast-${tipo}`
  toast.style.display = "flex"
  
  const icones = {
    sucesso: "fa-check-circle",
    erro: "fa-exclamation-circle",
    aviso: "fa-info-circle",
    info: "fa-info-circle"
  }
  
  toast.innerHTML = `
    <i class="fas ${icones[tipo]}"></i>
    <span>${mensagem}</span>
  `
  
  document.body.appendChild(toast)
  
  setTimeout(() => {
    toast.remove()
  }, 3000)
}

function formatarStatus(status) {
  const mapa = {
    novo: "Novo",
    "em-atendimento": "Em Atendimento",
    quente: "Quente",
    frio: "Frio",
    finalizado: "Finalizado"
  }
  return mapa[status] || status
}

function formatarInteresse(interesse) {
  const mapa = {
    alugar: "Alugar",
    comprar: "Comprar",
    vender: "Vender"
  }
  return mapa[interesse] || interesse
}
