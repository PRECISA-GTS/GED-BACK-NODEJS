const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { mkdirSync } = require('fs');
const { removeSpecialCharts } = require('../defaultConfig');
const sharp = require('sharp');

const defineFileName = (originalName, usuarioID, nameWithTime) => {
    //? yyyymmdd-hms
    const dateTimeNow = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').split('.')[0].slice(0, 15);
    const fileName = nameWithTime ? `${dateTimeNow}-${usuarioID}-${removeSpecialCharts(originalName)}` : `${usuarioID}-${removeSpecialCharts(originalName)}`;
    return fileName;
};

const multerFiles = async (req, res, next, usuarioID, pathDestination, maxOriginalSize, maxSize, allowedUnityExtensions, imageMaxDimensionToResize, nameWithTime) => {
    //* Verifica se o diretório de destino existe, senão cria recursivamente
    try {
        mkdirSync(pathDestination, { recursive: true }); // Cria diretórios recursivamente
    } catch (error) {
        console.error('Erro ao criar diretório de destino:', error);
        return res.status(500).send({ message: 'Erro ao criar diretório de destino' });
    }

    const customStorage = multer.diskStorage({
        destination: function (req, file, cb) {
            if (file.mimetype.startsWith('image')) {
                // Se for uma imagem, coloque na pasta "temp"
                cb(null, path.join('uploads/temp'));
            } else {
                // Se não for uma imagem, coloque na pasta de destino principal
                cb(null, pathDestination);
            }
        },
        filename: function (req, file, cb) {
            cb(null, defineFileName(file.originalname, usuarioID, nameWithTime));
        }
    });

    const upload = multer({
        storage: customStorage,
        limits: {
            fileSize: maxOriginalSize * 1024 * 1024
        },
        fileFilter: async function (req, file, cb) {
            //? Valida a extensão do arquivo
            if (!allowedUnityExtensions.length) {
                return cb(new multer.MulterError('EMPTY_EXTENSION', 'Não há nenhuma extensão de arquivo configurada para esta unidade!'));
            } else {
                const isValidExtension = allowedUnityExtensions.some(ext => file.mimetype.startsWith(ext.mimetype));
                if (!isValidExtension) {
                    return cb(new multer.MulterError('EXTENSION', 'Extensão não permitida (apenas: ' + allowedUnityExtensions.map(ext => ext.nome).join(', ') + ')'));
                } else {
                    cb(null, true);
                }
            }
        }
    });

    // Use um middleware de tratamento de erros do Multer
    upload.array('files[]')(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            //! Valida tamanho do arquivo (antes de redimensionar)
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).send({ message: `O arquivo enviado é muito grande. Tamanho máximo permitido: ${maxOriginalSize}MB` });
            }
            //? Valida extensões permitidas
            else if (err.code === 'EMPTY_EXTENSION') {
                return res.status(400).send({ message: err.field });
            }
            //? Valida extensões permitidas
            else if (err.code === 'EXTENSION') {
                return res.status(400).send({ message: err.field });
            }
        } else {

            // Processa todos os tipos de arquivos
            const filePromises = req.files.map(file => {
                const fileName = defineFileName(file.originalname, usuarioID, nameWithTime);
                if (file.mimetype.startsWith('image')) {
                    return new Promise((resolve, reject) => {
                        sharp(file.path)
                            .resize({
                                width: imageMaxDimensionToResize
                            })
                            .toFile(path.join(pathDestination, fileName), async (err, info) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    file.filename = fileName;
                                    file.path = path.join(pathDestination, fileName);
                                    file.size = info.size;
                                    file.binary = fs.readFileSync(file.path);
                                    if (info.size > maxSize * 1024 * 1024) {
                                        fs.unlinkSync(path.join(pathDestination, fileName));
                                        return res.status(400).send({ message: `O arquivo enviado é muito grande. Tamanho máximo permitido: ${maxSize} MB` });
                                    }
                                    resolve();
                                }
                            });
                    });
                } else {
                    // Se não for uma imagem, apenas obtenha o binário
                    file.path = path.join(pathDestination, fileName);
                    file.binary = fs.readFileSync(file.path);
                    return Promise.resolve();
                }
            });

            try {
                await Promise.all(filePromises); //? Aguarda todas as operações de redimensionamento serem concluídas

                //? Excluir tudo que estiver na pasta temp/* (imagens originais)
                try {
                    const tempPath = path.join('uploads/temp');
                    const tempFiles = await fs.promises.readdir(tempPath);
                    for (const file of tempFiles) {
                        const filePath = path.join(tempPath, file);
                        await fs.promises.unlink(filePath); // Use fs.promises.unlink para excluir cada arquivo
                    }
                } catch (error) {
                    console.error('Erro ao excluir arquivos da pasta temp:', error);
                }

                //* Tudo certo, segue o fluxo =>
                next();
            } catch (error) {
                console.error('Erro ao redimensionar imagens:', error);
                return res.status(400).send({ message: 'Erro ao redimensionar imagens!' });
            }
        }
    });
};

module.exports = multerFiles;
