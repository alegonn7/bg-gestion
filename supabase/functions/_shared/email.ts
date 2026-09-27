// Utilidad compartida de envío de email -- SMTP de Gmail con una cuenta dedicada
// (bgtienda.info@gmail.com + contraseña de aplicación, no la cuenta personal de nadie), en vez
// de un proveedor transaccional tipo Resend -- evita necesitar un dominio propio verificado.
// Nunca lanza: quien llama (ej. mercadopago-webhook, al confirmar un pedido) ya terminó lo que
// de verdad importa antes de mandar el mail -- un email que falla solo se loguea.
import nodemailer from "npm:nodemailer@6"

// deno-lint-ignore no-explicit-any
let transporter: any = null

function getTransporter() {
  if (transporter) return transporter

  const user = Deno.env.get("SMTP_USER")
  const pass = Deno.env.get("SMTP_PASSWORD")
  if (!user || !pass) return null

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  })
  return transporter
}

export async function sendEmail({
  to,
  subject,
  html,
  fromName,
}: {
  to: string
  subject: string
  html: string
  fromName?: string
}): Promise<void> {
  const client = getTransporter()
  const fromAddress = Deno.env.get("SMTP_USER")

  if (!client || !fromAddress) {
    console.error("sendEmail: falta configurar SMTP_USER/SMTP_PASSWORD -- no se mandó el email a", to)
    return
  }

  try {
    await client.sendMail({
      from: `"${fromName ?? "BG Tienda"}" <${fromAddress}>`,
      to,
      subject,
      html,
    })
  } catch (err) {
    console.error("sendEmail: SMTP falló -- destinatario:", to, err)
  }
}
