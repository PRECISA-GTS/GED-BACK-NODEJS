const { Router } = require('express');
const router = Router();
const route = '/calendario';

const CalendarioController = require('../../controllers/calendario/calendarioController');
const calendarioController = new CalendarioController();

router.post(`${route}/getEvents`, calendarioController.getEvents);
router.post(`${route}/getEventsOfDay`, calendarioController.getEventsOfDay);

module.exports = router;