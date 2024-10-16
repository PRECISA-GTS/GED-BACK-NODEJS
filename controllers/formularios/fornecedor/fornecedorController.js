const db = require('../../../config/db');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

require('dotenv/config')
const { hasPending, deleteItem, criptoMd5, onlyNumbers, gerarSenhaCaracteresIniciais, removeSpecialCharts } = require('../../../config/defaultConfig');
const conclusionFormFornecedor = require('../../../email/template/fornecedor/conclusionFormFornecedor');
const sendMailConfig = require('../../../config/email');
const {
    addFormStatusMovimentation,
    formatFieldsToTable,
    createDocument,
    getDocumentSignature,
    signedReport,
    getDateNow,
    getTimeNow,
    floatToFractioned
} = require('../../../defaults/functions');

//? Email
const layoutNotification = require('../../../email/template/notificacao');
const instructionsNewFornecedor = require('../../../email/template/fornecedor/instructionsNewFornecedor');
const instructionsExistFornecedor = require('../../../email/template/fornecedor/instructionsExistFornecedor');
const { executeLog, executeQuery } = require('../../../config/executeQuery');
const { getDynamicHeaderFields } = require('../../../defaults/dynamicFields');
const { getHeaderDepartments } = require('../../../defaults/sector/getSectors');
const { getDynamicBlocks, updateDynamicBlocks } = require('../../../defaults/dynamicBlocks');
const { createScheduling, deleteScheduling } = require('../../../defaults/scheduling');

const calculateExpirationDate = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const expirationDate = date.toISOString().split('T')[0];
    return expirationDate
}

class FornecedorController {
    async getFornecedores(req, res) {
        const { unidadeID } = req.body
        if (!unidadeID) return res.status(400).json({ error: 'Unidade não informada!' })

        try {
            const sql = `
            SELECT 
                fornecedorID AS id, 
                NULLIF(CONCAT_WS(" - ", cnpj, nome, NULLIF(CONCAT_WS("/", cidade, estado), '')), '') AS nome
            FROM fornecedor 
            WHERE unidadeID = ? AND atual = 1 AND status IN (60, 70)
            ORDER BY nome ASC`
            const [result] = await db.promise().query(sql, [unidadeID]);

            return res.status(200).json(result);
        } catch (error) {
            console.log(error)
        }
    }

    async getFornecedoresPrestadorServico(req, res) {
        const { unidadeID } = req.body
        if (!unidadeID) return res.status(400).json({ error: 'Unidade não informada!' })

        try {
            const sql = `
            SELECT 
                fornecedorID AS id, 
                NULLIF(CONCAT_WS(" - ", cnpj, nome, NULLIF(CONCAT_WS("/", cidade, estado), '')), '') AS nome
            FROM fornecedor 
            WHERE 
                unidadeID = ? 
                AND atual = 1 
                AND status IN (60, 70)
                AND prestadorServico = 1
                AND dataExpiracao >= CURDATE()
            ORDER BY nome ASC`
            const [result] = await db.promise().query(sql, [unidadeID]);

            return res.status(200).json(result);
        } catch (error) {
            console.log(error)
        }
    }

    async verifyIfHasModel(req, res) {
        const { id } = req.params
        const sql = `SELECT * FROM fornecedor WHERE fornecedorID = ?`
        const [result] = await db.promise().query(sql, [id])

        if (result[0]['parFornecedorModeloID'] && result[0]['parFornecedorModeloID'] > 0) return res.status(200).json({ hasModel: true })
        return res.status(200).json({ hasModel: false })
    }

    async getMapaSipeAgro(req, res) {
        let { cnpj } = req.body

        if (!cnpj) return res.status(400).json({ message: 'CNPJ inválido' })

        // CNPJ está na tabela em 2 formatos 00.000.000/0000-00 e 00000000000000
        const cnpjOnlyNumber = onlyNumbers(cnpj);

        const sql = `
        SELECT 
            DATE_FORMAT(s.dataImportacao, '%d/%m/%Y') AS dataImportacao,
            s.* 
        FROM sipeagro AS s 
        WHERE s.cnpj = ? OR s.cnpj = ? `;
        const [result] = await db.promise().query(sql, [cnpjOnlyNumber, cnpj]);
        return res.status(200).json(result[0]);
    }

    async createDocumentAutentique(req, res) {
        const { id, usuarioID } = req.params

        // Dados usuario
        const sqlUser = `SELECT email FROM usuario WHERE usuarioID = ?`
        const [user] = await db.promise().query(sqlUser, [usuarioID])

        //Dados do relatório do fornecedor
        const sqlRelatorio = `
        SELECT 
            a.*
        FROM anexo AS a
            JOIN anexo_busca AS b ON (a.anexoID = b.anexoID)
        WHERE b.fornecedorID = ? AND b.principal = 1`
        const [resultRelatorio] = await db.promise().query(sqlRelatorio, [id])
        const path = `${resultRelatorio[0].diretorio}/${resultRelatorio[0].arquivo}`

        if (!path) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
        if (!user[0].email) return res.status(400).json({ error: 'Nenhum email encontrado.' })

        const idDocument = await createDocument(user[0].email, path)
        return res.status(200).json(idDocument)
    }

