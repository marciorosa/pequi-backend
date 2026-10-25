import express from 'express';
import { body, validationResult } from 'express-validator';
import emailService from '../services/email.service';

const router = express.Router();

// Submit contact form
router.post('/submit', [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('subject').trim().isLength({ min: 1 }).withMessage('Subject is required'),
  body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters'),
  body('company').optional().trim(),
  body('phone').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
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
      message: 'Contact form submitted successfully. We will get back to you within 24 hours.',
      success: true
    });

  } catch (error) {
    res.status(500).json({
      message: 'Internal server error. Please try again later.',
      success: false
    });
  }
});

// Submit career application
router.post('/career-application', [
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('jobTitle').trim().isLength({ min: 1 }).withMessage('Job title is required'),
  body('jobId').trim().isLength({ min: 1 }).withMessage('Job ID is required'),
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
        message: 'Validation failed',
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
      message: 'Application submitted successfully. We will review your application and get back to you soon.',
      success: true
    });

  } catch (error) {
    res.status(500).json({
      message: 'Internal server error. Please try again later.',
      success: false
    });
  }
});

// Submit demo scheduling request
router.post('/schedule-demo', [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('teamSize').trim().isLength({ min: 1 }).withMessage('Team size is required'),
  body('slotDate').trim().isLength({ min: 1 }).withMessage('Demo date is required'),
  body('slotTime').trim().isLength({ min: 1 }).withMessage('Demo time is required'),
  body('company').optional().trim(),
  body('interests').optional().isArray(),
  body('questions').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
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
      message: 'Demo scheduled successfully. You will receive a confirmation email shortly.',
      success: true
    });

  } catch (error) {
    res.status(500).json({
      message: 'Internal server error. Please try again later.',
      success: false
    });
  }
});

export default router;
