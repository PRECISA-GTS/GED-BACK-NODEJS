const db = require('../../../config/db');
const { deleteItem, hasConflict } = require('../../../config/defaultConfig');
const { executeLog, executeQuery } = require('../../../config/executeQuery');

class DepartamentoController {
    async getProfessionals(req, res) {
        try {
            const { departamentos, unidadeID } = req.body

            if (!unidadeID || !departamentos || departamentos.length === 0) {
                return res.status(200).json([]);
            }

            // obter todos os profissionais ativos nos departamentoes 
            const sql = `
            SELECT p.profissionalID AS id, p.nome, ps.departamentoID
            FROM profissional_departamento AS ps 
                JOIN profissional AS p ON (ps.profissionalID = p.profissionalID)
            WHERE p.unidadeID = ? AND ps.departamentoID IN (?) AND ps.status = 1 AND p.status = 1
            ORDER BY p.nome ASC`
            const [result] = await db.promise().query(sql, [unidadeID, departamentos])

            return res.status(200).json(result);
        } catch (error) {
            console.log(error)
        }
    }

    async getProfissionaisDepartamentosAssinatura(req, res) {
        const { formularioID, modeloID, unidadeID } = req.body

        if (!formularioID || !modeloID) {
            return res.status(400).json({ message: "Dados inválidos!" });
        }

        try {
            let result = null

            switch (formularioID) {
                case 1: //* Fornecedor
                    result = await getProfissionaisDepartamentosPreenchimento('par_fornecedor_modelo_departamento', 'parFornecedorModeloID', modeloID, unidadeID)
                    break;
                case 2: //* Recebimento de MP
                    result = await getProfissionaisDepartamentosPreenchimento('par_recebimentomp_modelo_departamento', 'parRecebimentoMpModeloID', modeloID, unidadeID)
                    break;
                case 3: //* Não conformidade do recebimento de MP
                    result = await getProfissionaisDepartamentosPreenchimento('par_recebimentomp_naoconformidade_modelo_departamento', 'parRecebimentoMpNaoConformidadeModeloID', modeloID, unidadeID)
                    break;
                case 4: //* Limpeza
                    result = await getProfissionaisDepartamentosPreenchimento('par_limpeza_modelo_departamento', 'parLimpezaModeloID', modeloID, unidadeID)
                    break;
            }

            return res.status(200).json(result)
        } catch (error) {
            console.log("🚀 ~ error:", error)
        }
    }
    //? Obtém os departamentoes pra assinatura
    async getDepartamentosAssinatura(req, res) {
        const { formularioID, modeloID } = req.body

        if (!formularioID || !modeloID) {
            return res.status(400).json({ message: "Dados inválidos!" });
        }

        try {
            let result = null

            switch (formularioID) {
                case 1: //* Fornecedor
                    result = await getDepartamentosPreenchimento('par_fornecedor_modelo_departamento', 'parFornecedorModeloID', modeloID)
                    break;
                case 2: //* Recebimento de MP
                    result = await getDepartamentosPreenchimento('par_recebimentomp_modelo_departamento', 'parRecebimentoMpModeloID', modeloID)
                    break;
                case 3: //* Não conformidade do recebimento de MP
                    result = await getDepartamentosPreenchimento('par_recebimentomp_naoconformidade_modelo_departamento', 'parRecebimentoMpNaoConformidadeModeloID', modeloID)
                    break;
                case 4: //* Limpeza
                    result = await getDepartamentosPreenchimento('par_limpeza_modelo_departamento', 'parLimpezaModeloID', modeloID)
                    break;
                case 5: //* Não conformidade da Limpeza
                    result = await getDepartamentosPreenchimento('par_limpeza_naoconformidade_modelo_departamento', 'parLimpezaNaoConformidadeModeloID', modeloID)
                    break;
            }

            return res.status(200).json(result)
        } catch (error) {
            console.log("🚀 ~ error:", error)
        }
    }

    async getList(req, res) {
        const { unidadeID } = req.body
        if (!unidadeID) return res.status(400).json({ error: 'Unidade não informada!' })
        try {

            const getList = `
            SELECT 
                s.departamentoID AS id, 
                s.nome, 
                e.nome AS status,
                e.cor,
                COALESCE(GROUP_CONCAT(p.nome SEPARATOR ', '), '--') AS profissionais
            FROM departamento AS s
                LEFT JOIN profissional_departamento AS ps ON (s.departamentoID = ps.departamentoID AND ps.status = 1)
                LEFT JOIN profissional AS p ON (ps.profissionalID = p.profissionalID)
                LEFT JOIN status as e ON (s.status = e.statusID)
            WHERE s.unidadeID = ? 
            GROUP BY s.departamentoID
            ORDER BY s.nome, p.nome ASC`
            const [result] = await db.promise().query(getList, [unidadeID]);
            res.status(200).json(result);
        } catch (error) {
            console.log(error)
        }
    }

