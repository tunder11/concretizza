let usuarios = []
let usuariosFiltrados = []
let paginaAtual = 1
const itensPorPagina = 10
let usuarioEmEdicao = null
let usuariosSelecionados = []

document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  carregarUsuarios()
  configurarEventos()
  aplicarPermissoes()
})

function verificarAutenticacao() {
  console.log("[USUARIOS] ========== INICIANDO VERIFICAÇÃO DE AUTENTICAÇÃO ==========")
  const token = localStorage.getItem("token")
  const usuarioStr = localStorage.getItem("usuarioLogado")
  const usuario = usuarioStr ? JSON.parse(usuarioStr) : null
  
  console.log("[USUARIOS] Token existe:", !!token)
  console.log("[USUARIOS] Token valor:", token)
  console.log("[USUARIOS] Usuário:", usuario)
  console.log("[USUARIOS] Cargo:", usuario?.cargo)
  console.log("[USUARIOS] typeof isAdminOrHeadAdmin:", typeof isAdminOrHeadAdmin)
  
  if (typeof isAdminOrHeadAdmin !== 'function') {
    console.error("[USUARIOS] ERRO CRÍTICO: isAdminOrHeadAdmin não é uma função!")
    console.log("[USUARIOS] Redirecionando para / devido a erro")
    window.location.href = "/"
    return
  }
  
  console.log("[USUARIOS] Chamando isAdminOrHeadAdmin()...")
  const ehAdminOrHeadAdmin = isAdminOrHeadAdmin()
  console.log("[USUARIOS] isAdminOrHeadAdmin() retornou:", ehAdminOrHeadAdmin)
  
  const condicoes = {
    'token existe': !!token,
    'usuario existe': !!usuario,
    'ehAdminOrHeadAdmin': ehAdminOrHeadAdmin
  }
  console.log("[USUARIOS] Verificação de condições:", condicoes)
  
  if (!token || !usuario || !ehAdminOrHeadAdmin) {
    console.log("[USUARIOS] ❌ FALHA NA VERIFICAÇÃO - redirecionando para /")
    window.location.href = "/"
    return
  }
  
  console.log("[USUARIOS] ✅ AUTENTICAÇÃO BEM-SUCEDIDA")
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

function aplicarPermissoes() {
  const btnNovoUsuario = document.getElementById("btnNovoUsuario")

  if (btnNovoUsuario) {
    btnNovoUsuario.style.display = isAdminOrHeadAdmin() ? "flex" : "none"
  }
}

async function carregarUsuarios() {
  try {
    console.log("Iniciando carregamento de usuários...")
    const token = localStorage.getItem("token")
    console.log("Token presente:", !!token)
    usuarios = await obterUsuarios()
    console.log("Usuários carregados:", usuarios)
    usuariosFiltrados = [...usuarios]
    paginaAtual = 1
    atualizarTabela()
  } catch (error) {
    console.error("Erro ao carregar usuários:", error)
    mostrarNotificacao("Erro ao carregar usuários: " + error.message, "erro")
  }
}

function atualizarTabela() {
  const tbody = document.getElementById("usuariosTable")
  const usuario = obterUsuarioLogado()
  const cargosLogado = usuario?.cargo?.toLowerCase().split(',').map(c => c.trim())
  const podeEditar = usuario && (cargosLogado.includes("head-admin") || cargosLogado.includes("admin"))

  const inicio = (paginaAtual - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const usuariosPagina = usuariosFiltrados.slice(inicio, fim)

  if (usuariosPagina.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum usuário encontrado</td></tr>'
  } else {
    tbody.innerHTML = usuariosPagina
      .map((usr) => {
        const status = usr.status || "ativo"
        const ultimoAcesso = formatarDataSP(usr.ultimoAcesso)
        const cargosAlvo = usr.permissao?.toLowerCase().split(',').map(c => c.trim())
        const podeEditarEste = cargosLogado.includes("head-admin") || (cargosLogado.includes("admin") && !cargosAlvo.includes("admin") && !cargosAlvo.includes("head-admin"))
        const podeDeletarEste = cargosLogado.includes("head-admin") || (cargosLogado.includes("admin") && !cargosAlvo.includes("admin") && !cargosAlvo.includes("head-admin"))
        
        return `
          <tr onclick="abrirDetalhesUsuario(${usr.id})" style="cursor: pointer;">
            <td onclick="event.stopPropagation();">
              <input type="checkbox" class="checkbox-input usuario-checkbox" data-id="${usr.id}">
            </td>
            <td>${usr.nome}</td>
            <td>${usr.email}</td>
            <td><span class="badge badge-info">${formatarCargo(usr.permissao)}</span></td>
            <td><span class="badge ${status === 'ativo' ? 'badge-success' : 'badge-warning'}">${status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
            <td>${ultimoAcesso}</td>
            <td onclick="event.stopPropagation();">
              ${podeEditar && podeEditarEste ? `<button class="btn-action btn-edit" onclick="editarUsuario(${usr.id})" title="Editar">
                <i class="fas fa-edit"></i> Editar
              </button>` : ""}
              ${podeEditar && podeDeletarEste && usr.id !== usuario.id ? `<button class="btn-action btn-delete" onclick="confirmarExclusao(${usr.id}, '${usr.nome}')" title="Excluir">
                <i class="fas fa-trash"></i> Excluir
              </button>` : ""}
            </td>
          </tr>
        `
      })
      .join("")
  }

  atualizarPaginacao()
  atualizarEstatisticas()
  adicionarListenersCheckboxesUsuarios()
}

function atualizarPaginacao() {
  const totalPaginas = Math.ceil(usuariosFiltrados.length / itensPorPagina)
  const pageInfo = document.getElementById("pageInfo")
  if (pageInfo) {
    pageInfo.textContent = `Página ${paginaAtual} de ${totalPaginas}`
  }
}

function atualizarEstatisticas() {
  const totalUsuarios = usuarios.length
  const totalAdmins = usuarios.filter(u => {
    const roles = (u.permissao || "").toLowerCase().split(',').map(r => r.trim())
    return roles.includes("admin") || roles.includes("head-admin")
  }).length
  const totalCorretores = usuarios.filter(u => {
    const roles = (u.permissao || "").toLowerCase().split(',').map(r => r.trim())
    return roles.includes("corretor")
  }).length
  const usuariosAtivos = usuarios.filter(u => u.status?.toLowerCase() === "ativo").length

  const totalElem = document.getElementById("totalUsuarios")
  const adminsElem = document.getElementById("totalAdmins")
  const corretoresElem = document.getElementById("totalCorretores")
  const ativosElem = document.getElementById("usuariosAtivos")

  if (totalElem) totalElem.textContent = totalUsuarios
  if (adminsElem) adminsElem.textContent = totalAdmins
  if (corretoresElem) corretoresElem.textContent = totalCorretores
  if (ativosElem) ativosElem.textContent = usuariosAtivos
}

function filtrarUsuarios() {
  const search = document.getElementById("searchUsuarios")?.value.toLowerCase() || ""
  const filterPermissao = document.getElementById("filterPermissao")?.value || ""
  const filterStatus = document.getElementById("filterStatus")?.value || ""

  usuariosFiltrados = usuarios.filter((usuario) => {
    const matchSearch =
      usuario.nome.toLowerCase().includes(search) ||
      usuario.email.toLowerCase().includes(search)
    
    const roles = (usuario.permissao || "").toLowerCase().split(',').map(r => r.trim())
    const matchPermissao = !filterPermissao || roles.includes(filterPermissao.toLowerCase())
    
    const matchStatus = !filterStatus || usuario.status === filterStatus

    return matchSearch && matchPermissao && matchStatus
  })

  paginaAtual = 1
  usuariosSelecionados = []
  const selectAll = document.getElementById("selectAll")
  if (selectAll) {
    selectAll.checked = false
  }
  atualizarTabela()
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

  const btnNovoUsuario = document.getElementById("btnNovoUsuario")
  if (btnNovoUsuario) {
    btnNovoUsuario.addEventListener("click", () => {
      usuarioEmEdicao = null
      document.getElementById("formUsuario").reset()
      document.querySelectorAll('input[name="usuarioPermissao"]').forEach(cb => cb.checked = false);
      document.getElementById("modalTitle").textContent = "Novo Usuário"
      document.getElementById("usuarioPasswordGroup").style.display = "block"
      document.getElementById("usuarioPassword").setAttribute("required", "required")
      atualizarOpcoesCargo()
      document.getElementById("modalUsuario").style.display = "flex"
    })
  }

  const formUsuario = document.getElementById("formUsuario")
  if (formUsuario) {
    formUsuario.addEventListener("submit", (e) => {
      e.preventDefault()
      salvarUsuario()
    })
  }

  const closeModal = document.querySelector("#modalUsuario .modal-close")
  if (closeModal) {
    closeModal.addEventListener("click", () => {
      document.getElementById("modalUsuario").style.display = "none"
    })
  }

  const cancelBtns = document.querySelectorAll(".modal-close-btn")
  cancelBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("modalUsuario").style.display = "none"
    })
  })

  const closeDetailsModal = document.getElementById("closeDetailsModal")
  if (closeDetailsModal) {
    closeDetailsModal.addEventListener("click", () => {
      document.getElementById("modalDetalhesUsuario").style.display = "none"
    })
  }

  const btnEditarDetalhes = document.getElementById("btnEditarDetalhes")
  if (btnEditarDetalhes) {
    btnEditarDetalhes.addEventListener("click", () => {
      const usuarioId = usuarios.find((u) => u.nome === document.getElementById("detailNomeHeader").textContent)?.id
      if (usuarioId) {
        document.getElementById("modalDetalhesUsuario").style.display = "none"
        editarUsuario(usuarioId)
      }
    })
  }

  const btnFecharDetalhes = document.getElementById("btnFecharDetalhes")
  if (btnFecharDetalhes) {
    btnFecharDetalhes.addEventListener("click", () => {
      document.getElementById("modalDetalhesUsuario").style.display = "none"
    })
  }

  const closeConfirmModal = document.getElementById("closeConfirmacaoUsuario")
  if (closeConfirmModal) {
    closeConfirmModal.addEventListener("click", () => {
      document.getElementById("modalConfirmacaoUsuario").style.display = "none"
    })
  }

  const btnCancelarExclusao = document.getElementById("btnCancelarExclusaoUsuario")
  if (btnCancelarExclusao) {
    btnCancelarExclusao.addEventListener("click", () => {
      document.getElementById("modalConfirmacaoUsuario").style.display = "none"
    })
  }

  // Fechar modal ao clicar fora
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.style.display = "none"
      e.target.classList.remove("show")
      e.target.classList.remove("active")
    }
  })

  const selectAll = document.getElementById("selectAll")
  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      const checkboxes = document.querySelectorAll(".usuario-checkbox")
      checkboxes.forEach((checkbox) => {
        checkbox.checked = e.target.checked
      })
      atualizarCheckboxesUsuarios()
    })
  }

  const btnExcluirSelecionados = document.getElementById("btnExcluirSelecionados")
  if (btnExcluirSelecionados) {
    btnExcluirSelecionados.addEventListener("click", excluirSelecionadosUsuarios)
  }

  const searchUsuarios = document.getElementById("searchUsuarios")
  const filterPermissao = document.getElementById("filterPermissao")
  const filterStatus = document.getElementById("filterStatus")

  if (searchUsuarios) {
    searchUsuarios.addEventListener("input", filtrarUsuarios)
  }
  if (filterPermissao) {
    filterPermissao.addEventListener("change", filtrarUsuarios)
  }
  if (filterStatus) {
    filterStatus.addEventListener("change", filtrarUsuarios)
  }

  const prevPage = document.getElementById("prevPage")
  const nextPage = document.getElementById("nextPage")

  if (prevPage) {
    prevPage.addEventListener("click", () => {
      if (paginaAtual > 1) {
        paginaAtual--
        atualizarTabela()
      }
    })
  }

  if (nextPage) {
    nextPage.addEventListener("click", () => {
      const totalPaginas = Math.ceil(usuariosFiltrados.length / itensPorPagina)
      if (paginaAtual < totalPaginas) {
        paginaAtual++
        atualizarTabela()
      }
    })
  }
}

