// ===== DADOS =====
let clientes = JSON.parse(localStorage.getItem("clientes")) || [
  {
    id: 1,
    nome: "João Silva",
    telefone: "(11) 98765-4321",
    email: "joao.silva@email.com",
    interesse: "comprar",
    valor: "R$ 450.000,00",
    status: "quente",
    observacoes: "Interessado em apartamento de 3 quartos",
    data: "2024-01-15",
  },
  {
    id: 2,
    nome: "Maria Santos",
    telefone: "(11) 91234-5678",
    email: "maria.santos@email.com",
    interesse: "alugar",
    valor: "R$ 2.500,00",
    status: "novo",
    observacoes: "Procura imóvel para alugar na zona sul",
    data: "2024-01-20",
  },
  {
    id: 3,
    nome: "Carlos Oliveira",
    telefone: "(11) 99876-5432",
    email: "carlos.oliveira@email.com",
    interesse: "vender",
    valor: "R$ 850.000,00",
    status: "em-atendimento",
    observacoes: "Casa de 4 quartos para venda",
    data: "2024-01-18",
  },
]

let editandoClienteId = null
let paginaAtual = 1
const itensPorPagina = 10
let clientesSelecionados = []
let excluindoClienteId = null
let excluindoEmMassa = false

// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  carregarDados()
  configurarEventos()
  atualizarTabela()
  atualizarEstatisticas()
})

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

    if (userNameElement) {
      userNameElement.textContent = usuarioLogado.nome || usuarioLogado.username
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

function configurarEventos() {
  // Sidebar toggle
  const sidebarToggle = document.getElementById("sidebarToggleMobile")
  const sidebarToggleMobile = document.getElementById("sidebarToggle")
  const sidebar = document.querySelector(".sidebar")

  sidebarToggle?.addEventListener("click", () => {
    sidebar.classList.toggle("active")
  })

  sidebarToggleMobile?.addEventListener("click", () => {
    sidebar.classList.remove("active")
  })

  // Modal
  const btnNovoCliente = document.getElementById("btnNovoCliente")
  const modal = document.getElementById("modalCliente")
  const closeModal = document.getElementById("closeModal")
  const closeBtns = document.querySelectorAll(".modal-close-btn")
  const formCliente = document.getElementById("formCliente")

  btnNovoCliente.addEventListener("click", abrirModalNovo)
  closeModal.addEventListener("click", fecharModal)
  closeBtns.forEach((btn) => btn.addEventListener("click", fecharModal))

  modal.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal()
  })

  const modalDetalhes = document.getElementById("modalDetalhesCliente")
  const closeDetailsModal = document.getElementById("closeDetailsModal")
  const btnFecharDetalhes = document.getElementById("btnFecharDetalhes")
  const btnEditarDetalhes = document.getElementById("btnEditarDetalhes")

  closeDetailsModal.addEventListener("click", fecharModalDetalhes)
  btnFecharDetalhes.addEventListener("click", fecharModalDetalhes)

  btnEditarDetalhes.addEventListener("click", () => {
    const clienteId = btnEditarDetalhes.dataset.clienteId
    if (clienteId) {
      fecharModalDetalhes()
      abrirModalEditar(Number.parseInt(clienteId))
    }
  })

  modalDetalhes.addEventListener("click", (e) => {
    if (e.target === modalDetalhes) fecharModalDetalhes()
  })

  // Confirmation modal events
  const modalConfirmacao = document.getElementById("modalConfirmacao")
  const closeConfirmacao = document.getElementById("closeConfirmacao")
  const btnCancelarExclusao = document.getElementById("btnCancelarExclusao")
  const btnConfirmarExclusao = document.getElementById("btnConfirmarExclusao")

  closeConfirmacao.addEventListener("click", fecharModalConfirmacao)
  btnCancelarExclusao.addEventListener("click", fecharModalConfirmacao)
  btnConfirmarExclusao.addEventListener("click", confirmarExclusao)

  modalConfirmacao.addEventListener("click", (e) => {
    if (e.target === modalConfirmacao) fecharModalConfirmacao()
  })

  // Select all checkbox event
  document.getElementById("selectAll").addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".checkbox-cliente")
    checkboxes.forEach((checkbox) => {
      checkbox.checked = e.target.checked
      const clienteId = Number.parseInt(checkbox.dataset.clienteId)
      if (e.target.checked) {
        if (!clientesSelecionados.includes(clienteId)) {
          clientesSelecionados.push(clienteId)
        }
      } else {
        clientesSelecionados = clientesSelecionados.filter((id) => id !== clienteId)
      }
      const row = checkbox.closest("tr")
      if (row) {
        row.classList.toggle("selected", e.target.checked)
      }
    })
    atualizarBulkActions()
  })

  // Bulk delete button event
  document.getElementById("btnExcluirSelecionados").addEventListener("click", () => {
    if (clientesSelecionados.length > 0) {
      abrirModalConfirmacao(null, true)
    }
  })

  // Form submit
  formCliente.addEventListener("submit", salvarCliente)

  // Filtros
  document.getElementById("searchClientes").addEventListener("input", filtrarClientes)
  document.getElementById("filterStatus").addEventListener("change", filtrarClientes)
  document.getElementById("filterInteresse").addEventListener("change", filtrarClientes)

  // Paginação
  document.getElementById("prevPage").addEventListener("click", () => {
    if (paginaAtual > 1) {
      paginaAtual--
      atualizarTabela()
    }
  })

  document.getElementById("nextPage").addEventListener("click", () => {
    const clientesFiltrados = obterClientesFiltrados()
    const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina)
    if (paginaAtual < totalPaginas) {
      paginaAtual++
      atualizarTabela()
    }
  })

  // Logout
  document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
    e.preventDefault()
    if (confirm("Deseja realmente sair?")) {
      window.location.href = "index.html"
    }
  })

  // Formatação de valor
  document.getElementById("clienteValor").addEventListener("input", (e) => {
    let valor = e.target.value.replace(/\D/g, "")
    if (valor) {
      valor = (Number.parseInt(valor) / 100).toFixed(2)
      e.target.value = "R$ " + valor.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    }
  })
}

