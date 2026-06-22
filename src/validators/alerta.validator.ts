/**
 * @fileoverview Esquemas Zod para validación de operaciones del módulo de alertas.
 * Define schemas para creación de alertas y cambios de estado, con validación
 * de coordenadas GeoJSON y UUIDs.
 */

import { z } from 'zod';
import { EstadoAlerta } from '../models/alerta.model';

/**
 * Esquema para validar la creación de una alerta.
 * Requiere descripción (10-500 caracteres) y ubicación en formato GeoJSON Point.
 */
export const crearAlertaSchema = z.object({
    body: z.object({
        descripcion: z
            .string({ message: 'La descripción es obligatoria y debe ser texto.' })
            .min(10, 'La descripción debe tener al menos 10 caracteres para ser útil.')
            .max(500, 'La descripción es demasiado larga (máximo 500 caracteres).'),

        ubicacion: z.object(
            {
                type: z.literal('Point', { message: 'El tipo debe ser exactamente "Point".' }),
                coordinates: z.tuple([
                    z
                        .number({ message: 'La longitud debe ser un número.' })
                        .refine((v) => !isNaN(v), { message: 'La longitud no puede ser NaN.' })
                        .min(-180)
                        .max(180, 'Longitud inválida.'),
                    z
                        .number({ message: 'La latitud debe ser un número.' })
                        .refine((v) => !isNaN(v), { message: 'La latitud no puede ser NaN.' })
                        .min(-90)
                        .max(90, 'Latitud inválida.'),
                ]),
            },
            {
                message:
                    'La ubicación en formato GeoJSON (Point) es obligatoria y debe tener coordenadas válidas.',
            },
        ),
    }),
});

/**
 * Esquema para validar el cambio de estado de una alerta.
 * Recibe un UUID por parámetro y un estado válido del enum EstadoAlerta.
 */
export const cambiarEstadoSchema = z.object({
    params: z.object({
        id: z
            .string({ message: 'El ID es obligatorio.' })
            .uuid('El ID de la alerta debe ser un UUID válido.'),
    }),
    body: z.object({
        estado: z.nativeEnum(EstadoAlerta, {
            message: 'El estado proporcionado no es válido (Ej: EN_PROCESO, RESUELTA, etc).',
        }),
    }),
});
