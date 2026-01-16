function obterToken() {
  return localStorage.getItem("token")
}

function verificarAutenticacao() {
  const token = obterToken()
  const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado"))
  
  if (!token || !usuarioLogado) {
    window.location.href = "/"
    return false
  }
  return true
}

async function fazerRequisicao(url, options = {}) {
  const token = obterToken()
  
  if (!token) {
    localStorage.removeItem("usuarioLogado")
    window.location.href = "/"
    return null
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    ...options.headers
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    })

    console.log(`[API] ${options.method || 'GET'} ${url} - Status: ${response.status}`)

    if (response.status === 429) {
      console.error("[API] Erro 429 - Muitas requisições (rate limit)")
      throw new Error("Muitas requisições. Tente novamente em alguns segundos.")
    }

    if (response.status === 401) {
      const responseData = await response.json().catch(() => ({}))
      console.error(`[API] Erro ${response.status} - ${responseData.error || 'Token inválido'}`)
      console.log("[API] Token atual:", token?.substring(0, 20) + "...")
      console.log("[API] Usuário logado:", localStorage.getItem("usuarioLogado"))

      localStorage.removeItem("token")
      localStorage.removeItem("usuarioLogado")
      window.location.href = "/"
      return null
    }

    if (response.status === 403) {
      const responseData = await response.json().catch(() => ({}))
      console.error(`[API] Erro ${response.status} - ${responseData.error || 'Permissão negada'}`)
      throw new Error(responseData.error || "Permissão negada")
    }

    const contentType = response.headers.get("content-type")
    let data

    if (contentType && contentType.includes("application/json")) {
      data = await response.json()
    } else {
      const text = await response.text()
      console.warn("[API] Resposta não é JSON:", text.substring(0, 100))
      data = { error: text || "Erro desconhecido" }
    }

    if (!response.ok) {
      console.error(`[API] Erro na resposta:`, data)
      throw new Error(data.error || "Erro na requisição")
    }

    return data
  } catch (error) {
    console.error("[API] Erro na requisição:", error)
    throw error
  }
}

async function obterClientes() {
  return fazerRequisicao("/api/clientes", { method: "GET" })
}

async function criarCliente(cliente) {
  return fazerRequisicao("/api/clientes", {
    method: "POST",
    body: JSON.stringify(cliente)
  })
}

async function atualizarCliente(id, cliente) {
  return fazerRequisicao(`/api/clientes/${id}`, {
    method: "PUT",
    body: JSON.stringify(cliente)
  })
}

async function deletarCliente(id) {
  return fazerRequisicao(`/api/clientes/${id}`, { method: "DELETE" })
}

async function atribuirCliente(id, atribuido_a) {
  return fazerRequisicao(`/api/clientes/${id}/atribuir`, {
    method: "POST",
    body: JSON.stringify({ atribuido_a })
  })
}

async function obterUsuarios() {
  const usuarios = await fazerRequisicao("/api/usuarios", { method: "GET" });
  if (usuarios && Array.isArray(usuarios)) {
    return usuarios.map(u => ({ ...u, cargo: u.permissao, permissao: undefined }));
  }
  return usuarios;
}

async function criarUsuario(usuario) {
  return fazerRequisicao("/api/usuarios", {
    method: "POST",
    body: JSON.stringify(usuario)
  })
}

async function atualizarUsuario(id, usuario) {
  return fazerRequisicao(`/api/usuarios/${id}`, {
    method: "PUT",
    body: JSON.stringify(usuario)
  })
}

async function deletarUsuario(id) {
  console.log("[API] Deletando usuário:", id)
  try {
    const resultado = await fazerRequisicao(`/api/usuarios/${id}`, { method: "DELETE" })
    console.log("[API] Resposta do DELETE:", resultado)
    return resultado
  } catch (error) {
    console.error("[API] Erro ao deletar usuário:", error)
    throw error
  }
}

async function obterAgendamentos() {
  return fazerRequisicao("/api/agendamentos", { method: "GET" })
}

async function criarAgendamento(agendamento) {
  return fazerRequisicao("/api/agendamentos", {
    method: "POST",
    body: JSON.stringify(agendamento)
  })
}

async function atualizarAgendamento(id, agendamento) {
  return fazerRequisicao(`/api/agendamentos/${id}`, {
    method: "PUT",
    body: JSON.stringify(agendamento)
  })
}

async function deletarAgendamento(id) {
  return fazerRequisicao(`/api/agendamentos/${id}`, { method: "DELETE" })
}

async function obterCaptacoes() {
  return fazerRequisicao("/api/captacoes", { method: "GET" })
}

async function criarCaptacao(captacao) {
  return fazerRequisicao("/api/captacoes", {
    method: "POST",
    body: JSON.stringify(captacao)
  })
}

async function atualizarCaptacao(id, captacao) {
  return fazerRequisicao(`/api/captacoes/${id}`, {
    method: "PUT",
    body: JSON.stringify(captacao)
  })
}

async function deletarCaptacao(id) {
  return fazerRequisicao(`/api/captacoes/${id}`, { method: "DELETE" })
}

async function obterHistoricoAtribuicoes(clienteId) {
  return fazerRequisicao(`/api/clientes/${clienteId}/historico-atribuicoes`, { method: "GET" })
}

function fazerLogout() {
  localStorage.removeItem("token")
  localStorage.removeItem("usuarioLogado")
  window.location.href = "/"
}
