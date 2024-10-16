const db = require('../config/db');
const { executeQuery } = require('../config/executeQuery');
const { getBlockSectors } = require('./sector/getSectors');

/*
* Params ex:
    * id
    * modeloID
    * status
    * 'recebimentoMpID'
    * 'par_recebimentomp_modelo_bloco'
    * 'parRecebimentoMpModeloID'
    * 'recebimentomp_resposta'
    * 'recebimentoMpRespostaID'
    * 'par_recebimentomp_modelo_bloco_item'
    * 'parRecebimentoMpNaoConformidadeModeloBlocoItemID'
    * 'parRecebimentoMpModeloBlocoID'
    * 'par_recebimentomp_modelo_bloco_departamento'
    
*/
const getDynamicBlocks = async (id, modeloID, status, rootKey, tableConfig, columnKeyConfig, tableResponse, columnKeyResponse, tableConfigItem, columnKeyConfigItem, columnKeyConfigBlock, tableConfigDepartamento) => {

    const sql = `
    SELECT *
    FROM ${tableConfig}
    WHERE ${columnKeyConfig} = ? AND status = 1
    ORDER BY ordem ASC`
    const [resultBlocos] = await db.promise().query(sql, [modeloID])
    let sqlBloco = ''

    //? Blocos
    if (status && status > 40) { //? Já concluído, monta itens que possuem resposta
        sqlBloco = `
        SELECT prbi.*, i.*, a.nome AS alternativa,
    
            (SELECT rr.respostaID
            FROM ${tableResponse} AS rr 
            WHERE rr.${rootKey} = ${id} AND rr.${columnKeyResponse} = prbi.${columnKeyResponse}) AS respostaID,
    
            (SELECT rr.resposta
            FROM ${tableResponse} AS rr 
            WHERE rr.${rootKey} = ${id} AND rr.${columnKeyResponse} = prbi.${columnKeyResponse}) AS resposta,
    
            (SELECT rr.obs
            FROM ${tableResponse} AS rr 
            WHERE rr.${rootKey} = ${id} AND rr.${columnKeyResponse} = prbi.${columnKeyResponse}) AS observacao
    
        FROM ${tableResponse} AS prbi 
            LEFT JOIN item AS i ON(prbi.itemID = i.itemID)
            LEFT JOIN alternativa AS a ON(i.alternativaID = a.alternativaID)
        WHERE prbi.${rootKey} = ${id} AND prbi.${columnKeyConfigBlock} = ?`
    } else {                    //? Formulário em aberto, monta itens baseado no modelo
        sqlBloco = `
        SELECT prbi.*, i.*, a.nome AS alternativa,
    
            (SELECT rr.respostaID
            FROM ${tableResponse} AS rr 
            WHERE rr.${rootKey} = ${id} AND rr.${columnKeyConfigBlock} = prbi.${columnKeyConfigBlock} AND rr.itemID = prbi.itemID) AS respostaID,
    
            (SELECT rr.resposta
            FROM ${tableResponse} AS rr 
            WHERE rr.${rootKey} = ${id} AND rr.${columnKeyConfigBlock} = prbi.${columnKeyConfigBlock} AND rr.itemID = prbi.itemID) AS resposta,
    
            (SELECT rr.obs
            FROM ${tableResponse} AS rr 
            WHERE rr.${rootKey} = ${id} AND rr.${columnKeyConfigBlock} = prbi.${columnKeyConfigBlock} AND rr.itemID = prbi.itemID) AS observacao
    
        FROM ${tableConfigItem} AS prbi 
            LEFT JOIN item AS i ON(prbi.itemID = i.itemID)
            LEFT JOIN alternativa AS a ON(i.alternativaID = a.alternativaID)
        WHERE prbi.${columnKeyConfigBlock} = ? AND prbi.status = 1 AND i.status = 1
        ORDER BY prbi.ordem ASC`
    }

    for (const bloco of resultBlocos) {
        const [resultBloco] = await db.promise().query(sqlBloco, [bloco[columnKeyConfigBlock]])

        if (status && status > 40) {
            let ordem = 0;
            for (const item of resultBloco) item.ordem = ++ordem;
        }

        //? Obtem os departamentos que acessam o bloco e profissionais que acessam os departamentos
        const sectors = await getBlockSectors(bloco[columnKeyConfigBlock], tableConfigDepartamento, columnKeyConfigBlock)
        bloco['departamentos'] = sectors

        //? Itens
        let resultAlternativa = []
        for (const item of resultBloco) {
            if (status && status > 40) {
                if (columnKeyResponse === 'recebimentoMpRespostaID') columnKeyResponse = 'recebimentompRespostaID' //! Correção coluna errada/diferente no BD
                const sqlAlternativa = `
                SELECT ai.alternativaItemID AS id, ai.nome, io.anexo, io.bloqueiaFormulario, io.observacao
                FROM ${tableResponse} AS prbi
                    JOIN item AS i ON (prbi.itemID = i.itemID)
                    JOIN alternativa AS a ON(i.alternativaID = a.alternativaID)
                    JOIN alternativa_item AS ai ON(a.alternativaID = ai.alternativaID)        
                    LEFT JOIN item_opcao AS io ON (io.itemID = i.itemID AND io.alternativaItemID = ai.alternativaItemID)
                WHERE prbi.${rootKey} = ? AND prbi.${columnKeyResponse} = ? AND prbi.itemID = ?`
                const [rows] = await db.promise().query(sqlAlternativa, [id, item[columnKeyResponse], item['itemID']])
                resultAlternativa = rows
            } else {
                const sqlAlternativa = `
                SELECT ai.alternativaItemID AS id, ai.nome, io.anexo, io.bloqueiaFormulario, io.observacao
                FROM ${tableConfigItem} AS prbi 
                    JOIN item AS i ON (prbi.itemID = i.itemID)
                    JOIN alternativa AS a ON(i.alternativaID = a.alternativaID)
                    JOIN alternativa_item AS ai ON(a.alternativaID = ai.alternativaID)        
                    LEFT JOIN item_opcao AS io ON (io.itemID = i.itemID AND io.alternativaItemID = ai.alternativaItemID)
                WHERE prbi.${columnKeyConfigItem} = ? AND prbi.status = 1 AND i.status = 1`
                const [rows] = await db.promise().query(sqlAlternativa, [item[columnKeyConfigItem]])
                resultAlternativa = rows
            }

            // Obter os anexos vinculados as alternativas
            const sqlRespostaAnexos = `
            SELECT io.alternativaItemID, io.itemOpcaoID, io.anexo, io.bloqueiaFormulario, io.observacao, ioa.itemOpcaoAnexoID, ioa.nome, ioa.obrigatorio
            FROM item_opcao AS io 
                JOIN item_opcao_anexo AS ioa ON(io.itemOpcaoID = ioa.itemOpcaoID)
            WHERE io.itemID = ? `
            const [resultRespostaAnexos] = await db.promise().query(sqlRespostaAnexos, [item.itemID])

            if (resultRespostaAnexos.length > 0) {
                for (const respostaAnexo of resultRespostaAnexos) {
                    //? Verifica se cada anexo exigido existe 1 ou mais arquivos anexados
                    const sqlArquivosAnexadosResposta = `
                    SELECT *
                    FROM anexo AS a 
                        JOIN anexo_busca AS ab ON(a.anexoID = ab.anexoID)
                    WHERE ab.${rootKey} = ? AND ab.${columnKeyConfigBlock} = ? AND ab.itemOpcaoAnexoID = ? `
                    const [resultArquivosAnexadosResposta] = await db.promise().query(sqlArquivosAnexadosResposta, [
                        id,
                        bloco[columnKeyConfigBlock],
                        respostaAnexo.itemOpcaoAnexoID
                    ])

                    let anexos = []
                    for (const anexo of resultArquivosAnexadosResposta) {
                        const objAnexo = {
                            exist: true,
                            anexoID: anexo.anexoID,
                            path: `${process.env.BASE_URL_API}${anexo.diretorio}${anexo.arquivo} `,
                            nome: anexo.titulo,
                            tipo: anexo.tipo,
                            size: anexo.tamanho,
                            time: anexo.dataHora
                        }
                        anexos.push(objAnexo)
                    }
                    respostaAnexo['anexos'] = anexos ?? []
                }
            }

            //? Insere lista de anexos solicitados pras alternativas
            for (const alternativa of resultAlternativa) {
                alternativa['anexosSolicitados'] = resultRespostaAnexos.filter(row => row.alternativaItemID == alternativa.id)
            }
            item.alternativas = resultAlternativa

            //* Cria objeto da resposta (se for de selecionar)
            if (item?.respostaID > 0) {
                item.resposta = {
                    id: item?.respostaID,
                    nome: item?.resposta,
                    bloqueiaFormulario: item.alternativas.find(a => a.id == item.respostaID)?.bloqueiaFormulario,
                    observacao: item.alternativas.find(a => a.id == item.respostaID)?.observacao,
                    anexo: resultRespostaAnexos.find(a => a.alternativaItemID == item.respostaID)?.anexo,
                    anexosSolicitados: resultRespostaAnexos.filter(a => a.alternativaItemID == item.respostaID) ?? []
                }
            }
        }
        bloco.itens = resultBloco
    }

    return resultBlocos ?? []
}