async function salvarUsuario() {
  const nome = (document.getElementById("usuarioNome")?.value || "").trim()
  const email = (document.getElementById("usuarioEmail")?.value || "").trim()
  const username = (document.getElementById("usuarioUsername")?.value || "").trim()
  const password = (document.getElementById("usuarioPassword")?.value || "").trim()
  
  const checkboxes = document.querySelectorAll('input[name="usuarioPermissao"]:checked');
  const permissoes = Array.from(checkboxes).map(cb => cb.value);
  const permissao = permissoes.join(",");

  const status = document.getElementById("usuarioStatus")?.value
  const telefone = (document.getElementById("usuarioTelefone")?.value || "").trim()
  const departamento = (document.getElementById("usuarioDepartamento")?.value || "").trim()

  if (!nome || !email || !username || !permissao || !status) {
    mostrarNotificacao("Preencha todos os campos obrigatórios", "aviso")
    return
  }

  if (!usuarioEmEdicao && !password) {
    mostrarNotificacao("Senha é obrigatória para novo usuário", "aviso")
    return
  }

  const usuarioLogado = obterUsuarioLogado()
  const cargosLogado = usuarioLogado.cargo?.toLowerCase().split(',').map(c => c.trim())

  if (usuarioEmEdicao) {
    const usuarioASerEditado = usuarios.find(u => u.id === usuarioEmEdicao)
    const cargosAlvo = usuarioASerEditado?.permissao?.toLowerCase().split(',').map(c => c.trim())

    if (cargosLogado.includes("admin") && !cargosLogado.includes("head-admin") && (cargosAlvo.includes("admin") || cargosAlvo.includes("head-admin"))) {
      mostrarNotificacao("Admin não pode editar usuários com cargo igual ou superior", "aviso")
      return
    }

    if (cargosLogado.includes("corretor") && !cargosLogado.includes("admin") && !cargosLogado.includes("head-admin")) {
      mostrarNotificacao("Você não tem permissão para editar usuários", "aviso")
      return
    }
  } else {
    const cargosNovos = permissao.toLowerCase().split(',').map(c => c.trim())
    if (cargosLogado.includes("admin") && !cargosLogado.includes("head-admin") && (cargosNovos.includes("admin") || cargosNovos.includes("head-admin"))) {
      mostrarNotificacao("Admin não pode criar usuários com cargo admin ou superior", "aviso")
      return
    }

    if (cargosLogado.includes("corretor") && !cargosLogado.includes("admin") && !cargosLogado.includes("head-admin")) {
      mostrarNotificacao("Você não tem permissão para criar usuários", "aviso")
      return
    }
  }

  try {
    if (usuarioEmEdicao) {
      const usuario = {
        nome,
        email,
        username,
        permissao,
        status,
        telefone: telefone || null,
        departamento: departamento || null
      }

      if (password) {
        usuario.password = password
      }

      console.log("[USUARIOS] Atualizando usuário:", usuarioEmEdicao, usuario)
      await atualizarUsuario(usuarioEmEdicao, usuario)
      registrarLog("EDITAR", "USUARIOS", `Usuário "${nome}" (${permissao}) atualizado`, nome)
      mostrarNotificacao("Usuário atualizado com sucesso!", "sucesso")
    } else {
      const usuario = {
        nome,
        email,
        username,
        password,
        permissao,
        status,
        telefone: telefone || null,
        departamento: departamento || null
      }

      console.log("[USUARIOS] Criando novo usuário:", usuario)
      await criarUsuario(usuario)
      registrarLog("CRIAR", "USUARIOS", `Novo usuário "${nome}" (${permissao}) criado`, nome)
      mostrarNotificacao("Usuário criado com sucesso!", "sucesso")
    }

    document.getElementById("modalUsuario").style.display = "none"
    await carregarUsuarios()
  } catch (error) {
    console.error("[USUARIOS] Erro ao salvar usuário:", error)
    mostrarNotificacao("Erro ao salvar usuário: " + error.message, "erro")
  }
}