    async getData(req, res) {
        try {
            const { id } = req.params
            if (!id) return res.status(400).json({ error: 'ID não informado!' })

            const sql = `
            SELECT 
                departamentoID,
                nome, 
                status
            FROM departamento                
            WHERE departamentoID = ?`
            const [result] = await db.promise().query(sql, [id]);

            const sqlProfissionais = `
            SELECT 
                ps.profissionaldepartamentoID AS id, 
                p.profissionalID, 
                p.nome, 
                DATE_FORMAT(ps.dataInicio, '%Y-%m-%d') AS dataInicio,
                DATE_FORMAT(ps.dataFim, '%Y-%m-%d') AS dataFim, 
                ps.status
            FROM profissional_departamento AS ps 
                JOIN profissional AS p ON (ps.profissionalID = p.profissionalID)
            WHERE ps.departamentoID = ?
            ORDER BY ps.status DESC, p.nome ASC`
            const [resultProfissionais] = await db.promise().query(sqlProfissionais, [id]);

            const formatedProfissionais = resultProfissionais.map(row => {
                return {
                    ...row,
                    profissional: {
                        id: row.profissionalID,
                        nome: row.nome
                    }
                }
            })

            const data = {
                fields: {
                    ...result[0],
                    profissionais: formatedProfissionais
                }
            };

            return res.status(200).json(data)
        } catch (error) {
            console.log(error)
        }
    }

    async insertData(req, res) {
        try {
            const { fields, usuarioID, unidadeID } = req.body

            //* Valida conflito
            const validateConflicts = {
                columns: ['nome', 'unidadeID'],
                values: [fields.nome, unidadeID],
                table: 'departamento',
                id: null
            }
            if (await hasConflict(validateConflicts)) {
                return res.status(409).json({ message: "Dados já cadastrados!" });
            }

            const logID = await executeLog('Criação de departamento', usuarioID, 1, req)
            const sql = 'INSERT INTO departamento (nome, unidadeID, status) VALUES (?, ?, ?)'
            const id = await executeQuery(sql, [fields.nome, unidadeID, 1], 'insert', 'departamento', 'departamentoID', null, logID)
            if (!id) return

            for (const row of fields.profissionais) {
                const sqlItem = 'INSERT INTO profissional_departamento (departamentoID, profissionalID, dataInicio, dataFim, status) VALUES (?, ?, ?, ?, ?)'
                await executeQuery(sqlItem, [
                    id,
                    row.profissional.id,
                    row.dataInicio,
                    row.dataFim ?? null,
                    1
                ], 'insert', 'profissional_departamento', 'profissionaldepartamentoID', null, logID)
            }

            return res.status(200).json({ id })
        } catch (error) {
            console.log(error)
        }
    }

    async updateData(req, res) {
        try {
            const { id } = req.params
            const { fields, usuarioID, unidadeID } = req.body

            //* Valida conflito
            const validateConflicts = {
                columns: ['departamentoID', 'nome', 'unidadeID'],
                values: [id, fields.nome, unidadeID],
                table: 'departamento',
                id: id
            }
            if (await hasConflict(validateConflicts)) {
                return res.status(409).json({ message: "Dados já cadastrados!" });
            }

            const logID = await executeLog('Atualização de departamento', usuarioID, 1, req)
            const sql = `UPDATE departamento SET nome = ?, status = ? WHERE departamentoID = ?`
            await executeQuery(sql, [fields.nome, fields.status ? 1 : 0, id], 'update', 'departamento', 'departamentoID', id, logID)

            const existingItems = await db.promise().query(`SELECT profissionaldepartamentoID FROM profissional_departamento WHERE departamentoID = ?`, [id]);
            const incomingItemIDs = new Set(fields.profissionais.map(item => item.id));

            // Remove os itens que não estão mais na nova lista
            for (const existingItem of existingItems[0]) {
                if (!incomingItemIDs.has(existingItem.profissionaldepartamentoID)) {
                    const sqlItemDelete = `DELETE FROM profissional_departamento WHERE profissionaldepartamentoID = ? AND departamentoID = ?`;
                    await executeQuery(sqlItemDelete, [existingItem.profissionaldepartamentoID, id], 'delete', 'profissional_departamento', 'profissionaldepartamentoID', existingItem.profissionaldepartamentoID, logID);
                }
            }

            // Atualiza ou insere os itens recebidos
            for (const item of fields.profissionais) {
                if (item.id) {
                    const sqlItemUpdate = `UPDATE profissional_departamento SET profissionalID = ?, dataInicio = ?, dataFim = ?, status = ? WHERE profissionaldepartamentoID = ? AND departamentoID = ?`;
                    await executeQuery(sqlItemUpdate, [
                        item.profissional.id,
                        item.dataInicio,
                        item.dataFim ?? null,
                        item.dataFim && item.dataFim != '0000-00-00' ? 0 : 1, // Status
                        item.id,
                        id
                    ], 'update', 'profissional_departamento', 'profissionaldepartamentoID', item.id, logID);
                } else {
                    const sqlItemInsert = `INSERT INTO profissional_departamento (departamentoID, profissionalID, dataInicio, dataFim, status) VALUES (?, ?, ?, ?, ?)`
                    await executeQuery(sqlItemInsert, [
                        id,
                        item.profissional.id,
                        item.dataInicio,
                        item.dataFim ?? null,
                        item.dataFim && item.dataFim != '0000-00-00' ? 0 : 1 // Status
                    ], 'insert', 'profissional_departamento', 'departamentoID', id, logID);
                }
            }

            return res.status(200).json({ message: 'Dados atualizados com sucesso' });
        } catch (error) {
            console.log(error);
            return res.status(500).json({ message: "Erro interno no servidor" });
        }
    }

