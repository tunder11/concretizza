console.log("[PERMISSION.JS] Arquivo carregado!")

const PERMISSIONS = {
  'head-admin': {
    clientes: ['create', 'read', 'update', 'delete'],
    usuarios: ['create', 'read', 'update', 'delete', 'manage-admins'],
    logs: ['read'],
  },
  admin: {
    clientes: ['create', 'read', 'update', 'delete'],
    usuarios: ['create', 'read', 'update', 'delete'],
    logs: ['read'],
  },
  corretor: {
    clientes: ['create', 'read', 'update', 'delete'],
    usuarios: ['read'],
  },
  visualizar: {
    clientes: ['read'],
    usuarios: [],
  },
}

function obterUsuarioLogado() {
  console.log("[PERMISSION] === INICIANDO obterUsuarioLogado ===")
  const usuarioStr = localStorage.getItem('usuarioLogado')
  console.log("[PERMISSION] localStorage.usuarioLogado string:", usuarioStr)
  
  if (!usuarioStr) {
    console.log("[PERMISSION] AVISO: usuarioLogado não existe no localStorage")
    return null
  }
  
  try {
    const usuario = JSON.parse(usuarioStr)
    console.log("[PERMISSION] Usuário parseado:", usuario)
    console.log("[PERMISSION] usuario.cargo:", usuario?.cargo)
    console.log("[PERMISSION] usuario.cargo type:", typeof usuario?.cargo)
    // console.log("[PERMISSION] usuario.cargo.toLowerCase():", usuario?.cargo?.toLowerCase())
    return usuario
  } catch (e) {
    console.error("[PERMISSION] ERRO ao parsear usuarioLogado:", e)
    return null
  }
}

const getCargosAsArray = (cargo) => {
  if (!cargo) return [];
  if (Array.isArray(cargo)) {
    return cargo.map(c => c.trim());
  }
  return String(cargo).split(',').map(c => c.trim());
};

function obterPermissao(usuario, modulo, acao) {
  if (!usuario || !usuario.cargo) return false
  const cargos = getCargosAsArray(usuario.cargo).map(c => c.toLowerCase());
  
  for (const cargo of cargos) {
      const perms = PERMISSIONS[cargo]
      if (perms && perms[modulo]?.includes(acao)) {
          return true
      }
  }
  return false
}

function podeEditar(modulo = 'clientes') {
  const usuario = obterUsuarioLogado()
  return obterPermissao(usuario, modulo, 'update')
}

function podeVisualizarTudo(modulo = 'clientes') {
  const usuario = obterUsuarioLogado()
  return obterPermissao(usuario, modulo, 'read')
}

function podeCriar(modulo = 'clientes') {
  const usuario = obterUsuarioLogado()
  return obterPermissao(usuario, modulo, 'create')
}

function podeDeletar(modulo = 'clientes') {
  const usuario = obterUsuarioLogado()
  return obterPermissao(usuario, modulo, 'delete')
}

function isAdmin() {
  const usuario = obterUsuarioLogado()
  if (!usuario || !usuario.cargo) return false
  const cargos = getCargosAsArray(usuario.cargo).map(c => c.toLowerCase());
  return cargos.includes('admin')
}

function isHeadAdmin() {
  const usuario = obterUsuarioLogado()
  if (!usuario || !usuario.cargo) return false
  const cargos = getCargosAsArray(usuario.cargo).map(c => c.toLowerCase());
  return cargos.includes('head-admin')
}

function isAdminOrHeadAdmin() {
  const usuario = obterUsuarioLogado()
  console.log("[PERMISSION] obterUsuarioLogado():", usuario)
  if (!usuario || !usuario.cargo) return false
  const cargos = getCargosAsArray(usuario.cargo).map(c => c.toLowerCase());
  console.log("[PERMISSION] cargos:", cargos)
  const result = cargos.includes('admin') || cargos.includes('head-admin')
  console.log("[PERMISSION] isAdminOrHeadAdmin result:", result)
  return result
}

function bloqueado(mensagem = 'Você não tem permissão para realizar esta ação') {
  alert(mensagem)
  return false
}

function formatarCargo(cargo) {
  if (!cargo) return 'User'
  const cargos = getCargosAsArray(cargo)
  
  const mapeamento = {
    'head-admin': 'Head-Admin',
    'admin': 'Admin',
    'corretor': 'Corretor(a)',
    'visualizar': 'Visualizar',
    'visualizador': 'Visualizar',
    'user': 'User'
  }
  
  return cargos.map(c => mapeamento[c.toLowerCase()] || (c.charAt(0).toUpperCase() + c.slice(1))).join(', ')
}

function formatarPermissao(permissao) {
  return formatarCargo(permissao)
}

// Função para configurar a seção de administração em qualquer página
function configurarAdminSection() {
  const usuarioLogado = obterUsuarioLogado()
  const adminSection = document.getElementById("adminSection")

  if (adminSection && usuarioLogado) {
    const cargos = getCargosAsArray(usuarioLogado.cargo).map(c => c.toLowerCase())
    if (cargos.includes("admin") || cargos.includes("head-admin")) {
      adminSection.style.display = "block"
    } else {
      adminSection.style.display = "none"
    }
  }
}

// Função para configurar dados do usuário (nome, cargo) em qualquer página
function configurarDadosUsuario() {
  const usuarioLogado = obterUsuarioLogado()

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

  // Configurar admin section
  configurarAdminSection()
}