/*
* Params ex:
    * id
    * blocks (array)
    * 'recebimentomp_resposta'
    * 'recebimentoMpID'
    * 'parRecebimentoMpModeloBlocoID'
    * 'recebimentoMpRespostaID'
    * logID
*/
const updateDynamicBlocks = async (id, blocks, tableResponse, columnKey, columnKeyConfigBlock, columnKeyResponse, logID) => {
    for (const bloco of blocks) {
        // Itens 
        if (bloco && bloco[columnKeyConfigBlock] && bloco[columnKeyConfigBlock] > 0 && bloco.itens) {
            for (const item of bloco.itens) {
                if (item && item.itemID && item.itemID > 0) {
                    // Verifica se já existe registro em tableResponse, com o columnKey, columnKeyConfigBlock e itemID, se houver, faz update, senao faz insert 
                    const sqlVerificaResposta = `SELECT * FROM ${tableResponse} WHERE ${columnKey} = ? AND ${columnKeyConfigBlock} = ? AND itemID = ? `
                    const [resultVerificaResposta] = await db.promise().query(sqlVerificaResposta, [id, bloco[columnKeyConfigBlock], item.itemID])

                    const resposta = item.resposta && item.resposta.nome ? item.resposta.nome : item.resposta
                    const respostaID = item.resposta && item.resposta.id > 0 ? item.resposta.id : null
                    const observacao = item.observacao != undefined ? item.observacao : ''

                    if (resposta && resultVerificaResposta.length == 0) {
                        const sqlInsert = `
                        INSERT INTO ${tableResponse}(${columnKey}, ${columnKeyConfigBlock}, itemID, resposta, respostaID, obs) VALUES(?, ?, ?, ?, ?, ?)`
                        const resultInsert = await executeQuery(sqlInsert, [
                            id,
                            bloco[columnKeyConfigBlock],
                            item.itemID,
                            resposta,
                            respostaID,
                            observacao
                        ], 'insert', tableResponse, columnKeyResponse, null, logID)

                        if (!resultInsert) { return res.json('Error'); }
                    } else if (resposta && resultVerificaResposta.length > 0) {
                        const sqlUpdate = `
                        UPDATE ${tableResponse} 
                        SET resposta = ?, respostaID = ?, obs = ?, ${columnKey} = ?
                        WHERE ${columnKey} = ? AND ${columnKeyConfigBlock} = ? AND itemID = ? `
                        const resultUpdate = await executeQuery(sqlUpdate, [
                            resposta,
                            respostaID,
                            observacao,
                            id,
                            id,
                            bloco[columnKeyConfigBlock],
                            item.itemID
                        ], 'update', tableResponse, columnKey, id, logID)
                        if (!resultUpdate) { return res.json('Error'); }
                    }
                    else if (!resposta) {
                        const sqlDelete = `DELETE FROM ${tableResponse} WHERE ${columnKey} = ? AND ${columnKeyConfigBlock} = ? AND itemID = ? `
                        await executeQuery(sqlDelete, [id, bloco[columnKeyConfigBlock], item.itemID], 'delete', tableResponse, columnKey, id, logID)
                    }
                }
            }
        }
    }

    return true
}

