// ===== DADOS COMPARTILHADOS =====
function getClientes() {
  return JSON.parse(localStorage.getItem("clientes")) || []
}

function getAgendamentos() {
  return JSON.parse(localStorage.getItem("agendamentos")) || []
}

function getUsuarios() {
  return (
    JSON.parse(localStorage.getItem("usuarios")) || [
      { username: "admin", senha: "123", nome: "Administrador", role: "Admin" },
      { username: "user", senha: "123", nome: "Usuário", role: "User" },
    ]
  )
}

function salvarClientes(clientes) {
  localStorage.setItem("clientes", JSON.stringify(clientes))
}

function salvarAgendamentos(agendamentos) {
  localStorage.setItem("agendamentos", JSON.stringify(agendamentos))
}

function salvarUsuarios(usuarios) {
  localStorage.setItem("usuarios", JSON.stringify(usuarios))
}

// ===== FUNÇÕES UTILITÁRIAS =====
function formatarData(data) {
  if (!data) return "-"
  const [ano, mes, dia] = data.split("-")
  return `${dia}/${mes}/${ano}`
}

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

function mostrarToast(mensagem, tipo = "success") {
  const toast = document.getElementById("toastNotification")
  if (toast) {
    toast.textContent = mensagem
    toast.className = `toast toast-${tipo} show`

    setTimeout(() => {
      toast.classList.remove("show")
    }, 3000)
  }
}
