const { Router } = require('express');
const router = Router();
const route = '/formularios/fornecedor';

const FornecedorController = require('../../../controllers/formularios/fornecedor/fornecedorController');
const fornecedorController = new FornecedorController();

// const { configureMulterMiddleware } = require('../../../config/uploads');
// const { getDocumentSignature, signedReport } = require('../../../defaults/functions');
// const fs = require('fs');
// const path = require('path');
// const FormData = require('form-data');
// const { PDFDocument } = require('pdf-lib');
// const axios = require('axios');

// Padrões
router.post(`${route}/getList`, fornecedorController.getList);
router.post(`${route}/getData/:id`, fornecedorController.getData);
router.post(`${route}/updateData/:id`, fornecedorController.updateData);
router.delete(`${route}/delete/:id/:usuarioID/:unidadeID`, fornecedorController.deleteData);

// Específicos
router.post(`${route}/getFabricas`, fornecedorController.getFabricas);
router.post(`${route}/cnpj`, fornecedorController.getFornecedorByCnpj);
router.post(`${route}/mapaSipeAgro`, fornecedorController.getMapaSipeAgro);

// Verifica quem preenche o formulario do fornecedor
router.post(`${route}/paramsNewFornecedor`, fornecedorController.paramsNewFornecedor);

router.post(`${route}/makeFornecedor`, fornecedorController.makeFornecedor);
router.post(`${route}/fornecedorStatus`, fornecedorController.fornecedorStatus);
// router.post(`${route}/sendMail`, fornecedorController.sendMail);
router.post(`${route}/getItemScore`, fornecedorController.getItemScore);
router.post(`${route}/saveItemScore`, fornecedorController.saveItemScore);
router.post(`${route}/getModels`, fornecedorController.getModels);
router.post(`${route}/getProducts`, fornecedorController.getProducts);
router.post(`${route}/getGruposAnexo`, fornecedorController.getGruposAnexo);

router.post(`${route}/conclusionAndSendForm/:id`, fornecedorController.conclusionAndSendForm);
router.post(`${route}/updateFormStatus/:id`, fornecedorController.updateFormStatus);
router.post(`${route}/getMovementHistory/:id`, fornecedorController.getMovementHistory);
router.post(`${route}/verifyFormPending/:id`, fornecedorController.verifyFormPending);
router.post(`${route}/changeFormStatus/:id`, fornecedorController.changeFormStatus);
router.post(`${route}/getGruposAnexo`, fornecedorController.getGruposAnexo);
router.post(`${route}/sendNotification`, fornecedorController.sendNotification);
router.post(`${route}/getFornecedoresAprovados`, fornecedorController.getFornecedoresAprovados);
router.post(`${route}/getFornecedores`, fornecedorController.getFornecedores);
router.post(`${route}/getFornecedoresPrestadorServico`, fornecedorController.getFornecedoresPrestadorServico);
router.get(`${route}/verifyIfHasModel/:id`, fornecedorController.verifyIfHasModel);

//Envia email baseado no status do fornecedor
router.post(`${route}/sendEmailBasedStatus`, fornecedorController.sendEmailBasedStatus);

// // Anexos
// router.delete(`${route}/deleteAnexo/:id/:anexoID/:unidadeID/:usuarioID/:folder`, fornecedorController.deleteAnexo);
// //? MULTER: Upload de arquivo
// router.post(`${route}/saveAnexo/:id/:folder/:usuarioID/:unidadeID`, (req, res, next) => {
//     const folder = req.params.folder ?? '/' //? Pasta destino do arquivo (grupo-anexo/produto/item/...)
//     const pathDestination = `uploads/${req.params.unidadeID}/fornecedor/${folder}/`
//     req.pathDestination = pathDestination
//     configureMulterMiddleware(req, res, next, req.params.usuarioID, req.params.unidadeID, pathDestination)
// }, fornecedorController.saveAnexo);

// //? Assinatura relatório (cria documento)
// router.post(`${route}/createDocumentAutentique/:id/:usuarioID/:unidadeID`, fornecedorController.createDocumentAutentique);

// //? MULTER: Salva relatório assinado vindo do autentique
// router.post(`${route}/saveSignedDocument`, fornecedorController.saveSignedDocument);

module.exports = router;