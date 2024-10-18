const { Router } = require('express');
const router = Router();
const route = '/cadastros/departamento';

const DepartamentoController = require('../../../controllers/cadastros/departamento/departamentoController');
const departamentoController = new DepartamentoController();

router.post(`${route}`, departamentoController.getList);
router.post(`${route}/getData/:id`, departamentoController.getData);
router.post(`${route}/updateData/:id`, departamentoController.updateData);
router.post(`${route}/new/insertData`, departamentoController.insertData);
router.delete(`${route}/:id/:unidadeID/:usuarioID`, departamentoController.deleteData);
router.post(`${route}/getDepartamentosAssinatura`, departamentoController.getDepartamentosAssinatura);
router.post(`${route}/getProfissionaisDepartamentosAssinatura`, departamentoController.getProfissionaisDepartamentosAssinatura);
router.post(`${route}/getProfessionals`, departamentoController.getProfessionals);

module.exports = router;