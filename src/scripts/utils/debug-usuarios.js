// Script para debug - verificar permissões dos usuários cadastrados
const usuariosNoStorage = JSON.parse(localStorage.getItem("usuarios")) || []
console.log("[v0] Todos os usuários cadastrados:")
console.log(usuariosNoStorage)

const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado")) || {}
console.log("[v0] Usuário logado atualmente:")
console.log(usuarioLogado)

// Procura especificamente pelo neto
const neto = usuariosNoStorage.find((u) => u.nome === "neto" || u.email?.includes("neto"))
console.log("[v0] Usuário 'neto' encontrado:")
console.log(neto)
