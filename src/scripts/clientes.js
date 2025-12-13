document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  carregarClientes()
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

let currentPage = 1
let clientes = []
let clientesFiltrados = []
const itensPorPagina = 10
let clienteEmEdicao = null
let clienteParaVer = null
let clientesSelecionados = []

async function carregarClientes() {
  try {
    mostrarCarregando(true)
    clientes = await obterClientes()
    clientesFiltrados = [...clientes]
    currentPage = 1
    atualizarTabela()
    atualizarEstatisticas()
  } catch (error) {
    console.error("Erro ao carregar clientes:", error)
    mostrarNotificacao("Erro ao carregar clientes: " + error.message, "erro")
  } finally {
    mostrarCarregando(false)
  }
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

function atualizarPaginacao() {
  const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina)
  document.getElementById("pageInfo").textContent = `Página ${currentPage} de ${totalPaginas}`
  document.getElementById("prevPage").disabled = currentPage === 1
  document.getElementById("nextPage").disabled = currentPage === totalPaginas
}

function aplicarPermissoes() {
  const usuario = obterUsuarioLogado()
  if (!usuario) return

  const btnNovoCliente = document.getElementById("btnNovoCliente")
  const podeEditar = obterPermissao(usuario, "clientes", "update")
  const podeCriar = obterPermissao(usuario, "clientes", "create")
  const podeDeletar = obterPermissao(usuario, "clientes", "delete")
  const podeVer = obterPermissao(usuario, "clientes", "read")

  if (!podeVer) {
    window.location.href = "/"
    return
  }

  if (btnNovoCliente) {
    btnNovoCliente.style.display = podeCriar ? "flex" : "none"
  }

  document.getElementById("bulkActions").style.display = "none"
  if (!podeDeletar) {
    const btnExcluirSelecionados = document.getElementById("btnExcluirSelecionados")
    if (btnExcluirSelecionados) {
      btnExcluirSelecionados.style.display = "none"
    }
  }
}

