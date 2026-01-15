document.addEventListener("DOMContentLoaded", () => {
  verificarAutenticacao()
  carregarDadosUsuario()
  inicializarPagina()
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
    const cargos = usuarioLogado.cargo?.toLowerCase().split(',').map(c => c.trim())
    isAdminUser = cargos.includes("admin") || cargos.includes("head-admin")

    if (adminSection) {
      if (isAdminUser) {
        adminSection.style.display = "block"
      } else {
        adminSection.style.display = "none"
      }
    }

    // Hide corretor column and form field for non-admin users
    const corretorHeader = document.querySelector("#agendamentosTable thead tr th:nth-child(2)")
    const corretorFormGroup = document.querySelector("#agendamentoCorretor").closest(".form-group")

    if (corretorHeader) {
      corretorHeader.style.display = isAdminUser ? "" : "none"
    }

    if (corretorFormGroup) {
      corretorFormGroup.style.display = isAdminUser ? "" : "none"
    }
  }
}

function formatarCargo(cargo) {
  if (!cargo) return ""
  const cargos = cargo.split(',').map(c => c.trim())
  const map = {
    "head-admin": "Head Admin",
    admin: "Administrador",
    padrao: "Corretor",
  }
  return cargos.map(c => map[c.toLowerCase()] || c).join(", ")
}

let agendamentos = []
let clientes = []
let corretores = []
let chartInstance = null
let agendamentoEmEdicao = null
let agendamentoParaExcluir = null
let isAdminUser = false

async function inicializarPagina() {
  configurarEventos()
  await carregarClientes()
  await carregarCorretores()
  await carregarAgendamentos()
}

async function carregarClientes() {
  try {
    if (typeof obterClientes === 'function') {
        clientes = await obterClientes()
    } else {
        console.warn("Função obterClientes não encontrada")
        clientes = []
    }

    const selectCliente = document.getElementById("agendamentoCliente")
    if (selectCliente) {
        selectCliente.innerHTML = '<option value="">Selecione um cliente</option>'

        // Mostrar todos os clientes
        clientes.forEach(cliente => {
            const option = document.createElement("option")
            option.value = cliente.id
            option.textContent = cliente.nome
            selectCliente.appendChild(option)
        })
    }
  } catch (error) {
    console.error("Erro ao carregar clientes:", error)
    mostrarToast("Erro ao carregar clientes", "erro")
  }
}

async function carregarCorretores() {
  try {
    if (typeof fazerRequisicao === 'function') {
        corretores = await fazerRequisicao("/api/corretores", { method: "GET" })
    } else {
        console.warn("Função fazerRequisicao não encontrada")
        corretores = []
    }

    const selectCorretor = document.getElementById("agendamentoCorretor")
    if (selectCorretor) {
        selectCorretor.innerHTML = '<option value="">Selecione um corretor (opcional)</option>'

        // Filtrar apenas usuários com permissão de corretor e status ativo
        const corretoresFiltrados = corretores.filter(c =>
            c.status === 'ativo' &&
            c.permissao &&
            c.permissao.toLowerCase().includes('corretor')
        )

        corretoresFiltrados.forEach(corretor => {
            const option = document.createElement("option")
            option.value = corretor.id
            option.textContent = corretor.nome
            selectCorretor.appendChild(option)
        })
    }
  } catch (error) {
    console.error("Erro ao carregar corretores:", error)
    mostrarToast("Erro ao carregar corretores", "erro")
  }
}

async function carregarAgendamentos() {
  try {
    if (typeof obterAgendamentos === 'function') {
        agendamentos = await obterAgendamentos()
    } else {
        console.warn("Função obterAgendamentos não encontrada")
        agendamentos = []
    }

    atualizarEstatisticas()
    renderizarTabela()
  } catch (error) {
    console.error("Erro ao carregar agendamentos:", error)
    mostrarToast("Erro ao carregar agendamentos", "erro")
  }
}

function atualizarEstatisticas() {
  const total = agendamentos.length
  
  const hoje = new Date()
  const proximaSemana = new Date(hoje)
  proximaSemana.setDate(proximaSemana.getDate() + 7)
  
  const proximos = agendamentos.filter(a => {
    const dataAgendamento = new Date(a.data)
    return dataAgendamento >= new Date(hoje.toISOString().split('T')[0]) && 
           dataAgendamento <= proximaSemana && 
           a.status === 'agendado'
  }).length
  
  const concluidos = agendamentos.filter(a => a.status === 'concluido').length
  const cancelados = agendamentos.filter(a => a.status === 'cancelado').length
  
  document.getElementById("totalAgendamentos").textContent = total
  document.getElementById("agendamentosProximos").textContent = proximos
  document.getElementById("agendamentosConcluidos").textContent = concluidos
  document.getElementById("agendamentosCancelados").textContent = cancelados
}

