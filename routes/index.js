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

// Calendario
const calendarioRouter = require("./calendario/calendarioRoutes");
routes.use(urlBase, calendarioRouter);

// Fornecedor
const fornecedorRouter = require("./formularios/fornecedor/fornecedorRoutes");
routes.use(urlBase, fornecedorRouter);

// Recebimento de MP
const recebimentoMpRouter = require("./formularios/recebimento-mp/recebimentoMpRoutes");
routes.use(urlBase, recebimentoMpRouter);

//? Cadastros

// Departamento
const DepartamentoRouter = require("./cadastros/departamento/departamentoRoutes")
routes.use(urlBase, DepartamentoRouter);

// Versão
const versaoRouter = require("./configuracoes/versao/versaoRoutes")
routes.use(urlBase, versaoRouter);

module.exports = routes;