    async deleteData(req, res) {
        const { id, usuarioID } = req.params

        const logID = await executeLog('Exclusão de departamento', usuarioID, 1, req)
        return deleteItem(id, ['profissional_departamento', 'departamento'], 'departamentoID', logID, res)
    }
}

const getDepartamentosPreenchimento = async (table, key, modeloID) => {
    const sqlPreenche = `
    SELECT
        b.departamentoID AS id, 
        b.nome
    FROM ${table} AS a
        JOIN departamento AS b ON (a.departamentoID = b.departamentoID)
    WHERE a.${key} = ? AND a.tipo = 1
    GROUP BY b.departamentoID
    ORDER BY b.nome ASC`
    const [resultPreenche] = await db.promise().query(sqlPreenche, [modeloID])

    const sqlConclui = `
    SELECT
        b.departamentoID AS id, 
        b.nome
    FROM ${table} AS a
        JOIN departamento AS b ON (a.departamentoID = b.departamentoID)
    WHERE a.${key} = ? AND a.tipo = 2
    GROUP BY b.departamentoID
    ORDER BY b.nome ASC`
    const [resultConclui] = await db.promise().query(sqlConclui, [modeloID])

    const result = {
        preenche: resultPreenche ?? [],
        conclui: resultConclui ?? []
    }

    return result
}

const getProfissionaisDepartamentosPreenchimento = async (table, key, modeloID, unidadeID) => {
    //? Todos os profissionais ativos da unidade, caso não tenha departamento vinculado ao modelo
    const sqlProfissionaisAtivos = `
    SELECT 
        a.profissionalID AS id, 
        a.nome 
    FROM profissional AS a
    WHERE a.unidadeID = ? AND a.status = 1`
    const [resultProfissionaisAtivos] = await db.promise().query(sqlProfissionaisAtivos, [unidadeID])

    //? Verifica quantidade de departamentoes vinculados ao modelo (preenchimento e conclusão)
    const sqlDepartamentosModelo = `
    SELECT COUNT(*) AS qtd 
    FROM ${table} AS a
    WHERE a.${key} = ? AND a.tipo = 1`
    const [resultDepartamentosModeloPreenchimento] = await db.promise().query(sqlDepartamentosModelo, [modeloID])
    const sqlDepartamentosModeloConclusao = `
    SELECT COUNT(*) AS qtd 
    FROM ${table} AS a
    WHERE a.${key} = ? AND a.tipo = 2`
    const [resultDepartamentosModeloConclusao] = await db.promise().query(sqlDepartamentosModeloConclusao, [modeloID])

    //? Obtém os profissionais vinculados aos departamentoes selecionados no modelo (preenchimento e conclusão)
    const sqlPreenche = `
    SELECT
        d.profissionalID AS id, 
        d.nome
    FROM ${table} AS a
        JOIN departamento AS b ON (a.departamentoID = b.departamentoID)
        JOIN profissional_departamento AS c ON (a.departamentoID = c.departamentoID)
        JOIN profissional AS d ON (c.profissionalID = d.profissionalID)
    WHERE a.${key} = ? AND a.tipo = 1 AND b.status = 1 AND c.status = 1 AND d.status = 1
    GROUP BY d.profissionalID
    ORDER BY d.nome ASC`
    const [resultPreenche] = await db.promise().query(sqlPreenche, [modeloID])
    const sqlConclui = `
    SELECT
        d.profissionalID AS id, 
        d.nome
    FROM ${table} AS a
        JOIN departamento AS b ON (a.departamentoID = b.departamentoID)
        JOIN profissional_departamento AS c ON (a.departamentoID = c.departamentoID)
        JOIN profissional AS d ON (c.profissionalID = d.profissionalID)
    WHERE a.${key} = ? AND a.tipo = 2 AND b.status = 1 AND c.status = 1 AND d.status = 1
    GROUP BY d.profissionalID
    ORDER BY d.nome ASC`
    const [resultConclui] = await db.promise().query(sqlConclui, [modeloID])

    const result = {
        preenche: resultDepartamentosModeloPreenchimento[0].qtd > 0 ? resultPreenche : resultProfissionaisAtivos ?? [],
        conclui: resultDepartamentosModeloConclusao[0].qtd > 0 ? resultConclui : resultProfissionaisAtivos ?? []
    }

    return result
}

module.exports = DepartamentoController;