const db = require('../../config/db');

class CalendarioController {
    async getEvents(req, res) {
        try {
            const { unidadeID, usuarioID, papelID, admin } = req.body

            if (!unidadeID || !usuarioID || !papelID) return res.status(500).json({ message: 'Parâmetros incorretos!' })

            let sql = `
            SELECT 
                COUNT(*) AS qtd,
                DATE_FORMAT(c.dataHora, '%Y-%m-%d') AS data, 
                DATE_FORMAT(c.dataHora, '%d/%m/%Y') AS data_, 
                CASE DAYOFWEEK(c.dataHora)
                    WHEN 1 THEN 'Domingo'
                    WHEN 2 THEN 'Segunda-feira'
                    WHEN 3 THEN 'Terça-feira'
                    WHEN 4 THEN 'Quarta-feira'
                    WHEN 5 THEN 'Quinta-feira'
                    WHEN 6 THEN 'Sexta-feira'
                    WHEN 7 THEN 'Sábado'
                END AS diaSemana,                
                c.status
            FROM calendario AS c `
            if (admin != 1) sql += ` JOIN permissao AS p ON (c.rotaPermissao = p.rota) `
            sql += ` WHERE c.unidadeID = ${unidadeID} `
            if (admin != 1) sql += ` AND p.unidadeID = ${unidadeID} AND p.usuarioID = ${usuarioID} AND p.papelID = ${papelID} AND p.ler = 1 `
            sql += ` GROUP BY DATE(c.dataHora) `
            const [resultCalendar] = await db.promise().query(sql, [unidadeID, unidadeID])

            const result = resultCalendar.map(item => {
                var { variant, rgb } = defineEventColor(item)

                return {
                    title: item.qtd,
                    start: item.data,
                    end: item.data,
                    eventDate: item.data,
                    eventDate_: item.data_,
                    dayWeek: item.diaSemana,
                    variant: variant,
                    color: rgb,
                    // link: item.rota ? {
                    //     rota: item.rota,
                    //     id: item.rotaID ?? null
                    // } : null,
                    // icon: getIcon(item.tipo)
                }
            })

            return res.status(200).json(result);
        } catch (error) {
            console.log(error)
        }
    }

    async getEventsOfDay(req, res) {
        const { eventDate, unidadeID, usuarioID, papelID, admin } = req.body

        if (!eventDate) return res.status(500).json({ message: 'Parâmetros incorretos!' })

        try {
            let sql = `
            SELECT 
                c.calendarioID,
                c.titulo,
                c.subtitulo,
                c.tipo,
                c.rota,
                c.rotaID,
                c.origemID,
                c.dataHora,
                DATE_FORMAT(c.dataHora, '%Y-%m-%d') AS data, 
                DATE_FORMAT(c.dataHora, '%d/%m/%Y') AS data_, 
                DATE_FORMAT(c.dataHora, '%H:%i') AS hora, 
                CASE DAYOFWEEK(c.dataHora)
                    WHEN 1 THEN 'Domingo'
                    WHEN 2 THEN 'Segunda-feira'
                    WHEN 3 THEN 'Terça-feira'
                    WHEN 4 THEN 'Quarta-feira'
                    WHEN 5 THEN 'Quinta-feira'
                    WHEN 6 THEN 'Sexta-feira'
                    WHEN 7 THEN 'Sábado'
                END AS diaSemana,                
                c.status
            FROM calendario AS c `
            if (admin != 1) sql += ` JOIN permissao AS p ON (c.rotaPermissao = p.rota) `
            sql += ` WHERE c.unidadeID = ${unidadeID} AND DATE(c.dataHora) = "${eventDate}" `
            if (admin != 1) sql += ` AND p.unidadeID = ${unidadeID} AND p.usuarioID = ${usuarioID} AND p.papelID = ${papelID} AND p.ler = 1 `
            sql += ` 
            GROUP BY c.calendarioID 
            ORDER BY c.dataHora ASC `
            const [resultCalendar] = await db.promise().query(sql, [unidadeID, unidadeID])

            const formatedResultCalendar = resultCalendar.map(item => {
                var { variant } = defineEventColor(item);

                return {
                    ...item,
                    variant,
                };
            });

            res.status(200).json(formatedResultCalendar);
        } catch (error) {
            console.log(error)
            res.status(500).json({ message: 'Erro ao buscar eventos!' })
        }
    }
}

const defineEventColor = (item) => {
    const tmpToday = new Date();
    const today = dateToInteger(`${tmpToday.getFullYear()}-${(tmpToday.getMonth() + 1).toString().padStart(2, '0')}-${tmpToday.getDate().toString().padStart(2, '0')}`);
    const eventDate = dateToInteger(item.data);

    // Concluído
    if (item.status == 1) return { variant: 'secondary', rgb: hexToRgb('#6D788D') }

    //! Já venceu
    if (eventDate < today) return { variant: 'error', rgb: hexToRgb('#FF4D49') }

    //todo Vence hoje
    if (eventDate === today) {
        return { variant: 'warning', rgb: hexToRgb('#FDB528') }
    }

    //? Vence futuramente
    return { variant: 'info', rgb: hexToRgb('#26C6F9') }
}

//? Converte data no formato YYYY-MM-DD em um inteiro
const dateToInteger = (date) => {
    const [year, month, day] = date.split('-');
    return parseInt(`${year}${month}${day}`);
}

// Transforma o hex em rgba como alpha de 0.2
const hexToRgb = (hex, alpha = 0.2) => {
    hex = hex.replace(/^#/, '');
    let bigint = parseInt(hex, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

module.exports = CalendarioController;