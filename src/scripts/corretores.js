document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  configurarDadosUsuario()
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
      const cargos = usuarioLogado.cargo?.toLowerCase().split(',').map(c => c.trim())
      if (cargos.includes("admin") || cargos.includes("head-admin")) {
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
let clientesDisponiveisFiltrados = []
let corretoresCompletos = {}
let corretorAtualSelecionado = null
let currentPageDisponiveis = 1
let itensPorPagina = 10
let clientesSelecionadosDisponiveis = []
let filtrosAtivosDisponiveis = false

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

    // Reset filters
    filtrosAtivosDisponiveis = false
    clientesDisponiveisFiltrados = []
    currentPageDisponiveis = 1

    // Clear filter inputs
    const searchClientesDisponiveis = document.getElementById("searchClientesDisponiveis")
    const filterStatusClientes = document.getElementById("filterStatusClientes")
    if (searchClientesDisponiveis) searchClientesDisponiveis.value = ""
    if (filterStatusClientes) filterStatusClientes.value = ""

    renderizarCorretores()
  atualizarClientesDisponiveis()
  atualizarEstatisticas()
  configurarEventosBulk()
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
  
  const countEl = document.getElementById("countCorretores")
  if (countEl) {
    countEl.textContent = corretoresFiltrados.length
  }
  
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

  // Use filtered list if filters are active, otherwise use all available clients
  const clientesParaExibir = filtrosAtivosDisponiveis ? clientesDisponiveisFiltrados : clientes.filter(c => !c.atribuido_a && c.status !== 'finalizado')

  const countEl = document.getElementById("countClientesDisponiveis")
  if (countEl) {
    countEl.textContent = clientesParaExibir.length
  }

  const inicio = (currentPageDisponiveis - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const clientesPagina = clientesParaExibir.slice(inicio, fim)

  if (clientesPagina.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">${filtrosAtivosDisponiveis ? 'Nenhum cliente encontrado' : 'Nenhum cliente sem atribuição'}</td></tr>`
  } else {
    tbody.innerHTML = clientesPagina.map(cliente => `
      <tr>
        <td><input type="checkbox" class="cliente-checkbox" data-cliente-id="${cliente.id}" ${clientesSelecionadosDisponiveis.includes(cliente.id.toString()) ? 'checked' : ''}></td>
        <td>${cliente.nome}</td>
        <td>${cliente.telefone}</td>
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

  atualizarPaginacaoDisponiveis(clientesParaExibir.length)
  atualizarBotoesBulk()
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

  // Only show active brokers (status = 'ativo')
  const corretoresAtivos = corretores.filter(corretor => corretor.status === 'ativo')
  corretoresAtivos.forEach(corretor => {
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

    const modal = document.getElementById("modalClientesCorretor")
    modal.style.display = "" // Remove inline display style that may prevent modal from opening
    modal.classList.add("show")
    
    const clientesCorretor = await fazerRequisicao(`/api/corretores/${corretorId}/clientes?t=${Date.now()}`, { method: "GET" })
    
    if (clientesCorretor.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center">Este corretor não possui clientes atribuídos</td></tr>`
    } else {
      tbody.innerHTML = clientesCorretor.map(cliente => `
        <tr onclick="abrirDetalhesClienteCorretor(${cliente.id})" style="cursor: pointer;">
          <td onclick="event.stopPropagation();"><input type="checkbox" class="cliente-corretor-checkbox" data-cliente-id="${cliente.id}"></td>
          <td>${cliente.nome}</td>
          <td>${cliente.telefone}</td>
          <td><span class="badge badge-${cliente.status}">${formatarStatus(cliente.status)}</span></td>
          <td>${cliente.interesse ? formatarInteresse(cliente.interesse) : "-"}</td>
          <td onclick="event.stopPropagation();">
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

  // Items per page for corretores page
  const itemsPerPageContainerDisponiveis = document.querySelector("#clientesDisponiveisTable").closest(".content-card").querySelector(".items-per-page-container")
  const itemsPerPageSelectDisponiveis = document.getElementById("itemsPerPageDisponiveis")
  if (itemsPerPageContainerDisponiveis && itemsPerPageSelectDisponiveis) {
    itemsPerPageContainerDisponiveis.style.display = isAdminOrHeadAdmin() ? "flex" : "none"
    if (isAdminOrHeadAdmin()) {
      // Load saved preference
      const savedItemsPerPage = localStorage.getItem("corretoresItemsPerPage")
      if (savedItemsPerPage && [10, 25, 50, 100].includes(parseInt(savedItemsPerPage))) {
        itensPorPagina = parseInt(savedItemsPerPage)
        itemsPerPageSelectDisponiveis.value = savedItemsPerPage
      }
    }
  }
}

function configurarEventos() {
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
    const totalClientes = filtrosAtivosDisponiveis ? clientesDisponiveisFiltrados.length : clientes.filter(c => !c.atribuido_a && c.status !== 'finalizado').length
    const totalPaginas = Math.ceil(totalClientes / itensPorPagina)
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

  const closeDetailsModal = document.getElementById("closeDetailsModal")
  if (closeDetailsModal) {
    closeDetailsModal.addEventListener("click", () => {
      document.getElementById("modalDetalhesCliente").style.display = "none"
    })
  }

  const btnFecharDetalhes = document.getElementById("btnFecharDetalhes")
  if (btnFecharDetalhes) {
    btnFecharDetalhes.addEventListener("click", () => {
      document.getElementById("modalDetalhesCliente").style.display = "none"
    })
  }

  const btnWhatsApp = document.getElementById("btnWhatsApp")
  if (btnWhatsApp) {
    btnWhatsApp.addEventListener("click", () => {
      // This will be handled in the abrirDetalhesClienteCorretor function
    })
  }

  document.querySelectorAll(".modal-close-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const modal = e.target.closest(".modal")
      if (modal) {
        modal.classList.remove("show")
      }
    })
  })
  
  document.getElementById("searchClientesCorretor").addEventListener("input", filtrarClientesCorretor)

  const itemsPerPage = document.getElementById("itemsPerPageDisponiveis")
  if (itemsPerPage) {
    itemsPerPage.addEventListener("change", (e) => {
      itensPorPagina = parseInt(e.target.value)
      currentPageDisponiveis = 1
      localStorage.setItem("corretoresItemsPerPage", itensPorPagina.toString())
      atualizarClientesDisponiveis()
    })
  }
  
  // Sidebar toggle functionality
  const sidebar = document.querySelector(".sidebar")
  const sidebarToggleMobile = document.getElementById("sidebarToggleMobile")

  if (sidebarToggleMobile && sidebar) {
    sidebarToggleMobile.addEventListener("click", () => {
      sidebar.classList.toggle("active")
    })
  }

  // Close sidebar when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768) {
      const sidebar = document.querySelector(".sidebar")
      const sidebarToggle = document.getElementById("sidebarToggleMobile")

      if (sidebar && sidebar.classList.contains("active") &&
          !sidebar.contains(e.target) && e.target !== sidebarToggle) {
        sidebar.classList.remove("active")
      }
    }
  })

  // Fechar modal ao clicar fora
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.style.display = "none"
      e.target.classList.remove("show")
      e.target.classList.remove("active")
    }
  })
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

  clientesDisponiveisFiltrados = clientes.filter(cliente => {
    if (cliente.atribuido_a || cliente.status === 'finalizado') return false
    const matchSearch = cliente.nome.toLowerCase().includes(search)
    const matchStatus = !status || cliente.status === status
    return matchSearch && matchStatus
  })

  filtrosAtivosDisponiveis = search.length > 0 || status.length > 0

  const countEl = document.getElementById("countClientesDisponiveis")
  if (countEl) {
    countEl.textContent = clientesDisponiveisFiltrados.length
  }

  currentPageDisponiveis = 1
  atualizarClientesDisponiveis()
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

  let clienteIds = []
  let corretorId = corretorAtualSelecionado?.id

  // Check if it's a bulk assignment
  if (corretorAtualSelecionado?.clientes) {
    clienteIds = corretorAtualSelecionado.clientes.map(c => c.id)
  } else {
    // Single assignment
    let clienteId = corretorAtualSelecionado?.clienteId

    // Se não veio do objeto selecionado, tenta pegar dos selects
    if (!clienteId) {
      const selectCliente = document.getElementById("clienteAtribuir")
      clienteId = selectCliente ? selectCliente.value : null
    }

    if (clienteId) {
      clienteIds = [clienteId]
    }
  }

  // Se não veio do objeto selecionado, tenta pegar do select
  if (!corretorId) {
    const selectCorretor = document.getElementById("corretorSelect")
    corretorId = selectCorretor ? selectCorretor.value : null
  }

  console.log("[ATRIBUIR] IDs finais:", { clienteIds, corretorId })

  if (clienteIds.length === 0) {
    mostrarNotificacao("Selecione pelo menos um cliente", "aviso")
    return
  }

  if (!corretorId || corretorId === "") {
    mostrarNotificacao("Selecione um corretor", "aviso")
    return
  }

  try {
    mostrarCarregando(true) // Mostrar loading durante a requisição

    const promises = clienteIds.map(clienteId =>
      fazerRequisicao(`/api/corretores/${corretorId}/clientes/${clienteId}`, {
        method: "POST"
      })
    )

    await Promise.all(promises)

    const mensagem = clienteIds.length === 1
      ? "Cliente atribuído com sucesso!"
      : `${clienteIds.length} cliente(s) atribuído(s) com sucesso!`

    mostrarNotificacao(mensagem, "sucesso")
    document.getElementById("modalAtribuir").classList.remove("show")

    // Limpar seleções após atribuição
    clientesSelecionadosDisponiveis = []
    await carregarCorretoresEClientes()
  } catch (error) {
    console.error("Erro ao atribuir cliente:", error)
    mostrarNotificacao("Erro ao atribuir cliente: " + error.message, "erro")
  } finally {
    mostrarCarregando(false)
  }
}

async function abrirDetalhesClienteCorretor(clienteId) {
  try {
    // Find client in the loaded clients array
    const cliente = clientes.find(c => c.id === clienteId)
    if (!cliente) {
      mostrarNotificacao("Cliente não encontrado", "erro")
      return
    }

    // Populate modal fields
    document.getElementById("detailAvatar").textContent = cliente.nome.charAt(0).toUpperCase()
    document.getElementById("detailNomeHeader").textContent = cliente.nome
    document.getElementById("detailStatusHeader").textContent = formatarStatus(cliente.status)
    document.getElementById("detailStatusHeader").className = `badge badge-${cliente.status}`
    document.getElementById("detailTelefone").textContent = cliente.telefone
    document.getElementById("detailEmail").textContent = cliente.email || "-"
    document.getElementById("detailInteresse").textContent = formatarInteresse(cliente.interesse)
    document.getElementById("detailValor").textContent = cliente.valor ? `R$ ${cliente.valor}` : "-"
    document.getElementById("detailData").textContent = formatarData(cliente.data_atribuicao)
    document.getElementById("detailStatus").textContent = formatarStatus(cliente.status)
    document.getElementById("detailObservacoes").textContent = cliente.observacoes || "-"

    // Renderizar Tags
    const detailTagsContainer = document.getElementById("detailTagsContainer")
    const detailTags = document.getElementById("detailTags")
    if (detailTagsContainer && detailTags) {
      if (cliente.tags) {
        detailTagsContainer.style.display = "flex"
        detailTags.innerHTML = cliente.tags.split(',')
          .map(tag => tag.trim())
          .filter(tag => tag !== "")
          .map(tag => `<span class="tag-badge">${tag}</span>`)
          .join("")
      } else {
        detailTagsContainer.style.display = "none"
        detailTags.innerHTML = ""
      }
    }

    // Show admin-only fields if user is admin
    const isAdminOrHead = isAdminOrHeadAdmin()
    const detailCadastradoPorContainer = document.getElementById("detailCadastradoPorContainer")
    if (detailCadastradoPorContainer) {
      if (isAdminOrHead) {
        detailCadastradoPorContainer.style.display = ""
        document.getElementById("detailCadastradoPor").textContent = cliente.cadastrado_por || "-"
      } else {
        detailCadastradoPorContainer.style.display = "none"
      }
    }

    const detailAtribuidoAContainer = document.getElementById("detailAtribuidoAContainer")
    if (detailAtribuidoAContainer) {
      if (isAdminOrHead) {
        detailAtribuidoAContainer.style.display = ""
        const detailAtribuidoA = document.getElementById("detailAtribuidoA")
        detailAtribuidoA.textContent = cliente.atribuido_a_nome || "-"
        detailAtribuidoA.style.cursor = "default"
        detailAtribuidoA.style.textDecoration = "none"
        detailAtribuidoA.style.color = ""
        detailAtribuidoA.onclick = null
      } else {
        detailAtribuidoAContainer.style.display = "none"
      }
    }

    // Hide edit button for this modal (since we're in brokers page)
    const btnEditarDetalhes = document.getElementById("btnEditarDetalhes")
    if (btnEditarDetalhes) {
      btnEditarDetalhes.style.display = "none"
    }

    // Update WhatsApp button click handler
    const btnWhatsApp = document.getElementById("btnWhatsApp")
    if (btnWhatsApp && cliente.telefone) {
      btnWhatsApp.onclick = () => {
        let telefone = cliente.telefone.replace(/[^\d\s]/g, '').replace(/\s+/g, '')
        let whatsappNumber = '55' + telefone
        window.open(`https://wa.me/${whatsappNumber}`, '_blank')
      }
    }

    document.getElementById("modalDetalhesCliente").style.display = "flex"
  } catch (error) {
    console.error("Erro ao abrir detalhes do cliente:", error)
    mostrarNotificacao("Erro ao carregar detalhes do cliente: " + error.message, "erro")
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
    prioridade: "Prioridade",
    "pré-atendido": "Pré-Atendido",
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

function formatarData(data) {
  if (!data) return "-"
  const d = new Date(data + 'T12:00:00')
  return d.toLocaleDateString("pt-BR", { timeZone: 'America/Sao_Paulo' })
}

function configurarEventosBulk() {
  // Select all checkbox for available clients
  const selectAllDisponiveis = document.getElementById("selectAllClientesDisponiveis")
  if (selectAllDisponiveis) {
    selectAllDisponiveis.addEventListener("change", function() {
      const checkboxes = document.querySelectorAll(".cliente-checkbox")
      checkboxes.forEach(cb => {
        cb.checked = this.checked
        const clienteId = cb.dataset.clienteId
        if (this.checked) {
          if (!clientesSelecionadosDisponiveis.includes(clienteId)) {
            clientesSelecionadosDisponiveis.push(clienteId)
          }
        } else {
          clientesSelecionadosDisponiveis = clientesSelecionadosDisponiveis.filter(id => id !== clienteId)
        }
      })
      atualizarBotoesBulk()
    })
  }

  // Select all checkbox for broker clients
  const selectAllCorretor = document.getElementById("selectAllClientesCorretor")
  if (selectAllCorretor) {
    selectAllCorretor.addEventListener("change", function() {
      const checkboxes = document.querySelectorAll(".cliente-corretor-checkbox")
      checkboxes.forEach(cb => cb.checked = this.checked)
      atualizarBotoesBulk()
    })
  }

  // Individual checkboxes
  document.addEventListener("change", function(e) {
    if (e.target.classList.contains("cliente-checkbox")) {
      const clienteId = e.target.dataset.clienteId
      if (e.target.checked) {
        if (!clientesSelecionadosDisponiveis.includes(clienteId)) {
          clientesSelecionadosDisponiveis.push(clienteId)
        }
      } else {
        clientesSelecionadosDisponiveis = clientesSelecionadosDisponiveis.filter(id => id !== clienteId)
      }
      atualizarBotoesBulk()
    } else if (e.target.classList.contains("cliente-corretor-checkbox")) {
      atualizarBotoesBulk()
    }
  })

  // Bulk assign button
  const btnAtribuirSelecionados = document.getElementById("btnAtribuirSelecionados")
  if (btnAtribuirSelecionados) {
    btnAtribuirSelecionados.addEventListener("click", abrirModalAtribuirBulk)
  }

  // Bulk remove button
  const btnRemoverSelecionados = document.getElementById("btnRemoverSelecionados")
  if (btnRemoverSelecionados) {
    btnRemoverSelecionados.addEventListener("click", removerClientesSelecionados)
  }
}

function atualizarBotoesBulk() {
  const clientesSelecionados = clientesSelecionadosDisponiveis.length
  const btnAtribuir = document.getElementById("btnAtribuirSelecionados")
  if (btnAtribuir) {
    btnAtribuir.style.display = clientesSelecionados > 0 ? "inline-block" : "none"
  }

  const clientesCorretorSelecionados = document.querySelectorAll(".cliente-corretor-checkbox:checked")
  const btnRemover = document.getElementById("btnRemoverSelecionados")
  if (btnRemover) {
    btnRemover.style.display = clientesCorretorSelecionados.length > 0 ? "inline-block" : "none"
  }

  // Hide/show bulk-actions containers based on whether any buttons are visible
  const bulkActionsDisponiveis = document.querySelector("#clientesDisponiveisTable").closest(".content-card").querySelector(".bulk-actions")
  const bulkActionsCorretor = document.querySelector("#clientesCorretorTable").closest(".modal-body").querySelector(".bulk-actions")

  if (bulkActionsDisponiveis) {
    bulkActionsDisponiveis.style.display = clientesSelecionados > 0 ? "flex" : "none"
  }

  if (bulkActionsCorretor) {
    bulkActionsCorretor.style.display = clientesCorretorSelecionados.length > 0 ? "flex" : "none"
  }
}



function abrirModalAtribuirBulk() {
  const clientesSelecionados = clientesSelecionadosDisponiveis.map(id => {
    const cliente = clientes.find(c => c.id.toString() === id)
    return { id, nome: cliente?.nome || 'Desconhecido' }
  }).filter(c => c.id)

  if (clientesSelecionados.length === 0) {
    mostrarNotificacao("Selecione pelo menos um cliente", "aviso")
    return
  }

  corretorAtualSelecionado = { clientes: clientesSelecionados }

  document.getElementById("modalAtribuir").querySelector("h2").textContent = "Atribuir Clientes ao Corretor"

  document.getElementById("groupCorretorNome").style.display = "none"
  document.getElementById("groupCorretorSelect").style.display = "flex"
  document.getElementById("groupClienteNome").style.display = "none"
  document.getElementById("groupClienteSelect").style.display = "none"
  document.getElementById("groupClientesMultiplos").style.display = "flex"

  // Ajustar validação dos campos
  document.getElementById("corretorSelect").required = true
  document.getElementById("clienteAtribuir").required = false

  document.getElementById("clientesSelecionadosCount").value = `${clientesSelecionados.length} cliente(s) selecionado(s)`

  const selectCorretor = document.getElementById("corretorSelect")
  selectCorretor.innerHTML = `<option value="">-- Selecione um corretor --</option>`
  selectCorretor.disabled = false

  // Only show active brokers (status = 'ativo')
  const corretoresAtivos = corretores.filter(corretor => corretor.status === 'ativo')
  corretoresAtivos.forEach(corretor => {
    const option = document.createElement("option")
    option.value = corretor.id
    option.textContent = corretor.nome
    selectCorretor.appendChild(option)
  })

  document.getElementById("modalAtribuir").classList.add("show")
}

async function removerClientesSelecionados() {
  const clientesSelecionados = Array.from(document.querySelectorAll(".cliente-corretor-checkbox:checked")).map(cb => ({
    id: cb.dataset.clienteId,
    nome: cb.closest("tr").querySelector("td:nth-child(2)").textContent
  }))

  if (clientesSelecionados.length === 0) {
    mostrarNotificacao("Selecione pelo menos um cliente", "aviso")
    return
  }

  const corretorId = corretorAtualSelecionado.id
  const corretorNome = corretorAtualSelecionado.nome

  document.getElementById("nomeClienteRemover").textContent = `${clientesSelecionados.length} cliente(s) selecionado(s)`
  document.getElementById("modalConfirmarRemocao").classList.add("show")

  const btnConfirmar = document.getElementById("btnConfirmarRemocao")
  const btnCancelar = document.getElementById("btnCancelarRemocao")
  const closeBtn = document.getElementById("closeConfirmarRemocao")

  const confirmarRemocao = async () => {
    try {
      mostrarCarregando(true)
      const promises = clientesSelecionados.map(cliente =>
        fazerRequisicao(`/api/corretores/${corretorId}/clientes/${cliente.id}`, {
          method: "DELETE"
        })
      )
      await Promise.all(promises)

      mostrarNotificacao(`${clientesSelecionados.length} cliente(s) removido(s) com sucesso!`, "sucesso")
      document.getElementById("modalConfirmarRemocao").classList.remove("show")

      await carregarCorretoresEClientes()
      await abrirClientesCorretor(corretorId, corretorNome)
    } catch (error) {
      console.error("Erro ao remover clientes:", error)
      mostrarNotificacao("Erro ao remover clientes: " + error.message, "erro")
      document.getElementById("modalConfirmarRemocao").classList.remove("show")
    } finally {
      mostrarCarregando(false)
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
  btnConfirmar.addEventListener("click", confirmarRemocao)