function atualizarOpcoesCargo() {
  const usuarioLogado = obterUsuarioLogado()
  const cargosLogado = usuarioLogado?.cargo?.toLowerCase().split(',').map(c => c.trim())
  const checkboxes = document.querySelectorAll('input[name="usuarioPermissao"]')

  checkboxes.forEach(cb => {
    cb.disabled = false
  })

  if (cargosLogado.includes("admin") && !cargosLogado.includes("head-admin")) {
    checkboxes.forEach(cb => {
      const valor = cb.value.toLowerCase()
      if (valor === "admin" || valor === "head-admin") {
        cb.disabled = true
      }
    })
  } else if (cargosLogado.includes("corretor") && !cargosLogado.includes("admin") && !cargosLogado.includes("head-admin")) {
    checkboxes.forEach(cb => {
      cb.disabled = true
    })
  }
}

function editarUsuario(id) {
  const usuario = usuarios.find((u) => u.id === id)
  if (!usuario) return

  const usuarioLogado = obterUsuarioLogado()
  const cargosLogado = usuarioLogado.cargo?.toLowerCase().split(',').map(c => c.trim())
  const cargosAlvo = usuario.permissao?.toLowerCase().split(',').map(c => c.trim())

  if (cargosLogado.includes("admin") && !cargosLogado.includes("head-admin") && (cargosAlvo.includes("admin") || cargosAlvo.includes("head-admin"))) {
    mostrarNotificacao("Admin não pode editar usuários com cargo igual ou superior", "aviso")
    return
  }

  usuarioEmEdicao = id
  document.getElementById("modalTitle").textContent = "Editar Usuário"
  document.getElementById("usuarioNome").value = usuario.nome
  document.getElementById("usuarioEmail").value = usuario.email
  document.getElementById("usuarioUsername").value = usuario.username
  
  // Reset checkboxes
  document.querySelectorAll('input[name="usuarioPermissao"]').forEach(cb => cb.checked = false);
  
  // Set checkboxes
  if (usuario.permissao) {
      const permissoes = usuario.permissao.split(',').map(p => p.trim());
      permissoes.forEach(p => {
          const cb = document.querySelector(`input[name="usuarioPermissao"][value="${p}"]`);
          if (cb) cb.checked = true;
      });
  }

  document.getElementById("usuarioStatus").value = usuario.status || "ativo"
  document.getElementById("usuarioTelefone").value = usuario.telefone || ""
  document.getElementById("usuarioDepartamento").value = usuario.departamento || ""
  document.getElementById("usuarioPasswordGroup").style.display = "none"
  document.getElementById("usuarioPassword").removeAttribute("required")

  atualizarOpcoesCargo()
  document.getElementById("modalUsuario").style.display = "flex"
}

