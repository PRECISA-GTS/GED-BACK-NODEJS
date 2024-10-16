const db = require('../config/db');
const { executeQuery } = require('../config/executeQuery');
require('dotenv/config')
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const timeZone = 'America/Sao_Paulo'

const addFormStatusMovimentation = async (parFormularioID, id, usuarioID, unidadeID, papelID, statusAtual, observacao) => {
    // Verifica se todos os parâmetros obrigatórios estão presentes
    if (!parFormularioID || !id || !usuarioID || !unidadeID || !papelID || !statusAtual) {
        return false;
    }

    try {
        // Consulta SQL com placeholders para evitar injeção de SQL
        const sql = `
            INSERT INTO movimentacaoformulario 
            (parFormularioID, id, usuarioID, unidadeID, papelID, dataHora, statusAtual, observacao) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        const [result] = await db.promise().query(sql, [
            parFormularioID,
            id,
            usuarioID,
            unidadeID,
            papelID,
            new Date(),
            statusAtual,
            observacao ?? ''
        ]);

        // Verifica se a inserção foi bem-sucedida através de 'affectedRows'
        return result.affectedRows > 0;
    } catch (error) {
        console.error("Erro ao adicionar movimentação de formulário:", error);
        return false;
    }
}

//* Função verifica na tabela de parametrizações do formulário e ve se objeto se referencia ao campo tabela, se sim, insere "ID" no final da coluna a ser atualizada no BD
const formatFieldsToTable = async (table, fields) => {
    const dataHeader = {};
    try {
        // Usar Promise.all para aguardar a conclusão de todas as consultas
        await Promise.all(fields.map(async (field) => {
            const { tabela, nomeColuna } = field;

            // Consulta SQL usando placeholders para prevenir injeção de SQL
            const sql = `SELECT nomeColuna FROM ${table} WHERE tabela = ?`;
            const [result] = await db.promise().query(sql, [tabela]);

            // Atualiza o dataHeader com o valor correspondente
            dataHeader[nomeColuna] = result.length > 0 && field[tabela]?.id > 0
                ? field[tabela].id
                : field[nomeColuna] || null;
        }));
    } catch (error) {
        console.error("Error formatting fields to table:", error);
    }
    return dataHeader;
};

//* Função que atualiza ou adiciona permissões ao usuário
const accessPermissions = async (data, logID) => {
    if (!data) return;

    const boolToNumber = (bool) => bool ? 1 : 0;

    // Função para gerenciar a inserção ou atualização da permissão
    const handlePermission = async (type, route, permissions) => {
        const { unidadeID, usuarioID } = data.fields;

        try {
            const verifyQuery = `
                SELECT permissaoID
                FROM permissao
                WHERE rota = ? AND unidadeID = ? AND usuarioID = ? AND papelID = ?`;
            const [resultVerify] = await db.promise().query(verifyQuery, [route, unidadeID, usuarioID, 1]);

            if (resultVerify.length > 0) { // Atualizar permissão
                const updateQuery = `
                    UPDATE permissao
                    SET ler = ?, inserir = ?, editar = ?, excluir = ?
                    WHERE rota = ? AND unidadeID = ? AND usuarioID = ? AND papelID = ?`;
                await executeQuery(updateQuery, [
                    boolToNumber(permissions.ler),
                    boolToNumber(permissions.inserir),
                    boolToNumber(permissions.editar),
                    boolToNumber(permissions.excluir),
                    route,
                    unidadeID,
                    usuarioID,
                    1
                ], 'update', 'permissao', 'usuarioID', usuarioID, logID);
            } else { // Inserir permissão
                const insertQuery = `
                    INSERT INTO permissao (rota, unidadeID, usuarioID, papelID, ler, inserir, editar, excluir)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                await executeQuery(insertQuery, [
                    route,
                    unidadeID,
                    usuarioID,
                    1,
                    boolToNumber(permissions.ler),
                    boolToNumber(permissions.inserir),
                    boolToNumber(permissions.editar),
                    boolToNumber(permissions.excluir)
                ], 'insert', 'permissao', 'permissaoID', null, logID);
            }
        } catch (error) {
            console.error(`Erro ao processar permissão para a rota ${route}:`, error);
            throw error; // Re-throw para propagar o erro e lidar no nível superior
        }
    };

    // Iterar através dos itens de menu e submenu
    const processMenus = async () => {
        try {
            const menuPromises = data.menu.map(async (menuGroup) => {
                if (menuGroup.menu) {
                    const groupPromises = menuGroup.menu.map(async (menu) => {
                        if (menu.edit) {
                            await handlePermission('menu', menu.rota, menu);
                        }

                        // Processamento de submenus
                        if (menu.submenu) {
                            const submenuPromises = menu.submenu.map(async (submenu) => {
                                await handlePermission('submenu', submenu.rota, submenu);
                            });
                            await Promise.all(submenuPromises);
                        }
                    });
                    await Promise.all(groupPromises);
                }
            });

            await Promise.all(menuPromises);
        } catch (error) {
            console.error('Erro ao processar menus:', error);
            throw error; // Propagar o erro para o nível superior
        }
    };

    // Executar a função de processamento
    try {
        await processMenus();
    } catch (error) {
        console.error('Erro ao executar accessPermissions:', error);
    }
}

const hasUnidadeID = async (table) => {
    if (!table) return false

    try {
        const sql = `
        SELECT *
        FROM information_schema.columns
        WHERE table_schema = "${process.env.DB_DATABASE}" AND table_name = "${table}" AND column_name = "unidadeID" `
        const [result] = await db.promise().query(sql)
        return result.length === 0 ? false : true;
    } catch (error) {
        console.log(error)
        return false
    }
}

