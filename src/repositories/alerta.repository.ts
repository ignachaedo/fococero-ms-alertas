/**
 * @fileoverview Repositorio de alertas con PostGIS.
 * Aísla la lógica de acceso a datos (PostgreSQL/PostGIS) de la capa de negocio,
 * garantizando un contrato estricto de entrada y salida con consultas espaciales.
 */

import { pool } from '../config/database';
import { IAlerta, EstadoAlerta } from '../models/alerta.model';

/**
 * Repositorio de alertas. Implementa patrón Repository con operaciones
 * de creación, consultas espaciales (cercanía), actualización de estado
 * y borrado lógico (soft delete).
 */
export class AlertaRepository {
    // ============================================================================
    // 🟢 CREACIÓN
    // ============================================================================
    /**
     * Crea una nueva alerta con ubicación GeoJSON convertida a PostGIS.
     *
     * @param alerta - Objeto IAlerta con datos de la alerta (tipo, gravedad, descripción, coordenadas)
     * @returns La alerta creada con coordenadas separadas (lng, lat)
     */
    static async crear(alerta: IAlerta): Promise<IAlerta> {
        const { foco_id, usuario_id, tipo, gravedad, descripcion, imagenes, ubicacion, metadata } =
            alerta;
        const lng = ubicacion.coordinates[0];
        const lat = ubicacion.coordinates[1];

        const query = `
            INSERT INTO alertas (
                foco_id, usuario_id, tipo, gravedad, descripcion, 
                imagenes, ubicacion, metadata
            ) 
            VALUES (
                $1, $2, $3::tipo_alerta, $4::gravedad_alerta, $5, 
                $6::text[], ST_SetSRID(ST_MakePoint($7, $8), 4326), $9::jsonb
            )
            RETURNING id, foco_id, usuario_id, tipo, gravedad, estado, descripcion, imagenes,
                ST_X(ubicacion::geometry) as lng, ST_Y(ubicacion::geometry) as lat,
                metadata, fecha_creacion, fecha_actualizacion, eliminado_en;
        `;

        const valores = [
            foco_id || null,
            usuario_id,
            tipo,
            gravedad,
            descripcion,
            imagenes || [],
            lng,
            lat,
            metadata || {},
        ];

        const { rows } = await pool.query(query, valores);
        return this.mapearFilaAAlerta(rows[0]);
    }

    // ============================================================================
    // 🔵 LECTURA Y CONSULTAS (ESPACIALES Y RELACIONALES)
    // ============================================================================
    /**
     * Encuentra alertas dentro de un radio geográfico usando ST_DWithin.
     *
     * @param lng - Longitud del punto central
     * @param lat - Latitud del punto central
     * @param radioMetros - Radio de búsqueda en metros
     * @returns Array de alertas cercanas (excluye eliminadas)
     */
    static async encontrarCercanas(
        lng: number,
        lat: number,
        radioMetros: number,
    ): Promise<IAlerta[]> {
        const query = `
            SELECT id, foco_id, usuario_id, tipo, gravedad, estado, descripcion, imagenes,
                ST_X(ubicacion::geometry) as lng, ST_Y(ubicacion::geometry) as lat,
                metadata, fecha_creacion, fecha_actualizacion, eliminado_en
            FROM alertas
            WHERE ST_DWithin(ubicacion::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
            AND eliminado_en IS NULL;
        `;
        const { rows } = await pool.query(query, [lng, lat, radioMetros]);
        return rows.map(this.mapearFilaAAlerta);
    }

    /**
     * Obtiene alertas creadas por un usuario específico.
     *
     * @param usuario_id - ID del usuario creador
     * @returns Array de alertas del usuario ordenadas por fecha descendente
     */
    static async obtenerPorUsuario(usuario_id: string): Promise<IAlerta[]> {
        const query = `
            SELECT id, foco_id, usuario_id, tipo, gravedad, estado, descripcion, imagenes,
                ST_X(ubicacion::geometry) as lng, ST_Y(ubicacion::geometry) as lat,
                metadata, fecha_creacion, fecha_actualizacion, eliminado_en
            FROM alertas 
            WHERE usuario_id = $1 AND eliminado_en IS NULL
            ORDER BY fecha_creacion DESC;
        `;
        const { rows } = await pool.query(query, [usuario_id]);
        return rows.map(this.mapearFilaAAlerta);
    }

    /**
     * Obtiene una alerta por su ID (excluye eliminadas).
     *
     * @param id - UUID de la alerta
     * @returns La alerta encontrada o null si no existe o fue eliminada
     */
    static async obtenerPorId(id: string): Promise<IAlerta | null> {
        const query = `
            SELECT id, foco_id, usuario_id, tipo, gravedad, estado, descripcion, imagenes,
                ST_X(ubicacion::geometry) as lng, ST_Y(ubicacion::geometry) as lat,
                metadata, fecha_creacion, fecha_actualizacion, eliminado_en
            FROM alertas 
            WHERE id = $1 AND eliminado_en IS NULL;
        `;
        const { rows } = await pool.query(query, [id]);
        return rows.length ? this.mapearFilaAAlerta(rows[0]) : null;
    }