function renderizarTabela() {
  const tbody = document.getElementById("agendamentosTable")
  const termoBusca = document.getElementById("searchAgendamentos").value.toLowerCase()
  const filtroData = document.getElementById("filterData").value
  const filtroStatus = document.getElementById("filterStatus").value
  const filtroTipo = document.getElementById("filterTipo").value

  let filtrados = agendamentos.filter(a => {
    const clienteNome = a.cliente_nome || a.cliente || ""
    const matchBusca = clienteNome.toLowerCase().includes(termoBusca) ||
                       (a.observacoes && a.observacoes.toLowerCase().includes(termoBusca)) ||
                       (a.local && a.local.toLowerCase().includes(termoBusca))

    const matchData = !filtroData || a.data === filtroData
    const matchStatus = !filtroStatus || a.status === filtroStatus
    const matchTipo = !filtroTipo || a.tipo === filtroTipo

    return matchBusca && matchData && matchStatus && matchTipo
  })

  // Ordenar por data e hora
  filtrados.sort((a, b) => {
    const dataA = new Date(a.data + 'T' + a.hora)
    const dataB = new Date(b.data + 'T' + b.hora)
    return dataA - dataB
  })

  const colspan = isAdminUser ? "8" : "7"

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center">Nenhum agendamento encontrado</td></tr>`
    return
  }

  tbody.innerHTML = filtrados.map(a => {
    const corretorNome = a.corretor_nome || a.usuario_nome || '-'
    const corretorCell = isAdminUser ? `<td>${corretorNome}</td>` : ''

    return `
    <tr>
      <td>${a.cliente_nome || a.cliente || '-'}</td>
      ${corretorCell}
      <td>${formatarData(a.data)}</td>
      <td>${a.hora}</td>
      <td>${formatarTipo(a.tipo)}</td>
      <td><span class="badge badge-${a.status}">${formatarStatus(a.status)}</span></td>
      <td>${a.local || '-'}</td>
      <td>
        <button class="btn-action btn-edit" onclick="editarAgendamento(${a.id})">
          <i class="fas fa-edit"></i> Editar
        </button>
        <button class="btn-action btn-delete" onclick="excluirAgendamento(${a.id})">
          <i class="fas fa-trash"></i> Excluir
        </button>
      </td>
    </tr>
  `}).join('')
}

function renderizarGrafico() {
  const ctx = document.getElementById('agendamentosChart').getContext('2d')
  const periodo = document.getElementById('chartPeriod').value
  
  let labels = []
  let dataVisitas = []
  let dataReunioes = []
  let dataOutros = []
  
  const hoje = new Date()
  
  if (periodo === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje)
      d.setDate(d.getDate() - i)
      const dataStr = d.toISOString().split('T')[0]
      labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))
      
      dataVisitas.push(agendamentos.filter(a => a.data === dataStr && a.tipo === 'visita').length)
      dataReunioes.push(agendamentos.filter(a => a.data === dataStr && a.tipo === 'reuniao').length)
      dataOutros.push(agendamentos.filter(a => a.data === dataStr && !['visita', 'reuniao'].includes(a.tipo)).length)
    }
  } else if (periodo === 'month') {
    // Agrupar por semana ou dias (simplificado para últimos 30 dias em intervalos de 5 dias)
    for (let i = 25; i >= 0; i-=5) {
        const d = new Date(hoje)
        d.setDate(d.getDate() - i)
        const dataStr = d.toISOString().split('T')[0]
        labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))
        
        // Contagem aproximada para o intervalo (apenas para visualização)
        // Em produção, faria uma agregação melhor
        dataVisitas.push(agendamentos.filter(a => a.data === dataStr && a.tipo === 'visita').length)
        dataReunioes.push(agendamentos.filter(a => a.data === dataStr && a.tipo === 'reuniao').length)
        dataOutros.push(agendamentos.filter(a => a.data === dataStr && !['visita', 'reuniao'].includes(a.tipo)).length)
    }
  } else {
    // Year - Agrupar por mês
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    labels = meses
    
    // Mock logic for year view since we might not have enough data
    dataVisitas = Array(12).fill(0)
    dataReunioes = Array(12).fill(0)
    dataOutros = Array(12).fill(0)
    
    agendamentos.forEach(a => {
        const mes = new Date(a.data).getMonth()
        if (a.tipo === 'visita') dataVisitas[mes]++
        else if (a.tipo === 'reuniao') dataReunioes[mes]++
        else dataOutros[mes]++
    })
  }
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Visitas',
          data: dataVisitas,
          backgroundColor: 'rgba(255, 215, 0, 0.7)',
          borderColor: 'rgba(255, 215, 0, 1)',
          borderWidth: 1
        },
        {
          label: 'Reuniões',
          data: dataReunioes,
          backgroundColor: 'rgba(100, 200, 255, 0.7)',
          borderColor: 'rgba(100, 200, 255, 1)',
          borderWidth: 1
        },
        {
          label: 'Outros',
          data: dataOutros,
          backgroundColor: 'rgba(200, 200, 200, 0.7)',
          borderColor: 'rgba(200, 200, 200, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#ffffff'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#cccccc',
            stepSize: 1
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        x: {
          ticks: {
            color: '#cccccc'
          },
          grid: {
            display: false
          }
        }
      }
    }
  })
}

