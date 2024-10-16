const db = require('../../config/db');

/* 
* Params ex:
    * modelID
    * 'par_recebimentomp_modelo_departamento'
    * 'parRecebimentoMpModeloID'    
*/

const getHeaderDepartments = async (modelID, table, tableKey) => {
    //? Departamentos vinculados ao cabeçalho e rodapé (preenchimento e conclusão)
    const sql = `
    SELECT 
        b.departamentoID AS id, 
        b.nome, 
        a.tipo
    FROM ${table} AS a 
        JOIN departamento AS b ON (a.departamentoID = b.departamentoID)
    WHERE a.${tableKey} = ? AND b.status = 1
    ORDER BY b.nome ASC`
    const [result] = await db.promise().query(sql, [modelID])

    const fill = result.filter(row => row?.tipo === 1)
    const conclude = result.filter(row => row?.tipo === 2)

    return { fill, conclude }
}

/*
* Params ex:
    * blockID
    * 'par_recebimentomp_naoconformidade_modelo_bloco_departamento'
    * 'parRecebimentoMpNaoConformidadeModeloBlocoID'    
*/
const getBlockSectors = async (blockID, table, tableKey) => {
    const sql = `
    SELECT s.departamentoID AS id, s.nome
    FROM ${table} AS prmbs
        JOIN departamento AS s ON (prmbs.departamentoID = s.departamentoID)
    WHERE prmbs.${tableKey} = ?
    GROUP BY s.departamentoID
    ORDER BY s.nome ASC`
    const [result] = await db.promise().query(sql, [blockID])

    return result ?? []
}

module.exports = { getHeaderDepartments, getBlockSectors }