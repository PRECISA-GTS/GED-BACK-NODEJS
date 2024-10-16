const db = require('./db');

const executeLog = async (nome, usuarioID, unidadeID, req) => {
    try {
        // Simule o cabeçalho x-forwarded-for para ambiente local
        const ip = (req && req.headers && req.headers['x-forwarded-for']) || (req && req.connection && req.connection.remoteAddress) || 'localhost';

        // Construa a query de inserção na tabela de log
        const sqlInsertLog = 'INSERT INTO log (nome, usuarioID, unidadeID, dataHora, ip) VALUES (?, ?, ?, ?, ?)';

        const [results] = await db.promise().query(sqlInsertLog, [nome, usuarioID, unidadeID, new Date(), ip]);
        const id = results.insertId
        return id

    } catch (error) {
        console.error('Erro ao inserir log no banco de dados:', error);
    }
}

const executeQuery = async (sql, params, operation, tableName, uniqueColumnName, id, logID, objEmail = null, loginObj = null) => {
    try {
        let changeData = null;

        if (operation === 'email') {
            changeData = getChangedData(null, null, operation, objEmail, null);
        } else if (operation === 'login') {
            changeData = getChangedData(null, null, operation, null, loginObj);
        } else {
            const sqlSelect = `SELECT * FROM ${tableName} WHERE ${uniqueColumnName} = ?`;

            // Obtém os dados antes da operação
            const [rowsBefore] = await db.promise().query(sqlSelect, [id]);

            if (operation === 'delete' && rowsBefore.length === 0) {
                console.log(`No record found at [${tableName}] with [${uniqueColumnName}] = [${id}] to delete.`);
                return null; // Registro não encontrado para exclusão
            }

            // Executa a query de inserção, atualização ou exclusão
            const [results] = await db.promise().query(sql, params);
            if (operation === 'insert') {
                id = results.insertId;
            }

            // Obtém os dados após a operação
            const [rowsAfter] = await db.promise().query(sqlSelect, [id]);
            changeData = getChangedData(rowsBefore, rowsAfter, operation, null);
        }

        // Registra a operação no log
        await logDatabaseOperation(operation, tableName, changeData, logID);

        return id;
    } catch (err) {
        console.error('Error executing query:', err);
        throw err; // Lança o erro para tratamento superior
    }
};

const getChangedData = (beforeData, afterData, operation, objEmail, loginObj) => {
    switch (operation) {
        case 'email':
            return objEmail
            break
        case 'login':
            return loginObj
            break
        case 'insert':
            return afterData[0]
            break
        case 'update':

            const changedData = {};

            for (const key in afterData[0]) {
                if (beforeData[0][key] != afterData[0][key]) {
                    changedData[key] = {
                        alterado: true,
                        antes: beforeData[0][key],
                        depois: afterData[0][key],
                    };
                } else {
                    changedData[key] = beforeData[0][key]
                }

            }

            return changedData

            break
        case 'delete':
            return beforeData[0]
            break

    }

    return false
}

const logDatabaseOperation = async (operation, tableName, changeData, logID) => {
    try {
        // Construa a query de inserção na tabela de log
        const sqlInsertLog = 'INSERT INTO log_script (logID, operacao, tabela, alteracao) VALUES (?, ?, ?, ?)';

        await db.promise().query(sqlInsertLog, [logID, operation, tableName, JSON.stringify(changeData)]);

    } catch (error) {
        console.error('Erro ao inserir log no banco de dados:', error);
    }
};

module.exports = { executeQuery, executeLog };