function configurarEventos() {
  // Sidebar toggle
  const sidebarToggle = document.getElementById("sidebarToggleMobile")
  const sidebar = document.querySelector(".sidebar")
  const sidebarClose = document.getElementById("sidebarToggle")

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.add("active")
    })
  }
  
  if (sidebarClose) {
    sidebarClose.addEventListener("click", () => {
      sidebar.classList.remove("active")
    })
  }

  // Logout
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

  // Modal Novo/Editar
  const btnNovo = document.getElementById("btnNovoAgendamento")
  const modal = document.getElementById("modalAgendamento")
  const closeModal = document.getElementById("closeModal")
  const cancelBtn = modal.querySelector(".modal-close-btn")
  
  if (btnNovo) {
    btnNovo.addEventListener("click", () => {
      agendamentoEmEdicao = null
      document.getElementById("formAgendamento").reset()
      document.getElementById("modalTitle").textContent = "Novo Agendamento"
      modal.classList.add("show")
    })
  }
  
  if (closeModal) {
    closeModal.addEventListener("click", () => {
      modal.classList.remove("show")
    })
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.classList.remove("show")
    })
  }
  
  // Modal Exclusão
  const modalExclusao = document.getElementById("modalConfirmacaoExclusao")
  const closeExclusao = document.getElementById("closeConfirmacaoExclusao")
  const cancelExclusao = document.getElementById("btnCancelarExclusao")
  const confirmExclusao = document.getElementById("btnConfirmarExclusao")
  
  if (closeExclusao) {
    closeExclusao.addEventListener("click", () => {
      modalExclusao.classList.remove("show")
      agendamentoParaExcluir = null
    })
  }
  
  if (cancelExclusao) {
    cancelExclusao.addEventListener("click", () => {
      modalExclusao.classList.remove("show")
      agendamentoParaExcluir = null
    })
  }
  
  if (confirmExclusao) {
    confirmExclusao.addEventListener("click", confirmarExclusao)
  }
  
  // Form submit
  const form = document.getElementById("formAgendamento")
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault()
      salvarAgendamento()
    })
  }
  
  // Filters
  const inputs = ["searchAgendamentos", "filterData", "filterStatus", "filterTipo"]
  inputs.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      el.addEventListener("input", renderizarTabela)
      el.addEventListener("change", renderizarTabela)
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
  
  // Chart Period - removed since chart was removed
}

async function salvarAgendamento() {
  const clienteId = document.getElementById("agendamentoCliente").value
  const corretorId = isAdminUser ? document.getElementById("agendamentoCorretor").value : null

  if (!clienteId) {
    mostrarToast("Selecione um cliente", "erro")
    return
  }

  const dadosAgendamento = {
    cliente_id: clienteId,
    corretor_id: corretorId || null,
    data: document.getElementById("agendamentoData").value,
    hora: document.getElementById("agendamentoHora").value,
    tipo: document.getElementById("agendamentoTipo").value,
    status: document.getElementById("agendamentoStatus").value,
    local: document.getElementById("agendamentoLocal").value,
    observacoes: document.getElementById("agendamentoObservacoes").value
  }

  try {
    if (agendamentoEmEdicao) {
        await atualizarAgendamento(agendamentoEmEdicao, dadosAgendamento)
        mostrarToast("Agendamento atualizado com sucesso!", "sucesso")
    } else {
        await criarAgendamento(dadosAgendamento)
        mostrarToast("Agendamento criado com sucesso!", "sucesso")
    }

    document.getElementById("modalAgendamento").classList.remove("show")
    await carregarAgendamentos()
  } catch (error) {
    console.error("Erro ao salvar agendamento:", error)
    mostrarToast("Erro ao salvar: " + error.message, "erro")
  }
}

