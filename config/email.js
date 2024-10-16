const nodemailer = require('nodemailer');
const { executeQuery } = require('./executeQuery');

const SendMailConfig = async (destinatario, assunto, html, logID, data) => {

    const transporter = nodemailer.createTransport({
        host: 'mail.gedagro.com.br',
        port: 587,
        secure: false,
        tls: {
            rejectUnauthorized: false
        },
        auth: {
            user: 'app@gedagro.com.br',
            pass: 'Jw6!Jr0+Vw4+Lc8#'
        }
    });

    const mailOptions = {
        from: 'GEDagro <app@gedagro.com.br>',
        to: destinatario,
        subject: assunto,
        html: html
    };

    transporter.sendMail(mailOptions, async function (error, info) {
        if (error) {
            console.log(error);
            return false;
        } else {
            console.log('Email enviado: ' + info.response);

            const values = {
                ...data,
                email: destinatario,
                assunto: assunto,
            }

            await executeQuery(null, [], 'email', 'usuario', null, null, logID, values)
            return true;

        }
    });

};

module.exports = SendMailConfig;