// ===== MODAL =====
function abrirModalNovo() {
  editandoClienteId = null
  document.getElementById("modalTitle").textContent = "Novo Cliente"
  document.getElementById("formCliente").reset()
  document.getElementById("modalCliente").classList.add("show")
}

function abrirModalEditar(id) {
  editandoClienteId = id
  const cliente = clientes.find((c) => c.id === id)

  if (cliente) {
    document.getElementById("modalTitle").textContent = "Editar Cliente"
    document.getElementById("clienteNome").value = cliente.nome
    document.getElementById("clienteTelefone").value = cliente.telefone
    document.getElementById("clienteEmail").value = cliente.email || ""
    document.getElementById("clienteInteresse").value = cliente.interesse
    document.getElementById("clienteValor").value = cliente.valor || ""
    document.getElementById("clienteStatus").value = cliente.status
    document.getElementById("clienteObservacoes").value = cliente.observacoes || ""
    document.getElementById("modalCliente").classList.add("show")
  }
}

function fecharModal() {
  document.getElementById("modalCliente").classList.remove("show")
  document.getElementById("formCliente").reset()
  editandoClienteId = null
}

function abrirModalConfirmacao(clienteId = null, emMassa = false) {
  excluindoClienteId = clienteId
  excluindoEmMassa = emMassa

  const messageElement = document.getElementById("confirmationMessage")

  if (emMassa) {
    const qtd = clientesSelecionados.length
    messageElement.textContent = `Tem certeza que deseja excluir ${qtd} cliente${qtd > 1 ? "s" : ""}?`
  } else {
    messageElement.textContent = "Tem certeza que deseja excluir este cliente?"
  }

  document.getElementById("modalConfirmacao").classList.add("show")
}

function fecharModalConfirmacao() {
  document.getElementById("modalConfirmacao").classList.remove("show")
  excluindoClienteId = null
  excluindoEmMassa = false
}

function confirmarExclusao() {
  if (excluindoEmMassa) {
    excluirClientesSelecionados()
  } else if (excluindoClienteId) {
    executarExclusao(excluindoClienteId)
  }
  fecharModalConfirmacao()
}

