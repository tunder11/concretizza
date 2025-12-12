function mostrarNotificacao(mensagem, tipo = 'info', duracao = 4000) {
  const container = document.getElementById("toastNotification")
  if (!container) return

  container.innerHTML = ''
  container.className = `toast toast-${tipo}`
  
  const icones = {
    sucesso: 'fa-check-circle',
    erro: 'fa-exclamation-circle',
    aviso: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  }
  
  const icone = icones[tipo] || icones.info
  
  container.innerHTML = `
    <div class="toast-content">
      <i class="fas ${icone}"></i>
      <span>${mensagem}</span>
    </div>
  `
  
  container.style.display = 'flex'
  
  if (duracao > 0) {
    setTimeout(() => {
      container.style.display = 'none'
    }, duracao)
  }
}

function obterUsuarioLogado() {
  const usuarioStr = localStorage.getItem("usuarioLogado")
  return usuarioStr ? JSON.parse(usuarioStr) : null
}

function obterPermissao(usuario, modulo, acao) {
  if (!usuario || !usuario.cargo) return false
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
    editor: {
      clientes: ['create', 'read', 'update', 'delete'],
      usuarios: ['read'],
    },
    visualizar: {
      clientes: ['read'],
      usuarios: [],
    },
  }
  const perms = PERMISSIONS[usuario.cargo.toLowerCase()]
  if (!perms) return false
  return perms[modulo]?.includes(acao) || false
}