function obterPermissoesFormatadas(cargo) {
  if (!cargo) return "";
  const cargos = cargo.split(',').map(c => c.trim());
  let todasPermissoes = {};

  cargos.forEach(c => {
      const perms = PERMISSIONS[c.toLowerCase()] || {};
      for (const [modulo, acoes] of Object.entries(perms)) {
          if (!todasPermissoes[modulo]) todasPermissoes[modulo] = new Set();
          acoes.forEach(acao => todasPermissoes[modulo].add(acao));
      }
  });

  const tags = []

  for (const [modulo, acoesSet] of Object.entries(todasPermissoes)) {
    const acoes = Array.from(acoesSet);
    if (acoes.length > 0) {
      acoes.forEach((acao) => {
        const iconMap = {
          'create': 'fa-plus',
          'read': 'fa-eye',
          'update': 'fa-edit',
          'delete': 'fa-trash',
          'manage-admins': 'fa-user-shield'
        }
        const icon = iconMap[acao] || 'fa-check'
        const label = acao === 'manage-admins' ? 'Gerenciar Admins' : acao.charAt(0).toUpperCase() + acao.slice(1)
        tags.push(`<span class="permission-tag"><i class="fas ${icon}"></i> ${label} ${modulo}</span>`)
      })
    }
  }

  return tags.join('')
}