/*
* Params ex:
    * blocks (array)
    * 'parRecebimentoMpModeloBlocoID'
    * 'recebimentomp_resposta'
    * 'recebimentoMpID'
    * 'recebimentoMpRespostaID'
    * recebimentoMpID (value)
    * logID
    
*/
const insertDynamicBlocks = async (blocks, tableBlockConfigKey, tableResponse, tableKey, tableResponseKey, value, logID) => {
    for (const bloco of blocks) {
        if (bloco && bloco[tableBlockConfigKey] && bloco[tableBlockConfigKey] > 0 && bloco.itens) {
            for (const item of bloco.itens) {
                if (item && item.itemID && item.itemID > 0) {
                    const resposta = item.resposta && item.resposta.nome ? item.resposta.nome : item.resposta
                    const respostaID = item.resposta && item.resposta.id > 0 ? item.resposta.id : null
                    const observacao = item.observacao != undefined ? item.observacao : ''

                    if (resposta) {
                        const sqlInsert = `INSERT INTO ${tableResponse}(${tableKey}, ${tableBlockConfigKey}, itemID, resposta, respostaID, obs) VALUES(?, ?, ?, ?, ?, ?)`
                        const resultInsert = await executeQuery(sqlInsert, [
                            value,
                            bloco[tableBlockConfigKey],
                            item.itemID,
                            resposta,
                            respostaID,
                            observacao
                        ], 'insert', tableResponse, tableResponseKey, null, logID)

                        if (!resultInsert) { return res.json('Error'); }
                    }
                }
            }
        }
    }
}

module.exports = { getDynamicBlocks, updateDynamicBlocks, insertDynamicBlocks }