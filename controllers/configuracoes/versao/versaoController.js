const db = require('../../../config/db');
const { deleteItem } = require('../../../config/defaultConfig');
const { executeLog, executeQuery } = require('../../../config/executeQuery');
const { version } = require('../../../data/version');

class VersaoController {

    async getLatestVersion(req, res) {
        try {
            const latestVersion = version
            res.status(200).json(latestVersion);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao buscar a versão mais recente.' });
        }
    }

    async listVersions(req, res) {
        try {
            const sqlVersions = `
            SELECT 
                versaoID,
                nome, 
                DATE_FORMAT(data, '%d/%m/%Y') AS data,
                data AS data_                
            FROM versao                
            ORDER BY data_ DESC
            LIMIT 20`;
            const [result] = await db.promise().query(sqlVersions);

            // Obter a lista de itens associados a cada versão de forma assíncrona
            const promises = result.map(async (versao) => {
                const sqlItems = `
                SELECT
                    descricao,
                    link
                FROM versao_item
                WHERE versaoID = ?`;
                const [itens] = await db.promise().query(sqlItems, [versao.versaoID]);
                versao.itens = itens;
            });

            await Promise.all(promises);

            res.status(200).json(result);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar as versões.' });
        }
    }

    async getList(req, res) {
        try {
            const getList = `
            SELECT 
                v.versaoID AS id, 
                v.nome, 
                DATE_FORMAT(v.data, '%d/%m/%Y') AS data,
                GROUP_CONCAT(vi.descricao SEPARATOR ', ') AS itens
            FROM versao AS v 
                LEFT JOIN versao_item AS vi ON (v.versaoID = vi.versaoID)
            GROUP BY v.versaoID
            ORDER BY v.data DESC`
            const [result] = await db.promise().query(getList);
            res.status(200).json(result);
        } catch (error) {
            console.log(error)
        }
    }

    async getData(req, res) {
        try {
            const { id } = req.params

            const sql = `
            SELECT 
                versaoID,
                nome, 
                DATE_FORMAT(data, '%Y-%m-%d') AS data
            FROM versao                
            WHERE versaoID = ?`
            const [result] = await db.promise().query(sql, [id]);

            const sqlVersaoItem = `
            SELECT versaoItemID, descricao, link 
            FROM versao_item 
            WHERE versaoID = ?`
            const [resultVersaoItem] = await db.promise().query(sqlVersaoItem, [id]);

            const data = {
                fields: {
                    ...result[0],
                    items: resultVersaoItem
                }
            };

            return res.status(200).json(data)
        } catch (error) {
            console.log(error)
        }
    }

    async insertData(req, res) {
        try {
            const data = req.body

            const logID = await executeLog('Criação de versão', data.usuarioID, 1, req)
            const sql = 'INSERT INTO versao (nome, data) VALUES (?, ?)'
            const today = new Date().toISOString().substring(0, 10)
            const id = await executeQuery(sql, [data.fields.nome, data.fields.data ?? today], 'insert', 'versao', 'versaoID', null, logID)
            if (!id) return

            for (const item of data.fields.items) {
                const sqlItem = 'INSERT INTO versao_item (versaoID, descricao, link) VALUES (?, ?, ?)'
                await executeQuery(sqlItem, [id, item.descricao, item.link ?? null], 'insert', 'versao_item', 'versaoItemID', null, logID)
            }

            const values = {
                id,
                value: data.fields.nome
            }

            return res.status(200).json(values)
        } catch (error) {
            console.log(error)
        }
    }

    async updateData(req, res) {
        try {
            const { id } = req.params
            const data = req.body

            const logID = await executeLog('Atualização de versão', data.usuarioID, 1, req)
            const sqlVersao = `UPDATE versao SET nome = ?, data = ? WHERE versaoID = ?`
            await executeQuery(sqlVersao, [data.fields.nome, data.fields.data, id], 'update', 'versao', 'versaoID', id, logID)

            const existingItems = await db.promise().query(`SELECT versaoItemID FROM versao_item WHERE versaoID = ?`, [id]);
            const incomingItemIDs = new Set(data.fields.items.map(item => item.versaoItemID));

            // Remove os itens que não estão mais na nova lista
            for (const existingItem of existingItems[0]) {
                if (!incomingItemIDs.has(existingItem.versaoItemID)) {
                    const sqlItemDelete = `DELETE FROM versao_item WHERE versaoItemID = ? AND versaoID = ?`;
                    await executeQuery(sqlItemDelete, [existingItem.versaoItemID, id], 'delete', 'versao_item', 'versaoItemID', existingItem.versaoItemID, logID);
                }
            }

            // Atualiza ou insere os itens recebidos
            for (const item of data.fields.items) {
                if (item.versaoItemID) {
                    const sqlItemUpdate = `UPDATE versao_item SET descricao = ?, link = ? WHERE versaoItemID = ? AND versaoID = ?`;
                    await executeQuery(sqlItemUpdate, [item.descricao, item.link ?? null, item.versaoItemID, id], 'update', 'versao_item', 'versaoItemID', item.versaoItemID, logID);
                } else {
                    const sqlItemInsert = `INSERT INTO versao_item (versaoID, descricao, link) VALUES (?, ?, ?)`;
                    await executeQuery(sqlItemInsert, [id, item.descricao, item.link ?? null], 'insert', 'versao_item', 'versaoID', id, logID);
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

        const logID = await executeLog('Exclusão de versão', usuarioID, 1, req)
        return deleteItem(id, ['versao_item', 'versao'], 'versaoID', logID, res)
    }
}

module.exports = VersaoController;