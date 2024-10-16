const { Router } = require('express');
const router = Router();
const route = '/login';

const AuthController = require('../../controllers/auth/authController');
const authController = new AuthController();
router.post(`${route}`, authController.login);

module.exports = router;