// ===== CRUD =====
function salvarCliente(e) {
  e.preventDefault()

  const cliente = {
    id: editandoClienteId || Date.now(),
    nome: document.getElementById("clienteNome").value,
    telefone: document.getElementById("clienteTelefone").value,
    email: document.getElementById("clienteEmail").value,
    interesse: document.getElementById("clienteInteresse").value,
    valor: document.getElementById("clienteValor").value,
    status: document.getElementById("clienteStatus").value,
    observacoes: document.getElementById("clienteObservacoes").value,
    data: editandoClienteId
      ? clientes.find((c) => c.id === editandoClienteId).data
      : new Date().toISOString().split("T")[0],
  }

  if (editandoClienteId) {
    const index = clientes.findIndex((c) => c.id === editandoClienteId)
    clientes[index] = cliente
    mostrarToast("Cliente atualizado com sucesso!", "success")
  } else {
    clientes.push(cliente)
    mostrarToast("Cliente cadastrado com sucesso!", "success")
  }

  salvarDados()
  fecharModal()
  atualizarTabela()
  atualizarEstatisticas()
}

function excluirCliente(id) {
  abrirModalConfirmacao(id, false)
}

function executarExclusao(id) {
  clientes = clientes.filter((c) => c.id !== id)
  clientesSelecionados = clientesSelecionados.filter((cId) => cId !== id)
  salvarDados()
  atualizarTabela()
  atualizarEstatisticas()
  atualizarBulkActions()
  mostrarToast("Cliente excluído com sucesso!", "success")
}

function excluirClientesSelecionados() {
  const qtd = clientesSelecionados.length
  clientes = clientes.filter((c) => !clientesSelecionados.includes(c.id))
  clientesSelecionados = []
  salvarDados()
  atualizarTabela()
  atualizarEstatisticas()
  atualizarBulkActions()
  mostrarToast(`${qtd} cliente${qtd > 1 ? "s excluídos" : " excluído"} com sucesso!`, "success")
}

