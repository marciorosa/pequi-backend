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
  const subject = 'AIForLawyers Password Reset';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">AI<span style="font-weight: 300;">LAWYER</span></h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Password Reset Request</h2>
        
        <p style="color: #555; line-height: 1.5;">We received a request to reset your password. Click the button below to create a new password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 3px; font-weight: 500; border: 1px solid #000;">Reset Password</a>
        </div>
        
        <p style="color: #555; line-height: 1.5;">Or copy and paste this link into your browser:</p>
        
        <p style="background-color: #f5f5f5; padding: 10px; border-radius: 3px; word-break: break-all;">
          <a href="${resetLink}" style="color: #2563eb; text-decoration: none;">${resetLink}</a>
        </p>
        
        <p style="color: #555; line-height: 1.5; margin-top: 30px;">This password reset link is only valid for the next 60 minutes.</p>
        
        <p style="color: #555; line-height: 1.5;">If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} AIForLawyers. All rights reserved.</p>
        <p>This is an automated message, please do not reply.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AIForLawyers" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Failed to send password reset email', error);
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

  const adminSubject = `New Contact Form Submission: ${subject}`;
  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">AI<span style="font-weight: 300;">LAWYER</span></h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">New Contact Form Submission</h2>
        
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Name:</strong> ${name}<br/>
          <strong style="color: #333;">Email:</strong> ${email}<br/>
          ${company ? `<strong style="color: #333;">Company:</strong> ${company}<br/>` : ''}
          ${phone ? `<strong style="color: #333;">Phone:</strong> ${phone}<br/>` : ''}
          <strong style="color: #333;">Subject:</strong> ${subject}
        </div>
        
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Message:</strong>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin-top: 10px; white-space: pre-wrap;">${message}</div>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} AIForLawyers. All rights reserved.</p>
        <p>This is an automated notification from the contact form.</p>
      </div>
    </div>
  `;

  const userSubject = 'Thank you for contacting AIForLawyers';
  const userHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">AI<span style="font-weight: 300;">LAWYER</span></h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Thank You for Contacting Us</h2>
        
        <p style="color: #555; line-height: 1.5;">Dear ${name},</p>
        
        <p style="color: #555; line-height: 1.5;">Thank you for reaching out to AIForLawyers. We have received your message regarding "${subject}" and will get back to you within 24 hours.</p>
        
        <p style="color: #555; line-height: 1.5;">Our team is dedicated to providing exceptional service and will review your inquiry carefully.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333; font-size: 16px;">Your Message:</h3>
          <p style="color: #666; white-space: pre-wrap; margin: 0;">${message}</p>
        </div>
        
        <p style="color: #555; line-height: 1.5;">If you have any urgent matters, please call us at +1 (800) 555-1234.</p>
        
        <p style="color: #555; line-height: 1.5;">Best regards,<br/>The AIForLawyers Team</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} AIForLawyers. All rights reserved.</p>
        <p>This is an automated confirmation email.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AIForLawyers Contact Form" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: adminSubject,
      html: adminHtml,
    });

    await transporter.sendMail({
      from: `"AIForLawyers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: userSubject,
      html: userHtml,
    });

  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Failed to send contact form emails', error);
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

  const hrSubject = `New Job Application: ${jobTitle} (${firstName} ${lastName})`;
  const hrHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">AI<span style="font-weight: 300;">LAWYER</span></h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">New Job Application Received</h2>
        
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Position:</strong> ${jobTitle}<br/>
          <strong style="color: #333;">Job ID:</strong> AL-${jobId}<br/>
          <strong style="color: #333;">Applicant:</strong> ${firstName} ${lastName}<br/>
          <strong style="color: #333;">Email:</strong> ${email}<br/>
          ${phone ? `<strong style="color: #333;">Phone:</strong> ${phone}<br/>` : ''}
          ${location ? `<strong style="color: #333;">Location:</strong> ${location}<br/>` : ''}
          ${linkedIn ? `<strong style="color: #333;">LinkedIn:</strong> ${linkedIn}<br/>` : ''}
          ${portfolio ? `<strong style="color: #333;">Portfolio:</strong> ${portfolio}<br/>` : ''}
        </div>
        
        ${coverLetter ? `
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Cover Letter:</strong>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin-top: 10px; white-space: pre-wrap;">${coverLetter}</div>
        </div>
        ` : ''}
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} AIForLawyers. All rights reserved.</p>
        <p>This is an automated notification from the careers page.</p>
      </div>
    </div>
  `;

  const applicantSubject = `Application Received: ${jobTitle}`;
  const applicantHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">AI<span style="font-weight: 300;">LAWYER</span></h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Application Received</h2>
        
        <p style="color: #555; line-height: 1.5;">Dear ${firstName},</p>
        
        <p style="color: #555; line-height: 1.5;">Thank you for your interest in the <strong>${jobTitle}</strong> position at AIForLawyers. We have successfully received your application.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333; font-size: 16px;">Application Details:</h3>
          <p style="color: #666; margin: 5px 0;"><strong>Position:</strong> ${jobTitle}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Application ID:</strong> AL-${jobId}-${Date.now()}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <p style="color: #555; line-height: 1.5;">Our hiring team will review your application and contact you if your qualifications match our requirements. This process typically takes 1-2 weeks.</p>
        
        <p style="color: #555; line-height: 1.5;">We appreciate your interest in joining our team and building the future of legal technology.</p>
        
        <p style="color: #555; line-height: 1.5;">Best regards,<br/>The AIForLawyers Hiring Team</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} AIForLawyers. All rights reserved.</p>
        <p>This is an automated confirmation email.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AIForLawyers Careers" <${process.env.EMAIL_USER}>`,
      to: process.env.HR_EMAIL,
      subject: hrSubject,
      html: hrHtml,
    });

    await transporter.sendMail({
      from: `"AIForLawyers Careers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: applicantSubject,
      html: applicantHtml,
    });

  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Failed to send career application emails', error);
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

  const adminSubject = `New Demo Scheduled: ${name} - ${slotDate} at ${slotTime}`;
  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">AI<span style="font-weight: 300;">LAWYER</span></h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">New Demo Scheduled</h2>
        
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Scheduled Time:</strong> ${slotDate} at ${slotTime}<br/>
          <strong style="color: #333;">Name:</strong> ${name}<br/>
          <strong style="color: #333;">Email:</strong> ${email}<br/>
          ${company ? `<strong style="color: #333;">Company:</strong> ${company}<br/>` : ''}
          <strong style="color: #333;">Team Size:</strong> ${teamSize}
        </div>
        
        ${interests.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Areas of Interest:</strong>
          <ul style="margin-top: 10px;">
            ${interests.map(interest => `<li>${interest}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
        
        ${questions ? `
        <div style="margin-bottom: 20px;">
          <strong style="color: #333;">Questions/Comments:</strong>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 3px; margin-top: 10px; white-space: pre-wrap;">${questions}</div>
        </div>
        ` : ''}
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} AIForLawyers. All rights reserved.</p>
        <p>This is an automated notification from the demo scheduling system.</p>
      </div>
    </div>
  `;

  const userSubject = `Demo Confirmed: ${slotDate} at ${slotTime}`;
  const userHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">AI<span style="font-weight: 300;">LAWYER</span></h1>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333;">Demo Confirmed</h2>
        
        <p style="color: #555; line-height: 1.5;">Dear ${name},</p>
        
        <p style="color: #555; line-height: 1.5;">Thank you for scheduling a demo with AIForLawyers! We're excited to show you how our AI-powered legal tools can transform your practice.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 3px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333; font-size: 18px;">Demo Details:</h3>
          <p style="color: #666; margin: 5px 0;"><strong>Date & Time:</strong> ${slotDate} at ${slotTime}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Duration:</strong> 30 minutes</p>
          <p style="color: #666; margin: 5px 0;"><strong>Meeting Link:</strong> Will be sent 24 hours before the demo</p>
          ${company ? `<p style="color: #666; margin: 5px 0;"><strong>Company:</strong> ${company}</p>` : ''}
        </div>
        
        <div style="background-color: #e8f5e8; padding: 15px; border-radius: 3px; border-left: 4px solid #4CAF50; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #2E7D32;">What to Expect:</h4>
          <ul style="color: #2E7D32; margin: 10px 0 0 20px; line-height: 1.6;">
            <li>Personalized walkthrough of AIForLawyers's features</li>
            <li>Discussion of your specific use cases and needs</li>
            <li>Q&A session with our product experts</li>
            <li>Custom recommendations for your practice</li>
          </ul>
        </div>
        
        <p style="color: #555; line-height: 1.5;">If you need to reschedule or have any questions before the demo, please reply to this email or call us at +1 (800) 555-1234.</p>
        
        <p style="color: #555; line-height: 1.5;">We look forward to meeting with you!</p>
        
        <p style="color: #555; line-height: 1.5;">Best regards,<br/>The AIForLawyers Sales Team</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} AIForLawyers. All rights reserved.</p>
        <p>This is an automated confirmation email.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AIForLawyers Demo Scheduler" <${process.env.EMAIL_USER}>`,
      to: process.env.SALES_EMAIL,
      subject: adminSubject,
      html: adminHtml,
    });

    await transporter.sendMail({
      from: `"AIForLawyers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: userSubject,
      html: userHtml,
    });

  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Failed to send demo scheduling emails', error);
  }
};

/**
 * Send workflow execution result email
 */
export const sendWorkflowEmail = async (to: string, subject: string, content: string): Promise<void> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0; padding: 0;">AI<span style="font-weight: 300;">LAWYER</span></h1>
        <p style="color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin-top: 5px;">Automation Result</p>
      </div>
      
      <div style="background-color: #fff; padding: 30px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="margin-top: 0; color: #333; font-size: 18px;">${subject}</h2>
        
        <div style="color: #555; line-height: 1.6; margin-top: 20px;">
          ${content}
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 12px;">This automation was triggered by your AIForLawyers Workflow.</p>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 11px;">
        <p>&copy; ${new Date().getFullYear()} AIForLawyers. All rights reserved.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AIForLawyers Automation" <${process.env.EMAIL_USER}>`,
      to,
      subject: `[Automation] ${subject}`,
      html,
    });
  } catch (error) {
    throw new ExternalServiceError('Nodemailer', 'Failed to send workflow result email', error);
  }
};

export default {
  sendPasswordResetEmail,
  sendContactFormEmail,
  sendCareerApplicationEmail,
  sendDemoSchedulingEmail,
  sendWorkflowEmail,
};