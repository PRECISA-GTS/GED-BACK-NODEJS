const db = require('../../config/db');

class FabricaController {
    async getData(req, res) {
        try {
            const { unidadeID } = req.params

            //? Traz o total de forncedor agrupado por status
            const sqlTotalSupplier = `
            SELECT
                a.nome AS title,
                a.cor AS color,
                a.icone AS icon,
                a.statusID,
                COUNT(b.cnpj) AS stats
            FROM
                status AS a 
                LEFT JOIN fornecedor AS b ON (a.statusID = b.status AND b.unidadeID = ?)
            WHERE a.statusID IN (10, 20, 30, 40, 50, 60, 70)
            GROUP BY a.nome
            ORDER BY a.statusID ASC`
            const [resultSqlTotalSupplier] = await db.promise().query(sqlTotalSupplier, [unidadeID])

            //? Traz o total de recebimentoMP agrupado por status
            const sqlTotalRecebimentoNC = `
            SELECT 
                CONCAT(
                    CASE 
                        WHEN MONTH(r.data) = 1 THEN 'Jan'
                        WHEN MONTH(r.data) = 2 THEN 'Fev'
                        WHEN MONTH(r.data) = 3 THEN 'Mar'
                        WHEN MONTH(r.data) = 4 THEN 'Abr'
                        WHEN MONTH(r.data) = 5 THEN 'Mai'
                        WHEN MONTH(r.data) = 6 THEN 'Jun'
                        WHEN MONTH(r.data) = 7 THEN 'Jul'
                        WHEN MONTH(r.data) = 8 THEN 'Ago'
                        WHEN MONTH(r.data) = 9 THEN 'Set'
                        WHEN MONTH(r.data) = 10 THEN 'Out'
                        WHEN MONTH(r.data) = 11 THEN 'Nov'
                        WHEN MONTH(r.data) = 12 THEN 'Dez'
                    END,
                    '/',
                    DATE_FORMAT(r.data, '%y')
                ) AS month,
                COUNT(DISTINCT r.recebimentoMpID) AS mp,
                COUNT(nc.recebimentoMpNaoConformidadeID) AS nc
            FROM recebimentomp AS r
            LEFT JOIN recebimentomp_naoconformidade AS nc ON r.recebimentoMpID = nc.recebimentoMpID
            WHERE 
                r.data IS NOT NULL
                AND YEAR(r.data) > 0
                AND r.unidadeID = ?
            GROUP BY MONTH(r.data), YEAR(r.data)
            ORDER BY r.data ASC`
            const [resultSqlTotalRecebimentoNC] = await db.promise().query(sqlTotalRecebimentoNC, [unidadeID])

            //? Limpeza
            const sqlLimpeza = `
            SELECT 
                lm.nome, 
                lm.ciclo, 
                DATE_FORMAT(MAX(l.dataInicio), '%d/%m/%Y') AS ultimo,	
                DATE_FORMAT(DATE_ADD(MAX(l.dataInicio), INTERVAL lm.ciclo DAY), '%d/%m/%Y') AS limite,
                DATEDIFF(DATE_ADD(MAX(l.dataInicio), INTERVAL lm.ciclo DAY), CURDATE()) AS diasRestantes,
                (100 - ((DATEDIFF(DATE_ADD(MAX(l.dataInicio), INTERVAL lm.ciclo DAY), CURDATE()) * 100) / lm.ciclo)) AS porcentagem
            FROM limpeza AS l 
                JOIN par_limpeza_modelo AS lm ON (l.parLimpezaModeloID = lm.parLimpezaModeloID)
            WHERE l.unidadeID = ? AND lm.status = 1
            GROUP BY lm.parLimpezaModeloID
            ORDER BY DATEDIFF(DATE_ADD(MAX(l.dataInicio), INTERVAL lm.ciclo DAY), CURDATE()) ASC`
            const [resultSqlLimpeza] = await db.promise().query(sqlLimpeza, [unidadeID])

            //? Não conformidades por fornecedor nos últimos 365 dias
            const supplierNonCompliance = await getSupplierNonCompliance(unidadeID)

            const pendingSuppliers = await getPendingSuppliers(unidadeID)

            const values = {
                fornecedorPorStatus: resultSqlTotalSupplier,
                totalRecebimentoNC: resultSqlTotalRecebimentoNC,
                limpeza: resultSqlLimpeza,
                supplierNonCompliance,
                pendingSuppliers
            }
            res.status(200).json(values)
        } catch (e) {
            console.log(e)
        }
    }
}

const getSupplierNonCompliance = async (unidadeID) => {
    const sqlSupplierNonCompliance = `    
    SELECT 
        COALESCE(f.nome, 'N/I') AS nome,
        ROUND(
            (COUNT(r.recebimentompID) / 
            (SELECT COUNT(*)
            FROM recebimentomp AS ri 
            WHERE ri.unidadeID = ? AND ri.fornecedorID = r.fornecedorID AND ri.data >= CURDATE() - INTERVAL 365 DAY)
            ) * 100,
        2) AS percentNc
    FROM recebimentomp AS r
        LEFT JOIN fornecedor AS f ON (r.fornecedorID = f.fornecedorID)
    WHERE r.unidadeID = ? AND r.data >= CURDATE() - INTERVAL 365 DAY AND r.naoConformidade = 1
    GROUP BY r.fornecedorID
    ORDER BY percentNc DESC
    LIMIT 10`
    const [resultSqlSupplierNonCompliance] = await db.promise().query(sqlSupplierNonCompliance, [unidadeID, unidadeID])

    const result = resultSqlSupplierNonCompliance.reduce((acc, row) => {
        acc.suppliers.push(row.nome);
        acc.percents.push(row.percentNc);
        return acc;
    }, { suppliers: [], percents: [] });

    return result
}

const getPendingSuppliers = async (unidadeID) => {
    const sqlPendingSuppliers = `
    SELECT f.status, COUNT(*) AS qtd
    FROM fornecedor AS f
    WHERE f.unidadeID = ? AND f.status <= 40
    GROUP BY f.status`
    const [resultSqlPendingSuppliers] = await db.promise().query(sqlPendingSuppliers, [unidadeID])

    return resultSqlPendingSuppliers
}

module.exports = FabricaController;