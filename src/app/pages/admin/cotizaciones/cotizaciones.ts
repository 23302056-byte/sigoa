import { afterNextRender, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { timeout } from 'rxjs';

interface DetalleCotizacion {
  id: number;
  concepto: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  importe: number;
}

interface Cotizacion {
  id: number;
  id_proyecto: number;
  proyecto: string;
  cliente: string;
  folio: string;
  fecha: string;
  vigencia: string;
  subtotal: number;
  iva: number;
  total: number;
  estado: string;
  observaciones: string;
  detalles: DetalleCotizacion[];
}

interface ProyectoOpcion { id: number; nombre: string; }
interface RespuestaCotizaciones {
  success: boolean;
  mensaje?: string;
  cotizaciones?: Cotizacion[];
  cotizacion?: Cotizacion;
  proyectos?: ProyectoOpcion[];
}

@Component({
  selector: 'app-cotizaciones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cotizaciones.html',
  styleUrl: './cotizaciones.css'
})
export class Cotizaciones implements OnDestroy {
  private readonly API_URL = 'http://localhost:3000/api/routes/cotizaciones';
  private readonly nombreDB = 'SIGOA_COTIZACIONES_CACHE';
  private readonly store = 'cotizaciones';
  private dbOffline: IDBDatabase | null = null;

  cotizaciones: Cotizacion[] = [];
  cotizacionesFiltradas: Cotizacion[] = [];
  proyectos: ProyectoOpcion[] = [];
  estados = ['Borrador', 'Enviada', 'Aceptada', 'Rechazada', 'Vencida'];
  cargando = true;
  errorCarga = '';
  busqueda = '';
  conectado = false;
  mostrarModal = false;
  modoEdicion = false;
  creandoCotizacion = false;
  porcentajeIva = 16;
  guardando = false;
  idProyectoFiltro = 0;
  proyectoFiltro = '';
  cotizacionSeleccionada: Cotizacion = this.cotizacionVacia();

  constructor(private http: HttpClient, private changeDetector: ChangeDetectorRef, private route: ActivatedRoute, private router: Router) {
    this.idProyectoFiltro = Number(this.route.snapshot.queryParamMap.get('id_proyecto')) || 0;
    this.proyectoFiltro = this.route.snapshot.queryParamMap.get('proyecto') || '';
    // El componente tambiÃ©n se prerenderiza en el servidor. Inicia las
    // peticiones cuando ya existe el render del navegador y puede usar IndexedDB.
    afterNextRender(() => this.inicializarEnNavegador());
  }

  get proyectosDisponibles(): ProyectoOpcion[] {
    return this.idProyectoFiltro ? this.proyectos.filter(proyecto => proyecto.id === this.idProyectoFiltro) : this.proyectos;
  }

  volverAProyecto(): void { this.router.navigate(['/admin/proyectos']); }

  private inicializarEnNavegador(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    this.conectado = navigator.onLine;
    window.addEventListener('online', this.cuandoHayInternet);
    window.addEventListener('offline', this.cuandoNoHayInternet);
    this.cargarCotizaciones();
    if (navigator.onLine) this.cargarProyectos();
    this.abrirCache().then(() => {
      if (this.cotizaciones.length) this.guardarCache();
      else this.cargarCache();
    }).catch(error => {
      console.error('No se pudo abrir la cachÃ© offline de cotizaciones:', error);
      if (!this.cotizaciones.length && !this.errorCarga) {
        this.errorCarga = 'No se pudo abrir el almacenamiento local.';
        this.cargando = false;
        this.changeDetector.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.cuandoHayInternet);
      window.removeEventListener('offline', this.cuandoNoHayInternet);
    }
    this.dbOffline?.close();
  }

  private cuandoHayInternet = (): void => {
    this.conectado = true;
    this.cargarCotizaciones();
    this.cargarProyectos();
    this.changeDetector.detectChanges();
  };

  private cuandoNoHayInternet = (): void => {
    this.conectado = false;
    this.cargarCache();
    this.changeDetector.detectChanges();
  };

  private abrirCache(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) return reject(new Error('IndexedDB no estÃ¡ disponible'));
      const request = window.indexedDB.open(this.nombreDB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.store)) request.result.createObjectStore(this.store);
      };
      request.onsuccess = () => { this.dbOffline = request.result; resolve(); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('La base local estÃ¡ bloqueada por otra pestaÃ±a'));
    });
  }

  private guardarCache(): void {
    if (this.dbOffline) this.dbOffline.transaction(this.store, 'readwrite').objectStore(this.store).put(this.cotizaciones, 'lista');
  }

  private cargarCache(): void {
    if (!this.dbOffline) {
      this.cargando = false;
      this.errorCarga = 'No hay almacenamiento local disponible.';
      return;
    }
    const request = this.dbOffline.transaction(this.store, 'readonly').objectStore(this.store).get('lista');
    request.onsuccess = () => {
      if (Array.isArray(request.result)) {
        this.cotizaciones = request.result;
        this.filtrar();
        this.errorCarga = '';
      } else {
        this.cotizaciones = [];
        this.cotizacionesFiltradas = [];
        this.errorCarga = 'No hay cotizaciones guardadas para consultar sin conexiÃ³n.';
      }
      this.cargando = false;
      this.changeDetector.detectChanges();
    };
    request.onerror = () => {
      this.cargando = false;
      this.errorCarga = 'No se pudieron leer las cotizaciones guardadas.';
      this.changeDetector.detectChanges();
    };
  }

  cargarCotizaciones(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.http.get<RespuestaCotizaciones>(this.API_URL).pipe(timeout(10000)).subscribe({
      next: respuesta => {
        this.conectado = navigator.onLine;
        if (respuesta.success) {
          this.cotizaciones = (respuesta.cotizaciones || []).map(cotizacion => this.normalizarCotizacion(cotizacion));
          this.filtrar();
          this.guardarCache();
        } else this.errorCarga = respuesta.mensaje || 'No se pudieron cargar las cotizaciones.';
        this.cargando = false;
        this.changeDetector.detectChanges();
      },
      error: error => {
        console.error('Error al cargar cotizaciones:', error);
        this.conectado = false;
        this.errorCarga = error.error?.mensaje || 'No se pudieron cargar las cotizaciones.';
        this.cargando = false;
        this.cargarCache();
      }
    });
  }

  private cargarProyectos(): void {
    this.http.get<RespuestaCotizaciones>(`${this.API_URL}/opciones`).subscribe({
      next: respuesta => this.proyectos = respuesta.proyectos || [],
      error: error => console.error('Error al cargar proyectos para cotizaciones:', error)
    });
  }

  private normalizarCotizacion(cotizacion: any): Cotizacion {
    return {
      id: Number(cotizacion.id ?? cotizacion.id_cotizacion),
      id_proyecto: Number(cotizacion.id_proyecto),
      proyecto: cotizacion.proyecto || '',
      cliente: cotizacion.cliente || '',
      folio: cotizacion.folio || '',
      fecha: this.fechaInput(cotizacion.fecha),
      vigencia: this.fechaInput(cotizacion.vigencia),
      subtotal: Number(cotizacion.subtotal || 0),
      iva: Number(cotizacion.iva || 0),
      total: Number(cotizacion.total || 0),
      estado: cotizacion.estado || 'Borrador',
      observaciones: cotizacion.observaciones || '',
      detalles: (cotizacion.detalles || []).map((detalle: any) => ({
        ...detalle,
        cantidad: Number(detalle.cantidad || 0),
        precio_unitario: Number(detalle.precio_unitario || 0),
        importe: Number(detalle.importe || 0)
      }))
    };
  }

  private fechaInput(fecha: any): string {
    if (!fecha) return '';
    if (fecha instanceof Date) {
      const year = fecha.getFullYear();
      const month = String(fecha.getMonth() + 1).padStart(2, '0');
      const day = String(fecha.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(fecha).substring(0, 10);
  }

  filtrar(): void {
    const texto = this.busqueda.toLowerCase().trim();
    this.cotizacionesFiltradas = this.cotizaciones.filter(c =>
      (!this.idProyectoFiltro || c.id_proyecto === this.idProyectoFiltro) &&
      (!texto || [c.folio, c.proyecto, c.cliente, c.estado].some(valor => (valor || '').toLowerCase().includes(texto)))
    );
  }

  verCotizacion(cotizacion: Cotizacion): void {
    this.cotizacionSeleccionada = { ...cotizacion, detalles: [...cotizacion.detalles] };
    this.modoEdicion = false;
    this.creandoCotizacion = false;
    this.mostrarModal = true;
  }

  nuevaCotizacion(): void {
    if (!this.conectado) {
      alert('ConÃ©ctate a internet para crear cotizaciones.');
      return;
    }
    this.cotizacionSeleccionada = {
      ...this.cotizacionVacia(),
      id_proyecto: this.idProyectoFiltro,
      folio: `COT-${Date.now()}`,
      fecha: new Date().toISOString().substring(0, 10),
      detalles: [this.detalleVacio()]
    };
    this.porcentajeIva = 16;
    this.modoEdicion = true;
    this.creandoCotizacion = true;
    this.mostrarModal = true;
    this.cargarProyectos();
  }

  agregarDetalle(): void {
    this.cotizacionSeleccionada.detalles.push(this.detalleVacio());
  }

  quitarDetalle(indice: number): void {
    if (this.cotizacionSeleccionada.detalles.length <= 1) return;
    this.cotizacionSeleccionada.detalles.splice(indice, 1);
    this.calcularTotales();
  }

  calcularTotales(): void {
    const detalles = this.cotizacionSeleccionada.detalles;
    for (const detalle of detalles) {
      detalle.importe = this.redondear(Number(detalle.cantidad || 0) * Number(detalle.precio_unitario || 0));
    }
    this.cotizacionSeleccionada.subtotal = this.redondear(detalles.reduce((suma, detalle) => suma + detalle.importe, 0));
    this.cotizacionSeleccionada.iva = this.redondear(this.cotizacionSeleccionada.subtotal * (Number(this.porcentajeIva) || 0) / 100);
    this.cotizacionSeleccionada.total = this.redondear(this.cotizacionSeleccionada.subtotal + this.cotizacionSeleccionada.iva);
  }

  private redondear(valor: number): number { return Math.round((valor + Number.EPSILON) * 100) / 100; }

  private detalleVacio(): DetalleCotizacion {
    return { id: 0, concepto: '', descripcion: '', cantidad: 1, unidad: 'Pieza', precio_unitario: 0, importe: 0 };
  }

  editarCotizacion(cotizacion: Cotizacion): void {
    if (!this.conectado) {
      alert('No tienes conexiÃ³n a internet. No se puede editar la cotizaciÃ³n.');
      return;
    }
    this.cotizacionSeleccionada = { ...cotizacion, detalles: [...cotizacion.detalles] };
    this.modoEdicion = true;
    this.creandoCotizacion = false;
    this.mostrarModal = true;
    this.cargarProyectos();
  }

  guardarCambios(): void {
    if (!this.conectado) {
      alert('No tienes conexiÃ³n a internet. No se pueden guardar los cambios.');
      return;
    }
    if (this.guardando) return;
    const c = this.cotizacionSeleccionada;
    const fueCreacion = this.creandoCotizacion;
    if (!c.id_proyecto || !c.folio.trim() || !c.fecha) {
      alert('El proyecto, el folio y la fecha son obligatorios.');
      return;
    }
    if (fueCreacion) {
      const detallesInvalidos = c.detalles.some(detalle => !detalle.concepto.trim() || !Number.isFinite(Number(detalle.cantidad)) || Number(detalle.cantidad) <= 0 || !Number.isFinite(Number(detalle.precio_unitario)) || Number(detalle.precio_unitario) < 0);
      if (!c.detalles.length || detallesInvalidos) {
        alert('Agrega al menos un concepto y revisa que cantidad y precio sean vÃ¡lidos.');
        return;
      }
      this.calcularTotales();
    }
    this.guardando = true;
    const datos = fueCreacion ? {
      id_proyecto: c.id_proyecto,
      folio: c.folio.trim(),
      fecha: c.fecha,
      vigencia: c.vigencia || null,
      estado: c.estado,
      observaciones: c.observaciones,
      porcentaje_iva: this.porcentajeIva,
      detalles: c.detalles.map(({ concepto, descripcion, cantidad, unidad, precio_unitario }) => ({ concepto, descripcion, cantidad, unidad, precio_unitario }))
    } : {
      id_proyecto: c.id_proyecto,
      folio: c.folio.trim(),
      fecha: c.fecha,
      vigencia: c.vigencia || null,
      estado: c.estado,
      observaciones: c.observaciones
    };
    const solicitud = fueCreacion
      ? this.http.post<RespuestaCotizaciones>(this.API_URL, datos)
      : this.http.put<RespuestaCotizaciones>(`${this.API_URL}/${c.id}`, datos);
    solicitud.subscribe({
      next: respuesta => {
        this.guardando = false;
        if (respuesta.success) {
          this.mostrarModal = false;
          this.creandoCotizacion = false;
          this.cotizacionSeleccionada = this.cotizacionVacia();
          this.cargarCotizaciones();
          alert(respuesta.mensaje || (fueCreacion ? 'Cotización creada correctamente.' : 'Cotización actualizada correctamente.'));
        } else alert(respuesta.mensaje || 'No se pudo actualizar la cotizaciÃ³n.');
        this.changeDetector.detectChanges();
      },
      error: error => {
        this.guardando = false;
        if (error.status === 0) this.conectado = false;
        alert(error.error?.mensaje || 'No se pudo actualizar la cotizaciÃ³n.');
        this.changeDetector.detectChanges();
      }
    });
  }

  eliminarCotizacion(cotizacion: Cotizacion): void {
    if (!this.conectado) {
      alert('No tienes conexiÃ³n a internet. No se puede eliminar la cotizaciÃ³n.');
      return;
    }
    if (!confirm(`Â¿Seguro que deseas eliminar la cotizaciÃ³n "${cotizacion.folio}"?`)) return;
    this.http.delete<RespuestaCotizaciones>(`${this.API_URL}/${cotizacion.id}`).subscribe({
      next: respuesta => {
        if (respuesta.success) {
          alert('CotizaciÃ³n eliminada correctamente.');
          this.cargarCotizaciones();
        } else alert(respuesta.mensaje || 'No se pudo eliminar la cotizaciÃ³n.');
      },
      error: error => {
        if (error.status === 0) this.conectado = false;
        alert(error.error?.mensaje || 'No se pudo eliminar la cotizaciÃ³n.');
        this.changeDetector.detectChanges();
      }
    });
  }

  formatoMoneda(valor: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor || 0);
  }

  descargarPdf(cotizacion: Cotizacion = this.cotizacionSeleccionada): void {
    if (typeof window === 'undefined') return;

    const entidades: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    };
    const escapar = (valor: unknown): string => String(valor ?? '').replace(/[&<>"']/g, caracter => entidades[caracter] || caracter);
    const fechaLegible = (fecha: string): string => {
      if (!fecha) return 'â€”';
      const parsed = new Date(`${fecha.substring(0, 10)}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? escapar(fecha) : parsed.toLocaleDateString('es-MX');
    };
    const filas = cotizacion.detalles.map(detalle => `
      <tr>
        <td>${escapar(detalle.concepto)}${detalle.descripcion ? `<small>${escapar(detalle.descripcion)}</small>` : ''}</td>
        <td>${escapar(detalle.cantidad)} ${escapar(detalle.unidad)}</td>
        <td>${escapar(this.formatoMoneda(detalle.precio_unitario))}</td>
        <td>${escapar(this.formatoMoneda(detalle.importe))}</td>
      </tr>`).join('');

    const documento = `<!doctype html>
      <html lang="es"><head><meta charset="utf-8"><title>CotizaciÃ³n ${escapar(cotizacion.folio)}</title>
      <style>
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#161616;margin:36px}
        header{border-bottom:4px solid #FAC82B;padding-bottom:16px;margin-bottom:24px}
        h1{font-size:26px;margin:0 0 6px}h2{font-size:18px;margin:26px 0 10px}
        .folio{color:#878787;font-size:13px}.datos{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px}
        .dato small{display:block;color:#878787;text-transform:uppercase;font-size:10px;margin-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
        th,td{padding:10px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
        th{background:#f5f5f5;color:#555;font-size:10px;text-transform:uppercase}
        td small{display:block;color:#878787;margin-top:4px}.montos{width:260px;margin:18px 0 0 auto}
        .monto{display:flex;justify-content:space-between;padding:6px 0}.total{border-top:3px solid #FAC82B;font-size:17px;font-weight:bold;margin-top:4px;padding-top:10px}
        .observaciones{white-space:pre-wrap;color:#555;font-size:13px}
        @media print{body{margin:18mm}tr{break-inside:avoid}}
      </style></head><body>
      <header><span class="folio">COTIZACIÃ“N Â· ${escapar(cotizacion.folio)}</span><h1>${escapar(cotizacion.proyecto)}</h1><div>${escapar(cotizacion.cliente)}</div></header>
      <section class="datos">
        <div class="dato"><small>Fecha</small>${fechaLegible(cotizacion.fecha)}</div>
        <div class="dato"><small>Vigencia</small>${fechaLegible(cotizacion.vigencia)}</div>
        <div class="dato"><small>Estado</small>${escapar(cotizacion.estado)}</div>
      </section>
      <h2>Conceptos</h2>
      <table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Precio unitario</th><th>Importe</th></tr></thead><tbody>
        ${filas || '<tr><td colspan="4">No hay conceptos registrados.</td></tr>'}
      </tbody></table>
      <div class="montos">
        <div class="monto"><span>Subtotal</span><span>${escapar(this.formatoMoneda(cotizacion.subtotal))}</span></div>
        <div class="monto"><span>IVA</span><span>${escapar(this.formatoMoneda(cotizacion.iva))}</span></div>
        <div class="monto total"><span>Total</span><span>${escapar(this.formatoMoneda(cotizacion.total))}</span></div>
      </div>
      ${cotizacion.observaciones ? `<h2>Observaciones</h2><p class="observaciones">${escapar(cotizacion.observaciones)}</p>` : ''}
      </body></html>`;

    const ventana = window.open('', '_blank', 'width=900,height=700');
    if (!ventana) {
      alert('Permite las ventanas emergentes para generar el PDF.');
      return;
    }
    ventana.document.open();
    ventana.document.write(documento);
    ventana.document.close();
    window.setTimeout(() => {
      if (ventana.closed) return;
      ventana.focus();
      ventana.print();
    }, 250);
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.modoEdicion = false;
    this.creandoCotizacion = false;
    this.cotizacionSeleccionada = this.cotizacionVacia();
  }

  private cotizacionVacia(): Cotizacion {
    return {
      id: 0, id_proyecto: 0, proyecto: '', cliente: '', folio: '', fecha: '', vigencia: '',
      subtotal: 0, iva: 0, total: 0, estado: 'Borrador', observaciones: '', detalles: []
    };
  }
}
