const { Router } = require('express');
const routes = Router();

const urlBase = '/api'

// Autenticação
const auth = require("./auth/authRoutes");
routes.use(urlBase + '/', auth);

// Dashborards
const fabricaDashboard = require("./dashboard/fabricaRoutes")
const fornecedorDashboard = require("./dashboard/fornecedorDashboardRoutes")
routes.use(urlBase + '/dashboard', fabricaDashboard);
routes.use(urlBase + '/dashboard', fornecedorDashboard);

// Fornecedor
const fornecedorRouter = require("./formularios/fornecedor/fornecedorRoutes");
routes.use(urlBase, fornecedorRouter);

// Recebimento de MP
const recebimentoMpRouter = require("./formularios/recebimento-mp/recebimentoMpRoutes");
routes.use(urlBase, recebimentoMpRouter);

module.exports = routes;