const createDocument = async (email, path) => {
    if (!email || !path) return;

    const apiToken = process.env.AUTENTIQUE_TOKEN
    const url = 'https://api.autentique.com.br/v2/graphql';
    const query = `
    mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
        createDocument( sandbox: true, document: $document, signers: $signers, file: $file) {
        id
        name
        signatures {
            public_id
            name
            email
            created_at
            action { name }
            link { short_link }
            user { name}
        }
        }
    }`;

    const variables = {
        document: {
            name: "Contrato de marketing",
        },
        signers: [
            {
                email: email,
                action: "SIGN",
                positions: [{ "x": "100.0", "y": "100.0", "z": 1, "element": "SIGNATURE" }]
            },

        ],
        file: fs.createReadStream(path),
    };

    const formData = new FormData();
    formData.append('operations', JSON.stringify({ query, variables }));
    formData.append('map', JSON.stringify({ '0': ['variables.file'] }));
    formData.append('0', fs.createReadStream(path));

    const config = {
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            ...formData.getHeaders(),
        },
    };

    // Realizando a requisição POST
    try {
        // const response = await axios.post(url, formData, config)
        // const id = response.data.data.createDocument.id

        // return id
        return true

    } catch (error) {
        console.error('Erro na requisição: ', error);
    }
}

const getDocumentSignature = async (idReport) => {
    if (!idReport) return;

    const apiToken = process.env.AUTENTIQUE_TOKEN
    const url = 'https://api.autentique.com.br/v2/graphql';
    try {
        const query = `query { document(id: "${idReport}") { files { signed } } }`;
        const config = {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
        };

        // Realizing the POST request
        // const response = await axios.post(url, { query }, config);
        // return response.data.data.document.files.signed

        return true
    } catch (error) {
        console.error('Error in the request:', error);
    }
};

const signedReport = async (pathReport) => {
    try {
        // const response = await axios.head(pathReport)
        return true
    } catch (err) {
        console.log({ message: 'documento não assinado' })
        return false
    }

}
const fractionedToFloat = (value) => {
    if (!value) return 0

    let formattedValue = String(value).replace(/\./g, '');
    formattedValue = formattedValue.replace(',', '.');
    formattedValue = parseFloat(formattedValue);
    return formattedValue
}

const floatToFractioned = (value) => {
    if (!value) return 0

    return value
        .toFixed(3)
        .replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const getDateNow = (format = 'yyyy-mm-dd') => {
    let today = new Date().toLocaleDateString('pt-BR', { timeZone: timeZone })

    if (format == 'yyyy-mm-dd') {
        today = today.split('/').reverse().join('-')
    }

    return today
}

const getTimeNow = () => {
    const timeNow = new Date().toLocaleTimeString('pt-BR', { timeZone: timeZone })
    const hourMinute = timeNow.split(':')
    return `${hourMinute[0]}:${hourMinute[1]}`
}

/*
    'limpeza_produto'
    'limpezaID'
    'produtoID'
    limpezaID -> id
    arrValues -> [{id: 1}, {id: 2}]
*/
const updateMultipleSelect = async (table, tableKey, focusKey, id, arrValues) => {
    if (!arrValues || arrValues.length == 0) return

    const novosProdutosIDs = arrValues.map(row => row.id)

    try {
        const [produtosExistentes] = await db.promise().query(`SELECT ${focusKey} FROM ${table} WHERE ${tableKey} = ?`, [id])
        const produtosExistentesIDs = produtosExistentes.map(row => row[focusKey])
        const produtosParaRemover = produtosExistentesIDs.filter(id => !novosProdutosIDs.includes(id))
        const produtosParaAdicionar = novosProdutosIDs.filter(id => !produtosExistentesIDs.includes(id))
        if (produtosParaRemover.length > 0) {
            await db.promise().query(`DELETE FROM ${table} WHERE ${tableKey} = ? AND ${focusKey} IN (?)`, [id, produtosParaRemover])
        }
        if (produtosParaAdicionar.length > 0) {
            const values = produtosParaAdicionar.map(rowID => `(${id}, ${rowID})`).join(',')
            await db.promise().query(`INSERT INTO ${table} (${tableKey}, ${focusKey}) VALUES ${values}`)
        }

        console.log('Dados atualizados com sucesso!')
    } catch (error) {
        console.error('Erro ao atualizar produtos:', error)
    }
}

const insertMultipleSelect = async (table, tableKey, focusKey, id, arrValues) => {
    if (!arrValues || arrValues.length == 0) return
    console.log("🚀 ~ arrValues:", arrValues)

    const novosProdutosIDs = arrValues.map(row => row.id)

    try {
        const values = novosProdutosIDs.map(rowID => `(${id}, ${rowID})`).join(',')
        await db.promise().query(`INSERT INTO ${table} (${tableKey}, ${focusKey}) VALUES ${values}`)

        console.log('Dados inseridos com sucesso!')
    } catch (error) {
        console.error('Erro ao inserir dados:', error)
    }
}

module.exports = {
    addFormStatusMovimentation,
    formatFieldsToTable,
    hasUnidadeID,
    accessPermissions,
    createDocument,
    getDocumentSignature,
    signedReport,
    fractionedToFloat,
    floatToFractioned,
    getDateNow,
    getTimeNow,
    updateMultipleSelect,
    insertMultipleSelect
};