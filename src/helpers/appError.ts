/**
 * @fileoverview Clase AppError para errores operativos de ms-alertas.
 * Estandariza las excepciones de la lógica de negocio con código HTTP
 * predecible para que el error.middleware lo procese sin casteos inseguros.
 */

/**
 * Error operativo personalizado. Distingue errores de negocio (isOperational = true)
 * de bugs de programación para logging selectivo en el manejador global.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // Diferencia errores de negocio de bugs de programación

        // Mantiene la traza de la pila limpia (V8 Engine)
        Error.captureStackTrace(this, this.constructor);
    }
}
