const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const sendEmail = async (to, subject, html, text = null) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'MindCare <noreply@mindcare.com>',
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error enviando email:', error);
    return { success: false, error: error.message };
  }
};

const sendVerificationEmail = async (email, token, nombre) => {
  const verificationUrl = `${process.env.BASE_URL}/auth/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Bienvenido a MindCare</h1>
        </div>
        <div class="content">
          <h2>Hola ${nombre},</h2>
          <p>Gracias por registrarte en MindCare. Para completar tu registro, por favor verifica tu dirección de email haciendo clic en el siguiente botón:</p>
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verificar Email</a>
          </div>
          <p>O copia y pega este enlace en tu navegador:</p>
          <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
          <p>Este enlace expirará en 24 horas.</p>
          <p>Si no solicitaste este registro, puedes ignorar este email.</p>
        </div>
        <div class="footer">
          <p>&copy; 2024 MindCare - Centro de Salud Mental | La Paz, Bolivia</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, 'Verifica tu cuenta de MindCare', html);
};

const sendAppointmentReminder = async (email, nombre, fecha, terapeuta) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
    </head>
    <body>
      <h2>Recordatorio de Cita - MindCare</h2>
      <p>Hola ${nombre},</p>
      <p>Este es un recordatorio de tu próxima sesión de terapia:</p>
      <ul>
        <li><strong>Fecha y Hora:</strong> ${fecha}</li>
        <li><strong>Terapeuta:</strong> ${terapeuta}</li>
      </ul>
      <p>Por favor, asegúrate de estar disponible a la hora programada.</p>
      <p>Saludos cordiales,<br>Equipo MindCare</p>
    </body>
    </html>
  `;

  return sendEmail(email, 'Recordatorio: Sesión de Terapia', html);
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendAppointmentReminder,
  transporter
};