const db = require('../config/db');
const { hasUnidadeID } = require('./functions');

/*
* Params ex:
    * id
    * modeloID
    * unidadeID
    * status
    * 'par_recebimentomp'
    * 'parRecebimentoMpID'
    * 'parRecebimentoMpModeloID'
    * 'recebimentomp'
    * 'recebimentoMpID'    
*/
const getDynamicHeaderFields = async (
    id,
    modelID,
    unityID,
    status,
    tableConfig,
    commonColumnConfig,
    columnKeyConfig,
    table,
    columnKey
) => {
    if (!modelID) return null;
    let resultFields = []

    if (status && status > 40) { //? Já concluído, monta itens que possuem resposta
        // Busca todas as colunas dinamicas do header do cabeçalho
        const sql = `
        SELECT *
        FROM ${tableConfig}`;
        const [rows] = await db.promise().query(sql);
        resultFields = rows;
    } else {                    //? Formulário em aberto, monta itens baseado no modelo
        const sql = `
        SELECT *
        FROM ${tableConfig} AS a
            LEFT JOIN ${tableConfig}_modelo_cabecalho AS b ON (a.${commonColumnConfig} = b.${commonColumnConfig})
        WHERE b.${columnKeyConfig} = ? 
        ORDER BY b.ordem ASC`;
        const [rows] = await db.promise().query(sql, [modelID]);
        resultFields = rows;
    }

    // Collect alternatives that require options (tipo == 'int' && alternatives.tabela)
    const intFieldsWithTable = resultFields.filter(field => field.tipo === 'int' && field.tabela);

    // Query options for all 'int' fields with tables in parallel
    const optionsPromises = intFieldsWithTable.map(async (field) => {
        const sqlOptions = `
        SELECT ${field.tabela}ID AS id, nome
        FROM ${field.tabela} 
        WHERE status = 1 ${await hasUnidadeID(field.tabela) ? ` AND unidadeID = ${unityID} ` : ``}
        ORDER BY nome ASC`;
        const [resultOptions] = await db.promise().query(sqlOptions);
        field.options = resultOptions;
    });

    await Promise.all(optionsPromises); // Execute all queries in parallel

    // Gather all column names where tabela is null
    const columns = resultFields
        .filter(row => !row.tabela)
        .map(row => row.nomeColuna);

    // If id is provided, query data for each field
    if (id && id > 0) {
        const dataPromises = resultFields.map(async (field) => {
            if (field.tabela) {
                // Query for select data
                const sqlFieldData = `
                SELECT t.${field.nomeColuna} AS id, t.nome
                FROM ${table} AS f 
                    JOIN ${field.tabela} AS t ON(f.${field.nomeColuna} = t.${field.nomeColuna}) 
                WHERE f.${columnKey} = ?`;
                const [temp] = await db.promise().query(sqlFieldData, [id]);
                field[field.tabela] = temp.length ? temp[0] : null;
            } else {
                // Query for basic column data
                const sqlFieldData = `SELECT ${field.nomeColuna} AS coluna FROM ${table} WHERE ${columnKey} = ?`;
                const [resultFieldData] = await db.promise().query(sqlFieldData, [id]);
                field[field.nomeColuna] = resultFieldData.length ? resultFieldData[0].coluna : '';
                if (field.nomeColuna === 'pais' && !resultFieldData[0].coluna) field[field.nomeColuna] = 'Brasil';
            }
        });

        await Promise.all(dataPromises); // Execute all queries in parallel

        // Filtra apenas os fields que contem valor na tabela table
        if (status && status > 40) {
            resultFields = resultFields.filter(field =>
                field.tabela && field[field.tabela] !== null ? field[field.tabela] : field[field.nomeColuna] && field[field.nomeColuna] !== null ? field[field.nomeColuna] : null
            )
        }
    }

    return resultFields ?? null;
}

module.exports = { getDynamicHeaderFields }