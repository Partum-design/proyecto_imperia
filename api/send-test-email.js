const nodemailer = require("nodemailer");

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const body = parseBody(req);
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "Prueba de alertas Proyecto Imperia").trim();
  const message = String(body.message || "").trim();
  const urgentTasks = Array.isArray(body.urgentTasks) ? body.urgentTasks : [];

  if (!to) {
    return res.status(400).json({ error: "Falta destinatario" });
  }

  const rows = urgentTasks
    .slice(0, 10)
    .map((t) => `- ${t.title || "Tarea"} | ${t.status || "Sin status"} | ${t.client || "Sin cliente"} | ${t.owner || "Sin responsable"} | entrega: ${t.dueDate || "sin fecha"}`)
    .join("\n");

  const textBody = `${message}\n\nResumen de alertas:\n${rows || "Sin tareas urgentes"}`;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    return res.status(200).json({
      ok: true,
      mode: "demo",
      message:
        "Modo demo: no hay SMTP configurado. Agrega SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM en Vercel para envio real.",
      payloadPreview: {
        to,
        subject,
        textBody,
      },
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from: smtpFrom,
      to,
      subject,
      text: textBody,
    });

    return res.status(200).json({
      ok: true,
      mode: "smtp",
      message: `Correo enviado correctamente a ${to}`,
      messageId: info.messageId,
    });
  } catch (error) {
    return res.status(500).json({
      error: `No se pudo enviar: ${error.message}`,
    });
  }
};
