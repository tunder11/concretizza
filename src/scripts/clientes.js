// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  carregarClientes()
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
      const cargo = usuarioLogado.cargo || usuarioLogado.role || "User"
      userRoleElement.textContent = cargo.charAt(0).toUpperCase() + cargo.slice(1)
    }

    const adminSection = document.getElementById("adminSection")
    if (adminSection) {
      if (usuarioLogado.cargo === "Admin") {
        adminSection.style.display = "block"
      } else {
        adminSection.style.display = "none"
      }
    }
  }
}

// ===== CLIENTES =====
let currentPage = 1
let clientes = []
let clientesFiltrados = []
const itensPorPagina = 10
let clienteEmEdicao = null
let clienteParaVer = null // Adicionando clienteParaVer para armazenar o cliente selecionado

function carregarClientes() {
  clientes = getClientes()
  clientesFiltrados = [...clientes]
  atualizarTabela()
  atualizarEstatisticas()
}

function getClientes() {
  return JSON.parse(localStorage.getItem("clientes")) || []
}

function salvarClientes() {
  localStorage.setItem("clientes", JSON.stringify(clientes))
}

function atualizarEstatisticas() {
  const totalClientes = clientes.length
  const clientesNovos = clientes.filter((c) => c.status === "novo").length
  const clientesQuentes = clientes.filter((c) => c.status === "quente").length
  const clientesFrios = clientes.filter((c) => c.status === "frio").length

  document.getElementById("totalClientes").textContent = totalClientes
  document.getElementById("clientesNovos").textContent = clientesNovos
  document.getElementById("clientesQuentes").textContent = clientesQuentes
  document.getElementById("clientesFrios").textContent = clientesFrios
}

function atualizarTabela() {
  const tbody = document.getElementById("clientesTable")
  const inicio = (currentPage - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const clientesPagina = clientesFiltrados.slice(inicio, fim)

  if (clientesPagina.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum cliente encontrado</td></tr>'
  } else {
    tbody.innerHTML = clientesPagina
      .map(
        (cliente) => `
      <tr onclick="abrirDetalhesCliente(${cliente.id})" style="cursor: pointer;">
        <!-- Adicionando coluna de checkbox para seleção múltipla -->
        <td onclick="event.stopPropagation();">
          <input type="checkbox" class="checkbox-input cliente-checkbox" data-id="${cliente.id}">
        </td>
        <td>${cliente.nome}</td>
        <td>${cliente.telefone}</td>
        <td>${formatarInteresse(cliente.interesse)}</td>
        <td><span class="badge badge-${cliente.status}">${formatarStatus(cliente.status)}</span></td>
        <td>${cliente.email || "-"}</td>
        <td>${formatarData(cliente.data)}</td>
        <td onclick="event.stopPropagation();">
          <!-- Corrigindo classe do botão editar para btn-edit -->
          <button class="btn-action btn-edit" onclick="editarCliente(${cliente.id})" title="Editar">
            <i class="fas fa-edit"></i> Editar
          </button>
          <!-- Corrigindo classe do botão deletar para btn-delete e adicionando texto -->
          <button class="btn-action btn-delete" onclick="excluirCliente(${cliente.id})" title="Excluir">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </td>
      </tr>
    `,
      )
      .join("")
  }

  atualizarPaginacao()
  atualizarCheckboxes()
}

function atualizarPaginacao() {
  const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina)
  document.getElementById("pageInfo").textContent = `Página ${currentPage} de ${totalPaginas}`
  document.getElementById("prevPage").disabled = currentPage === 1
  document.getElementById("nextPage").disabled = currentPage === totalPaginas
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

  // Modal novo cliente
  const btnNovoCliente = document.getElementById("btnNovoCliente")
  const modalCliente = document.getElementById("modalCliente")
  const closeModal = document.getElementById("closeModal")
  const formCliente = document.getElementById("formCliente")

  if (btnNovoCliente) {
    btnNovoCliente.addEventListener("click", () => {
      clienteEmEdicao = null
      document.getElementById("modalTitle").textContent = "Novo Cliente"
      formCliente.reset()
      modalCliente.style.display = "flex"
    })
  }

  if (closeModal) {
    closeModal.addEventListener("click", () => {
      modalCliente.style.display = "none"
    })
  }

  const modalCloseBtns = document.querySelectorAll(".modal-close-btn")
  modalCloseBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modalCliente.style.display = "none"
    })
  })

  if (formCliente) {
    formCliente.addEventListener("submit", (e) => {
      e.preventDefault()
      salvarCliente()
    })
  }

  // Filtros
  const searchClientes = document.getElementById("searchClientes")
  const filterStatus = document.getElementById("filterStatus")
  const filterInteresse = document.getElementById("filterInteresse")

  if (searchClientes) {
    searchClientes.addEventListener("input", filtrarClientes)
  }
  if (filterStatus) {
    filterStatus.addEventListener("change", filtrarClientes)
  }
  if (filterInteresse) {
    filterInteresse.addEventListener("change", filtrarClientes)
  }

  // Paginação
  const prevPage = document.getElementById("prevPage")
  const nextPage = document.getElementById("nextPage")

  if (prevPage) {
    prevPage.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--
        atualizarTabela()
      }
    })
  }

  if (nextPage) {
    nextPage.addEventListener("click", () => {
      const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina)
      if (currentPage < totalPaginas) {
        currentPage++
        atualizarTabela()
      }
    })
  }

  // Modal detalhes cliente
  const closeDetailsModal = document.getElementById("closeDetailsModal")
  const btnFecharDetalhes = document.getElementById("btnFecharDetalhes")
  const btnEditarDetalhes = document.getElementById("btnEditarDetalhes")

  if (closeDetailsModal) {
    closeDetailsModal.addEventListener("click", () => {
      document.getElementById("modalDetalhesCliente").style.display = "none"
    })
  }

  if (btnFecharDetalhes) {
    btnFecharDetalhes.addEventListener("click", () => {
      document.getElementById("modalDetalhesCliente").style.display = "none"
    })
  }

  if (btnEditarDetalhes) {
    btnEditarDetalhes.addEventListener("click", () => {
      document.getElementById("modalDetalhesCliente").style.display = "none"
      if (clienteParaVer) {
        editarCliente(clienteParaVer.id)
      }
    })
  }

  const selectAll = document.getElementById("selectAll")
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      const checkboxes = document.querySelectorAll(".cliente-checkbox")
      checkboxes.forEach((checkbox) => {
        checkbox.checked = selectAll.checked
      })
      atualizarContadorSelecionados()
    })
  }

  const btnExcluirSelecionados = document.getElementById("btnExcluirSelecionados")
  if (btnExcluirSelecionados) {
    btnExcluirSelecionados.addEventListener("click", () => {
      const selecionados = document.querySelectorAll(".cliente-checkbox:checked")
      if (selecionados.length === 0) {
        mostrarNotificacao("Selecione pelo menos um cliente")
        return
      }

      if (
        confirm(`Tem certeza que deseja excluir ${selecionados.length} cliente(s)? Esta ação não pode ser desfeita.`)
      ) {
        const ids = Array.from(selecionados).map((cb) => Number.parseInt(cb.dataset.id))
        clientes = clientes.filter((c) => !ids.includes(c.id))
        salvarClientes()
        carregarClientes()
        mostrarNotificacao(`${selecionados.length} cliente(s) excluído(s) com sucesso!`)
      }
    })
  }
}

