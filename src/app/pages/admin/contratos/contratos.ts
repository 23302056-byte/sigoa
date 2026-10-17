import { afterNextRender, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { timeout } from 'rxjs';

interface Contrato {
  id: number;
  id_proyecto: number;
  proyecto: string;
  cliente: string;
  cliente_correo: string;
  cliente_telefono: string;
  cliente_direccion: string;
  numero_contrato: string;
  fecha_firma: string;
  fecha_inicio: string;
  fecha_fin: string;
  monto: number;
  estado: string;
  archivo: string;
  observaciones: string;
}

interface ProyectoOpcion { id: number; nombre: string; }
interface RespuestaContratos {
  success: boolean;
  mensaje?: string;
  contratos?: Contrato[];
  contrato?: Contrato;
  proyectos?: ProyectoOpcion[];
}

@Component({
  selector: 'app-contratos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contratos.html',
  styleUrl: './contratos.css'
})
export class Contratos implements OnDestroy {
  private readonly API_URL = 'http://localhost:3000/api/routes/contratos';
  private readonly nombreDB = 'SIGOA_CONTRATOS_CACHE';
  private readonly store = 'contratos';
  private dbOffline: IDBDatabase | null = null;

  contratos: Contrato[] = [];
  contratosFiltrados: Contrato[] = [];
  proyectos: ProyectoOpcion[] = [];
  estados = ['Borrador', 'Activo', 'Finalizado', 'Cancelado'];
  cargando = true;
  errorCarga = '';
  busqueda = '';
  conectado = false;
  mostrarModal = false;
  modoEdicion = false;
  creandoContrato = false;
  guardando = false;
  idProyectoFiltro = 0;
  proyectoFiltro = '';
  contratoSeleccionado: Contrato = this.contratoVacio();

  constructor(private http: HttpClient, private changeDetector: ChangeDetectorRef, private route: ActivatedRoute, private router: Router) {
    this.idProyectoFiltro = Number(this.route.snapshot.queryParamMap.get('id_proyecto')) || 0;
    this.proyectoFiltro = this.route.snapshot.queryParamMap.get('proyecto') || '';
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
    this.cargarContratos();
    if (navigator.onLine) this.cargarProyectos();
    this.abrirCache().then(() => {
      if (this.contratos.length) this.guardarCache();
      else this.cargarCache();
    }).catch(error => {
      console.error('No se pudo abrir la caché offline de contratos:', error);
      if (!this.contratos.length && !this.errorCarga) {
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
    this.cargarContratos();
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
      if (typeof window === 'undefined' || !window.indexedDB) return reject(new Error('IndexedDB no está disponible'));
      const request = window.indexedDB.open(this.nombreDB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.store)) request.result.createObjectStore(this.store);
      };
      request.onsuccess = () => { this.dbOffline = request.result; resolve(); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('La base local está bloqueada por otra pestaña'));
    });
  }

  private guardarCache(): void {
    if (this.dbOffline) this.dbOffline.transaction(this.store, 'readwrite').objectStore(this.store).put(this.contratos, 'lista');
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
        this.contratos = request.result;
        this.filtrar();
        this.errorCarga = '';
      } else {
        this.contratos = [];
        this.contratosFiltrados = [];
        this.errorCarga = 'No hay contratos guardados para consultar sin conexión.';
      }
      this.cargando = false;
      this.changeDetector.detectChanges();
    };
    request.onerror = () => {
      this.cargando = false;
      this.errorCarga = 'No se pudieron leer los contratos guardados.';
      this.changeDetector.detectChanges();
    };
  }

  private cargarProyectos(): void {
    this.http.get<RespuestaContratos>(`${this.API_URL}/opciones`).pipe(timeout(10000)).subscribe({
      next: respuesta => this.proyectos = respuesta.proyectos || [],
      error: error => console.error('Error al cargar proyectos disponibles:', error)
    });
  }

  cargarContratos(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.http.get<RespuestaContratos>(this.API_URL).pipe(timeout(10000)).subscribe({
      next: respuesta => {
        this.conectado = navigator.onLine;
        if (respuesta.success) {
          this.contratos = (respuesta.contratos || []).map(contrato => this.normalizarContrato(contrato));
          this.filtrar();
          this.guardarCache();
        } else this.errorCarga = respuesta.mensaje || 'No se pudieron cargar los contratos.';
        this.cargando = false;
        this.changeDetector.detectChanges();
      },
      error: error => {
        console.error('Error al cargar contratos:', error);
        this.conectado = false;
        this.errorCarga = error.error?.mensaje || 'No se pudieron cargar los contratos.';
        this.cargando = false;
        this.cargarCache();
      }
    });
  }

  private normalizarContrato(contrato: any): Contrato {
    return {
      id: Number(contrato.id ?? contrato.id_contrato),
      id_proyecto: Number(contrato.id_proyecto),
      proyecto: contrato.proyecto || '',
      cliente: contrato.cliente || '',
      cliente_correo: contrato.cliente_correo || '',
      cliente_telefono: contrato.cliente_telefono || '',
      cliente_direccion: contrato.cliente_direccion || '',
      numero_contrato: contrato.numero_contrato || '',
      fecha_firma: this.fechaInput(contrato.fecha_firma),
      fecha_inicio: this.fechaInput(contrato.fecha_inicio),
      fecha_fin: this.fechaInput(contrato.fecha_fin),
      monto: Number(contrato.monto || 0),
      estado: contrato.estado || 'Borrador',
      archivo: contrato.archivo || '',
      observaciones: contrato.observaciones || ''
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
    this.contratosFiltrados = this.contratos.filter(c =>
      (!this.idProyectoFiltro || c.id_proyecto === this.idProyectoFiltro) &&
      (!texto || [c.numero_contrato, c.proyecto, c.cliente, c.estado].some(valor => (valor || '').toLowerCase().includes(texto)))
    );
  }

  verContrato(contrato: Contrato): void {
    this.contratoSeleccionado = { ...contrato };
    this.modoEdicion = false;
    this.creandoContrato = false;
    this.mostrarModal = true;
  }

  nuevoContrato(): void {
    if (!this.conectado) {
      alert('Conéctate a internet para crear contratos.');
      return;
    }
    this.contratoSeleccionado = this.contratoVacio();
    this.contratoSeleccionado.id_proyecto = this.idProyectoFiltro;
    this.modoEdicion = true;
    this.creandoContrato = true;
    this.mostrarModal = true;
    this.cargarProyectos();
  }

  editarContrato(contrato: Contrato): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se puede editar el contrato.');
      return;
    }
    this.contratoSeleccionado = { ...contrato };
    this.modoEdicion = true;
    this.creandoContrato = false;
    this.mostrarModal = true;
    this.cargarProyectos();
  }

  guardarCambios(): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se pueden guardar los cambios.');
      return;
    }
    if (this.guardando) return;
    const c = this.contratoSeleccionado;
    const creando = this.creandoContrato;
    if (!c.id_proyecto || !c.numero_contrato.trim()) {
      alert('El proyecto y el número de contrato son obligatorios.');
      return;
    }
    this.guardando = true;
    const datos = {
      id_proyecto: c.id_proyecto,
      numero_contrato: c.numero_contrato.trim(),
      fecha_firma: c.fecha_firma || null,
      fecha_inicio: c.fecha_inicio || null,
      fecha_fin: c.fecha_fin || null,
      monto: c.monto,
      estado: c.estado,
      archivo: c.archivo,
      observaciones: c.observaciones
    };
    const solicitud = this.creandoContrato
      ? this.http.post<RespuestaContratos>(this.API_URL, datos)
      : this.http.put<RespuestaContratos>(`${this.API_URL}/${c.id}`, datos);
    solicitud.subscribe({
      next: respuesta => {
        this.guardando = false;
        if (respuesta.success) {
          this.mostrarModal = false;
          this.creandoContrato = false;
          this.contratoSeleccionado = this.contratoVacio();
          this.cargarContratos();
          alert(respuesta.mensaje || (creando ? 'Contrato creado correctamente.' : 'Contrato actualizado correctamente.'));
        } else alert(respuesta.mensaje || 'No se pudo actualizar el contrato.');
        this.changeDetector.detectChanges();
      },
      error: error => {
        this.guardando = false;
        if (error.status === 0) this.conectado = false;
        alert(error.error?.mensaje || 'No se pudo actualizar el contrato.');
        this.changeDetector.detectChanges();
      }
    });
  }

  eliminarContrato(contrato: Contrato): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se puede eliminar el contrato.');
      return;
    }
    if (!confirm(`¿Seguro que deseas eliminar el contrato "${contrato.numero_contrato}"?`)) return;
    this.http.delete<RespuestaContratos>(`${this.API_URL}/${contrato.id}`).subscribe({
      next: respuesta => {
        if (respuesta.success) {
          alert('Contrato eliminado correctamente.');
          this.cargarContratos();
        } else alert(respuesta.mensaje || 'No se pudo eliminar el contrato.');
      },
      error: error => {
        if (error.status === 0) this.conectado = false;
        alert(error.error?.mensaje || 'No se pudo eliminar el contrato.');
        this.changeDetector.detectChanges();
      }
    });
  }

  formatoMoneda(valor: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor || 0);
  }

  descargarPdf(contrato: Contrato = this.contratoSeleccionado): void {
    const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
    const date = (value: string): string => {
      if (!value) return 'Por definir';
      const parsed = new Date(`${value.substring(0, 10)}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? escape(value) : parsed.toLocaleDateString('es-MX');
    };
    const field = (label: string, value: string): string => `<div class="dato"><span>${escape(label)}</span><strong>${escape(value || 'No registrado')}</strong></div>`;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contrato ${escape(contrato.numero_contrato)}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#161616;margin:0;font-size:12px;line-height:1.55}main{max-width:780px;margin:0 auto;padding:42px 52px}.head{display:flex;justify-content:space-between;border-bottom:3px solid #fac82b;padding-bottom:18px;margin-bottom:25px}.brand{font-size:11px;font-weight:bold;letter-spacing:2px;color:#878787}.head h1{font-size:25px;margin:5px 0}.folio{text-align:right;color:#878787;font-size:11px}.folio strong{display:block;color:#161616;font-size:14px}.intro{margin:18px 0 24px;text-align:justify}.section{margin:22px 0;page-break-inside:avoid}.section h2{font-size:13px;text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:6px;margin:0 0 11px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px}.dato span{display:block;color:#878787;font-size:10px;text-transform:uppercase}.dato strong{font-weight:600;overflow-wrap:anywhere}.amount{background:#fff9df;border-left:4px solid #fac82b;padding:13px 16px}.amount strong{font-size:18px}.text{min-height:46px;text-align:justify;white-space:pre-wrap}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin:62px 15px 15px;text-align:center;page-break-inside:avoid}.signature{border-top:1px solid #161616;padding-top:8px}.signature strong,.signature span{display:block}.signature span{color:#878787;font-size:10px}.foot{margin-top:35px;padding-top:10px;border-top:1px solid #ddd;color:#878787;font-size:9px;text-align:center}@media print{main{max-width:none;padding:0}@page{size:A4;margin:18mm}}</style></head><body><main>
      <header class="head"><div><div class="brand">SIGOA | ADMINISTRACION DE PROYECTOS</div><h1>CONTRATO DE OBRA</h1><div>Documento de formalizacion de servicios y trabajos</div></div><div class="folio">FOLIO<strong>${escape(contrato.numero_contrato || 'Sin asignar')}</strong><br>ESTADO: ${escape(contrato.estado)}</div></header>
      <p class="intro">En este documento se registran los datos de identificacion del cliente, el proyecto, el importe y el periodo de ejecucion. Las condiciones especificas deberan corresponder a lo acordado y firmado por las partes.</p>
      <section class="section"><h2>Primera. Datos del cliente</h2><div class="grid">${field('Nombre completo', contrato.cliente)}${field('Correo electronico', contrato.cliente_correo)}${field('Telefono', contrato.cliente_telefono)}${field('Domicilio', contrato.cliente_direccion)}</div></section>
      <section class="section"><h2>Segunda. Objeto del contrato</h2><div class="grid">${field('Proyecto u obra', contrato.proyecto)}${field('Numero de contrato', contrato.numero_contrato)}${field('Fecha de firma', date(contrato.fecha_firma))}${field('Lugar de ejecucion', contrato.cliente_direccion)}</div><p class="text">El objeto de este documento es dejar constancia de los trabajos relacionados con el proyecto indicado. El alcance, materiales, entregables y demas condiciones se describiran en las observaciones o en los anexos que formen parte del contrato.</p></section>
      <section class="section"><h2>Tercera. Importe</h2><div class="amount">Importe registrado: <strong>${escape(this.formatoMoneda(contrato.monto))} MXN</strong><br>La forma y calendario de pago deberan quedar asentados en las condiciones acordadas por las partes.</div></section>
      <section class="section"><h2>Cuarta. Vigencia y ejecucion</h2><div class="grid">${field('Fecha de inicio', date(contrato.fecha_inicio))}${field('Fecha de terminacion', date(contrato.fecha_fin))}</div></section>
      <section class="section"><h2>Quinta. Condiciones y observaciones</h2><p class="text">${escape(contrato.observaciones || 'Sin condiciones adicionales registradas.')}</p></section>
      <p class="intro">Leido el presente documento y conformes con los datos aqui asentados, las partes podran firmarlo en el lugar y fecha que acuerden.</p><section class="signatures"><div class="signature"><strong>${escape(contrato.cliente || 'EL CLIENTE')}</strong><span>Nombre y firma del cliente</span></div><div class="signature"><strong>REPRESENTANTE / PRESTADOR</strong><span>Nombre y firma</span></div></section><footer class="foot">SIGOA | Contrato ${escape(contrato.numero_contrato)} | Generado el ${escape(new Date().toLocaleDateString('es-MX'))}</footer></main></body></html>`;
    const ventana = window.open('', '_blank', 'width=900,height=700');
    if (!ventana) { alert('Permite las ventanas emergentes para generar el PDF.'); return; }
    ventana.document.open(); ventana.document.write(html); ventana.document.close();
    window.setTimeout(() => { if (!ventana.closed) { ventana.focus(); ventana.print(); } }, 250);
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.modoEdicion = false;
    this.creandoContrato = false;
    this.contratoSeleccionado = this.contratoVacio();
  }

  private contratoVacio(): Contrato {
    return {
      id: 0, id_proyecto: 0, proyecto: '', cliente: '', cliente_correo: '', cliente_telefono: '', cliente_direccion: '', numero_contrato: '',
      fecha_firma: '', fecha_inicio: '', fecha_fin: '', monto: 0,
      estado: 'Borrador', archivo: '', observaciones: ''
    };
  }
}
