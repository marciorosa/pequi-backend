import express from 'express';
import { body, validationResult } from 'express-validator';
import emailService from '../services/email.service';

const router = express.Router();

// Submit contact form
router.post('/submit', [
  body('name').trim().isLength({ min: 1 }).withMessage('O nome é obrigatório'),
  body('email').isEmail().withMessage('Informe um e-mail válido'),
  body('subject').trim().isLength({ min: 1 }).withMessage('O assunto é obrigatório'),
  body('message').trim().isLength({ min: 10 }).withMessage('A mensagem deve ter pelo menos 10 caracteres'),
  body('company').optional().trim(),
  body('phone').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Falha na validação',
        errors: errors.array()
      });
    }

    const { name, email, company, phone, subject, message } = req.body;

    // Send emails
    await emailService.sendContactFormEmail({
      name,
      email,
      company,
      phone,
      subject,
      message
    });

    res.status(200).json({
      message: 'Mensagem enviada com sucesso. Retornaremos em até 24 horas.',
      success: true
    });

  } catch (error) {
    res.status(500).json({
      message: 'Erro interno do servidor. Tente novamente mais tarde.',
      success: false
    });
  }
});

// Submit career application
router.post('/career-application', [
  body('firstName').trim().isLength({ min: 1 }).withMessage('O nome é obrigatório'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('O sobrenome é obrigatório'),
  body('email').isEmail().withMessage('Informe um e-mail válido'),
  body('jobTitle').trim().isLength({ min: 1 }).withMessage('O cargo é obrigatório'),
  body('jobId').trim().isLength({ min: 1 }).withMessage('O ID da vaga é obrigatório'),
  body('phone').optional().trim(),
  body('location').optional().trim(),
  body('coverLetter').optional().trim(),
  body('linkedIn').optional().trim(),
  body('portfolio').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Falha na validação',
        errors: errors.array()
      });
    }

    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      location, 
      jobTitle, 
      jobId, 
      coverLetter, 
      linkedIn, 
      portfolio 
    } = req.body;

    // Send emails
    await emailService.sendCareerApplicationEmail({
      firstName,
      lastName,
      email,
      phone,
      location,
      jobTitle,
      jobId,
      coverLetter,
      linkedIn,
      portfolio
    });

    res.status(200).json({
      message: 'Candidatura enviada com sucesso. Vamos analisá-la e retornaremos em breve.',
      success: true
    });

  } catch (error) {
    res.status(500).json({
      message: 'Erro interno do servidor. Tente novamente mais tarde.',
      success: false
    });
  }
});

// Submit demo scheduling request
router.post('/schedule-demo', [
  body('name').trim().isLength({ min: 1 }).withMessage('O nome é obrigatório'),
  body('email').isEmail().withMessage('Informe um e-mail válido'),
  body('teamSize').trim().isLength({ min: 1 }).withMessage('O tamanho da equipe é obrigatório'),
  body('slotDate').trim().isLength({ min: 1 }).withMessage('A data da demonstração é obrigatória'),
  body('slotTime').trim().isLength({ min: 1 }).withMessage('O horário da demonstração é obrigatório'),
  body('company').optional().trim(),
  body('interests').optional().isArray(),
  body('questions').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Falha na validação',
        errors: errors.array()
      });
    }

    const { 
      name, 
      email, 
      company, 
      teamSize, 
      interests = [], 
      questions, 
      slotDate, 
      slotTime 
    } = req.body;

    // Send emails
    await emailService.sendDemoSchedulingEmail({
      name,
      email,
      company,
      teamSize,
      interests,
      questions,
      slotDate,
      slotTime
    });

    res.status(200).json({
      message: 'Demonstração agendada com sucesso. Você receberá um e-mail de confirmação em breve.',
      success: true
    });

  } catch (error) {
    res.status(500).json({
      message: 'Erro interno do servidor. Tente novamente mais tarde.',
      success: false
    });
  }
});

export default router;