// ===== TABELA =====
function atualizarTabela() {
  const tbody = document.getElementById("clientesTable")
  const clientesFiltrados = obterClientesFiltrados()

  // Paginação
  const inicio = (paginaAtual - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const clientesPagina = clientesFiltrados.slice(inicio, fim)

  if (clientesPagina.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum cliente encontrado</td></tr>'
  } else {
    tbody.innerHTML = clientesPagina
      .map(
        (cliente) => `
      <tr style="cursor: pointer;" class="${clientesSelecionados.includes(cliente.id) ? "selected" : ""}">
        <td onclick="event.stopPropagation()">
          <input type="checkbox" 
                 class="checkbox-input checkbox-cliente" 
                 data-cliente-id="${cliente.id}"
                 ${clientesSelecionados.includes(cliente.id) ? "checked" : ""}
                 onchange="toggleClienteSelecao(${cliente.id}, this.checked)">
        </td>
        <td onclick="abrirModalDetalhes(${cliente.id})">${cliente.nome}</td>
        <td onclick="abrirModalDetalhes(${cliente.id})">${cliente.telefone}</td>
        <td onclick="abrirModalDetalhes(${cliente.id})">${formatarInteresse(cliente.interesse)}</td>
        <td onclick="abrirModalDetalhes(${cliente.id})"><span class="badge badge-${cliente.status}">${formatarStatus(cliente.status)}</span></td>
        <td onclick="abrirModalDetalhes(${cliente.id})">${cliente.email || "-"}</td>
        <td onclick="abrirModalDetalhes(${cliente.id})">${formatarData(cliente.data)}</td>
        
        <td onclick="event.stopPropagation()">
          <button class="btn-action btn-edit" onclick="abrirModalEditar(${cliente.id})">
            <i class="fas fa-edit"></i> Editar
          </button>
          <button class="btn-action btn-delete" onclick="excluirCliente(${cliente.id})">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </td>
      </tr>
    `,
      )
      .join("")
  }

  atualizarPaginacao(clientesFiltrados.length)
  atualizarBulkActions()
}

function atualizarPaginacao(totalItens) {
  const totalPaginas = Math.ceil(totalItens / itensPorPagina)
  document.getElementById("pageInfo").textContent = `Página ${paginaAtual} de ${totalPaginas || 1}`

  document.getElementById("prevPage").disabled = paginaAtual === 1
  document.getElementById("nextPage").disabled = paginaAtual >= totalPaginas
}

// ===== FILTROS =====
function obterClientesFiltrados() {
  const busca = document.getElementById("searchClientes").value.toLowerCase()
  const statusFiltro = document.getElementById("filterStatus").value
  const interesseFiltro = document.getElementById("filterInteresse").value

  return clientes.filter((cliente) => {
    const matchBusca =
      !busca ||
      cliente.nome.toLowerCase().includes(busca) ||
      cliente.telefone.toLowerCase().includes(busca) ||
      (cliente.email && cliente.email.toLowerCase().includes(busca))

    const matchStatus = !statusFiltro || cliente.status === statusFiltro
    const matchInteresse = !interesseFiltro || cliente.interesse === interesseFiltro

    return matchBusca && matchStatus && matchInteresse
  })
}

function filtrarClientes() {
  paginaAtual = 1
  clientesSelecionados = []
  document.getElementById("selectAll").checked = false
  atualizarTabela()
}

// ===== ESTATÍSTICAS =====
function atualizarEstatisticas() {
  document.getElementById("totalClientes").textContent = clientes.length
  document.getElementById("clientesNovos").textContent = clientes.filter((c) => c.status === "novo").length
  document.getElementById("clientesQuentes").textContent = clientes.filter((c) => c.status === "quente").length
  document.getElementById("clientesFrios").textContent = clientes.filter((c) => c.status === "frio").length
}

// ===== UTILITÁRIOS =====
function formatarStatus(status) {
  const statusMap = {
    novo: "Novo",
    quente: "Quente",
    frio: "Frio",
    "em-atendimento": "Em Atendimento",
    finalizado: "Finalizado",
  }
  return statusMap[status] || status
}

function formatarInteresse(interesse) {
  const interesseMap = {
    alugar: "Alugar",
    comprar: "Comprar",
    vender: "Vender",
  }
  return interesseMap[interesse] || interesse
}

function formatarData(data) {
  const [ano, mes, dia] = data.split("-")
  return `${dia}/${mes}/${ano}`
}

function mostrarToast(mensagem, tipo = "success") {
  const toast = document.getElementById("toastNotification")
  toast.textContent = mensagem
  toast.className = `toast toast-${tipo} show`

  setTimeout(() => {
    toast.classList.remove("show")
  }, 3000)
}

function salvarDados() {
  localStorage.setItem("clientes", JSON.stringify(clientes))
}

function carregarDados() {
  const storedClientes = localStorage.getItem("clientes")
  if (storedClientes) {
    clientes = JSON.parse(storedClientes)
  }
}

function abrirModalDetalhes(id) {
  const cliente = clientes.find((c) => c.id === id)

  if (cliente) {
    document.getElementById("detailNome").textContent = cliente.nome
    document.getElementById("detailTelefone").textContent = cliente.telefone
    document.getElementById("detailEmail").textContent = cliente.email || "Não informado"
    document.getElementById("detailInteresse").textContent = formatarInteresse(cliente.interesse)
    document.getElementById("detailValor").textContent = cliente.valor || "Não informado"

    const statusElement = document.getElementById("detailStatus")
    const statusText = formatarStatus(cliente.status)
    statusElement.innerHTML = `<span class="badge badge-${cliente.status}">${statusText}</span>`

    document.getElementById("detailData").textContent = formatarData(cliente.data)
    document.getElementById("detailObservacoes").textContent = cliente.observacoes || "Sem observações"

    document.getElementById("btnEditarDetalhes").dataset.clienteId = id

    document.getElementById("modalDetalhesCliente").classList.add("show")
  }
}

function fecharModalDetalhes() {
  document.getElementById("modalDetalhesCliente").classList.remove("show")
}

function toggleClienteSelecao(clienteId, checked) {
  if (checked) {
    if (!clientesSelecionados.includes(clienteId)) {
      clientesSelecionados.push(clienteId)
    }
  } else {
    clientesSelecionados = clientesSelecionados.filter((id) => id !== clienteId)
  }

  const row = document.querySelector(`input[data-cliente-id="${clienteId}"]`).closest("tr")
  if (row) {
    row.classList.toggle("selected", checked)
  }

  atualizarBulkActions()
}

function atualizarBulkActions() {
  const bulkActions = document.getElementById("bulkActions")
  const selectedCount = document.getElementById("selectedCount")

  if (clientesSelecionados.length > 0) {
    bulkActions.style.display = "flex"
    selectedCount.textContent = `${clientesSelecionados.length} cliente${
      clientesSelecionados.length > 1 ? "s selecionado" : " selecionado"
    }${clientesSelecionados.length > 1 ? "s" : ""}`
  } else {
    bulkActions.style.display = "none"
  }

  // Update select all checkbox
  const checkboxes = document.querySelectorAll(".checkbox-cliente")
  const selectAll = document.getElementById("selectAll")
  if (checkboxes.length > 0) {
    selectAll.checked = checkboxes.length === clientesSelecionados.length
  } else {
    selectAll.checked = false
  }
}
