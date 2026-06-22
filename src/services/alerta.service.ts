/**
 * @fileoverview Servicio de gestión de alertas tácticas.
 * Coordina la creación, consulta, actualización y eliminación de alertas
 * de incendio, incluyendo la vinculación asíncrona de multimedia con
 * el microservicio ms-multimedia.
 */

import axios from 'axios';
import { AlertaRepository } from '../repositories/alerta.repository';
import { IAlerta, EstadoAlerta } from '../models/alerta.model';
import { AppError } from '../helpers/appError';
import { envs } from '../config/envs';
import { logger } from '../config/logger';

export class AlertaService {
    // 🟢 CREACIÓN
    /**
     * Crea una alerta táctica y vincula la multimedia asociada si el brigadista adjuntó una foto.
     *
     * @param data - Datos espaciales y de la alerta (ubicación, tipo, etc.)
     * @param id_multimedia - ID opcional de la imagen subida al ms-multimedia
     * @returns Alerta recién creada
     * @throws AppError(400) - Si las coordenadas son inválidas o faltantes
     */
    static async crearAlerta(data: IAlerta, id_multimedia?: string): Promise<IAlerta> {
        if (
            !data.ubicacion ||
            !data.ubicacion.coordinates ||
            data.ubicacion.coordinates.length !== 2
        ) {
            throw new AppError('Las coordenadas [longitud, latitud] son obligatorias.', 400);
        }

        // 1. Guardamos la alerta en la base de datos local
        const nuevaAlerta = await AlertaRepository.crear(data);

        // 2. Si hay evidencia fotográfica, notificamos al ms-multimedia para que la adopte
        if (id_multimedia && nuevaAlerta.id) {
            // Fire and forget: asíncrono para no bloquear la respuesta rápida de la alerta
            this.vincularMultimedia(id_multimedia, data.usuario_id, nuevaAlerta.id);
        }

        return nuevaAlerta;
    }

    /**
     * Comunicación interna (Inter-Service): Llama al ms-multimedia para vincular la foto.
     *
     * @description Fire-and-forget: no bloquea la respuesta al usuario.
     * Usa el token interno de seguridad para autenticación entre microservicios.
     *
     * @param id_multimedia - ID del archivo multimedia a vincular
     * @param userId - ID del usuario que creó la alerta
     * @param alertaId - ID de la alerta a la que vincular la multimedia
     */
    private static async vincularMultimedia(
        id_multimedia: string,
        userId: string,
        alertaId: string,
    ) {
        try {
            const url = `${envs.MULTIMEDIA_SERVICE_URL}/api/v1/multimedia/${id_multimedia}/vincular`;

            await axios.patch(
                url,
                {},
                {
                    headers: {
                        'x-internal-token': envs.INTERNAL_SECRET_TOKEN,
                        'x-internal-call': 'ms-alertas',
                        'x-user-id': userId,
                    },
                },
            );

            logger.info(
                `✅ Imagen ${id_multimedia} vinculada exitosamente a la alerta ${alertaId}`,
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            logger.error(`⚠️ Error vinculando multimedia ${id_multimedia}: ${errorMessage}`);
        }
    }

    // 🔵 LECTURA ESPACIAL Y CONSULTAS
    /**
     * Obtiene alertas públicas visibles para todos los usuarios.
     *
     * @returns Lista de alertas públicas
     */
    static async obtenerPublicas(): Promise<IAlerta[]> {
        return await AlertaRepository.obtenerPublicas();
    }

    /**
     * Obtiene alertas cercanas a una ubicación geográfica.
     *
     * @param lng - Longitud del punto de referencia
     * @param lat - Latitud del punto de referencia
     * @param radioMetros - Radio de búsqueda en metros (máximo 50.000, default 5.000)
     * @returns Lista de alertas dentro del radio
     * @throws AppError(400) - Si el radio supera los 50.000 metros
     */
    static async obtenerCercanas(
        lng: number,
        lat: number,
        radioMetros: number = 5000,
    ): Promise<IAlerta[]> {
        if (radioMetros > 50000) {
            throw new AppError(
                'El radio de búsqueda no puede superar los 50.000 metros por rendimiento.',
                400,
            );
        }
        return await AlertaRepository.encontrarCercanas(lng, lat, radioMetros);
    }

    /**
     * Obtiene alertas creadas por un usuario específico.
     *
     * @param usuario_id - ID del usuario creador
     * @returns Lista de alertas del usuario
     */
    static async obtenerPorUsuario(usuario_id: string): Promise<IAlerta[]> {
        return await AlertaRepository.obtenerPorUsuario(usuario_id);
    }

    /**
     * Obtiene una alerta por su ID.
     *
     * @param id - Identificador único de la alerta
     * @returns Alerta encontrada
     * @throws AppError(404) - Si la alerta no existe
     */
    static async obtenerPorId(id: string): Promise<IAlerta> {
        const alerta = await AlertaRepository.obtenerPorId(id);
        if (!alerta) {
            throw new AppError('La alerta solicitada no existe o fue eliminada.', 404);
        }
        return alerta;
    }

    /**
     * Obtiene todas las alertas registradas.
     *
     * @returns Lista completa de alertas
     */
    static async obtenerTodas(): Promise<IAlerta[]> {
        return await AlertaRepository.obtenerTodas();
    }

    // 🟠 ACTUALIZACIÓN OPERATIVA
    /**
     * Cambia el estado operativo de una alerta.
     *
     * @param id - Identificador único de la alerta
     * @param nuevoEstado - Nuevo estado (EstadoAlerta: ACTIVA, DERIVADA, DESCARTADA, etc.)
     * @returns Alerta actualizada
     * @throws AppError(404) - Si la alerta no existe
     */
    static async cambiarEstado(id: string, nuevoEstado: EstadoAlerta): Promise<IAlerta> {
        const actualizada = await AlertaRepository.actualizarEstado(id, nuevoEstado);
        if (!actualizada) {
            throw new AppError('Alerta no encontrada o ya fue descartada.', 404);
        }
        return actualizada;
    }

    /**
     * Verifica una alerta confirmando o descartando la presencia de fuego.
     *
     * @param id - Identificador único de la alerta
     * @param esFuegoConfirmado - true si se confirma fuego, false si es falsa alarma
     * @returns Alerta con estado actualizado a DERIVADA o DESCARTADA
     */
    static async verificarAlerta(id: string, esFuegoConfirmado: boolean): Promise<IAlerta> {
        const nuevoEstado = esFuegoConfirmado ? EstadoAlerta.DERIVADA : EstadoAlerta.DESCARTADA;
        return await this.cambiarEstado(id, nuevoEstado);
    }

    // 🔴 ELIMINACIÓN LÓGICA (SOFT DELETE)
    /**
     * Elimina (soft delete) una alerta del sistema.
     *
     * @param id - Identificador único de la alerta a eliminar
     * @throws AppError(404) - Si la alerta no existe o ya fue eliminada
     */
    static async eliminar(id: string): Promise<void> {
        const fueEliminado = await AlertaRepository.eliminar(id);
        if (!fueEliminado) {
            throw new AppError('No se pudo eliminar la alerta. Verifique que exista.', 404);
        }
    }
}