    saveSignedDocument = async (req, res) => {
        const { id, usuarioID, unidadeID, hashSignedDocument } = req.body;
        try {

            const pathReport = await getDocumentSignature(hashSignedDocument); // Pega a url do pdf
            const signed = await signedReport(pathReport); // Verifica se o documento foi assinado

            // O documento foi assinado no Autentique
            if (signed) {
                const pathDestination = `uploads/${unidadeID}/fornecedor/relatorio/assinado/`;
                const fileName = `${usuarioID}-${id}-fornecedor.pdf`;
                try {
                    const response = await axios({
                        method: 'get',
                        url: pathReport,
                        responseType: 'stream',
                    });

                    // Salvar o PDF localmente usando o fs
                    const stream = fs.createWriteStream(`${pathDestination}/${fileName}`);
                    response.data.pipe(stream);

                    await new Promise((resolve, reject) => {
                        stream.on('finish', resolve);
                        stream.on('error', reject);
                    });

                    const logID = await executeLog('Relatório de fornecedor assinado na Autentique', usuarioID, unidadeID, req)

                    //? Remover o atual
                    const sqlAnexoId = `SELECT anexoID FROM anexo_busca WHERE fornecedorID = ? AND principal = 1 AND assinado = 1`
                    const [resultAnexoId] = await db.promise().query(sqlAnexoId, [id])
                    const anexoId = resultAnexoId[0]?.anexoID
                    const sqlDeleteBusca = `DELETE FROM anexo_busca WHERE anexoID = ?`
                    const sqlDelete = `DELETE FROM anexo WHERE anexoID = ?`
                    await executeQuery(sqlDeleteBusca, [anexoId], 'delete', 'anexo_busca', 'anexoBuscaID', anexoId, logID)
                    await executeQuery(sqlDelete, [anexoId], 'delete', 'anexo', 'anexoID', anexoId, logID)

                    //? Insere em anexo
                    const sqlInsert = `INSERT INTO anexo(titulo, diretorio, arquivo, tamanho, tipo, usuarioID, unidadeID, dataHora) VALUES(?,?,?,?,?,?,?,?)`;
                    const anexoID = await executeQuery(sqlInsert, [
                        'Relatório assinado',
                        pathDestination,
                        fileName,
                        '307200',
                        'application/pdf',
                        usuarioID,
                        unidadeID,
                        new Date()
                    ], 'insert', 'anexo', 'anexoID', null, logID)

                    //? Insere em anexo_busca
                    const sqlInsertBusca = `INSERT INTO anexo_busca(anexoID, fornecedorID, unidadeID, principal, assinado) VALUES(?,?,?,?,?)`;
                    await executeQuery(sqlInsertBusca, [anexoID,
                        id,
                        unidadeID,
                        1,
                        1
                    ], 'insert', 'anexo_busca', 'anexoBuscaID', null, logID)

                    //? Update em fornecedor setando assinado com 1 
                    const sqlUpdate = `UPDATE fornecedor SET assinado = 1 WHERE fornecedorID = ?`
                    await executeQuery(sqlUpdate, [id], 'update', 'fornecedor', 'fornecedorID', id, logID)

                    res.status(200).json({ success: true, message: 'Documento assinado e salvo com sucesso.' });

                } catch (e) {
                    console.log(e, 'error', pathReport, `${pathDestination}/${fileName}`);
                    res.status(500).json({ error: 'Erro ao salvar o documento assinado.' });
                }

            } else {
                res.status(400).json({ error: 'Documento não assinado.' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    }

    async getFornecedoresAprovados(req, res) {
        let { unidadeID, recebimentoMpID, modelo } = req.body

        try {
            if (!unidadeID) { return res.status(200).json([]) }

            const sql = `
            SELECT 
                f.fornecedorID AS id,
                NULLIF(CONCAT_WS(" - ", f.cnpj, f.nome, NULLIF(CONCAT_WS("/", f.cidade, f.estado), '')), '') AS nome,
                f.nome AS nome_, 
                f.cnpj,
                f.cnpj AS cnpj_,
                f.email,
                f.telefone,
                IF(f.cidade, CONCAT(f.cidade, "/", f.estado), null) AS cidade,
                u.cabecalhoRelatorio AS foto
            FROM fornecedor AS f
                LEFT JOIN unidade AS u ON (f.cnpj = u.cnpj)
            WHERE f.unidadeID = ? AND f.status IN (60, 70)
            GROUP BY f.cnpj
            ORDER BY f.nome ASC`
            const [result] = await db.promise().query(sql, [unidadeID])

            for (const fornecedor of result) {
                fornecedor['foto'] = fornecedor.foto ? `${process.env.BASE_URL_API}${fornecedor.foto}` : null

                //? Obtém os produtos aprovados pra cada fornecedor
                const sqlProdutos = `
                SELECT
                    p.produtoID, 
                    CONCAT(p.nome, " (", um.nome, ")") AS nome,

                    -- Recebimento de MP (valores)
                    (
                        SELECT rp.quantidade
                        FROM recebimentomp_produto AS rp 
                        WHERE rp.recebimentoMpID = ${recebimentoMpID ?? 0} AND rp.produtoID = fp.produtoID
                        LIMIT 1
                    ) AS quantidade,
                    (
                        SELECT rp.lote
                        FROM recebimentomp_produto AS rp 
                        WHERE rp.recebimentoMpID = ${recebimentoMpID ?? 0} AND rp.produtoID = fp.produtoID
                        LIMIT 1
                    ) AS lote,
                    (
                        SELECT DATE_FORMAT(rp.dataFabricacao, '%Y-%m-%d')
                        FROM recebimentomp_produto AS rp 
                        WHERE rp.recebimentoMpID = ${recebimentoMpID ?? 0} AND rp.produtoID = fp.produtoID
                        LIMIT 1
                    ) AS dataFabricacao,
                    (
                        SELECT DATE_FORMAT(rp.dataValidade, '%Y-%m-%d')
                        FROM recebimentomp_produto AS rp 
                        WHERE rp.recebimentoMpID = ${recebimentoMpID ?? 0} AND rp.produtoID = fp.produtoID
                        LIMIT 1
                    ) AS dataValidade,
                    (
                        SELECT rp.apresentacaoID
                        FROM recebimentomp_produto AS rp 
                        WHERE rp.recebimentoMpID = ${recebimentoMpID ?? 0} AND rp.produtoID = fp.produtoID
                        LIMIT 1
                    ) AS apresentacaoID,
                    (
                        SELECT a.nome
                        FROM recebimentomp_produto AS rp 
                            JOIN apresentacao AS a ON (rp.apresentacaoID = a.apresentacaoID)
                        WHERE rp.recebimentoMpID = ${recebimentoMpID ?? 0} AND rp.produtoID = fp.produtoID
                        LIMIT 1
                    ) AS apresentacaoNome,            

                    -- Fornecedor (opções de produtos habilitados pro fornecedor selecionado)
                    (
                        SELECT DATE_FORMAT(b.dataFim, "%d/%m/%Y") AS dataFim
                        FROM fornecedor_produto AS a
                            JOIN fornecedor AS b ON (a.fornecedorID = b.fornecedorID)
                        WHERE a.produtoID = fp.produtoID AND b.cnpj = "${fornecedor.cnpj}" AND b.status IN (60, 70) AND b.unidadeID = ${unidadeID}
                        ORDER BY b.dataFim DESC
                        LIMIT 1
                    ) AS ultimaAvaliacao,            
                    (
                        SELECT DATE_FORMAT(DATE_ADD(b.dataFim, INTERVAL ${modelo.ciclo ?? 0} DAY), "%d/%m/%Y") AS dataFim
                        FROM fornecedor_produto AS a
                            JOIN fornecedor AS b ON (a.fornecedorID = b.fornecedorID)
                        WHERE a.produtoID = fp.produtoID AND b.cnpj = "${fornecedor.cnpj}" AND b.status IN (60, 70) AND b.unidadeID = ${unidadeID}
                        ORDER BY b.dataFim DESC
                        LIMIT 1
                    ) AS proximaAvialacao,
                    DATEDIFF(
                        (
                            SELECT DATE_ADD(b.dataFim, INTERVAL ${modelo.ciclo ?? 0} DAY) AS dataFim
                            FROM fornecedor_produto AS a
                                JOIN fornecedor AS b ON (a.fornecedorID = b.fornecedorID)
                            WHERE a.produtoID = fp.produtoID AND b.cnpj = "${fornecedor.cnpj}" AND b.status IN (60, 70) AND b.unidadeID = ${unidadeID}
                            ORDER BY b.dataFim DESC
                            LIMIT 1
                        ),
                        NOW()
                    ) AS diasRestantes       
                FROM fornecedor_produto AS fp
                    JOIN fornecedor AS f ON (fp.fornecedorID = f.fornecedorID)
                    JOIN produto AS p ON (fp.produtoID = p.produtoID)
                    LEFT JOIN unidademedida AS um ON (p.unidadeMedidaID = um.unidadeMedidaID)
                WHERE f.cnpj = "${fornecedor.cnpj}" AND f.status IN (60, 70) AND f.unidadeID = ${unidadeID} AND p.status = 1
                GROUP BY fp.fornecedorProdutoID
                ORDER BY p.nome ASC`
                const [resultProdutos] = await db.promise().query(sqlProdutos)

                let produtosVariacao = []
                if (resultProdutos.length > 0) {
                    const groupedProducts = {};

                    // Itera sobre os produtos para agrupá-los por produtoID
                    for (const produto of resultProdutos) {
                        // Cria a estrutura do produto
                        const produtoInfo = {
                            produtoID: produto.produtoID,
                            nome: produto.nome,
                            unidadeMedida: produto.unidadeMedida,
                            variacoes: []
                        };

                        // Cria a estrutura da variação
                        const variacao = {
                            // recebimentoMpProdutoID: produto.recebimentoMpProdutoID,
                            quantidade: floatToFractioned(produto.quantidade),
                            dataFabricacao: produto.dataFabricacao,
                            lote: produto.lote,
                            nf: produto.nf,
                            dataValidade: produto.dataValidade,
                            apresentacao: produto.apresentacaoID > 0 ? {
                                id: produto.apresentacaoID,
                                nome: produto.apresentacao
                            } : null,

                        };

                        // Se o produto já existe no objeto agrupado, adicione a variação
                        if (groupedProducts[produto.produtoID]) {
                            groupedProducts[produto.produtoID].variacoes.push(variacao);
                        } else {
                            // Se o produto não existe, crie uma nova entrada com a primeira variação
                            produtoInfo.variacoes.push(variacao);
                            groupedProducts[produto.produtoID] = produtoInfo;
                        }
                    }

                    // Converte o objeto agrupado em uma lista
                    produtosVariacao = Object.values(groupedProducts);

                    // for (const produto of resultProdutos) {
                    //     produto.quantidade = floatToFractioned(produto.quantidade)
                    //     produto.apresentacao = produto.apresentacaoID > 0 ? {
                    //         id: produto.apresentacaoID,
                    //         nome: produto.apresentacaoNome
                    //     } : null
                    // }
                }
                fornecedor['produtos'] = produtosVariacao ?? []
            }

            return res.status(200).json(result)

        } catch (error) {
            console.log(error)
        }
    }

    async getModels(req, res) {
        const { unidadeID } = req.body
        const sql = `
        SELECT
            parFornecedorModeloID AS id,
            CONCAT(parFornecedorModeloID, ' - ', nome) AS name
        FROM par_fornecedor_modelo
        WHERE unidadeID = ? AND status = 1
        ORDER BY nome ASC`;

        const [result] = await db.promise().query(sql, [unidadeID])
        return res.status(200).json(result);
    }

    async getProducts(req, res) {
        const { unidadeID } = req.body
        const sql = `
        SELECT
        a.produtoID AS id,
            CONCAT(a.nome, ' (', b.nome, ')') AS nome
        FROM produto AS a
            JOIN unidademedida AS b ON(a.unidadeMedidaID = b.unidadeMedidaID)
        WHERE a.unidadeID = ? AND a.status = 1 
        ORDER BY a.nome ASC`;
        const [result] = await db.promise().query(sql, [unidadeID])
        return res.status(200).json(result);
    }

    async getGruposAnexo(req, res) {
        const { unidadeID } = req.body
        const sql = `
        SELECT grupoAnexoID AS id, nome
        FROM grupoanexo
        WHERE unidadeID = ? AND status = 1 
        ORDER BY nome ASC`;
        const [result] = await db.promise().query(sql, [unidadeID])
        return res.status(200).json(result);
    }

    async sendNotification(req, res) {
        try {
            const { id, usuarioID, papelID, unidadeID } = req.body.auth;
            const values = req.body.values;

            if (!values || !id) { return res.status(400).json({ message: 'Erro ao enviar notificação!' }) }

            //* Envia email
            if (values.email) {
                const html = await layoutNotification(values);
                // res.status(200).json(sendMailConfig(values.emailDestinatario, 'Notificação do sistema', html))
            }

            return res.status(200).json({ message: 'Notificação enviada com sucesso!' })
        } catch (error) {
            (error)
        }
    }

    // Salva relatório quando o status for maior ou igual a 40 e tipo igual fabrica
    async saveAnexo(req, res) {

        try {
            const { id } = req.params;
            const pathDestination = req.pathDestination
            const files = req.files; //? Array de arquivos

            const { usuarioID, unidadeID, produtoAnexoID, grupoAnexoItemID, parFornecedorModeloBlocoID, itemOpcaoAnexoID, arrAnexoRemoved } = req.body;

            //? Verificar se há arquivos enviados
            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
            }

            const logID = await executeLog('Salvo anexo no formulário do fornecedor', usuarioID, unidadeID, req)

            let result = []
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                //? Insere em anexodd
                const sqlInsert = `INSERT INTO anexo(titulo, diretorio, arquivo, tamanho, tipo, usuarioID, unidadeID, dataHora) VALUES(?,?,?,?,?,?,?,?)`;

                const anexoID = await executeQuery(sqlInsert, [removeSpecialCharts(file.originalname),
                    pathDestination,
                file.filename,
                file.size,
                file.mimetype,
                    usuarioID,
                    unidadeID,
                new Date()], 'insert', 'anexo', 'anexoID', null, logID)

                //? Insere em anexo_busca
                const sqlInsertBusca = `INSERT INTO anexo_busca(anexoID, fornecedorID, produtoAnexoID, grupoAnexoItemID, parFornecedorModeloBlocoID, itemOpcaoAnexoID) VALUES(?,?,?,?,?,?)`;

                await executeQuery(sqlInsertBusca, [anexoID,
                    id,
                    produtoAnexoID ?? null,
                    grupoAnexoItemID ?? null,
                    parFornecedorModeloBlocoID ?? null,
                    itemOpcaoAnexoID ?? null], 'insert', 'anexo_busca', 'anexoBuscaID', null, logID)

                const objAnexo = {
                    exist: true,
                    anexoID: anexoID,
                    path: `${process.env.BASE_URL_API}${pathDestination}${file.filename} `,
                    nome: file.originalname,
                    tipo: file.mimetype,
                    size: file.size,
                    time: new Date(),
                }
                result.push(objAnexo)
            }

            return res.status(200).json(result)
        } catch (error) {
            console.log(error)
        }
    }

    async deleteAnexo(req, res) {
        const { id, anexoID, unidadeID, usuarioID, folder } = req.params;

        const logID = await executeLog('Exclusão anexo no formulário do fornecedor', usuarioID, unidadeID, req)

        //? Obtém o caminho do anexo atual
        const sqlCurrentFile = `SELECT arquivo FROM anexo WHERE anexoID = ? `;
        const [tempResultCurrentFile] = await db.promise().query(sqlCurrentFile, [anexoID])
        const resultCurrentFile = tempResultCurrentFile[0]?.arquivo;

        //? Remover arquivo do diretório
        if (resultCurrentFile) {
            const pathFile = `uploads/${unidadeID}/fornecedor/${folder}/`
            const previousFile = path.resolve(pathFile, resultCurrentFile);
            fs.unlink(previousFile, (error) => {
                if (error) {
                    return console.error('Erro ao remover o anexo:', error);
                } else {
                    return console.log('Anexo removido com sucesso!');
                }
            });
        }

        //? Remove anexo do BD
        const sqlDeleteBusca = `DELETE FROM anexo_busca WHERE anexoID = ?`;
        await executeQuery(sqlDeleteBusca, [anexoID], 'delete', 'anexo_busca', 'anexoID', anexoID, logID)

        const sqlDelete = `DELETE FROM anexo WHERE anexoID = ?`;
        await executeQuery(sqlDelete, [anexoID], 'delete', 'anexo', 'anexoID', anexoID, logID)

        res.status(200).json(anexoID);
    }

    async getList(req, res) {
        const { unidadeID, papelID, cnpj, status } = req.body;

        //* Fábrica 
        if (papelID == 1) {
            if (!unidadeID) { return res.json({ message: 'Erro ao receber unidadeID!' }) }
            const sql = `
            SELECT
                f.fornecedorID AS id,
                CONCAT(f.nome, ' (', f.cnpj, ')') AS fornecedor,
                IF(f.quemPreenche = 1, 'Fábrica', 'Fornecedor') as quemPreenche,
                IF(MONTH(f.data) > 0, DATE_FORMAT(f.data, "%d/%m/%Y"), '--') AS data,
                IF(f.cnpj <> '', f.cnpj, '--') AS cnpj,
                CONCAT_WS('/', f.cidade, f.estado) AS cidade,
                e.statusID,
                e.nome AS status,
                e.cor,
                COALESCE(IF(f.prestadorServico = 1, 'Serviço', GROUP_CONCAT(p.nome SEPARATOR ', ')), '--') AS produtos
            FROM fornecedor AS f
                LEFT JOIN unidade AS u ON(f.unidadeID = u.unidadeID)
                LEFT JOIN status AS e ON (f.status = e.statusID)
                LEFT JOIN fornecedor_produto AS fp ON (f.fornecedorID = fp.fornecedorID)
                LEFT JOIN produto AS p ON (fp.produtoID = p.produtoID)
            WHERE f.unidadeID = ? ${status && status.type === 'open' ? ` AND f.status <= 40` : ''}
            GROUP BY f.fornecedorID
            ORDER BY f.fornecedorID DESC, f.status ASC`
            const [result] = await db.promise().query(sql, [unidadeID])
            return res.status(200).json(result);
        }
        //* Fornecedor 
        else if (papelID == 2 && cnpj) {
            const sql = `
            SELECT
                f.fornecedorID AS id,
                IF(MONTH(f.data) > 0, DATE_FORMAT(f.data, "%d/%m/%Y"), '--') AS data,
                IF(u.nomeFantasia <> '', CONCAT(u.nomeFantasia, ' (', u.cnpj, ')'), '--') AS fabrica,
                IF(u.cnpj <> '', u.cnpj, '--') AS cnpj,
                IF(u.cidade <> '', CONCAT(u.cidade, '/', u.uf), '--') AS cidade,
                IF(u.responsavel <> '', u.responsavel, '--') AS responsavel,
                e.nome AS status,   
                e.cor,
                COALESCE(GROUP_CONCAT(p.nome SEPARATOR ', '), '--') AS produtos
            FROM fornecedor AS f
                LEFT JOIN unidade AS u ON(f.unidadeID = u.unidadeID)
                LEFT JOIN status AS e  ON(f.status = e.statusID)
                LEFT JOIN fornecedor_produto AS fp ON (f.fornecedorID = fp.fornecedorID)
                LEFT JOIN produto AS p ON (fp.produtoID = p.produtoID)
            WHERE f.cnpj = "${cnpj}"
            GROUP BY f.fornecedorID
            ORDER BY f.data DESC, f.status ASC`
            const [result] = await db.promise().query(sql)
            return res.status(200).json(result);
        }

        return res.status(409).json({ message: 'Nenhum registro encontrado!' })

    }

    //* Retorna a estrutura do formulário configurada pra aquela unidade
    async getData(req, res) {
        try {
            const { id } = req.params; // id do formulário

            if (!id || id == 'undefined') { return res.json({ message: 'Erro ao listar formulário!' }) }

            //? obtém a unidadeID (fábrica) do formulário, pro formulário ter os campos de preenchimento de acordo com o configurado pra aquela fábrica.
            const sqlUnidade = `
            SELECT 
                f.parFornecedorModeloID, 
                f.unidadeID, 
                f.usuarioID,
                f.cnpj AS cnpjFornecedor,                 
                DATE_FORMAT(f.dataInicio, '%d/%m/%Y') AS dataInicio, 
                DATE_FORMAT(f.dataInicio, '%H:%i') AS horaInicio, 
                pab.profissionalID AS profissionalAbriuID,
                pab.nome AS profissionalAbriuNome,
                
                IF(f.data, DATE_FORMAT(f.data, '%Y-%m-%d'), DATE_FORMAT(NOW(), '%Y-%m-%d')) AS data, 
                IF(f.data, DATE_FORMAT(f.data, '%H:%i'), DATE_FORMAT(NOW(), '%H:%i')) AS hora, 
                us.usuarioID,
                us.nome AS preenche,
                f.quemPreenche,            
                f.razaoSocial,
                f.nome,        
                f.telefone,
                f.email,      
                
                f.status,
                f.obs,
                f.cpf,
                f.prestadorServico,
                
                DATE_FORMAT(f.dataFim, '%d/%m/%Y') AS dataFim, 
                DATE_FORMAT(f.dataFim, '%H:%i') AS horaFim, 
                f.aprovaProfissionalID,
                pa.nome AS profissionalAprova,
                p.nome AS modelo,
                p.ciclo,

                u.nomeFantasia, 
                u.cnpj, 
                u.obrigatorioProdutoFornecedor
            FROM fornecedor AS f
                LEFT JOIN unidade AS u ON(f.unidadeID = u.unidadeID)
                LEFT JOIN usuario AS us ON (f.usuarioID = us.usuarioID)
                LEFT JOIN profissional AS pab ON (f.profissionalID = pab.profissionalID)
                LEFT JOIN profissional AS pa ON (f.aprovaProfissionalID = pa.profissionalID)
                LEFT JOIN par_fornecedor_modelo AS p ON (f.parFornecedorModeloID = p.parFornecedorModeloID)
            WHERE f.fornecedorID = ? `
            const [resultFornecedor] = await db.promise().query(sqlUnidade, [id])

            if (!resultFornecedor || resultFornecedor?.length == 0) return res.status(200).json({ message: 'Nenhum registro encontrado!' })

            const unidade = {
                quemPreenche: resultFornecedor[0]?.quemPreenche ?? null,
                parFornecedorModeloID: resultFornecedor[0]?.parFornecedorModeloID ?? 0,
                unidadeID: resultFornecedor[0]['unidadeID'],
                nomeFantasia: resultFornecedor[0]['nomeFantasia'],
                modelo: resultFornecedor[0].modelo,
                ciclo: resultFornecedor[0].ciclo,
                cnpj: resultFornecedor[0]['cnpj'],
                obrigatorioProdutoFornecedor: resultFornecedor[0]['obrigatorioProdutoFornecedor'] == 1 ? true : false
            }
            const modeloID = resultFornecedor[0].parFornecedorModeloID

            //? obtém os dados da unidade do fornecedor (controle de notificações)
            const sqlUnidadeFornecedor = `
            SELECT u.unidadeID, u.nomeFantasia, u.cnpj
            FROM unidade AS u
            WHERE u.cnpj = "${resultFornecedor[0].cnpjFornecedor}" `
            const [resultUnidadeFornecedor] = await db.promise().query(sqlUnidadeFornecedor)
            unidade['fornecedor'] = resultUnidadeFornecedor[0]

            //! Nenhum modelo configurado, aguardando preenchimento do fornecedor
            if (resultFornecedor && resultFornecedor[0]['parFornecedorModeloID'] == 0) {
                const data = {
                    hasModel: false,
                    unidade: unidade,
                    nomeFantasia: resultFornecedor[0]['nome'],
                    razaoSocial: resultFornecedor[0]['razaoSocial'],
                    cnpj: resultFornecedor[0]['cnpjFornecedor'],
                    telefone: resultFornecedor[0]['telefone'],
                    email: resultFornecedor[0]['email'],
                    dataInicio: resultFornecedor[0]['dataInicio'],
                    info: {
                        obs: resultFornecedor[0].obs,
                        status: resultFornecedor[0].status,
                        usuarioID: resultFornecedor[0].usuarioID
                    },
                    link: `${process.env.BASE_URL}formularios/fornecedor?id=${id}`,
                }

                return res.status(200).json(data)
            }

            //? Função que retorna fields dinâmicos definidos no modelo!
            const fields = await getDynamicHeaderFields(
                id,
                modeloID,
                unidade.unidadeID,
                resultFornecedor[0]['status'],
                'par_fornecedor',
                'parFornecedorID',
                'parFornecedorModeloID',
                'fornecedor',
                'fornecedorID'
            )

            //* PRODUTOS
            const sqlProdutos = `
            SELECT fp.fornecedorProdutoID, p.*, um.nome AS unidadeMedida 
            FROM fornecedor_produto AS fp 
                JOIN produto AS p ON (fp.produtoID = p.produtoID)
                LEFT JOIN unidademedida AS um ON (p.unidadeMedidaID = um.unidadeMedidaID)
            WHERE fp.fornecedorID = ? AND p.status = 1`
            const [resultProdutos] = await db.promise().query(sqlProdutos, [id])

            // Varre produtos verificando tabela produto_anexo
            if (resultProdutos.length > 0) {
                for (const produto of resultProdutos) {
                    const sqlProdutoAnexo = `
                    SELECT * 
                    FROM produto_anexo 
                    WHERE produtoID = ? AND parFormularioID = 1 AND status = 1`
                    const [resultProdutoAnexo] = await db.promise().query(sqlProdutoAnexo, [produto.produtoID])

                    for (const produtoTituloAnexo of resultProdutoAnexo) {
                        const sqlAnexo = `
                        SELECT a.*
                        FROM anexo AS a
                            JOIN anexo_busca AS ab ON (a.anexoID = ab.anexoID)
                        WHERE ab.fornecedorID = ? AND ab.produtoAnexoID = ?`
                        const [resultAnexo] = await db.promise().query(sqlAnexo, [id, produtoTituloAnexo.produtoAnexoID])

                        const arrayAnexos = []
                        for (const anexo of resultAnexo) {
                            if (anexo && anexo.anexoID > 0) {
                                const objAnexo = {
                                    exist: true,
                                    anexoID: anexo.anexoID,
                                    path: `${process.env.BASE_URL_API}${anexo.diretorio}${anexo.arquivo} `,
                                    nome: anexo.titulo,
                                    tipo: anexo.tipo,
                                    size: anexo.tamanho,
                                    time: anexo.dataHora
                                }
                                arrayAnexos.push(objAnexo)
                            }
                        }
                        produtoTituloAnexo['anexos'] = arrayAnexos
                    }

                    produto['produtoAnexosDescricao'] = resultProdutoAnexo ?? []
                }
            }

            //* GRUPOS DE ANEXO
            const sqlGruposAnexo = `
            SELECT *
            FROM fornecedor_grupoanexo AS fg
                LEFT JOIN grupoanexo AS ga ON(fg.grupoAnexoID = ga.grupoAnexoID)
            WHERE fg.fornecedorID = ? AND ga.status = 1`;
            const [resultGruposAnexo] = await db.promise().query(sqlGruposAnexo, [id]);

            const gruposAnexo = [];
            if (resultGruposAnexo.length > 0) {
                for (const grupo of resultGruposAnexo) {
                    //? Pega os itens do grupo atual
                    const sqlItens = `SELECT * FROM grupoanexo_item WHERE grupoAnexoID = ? AND status = 1`;
                    const [resultGrupoItens] = await db.promise().query(sqlItens, [grupo.grupoAnexoID]);

                    //? Varre itens do grupo, verificando se tem anexo
                    for (const item of resultGrupoItens) {
                        const sqlAnexo = `
                        SELECT a.* 
                        FROM anexo AS a 
                            JOIN anexo_busca AS ab ON (a.anexoID = ab.anexoID)
                        WHERE ab.fornecedorID = ? AND ab.grupoAnexoItemID = ? `
                        const [resultAnexo] = await db.promise().query(sqlAnexo, [id, item.grupoAnexoItemID]);

                        const arrayAnexos = []
                        for (const anexo of resultAnexo) {
                            if (anexo && anexo.anexoID > 0) {
                                const objAnexo = {
                                    exist: true,
                                    anexoID: anexo.anexoID,
                                    path: `${process.env.BASE_URL_API}${anexo.diretorio}${anexo.arquivo} `,
                                    nome: anexo.titulo,
                                    tipo: anexo.tipo,
                                    size: anexo.tamanho,
                                    time: anexo.dataHora
                                }
                                arrayAnexos.push(objAnexo)
                            }
                        }
                        item['anexos'] = arrayAnexos
                    }

                    grupo['itens'] = resultGrupoItens
                    gruposAnexo.push(grupo)
                }
            }

            const sqlBlocos = `
            SELECT *
            FROM par_fornecedor_modelo_bloco
            WHERE parFornecedorModeloID = ? AND status = 1
            ORDER BY ordem ASC`
            const [resultBlocos] = await db.promise().query(sqlBlocos, [modeloID])

            //? Função que retorna blocos dinâmicos definidos no modelo!
            const blocos = await getDynamicBlocks(
                id,
                modeloID,
                resultFornecedor[0]['status'],
                'fornecedorID',
                'par_fornecedor_modelo_bloco',
                'parFornecedorModeloID',
                'fornecedor_resposta',
                'fornecedorRespostaID',
                'par_fornecedor_modelo_bloco_item',
                'parFornecedorModeloBlocoItemID',
                'parFornecedorModeloBlocoID',
                'par_fornecedor_modelo_bloco_departamento'
            )

            // Observação e status
            const sqlOtherInformations = getSqlOtherInfos()
            const [resultOtherInformations] = await db.promise().query(sqlOtherInformations, [id])

            //* Última movimentação do formulário
            const sqlLastMovimentation = `
            SELECT 
                u.nome, 
                un.nomeFantasia, 
                s1.nome AS statusAnterior, 
                s2.nome AS statusAtual,
                DATE_FORMAT(m.dataHora, '%d/%m/%Y %H:%i') AS dataHora, 
                m.observacao
            FROM movimentacaoformulario AS m
                JOIN usuario AS u ON (m.usuarioID = u.usuarioID)
                JOIN unidade AS un ON (m.unidadeID = un.unidadeID)
                LEFT JOIN status AS s1 ON (s1.statusID = m.statusAnterior)
                LEFT JOIN status AS s2 ON (s2.statusID = m.statusAtual)
            WHERE m.parFormularioID = 1 AND m.id = ?
            ORDER BY m.movimentacaoFormularioID DESC 
            LIMIT 1`
            const [resultLastMovimentation] = await db.promise().query(sqlLastMovimentation, [id])

            //? Cabeçalho do modelo do formulário 
            const sqlCabecalhoModelo = `
            SELECT cabecalho
            FROM par_fornecedor_modelo
            WHERE parFornecedorModeloID = ?`
            const [resultCabecalhoModelo] = await db.promise().query(sqlCabecalhoModelo, [modeloID])

            const today = getDateNow()
            const time = getTimeNow()

            //? Departamentos vinculados ao cabeçalho e rodapé (preenchimento e conclusão)
            const sqlDepartamentos = `
            SELECT 
                b.departamentoID AS id, 
                b.nome, 
                a.tipo
            FROM par_fornecedor_modelo_departamento AS a 
                JOIN departamento AS b ON (a.departamentoID = b.departamentoID)
            WHERE a.parFornecedorModeloID = ? AND b.status = 1
            ORDER BY b.nome ASC`
            const [resultDepartamentos] = await db.promise().query(sqlDepartamentos, [modeloID])

            const sectors = await getHeaderDepartments(
                modeloID,
                'par_fornecedor_modelo_departamento',
                'parFornecedorModeloID'
            )

            const data = {
                hasModel: true,
                unidade: unidade,
                fieldsHeader: {
                    //? Fixos
                    abertoPor: {
                        dataInicio: resultFornecedor[0]?.dataInicio ?? today,
                        horaInicio: resultFornecedor[0]?.horaInicio ?? time,
                        profissional: resultFornecedor[0].profissionalAbriuID > 0 ? {
                            id: resultFornecedor[0].profissionalAbriuID,
                            nome: resultFornecedor[0].profissionalAbriuNome
                        } : null
                    },
                    //? Fields                    
                    data: resultFornecedor[0]?.data ?? today,
                    hora: resultFornecedor[0]?.hora ?? time,
                    profissional: resultFornecedor[0].usuarioID > 0 ? {
                        id: resultFornecedor[0].usuarioID,
                        nome: resultFornecedor[0].preenche
                    } : null,
                    cnpj: resultFornecedor[0].cnpjFornecedor,
                    razaoSocial: resultFornecedor[0].razaoSocial,
                    nomeFantasia: resultFornecedor[0].nome,
                    //? Departamentos que preenchem
                    departamentos: sectors.fill,
                    cpf: resultFornecedor[0].cpf === 1 ? true : false,
                    prestadorServico: resultFornecedor[0].prestadorServico === 1 ? true : false,
                },
                fieldsFooter: {
                    concluded: resultFornecedor[0].dataFim ? true : false,
                    dataConclusao: resultFornecedor[0].dataFim ?? today,
                    horaConclusao: resultFornecedor[0].horaFim ?? time,
                    profissionalAprova: resultFornecedor[0].aprovaProfissionalID > 0 ? {
                        id: resultFornecedor[0].aprovaProfissionalID,
                        nome: resultFornecedor[0].profissionalAprova
                    } : null,
                    //? Departamentos que concluem
                    departamentos: sectors.conclude,
                },
                fields: fields,
                produtos: resultProdutos ?? [],
                blocos: blocos ?? [],
                grupoAnexo: gruposAnexo ?? [],
                ultimaMovimentacao: resultLastMovimentation[0] ?? null,
                info: {
                    obs: resultOtherInformations[0].obs,
                    status: resultOtherInformations[0].status,
                    cabecalhoModelo: resultCabecalhoModelo[0]?.cabecalho,
                    usuarioID: resultFornecedor[0].usuarioID
                },
                link: `${process.env.BASE_URL}formularios/fornecedor?id=${id}`,
            }

            res.status(200).json(data);
        } catch (error) {
            console.log(error)
        }
    }

    async updateData(req, res) {
        const { id } = req.params
        const data = req.body.form
        const currentStatus = req.body.currentStatus //? Status atual do formulário
        const { usuarioID, papelID, unidadeID } = req.body.auth
        const logID = await executeLog('Edição formulário do fornecedor', usuarioID, unidadeID, req)

        if (!id || id == 'undefined') { return res.json({ message: 'ID não recebido!' }); }

        const sqlProfissional = `
        SELECT profissionalID
        FROM profissional
        WHERE usuarioID = ? `
        const [resultProfissional] = await db.promise().query(sqlProfissional, [usuarioID])

        const sqlSelect = `SELECT status FROM fornecedor WHERE fornecedorID = ? `
        const [resultFornecedor] = await db.promise().query(sqlSelect, [id])

        //? Atualiza header fixo
        const sqlStaticlHeader = `
        UPDATE fornecedor SET data = ?, usuarioID = ?, razaoSocial = ?, nome = ? 
        WHERE fornecedorID = ${id}`
        const resultStaticHeader = await executeQuery(sqlStaticlHeader, [
            data.fieldsHeader?.data ? `${data.fieldsHeader.data} ${data.fieldsHeader.hora}` : null,
            usuarioID,
            data.fieldsHeader.razaoSocial ?? null,
            data.fieldsHeader.nomeFantasia ?? null
        ], 'update', 'fornecedor', 'fornecedorID', id, logID)

        //? Atualizar o header dinâmico e setar o status    
        let dataHeader = null
        if (data.fields.length > 0) {
            //* Função verifica na tabela de parametrizações do formulário e ve se objeto se referencia ao campo tabela, se sim, insere "ID" no final da coluna a ser atualizada no BD
            dataHeader = await formatFieldsToTable('par_fornecedor', data.fields)
            if (Object.keys(dataHeader).length > 0) {
                const sqlHeader = `UPDATE fornecedor SET ? WHERE fornecedorID = ${id} `;
                const resultHeader = await executeQuery(sqlHeader, [dataHeader], 'update', 'fornecedor', 'fornecedorID', id, logID)
                if (!resultHeader) { return res.status(500).json('Error'); }
            }
        }

        //* Atualiza dados na unidade do fornecedor (pelo CNPJ)
        updateUnitySupplier(data.fieldsHeader, dataHeader)

        //? Atualiza blocos do modelo 
        await updateDynamicBlocks(
            id,
            data.blocos,
            'fornecedor_resposta',
            'fornecedorID',
            'parFornecedorModeloBlocoID',
            'fornecedorRespostaID',
            logID
        )

        // Observação
        const sqlUpdateObs = `UPDATE fornecedor SET obs = ?, obsConclusao = ? WHERE fornecedorID = ? `
        const resultUpdateObs = await executeQuery(sqlUpdateObs, [data.info?.obs, data?.obsConclusao, id], 'update', 'fornecedor', 'fornecedorID', id, logID)

        if (!resultUpdateObs) { return res.json('Error'); }

        //* Status
        //? É um fornecedor e é um status anterior, seta status pra "Em preenchimento" (30)
        const newStatus = data.status >= 40 ? data.status : (papelID === 1 && data.unidade.quemPreenche === 2) ? 40 : 30

        const sqlUpdateStatus = `UPDATE fornecedor SET status = ? WHERE fornecedorID = ? `
        const resultUpdateStatus = await executeQuery(sqlUpdateStatus, [newStatus, id], 'update', 'fornecedor', 'fornecedorID', id, logID)

        if (newStatus > 40) {
            const sqlStaticlFooter = `
            UPDATE fornecedor SET dataFim = ?, aprovaProfissionalID = ?, dataExpiracao = ?
            WHERE fornecedorID = ?`
            const resultStaticFooter = await executeQuery(sqlStaticlFooter, [
                new Date(),
                resultProfissional[0]?.profissionalID ?? 0,
                calculateExpirationDate(data.unidade.ciclo),
                id
            ], 'update', 'fornecedor', 'fornecedorID', id, logID)


            // Obtem os produtos e insere em uma string separado por virgulas
            const sqlProducts = `
            SELECT p.nome, um.nome AS unidadeMedida
            FROM fornecedor_produto AS fp 
                JOIN produto AS p ON (fp.produtoID = p.produtoID)
                JOIN unidademedida AS um ON (p.unidadeMedidaID = um.unidadeMedidaID)
            WHERE fp.fornecedorID = ?
            ORDER BY p.nome ASC`
            const [resultProducts] = await db.promise().query(sqlProducts, [id])
            const products = resultProducts.map(product => `${product.nome} (${product.unidadeMedida})`).join(', ')

            //? Cria agendamento no calendário com a data de vencimento
            createScheduling(id, 'fornecedor', data.fieldsHeader.nomeFantasia, products, data.fieldsHeader.data, data.unidade.ciclo, unidadeID, logID)
        }

        //? Gera histórico de alteração de status
        const movimentation = await addFormStatusMovimentation(1, id, usuarioID, unidadeID, papelID, newStatus, data?.obsConclusao)
        if (!movimentation) { return res.status(201).json({ message: "Erro ao atualizar status do formulário! " }) }

        res.status(200).json({})
    }

    //? Atualiza resultado (aprovado, aprovado parcial, reprovado)
    async updateFormStatus(req, res) {
        const { id } = req.params
        const { edit, status } = req.body.status
        const { usuarioID, papelID, unidadeID } = req.body.auth

        const logID = await executeLog('Edição do status do formulário do fornecedor', usuarioID, unidadeID, req)

        if (edit) {
            const sqlSelect = `SELECT status FROM fornecedor WHERE fornecedorID = ? `
            const [resultFornecedor] = await db.promise().query(sqlSelect, [id])

            //? É uma fábrica, e formulário já foi concluído pelo fornecedor
            if (status && papelID == 1 && resultFornecedor[0]['status'] >= 40) {
                const sqlUpdateStatus = `UPDATE fornecedor SET status = ? WHERE fornecedorID = ? `
                const resultUpdateStatus = await executeQuery(sqlUpdateStatus, [status, id], 'update', 'fornecedor', 'fornecedorID', id, logID)

                //? Gera histórico de alteração de status
                const movimentation = await addFormStatusMovimentation(1, id, usuarioID, unidadeID, papelID, status, '')
                if (!movimentation) { return res.status(201).json({ message: "Erro ao atualizar status do formulário! " }) }
            }
        }

        res.status(200).json({ message: 'Ok' })
    }

    //? Obtém os grupos de anexo do fornecedor
    async getGruposAnexo(req, res) {
        const { unidadeID } = req.body

        const sql = `
        SELECT g.grupoAnexoID AS id, g.nome, g.descricao
        FROM grupoanexo AS g
            JOIN grupoanexo_parformulario AS gp ON (g.grupoAnexoID = gp.grupoAnexoID)
        WHERE g.unidadeID = ? AND gp.parFormularioID = ? AND g.status = ?`
        const [result] = await db.promise().query(sql, [unidadeID, 1, 1])

        res.status(200).json(result);
    }

    //? Atualiza resultado (aprovado, aprovado parcial, reprovado)
    async changeFormStatus(req, res) {
        const { id } = req.params
        const { status, observacao } = req.body
        const { usuarioID, papelID, unidadeID } = req.body.auth

        const logID = await executeLog('Edição do status do formulário do fornecedor', usuarioID, unidadeID, req)

        //? É uma fábrica, e formulário já foi concluído pelo fornecedor
        if (status && papelID == 1) {
            const sqlUpdateStatus = `UPDATE fornecedor SET status = ?, dataFim = ?, aprovaProfissionalID = ?, dataExpiracao = ? WHERE fornecedorID = ? `
            const resultUpdateStatus = await executeQuery(sqlUpdateStatus, [status, null, null, null, id], 'update', 'fornecedor', 'fornecedorID', id, logID)

            //? Gera histórico de alteração de status
            const movimentation = await addFormStatusMovimentation(1, id, usuarioID, unidadeID, papelID, status, observacao)
            if (!movimentation) { return res.status(201).json({ message: "Erro ao atualizar status do formulário! " }) }
        }

        //? Remove agendamento de vencimento deste formulário (ao concluir criará novamente)
        deleteScheduling('fornecedor', id, unidadeID, logID)

        res.status(200).json({ message: 'Ok' })
    }

    async deleteData(req, res) {
        const { id, usuarioID, unidadeID } = req.params
        const objDelete = {
            table: ['anexo_busca', 'fornecedor_grupoanexo', 'fornecedor_produto', 'fornecedor_resposta', 'fornecedor_sistemaqualidade', 'fornecedor'],
            column: 'fornecedorID'
        }

        const arrPending = [
            {
                table: 'recebimentomp',
                column: ['fornecedorID'],
            }
        ]

        if (!arrPending || arrPending.length === 0) {
            const logID = await executeLog('Exclusão do formulário do fornecedor', usuarioID, unidadeID, req)
            return deleteItem(id, objDelete.table, objDelete.column, logID, res)
        }

        hasPending(id, arrPending)
            .then(async (hasPending) => {
                if (hasPending) {
                    res.status(409).json({ message: "Dado possui pendência." });
                } else {
                    const logID = await executeLog('Exclusão do formulário do fornecedor', usuarioID, unidadeID, req)
                    return deleteItem(id, objDelete.table, objDelete.column, logID, res)
                }
            })
            .catch((err) => {
                console.log(err);
                res.status(500).json(err);
            });
    }

    async getFabricas(req, res) {
        const { cnpj } = req.body;

        const sql = `
        SELECT *
                FROM fabrica_fornecedor AS ff 
            JOIN unidade AS u ON(ff.unidadeID = u.unidadeID) 
        WHERE ff.fornecedorCnpjCpf = "${cnpj}" AND ff.status = 1`
        const [result] = await db.promise().query(sql)

        res.status(200).json(result);
    }

    // Verifica quem preenche o formulario / fabrica ou fornecedor
    async paramsNewFornecedor(req, res) {
        const data = req.body;
        try {
            const getUnidade = `SELECT * FROM unidade WHERE unidadeID = ?`
            const [resultGetUnidade] = await db.promise().query(getUnidade, [data.unidadeID])

            const values = {
                habilitaQuemPreencheFormFornecedor: resultGetUnidade[0]?.habilitaQuemPreencheFormFornecedor == 1 ? true : false,
                obrigatorioProdutoFornecedor: resultGetUnidade[0]?.obrigatorioProdutoFornecedor == 1 ? true : false
            }

            res.status(200).json(values);
        } catch (e) {
            console.log(e);
            res.status(500).json(e);
        }
    }

    async getFornecedorByCnpj(req, res) {
        const { type, unidadeID, cnpj } = req.body;
        // Verifica se está vinculado como um fornecedor
        const sqlFornecedor = `
        SELECT *
        FROM fabrica_fornecedor
        WHERE unidadeID = ? AND fornecedorCnpjCpf = ? AND status = ? AND cpf = ?`
        const [resultFornecedor] = await db.promise().query(sqlFornecedor, [unidadeID, cnpj, 1, (type === 'cpf' ? 1 : 0)])

        // Verifica se já possui formulário preenchido pra minha empresa
        const sqlFormulario = `
        SELECT 
            f.fornecedorID, 
            DATE_FORMAT(f.dataInicio, "%d/%m/%Y") AS dataAvaliacao,
            (
                SELECT GROUP_CONCAT(p.nome SEPARATOR ', ')
                FROM fornecedor_produto AS fp 
                    JOIN produto AS p ON(fp.produtoID = p.produtoID)
                WHERE fp.fornecedorID = f.fornecedorID
                ORDER BY p.nome ASC
            ) AS produtos,
            (
                SELECT GROUP_CONCAT(ga.nome SEPARATOR ', ')
                FROM fornecedor_grupoanexo AS fga
                    JOIN grupoanexo AS ga ON(fga.grupoAnexoID = ga.grupoAnexoID)
                WHERE fga.fornecedorID = f.fornecedorID
                ORDER BY ga.nome ASC
            ) AS gruposAnexo
        FROM fornecedor AS f
            JOIN par_fornecedor_modelo AS pfm ON(f.parFornecedorModeloID = pfm.parFornecedorModeloID)            
        WHERE f.unidadeID = ? AND f.cnpj = ? AND f.cpf = ?
        ORDER BY f.fornecedorID DESC
        LIMIT 1`
        const [resultFormulario] = await db.promise().query(sqlFormulario, [unidadeID, cnpj, (type === 'cpf' ? 1 : 0)])

        // dados da unidade quando já for fornecedor carrega os dados da unidade
        const sqlUnity = `
        SELECT u.*, fc.fornecedorCategoriaID, fc.nome AS categoria, fcr.fornecedorCategoriaRiscoID, fcr.nome AS risco 
        FROM unidade AS u
            LEFT JOIN fornecedorcategoria AS fc ON (u.fornecedorCategoriaID = fc.fornecedorCategoriaID)
            LEFT JOIN fornecedorcategoria_risco AS fcr ON (fcr.fornecedorCategoriaID = fc.fornecedorCategoriaID)
        WHERE u.cnpj = "${cnpj}" AND u.cpf = ?`
        const [resultUnity] = await db.promise().query(sqlUnity, [type === 'cpf' ? 1 : 0])

        // Modelo de formulário (se houver apenas 1, já vem selecionado)
        const sqlModelo = `
        SELECT *
        FROM par_fornecedor_modelo AS pfm
        WHERE pfm.unidadeID = ? AND pfm.status = 1`
        const [resultModelo] = await db.promise().query(sqlModelo, [unidadeID]);

        // Grupos de anexo 
        const sqlGruposAnexo = `
        SELECT ga.grupoAnexoID AS id, ga.nome
        FROM fornecedor_grupoanexo AS fg
            LEFT JOIN grupoanexo AS ga ON(fg.grupoAnexoID = ga.grupoAnexoID)
        WHERE fg.fornecedorID = ? AND ga.status = 1
        ORDER BY ga.nome ASC`;
        const [resultGruposAnexo] = await db.promise().query(sqlGruposAnexo, [resultFormulario[0]?.fornecedorID]);

        // Produtos 
        const sqlProdutos = `
        SELECT p.produtoID AS id, p.nome
        FROM fornecedor_produto AS fp
            LEFT JOIN produto AS p ON(fp.produtoID = p.produtoID)
        WHERE fp.fornecedorID = ? AND p.status = 1
        ORDER BY p.nome ASC`;
        const [resultProdutos] = await db.promise().query(sqlProdutos, [resultFormulario[0]?.fornecedorID]);

        const result = {
            new: resultFormulario.length === 0 ? true : false,

            fornecedorID: resultFormulario[0]?.fornecedorID,
            fields: {
                nomeFantasia: resultUnity[0]?.nomeFantasia,
                razaoSocial: resultUnity[0]?.razaoSocial,
                email: resultUnity[0]?.email,

                telefone: resultUnity[0]?.telefone1 ? resultUnity[0]?.telefone1 : resultUnity[0]?.telefone2 ? resultUnity[0]?.telefone2 : null,
                cep: resultUnity[0]?.cep,
                logradouro: resultUnity[0]?.logradouro,
                numero: resultUnity[0]?.numero,
                complemento: resultUnity[0]?.complemento,
                bairro: resultUnity[0]?.bairro,
                cidade: resultUnity[0]?.cidade,
                estado: resultUnity[0]?.uf,
                pais: resultUnity[0]?.pais,
                ie: resultUnity[0]?.ie,
                principaisClientes: resultUnity[0]?.principaisClientes,
                registroSipeagro: resultUnity[0]?.registroSipeagro,
                categoria: resultUnity[0]?.fornecedorCategoriaID > 0 ? {
                    id: resultUnity[0]?.fornecedorCategoriaID,
                    nome: resultUnity[0]?.categoria
                } : null,
                risco: resultUnity[0]?.fornecedorCategoriaRiscoID > 0 ? {
                    id: resultUnity[0]?.fornecedorCategoriaRiscoID,
                    nome: resultUnity[0]?.risco
                } : null
            },
            modelo: {
                id: resultFormulario[0]?.parFornecedorModeloID ? resultFormulario[0]?.parFornecedorModeloID : resultModelo.length == 1 ? resultModelo[0]?.parFornecedorModeloID : null,
                nome: resultFormulario[0]?.modelo ? resultFormulario[0]?.modelo : resultModelo.length == 1 ? resultModelo[0]?.nome : null
            },
            dataAvaliacao: resultFormulario[0]?.dataAvaliacao,
            produtos: resultProdutos,
            gruposAnexo: resultGruposAnexo,
        }

        return res.status(200).json(result);
    }

    async sendEmailBasedStatus(req, res) {
        const data = req.body
        try {
            // Verifica se foi informado um fornecedorID
            if (!data.fornecedorID) return res.status(400).json({ message: "Dados incorretos" });


            // Dados do profissional logado
            if (data.usuarioLogado) {
                const sqlProfessional = `
                SELECT 
                a.nome,
                    b.formacaoCargo AS cargo
                    FROM profissional AS a 
                    LEFT JOIN profissional_cargo AS b ON (a.profissionalID = b.profissionalID)
                    WHERE a.profissionalID = ?`
                const [resultSqlProfessional] = await db.promise().query(sqlProfessional, [data.usuarioLogado])
            }
            // Dados da fabrica 
            const sqlUnity = `
            SELECT a.*,
            DATE_FORMAT(b.dataInicio, '%d/%m/%Y %H:%i:%s') as dataInicio
            FROM unidade AS a
            LEFT JOIN fornecedor AS b ON (a.unidadeID = b.unidadeID)
            WHERE a.unidadeID = ? AND b.fornecedorID = ?;
            `
            const [resultUnity] = await db.promise().query(sqlUnity, [data.unidadeID, data.fornecedorID])

            const endereco = {
                logradouro: resultUnity[0].logradouro,
                numero: resultUnity[0].numero,
                complemento: resultUnity[0].complemento,
                bairro: resultUnity[0].bairro,
                cidade: resultUnity[0].cidade,
                uf: resultUnity[0].uf,
            }

            const enderecoCompleto = Object.entries(endereco).map(([key, value]) => {
                if (value) {
                    return `${value}, `;
                }
            }).join('').slice(0, -2) + '.';

            // Verifica se CNPJ já tem um usuario cadastrado, se não tiver cadastra
            const userExists = "SELECT * FROM usuario WHERE cnpj = ?"
            const [resultUserExists] = await db.promise().query(userExists, [resultUnity[0].cnpj])

            const dataEmail = {
                // fabrica
                enderecoCompletoFabrica: enderecoCompleto,
                nomeFantasiaFabrica: resultUnity[0].nomeFantasia,
                cnpjFabrica: resultUnity[0].cnpj,

                // profissional que abriu formulario
                nomeProfissional: resultSqlProfessional[0]?.nome,
                cargoProfissional: resultSqlProfessional[0]?.cargo,

                // fornecedor
                cnpjFornecedor: resultUnity[0].cnpj ?? null,
                email: resultUnity[0].email ?? null,
                razaoSocial: resultUnity[0].razaoSocial ?? null,
                nomeFantasia: resultUnity[0].nomeFantasia ?? null,
                senhaFornecedor: data.password ?? null,
                fornecedorID: data.fornecedorID,
                destinatario: data.email ?? resultUnity[0].email, // email do fornecedor
                dataInicio: resultUnity[0].dataInicio,

                // outros
                ifFornecedor: resultUserExists.length == 0 ? false : true,
                stage: 's1', // estagio que o formulario se encontra
                noBaseboard: false, // Se falso mostra o rodapé com os dados da fabrica, senão mostra dados do GEDagro,
                link: `${process.env.BASE_URL}formularios/fornecedor?f=${fornecedorID}`,
            }
            res.status(200).json(dataEmail)


        } catch (error) {
            return res.status(400).json(error);
        }
    }

    async makeFornecedor(req, res) {
        let {
            usuarioID,
            unidadeID,
            papelID,
            profissionalID,
            habilitaQuemPreencheFormFornecedor,
            values,
            fornecedorCategoriaID,
            fornecedorCategoriaRiscoID,
            isCpf
        } = req.body;

        const quemPreenche = habilitaQuemPreencheFormFornecedor ?? 2
        let message = 'Fornecedor criado com sucesso!'

        const logID = await executeLog('Habilitar fornecedor', usuarioID, unidadeID, req)

        //? Senha gerada será os 4 primeiros caracteres do CNPJ
        const password = gerarSenhaCaracteresIniciais(values.cnpj, 4)

        //? Verifica se cnpj/cpf já é um fornecedor apto
        const sqlVerify = `
        SELECT *
        FROM fabrica_fornecedor
        WHERE unidadeID = ? AND fornecedorCnpjCpf = "${values.cnpj}" AND cpf = ?`
        const [resultVerify] = await db.promise().query(sqlVerify, [unidadeID, (isCpf ? 1 : 0)])
        if (resultVerify.length === 0) {
            //? Insere na tabela fabrica_fornecedor 
            const sqlInsert = `INSERT INTO fabrica_fornecedor(unidadeID, fornecedorCnpjCpf, status, cpf) VALUES(?, "${values.cnpj}", ?, ?)`
            await executeQuery(sqlInsert, [unidadeID, 1, (isCpf ? 1 : 0)], 'insert', 'fabrica_fornecedor', 'fabricaFornecedorID', null, logID)
        }

        //? Se fornecedor foi criado com preenchimento da fábrica, já foi definido a categoria e risco e portanto já é possível definir o modelo
        const { modeloID, ciclo } = await getModelByCategoryAndRisk(values.cnpj, values?.risco?.id, unidadeID)

        //? Gera um novo formulário em branco, pro fornecedor preencher depois quando acessar o sistema
        const initialStatus = 10
        const sqlFornecedor = `
        INSERT INTO fornecedor
            (parFornecedorModeloID, cnpj, razaoSocial, nome, email, unidadeID, status, atual, dataInicio, profissionalID, quemPreenche, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado, pais, principaisClientes, registroSipeagro, ie, cpf, prestadorServico) 
        VALUES
            (?, "${values.cnpj}", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        const fornecedorID = await executeQuery(sqlFornecedor, [
            modeloID ?? null,
            values.razaoSocial,
            values.nomeFantasia,
            values.email,
            unidadeID,
            initialStatus,
            1,
            new Date(),
            profissionalID,
            quemPreenche,
            values.telefone,
            values.cep,
            values.logradouro,
            values.numero,
            values.complemento,
            values.bairro,
            values.cidade,
            values.estado,
            values.pais,
            values.principaisClientes,
            values.registroSipeagro,
            values.ie,
            (isCpf ? 1 : 0),
            values?.prestadorServico ? '1' : '0'
        ], 'insert', 'fornecedor', 'fornecedorID', null, logID)

        //? Grava grupos de anexo do fornecedor
        if (values.gruposAnexo && values.gruposAnexo.length > 0) {
            for (const grupo of values.gruposAnexo) {
                if (grupo.id > 0) {
                    const sqlGrupo = `INSERT INTO fornecedor_grupoanexo(fornecedorID, grupoAnexoID) VALUES(?, ?)`
                    await executeQuery(sqlGrupo, [fornecedorID, grupo.id], 'insert', 'fornecedor_grupoanexo', 'fornecedorGrupoAnexoID', null, logID)
                }
            }
        }

        //? Grava produtos do fornecedor
        if (values.produtos && values.produtos.length > 0) {
            for (const produto of values.produtos) {
                if (produto.id > 0) {
                    const sqlProduto = `INSERT INTO fornecedor_produto(fornecedorID, produtoID) VALUES(?, ?)`
                    await executeQuery(sqlProduto, [fornecedorID, produto.id], 'insert', 'fornecedor_produto', 'fornecedorProdutoID', null, logID)
                }
            }
        }

        //? Gera histórico de alteração de status
        const movimentation = await addFormStatusMovimentation(1, fornecedorID, usuarioID, unidadeID, papelID, initialStatus, '')
        if (!movimentation) { return res.status(201).json({ message: "Erro ao atualizar status do formulário!" }) }

        //! Verifica se CNPJ/CPF já tem um usuario cadastrado, se não tiver cadastra
        const userExists = isCpf ? `SELECT * FROM usuario WHERE cpf = "${values.cnpj}"` : `SELECT * FROM usuario WHERE cnpj = "${values.cnpj}"`
        const [resultUserExists] = await db.promise().query(userExists)

        let newUsuarioID = usuarioID
        if (resultUserExists.length == 0) {
            // Salva usuário
            const sqlNewUuser = `
            INSERT INTO usuario(nome, cnpj, cpf, email, senha)
            VALUES(?, ?, ?, ?, ?)`
            newUsuarioID = await executeQuery(sqlNewUuser, [
                values.razaoSocial,
                !isCpf ? values.cnpj : null, // CNPJ
                isCpf ? values.cnpj : null, // CPF
                values.email,
                criptoMd5(password)
            ], 'insert', 'usuario', 'usuarioID', null, logID)
        }

        const unityExists = `SELECT * FROM unidade WHERE cnpj = "${values.cnpj}" AND cpf = ?`
        const [resultUnityExists] = await db.promise().query(unityExists, (isCpf ? 1 : 0))

        let newUnidadeID = unidadeID
        if (resultUnityExists.length == 0) {
            // Salva a unidade
            const sqlInsertUnity = `INSERT INTO unidade (razaoSocial, nomeFantasia, cnpj, email, fornecedorCategoriaID, fornecedorCategoriaRiscoID, dataCadastro, dataAtualizacao, cpf) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            newUnidadeID = await executeQuery(sqlInsertUnity, [
                values.razaoSocial,
                values.nomeFantasia,
                values.cnpj,
                values.email,
                fornecedorCategoriaID ?? null,
                fornecedorCategoriaRiscoID ?? null,
                new Date(),
                new Date(),
                (isCpf ? 1 : 0)
            ], 'insert', 'unidade', 'unidadeID', null, logID)
        }

        const sqlUserUnityExists = `SELECT * FROM usuario_unidade WHERE usuarioID = ? AND unidadeID = ? AND papelID = ?`
        const [resultUserUnityExists] = await db.promise().query(sqlUserUnityExists, [newUsuarioID, newUnidadeID, 2])

        if (resultUserUnityExists.length == 0) {
            // Salva usuario_unidade
            const sqlNewUserUnity = `
            INSERT INTO usuario_unidade(usuarioID, unidadeID, papelID, primeiroAcesso)
            VALUES(?, ?, ?, 1)`
            await executeQuery(sqlNewUserUnity, [
                newUsuarioID,
                newUnidadeID,
                2,
                1
            ], 'insert', 'usuario_unidade', 'usuarioUnidadeID', null, logID)
        }

        // Obtem dados da fabrica
        const sqlUnity = `
        SELECT a.*, DATE_FORMAT(b.dataInicio, '%d/%m/%Y %H:%i:%s') as dataInicio
        FROM unidade AS a
            LEFT JOIN fornecedor AS b ON (a.unidadeID = b.unidadeID)
        WHERE a.unidadeID = ? AND b.fornecedorID = ?`
        const [resultUnity] = await db.promise().query(sqlUnity, [unidadeID, fornecedorID])

        const endereco = {
            logradouro: resultUnity[0].logradouro,
            numero: resultUnity[0].numero,
            complemento: resultUnity[0].complemento,
            bairro: resultUnity[0].bairro,
            cidade: resultUnity[0].cidade,
            uf: resultUnity[0].uf,
        }

        const enderecoCompleto = Object.entries(endereco).map(([key, value]) => {
            if (value) {
                return `${value}, `;
            }
        }).join('').slice(0, -2) + '.'; // Remove a última vírgula e adiciona um ponto final

        // Dados do profissional
        const sqlProfessional = `
        SELECT 
            a.nome,
            b.formacaoCargo AS cargo
        FROM profissional AS a 
            LEFT JOIN profissional_cargo AS b ON (a.profissionalID = b.profissionalID)
        WHERE a.profissionalID = ?`
        const [resultSqlProfessional] = await db.promise().query(sqlProfessional, [usuarioID])

        //! Envia email para fornecedor
        if (quemPreenche == 2 && values.email) {
            const dataEmail = {
                // fabrica
                enderecoCompletoFabrica: enderecoCompleto,
                nomeFantasiaFabrica: resultUnity[0].nomeFantasia,
                cnpjFabrica: resultUnity[0].cnpj,

                // profissional que abriu formulario
                nomeProfissional: resultSqlProfessional[0]?.nome,
                cargoProfissional: resultSqlProfessional[0]?.cargo,

                // fornecedor
                cnpjFornecedor: values.cnpj,
                email: values.email,
                razaoSocial: values.razaoSocial,
                nomeFantasia: values.nomeFantasia,
                senhaFornecedor: password,
                fornecedorID: fornecedorID,
                destinatario: values.email, // email do fornecedor
                dataInicio: resultUnity[0].dataInicio,

                // outros
                ifFornecedor: resultUserExists.length == 0 ? false : true,
                stage: 's1', // estagio que o formulario se encontra
                noBaseboard: false, // Se falso mostra o rodapé com os dados da fabrica, senão mostra dados do GEDagro,
                link: `${process.env.BASE_URL}fornecedor?f=${fornecedorID}`,
            }
            sendMail(dataEmail, logID)
            message = 'E-mail enviado com sucesso!'
        }

        const result = {
            status: true,
            fornecedorID: fornecedorID,
            razaoSocial: values.razaoSocial,
            cnpj: values.cnpj,
            email: values.email,
            link: `${process.env.BASE_URL}formularios/fornecedor?f=${fornecedorID}`
        }

        res.status(200).json({ message: message, result })
    }

    async fornecedorStatus(req, res) {
        const { unidadeID, usuarioID, cnpj, status } = req.body;

        const logID = await executeLog('Edição do status do formulário do fornecedor', usuarioID, unidadeID, req)

        // Verifica se já possui registro
        const sqlVerify = `
            SELECT *
                FROM fabrica_fornecedor
        WHERE unidadeID = ? AND fornecedorCnpjCpf = ? `
        const [resultVerify] = await db.promise().query(sqlVerify, [unidadeID, cnpj])

        if (resultVerify.length === 0) {
            // insere registro 
            const sqlInsert = `
            INSERT INTO fabrica_fornecedor(unidadeID, fornecedorCnpjCpf, status)
            VALUES(?, ?, ?)`
            // const [resultInsert] = await db.promise().query(sqlInsert, [unidadeID, cnpj, status])
            const resultInsert = await executeQuery(sqlInsertUsuarioUnity, [unidadeID, cnpj, status], 'insert', 'fabrica_fornecedor', 'fabricaFornecedorID', null, logID)
        } else {
            // atualiza o status 
            const sqlUpdate = `
            UPDATE fabrica_fornecedor
            SET status = ?
                WHERE unidadeID = ? AND fornecedorCnpjCpf = ? `
            // const [resultUpdate] = await db.promise().query(sqlUpdate, [status, unidadeID, cnpj])
            const resultUpdate = await executeQuery(sqlUpdate, [status, unidadeID, cnpj], 'update', 'fabrica_fornecedor', 'fabricaFornecedorID', unidadeID, logID)
        }

        // Verifica se já possui formulário preenchido pra minha empresa
        const sqlFormulario = `
        SELECT *
            FROM fornecedor
        WHERE unidadeID = ? AND cnpj = ? `
        const [resultFormulario] = await db.promise().query(sqlFormulario, [unidadeID, cnpj])

        const result = {
            isFornecedor: status === 1 ? true : false,
            hasFormulario: resultFormulario.length > 0 ? true : false,
        }

        res.status(200).json(result);
    }

    async conclusionAndSendForm(req, res) {
        const { id } = req.params;
        const { usuarioID, unidadeID, papelID } = req.body;

        //? Atualiza pro status de conclusão do formulário (40)
        const newStatus = 40
        const sqlUpdate = `UPDATE fornecedor SET status = ?, dataFim = ? WHERE fornecedorID = ? `
        const [resultUpdate] = await db.promise().query(sqlUpdate, [newStatus, new Date(), id])
        if (resultUpdate.length === 0) { return res.status(201).json({ message: 'Erro ao atualizar status do formulário! ' }) }

        //? Gera histórico de alteração de status
        const movimentation = await addFormStatusMovimentation(1, id, usuarioID, unidadeID, papelID, newStatus, '')
        if (!movimentation) { return res.status(201).json({ message: "Erro ao atualizar status do formulário! " }) }

        //? Envia e-mail pra fábrica
        // const sentMail = sendMailFornecedorConclusion(id)
        // if (!sentMail) { return res.status(202).json({ message: 'Erro ao enviar e-mail para a fábrica!' }) }

        res.status(200).json({ message: 'Ok' })
    }

    //? Função que pega as alternativas do item
    async getItemScore(req, res) {
        const { data } = req.body;

        const sqlScore = `        
        SELECT a.parFornecedorBlocoItemID, b.*,

                (SELECT c.pontuacao
            FROM par_fornecedor_bloco_item_pontuacao AS c 
            WHERE c.parFornecedorBlocoItemID = a.parFornecedorBlocoItemID AND c.alternativaItemID = b.alternativaItemID) AS score

        FROM par_fornecedor_bloco_item AS a
            JOIN alternativa_item AS b ON(a.alternativaID = b.alternativaID)
        WHERE a.parFornecedorBlocoItemID = ${data.parFornecedorBlocoItemID} `
        const [resultScore] = await db.promise().query(sqlScore)

        const result = {
            alternativaID: data.alternativaID,
            pontuacao: data.pontuacao,
            parFornecedorBlocoItemID: data.parFornecedorBlocoItemID,
            alternatives: resultScore,
        }
        res.status(200).json(result);
    }

    //? Função que grava o score do item do fornecedor 
    async saveItemScore(req, res) {
        const { data } = req.body;

        // Atualizar pontuação na tabela par_fornecedor_bloco_item
        const sqlUpdate = `UPDATE par_fornecedor_bloco_item SET pontuacao = ? WHERE parFornecedorBlocoItemID = ? `;
        const [resultUpdate] = await db.promise().query(sqlUpdate, [data.pontuacao, data.parFornecedorBlocoItemID]);

        const promises = data.alternatives.map(async (item) => {
            // Verifica se já existe um registro para o item
            const sqlVerify = `SELECT * FROM par_fornecedor_bloco_item_pontuacao WHERE parFornecedorBlocoItemID = ? AND alternativaItemID = ? `;
            const [resultVerify] = await db.promise().query(sqlVerify, [data.parFornecedorBlocoItemID, item.alternativaItemID]);

            if (data.pontuacao === 1) { // Habilitou a pontuação
                if (resultVerify.length > 0) {                // Atualiza o registro
                    const sqlUpdate = `UPDATE par_fornecedor_bloco_item_pontuacao SET pontuacao = ? WHERE parFornecedorBlocoItemID = ? AND alternativaItemID = ? `;
                    const [resultUpdate] = await db.promise().query(sqlUpdate, [item.score > 0 ? item.score : 0, data.parFornecedorBlocoItemID, item.alternativaItemID]);
                } else {
                    // Insere o registro
                    const sqlInsert = `INSERT INTO par_fornecedor_bloco_item_pontuacao(parFornecedorBlocoItemID, alternativaID, alternativaItemID, pontuacao) VALUES(?, ?, ?, ?)`;
                    const [result] = await db.promise().query(sqlInsert, [data.parFornecedorBlocoItemID, data.alternativaID, item.alternativaItemID, item.score > 0 ? item.score : 0]);
                }
            } else if (resultVerify.length > 0) { // Desabilitou e existe pontuação, deleta o registro
                const sqlDelete = `DELETE FROM par_fornecedor_bloco_item_pontuacao WHERE parFornecedorBlocoItemID = ? AND alternativaItemID = ? `;
                const [resultDelete] = await db.promise().query(sqlDelete, [data.parFornecedorBlocoItemID, item.alternativaItemID]);
            }
        });
        res.status(200).json('ok');
    }

    //! ENVIAR PRA UM ARQUIVO PADRAO!!!
    //? Obtém o histórico de movimentações do formulário
    async getMovementHistory(req, res) {
        const { id } = req.params;
        const { parFormularioID, papelID } = req.body;

        if (id && parFormularioID) {
            let sql = `
            SELECT 
                u.nome AS usuario, 
                un.nomeFantasia AS unidade, 
                m.papelID, 
                DATE_FORMAT(m.dataHora, "%d/%m/%Y") AS data, 
                DATE_FORMAT(m.dataHora, "%H:%i") AS hora, 
                m.statusAnterior, 
                m.statusAtual, 
                m.observacao
            FROM movimentacaoformulario AS m
                LEFT JOIN usuario AS u ON(m.usuarioID = u.usuarioID)
                LEFT JOIN unidade AS un ON(m.unidadeID = un.unidadeID)
            WHERE m.parFormularioID = ? AND m.id = ? `
            if (papelID === 2) sql += ` AND m.papelID = 2 ` //? Fornecedor não vê as movimentações da fábrica
            sql += `
            ORDER BY m.movimentacaoFormularioID DESC`
            const [result] = await db.promise().query(sql, [parFormularioID, id])
            return res.status(200).json(result)
        }

        res.status(201).json({ message: 'Nenhum dado encontrado!' })
    }

    async verifyFormPending(req, res) {
        const { id } = req.params;
        const { parFormularioID } = req.body;

        //? Fornecedor
        const sql = `SELECT * FROM recebimentomp WHERE fornecedorID = ? `
        const [result] = await db.promise().query(sql, [id])

        const pending = result.length === 0 ? false : true
        return res.status(200).json(pending)
    }
}
//* Functions

const updateUnitySupplier = async (fixedValues, dynamicValues) => {
    // Atualiza somente dados com conteúdo
    const sql = `
    UPDATE unidade SET 
        cnpj = "${fixedValues.cnpj}"
        ${fixedValues.nomeFantasia ? `, nomeFantasia = "${fixedValues.nomeFantasia}"` : ''}
        ${fixedValues.razaoSocial ? `, razaoSocial = "${fixedValues.razaoSocial}"` : ''}
        ${dynamicValues?.ie ? `, ie = "${dynamicValues?.ie}"` : ''}
        ${dynamicValues?.principaisClientes ? `, principaisClientes = "${dynamicValues?.principaisClientes}"` : ''}
        ${dynamicValues?.email ? `, email = "${dynamicValues?.email}"` : ''}
        ${dynamicValues?.telefone ? `, telefone1 = "${dynamicValues?.telefone}"` : ''}
        ${dynamicValues?.cep ? `, cep = "${dynamicValues?.cep}"` : ''}
        ${dynamicValues?.logradouro ? `, logradouro = "${dynamicValues?.logradouro}"` : ''}
        ${dynamicValues?.numero ? `, numero = "${dynamicValues?.numero}"` : ''}
        ${dynamicValues?.complemento ? `, complemento = "${dynamicValues?.complemento}"` : ''}
        ${dynamicValues?.bairro ? `, bairro = "${dynamicValues?.bairro}"` : ''}
        ${dynamicValues?.cidade ? `, cidade = "${dynamicValues?.cidade}"` : ''}
        ${dynamicValues?.estado ? `, uf = "${dynamicValues?.estado}"` : ''}
        ${dynamicValues?.pais ? `, pais = "${dynamicValues?.pais}"` : ''}
        ${dynamicValues?.registroSipeagro ? `, registroSipeagro = "${dynamicValues?.registroSipeagro}"` : ''}        
    WHERE cnpj = "${fixedValues.cnpj}"`
    await db.promise().query(sql)
}

//? Se fornecedor foi criado com preenchimento da fábrica, já foi definido a categoria e risco e portanto já é possível definir o modelo
const getModelByCategoryAndRisk = async (cnpj, risk, unityID) => {

    //* Verifica se já existe unidade com este CNPJ com categoria e risco definidos
    const sqlUnidade = `
    SELECT fornecedorCategoriaRiscoID
    FROM unidade
    WHERE cnpj = "${cnpj}"`
    const [resultUnidade] = await db.promise().query(sqlUnidade)
    if (resultUnidade.length > 0 && resultUnidade[0]['fornecedorCategoriaRiscoID'] > 0) {
        //? Copia o risco da unidade
        risk = resultUnidade[0]['fornecedorCategoriaRiscoID']
    }

    //* Verifica qual o modelo para esta categoria e risco
    if (!risk) return { modeloID: null, ciclo: null }
    const sql = `
    SELECT frm.parFornecedorModeloID, pfm.ciclo
    FROM fornecedorcategoria_risco AS fr
        JOIN fornecedorcategoria_risco_modelo AS frm ON (fr.fornecedorCategoriaRiscoID = frm.fornecedorCategoriaRiscoID)
        JOIN par_fornecedor_modelo AS pfm ON (frm.parFornecedorModeloID = pfm.parFornecedorModeloID)
    WHERE fr.fornecedorCategoriaRiscoID = ${risk} AND frm.unidadeID = ${unityID}`
    const [result] = await db.promise().query(sql)

    if (!result) return {
        modeloID: null,
        ciclo: null
    }

    const data = {
        modeloID: result[0]['parFornecedorModeloID'],
        ciclo: result[0]['ciclo']
    }

    return result.length > 0 && result[0]['parFornecedorModeloID'] > 0 ? data : { modeloID: null, ciclo: null }
}

const getSqlBloco = () => {
    const sql = `
    SELECT pfbi.*, i.*, a.nome AS alternativa,

        (SELECT fr.respostaID
        FROM fornecedor_resposta AS fr 
        WHERE fr.fornecedorID = ? AND fr.parFornecedorModeloBlocoID = pfbi.parFornecedorModeloBlocoID AND fr.itemID = pfbi.itemID) AS respostaID,

        (SELECT fr.resposta
        FROM fornecedor_resposta AS fr 
        WHERE fr.fornecedorID = ? AND fr.parFornecedorModeloBlocoID = pfbi.parFornecedorModeloBlocoID AND fr.itemID = pfbi.itemID) AS resposta,

        (SELECT fr.obs
        FROM fornecedor_resposta AS fr 
        WHERE fr.fornecedorID = ? AND fr.parFornecedorModeloBlocoID = pfbi.parFornecedorModeloBlocoID AND fr.itemID = pfbi.itemID) AS observacao

    FROM par_fornecedor_modelo_bloco_item AS pfbi 
        LEFT JOIN item AS i ON(pfbi.itemID = i.itemID)
        LEFT JOIN alternativa AS a ON(i.alternativaID = a.alternativaID)
    WHERE pfbi.parFornecedorModeloBlocoID = ? AND pfbi.status = 1
    ORDER BY pfbi.ordem ASC`
    return sql
}

const getAlternativasSql = () => {
    const sql = `
    SELECT ai.alternativaItemID AS id, ai.nome, io.anexo, io.bloqueiaFormulario, io.observacao
    FROM par_fornecedor_modelo_bloco_item AS pfbi 
    	JOIN item AS i ON (pfbi.itemID = i.itemID)
        JOIN alternativa AS a ON(i.alternativaID = a.alternativaID)
        JOIN alternativa_item AS ai ON(a.alternativaID = ai.alternativaID)

        LEFT JOIN item_opcao AS io ON (io.itemID = i.itemID AND io.alternativaItemID = ai.alternativaItemID)
    WHERE pfbi.parFornecedorModeloBlocoItemID = ? AND pfbi.status = 1`
    return sql
}

const getSqlOtherInfos = () => {
    const sql = `
    SELECT obs, status
    FROM fornecedor
    WHERE fornecedorID = ? `
    return sql
}

const sendMailFornecedorConclusion = async (fornecedorID) => {
    const sql = `
    SELECT ufa.razaoSocial AS fabrica, ufa.email AS emailFabrica, ufo.razaoSocial AS fornecedor, ufo.cnpj AS cnpjFornecedor
    FROM fornecedor AS f 
        JOIN unidade AS ufa ON(f.unidadeID = ufa.unidadeID)
        JOIN unidade AS ufo ON(f.cnpj = ufo.cnpj)
    WHERE f.fornecedorID = ? `
    const [result] = await db.promise().query(sql, [fornecedorID])

    if (result.length > 0 && result[0]['emailFabrica']) {
        const destinatario = result[0]['emailFabrica']
        let assunto = 'Fornecedor enviou formulário'
        const data = {
            fabrica: {
                razaoSocial: result[0]['fabrica']
            },
            fornecedor: {
                fornecedorID: fornecedorID,
                razaoSocial: result[0]['fornecedor'],
                cnpj: result[0]['cnpjFornecedor']
            }
        }

        const html = await conclusionFormFornecedor(data);
        await sendMailConfig(destinatario, assunto, html)

        return true
    }

    return false; // fornecedor não encontrado
}

// varrer data.header verificando se é um objeto ou nao, se for objeto inserir o id em dataHeader, senao, inserir o valor em dataHeader
const getDataOfAllTypes = (dataFromFrontend) => {
    let dataHeader = {}
    for (const key in dataFromFrontend) {
        if (typeof dataFromFrontend[key] === 'object') {
            dataHeader[`${key} ID`] = dataFromFrontend[key].id
        } else if (dataFromFrontend[key]) {
            dataHeader[key] = dataFromFrontend[key]
        }
    }

    return dataHeader;
}

const sendMail = async (data, logID) => {
    const htmlFormat = data.ifFornecedor ? instructionsExistFornecedor : instructionsNewFornecedor
    const assuntoFormat = data.ifFornecedor ? `GEDagro - Qualificação de Fornecedor - ${data.fornecedorID}` : `Bem-vindo ao GEDagro`


    const html = await htmlFormat(data)
    let assunto = `${assuntoFormat} - ${data.nomeFantasiaFabrica}`
    await sendMailConfig(data.email, assunto, html, logID, data)
}

const createSignedDocumentAndSave = async (pathAutentique, pathDestination) => {
    return res.status(200).json('pathAutentique, pathDestination', pathAutentique, pathDestination)
}

module.exports = FornecedorController;