function abrirDetalhesUsuario(id) {
  const usr = usuarios.find((u) => u.id === id)
  if (!usr) return

  document.getElementById("detailAvatar").textContent = usr.nome.charAt(0).toUpperCase()
  document.getElementById("detailNomeHeader").textContent = usr.nome
  document.getElementById("detailPermissaoHeader").textContent = formatarCargo(usr.permissao)
  document.getElementById("detailPermissaoHeader").className = "badge badge-info"
  document.getElementById("detailEmail").textContent = usr.email
  document.getElementById("detailTelefone").textContent = usr.telefone || "-"
  document.getElementById("detailDepartamento").textContent = usr.departamento || "-"
  document.getElementById("detailPermissao").textContent = formatarCargo(usr.permissao)
  document.getElementById("detailStatus").textContent = usr.status === "ativo" ? "Ativo" : "Inativo"
  document.getElementById("detailUltimoAcesso").textContent = formatarDataHoraSP(usr.ultimoAcesso)
  
  const permissoesHtml = obterPermissoesFormatadas(usr.permissao)
  document.getElementById("detailPermissoes").innerHTML = permissoesHtml || '<span class="permission-tag">Nenhuma permissão atribuída</span>'

  document.getElementById("modalDetalhesUsuario").style.display = "flex"
}

