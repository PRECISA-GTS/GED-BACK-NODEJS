const { Router } = require('express');
const router = Router();
const route = '/fabrica';

const FabricaController = require('../../controllers/dashboard/fabricaController');
const fabricaController = new FabricaController();

router.get(`${route}/getData/:unidadeID`, fabricaController.getData);

module.exports = router;