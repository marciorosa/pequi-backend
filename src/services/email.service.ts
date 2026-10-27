'use strict';

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { ExternalServiceError } from '../utils/errors';

dotenv.config();

// Create reusable transporter object using Gmail SMTP transport
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

/**
 * Send password reset email to the user
 * @param to Recipient email address
 * @param resetLink Password reset link
 */
export const sendPasswordResetEmail = async (to: string, resetLink: string): Promise<void> => {
  const subject = 'Pequi - Redefinição de senha';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">Pequi</h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Solicitação de redefinição de senha</h2>
        
        <p style="color: #555; line-height: 1.5;">Recebemos uma solicitação para redefinir a sua senha. Clique no botão abaixo para criar uma nova senha:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 3px; font-weight: 500; border: 1px solid #000;">Redefinir senha</a>
        </div>
        
        <p style="color: #555; line-height: 1.5;">Ou copie e cole este link no seu navegador:</p>
        
        <p style="background-color: #f5f5f5; padding: 10px; border-radius: 3px; word-break: break-all;">
          <a href="${resetLink}" style="color: #2563eb; text-decoration: none;">${resetLink}</a>
        </p>
        
        <p style="color: #555; line-height: 1.5; margin-top: 30px;">Este link de redefinição de senha é válido apenas pelos próximos 60 minutos.</p>
        
        <p style="color: #555; line-height: 1.5;">Se você não solicitou a redefinição de senha, ignore este e-mail ou entre em contato com o suporte se tiver alguma dúvida.</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Pequi. Todos os direitos reservados.</p>
        <p>Esta é uma mensagem automática, por favor não responda.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Pequi" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Falha ao enviar o e-mail de redefinição de senha', error);
  }
};

/**
 * Send contact form submission email
 * @param contactData Contact form data
 */
export const sendContactFormEmail = async (contactData: {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  subject: string;
  message: string;
}): Promise<void> => {
  const { name, email, company, phone, subject, message } = contactData;

  const adminSubject = `Nova mensagem pelo formulário de contato: ${subject}`;
  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">Pequi</h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Nova mensagem pelo formulário de contato</h2>
        
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Nome:</strong> ${name}<br/>
          <strong style="color: #333;">E-mail:</strong> ${email}<br/>
          ${company ? `<strong style="color: #333;">Empresa:</strong> ${company}<br/>` : ''}
          ${phone ? `<strong style="color: #333;">Telefone:</strong> ${phone}<br/>` : ''}
          <strong style="color: #333;">Assunto:</strong> ${subject}
        </div>
        
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Mensagem:</strong>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin-top: 10px; white-space: pre-wrap;">${message}</div>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Pequi. Todos os direitos reservados.</p>
        <p>Esta é uma notificação automática do formulário de contato.</p>
      </div>
    </div>
  `;

  const userSubject = 'Obrigado por entrar em contato com o Pequi';
  const userHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">Pequi</h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Obrigado por entrar em contato</h2>
        
        <p style="color: #555; line-height: 1.5;">Olá, ${name},</p>
        
        <p style="color: #555; line-height: 1.5;">Obrigado por falar com o Pequi. Recebemos sua mensagem sobre "${subject}" e retornaremos em até 24 horas.</p>
        
        <p style="color: #555; line-height: 1.5;">Nossa equipe tem o compromisso de oferecer um atendimento excepcional e vai analisar sua solicitação com atenção.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333; font-size: 16px;">Sua mensagem:</h3>
          <p style="color: #666; white-space: pre-wrap; margin: 0;">${message}</p>
        </div>
        
        <p style="color: #555; line-height: 1.5;">Em caso de urgência, ligue para +1 (800) 555-1234.</p>
        
        <p style="color: #555; line-height: 1.5;">Atenciosamente,<br/>Equipe Pequi</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Pequi. Todos os direitos reservados.</p>
        <p>Este é um e-mail automático de confirmação.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Pequi - Formulário de contato" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: adminSubject,
      html: adminHtml,
    });

    await transporter.sendMail({
      from: `"Pequi" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: userSubject,
      html: userHtml,
    });

  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Falha ao enviar os e-mails do formulário de contato', error);
  }
};

/**
 * Send career application email
 * @param applicationData Career application data
 */