// Expose functions to global scope for onclick handlers
window.editarAgendamento = function(id) {
  const agendamento = agendamentos.find(a => a.id === id)
  if (!agendamento) return

  agendamentoEmEdicao = id

  const selectCliente = document.getElementById("agendamentoCliente")
  const selectCorretor = document.getElementById("agendamentoCorretor")

  // Verificar se o cliente está na lista (pode ter sido filtrado se não estiver em atendimento)
  const clienteNaLista = Array.from(selectCliente.options).some(opt => opt.value == agendamento.cliente_id)

  if (!clienteNaLista) {
      const cliente = clientes.find(c => c.id == agendamento.cliente_id)
      if (cliente) {
          const option = document.createElement("option")
          option.value = cliente.id
          option.textContent = cliente.nome
          selectCliente.appendChild(option)
      }
  }

  // Verificar se o corretor está na lista
  if (agendamento.corretor_id) {
    const corretorNaLista = Array.from(selectCorretor.options).some(opt => opt.value == agendamento.corretor_id)

    if (!corretorNaLista) {
        const corretor = corretores.find(c => c.id == agendamento.corretor_id)
        if (corretor) {
            const option = document.createElement("option")
            option.value = corretor.id
            option.textContent = corretor.nome
            selectCorretor.appendChild(option)
        }
    }
  }

  selectCliente.value = agendamento.cliente_id

  // Only set corretor value if user is admin
  if (isAdminUser) {
    selectCorretor.value = agendamento.corretor_id || ""
  }

  document.getElementById("agendamentoData").value = agendamento.data
  document.getElementById("agendamentoHora").value = agendamento.hora
  document.getElementById("agendamentoTipo").value = agendamento.tipo
  document.getElementById("agendamentoStatus").value = agendamento.status
  document.getElementById("agendamentoLocal").value = agendamento.local || ""
  document.getElementById("agendamentoObservacoes").value = agendamento.observacoes || ""

  document.getElementById("modalTitle").textContent = "Editar Agendamento"
  document.getElementById("modalAgendamento").classList.add("show")
}

window.excluirAgendamento = function(id) {
  agendamentoParaExcluir = id
  const agendamento = agendamentos.find(a => a.id === id)
  if (agendamento) {
    const nomeCliente = agendamento.cliente_nome || agendamento.cliente || "Cliente desconhecido"
    const dataFormatada = formatarData(agendamento.data)
    document.getElementById("detalhesAgendamentoExcluir").textContent = `${nomeCliente} em ${dataFormatada}`
  }
  document.getElementById("modalConfirmacaoExclusao").classList.add("show")
}

async function confirmarExclusao() {
  if (!agendamentoParaExcluir) return
  
  try {
    await deletarAgendamento(agendamentoParaExcluir)
    mostrarToast("Agendamento excluído!", "sucesso")
    document.getElementById("modalConfirmacaoExclusao").classList.remove("show")
    agendamentoParaExcluir = null
    await carregarAgendamentos()
  } catch (error) {
    console.error("Erro ao excluir agendamento:", error)
    mostrarToast("Erro ao excluir: " + error.message, "erro")
  }
}

function formatarData(data) {
  if (!data) return "-"
  const d = new Date(data)
  // Ajuste de fuso horário para exibir corretamente a data (evitar dia anterior)
  const userTimezoneOffset = d.getTimezoneOffset() * 60000
  const adjustedDate = new Date(d.getTime() + userTimezoneOffset)
  return adjustedDate.toLocaleDateString("pt-BR")
}

function formatarTipo(tipo) {
  const map = {
    visita: "Visita",
    reuniao: "Reunião",
    assinatura: "Assinatura",
    outro: "Outro"
  }
  return map[tipo] || tipo
}

function formatarStatus(status) {
  const map = {
    agendado: "Agendado",
    concluido: "Concluído",
    cancelado: "Cancelado"
  }
  return map[status] || status
}

function mostrarToast(mensagem, tipo = "info") {
  const toast = document.getElementById("toastNotification")
  let icon = "info-circle"
  
  if (tipo === "sucesso") icon = "check-circle"
  if (tipo === "erro") icon = "exclamation-circle"
  if (tipo === "aviso") icon = "exclamation-triangle"
  
  toast.className = `toast toast-${tipo} show`
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas fa-${icon}"></i>
      <span>${mensagem}</span>
    </div>
  `
  
  setTimeout(() => {
    toast.classList.remove("show")
  }, 3000)
}
