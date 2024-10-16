const { Router } = require('express');

const FornecedorDashboardRoutes = Router();

const FornecedorDashboardController = require('../../controllers/dashboard/fornecedorDashboardController');
const fornecedorDashboardController = new FornecedorDashboardController();

const route = '/fornecedor';

FornecedorDashboardRoutes.post(`${route}/getData`, fornecedorDashboardController.getData);
FornecedorDashboardRoutes.post(`${route}/myData`, fornecedorDashboardController.myData);

module.exports = FornecedorDashboardRoutes;