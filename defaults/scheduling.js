const db = require('../config/db');
const { executeQuery } = require('../config/executeQuery');
require('dotenv/config');

const getCalendarDetails = (type) => {
    switch (type) {
        case 'fornecedor':
            return {
                type: 'Fornecedor',
                route: '/formularios/fornecedor',
            };
        case 'recebimentomp-naoconformidade':
            return {
                type: 'Não Conformidade do Recebimento de MP',
                route: '/formularios/recebimento-mp/?aba=nao-conformidade',
                routePermission: '/formularios/recebimento-mp'
            };
        case 'limpeza':
            return {
                type: 'Limpeza',
                route: '/formularios/limpeza',
            };
        case 'limpeza-naoconformidade':
            return {
                type: 'Não Conformidade da Limpeza e Higienização',
                route: '/formularios/limpeza/?aba=nao-conformidade',
                routePermission: '/formularios/limpeza'
            };
        default:
            return {
                type: 'Desconhecido',
                route: '/',
            };
    }
};

//? initialDate => YYYY-MM-DD
const createScheduling = async (id, type, name, subtitle, initialDate, cycle, unityID, logID) => {
    if (!cycle || cycle <= 0 || cycle == '0') return;

    const calendar = getCalendarDetails(type);

    const sqlCalendar = `
    INSERT INTO calendario(titulo, subtitulo, tipo, dataHora, rota, rotaPermissao, rotaID, origemID, status, unidadeID) 
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await executeQuery(sqlCalendar, [
        name,
        subtitle,
        calendar.type,
        getVencimento(initialDate, cycle),
        calendar.route,
        calendar.routePermission ?? calendar.route,
        '0',
        id,
        '0',
        unityID
    ], 'insert', 'calendario', 'origemID', id, logID);
};

//? initialDate => YYYY-MM-DD
const updateScheduling = async (id, type, name, subtitle, initialDate, cycle, unityID, logID) => {
    if (!cycle || cycle <= 0) {
        await deleteScheduling(type, id, unityID, logID);
        return;
    }

    const calendar = getCalendarDetails(type);

    const sqlExists = `SELECT * FROM calendario WHERE rota = ? AND origemID = ? AND unidadeID = ?`;
    const [result] = await db.promise().query(sqlExists, [calendar.route, id, unityID]);

    if (result.length > 0) {
        const sqlCalendar = `UPDATE calendario SET dataHora = ? WHERE origemID = ?`;
        await executeQuery(sqlCalendar, [getVencimento(initialDate, cycle), id], 'update', 'calendario', 'origemID', id, logID);
    } else {
        await createScheduling(id, type, name, subtitle, initialDate, cycle, unityID, logID);
    }
};

const deleteScheduling = async (type, id, unityID, logID) => {
    const calendar = getCalendarDetails(type);

    const sqlDeleteScheduling = `DELETE FROM calendario WHERE unidadeID = ? AND origemID = ? AND rota = ?`;
    await executeQuery(sqlDeleteScheduling, [unityID, id, calendar.route], 'delete', 'calendario', 'origemID', id, logID);
};

//? 1-> Evento concluído, 0-> Evento não concluído
const updateStatusScheduling = async (id, route, status, unityID, logID) => {
    const sqlCalendar = `UPDATE calendario SET status = ? WHERE rota = ? AND origemID = ? AND unidadeID = ?`;
    await executeQuery(sqlCalendar, [status, route, id, unityID], 'update', 'calendario', 'origemID', id, logID);
};

const getVencimento = (initialDate, ciclo) => {
    const date = new Date(initialDate);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + parseInt(ciclo));
    const vencimentoFormatado = date.toISOString().slice(0, 10) + ' 00:00:00';
    return vencimentoFormatado;
};

module.exports = {
    createScheduling,
    updateScheduling,
    deleteScheduling,
    updateStatusScheduling
};