function confirmarExclusao(id, nome) {
  document.getElementById("nomeUsuarioExcluir").textContent = nome
  document.getElementById("btnConfirmarExclusaoUsuario").onclick = () => excluirUsuario(id)
  document.getElementById("modalConfirmacaoUsuario").style.display = "flex"
}

async function excluirUsuario(id) {
  const btnConfirmar = document.getElementById("btnConfirmarExclusaoUsuario")
  try {
    const usuario = usuarios.find((u) => u.id === id)
    console.log("[USUARIOS] Tentando deletar usuário ID:", id)
    if (btnConfirmar) {
      btnConfirmar.disabled = true
      btnConfirmar.textContent = "Excluindo..."
    }
    await deletarUsuario(id)
    registrarLog("DELETAR", "USUARIOS", `Usuário "${usuario?.nome}" deletado`, usuario?.nome)
    console.log("[USUARIOS] Usuário deletado com sucesso")
    document.getElementById("modalConfirmacaoUsuario").style.display = "none"
    mostrarNotificacao(`Usuário "${usuario?.nome}" foi excluído com sucesso!`, "sucesso")
    await carregarUsuarios()
  } catch (error) {
    console.error("[USUARIOS] Erro ao excluir usuário:", error)
    mostrarNotificacao("Erro ao excluir usuário: " + error.message, "erro")
  } finally {
    if (btnConfirmar) {
      btnConfirmar.disabled = false
      btnConfirmar.innerHTML = '<i class="fas fa-trash"></i> Excluir'
    }
  }
}