export const sendCareerApplicationEmail = async (applicationData: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  jobTitle: string;
  jobId: string;
  coverLetter?: string;
  linkedIn?: string;
  portfolio?: string;
}): Promise<void> => {
  const { firstName, lastName, email, phone, location, jobTitle, jobId, coverLetter, linkedIn, portfolio } = applicationData;

  const hrSubject = `Nova candidatura: ${jobTitle} (${firstName} ${lastName})`;
  const hrHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">Pequi</h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Nova candidatura recebida</h2>
        
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Vaga:</strong> ${jobTitle}<br/>
          <strong style="color: #333;">ID da vaga:</strong> AL-${jobId}<br/>
          <strong style="color: #333;">Candidato(a):</strong> ${firstName} ${lastName}<br/>
          <strong style="color: #333;">E-mail:</strong> ${email}<br/>
          ${phone ? `<strong style="color: #333;">Telefone:</strong> ${phone}<br/>` : ''}
          ${location ? `<strong style="color: #333;">Localização:</strong> ${location}<br/>` : ''}
          ${linkedIn ? `<strong style="color: #333;">LinkedIn:</strong> ${linkedIn}<br/>` : ''}
          ${portfolio ? `<strong style="color: #333;">Portfolio:</strong> ${portfolio}<br/>` : ''}
        </div>
        
        ${coverLetter ? `
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Carta de apresentação:</strong>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin-top: 10px; white-space: pre-wrap;">${coverLetter}</div>
        </div>
        ` : ''}
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Pequi. Todos os direitos reservados.</p>
        <p>Esta é uma notificação automática da página de carreiras.</p>
      </div>
    </div>
  `;

  const applicantSubject = `Candidatura recebida: ${jobTitle}`;
  const applicantHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">Pequi</h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Candidatura recebida</h2>
        
        <p style="color: #555; line-height: 1.5;">Olá, ${firstName},</p>
        
        <p style="color: #555; line-height: 1.5;">Obrigado pelo seu interesse na vaga de <strong>${jobTitle}</strong> no Pequi. Recebemos sua candidatura com sucesso.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333; font-size: 16px;">Detalhes da candidatura:</h3>
          <p style="color: #666; margin: 5px 0;"><strong>Vaga:</strong> ${jobTitle}</p>
          <p style="color: #666; margin: 5px 0;"><strong>ID da candidatura:</strong> AL-${jobId}-${Date.now()}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Enviada em:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        
        <p style="color: #555; line-height: 1.5;">Nossa equipe de recrutamento vai analisar sua candidatura e entrará em contato se o seu perfil atender aos requisitos da vaga. Esse processo costuma levar de 1 a 2 semanas.</p>
        
        <p style="color: #555; line-height: 1.5;">Agradecemos seu interesse em fazer parte da nossa equipe e construir o futuro da tecnologia jurídica.</p>
        
        <p style="color: #555; line-height: 1.5;">Atenciosamente,<br/>Equipe de Recrutamento Pequi</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Pequi. Todos os direitos reservados.</p>
        <p>Este é um e-mail automático de confirmação.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Pequi Carreiras" <${process.env.EMAIL_USER}>`,
      to: process.env.HR_EMAIL,
      subject: hrSubject,
      html: hrHtml,
    });

    await transporter.sendMail({
      from: `"Pequi Carreiras" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: applicantSubject,
      html: applicantHtml,
    });

  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Falha ao enviar os e-mails de candidatura', error);
  }
};

/**
 * Send demo scheduling confirmation email
 * @param demoData Demo scheduling data
 */
export const sendDemoSchedulingEmail = async (demoData: {
  name: string;
  email: string;
  company?: string;
  teamSize: string;
  interests: string[];
  questions?: string;
  slotDate: string;
  slotTime: string;
}): Promise<void> => {
  const { name, email, company, teamSize, interests, questions, slotDate, slotTime } = demoData;

  const adminSubject = `Nova demonstração agendada: ${name} - ${slotDate} às ${slotTime}`;
  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">Pequi</h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Nova demonstração agendada</h2>
        
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Data e horário:</strong> ${slotDate} às ${slotTime}<br/>
          <strong style="color: #333;">Nome:</strong> ${name}<br/>
          <strong style="color: #333;">E-mail:</strong> ${email}<br/>
          ${company ? `<strong style="color: #333;">Empresa:</strong> ${company}<br/>` : ''}
          <strong style="color: #333;">Tamanho da equipe:</strong> ${teamSize}
        </div>
        
        ${interests.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Áreas de interesse:</strong>
          <ul style="margin-top: 10px;">
            ${interests.map(interest => `<li>${interest}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
        
        ${questions ? `
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Perguntas/comentários:</strong>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin-top: 10px; white-space: pre-wrap;">${questions}</div>
        </div>
        ` : ''}
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Pequi. Todos os direitos reservados.</p>
        <p>Esta é uma notificação automática do sistema de agendamento de demonstrações.</p>
      </div>
    </div>
  `;

  const userSubject = `Demonstração confirmada: ${slotDate} às ${slotTime}`;
  const userHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">Pequi</h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Demonstração confirmada</h2>
        
        <p style="color: #555; line-height: 1.5;">Olá, ${name},</p>
        
        <p style="color: #555; line-height: 1.5;">Obrigado por agendar uma demonstração do Pequi! Estamos animados para mostrar como nossas ferramentas jurídicas com IA podem transformar a sua prática.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 3px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333; font-size: 18px;">Detalhes da demonstração:</h3>
          <p style="color: #666; margin: 5px 0;"><strong>Data e horário:</strong> ${slotDate} às ${slotTime}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Duração:</strong> 30 minutos</p>
          <p style="color: #666; margin: 5px 0;"><strong>Link da reunião:</strong> será enviado 24 horas antes da demonstração</p>
          ${company ? `<p style="color: #666; margin: 5px 0;"><strong>Empresa:</strong> ${company}</p>` : ''}
        </div>
        
        <div style="background-color: #e8f5e8; padding: 15px; border-radius: 3px; border-left: 4px solid #4CAF50; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #2E7D32;">O que esperar:</h4>
          <ul style="color: #2E7D32; margin: 10px 0 0 20px; line-height: 1.6;">
            <li>Apresentação personalizada dos recursos do Pequi</li>
            <li>Conversa sobre seus casos de uso e necessidades específicas</li>
            <li>Sessão de perguntas e respostas com nossos especialistas</li>
            <li>Recomendações personalizadas para a sua prática</li>
          </ul>
        </div>
        
        <p style="color: #555; line-height: 1.5;">Se precisar remarcar ou tiver alguma dúvida antes da demonstração, responda a este e-mail ou ligue para +1 (800) 555-1234.</p>
        
        <p style="color: #555; line-height: 1.5;">Até breve!</p>
        
        <p style="color: #555; line-height: 1.5;">Atenciosamente,<br/>Equipe Comercial Pequi</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} Pequi. Todos os direitos reservados.</p>
        <p>Este é um e-mail automático de confirmação.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Pequi - Agendamento de demonstrações" <${process.env.EMAIL_USER}>`,
      to: process.env.SALES_EMAIL,
      subject: adminSubject,
      html: adminHtml,
    });

    await transporter.sendMail({
      from: `"Pequi" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: userSubject,
      html: userHtml,
    });

  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Falha ao enviar os e-mails de agendamento de demonstração', error);
  }
};

/**
 * Send workflow execution result email
 */
export const sendWorkflowEmail = async (to: string, subject: string, content: string): Promise<void> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">Pequi</h1>
        <p style="color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin-top: 5px;">Resultado da automação</p>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333; font-size: 18px;">${subject}</h2>
        
        <div style="color: #555; line-height: 1.6; margin-top: 20px;">
          ${content}
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">Esta automação foi disparada pelo seu fluxo de trabalho no Pequi.</p>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 11px;">
        <p>&copy; ${new Date().getFullYear()} Pequi. Todos os direitos reservados.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Pequi Automações" <${process.env.EMAIL_USER}>`,
      to,
      subject: `[Automação] ${subject}`,
      html,
    });
  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Falha ao enviar o e-mail com o resultado do fluxo de trabalho', error);
  }
};

export default {
  sendPasswordResetEmail,
  sendContactFormEmail,
  sendCareerApplicationEmail,
  sendDemoSchedulingEmail,
  sendWorkflowEmail,
};