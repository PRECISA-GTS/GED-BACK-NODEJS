const { Router } = require('express');
const router = Router();
const route = '/configuracoes/versao';

const VersaoController = require('../../../controllers/configuracoes/versao/versaoController');
const versaoController = new VersaoController();

router.post(`${route}`, versaoController.getList);
router.post(`${route}/getData/:id`, versaoController.getData);
router.post(`${route}/updateData/:id`, versaoController.updateData);
router.post(`${route}/new/insertData`, versaoController.insertData);
router.post(`${route}/listVersions`, versaoController.listVersions);
router.delete(`${route}/:id/:unidadeID/:usuarioID`, versaoController.deleteData);

router.get(`${route}/getLatestVersion`, versaoController.getLatestVersion);

module.exports = router;