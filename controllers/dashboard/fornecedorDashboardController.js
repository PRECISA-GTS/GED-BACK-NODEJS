const db = require('../../config/db');
require('dotenv/config')

class fornecedorDashboardController {
    async getData(req, res) {
        const data = req.body
        try {
            const getLastForms = `
            SELECT
                f.fornecedorID,
                u.nomeFantasia AS fabrica,
                DATE_FORMAT(f.dataInicio, '%d/%m/%Y') AS dataCriacao_formatada,
                e.nome AS status,
                e.cor,
                u.cabecalhoRelatorio AS logo,
                DATEDIFF(CURDATE(), f.dataInicio) AS quantidadeDias
            FROM fornecedor AS f
                LEFT JOIN unidade AS u ON f.unidadeID = u.unidadeID
                LEFT JOIN status AS e ON f.status = e.statusID
            WHERE f.cnpj = ?
            ORDER BY f.status ASC, f.fornecedorID DESC
            LIMIT 12`
            const [resultLastForms] = await db.promise().query(getLastForms, [data.cnpj])

            resultLastForms.forEach((form) => {
                form.logo = form.logo ? `${process.env.BASE_URL_API}${form.logo}` : null
            })

            const values = {
                lastForms: resultLastForms
            }

            res.status(200).json(values)
        } catch (e) {
            console.log(e)
        }
    }


    async myData(req, res) {
        const { usuarioID, unidadeID } = req.body

        try {
            const sql = `
            SELECT 
                cabecalhoRelatorio AS logo,
                DATE_FORMAT(dataAtualizacao, '%d/%m/%Y') AS dataAtualizacao,
                DATEDIFF(CURDATE(), dataAtualizacao) AS quantidadeDias,
                COALESCE(CONCAT(fc.nome, ' / ', fcr.nome), 'Risco não definido') AS categoriaRisco,
                if(u.fornecedorCategoriaID > 0 AND u.fornecedorCategoriaRiscoID > 0, 1, 0) AS possuiRisco
            FROM unidade AS u
                LEFT JOIN fornecedorcategoria fc ON (u.fornecedorCategoriaID = fc.fornecedorCategoriaID)
                LEFT JOIN fornecedorcategoria_risco AS fcr ON (u.fornecedorCategoriaRiscoID = fcr.fornecedorCategoriaRiscoID)
            WHERE u.unidadeID = ?`
            const [result] = await db.promise().query(sql, [unidadeID])

            // Verifica primeiro acesso
            const sqlUsuarioUnidade = ` 
            SELECT primeiroAcesso 
            FROM usuario_unidade 
            WHERE usuarioID = ? AND unidadeID = ?`
            const [resultUsuarioUnidade] = await db.promise().query(sqlUsuarioUnidade, [usuarioID, unidadeID])
            if (resultUsuarioUnidade) result[0]['primeiroAcesso'] = resultUsuarioUnidade[0]?.primeiroAcesso

            if (result[0]['logo']) {
                result[0]['logo'] = `${process.env.BASE_URL_API}${result[0]['logo']}`
            }

            res.status(200).json(result[0])
        } catch (e) {
            console.log(e)
        }
    }
}

module.exports = fornecedorDashboardController;