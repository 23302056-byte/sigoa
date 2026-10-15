
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { AdminNavbarComponent } from '../../../components/admin/admin-navbar/admin-navbar';

interface Proyecto {
  id: number;
  id_cliente?: number;
  id_arquitecto?: number | null;
  nombre: string;
  descripcion: string;
  cliente: string;
  arquitecto?: string;
  ubicacion: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string;
  id_obra?: number | null;
  obra_nombre?: string;
  obra_estado?: string;
  obra_avance?: number;
  obra_descripcion?: string;
  obra_fecha_inicio?: string;
  obra_fecha_fin_estimada?: string;
  obras?: ObraRelacionada[];
}

interface ObraRelacionada {
  id_obra: number;
  id_proyecto: number;
  nombre: string;
  descripcion: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin_estimada: string;
  fecha_fin_real: string;
  porcentaje_avance: number;
}

interface RespuestaProyectos {
  success: boolean;
  mensaje?: string;
  proyectos?: Proyecto[];
  proyecto?: Proyecto;
  clientes?: OpcionPersona[];
  arquitectos?: OpcionPersona[];
}

interface OpcionPersona { id: number; nombre: string; }
interface RespuestaObras { success: boolean; id?: number; mensaje?: string; }
interface NuevaObra { id: number | null; id_proyecto: number; nombre: string; descripcion: string; estado: string; fecha_inicio: string; fecha_fin_estimada: string; porcentaje_avance: number; }

@Component({
  selector: 'app-proyectos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AdminNavbarComponent
  ],
  templateUrl: './proyectos.html',
  styleUrl: './proyectos.css'
})
export class Proyectos implements OnInit, OnDestroy {

  private readonly API_URL = 'http://localhost:3000/api/routes/proyectos';

  proyectos: Proyecto[] = [];
  proyectosFiltrados: Proyecto[] = [];
  clientes: OpcionPersona[] = [];
  arquitectos: OpcionPersona[] = [];

  cargando = true;
  errorCarga = '';
  busqueda = '';

  mostrarModal = false;
  mostrarModalObra = false;
  creandoProyecto = false;
  modoEdicion = false;
  guardando = false;
  guardandoObra = false;
  conectado = false;
  obraNueva: NuevaObra = this.obraVacia();
  proyectoObraSeleccionado: Proyecto | null = null;
  obrasDelProyecto: ObraRelacionada[] = [];
  obraActivaId: number | null = null;
  modoEdicionObra = false;
  readonly estadosObra = ['Pendiente', 'En construccion', 'Pausada', 'Finalizada', 'Cancelada'];

  private dbOffline: IDBDatabase | null = null;
  private readonly nombreDBOffline = 'SIGOA_PROYECTOS_CACHE';
  private readonly storeOffline = 'proyectos';

  proyectoSeleccionado: Proyecto = this.proyectoVacio();

  // Estados válidos definidos en la base de datos
  estados = [
    'Planeacion',
    'En progreso',
    'Pausado',
    'Finalizado',
    'Cancelado'
  ];

