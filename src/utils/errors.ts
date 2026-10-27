'use strict';

/**
 * Base error class for Pequi application
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        // Ensure the stack trace is captured correctly
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error for authentication and authorization issues
 */
export class AuthError extends AppError {
    constructor(message: string = 'Falha na autenticação') {
        super(message, 401);
    }
}

/**
 * Error for validation issues
 */
export class ValidationError extends AppError {
    public readonly errors?: any[];

    constructor(message: string = 'Falha na validação', errors?: any[]) {
        super(message, 400);
        this.errors = errors;
    }
}

/**
 * Error for not found resources
 */
export class NotFoundError extends AppError {
    constructor(resource: string = 'Recurso') {
        super(`${resource} não encontrado`, 404);
    }
}

/**
 * Error for external service failures (Stripe, AWS, Gemini, etc.)
 */
export class ExternalServiceError extends AppError {
    public readonly serviceName: string;
    public readonly originalError?: any;

    constructor(serviceName: string, message: string, originalError?: any) {
        super(`Erro no serviço ${serviceName}: ${message}`, 502);
        this.serviceName = serviceName;
        this.originalError = originalError;
    }
}

/**
 * Error for database operations
 */
export class DatabaseError extends AppError {
    constructor(message: string, isOperational: boolean = false) {
        super(`Erro no banco de dados: ${message}`, 500, isOperational);
    }
}
