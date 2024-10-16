require('dotenv/config');
process.env.TZ = 'America/Sao_Paulo';
const express = require('express');
const cors = require('cors');
const routes = require("./routes");

const app = express();

// Configuração do CORS
app.use(cors({ origin: '*' }));

// Middleware para analisar requisições JSON e URL-encoded
app.use(express.json());

// Rotas
app.use(routes);

const port = process.env.PORT ?? 3333;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
