require('dotenv/config');
const mysql2 = require("mysql2");

// Criação do pool de conexões com ajustes para produção
const db = mysql2.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,  // Espera por conexões disponíveis
    connectionLimit: 100,       // Limita o número de conexões simultâneas
    queueLimit: 0,             // Sem limite de filas
    connectTimeout: 10000,     // Tempo limite para estabelecer a conexão (10 segundos)    
});

// Tratamento de erros de conexão e logs apropriados
db.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Conexão com o banco de dados foi perdida.');
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('Muitas conexões com o banco de dados.');
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('Conexão com o banco de dados foi recusada.');
        }
        return;
    }

    if (connection) connection.release(); // Libera a conexão após o uso
});

// Exporta o pool de conexões para uso no restante da aplicação
module.exports = db;
