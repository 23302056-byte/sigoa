/**
 * REGLAS DE NEGOCIO DE SIGOA
 * Qué combinaciones de estado, avance y fechas son válidas para proyectos y obras.
 * Las usan los formularios de Proyectos y de Obras para no guardar datos incoherentes
 * (por ejemplo: un proyecto "Completado" sin obras, o una obra "Pendiente" con 40 % de avance).
 */

/** Estados como los devuelve y acepta la API de proyectos */
export const ESTADOS_PROYECTO = ['Pendiente', 'En proceso', 'Pausado', 'Completado', 'Cancelado'];

/** Estados válidos de una obra en la base de datos */
export const ESTADOS_OBRA = ['Pendiente', 'En construccion', 'Pausada', 'Finalizada', 'Cancelada'];

/** Estados de proyecto que exigen arquitecto y fechas */
const PROYECTO_ACTIVO = ['En proceso', 'Pausado', 'Completado'];

/** Estados de obra que exigen fecha de inicio */
const OBRA_INICIADA = ['En construccion', 'Pausada', 'Finalizada'];

export interface ObraResumen {
  estado: string;
  porcentaje_avance: number;
}

export interface ProyectoAValidar {
  id: number | null;
  id_cliente: number | null;
  id_arquitecto: number | null;
  nombre: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface ObraAValidar {
  id_proyecto: number | null;
  nombre: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin_estimada: string;
  fecha_fin_real: string;
  porcentaje_avance: number;
}

/** Fecha de hoy como "2026-10-17" (hora local) */
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =========================================================
// PROYECTOS
// =========================================================

/**
 * Motivo por el que un estado NO se puede elegir para el proyecto.
 * Devuelve '' cuando el estado sí está permitido.
 */
export function motivoEstadoProyecto(estado: string, esNuevo: boolean, obras: ObraResumen[]): string {
  if (esNuevo && !['Pendiente', 'En proceso'].includes(estado)) {
    return 'solo al editar';
  }
  if (estado === 'Completado') {
    const vigentes = obras.filter((o) => o.estado !== 'Cancelada');
    if (!vigentes.length) return 'necesita obras finalizadas';
    if (vigentes.some((o) => o.estado !== 'Finalizada')) return 'aún hay obras sin terminar';
  }
  return '';
}

/** Valida el formulario de proyecto. Devuelve el mensaje de error o null si todo está bien. */
export function validarProyecto(p: ProyectoAValidar, obras: ObraResumen[]): string | null {
  if (p.nombre.trim().length < 3) return 'El nombre del proyecto debe tener al menos 3 caracteres.';
  if (!p.id_cliente) return 'Selecciona el cliente del proyecto.';

  const motivo = motivoEstadoProyecto(p.estado, !p.id, obras);
  if (motivo) return `No se puede marcar como "${p.estado}": ${motivo}.`;

  if (PROYECTO_ACTIVO.includes(p.estado)) {
    if (!p.id_arquitecto) return `Un proyecto "${p.estado}" necesita un arquitecto responsable.`;
    if (!p.fecha_inicio) return 'Indica la fecha de inicio del proyecto.';
    if (!p.fecha_fin) return 'Indica la fecha de entrega estimada del proyecto.';
  }
  if (p.fecha_inicio && p.fecha_fin && p.fecha_fin < p.fecha_inicio) {
    return 'La fecha de entrega no puede ser antes del inicio.';
  }
  return null;
}

// =========================================================
// OBRAS
// =========================================================

/** Valida el formulario de obra. Devuelve el mensaje de error o null si todo está bien. */
export function validarObra(o: ObraAValidar): string | null {
  const avance = Number(o.porcentaje_avance);

  if (!o.id_proyecto) return 'Selecciona el proyecto de la obra.';
  if (o.nombre.trim().length < 3) return 'El nombre de la obra debe tener al menos 3 caracteres.';
  if (!Number.isFinite(avance) || avance < 0 || avance > 100) return 'El avance debe estar entre 0 y 100.';

  if (o.estado === 'Pendiente' && avance > 0) {
    return 'Una obra pendiente no puede tener avance. Cámbiala a "En construcción".';
  }
  if (o.estado === 'Finalizada' && avance < 100) return 'Una obra finalizada debe tener 100 % de avance.';
  if (avance === 100 && !['Finalizada', 'Cancelada'].includes(o.estado)) {
    return 'Con 100 % de avance, marca la obra como "Finalizada".';
  }

  if (OBRA_INICIADA.includes(o.estado) && !o.fecha_inicio) return 'Indica la fecha de inicio de la obra.';
  if (o.fecha_inicio && o.fecha_fin_estimada && o.fecha_fin_estimada < o.fecha_inicio) {
    return 'La entrega estimada no puede ser antes del inicio.';
  }
  if (o.estado === 'Finalizada' && !o.fecha_fin_real) return 'Indica la fecha real en que terminó la obra.';
  if (o.fecha_fin_real && o.fecha_inicio && o.fecha_fin_real < o.fecha_inicio) {
    return 'La fecha real de término no puede ser antes del inicio.';
  }
  return null;
}

/**
 * Ajusta solo el avance y la fecha real cuando cambia el estado de la obra,
 * para que el formulario se mantenga coherente mientras el usuario lo llena.
 */
export function ajustarObraPorEstado(o: ObraAValidar, estado: string): void {
  if (estado === 'Pendiente') o.porcentaje_avance = 0;
  if (estado === 'Finalizada') {
    o.porcentaje_avance = 100;
    if (!o.fecha_fin_real) o.fecha_fin_real = hoyISO();
  } else {
    o.fecha_fin_real = '';
  }
}