function filtrarClientes() {
  const searchValue = (document.getElementById("searchClientes").value || "").toLowerCase()
  const statusValue = document.getElementById("filterStatus").value || ""
  const interesseValue = document.getElementById("filterInteresse").value || ""

  clientesFiltrados = clientes.filter((cliente) => {
    const nomeMatch = cliente.nome.toLowerCase().includes(searchValue)
    const telefoneMatch = cliente.telefone.includes(searchValue)
    const emailMatch = (cliente.email || "").toLowerCase().includes(searchValue)
    const statusMatch = statusValue === "" || cliente.status === statusValue
    const interesseMatch = interesseValue === "" || cliente.interesse === interesseValue

    return (nomeMatch || telefoneMatch || emailMatch) && statusMatch && interesseMatch
  })

  currentPage = 1
  atualizarTabela()
}

function salvarCliente() {
  const nome = document.getElementById("clienteNome").value
  const telefone = document.getElementById("clienteTelefone").value
  const email = document.getElementById("clienteEmail").value
  const interesse = document.getElementById("clienteInteresse").value
  const valor = document.getElementById("clienteValor").value
  const status = document.getElementById("clienteStatus").value
  const observacoes = document.getElementById("clienteObservacoes").value

  if (clienteEmEdicao) {
    const cliente = clientes.find((c) => c.id === clienteEmEdicao)
    if (cliente) {
      cliente.nome = nome
      cliente.telefone = telefone
      cliente.email = email
      cliente.interesse = interesse
      cliente.valor = valor
      cliente.status = status
      cliente.observacoes = observacoes
    }
  } else {
    const novoCliente = {
      id: Date.now(),
      nome,
      telefone,
      email,
      interesse,
      valor,
      status,
      observacoes,
      data: new Date().toISOString().split("T")[0],
    }
    clientes.push(novoCliente)
  }

  salvarClientes()
  carregarClientes()
  document.getElementById("modalCliente").style.display = "none"
  mostrarNotificacao("Cliente salvo com sucesso!")
}

