function registrarLog(acao, modulo, descricao, usuarioAfetado = null) {
  // Logs agora são gerenciados pelo backend
  console.log('[LOG FRONTEND IGNORADO]', acao, modulo, descricao)
}

function obterLogs() {
  // Retorna vazio pois logs agora vêm da API
  return []
}

function limparLogs() {
  // Não faz nada localmente
}

function exportarLogs() {
  // Exportação deve ser feita via página de logs
  alert("Por favor, utilize a página de Logs para exportar.")
}
