// ============ INICIALIZAÇÃO ============
const canvas = document.getElementById("backgroundCanvas")
const ctx = canvas.getContext("2d")

canvas.width = window.innerWidth
canvas.height = window.innerHeight

let mouseX = canvas.width / 2
let mouseY = canvas.height / 2

const particles = []
const particleCount = 80

class Particle {
  constructor() {
    this.x = Math.random() * canvas.width
    this.y = Math.random() * canvas.height
    this.size = Math.random() * 2 + 0.5
    this.speedX = Math.random() * 0.5 - 0.25
    this.speedY = Math.random() * 0.5 - 0.25
    this.opacity = Math.random() * 0.5 + 0.2
  }

  update() {
    const dx = mouseX - this.x
    const dy = mouseY - this.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const maxDistance = 200

    if (distance < maxDistance) {
      const force = (maxDistance - distance) / maxDistance
      this.x -= (dx / distance) * force * 2
      this.y -= (dy / distance) * force * 2
    }

    this.x += this.speedX
    this.y += this.speedY

    if (this.x < 0 || this.x > canvas.width) this.speedX *= -1
    if (this.y < 0 || this.y > canvas.height) this.speedY *= -1
  }

  draw() {
    ctx.fillStyle = `rgba(255, 215, 0, ${this.opacity})`
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

for (let i = 0; i < particleCount; i++) {
  particles.push(new Particle())
}

function animateBackground() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.05)"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  particles.forEach((particle) => {
    particle.update()
    particle.draw()
  })

  particles.forEach((particle, i) => {
    particles.slice(i + 1).forEach((otherParticle) => {
      const dx = particle.x - otherParticle.x
      const dy = particle.y - otherParticle.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 100) {
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.15 * (1 - distance / 100)})`
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(particle.x, particle.y)
        ctx.lineTo(otherParticle.x, otherParticle.y)
        ctx.stroke()
      }
    })
  })

  requestAnimationFrame(animateBackground)
}

animateBackground()

document.addEventListener("mousemove", (e) => {
  mouseX = e.clientX
  mouseY = e.clientY
})

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
})

// ============ GERENCIAMENTO DE DADOS ============

class DataManager {
  constructor() {
    this.loadData()
    this.initializeDefaults()
  }

  loadData() {
    this.usuarios = JSON.parse(localStorage.getItem("usuarios")) || []
    this.clientes = JSON.parse(localStorage.getItem("clientes")) || []
    this.permissoes = JSON.parse(localStorage.getItem("permissoes")) || []
    this.usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado")) || null
  }

  saveData() {
    localStorage.setItem("usuarios", JSON.stringify(this.usuarios))
    localStorage.setItem("clientes", JSON.stringify(this.clientes))
    localStorage.setItem("permissoes", JSON.stringify(this.permissoes))
    localStorage.setItem("usuarioLogado", JSON.stringify(this.usuarioLogado))
  }

  initializeDefaults() {
    if (this.usuarios.length === 0) {
      this.usuarios = [
        { id: 1, username: "admin", password: "1234", nome: "Administrador", tipo: "admin" },
        { id: 2, username: "user1", password: "1234", nome: "Usuário 1", tipo: "comum" },
      ]
      this.saveData()
    }
  }

  autenticar(username, password) {
    const usuario = this.usuarios.find((u) => u.username === username && u.password === password)
    if (usuario) {
      this.usuarioLogado = usuario
      this.saveData()
      return usuario
    }
    return null
  }

  logout() {
    this.usuarioLogado = null
    this.saveData()
  }

  criarUsuario(username, password, nome) {
    const id = Math.max(...this.usuarios.map((u) => u.id || 0), 0) + 1
    const usuario = { id, username, password, nome, tipo: "comum" }
    this.usuarios.push(usuario)
    this.saveData()
    return usuario
  }

  criarCliente(nome, telefone, email, endereco, criadoPor) {
    const id = Math.max(...this.clientes.map((c) => c.id || 0), 0) + 1
    const cliente = { id, nome, telefone, email, endereco, criadoPor, data: new Date().toLocaleDateString() }
    this.clientes.push(cliente)
    this.saveData()
    return cliente
  }

  atribuirClienteAUsuario(clienteId, usuarioId) {
    let permissao = this.permissoes.find((p) => p.clienteId === clienteId && p.usuarioId === usuarioId)
    if (!permissao) {
      permissao = { clienteId, usuarioId, atribuido: true }
      this.permissoes.push(permissao)
      this.saveData()
    }
  }

  revogarPermissao(clienteId, usuarioId) {
    this.permissoes = this.permissoes.filter((p) => !(p.clienteId === clienteId && p.usuarioId === usuarioId))
    this.saveData()
  }

  getClientesVisiveis() {
    const usuario = this.usuarioLogado
    if (usuario.tipo === "admin") {
      return this.clientes
    }
    // Usuário comum vê só seus clientes + os atribuídos
    return this.clientes.filter(
      (c) =>
        c.criadoPor === usuario.id ||
        this.permissoes.some((p) => p.clienteId === c.id && p.usuarioId === usuario.id && p.atribuido),
    )
  }

  getUsuariosComuns() {
    return this.usuarios.filter((u) => u.tipo === "comum")
  }

  getNomeUsuario(usuarioId) {
    const usuario = this.usuarios.find((u) => u.id === usuarioId)
    return usuario ? usuario.nome : "Desconhecido"
  }

  deletarUsuario(usuarioId) {
    this.usuarios = this.usuarios.filter((u) => u.id !== usuarioId)
    this.saveData()
  }

  deletarCliente(clienteId) {
    this.clientes = this.clientes.filter((c) => c.id !== clienteId)
    this.permissoes = this.permissoes.filter((p) => p.clienteId !== clienteId)
    this.saveData()
  }
}

const dataManager = new DataManager()

// ============ HANDLERS DE AUTENTICAÇÃO ============

function handleLogin(event) {
  event.preventDefault()
  const username = document.getElementById("username").value
  const password = document.getElementById("password").value
  const errorEl = document.getElementById("loginError")

  const usuario = dataManager.autenticar(username, password)
  if (usuario) {
    mostrarDashboard(usuario)
  } else {
    errorEl.textContent = "Usuário ou senha inválidos"
    setTimeout(() => {
      errorEl.textContent = ""
    }, 3000)
  }
}

function handleLogout() {
  dataManager.logout()
  mostrarLogin()
}

// ============ NAVEGAÇÃO ============

function mostrarLogin() {
  document.getElementById("loginScreen").classList.add("active")
  document.getElementById("dashboardScreen").classList.remove("active")
  document.getElementById("loginForm").reset()
}

function mostrarDashboard(usuario) {
  document.getElementById("loginScreen").classList.remove("active")
  document.getElementById("dashboardScreen").classList.add("active")

  // Atualizar informações do usuário
  document.getElementById("userName").textContent = usuario.nome
  document.getElementById("userRole").textContent = usuario.tipo === "admin" ? "Administrador" : "Usuário"
  document.getElementById("userAvatar").textContent = usuario.nome.charAt(0).toUpperCase()

  // Mostrar/esconder menus
  document.getElementById("adminMenu").style.display = usuario.tipo === "admin" ? "block" : "none"
  document.getElementById("userMenu").style.display = usuario.tipo === "admin" ? "none" : "block"

  // Carregar dashboard
  carregarPagina("dashboard")

  // Setup menu
  setupMenu()
}

function setupMenu() {
  const menuItems = document.querySelectorAll(".menu-item")
  menuItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      menuItems.forEach((m) => m.classList.remove("active"))
      item.classList.add("active")
      const pageName = item.dataset.page
      carregarPagina(pageName)
    })
  })
}

function carregarPagina(pageName) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"))
  document.getElementById(pageName + "Page").classList.add("active")

  if (pageName === "dashboard") carregarDashboard()
  if (pageName === "clientes") carregarClientes()
  if (pageName === "usuarios") carregarUsuarios()
  if (pageName === "permissoes") carregarPermissoes()
}

// ============ DASHBOARD ============

function carregarDashboard() {
  const usuario = dataManager.usuarioLogado
  const clientesVisiveis = dataManager.getClientesVisiveis()

  const totalClientes = clientesVisiveis.length
  const clientesCriados = clientesVisiveis.filter((c) => c.criadoPor === usuario.id).length
  const clientesAtribuidos = clientesVisiveis.length - clientesCriados

  const stats = [
    { label: "Total de Clientes", valor: totalClientes },
    { label: "Clientes Criados", valor: clientesCriados },
    { label: "Clientes Atribuídos", valor: clientesAtribuidos },
    { label: "Usuários", valor: usuario.tipo === "admin" ? dataManager.usuarios.length : 1 },
  ]

  const statsGrid = document.getElementById("statsGrid")
  statsGrid.innerHTML = stats
    .map(
      (stat) => `
        <div class="stat-card">
            <div class="stat-label">${stat.label}</div>
            <div class="stat-value">${stat.valor}</div>
        </div>
    `,
    )
    .join("")
}

// ============ CLIENTES ============

function carregarClientes() {
  const clientesVisiveis = dataManager.getClientesVisiveis()
  const tbody = document.getElementById("clientesTbody")

  tbody.innerHTML = clientesVisiveis
    .map(
      (cliente) => `
        <tr>
            <td>${cliente.nome}</td>
            <td>${cliente.telefone}</td>
            <td>${cliente.email}</td>
            <td>${dataManager.getNomeUsuario(cliente.criadoPor)}</td>
            <td>${cliente.data}</td>
            <td>
                <div class="actions">
                    <button class="btn btn-sm" onclick="editarCliente(${cliente.id})">Editar</button>
                    <button class="btn btn-sm" onclick="deletarCliente(${cliente.id})">Deletar</button>
                </div>
            </td>
        </tr>
    `,
    )
    .join("")
}

function openClienteModal() {
  document.getElementById("clienteModal").classList.add("active")
}

function closeClienteModal() {
  document.getElementById("clienteModal").classList.remove("active")
  document.getElementById("clienteNome").value = ""
  document.getElementById("clienteTelefone").value = ""
  document.getElementById("clienteEmail").value = ""
  document.getElementById("clienteEndereco").value = ""
}

function handleSaveCliente(event) {
  event.preventDefault()
  const nome = document.getElementById("clienteNome").value
  const telefone = document.getElementById("clienteTelefone").value
  const email = document.getElementById("clienteEmail").value
  const endereco = document.getElementById("clienteEndereco").value

  dataManager.criarCliente(nome, telefone, email, endereco, dataManager.usuarioLogado.id)
  closeClienteModal()
  carregarClientes()
}

function deletarCliente(clienteId) {
  if (confirm("Tem certeza que deseja deletar este cliente?")) {
    dataManager.deletarCliente(clienteId)
    carregarClientes()
  }
}

// ============ USUÁRIOS (ADMIN ONLY) ============

function carregarUsuarios() {
  const usuarios = dataManager.getUsuariosComuns()
  const grid = document.getElementById("usersGrid")

  grid.innerHTML = usuarios
    .map(
      (usuario) => `
        <div class="user-card">
            <div class="user-card-avatar">${usuario.nome.charAt(0).toUpperCase()}</div>
            <div class="user-card-name">${usuario.nome}</div>
            <div class="user-card-username">@${usuario.username}</div>
            <div class="user-card-actions">
                <button class="btn btn-sm btn-secondary" onclick="deletarUsuario(${usuario.id})">Deletar</button>
            </div>
        </div>
    `,
    )
    .join("")
}

function openNovoUsuarioModal() {
  document.getElementById("usuarioModal").classList.add("active")
}

function closeUsuarioModal() {
  document.getElementById("usuarioModal").classList.remove("active")
  document.getElementById("usuarioUsername").value = ""
  document.getElementById("usuarioPassword").value = ""
  document.getElementById("usuarioNome").value = ""
}

function handleSaveUsuario(event) {
  event.preventDefault()
  const username = document.getElementById("usuarioUsername").value
  const password = document.getElementById("usuarioPassword").value
  const nome = document.getElementById("usuarioNome").value

  dataManager.criarUsuario(username, password, nome)
  closeUsuarioModal()
  carregarUsuarios()
}

function deletarUsuario(usuarioId) {
  if (confirm("Tem certeza que deseja deletar este usuário?")) {
    dataManager.deletarUsuario(usuarioId)
    carregarUsuarios()
  }
}

// ============ PERMISSÕES (ADMIN ONLY) ============

function carregarPermissoes() {
  const usuarios = dataManager.getUsuariosComuns()
  const clientes = dataManager.clientes
  const container = document.getElementById("permissionsContainer")

  container.innerHTML = usuarios
    .map(
      (usuario) => `
        <div class="permission-section">
            <div class="permission-section-title">
                <span>${usuario.nome}</span>
            </div>
            <div class="permission-items">
                ${clientes
                  .map((cliente) => {
                    const temPermissao = dataManager.permissoes.some(
                      (p) => p.clienteId === cliente.id && p.usuarioId === usuario.id && p.atribuido,
                    )
                    const ehCriador = cliente.criadoPor === usuario.id
                    return `
                        <div class="permission-item">
                            <div class="permission-item-info">
                                <div class="permission-item-name">${cliente.nome}</div>
                                <div class="permission-item-client">${ehCriador ? "(Criado por este usuário)" : ""}</div>
                            </div>
                            <input 
                                type="checkbox" 
                                class="permission-checkbox"
                                ${temPermissao || ehCriador ? "checked" : ""}
                                ${ehCriador ? "disabled" : ""}
                                onchange="alterarPermissao(${cliente.id}, ${usuario.id}, this.checked)"
                            >
                        </div>
                    `
                  })
                  .join("")}
            </div>
        </div>
    `,
    )
    .join("")
}

function alterarPermissao(clienteId, usuarioId, concedido) {
  if (concedido) {
    dataManager.atribuirClienteAUsuario(clienteId, usuarioId)
  } else {
    dataManager.revogarPermissao(clienteId, usuarioId)
  }
}

// Fechar modals ao clicar fora
window.addEventListener("click", (event) => {
  const clienteModal = document.getElementById("clienteModal")
  const usuarioModal = document.getElementById("usuarioModal")

  if (event.target === clienteModal) clienteModal.classList.remove("active")
  if (event.target === usuarioModal) usuarioModal.classList.remove("active")
})

// Inicializar com tela de login
mostrarLogin()
