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


// =========================================================
// COTIZACIONES
// =========================================================

export const ESTADOS_COTIZACION = ['Borrador', 'Enviada', 'Aceptada', 'Rechazada', 'Vencida'];

export interface ConceptoAValidar {
  concepto: string;
  cantidad: number;
  precio_unitario: number;
}

export interface CotizacionResumen {
  id: number;
  id_proyecto: number;
  folio: string;
  estado: string;
}

export interface CotizacionAValidar {
  id: number | null;
  id_proyecto: number | null;
  folio: string;
  fecha: string;
  vigencia: string;
  estado: string;
  /** Estado con el que se abrió el formulario (null si es nueva) */
  estadoOriginal: string | null;
  porcentaje_iva: number;
  detalles: ConceptoAValidar[];
}

/** Redondeo a centavos, igual que el backend */
export function centavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Una cotización aceptada ya no cambia sus montos (es la base del contrato) */
export function conceptosBloqueados(estadoOriginal: string | null): boolean {
  return estadoOriginal === 'Aceptada';
}

/**
 * Motivo por el que un estado NO se puede elegir para la cotización.
 * Devuelve '' cuando el estado sí está permitido.
 */
export function motivoEstadoCotizacion(
  c: Pick<CotizacionAValidar, 'id' | 'id_proyecto' | 'vigencia' | 'estadoOriginal'>,
  estado: string,
  todas: CotizacionResumen[]
): string {
  const hoy = hoyISO();
  if (!c.id && !['Borrador', 'Enviada'].includes(estado)) return 'solo al editar';
  if (estado === c.estadoOriginal) return '';

  if (estado === 'Vencida' && (!c.vigencia || c.vigencia >= hoy)) return 'la vigencia no ha pasado';
  if (estado === 'Enviada' && c.vigencia && c.vigencia < hoy) return 'actualiza la vigencia';
  if (estado === 'Aceptada') {
    if (c.vigencia && c.vigencia < hoy) return 'la vigencia ya pasó';
    const otraAceptada = todas.some((o) => o.id !== c.id && o.id_proyecto === c.id_proyecto && o.estado === 'Aceptada');
    if (otraAceptada) return 'el proyecto ya tiene una aceptada';
  }
  return '';
}

/** Valida el formulario de cotización. Devuelve el mensaje de error o null si todo está bien. */
export function validarCotizacion(c: CotizacionAValidar, todas: CotizacionResumen[]): string | null {
  const folio = c.folio.trim().toUpperCase();
  if (!c.id_proyecto) return 'Selecciona el proyecto de la cotización.';
  if (folio.length < 3) return 'Escribe el folio de la cotización (ej. COT-2026-003).';
  if (todas.some((o) => o.id !== c.id && o.folio.toUpperCase() === folio)) return `El folio ${folio} ya está registrado.`;
  if (!c.fecha) return 'Indica la fecha de la cotización.';
  if (c.vigencia && c.vigencia < c.fecha) return 'La vigencia no puede ser antes de la fecha de la cotización.';

  const iva = Number(c.porcentaje_iva);
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) return 'El IVA debe estar entre 0 y 100 %.';

  if (!c.detalles.length) return 'Agrega al menos un concepto.';
  for (const [i, d] of c.detalles.entries()) {
    const fila = `Concepto ${i + 1}`;
    if (!d.concepto.trim()) return `${fila}: escribe el nombre del concepto.`;
    if (!(Number(d.cantidad) > 0)) return `${fila}: la cantidad debe ser mayor a 0.`;
    if (!(Number(d.precio_unitario) >= 0)) return `${fila}: el precio no puede ser negativo.`;
  }

  if (c.estado !== 'Borrador' && !c.vigencia) return 'Indica hasta cuándo es válida la cotización.';
  const motivo = motivoEstadoCotizacion(c, c.estado, todas);
  if (motivo) return `No se puede marcar como "${c.estado}": ${motivo}.`;
  return null;
}


// =========================================================
// CONTRATOS
// =========================================================

export const ESTADOS_CONTRATO = ['Borrador', 'Activo', 'Finalizado', 'Cancelado'];

export interface ContratoResumen {
  id: number;
  id_proyecto: number;
  numero_contrato: string;
  estado: string;
}

export interface ContratoAValidar {
  id: number | null;
  id_proyecto: number | null;
  numero_contrato: string;
  fecha_firma: string;
  fecha_inicio: string;
  fecha_fin: string;
  monto: number;
  estado: string;
  /** Estado con el que se abrió el formulario (null si es nuevo) */
  estadoOriginal: string | null;
}

/**
 * Motivo por el que un estado NO se puede elegir para el contrato.
 * - Para activarlo, el proyecto debe tener una cotización aceptada.
 * - Solo puede haber un contrato activo por proyecto.
 * - "Finalizado" solo después de haber estado activo.
 * Devuelve '' cuando el estado sí está permitido.
 */
export function motivoEstadoContrato(
  c: Pick<ContratoAValidar, 'id' | 'id_proyecto' | 'estadoOriginal'>,
  estado: string,
  todos: ContratoResumen[],
  tieneCotizacionAceptada: boolean
): string {
  if (!c.id && !['Borrador', 'Activo'].includes(estado)) return 'solo al editar';
  if (estado === c.estadoOriginal) return '';

  if (estado === 'Activo') {
    if (!tieneCotizacionAceptada) return 'falta cotización aceptada';
    const otroActivo = todos.some((o) => o.id !== c.id && o.id_proyecto === c.id_proyecto && o.estado === 'Activo');
    if (otroActivo) return 'el proyecto ya tiene uno activo';
  }
  if (estado === 'Finalizado' && c.estadoOriginal !== 'Activo') return 'primero debe estar activo';
  return '';
}

/** Valida el formulario de contrato. Devuelve el mensaje de error o null si todo está bien. */
export function validarContrato(c: ContratoAValidar, todos: ContratoResumen[], tieneCotizacionAceptada: boolean): string | null {
  const numero = c.numero_contrato.trim().toUpperCase();
  const monto = Number(c.monto);

  if (!c.id_proyecto) return 'Selecciona el proyecto del contrato.';
  if (numero.length < 3) return 'Escribe el número de contrato (ej. CTR-2026-003).';
  if (todos.some((o) => o.id !== c.id && o.numero_contrato.toUpperCase() === numero)) return `El contrato ${numero} ya está registrado.`;
  if (!Number.isFinite(monto) || monto < 0) return 'El monto no puede ser negativo.';

  const motivo = motivoEstadoContrato(c, c.estado, todos, tieneCotizacionAceptada);
  if (motivo) return `No se puede marcar como "${c.estado}": ${motivo}.`;

  if (['Activo', 'Finalizado'].includes(c.estado)) {
    if (!(monto > 0)) return 'Un contrato activo necesita un monto mayor a 0.';
    if (!c.fecha_firma) return 'Indica la fecha en que se firmó el contrato.';
    if (!c.fecha_inicio) return 'Indica la fecha de inicio de los trabajos.';
    if (!c.fecha_fin) return 'Indica la fecha de terminación de los trabajos.';
  }
  if (c.fecha_firma && c.fecha_inicio && c.fecha_inicio < c.fecha_firma) {
    return 'Los trabajos no pueden iniciar antes de firmar el contrato.';
  }
  if (c.fecha_inicio && c.fecha_fin && c.fecha_fin < c.fecha_inicio) {
    return 'La fecha de terminación no puede ser antes del inicio.';
  }
  return null;
}