  constructor(
    private http: HttpClient,
    private changeDetector: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    this.conectado = navigator.onLine;
    window.addEventListener('online', this.cuandoHayInternet);
    window.addEventListener('offline', this.cuandoNoHayInternet);
    this.abrirCacheOffline().then(() => {
      this.cargarProyectos();
      if (navigator.onLine) this.cargarOpciones();
    }).catch(error => {
      this.cargarProyectos();
      console.error('No se pudo abrir la caché offline:', error);
      if (navigator.onLine) {
        this.cargarOpciones();
      } else {
        this.errorCarga = 'Sin conexión y no se pudo abrir el almacenamiento local.';
        this.cargando = false;
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.cuandoHayInternet);
      window.removeEventListener('offline', this.cuandoNoHayInternet);
    }
    this.dbOffline?.close();
    this.dbOffline = null;
  }

  private cuandoHayInternet = (): void => {
    this.conectado = true;
    this.cargarProyectos();
    this.cargarOpciones();
    this.changeDetector.detectChanges();
  };

  private cuandoNoHayInternet = (): void => {
    this.conectado = false;
    this.cargarProyectosGuardados();
    this.changeDetector.detectChanges();
  };

  private abrirCacheOffline(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB no está disponible'));
        return;
      }
      const request = window.indexedDB.open(this.nombreDBOffline, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeOffline)) {
          db.createObjectStore(this.storeOffline);
        }
      };
      request.onsuccess = () => {
        this.dbOffline = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private guardarProyectosOffline(proyectos: Proyecto[]): void {
    if (!this.dbOffline) return;
    const tx = this.dbOffline.transaction(this.storeOffline, 'readwrite');
    tx.objectStore(this.storeOffline).put(proyectos, 'lista');
  }

  private cargarProyectosGuardados(): void {
    if (!this.dbOffline) {
      this.cargando = false;
      this.errorCarga = 'No hay almacenamiento local disponible.';
      return;
    }
    const request = this.dbOffline.transaction(this.storeOffline, 'readonly')
      .objectStore(this.storeOffline).get('lista');
    request.onsuccess = () => {
      if (Array.isArray(request.result)) {
        this.proyectos = this.quitarProyectosDuplicados(request.result.map((proyecto: any) => this.normalizarProyecto(proyecto)));
        this.buscar();
        this.errorCarga = '';
      } else {
        this.proyectos = [];
        this.proyectosFiltrados = [];
        this.errorCarga = 'No hay proyectos guardados para consultar sin conexión.';
      }
      this.cargando = false;
      this.changeDetector.detectChanges();
    };
    request.onerror = () => {
      this.cargando = false;
      this.errorCarga = 'No se pudieron leer los proyectos guardados.';
      this.changeDetector.detectChanges();
    };
  }

  private cargarOpciones(): void {
    this.http.get<RespuestaProyectos>(`${this.API_URL}/opciones`).subscribe({
      next: respuesta => {
        this.clientes = respuesta.clientes || [];
        this.arquitectos = respuesta.arquitectos || [];
      },
      error: error => console.error('Error al cargar clientes y arquitectos:', error)
    });
  }

  // ========================================
  // CARGAR PROYECTOS
  // ========================================

  cargarProyectos(): void {
    this.cargando = true;
    this.errorCarga = '';

    this.http.get<RespuestaProyectos>(this.API_URL).subscribe({
      next: (respuesta) => {
        console.log('Proyectos recibidos:', respuesta);
        this.conectado = navigator.onLine;

        if (respuesta.success) {
          this.proyectos = this.quitarProyectosDuplicados((respuesta.proyectos || []).map(proyecto =>
            this.normalizarProyecto(proyecto)
          ));

          this.buscar();
          this.errorCarga = '';
          this.guardarProyectosOffline(this.proyectos);
        } else {
          this.errorCarga =
            respuesta.mensaje || 'No se pudieron cargar los proyectos.';
        }

        this.cargando = false;
        this.changeDetector.detectChanges();
      },

      error: (error) => {
        console.error('Error al cargar proyectos:', error);
        this.conectado = false;

        this.errorCarga =
          error.error?.mensaje ||
          'No se pudieron cargar los proyectos. Comprueba que el backend esté activo.';

        this.cargando = false;
        this.changeDetector.detectChanges();
        this.cargarProyectosGuardados();
      }
    });
  }

  // ========================================
  // NORMALIZAR DATOS DEL BACKEND
  // ========================================

  private normalizarProyecto(proyecto: any): Proyecto {
    const obras = Array.isArray(proyecto.obras)
      ? proyecto.obras
      : proyecto.id_obra
        ? [{
            id_obra: proyecto.id_obra,
            id_proyecto: proyecto.id ?? proyecto.id_proyecto,
            nombre: proyecto.obra_nombre,
            descripcion: proyecto.obra_descripcion,
            estado: proyecto.obra_estado,
            fecha_inicio: proyecto.obra_fecha_inicio,
            fecha_fin_estimada: proyecto.obra_fecha_fin_estimada,
            porcentaje_avance: proyecto.obra_avance
          }]
        : [];
    return {
      id: Number(proyecto.id ?? proyecto.id_proyecto),
      id_cliente: proyecto.id_cliente
        ? Number(proyecto.id_cliente)
        : undefined,
      id_arquitecto: proyecto.id_arquitecto == null
        ? null
        : Number(proyecto.id_arquitecto),
      nombre: proyecto.nombre ?? '',
      descripcion: proyecto.descripcion ?? '',
      cliente: proyecto.cliente ?? '',
      arquitecto: proyecto.arquitecto ?? '',
      ubicacion: proyecto.ubicacion ?? proyecto.direccion_obra ?? '',
      estado: proyecto.estado ?? 'Planeacion',
      fecha_inicio: this.normalizarFecha(proyecto.fecha_inicio),
      fecha_fin: this.normalizarFecha(
        proyecto.fecha_fin ?? proyecto.fecha_fin_estimada
      ),
      id_obra: proyecto.id_obra == null ? null : Number(proyecto.id_obra),
      obra_nombre: proyecto.obra_nombre ?? '',
      obra_estado: proyecto.obra_estado ?? '',
      obra_avance: Number(proyecto.obra_avance || 0),
      obra_descripcion: proyecto.obra_descripcion ?? '',
      obra_fecha_inicio: this.normalizarFecha(proyecto.obra_fecha_inicio),
      obra_fecha_fin_estimada: this.normalizarFecha(proyecto.obra_fecha_fin_estimada),
      obras: obras.map((obra: any) => ({
        id_obra: Number(obra.id_obra), id_proyecto: Number(obra.id_proyecto),
        nombre: obra.nombre ?? '', descripcion: obra.descripcion ?? '', estado: obra.estado ?? 'Pendiente',
        fecha_inicio: this.normalizarFecha(obra.fecha_inicio),
        fecha_fin_estimada: this.normalizarFecha(obra.fecha_fin_estimada),
        fecha_fin_real: this.normalizarFecha(obra.fecha_fin_real),
        porcentaje_avance: Number(obra.porcentaje_avance || 0)
      }))
    };
  }

  private quitarProyectosDuplicados(proyectos: Proyecto[]): Proyecto[] {
    const unicos = new Map<number, Proyecto>();
    for (const proyecto of proyectos) {
      const existente = unicos.get(Number(proyecto.id));
      if (!existente) {
        unicos.set(Number(proyecto.id), { ...proyecto, obras: [...(proyecto.obras || [])] });
        continue;
      }
      const obras = new Map<number, ObraRelacionada>();
      for (const obra of [...(existente.obras || []), ...(proyecto.obras || [])]) {
        obras.set(Number(obra.id_obra), obra);
      }
      existente.obras = [...obras.values()];
    }
    return [...unicos.values()];
  }

  private normalizarFecha(fecha: any): string {
    if (!fecha) {
      return '';
    }

    // Permite usar directamente las fechas en inputs type="date"
    if (typeof fecha === 'string') {
      return fecha.substring(0, 10);
    }

    if (fecha instanceof Date) {
      const anio = fecha.getFullYear();
      const mes = String(fecha.getMonth() + 1).padStart(2, '0');
      const dia = String(fecha.getDate()).padStart(2, '0');

      return `${anio}-${mes}-${dia}`;
    }

    return '';
  }

  // ========================================
  // BUSCAR PROYECTOS
  // ========================================

  buscar(): void {
    const texto = this.busqueda.toLowerCase().trim();

    if (!texto) {
      this.proyectosFiltrados = [...this.proyectos];
      return;
    }

    this.proyectosFiltrados = this.proyectos.filter(proyecto =>
      proyecto.nombre.toLowerCase().includes(texto) ||
      proyecto.cliente.toLowerCase().includes(texto) ||
      proyecto.ubicacion.toLowerCase().includes(texto) ||
      proyecto.estado.toLowerCase().includes(texto)
    );
  }

  // ========================================
  // VER PROYECTO
  // ========================================

  verProyecto(proyecto: Proyecto): void {
    this.proyectoSeleccionado = {
      ...proyecto
    };

    this.creandoProyecto = false;
    this.modoEdicion = false;
    this.mostrarModal = true;

    this.changeDetector.detectChanges();
  }

  // ========================================
  // EDITAR PROYECTO
  // ========================================

  editarProyecto(proyecto: Proyecto): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se puede editar el proyecto.');
      return;
    }
    this.proyectoSeleccionado = {
      ...proyecto
    };

    this.creandoProyecto = false;
    this.modoEdicion = true;
    this.mostrarModal = true;

    this.changeDetector.detectChanges();
  }

  nuevoProyecto(): void {
    if (!this.conectado) { alert('Conéctate a internet para crear proyectos.'); return; }
    this.proyectoSeleccionado = this.proyectoVacio();
    this.creandoProyecto = true;
    this.modoEdicion = true;
    this.mostrarModal = true;
    this.cargarOpciones();
  }

  verObraProyecto(proyecto: Proyecto): void {
    this.proyectoObraSeleccionado = { ...proyecto };
    this.obrasDelProyecto = [...(proyecto.obras || [])];
    this.obraActivaId = null;
    this.obraNueva = { ...this.obraVacia(), id_proyecto: proyecto.id, nombre: proyecto.nombre };
    this.modoEdicionObra = false;
    this.mostrarModalObra = true;
  }

  abrirRegistrosProyecto(proyecto: Proyecto, apartado: 'obras' | 'cotizaciones' | 'contratos' | 'pagos'): void {
    this.router.navigate([`/admin/${apartado}`], {
      queryParams: { id_proyecto: proyecto.id, proyecto: proyecto.nombre }
    });
  }

  seleccionarObraProyecto(obra: ObraRelacionada): void {
    this.obraActivaId = obra.id_obra;
    this.obraNueva = {
      id: obra.id_obra, id_proyecto: obra.id_proyecto, nombre: obra.nombre,
      descripcion: obra.descripcion, estado: obra.estado, fecha_inicio: obra.fecha_inicio,
      fecha_fin_estimada: obra.fecha_fin_estimada, porcentaje_avance: obra.porcentaje_avance
    };
    this.modoEdicionObra = false;
  }

  editarObraDeLista(obra: ObraRelacionada): void {
    if (!this.conectado) { alert('Conéctate a internet para editar obras.'); return; }
    this.seleccionarObraProyecto(obra);
    this.modoEdicionObra = true;
  }

  borrarObraDeLista(obra: ObraRelacionada): void {
    this.seleccionarObraProyecto(obra);
    this.eliminarObraProyecto();
  }

  crearObraProyecto(): void {
    if (!this.conectado) { alert('Con?ctate a internet para crear obras.'); return; }
    if (!this.proyectoObraSeleccionado) return;
    this.obraActivaId = null;
    this.obraNueva = { ...this.obraVacia(), id_proyecto: this.proyectoObraSeleccionado.id, nombre: this.proyectoObraSeleccionado.nombre };
    this.modoEdicionObra = true;
  }

  editarObraProyecto(): void {
    if (!this.conectado) { alert('Con?ctate a internet para editar obras.'); return; }
    this.modoEdicionObra = true;
  }

  cancelarEdicionObra(): void {
    const obra = this.obrasDelProyecto.find(item => item.id_obra === this.obraActivaId);
    if (obra) this.seleccionarObraProyecto(obra);
    else if (this.proyectoObraSeleccionado) {
      this.obraNueva = { ...this.obraVacia(), id_proyecto: this.proyectoObraSeleccionado.id, nombre: this.proyectoObraSeleccionado.nombre };
      this.modoEdicionObra = false;
    }
  }

  guardarObraProyecto(): void {
    if (!this.conectado) { alert('Con?ctate a internet para guardar la obra.'); return; }
    const obra = this.obraNueva;
    if (!obra.id_proyecto || !obra.nombre.trim()) { alert('El nombre de la obra es obligatorio.'); return; }
    if (obra.porcentaje_avance < 0 || obra.porcentaje_avance > 100) { alert('El avance debe estar entre 0 y 100.'); return; }
    if (this.guardandoObra) return;
    const creandoObra = !obra.id;
    this.guardandoObra = true;
    const datos = { ...obra, fecha_inicio: obra.fecha_inicio || null, fecha_fin_estimada: obra.fecha_fin_estimada || null, fecha_fin_real: null };
    const url = 'http://localhost:3000/api/routes/obras';
    const solicitud = obra.id ? this.http.put<RespuestaObras>(url + '/' + obra.id, datos) : this.http.post<RespuestaObras>(url, datos);
    solicitud.subscribe({
      next: respuesta => {
        this.guardandoObra = false;
        if (!respuesta.success) { alert(respuesta.mensaje || 'No se pudo guardar la obra.'); return; }
        if (respuesta.id) this.obraNueva.id = respuesta.id;
        const proyecto = this.proyectoObraSeleccionado;
        const guardada: ObraRelacionada = {
          id_obra: this.obraNueva.id!, id_proyecto: obra.id_proyecto, nombre: obra.nombre,
          descripcion: obra.descripcion, estado: obra.estado, fecha_inicio: obra.fecha_inicio,
          fecha_fin_estimada: obra.fecha_fin_estimada, fecha_fin_real: '', porcentaje_avance: obra.porcentaje_avance
        };
        const indice = this.obrasDelProyecto.findIndex(item => item.id_obra === guardada.id_obra);
        if (indice >= 0) this.obrasDelProyecto[indice] = guardada;
        else this.obrasDelProyecto.push(guardada);
        this.obraActivaId = guardada.id_obra;
        if (proyecto) {
          proyecto.obras = [...this.obrasDelProyecto];
          proyecto.id_obra = proyecto.obras[0]?.id_obra ?? null;
          proyecto.obra_nombre = proyecto.obras[0]?.nombre ?? '';
          const original = this.proyectos.find(p => p.id === proyecto.id);
          if (original) original.obras = [...this.obrasDelProyecto];
        }
        this.modoEdicionObra = false; this.cargarProyectos();
        if (creandoObra) this.cerrarModalObra();
        alert('Obra guardada correctamente.'); this.changeDetector.detectChanges();
      },
      error: error => { this.guardandoObra = false; if (error.status === 0) this.conectado = false; alert(error.error?.mensaje || 'No se pudo guardar la obra.'); this.changeDetector.detectChanges(); }
    });
  }

  eliminarObraProyecto(): void {
    if (!this.conectado) { alert('Con?ctate a internet para eliminar obras.'); return; }
    if (!this.obraNueva.id) return;
    if (!confirm('?Seguro que deseas eliminar la obra "' + this.obraNueva.nombre + '"?')) return;
    this.http.delete<RespuestaObras>('http://localhost:3000/api/routes/obras/' + this.obraNueva.id).subscribe({
      next: respuesta => {
        if (!respuesta.success) { alert(respuesta.mensaje || 'No se pudo eliminar la obra.'); return; }
        this.obrasDelProyecto = this.obrasDelProyecto.filter(obra => obra.id_obra !== this.obraNueva.id);
        if (this.proyectoObraSeleccionado) {
          this.proyectoObraSeleccionado.obras = [...this.obrasDelProyecto];
          const original = this.proyectos.find(p => p.id === this.proyectoObraSeleccionado?.id);
          if (original) original.obras = [...this.obrasDelProyecto];
        }
        this.obraActivaId = null;
        this.obraNueva = { ...this.obraVacia(), id_proyecto: this.proyectoObraSeleccionado?.id || 0, nombre: this.proyectoObraSeleccionado?.nombre || '' };
        this.modoEdicionObra = false; this.cargarProyectos();
        alert('Obra eliminada correctamente.');
      },
      error: error => { if (error.status === 0) this.conectado = false; alert(error.error?.mensaje || 'No se pudo eliminar la obra.'); }
    });
  }

  // ========================================
  // GUARDAR CAMBIOS
  // ========================================

  guardarCambios(): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se pueden guardar los cambios.');
      return;
    }
    const proyecto = this.proyectoSeleccionado;

    if (!this.creandoProyecto && (!proyecto.id || proyecto.id < 1)) {
      alert('El identificador del proyecto no es válido.');
      return;
    }

    if (!proyecto.nombre.trim()) {
      alert('El nombre del proyecto es obligatorio.');
      return;
    }

    if (!proyecto.id_cliente) {
      alert('Selecciona el cliente del proyecto.');
      return;
    }

    if (this.guardando) {
      return;
    }

    this.guardando = true;

    const datos = {
      id_cliente: proyecto.id_cliente,
      id_arquitecto: proyecto.id_arquitecto,
      nombre: proyecto.nombre.trim(),
      descripcion: proyecto.descripcion,
      ubicacion: proyecto.ubicacion,
      estado: proyecto.estado,
      fecha_inicio: proyecto.fecha_inicio || null,
      fecha_fin: proyecto.fecha_fin || null
    };

    const solicitud = this.creandoProyecto
      ? this.http.post<RespuestaProyectos>(this.API_URL, datos)
      : this.http.put<RespuestaProyectos>(`${this.API_URL}/${proyecto.id}`, datos);
    solicitud.subscribe({
      next: (respuesta) => {
        console.log('Respuesta actualización:', respuesta);

        this.guardando = false;

        if (respuesta.success) {
          alert(this.creandoProyecto ? 'Proyecto creado correctamente.' : 'Proyecto actualizado correctamente.');
          this.mostrarModal = false;
          this.creandoProyecto = false;
          this.cargarProyectos();
        } else {
          alert(respuesta.mensaje || 'No se pudo actualizar el proyecto.');
        }

        this.changeDetector.detectChanges();
      },

      error: (error) => {
        console.error('Error al actualizar proyecto:', error);

        if (error.status === 0) {
          this.conectado = false;
        }

        this.guardando = false;

        alert(
          error.error?.mensaje ||
          'No se pudo actualizar el proyecto. Comprueba los datos.'
        );

        this.changeDetector.detectChanges();
      }
    });
  }

  // ========================================
  // ELIMINAR PROYECTO
  // ========================================

  eliminarProyecto(proyecto: Proyecto): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se puede eliminar el proyecto.');
      return;
    }
    const confirmar = confirm(
      `¿Seguro que deseas eliminar el proyecto "${proyecto.nombre}"?`
    );

    if (!confirmar) {
      return;
    }

    if (!proyecto.id || proyecto.id < 1) {
      alert('El identificador del proyecto no es válido.');
      return;
    }

    this.http.delete<RespuestaProyectos>(
      `${this.API_URL}/${proyecto.id}`
    ).subscribe({
      next: (respuesta) => {
        console.log('Respuesta eliminación:', respuesta);

        if (respuesta.success) {
          alert('Proyecto eliminado correctamente.');
          this.cargarProyectos();
        } else {
          alert(respuesta.mensaje || 'No se pudo eliminar el proyecto.');
        }
      },

      error: (error) => {
        console.error('Error al eliminar proyecto:', error);

        if (error.status === 0) {
          this.conectado = false;
          this.changeDetector.detectChanges();
        }

        alert(
          error.error?.mensaje ||
          'No se pudo eliminar el proyecto.'
        );
      }
    });
  }


  // ========================================
  // CERRAR MODAL
  // ========================================

  cerrarModal(): void {
    this.mostrarModal = false;
    this.creandoProyecto = false;
    this.proyectoSeleccionado = this.proyectoVacio();

    this.changeDetector.detectChanges();
  }

  cerrarModalObra(): void { this.mostrarModalObra = false; this.obraNueva = this.obraVacia(); this.proyectoObraSeleccionado = null; this.obrasDelProyecto = []; this.obraActivaId = null; this.modoEdicionObra = false; }

  private obraVacia(): NuevaObra {
    return { id: null, id_proyecto: 0, nombre: '', descripcion: '', estado: 'Pendiente', fecha_inicio: '', fecha_fin_estimada: '', porcentaje_avance: 0 };
  }

  // ========================================
  // PROYECTO VACÍO
  // ========================================

  proyectoVacio(): Proyecto {
    return {
      id: 0,
      id_cliente: undefined,
      id_arquitecto: null,
      nombre: '',
      descripcion: '',
      cliente: '',
      ubicacion: '',
      estado: 'Planeacion',
      fecha_inicio: '',
      fecha_fin: '',
      id_obra: null,
      obra_nombre: '',
      obra_estado: '',
      obra_avance: 0
    };
  }
}
