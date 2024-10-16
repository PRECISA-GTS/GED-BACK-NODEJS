const db = require('../../config/db');
require('dotenv/config')
const { getMenu, criptoMd5 } = require('../../config/defaultConfig');
const jwt = require('jsonwebtoken');
const { executeLog, executeQuery } = require('../../config/executeQuery');
const jwtConfig = {
    secret: process.env.NEXT_PUBLIC_JWT_SECRET,
    expirationTime: process.env.NEXT_PUBLIC_JWT_EXPIRATION,
    refreshTokenSecret: process.env.NEXT_PUBLIC_JWT_REFRESH_TOKEN_SECRET
}

class AuthController {
    async login(req, res) {
        const { cpf, password, selectedUnit } = req.body;

        let error = {
            email: ['Algo está errado!']
        }

        const sql = `
        SELECT 
            u.*, 
            un.unidadeID, 
            un.nomeFantasia, 
            p.papelID, 
            p.nome as papel,
            
            COALESCE(((SELECT COALESCE(pi.profissionalID, 0)
                FROM profissional AS pi 
                WHERE pi.usuarioID = u.usuarioID AND pi.unidadeID = uu.unidadeID
            )), 1) AS profissionalID,
            
            (SELECT pi.imagem
            FROM profissional AS pi 
            WHERE pi.usuarioID = u.usuarioID AND pi.unidadeID = uu.unidadeID
            ) AS imagem 
        FROM usuario AS u 
            LEFT JOIN usuario_unidade AS uu ON (u.usuarioID = uu.usuarioID)
            LEFT JOIN unidade AS un ON (uu.unidadeID = un.unidadeID)
            LEFT JOIN papel AS p ON (uu.papelID = p.papelID)
        WHERE u.cpf = ? AND u.senha = ? AND uu.status = 1 AND uu.papelID = 1
        ORDER BY un.nomeFantasia ASC`;

        try {
            const [result] = await db.promise().query(sql, [cpf, criptoMd5(password)]);

            if (result.length === 0) {
                return res.status(401).json({ message: 'CPF ou senha incorretos!' });
            }

            const accessToken = jwt.sign({ id: result[0]['usuarioID'] }, jwtConfig.secret, { expiresIn: jwtConfig.expirationTime })

            //? Obtém os departamentos ativos do profissional 
            const sqlDepartamentos = `
            SELECT s.departamentoID AS id, s.nome
            FROM profissional_departamento AS ps 
                LEFT JOIN departamento AS s ON (ps.departamentoID = s.departamentoID)                        
            WHERE ps.profissionalID = ? AND ps.status = 1`

            // +1 UNIDADE, SELECIONA UNIDADE ANTES DE LOGAR
            if (result.length > 1) {
                if (selectedUnit && selectedUnit.unidadeID > 0) {
                    const profissionalID = result.find(r => r.unidadeID === selectedUnit.unidadeID).profissionalID
                    if (!profissionalID) {
                        return res.status(401).json({ message: 'CPF ou senha incorretos!' });
                    }
                    const [departamentos] = await db.promise().query(sqlDepartamentos, [profissionalID]);
                    result[0].departamentos = departamentos
                }

                const response = {
                    accessToken,
                    userData: {
                        ...result[0],
                        senha: undefined,
                        imagem: result[0].imagem ? `${process.env.BASE_URL_API}${result[0].imagem}` : null,
                    },
                    unidades: result.map(unidade => ({ unidadeID: unidade.unidadeID, nomeFantasia: unidade.nomeFantasia, papelID: unidade.papelID, papel: unidade.papel }))
                }

                return res.status(202).json(response);
            }

            // 1 UNIDADE, LOGA DIRETO
            else if (result.length === 1) {
                const [departamentos] = await db.promise().query(sqlDepartamentos, [result[0].profissionalID]);
                result[0].departamentos = departamentos ?? []

                const response = {
                    accessToken,
                    userData: {
                        ...result[0],
                        imagem: result[0].imagem ? `${process.env.BASE_URL_API}${result[0].imagem}` : null,
                        senha: undefined
                    },
                    unidades: [{ unidadeID: result[0].unidadeID, nomeFantasia: result[0].nomeFantasia, papelID: result[0].papelID, papel: result[0].papel }]
                }
                const logID = await executeLog('Login', response.userData.usuarioID, result[0].unidadeID, req)
                const sqlLatestAcess = 'UPDATE usuario SET ultimoAcesso = NOW() WHERE usuarioID = ?';

                const responseFormat = {
                    userData: response.userData,
                    unidades: response.unidades
                }

                const loginObj = {
                    responseFormat
                }
                await executeQuery(sqlLatestAcess, [response.userData.usuarioID], 'login', 'usuario', 'usuarioID', null, logID, null, loginObj)

                return res.status(200).json(response);
            }

            // ERRO AO FAZER LOGIN
            else {
                error = {
                    email: ['CPF ou senha inválidos!']
                }

                return res.status(400).json(error);
            }
        } catch (err) {
            console.log(err)
            return res.status(500).json({ message: err.message });
        }
    }
}

module.exports = AuthController;