function formatarCargo(cargo) {
  if (!cargo) return "";
  const cargos = cargo.split(',').map(c => c.trim());
  const map = {
    "head-admin": "Head Admin",
    admin: "Admin",
    corretor: "Corretor(a)",
    visualizar: "Visualizar",
    visualizador: "Visualizar"
  }
  
  return cargos.map(c => map[c.toLowerCase()] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : "")).join(", ");
}

function atualizarCheckboxesUsuarios() {
  const checkboxes = document.querySelectorAll(".usuario-checkbox")
  usuariosSelecionados = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => parseInt(cb.getAttribute("data-id")))

  const bulkActions = document.getElementById("bulkActions")
  if (usuariosSelecionados.length > 0) {
    bulkActions.style.display = "flex"
    document.getElementById("selectedCount").textContent = `${usuariosSelecionados.length} usuário(s) selecionado(s)`
  } else {
    bulkActions.style.display = "none"
  }
}

function adicionarListenersCheckboxesUsuarios() {
  const checkboxes = document.querySelectorAll(".usuario-checkbox")
  checkboxes.forEach((checkbox) => {
    checkbox.removeEventListener("change", atualizarCheckboxesUsuarios)
    checkbox.addEventListener("change", atualizarCheckboxesUsuarios)
  })
}

async function excluirSelecionadosUsuarios() {
  if (usuariosSelecionados.length === 0) {
    mostrarNotificacao("Nenhum usuário selecionado", "aviso")
    return
  }

  const usuario = obterUsuarioLogado()
  const cargosLogado = usuario?.cargo?.toLowerCase().split(',').map(c => c.trim())

  for (const id of usuariosSelecionados) {
    const usr = usuarios.find((u) => u.id === id)
    
    if (usr.id === usuario.id) {
      mostrarNotificacao("Você não pode excluir sua própria conta", "aviso")
      return
    }

    const cargosAlvo = usr?.permissao?.toLowerCase().split(',').map(c => c.trim())
    if (cargosLogado.includes("admin") && !cargosLogado.includes("head-admin") && (cargosAlvo.includes("admin") || cargosAlvo.includes("head-admin"))) {
      mostrarNotificacao(`Admin não pode excluir usuário(s) com cargo igual ou superior`, "aviso")
      return
    }
  }

  const nomes = usuariosSelecionados
    .map(id => usuarios.find(u => u.id === id)?.nome)
    .filter(Boolean)
    .join(", ")

  document.getElementById("nomeUsuarioExcluir").textContent = `${usuariosSelecionados.length} usuário(s): ${nomes}`
  document.getElementById("btnConfirmarExclusaoUsuario").onclick = () => executarExclusaoEmMassaUsuarios()
  document.getElementById("modalConfirmacaoUsuario").style.display = "flex"
}

async function executarExclusaoEmMassaUsuarios() {
  const btnConfirmar = document.getElementById("btnConfirmarExclusaoUsuario")
  try {
    if (btnConfirmar) {
      btnConfirmar.disabled = true
      btnConfirmar.textContent = "Excluindo..."
    }
    
    for (const id of usuariosSelecionados) {
      const usr = usuarios.find((u) => u.id === id)
      await deletarUsuario(id)
      registrarLog("DELETAR", "USUARIOS", `Usuário "${usr?.nome}" deletado (em massa)`, usr?.nome)
    }
    
    document.getElementById("modalConfirmacaoUsuario").style.display = "none"
    mostrarNotificacao("Usuários deletados com sucesso!", "sucesso")
    await carregarUsuarios()
  } catch (error) {
    mostrarNotificacao("Erro ao deletar usuários: " + error.message, "erro")
  } finally {
    if (btnConfirmar) {
      btnConfirmar.disabled = false
      btnConfirmar.innerHTML = '<i class="fas fa-trash"></i> Excluir'
    }
  }
}