function atualizarTabela() {
  const tbody = document.getElementById("clientesTable")
  const usuarioLogado = obterUsuarioLogado()
  const podeEditar = obterPermissao(usuarioLogado, "clientes", "update")
  const podeDeletar = obterPermissao(usuarioLogado, "clientes", "delete")

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
          ${podeEditar ? `<button class="btn-action btn-edit" onclick="editarCliente(${cliente.id})" title="Editar">
            <i class="fas fa-edit"></i> Editar
          </button>` : ""}
          ${podeDeletar ? `<button class="btn-action btn-delete" onclick="excluirClienteConfirm(${cliente.id})" title="Excluir">
            <i class="fas fa-trash"></i> Excluir
          </button>` : ""}
        </td>
      </tr>
    `
      )
      .join("")
  }

  atualizarPaginacao()
  atualizarCheckboxes()
  adicionarListenersCheckboxes()
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

  const selectAll = document.getElementById("selectAll")
  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      const checkboxes = document.querySelectorAll(".cliente-checkbox")
      checkboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked
      })
      atualizarCheckboxes()
    })
  }

  const btnExcluirSelecionados = document.getElementById("btnExcluirSelecionados")
  if (btnExcluirSelecionados) {
    btnExcluirSelecionados.addEventListener("click", excluirSelecionados)
  }

  const closeDetailsModal = document.getElementById("closeDetailsModal")
  if (closeDetailsModal) {
    closeDetailsModal.addEventListener("click", () => {
      document.getElementById("modalDetalhesCliente").style.display = "none"
    })
  }

  const btnEditarDetalhes = document.getElementById("btnEditarDetalhes")
  if (btnEditarDetalhes) {
    btnEditarDetalhes.addEventListener("click", () => {
      document.getElementById("modalDetalhesCliente").style.display = "none"
      editarCliente(clienteParaVer.id)
    })
  }

  const btnFecharDetalhes = document.getElementById("btnFecharDetalhes")
  if (btnFecharDetalhes) {
    btnFecharDetalhes.addEventListener("click", () => {
      document.getElementById("modalDetalhesCliente").style.display = "none"
    })
  }

  const closeConfirmacao = document.getElementById("closeConfirmacao")
  if (closeConfirmacao) {
    closeConfirmacao.addEventListener("click", () => {
      document.getElementById("modalConfirmacao").style.display = "none"
    })
  }

  const btnCancelarExclusao = document.getElementById("btnCancelarExclusao")
  if (btnCancelarExclusao) {
    btnCancelarExclusao.addEventListener("click", () => {
      document.getElementById("modalConfirmacao").style.display = "none"
    })
  }
}

function filtrarClientes() {
  const search = document.getElementById("searchClientes").value.toLowerCase()
  const filterStatus = document.getElementById("filterStatus").value
  const filterInteresse = document.getElementById("filterInteresse").value

  clientesFiltrados = clientes.filter((cliente) => {
    const matchSearch =
      cliente.nome.toLowerCase().includes(search) ||
      cliente.telefone.includes(search) ||
      (cliente.email && cliente.email.toLowerCase().includes(search))
    const matchStatus = !filterStatus || cliente.status === filterStatus
    const matchInteresse = !filterInteresse || cliente.interesse === filterInteresse

    return matchSearch && matchStatus && matchInteresse
  })

  currentPage = 1
  clientesSelecionados = []
  const selectAll = document.getElementById("selectAll")
  if (selectAll) {
    selectAll.checked = false
  }
  atualizarTabela()
}

async function salvarCliente() {
  const nome = document.getElementById("clienteNome").value.trim()
  const telefone = document.getElementById("clienteTelefone").value.trim()
  const email = document.getElementById("clienteEmail").value.trim()
  const interesse = document.getElementById("clienteInteresse").value
  const valor = document.getElementById("clienteValor").value.trim()
  const status = document.getElementById("clienteStatus").value
  const observacoes = document.getElementById("clienteObservacoes").value.trim()

  if (!nome || !telefone || !interesse || !status) {
    mostrarNotificacao("Preencha todos os campos obrigatórios", "aviso")
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

    mostrarCarregando(true)

    const usuario = obterUsuarioLogado()

    if (clienteEmEdicao) {
      await atualizarCliente(clienteEmEdicao, cliente)
      registrarLog("EDITAR", "CLIENTES", `Cliente "${nome}" atualizado`)
      mostrarNotificacao("Cliente atualizado com sucesso!", "sucesso")
    } else {
      await criarCliente(cliente)
      registrarLog("CRIAR", "CLIENTES", `Novo cliente "${nome}" criado`)
      mostrarNotificacao("Cliente criado com sucesso!", "sucesso")
    }

    document.getElementById("modalCliente").style.display = "none"
    await carregarClientes()
  } catch (error) {
    mostrarNotificacao("Erro ao salvar cliente: " + error.message, "erro")
  } finally {
    mostrarCarregando(false)
  }
}

function editarCliente(id) {
  const cliente = clientes.find((c) => c.id === id)
  if (!cliente) return

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

function abrirDetalhesCliente(id) {
  const cliente = clientes.find((c) => c.id === id)
  if (!cliente) return

  clienteParaVer = cliente
  document.getElementById("detailAvatar").textContent = cliente.nome.charAt(0).toUpperCase()
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

async function excluirClienteConfirm(id) {
  const cliente = clientes.find((c) => c.id === id)
  if (!cliente) return

  document.getElementById("nomeClienteExcluir").textContent = cliente.nome
  document.getElementById("btnConfirmarExclusao").onclick = () => excluirCliente(id)
  document.getElementById("modalConfirmacao").style.display = "flex"
}

async function excluirCliente(id) {
  const btnConfirmar = document.getElementById("btnConfirmarExclusao")
  try {
    const cliente = clientes.find((c) => c.id === id)
    if (btnConfirmar) {
      btnConfirmar.disabled = true
    }
    await deletarCliente(id)
    registrarLog("DELETAR", "CLIENTES", `Cliente "${cliente?.nome}" deletado`)
    mostrarNotificacao("Cliente deletado com sucesso!", "sucesso")
    document.getElementById("modalConfirmacao").style.display = "none"
    await carregarClientes()
  } catch (error) {
    mostrarNotificacao("Erro ao deletar cliente: " + error.message, "erro")
  } finally {
    if (btnConfirmar) {
      btnConfirmar.disabled = false
    }
  }
}

function atualizarCheckboxes() {
  const checkboxes = document.querySelectorAll(".cliente-checkbox")
  clientesSelecionados = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => parseInt(cb.getAttribute("data-id")))

  const bulkActions = document.getElementById("bulkActions")
  if (clientesSelecionados.length > 0) {
    bulkActions.style.display = "flex"
    document.getElementById("selectedCount").textContent = `${clientesSelecionados.length} cliente(s) selecionado(s)`
  } else {
    bulkActions.style.display = "none"
  }
}

function adicionarListenersCheckboxes() {
  const checkboxes = document.querySelectorAll(".cliente-checkbox")
  checkboxes.forEach((checkbox) => {
    checkbox.removeEventListener("change", atualizarCheckboxes)
    checkbox.addEventListener("change", atualizarCheckboxes)
  })
}

async function excluirSelecionados() {
  if (clientesSelecionados.length === 0) {
    mostrarNotificacao("Nenhum cliente selecionado", "aviso")
    return
  }

  const nomes = clientesSelecionados
    .map(id => clientes.find(c => c.id === id)?.nome)
    .filter(Boolean)
    .join(", ")

  document.getElementById("nomeClienteExcluir").textContent = `${clientesSelecionados.length} cliente(s): ${nomes}`
  document.getElementById("btnConfirmarExclusao").onclick = () => executarExclusaoEmMassa()
  document.getElementById("modalConfirmacao").style.display = "flex"
}

async function executarExclusaoEmMassa() {
  const btnConfirmar = document.getElementById("btnConfirmarExclusao")
  try {
    if (btnConfirmar) {
      btnConfirmar.disabled = true
    }
    for (const id of clientesSelecionados) {
      const cliente = clientes.find((c) => c.id === id)
      await deletarCliente(id)
      registrarLog("DELETAR", "CLIENTES", `Cliente "${cliente?.nome}" deletado (em massa)`)
    }
    document.getElementById("modalConfirmacao").style.display = "none"
    mostrarNotificacao("Clientes deletados com sucesso!", "sucesso")
    await carregarClientes()
  } catch (error) {
    mostrarNotificacao("Erro ao deletar clientes: " + error.message, "erro")
  } finally {
    if (btnConfirmar) {
      btnConfirmar.disabled = false
    }
  }
}

function mostrarCarregando(show) {
  const modal = document.getElementById("modalCliente")
  const btn = modal?.querySelector(".btn-primary")
  if (btn) {
    btn.disabled = show
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
    quente: "Quente",
    frio: "Frio",
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
