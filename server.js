// server.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Define o caminho ABSOLUTO para a pasta onde seus arquivos frontend (index.html, CSS, JS, etc.) estão localizados.
// Neste caso, é a pasta 'src/pages' a partir da raiz do projeto (onde o server.js está).
const STATIC_FILES_PATH = path.join(__dirname, 'src', 'pages');

// 1. Configura o Express para SERVIR todos os arquivos estáticos (CSS, JS, imagens, etc.)
// que estão dentro da pasta 'src/pages'.
app.use(express.static(STATIC_FILES_PATH));

// 2. Rota principal ('/') para entregar o arquivo index.html.
// Ele será buscado dentro da pasta que definimos acima.
app.get('/', (req, res) => {
    // Usa o caminho base STATIC_FILES_PATH + 'index.html'
    res.sendFile(path.join(STATIC_FILES_PATH, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});