    /**
     * Obtiene todas las alertas no eliminadas.
     *
     * @returns Array de alertas ordenadas por fecha de creación descendente
     */
    static async obtenerTodas(): Promise<IAlerta[]> {
        const query = `
            SELECT id, foco_id, usuario_id, tipo, gravedad, estado, descripcion, imagenes,
                ST_X(ubicacion::geometry) as lng, ST_Y(ubicacion::geometry) as lat,
                metadata, fecha_creacion, fecha_actualizacion, eliminado_en
            FROM alertas 
            WHERE eliminado_en IS NULL
            ORDER BY fecha_creacion DESC;
        `;
        const { rows } = await pool.query(query);
        return rows.map(this.mapearFilaAAlerta);
    }

    /**
     * Obtiene alertas públicas (estado DERIVADA) no eliminadas.
     *
     * @returns Array de alertas públicas ordenadas por fecha descendente
     */
    static async obtenerPublicas(): Promise<IAlerta[]> {
        const query = `
            SELECT id, foco_id, usuario_id, tipo, gravedad, estado, descripcion, imagenes,
                ST_X(ubicacion::geometry) as lng, ST_Y(ubicacion::geometry) as lat,
                metadata, fecha_creacion, fecha_actualizacion, eliminado_en
            FROM alertas 
            WHERE eliminado_en IS NULL
            AND estado = 'DERIVADA'
            ORDER BY fecha_creacion DESC;
        `;
        const { rows } = await pool.query(query);
        return rows.map(this.mapearFilaAAlerta);
    }

    // ============================================================================
    // 🟠 ACTUALIZACIÓN
    // ============================================================================
    /**
     * Actualiza el estado de una alerta.
     *
     * @param id - UUID de la alerta
     * @param nuevoEstado - Nuevo estado a asignar (del enum EstadoAlerta)
     * @returns La alerta actualizada o null si no existe o fue eliminada
     */
    static async actualizarEstado(id: string, nuevoEstado: EstadoAlerta): Promise<IAlerta | null> {
        const query = `
            UPDATE alertas SET estado = $1::estado_alerta
            WHERE id = $2 AND eliminado_en IS NULL
            RETURNING id, foco_id, usuario_id, tipo, gravedad, estado, descripcion, imagenes,
                ST_X(ubicacion::geometry) as lng, ST_Y(ubicacion::geometry) as lat,
                metadata, fecha_creacion, fecha_actualizacion, eliminado_en;
        `;
        const { rows } = await pool.query(query, [nuevoEstado, id]);
        return rows.length ? this.mapearFilaAAlerta(rows[0]) : null;
    }

    // ============================================================================
    // 🔴 BORRADO LÓGICO (Soft Delete)
    // ============================================================================
    /**
     * Realiza borrado lógico (soft delete) de una alerta marcando eliminado_en.
     *
     * @param id - UUID de la alerta a eliminar
     * @returns true si se marcó como eliminada, false si no existía
     */
    static async eliminar(id: string): Promise<boolean> {
        const query = `
            UPDATE alertas SET eliminado_en = NOW()
            WHERE id = $1 AND eliminado_en IS NULL;
        `;
        const { rowCount } = await pool.query(query, [id]);
        return (rowCount ?? 0) > 0;
    }

    // ============================================================================
    // 🛠️ HELPER PRIVADO (Frontera de Datos Blindada)
    // ============================================================================
    /**
     * Mapea una fila de base de datos a un objeto IAlerta.
     * Reconstruye el campo GeoJSON Point desde coordenadas separadas (lng, lat).
     *
     * @param fila - Fila obtenida de PostgreSQL
     * @returns Instancia de IAlerta
     */
    private static mapearFilaAAlerta(fila: Record<string, unknown>): IAlerta {
        return {
            id: fila.id as string,
            foco_id: fila.foco_id as string | undefined,
            usuario_id: fila.usuario_id as string,

            // Casteo estricto utilizando Indexed Access Types
            tipo: fila.tipo as IAlerta['tipo'],
            gravedad: fila.gravedad as IAlerta['gravedad'],
            estado: fila.estado as IAlerta['estado'],

            descripcion: fila.descripcion as string,
            imagenes: fila.imagenes as string[],

            // Reconstrucción del objeto GeoJSON Point desde las coordenadas separadas
            ubicacion: {
                type: 'Point',
                coordinates: [Number(fila.lng), Number(fila.lat)],
            },

            metadata: fila.metadata as Record<string, unknown> | undefined,
            fecha_creacion: fila.fecha_creacion as Date,
            fecha_actualizacion: fila.fecha_actualizacion as Date,
            eliminado_en: fila.eliminado_en as Date | undefined,
        };
    }
}
