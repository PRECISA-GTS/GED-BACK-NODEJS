const db = require('../db')
const multerFiles = require('./multerFiles')

// const getExtensions = async (usuarioID, unidadeID) => {
//     const sql = `SELECT * FROM extensao`
//     const [result] = await db.promise().query(sql)
//     return result
// }
const getExtensions = () => {
    const result = [{ "extensaoID": 1, "nome": "pdf", "mimetype": "application/pdf" }, { "extensaoID": 2, "nome": "doc", "mimetype": "application/msword" }, { "extensaoID": 3, "nome": "docx", "mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, { "extensaoID": 4, "nome": "xls", "mimetype": "application/vnd.ms-excel" }, { "extensaoID": 5, "nome": "xlsx", "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, { "extensaoID": 6, "nome": "jpg", "mimetype": "image/jpg" }, { "extensaoID": 7, "nome": "jpeg", "mimetype": "image/jpeg" }, { "extensaoID": 8, "nome": "png", "mimetype": "image/png" }, { "extensaoID": 9, "nome": "webp", "mimetype": "image/webp" }, { "extensaoID": 10, "nome": "txt", "mimetype": "text/plain" }, { "extensaoID": 11, "nome": "csv", "mimetype": "text/csv" }, { "extensaoID": 12, "nome": "zip", "mimetype": "application/x-zip-compressed" }, { "extensaoID": 13, "nome": "rar", "mimetype": "application/x-rar-compressed" }, { "extensaoID": 14, "nome": "ppt", "mimetype": "application/vnd.ms-powerpoint" }, { "extensaoID": 15, "nome": "pptx", "mimetype": "application/vnd.openxmlformats-officedocument.presentationml.presentation" }]

    return result
}

// const getFileMaxSize = async (unidadeID) => {
//     const sql = `
//     SELECT anexosTamanhoMaximo
//     FROM unidade 
//     WHERE unidadeID = ?`
//     const [result] = await db.promise().query(sql, [unidadeID])
//     return result[0].anexosTamanhoMaximo ?? 5
// }

const configureMulterMiddleware = async (req, res, next, usuarioID, unidadeID, pathDestination, nameWithTime = true) => {
    //? Parâmetros pro multer
    // const maxSize = await getFileMaxSize(unidadeID)
    const maxSize = 10
    // const allowedUnityExtensions = await getExtensions(usuarioID, unidadeID)
    const allowedUnityExtensions = getExtensions()
    const maxOriginalSize = 300 //? Imagem até 100MB (antes de redimensionar)
    const imageMaxDimensionToResize = 1024

    multerFiles(req, res, next, usuarioID, pathDestination, maxOriginalSize, maxSize, allowedUnityExtensions, imageMaxDimensionToResize, nameWithTime)
}

module.exports = { configureMulterMiddleware }