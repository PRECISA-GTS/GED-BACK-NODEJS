const { Router } = require('express');
const router = Router();
const route = '/login';
const routeForgotPassword = '/esqueceuSenha';

const AuthController = require('../../controllers/auth/authController');
const authController = new AuthController();

router.post(`${route}`, authController.login);
router.get(`${route}`, authController.getAvailableRoutes);
router.post(`${routeForgotPassword}`, authController.forgotPassword);
router.post(`${routeForgotPassword}/validation`, authController.routeForgotEmailValidation);
router.post(`${routeForgotPassword}/newPassword`, authController.routeForgotNewPassword);

module.exports = router;