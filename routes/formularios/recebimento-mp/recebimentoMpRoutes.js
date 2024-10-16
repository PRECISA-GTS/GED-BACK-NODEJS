const { Router } = require('express');
const router = Router();
const route = '/formularios/recebimento-mp';

// const { configureMulterMiddleware } = require('../../../config/uploads');
const RecebimentoMpController = require('../../../controllers/formularios/recebimentoMp/recebimentoMpController');
const recebimentoMpController = new RecebimentoMpController();

router.post(`${route}/getList`, recebimentoMpController.getList);
router.post(`${route}/getData`, recebimentoMpController.getData);
router.post(`${route}/insertData`, recebimentoMpController.insertData);
router.delete(`${route}/delete/:id/:usuarioID/:unidadeID`, recebimentoMpController.deleteData);
router.get(`${route}/getModels/:unidadeID`, recebimentoMpController.getModels);
router.post(`${route}/updateData/:id`, recebimentoMpController.updateData);
router.get(`${route}/getNaoConformidadeModels/:unidadeID`, recebimentoMpController.getNaoConformidadeModels);
router.post(`${route}/changeFormStatus/:id`, recebimentoMpController.changeFormStatus);
router.post(`${route}/getProdutosRecebimento`, recebimentoMpController.getProdutosRecebimento);

//? MULTER: Upload de arquivo
// router.delete(`${route}/deleteAnexo/:id/:anexoID/:unidadeID/:usuarioID/:folder`, recebimentoMpController.deleteAnexo);
// router.post(`${route}/saveAnexo/:id/:folder/:usuarioID/:unidadeID`, (req, res, next) => {
//     const folder = req.params.folder ?? '/' //? Pasta destino do arquivo (grupo-anexo/produto/item/...)
//     const pathDestination = `uploads/${req.params.unidadeID}/recebimento-mp/${folder}/`
//     req.pathDestination = pathDestination
//     configureMulterMiddleware(req, res, next, req.params.usuarioID, req.params.unidadeID, pathDestination)
// }, recebimentoMpController.saveAnexo);

module.exports = router;