function editarCliente(id) {
  const cliente = clientes.find((c) => c.id === id)
  if (cliente) {
    clienteEmEdicao = id
    document.getElementById("modalTitle").textContent = "Editar Cliente"
    document.getElementById("clienteNome").value = cliente.nome
    document.getElementById("clienteTelefone").value = cliente.telefone
    document.getElementById("clienteEmail").value = cliente.email || ""
    document.getElementById("clienteInteresse").value = cliente.interesse
    document.getElementById("clienteValor").value = cliente.valor || ""
    document.getElementById("clienteStatus").value = cliente.status
    document.getElementById("clienteObservacoes").value = cliente.observacoes || ""

    document.getElementById("modalCliente").style.display = "flex"
  }
}

function excluirCliente(id) {
  const cliente = clientes.find((c) => c.id === id)
  if (cliente) {
    document.getElementById("confirmationMessage").textContent =
      `Tem certeza que deseja excluir o cliente "${cliente.nome}"?`

    const modal = document.getElementById("modalConfirmacao")
    modal.style.display = "flex"

    const btnConfirmar = document.getElementById("btnConfirmarExclusao")
    const btnCancelar = document.getElementById("btnCancelarExclusao")
    const closeConfirmacao = document.getElementById("closeConfirmacao")

    // Criar nova função para confirmar exclusão
    const confirmarExclusao = () => {
      clientes = clientes.filter((c) => c.id !== id)
      salvarClientes()
      carregarClientes()
      modal.style.display = "none"
      mostrarNotificacao("Cliente excluído com sucesso!")

      // Remover listeners após confirmar
      btnConfirmar.removeEventListener("click", confirmarExclusao)
      btnCancelar.removeEventListener("click", cancelarExclusao)
      closeConfirmacao.removeEventListener("click", cancelarExclusao)
    }

    const cancelarExclusao = () => {
      modal.style.display = "none"
      btnConfirmar.removeEventListener("click", confirmarExclusao)
      btnCancelar.removeEventListener("click", cancelarExclusao)
      closeConfirmacao.removeEventListener("click", cancelarExclusao)
    }

    btnConfirmar.addEventListener("click", confirmarExclusao)
    btnCancelar.addEventListener("click", cancelarExclusao)
    closeConfirmacao.addEventListener("click", cancelarExclusao)
  }
}

function mostrarNotificacao(mensagem) {
  const toast = document.getElementById("toastNotification")
  toast.textContent = mensagem
  toast.style.display = "block"
  toast.style.opacity = "1"

  setTimeout(() => {
    toast.style.display = "none"
  }, 3000)
}

// ===== FUNÇÕES AUXILIARES =====
function formatarData(data) {
  const date = new Date(data)
  return date.toLocaleDateString("pt-BR")
}

function formatarInteresse(interesse) {
  const interesses = {
    alugar: "Alugar",
    comprar: "Comprar",
    vender: "Vender",
  }
  return interesses[interesse] || interesse
}

function formatarStatus(status) {
  const status_map = {
    novo: "Novo",
    "em-atendimento": "Em Atendimento",
    quente: "Quente",
    frio: "Frio",
    finalizado: "Finalizado",
  }
  return status_map[status] || status
}

// ===== FUNÇÕES DE DETALHES =====
function abrirDetalhesCliente(id) {
  const cliente = clientes.find((c) => c.id === id)
  if (cliente) {
    clienteParaVer = cliente
    const inicialNome = cliente.nome.charAt(0).toUpperCase()

    document.getElementById("detailAvatar").textContent = inicialNome
    document.getElementById("detailNomeHeader").textContent = cliente.nome
    document.getElementById("detailStatusHeader").textContent = formatarStatus(cliente.status)
    document.getElementById("detailStatusHeader").className = `badge badge-${cliente.status}`
    document.getElementById("detailTelefone").textContent = cliente.telefone
    document.getElementById("detailEmail").textContent = cliente.email || "-"
    document.getElementById("detailInteresse").textContent = formatarInteresse(cliente.interesse)
    document.getElementById("detailValor").textContent = cliente.valor ? `R$ ${cliente.valor}` : "-"
    document.getElementById("detailData").textContent = formatarData(cliente.data)
    document.getElementById("detailStatus").textContent = formatarStatus(cliente.status)
    document.getElementById("detailObservacoes").textContent = cliente.observacoes || "-"

    document.getElementById("modalDetalhesCliente").style.display = "flex"
  }
}

function atualizarCheckboxes() {
  const checkboxes = document.querySelectorAll(".cliente-checkbox")
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", atualizarContadorSelecionados)
  })
}

function atualizarContadorSelecionados() {
  const selecionados = document.querySelectorAll(".cliente-checkbox:checked").length
  const bulkActions = document.getElementById("bulkActions")
  const selectedCount = document.getElementById("selectedCount")

  if (selecionados > 0) {
    bulkActions.style.display = "flex"
    selectedCount.textContent = `${selecionados} cliente(s) selecionado(s)`
  } else {
    bulkActions.style.display = "none"
  }

  const selectAll = document.getElementById("selectAll")
  const totalCheckboxes = document.querySelectorAll(".cliente-checkbox").length
  if (selectAll) {
    selectAll.checked = selecionados === totalCheckboxes && totalCheckboxes > 0
  }
}


