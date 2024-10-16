const { Router } = require('express');
const naoConformidadeRoutes = Router();
const { configureMulterMiddleware } = require('../../../../config/uploads');

const NaoConformidadeController = require('../../../../controllers/formularios/recebimentoMp/naoConformidade/naoConformidadeController');
const naoConformidadeController = new NaoConformidadeController();

const route = '/formularios/recebimento-mp/nao-conformidade';

naoConformidadeRoutes.post(`${route}/getList`, naoConformidadeController.getList);
naoConformidadeRoutes.post(`${route}/getData`, naoConformidadeController.getData);
naoConformidadeRoutes.post(`${route}/getModels`, naoConformidadeController.getModels);
naoConformidadeRoutes.post(`${route}/insertData`, naoConformidadeController.insertData);
naoConformidadeRoutes.post(`${route}/updateData/:id`, naoConformidadeController.updateData);
naoConformidadeRoutes.post(`${route}/conclude`, naoConformidadeController.conclude);
naoConformidadeRoutes.post(`${route}/fornecedor-preenche`, naoConformidadeController.fornecedorPreenche);
naoConformidadeRoutes.delete(`${route}/delete/:id/:usuarioID/:unidadeID`, naoConformidadeController.deleteData);
naoConformidadeRoutes.post(`${route}/reOpen/:id`, naoConformidadeController.reOpen);
naoConformidadeRoutes.post(`${route}/getRecebimentoMPNC`, naoConformidadeController.getRecebimentoMPNC);
naoConformidadeRoutes.post(`${route}/getNCRecebimentoMp`, naoConformidadeController.getNCRecebimentoMp);
naoConformidadeRoutes.delete(`${route}/deleteAnexo/:id/:anexoID/:unidadeID/:usuarioID/:folder`, naoConformidadeController.deleteAnexo);

naoConformidadeRoutes.post(`${route}/saveAnexo/:id/:folder/:usuarioID/:unidadeID`, (req, res, next) => {
    const folder = req.params.folder ?? '/' //? Pasta destino do arquivo (grupo-anexo/produto/item/...)
    const pathDestination = `uploads/${req.params.unidadeID}/recebimento-mp-nao-conformidade/${folder}/`
    req.pathDestination = pathDestination
    console.log("🚀 ~ pathDestination:", pathDestination)
    configureMulterMiddleware(req, res, next, req.params.usuarioID, req.params.unidadeID, pathDestination)
}, naoConformidadeController.saveAnexo);

module.exports = naoConformidadeRoutes;