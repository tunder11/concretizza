// ===== DADOS =====
let usuarios = JSON.parse(localStorage.getItem("usuarios")) || [
  {
    id: 1,
    nome: "Admin Sistema",
    email: "admin@concretizza.com",
    senha: "admin123",
    permissao: "admin",
    status: "ativo",
    telefone: "(11) 98765-4321",
    departamento: "Administração",
    ultimoAcesso: "2024-01-20",
  },
  {
    id: 2,
    nome: "Maria Silva",
    email: "maria.silva@concretizza.com",
    senha: "maria123",
    permissao: "editor",
    status: "ativo",
    telefone: "(11) 91234-5678",
    departamento: "Vendas",
    ultimoAcesso: "2024-01-19",
  },
  {
    id: 3,
    nome: "João Santos",
    email: "joao.santos@concretizza.com",
    senha: "joao123",
    permissao: "visualizador",
    status: "inativo",
    telefone: "(11) 99876-5432",
    departamento: "Atendimento",
    ultimoAcesso: "2024-01-15",
  },
]

let editandoUsuarioId = null
let paginaAtual = 1
const itensPorPagina = 10
let usuariosSelecionados = []
let excluindoUsuarioId = null
let excluindoEmMassa = false

// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", () => {
  carregarDados()
  configurarEventos()
  atualizarTabela()
  atualizarEstatisticas()
})

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
  const btnNovoUsuario = document.getElementById("btnNovoUsuario")
  const modal = document.getElementById("modalUsuario")
  const closeModal = document.getElementById("closeModal")
  const closeBtns = document.querySelectorAll(".modal-close-btn")
  const formUsuario = document.getElementById("formUsuario")

  btnNovoUsuario.addEventListener("click", abrirModalNovo)
  closeModal.addEventListener("click", fecharModal)
  closeBtns.forEach((btn) => btn.addEventListener("click", fecharModal))

  modal.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal()
  })

  const modalDetalhes = document.getElementById("modalDetalhesUsuario")
  const closeDetailsModal = document.getElementById("closeDetailsModal")
  const btnFecharDetalhes = document.getElementById("btnFecharDetalhes")
  const btnEditarDetalhes = document.getElementById("btnEditarDetalhes")

  closeDetailsModal.addEventListener("click", fecharModalDetalhes)
  btnFecharDetalhes.addEventListener("click", fecharModalDetalhes)

  btnEditarDetalhes.addEventListener("click", () => {
    const usuarioId = btnEditarDetalhes.dataset.usuarioId
    if (usuarioId) {
      fecharModalDetalhes()
      abrirModalEditar(Number.parseInt(usuarioId))
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
    const checkboxes = document.querySelectorAll(".checkbox-usuario")
    checkboxes.forEach((checkbox) => {
      checkbox.checked = e.target.checked
      const usuarioId = Number.parseInt(checkbox.dataset.usuarioId)
      if (e.target.checked) {
        if (!usuariosSelecionados.includes(usuarioId)) {
          usuariosSelecionados.push(usuarioId)
        }
      } else {
        usuariosSelecionados = usuariosSelecionados.filter((id) => id !== usuarioId)
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
    if (usuariosSelecionados.length > 0) {
      abrirModalConfirmacao(null, true)
    }
  })

  // Form submit
  formUsuario.addEventListener("submit", salvarUsuario)

  // Filtros
  document.getElementById("searchUsuarios").addEventListener("input", filtrarUsuarios)
  document.getElementById("filterPermissao").addEventListener("change", filtrarUsuarios)
  document.getElementById("filterStatus").addEventListener("change", filtrarUsuarios)

  // Paginação
  document.getElementById("prevPage").addEventListener("click", () => {
    if (paginaAtual > 1) {
      paginaAtual--
      atualizarTabela()
    }
  })

  document.getElementById("nextPage").addEventListener("click", () => {
    const usuariosFiltrados = obterUsuariosFiltrados()
    const totalPaginas = Math.ceil(usuariosFiltrados.length / itensPorPagina)
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
}

// ===== MODAL =====
function abrirModalNovo() {
  editandoUsuarioId = null
  document.getElementById("modalTitle").textContent = "Novo Usuário"
  document.getElementById("formUsuario").reset()
  document.getElementById("usuarioSenha").required = true
  document.getElementById("modalUsuario").classList.add("show")
}

function abrirModalEditar(id) {
  editandoUsuarioId = id
  const usuario = usuarios.find((u) => u.id === id)

  if (usuario) {
    document.getElementById("modalTitle").textContent = "Editar Usuário"
    document.getElementById("usuarioNome").value = usuario.nome
    document.getElementById("usuarioEmail").value = usuario.email
    document.getElementById("usuarioSenha").value = ""
    document.getElementById("usuarioSenha").required = false
    document.getElementById("usuarioPermissao").value = usuario.permissao
    document.getElementById("usuarioStatus").value = usuario.status
    document.getElementById("usuarioTelefone").value = usuario.telefone || ""
    document.getElementById("usuarioDepartamento").value = usuario.departamento || ""
    document.getElementById("modalUsuario").classList.add("show")
  }
}

function fecharModal() {
  document.getElementById("modalUsuario").classList.remove("show")
  document.getElementById("formUsuario").reset()
  editandoUsuarioId = null
}

function abrirModalConfirmacao(usuarioId = null, emMassa = false) {
  excluindoUsuarioId = usuarioId
  excluindoEmMassa = emMassa

  const messageElement = document.getElementById("confirmationMessage")

  if (emMassa) {
    const qtd = usuariosSelecionados.length
    messageElement.textContent = `Tem certeza que deseja excluir ${qtd} usuário${qtd > 1 ? "s" : ""}?`
  } else {
    messageElement.textContent = "Tem certeza que deseja excluir este usuário?"
  }

  document.getElementById("modalConfirmacao").classList.add("show")
}

function fecharModalConfirmacao() {
  document.getElementById("modalConfirmacao").classList.remove("show")
  excluindoUsuarioId = null
  excluindoEmMassa = false
}

function confirmarExclusao() {
  if (excluindoEmMassa) {
    excluirUsuariosSelecionados()
  } else if (excluindoUsuarioId) {
    executarExclusao(excluindoUsuarioId)
  }
  fecharModalConfirmacao()
}

// ===== CRUD =====
function salvarUsuario(e) {
  e.preventDefault()

  const usuario = {
    id: editandoUsuarioId || Date.now(),
    nome: document.getElementById("usuarioNome").value,
    email: document.getElementById("usuarioEmail").value,
    permissao: document.getElementById("usuarioPermissao").value,
    status: document.getElementById("usuarioStatus").value,
    telefone: document.getElementById("usuarioTelefone").value,
    departamento: document.getElementById("usuarioDepartamento").value,
    ultimoAcesso: editandoUsuarioId
      ? usuarios.find((u) => u.id === editandoUsuarioId).ultimoAcesso
      : new Date().toISOString().split("T")[0],
  }

  // Adicionar senha apenas se foi fornecida
  const senha = document.getElementById("usuarioSenha").value
  if (senha) {
    usuario.senha = senha
  } else if (editandoUsuarioId) {
    usuario.senha = usuarios.find((u) => u.id === editandoUsuarioId).senha
  }

  if (editandoUsuarioId) {
    const index = usuarios.findIndex((u) => u.id === editandoUsuarioId)
    usuarios[index] = usuario
    mostrarToast("Usuário atualizado com sucesso!", "success")
  } else {
    usuarios.push(usuario)
    mostrarToast("Usuário cadastrado com sucesso!", "success")
  }

  salvarDados()
  fecharModal()
  atualizarTabela()
  atualizarEstatisticas()
}

function excluirUsuario(id) {
  abrirModalConfirmacao(id, false)
}

function executarExclusao(id) {
  usuarios = usuarios.filter((u) => u.id !== id)
  usuariosSelecionados = usuariosSelecionados.filter((uId) => uId !== id)
  salvarDados()
  atualizarTabela()
  atualizarEstatisticas()
  atualizarBulkActions()
  mostrarToast("Usuário excluído com sucesso!", "success")
}

function excluirUsuariosSelecionados() {
  const qtd = usuariosSelecionados.length
  usuarios = usuarios.filter((u) => !usuariosSelecionados.includes(u.id))
  usuariosSelecionados = []
  salvarDados()
  atualizarTabela()
  atualizarEstatisticas()
  atualizarBulkActions()
  mostrarToast(`${qtd} usuário${qtd > 1 ? "s excluídos" : " excluído"} com sucesso!`, "success")
}

// ===== TABELA =====
function atualizarTabela() {
  const tbody = document.getElementById("usuariosTable")
  const usuariosFiltrados = obterUsuariosFiltrados()

  // Paginação
  const inicio = (paginaAtual - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const usuariosPagina = usuariosFiltrados.slice(inicio, fim)

  if (usuariosPagina.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum usuário encontrado</td></tr>'
  } else {
    tbody.innerHTML = usuariosPagina
      .map(
        (usuario) => `
      <tr style="cursor: pointer;" class="${usuariosSelecionados.includes(usuario.id) ? "selected" : ""}">
        <td onclick="event.stopPropagation()">
          <input type="checkbox" 
                 class="checkbox-input checkbox-usuario" 
                 data-usuario-id="${usuario.id}"
                 ${usuariosSelecionados.includes(usuario.id) ? "checked" : ""}
                 onchange="toggleUsuarioSelecao(${usuario.id}, this.checked)">
        </td>
        <td onclick="abrirModalDetalhes(${usuario.id})">${usuario.nome}</td>
        <td onclick="abrirModalDetalhes(${usuario.id})">${usuario.email}</td>
        <td onclick="abrirModalDetalhes(${usuario.id})"><span class="badge badge-${usuario.permissao}">${formatarPermissao(usuario.permissao)}</span></td>
        <td onclick="abrirModalDetalhes(${usuario.id})"><span class="badge badge-${usuario.status}">${formatarStatus(usuario.status)}</span></td>
        <td onclick="abrirModalDetalhes(${usuario.id})">${formatarData(usuario.ultimoAcesso)}</td>
        <td onclick="event.stopPropagation()">
          <button class="btn-action btn-edit" onclick="abrirModalEditar(${usuario.id})">
            <i class="fas fa-edit"></i> Editar
          </button>
          <button class="btn-action btn-delete" onclick="excluirUsuario(${usuario.id})">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </td>
      </tr>
    `,
      )
      .join("")
  }

  atualizarPaginacao(usuariosFiltrados.length)
  atualizarBulkActions()
}

function atualizarPaginacao(totalItens) {
  const totalPaginas = Math.ceil(totalItens / itensPorPagina)
  document.getElementById("pageInfo").textContent = `Página ${paginaAtual} de ${totalPaginas || 1}`

  document.getElementById("prevPage").disabled = paginaAtual === 1
  document.getElementById("nextPage").disabled = paginaAtual >= totalPaginas
}

// ===== FILTROS =====
function obterUsuariosFiltrados() {
  const busca = document.getElementById("searchUsuarios").value.toLowerCase()
  const permissaoFiltro = document.getElementById("filterPermissao").value
  const statusFiltro = document.getElementById("filterStatus").value

  return usuarios.filter((usuario) => {
    const matchBusca =
      !busca || usuario.nome.toLowerCase().includes(busca) || usuario.email.toLowerCase().includes(busca)

    const matchPermissao = !permissaoFiltro || usuario.permissao === permissaoFiltro
    const matchStatus = !statusFiltro || usuario.status === statusFiltro

    return matchBusca && matchPermissao && matchStatus
  })
}

function filtrarUsuarios() {
  paginaAtual = 1
  usuariosSelecionados = []
  document.getElementById("selectAll").checked = false
  atualizarTabela()
}

// ===== ESTATÍSTICAS =====
function atualizarEstatisticas() {
  document.getElementById("totalUsuarios").textContent = usuarios.length
  document.getElementById("totalAdmins").textContent = usuarios.filter((u) => u.permissao === "admin").length
  document.getElementById("totalEditores").textContent = usuarios.filter((u) => u.permissao === "editor").length
  document.getElementById("usuariosAtivos").textContent = usuarios.filter((u) => u.status === "ativo").length
}

// ===== UTILITÁRIOS =====
function formatarPermissao(permissao) {
  const permissaoMap = {
    admin: "Administrador",
    editor: "Editor",
    visualizador: "Visualizador",
  }
  return permissaoMap[permissao] || permissao
}

function formatarStatus(status) {
  const statusMap = {
    ativo: "Ativo",
    inativo: "Inativo",
  }
  return statusMap[status] || status
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
  localStorage.setItem("usuarios", JSON.stringify(usuarios))
}

function carregarDados() {
  const storedUsuarios = localStorage.getItem("usuarios")
  if (storedUsuarios) {
    usuarios = JSON.parse(storedUsuarios)
  }
}

function abrirModalDetalhes(id) {
  const usuario = usuarios.find((u) => u.id === id)

  if (usuario) {
    // Avatar
    const iniciais = usuario.nome
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase()
    document.getElementById("detailAvatar").textContent = iniciais

    // Header
    document.getElementById("detailNomeHeader").textContent = usuario.nome
    const permissaoHeader = document.getElementById("detailPermissaoHeader")
    permissaoHeader.textContent = formatarPermissao(usuario.permissao)
    permissaoHeader.className = `badge badge-${usuario.permissao}`

    // Details
    document.getElementById("detailEmail").textContent = usuario.email
    document.getElementById("detailTelefone").textContent = usuario.telefone || "Não informado"
    document.getElementById("detailDepartamento").textContent = usuario.departamento || "Não informado"
    document.getElementById("detailPermissao").textContent = formatarPermissao(usuario.permissao)

    const statusElement = document.getElementById("detailStatus")
    const statusText = formatarStatus(usuario.status)
    statusElement.innerHTML = `<span class="badge badge-${usuario.status}">${statusText}</span>`

    document.getElementById("detailUltimoAcesso").textContent = formatarData(usuario.ultimoAcesso)

    // Permissions list
    const permissoes = getPermissoesPorNivel(usuario.permissao)
    const permissoesHtml = permissoes
      .map((p) => `<span class="permission-tag"><i class="fas fa-check"></i>${p}</span>`)
      .join("")
    document.getElementById("detailPermissoes").innerHTML = permissoesHtml

    document.getElementById("btnEditarDetalhes").dataset.usuarioId = id

    document.getElementById("modalDetalhesUsuario").classList.add("show")
  }
}

function getPermissoesPorNivel(permissao) {
  const permissoes = {
    admin: [
      "Visualizar dados",
      "Criar registros",
      "Editar registros",
      "Excluir registros",
      "Gerenciar usuários",
      "Configurações do sistema",
    ],
    editor: ["Visualizar dados", "Criar registros", "Editar registros"],
    visualizador: ["Visualizar dados"],
  }
  return permissoes[permissao] || []
}

function fecharModalDetalhes() {
  document.getElementById("modalDetalhesUsuario").classList.remove("show")
}

function toggleUsuarioSelecao(usuarioId, checked) {
  if (checked) {
    if (!usuariosSelecionados.includes(usuarioId)) {
      usuariosSelecionados.push(usuarioId)
    }
  } else {
    usuariosSelecionados = usuariosSelecionados.filter((id) => id !== usuarioId)
  }

  const row = document.querySelector(`input[data-usuario-id="${usuarioId}"]`).closest("tr")
  if (row) {
    row.classList.toggle("selected", checked)
  }

  atualizarBulkActions()
}

function atualizarBulkActions() {
  const bulkActions = document.getElementById("bulkActions")
  const selectedCount = document.getElementById("selectedCount")

  if (usuariosSelecionados.length > 0) {
    bulkActions.style.display = "flex"
    selectedCount.textContent = `${usuariosSelecionados.length} usuário${
      usuariosSelecionados.length > 1 ? "s selecionado" : " selecionado"
    }${usuariosSelecionados.length > 1 ? "s" : ""}`
  } else {
    bulkActions.style.display = "none"
  }

  // Update select all checkbox
  const checkboxes = document.querySelectorAll(".checkbox-usuario")
  const selectAll = document.getElementById("selectAll")
  if (checkboxes.length > 0) {
    selectAll.checked = checkboxes.length === usuariosSelecionados.length
  } else {
    selectAll.checked = false
  }
}
