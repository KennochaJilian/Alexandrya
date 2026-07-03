import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import type { Book } from '../models/book.js';
import type { PublicUser } from '../models/user.js';

export async function sendBookToKindle(book: Book, user: PublicUser) {
  if (!user.kindleEmail) {
    throw new HttpError(400, 'KINDLE_EMAIL_MISSING', 'Aucune adresse Kindle nest configuree pour cet utilisateur.');
  }

  if (!config.smtp.host || !config.smtp.from) {
    throw new HttpError(501, 'SMTP_NOT_CONFIGURED', 'La configuration SMTP est incomplete.');
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user && config.smtp.pass
      ? {
          user: config.smtp.user,
          pass: config.smtp.pass
        }
      : undefined
  });

  const result = await transporter.sendMail({
    from: config.smtp.from,
    to: user.kindleEmail,
    subject: book.title,
    text: `Envoi de "${book.title}" vers votre Kindle.`,
    attachments: [
      {
        filename: book.fileName,
        path: book.filePath
      }
    ]
  });

  return {
    messageId: result.messageId,
    to: user.kindleEmail
  };
}
