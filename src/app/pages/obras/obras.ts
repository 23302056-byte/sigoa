import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminNavbarComponent } from '../../components/admin/admin-navbar/admin-navbar';

interface Obra {
  id: number;
  id_proyecto: number;
  proyecto: string;
  cliente: string;
  nombre: string;
  descripcion: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin_estimada: string;
  fecha_fin_real: string;
  porcentaje_avance: number;
}

interface ProyectoOpcion { id: number; nombre: string; }
interface Evidencia { id: number; id_obra: number; obra: string; proyecto: string; tipo: string; archivo: string; descripcion: string; fecha: string; usuario: string; }
interface RespuestaObras {
  success: boolean;
  mensaje?: string;
  obras?: Obra[];
  proyectos?: ProyectoOpcion[];
  evidencias?: Evidencia[];
}

@Component({
  selector: 'app-obras',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './obras.html',
  styleUrl: './obras.css'
})
export class Obras implements OnInit, OnDestroy {
  private readonly API_URL = 'http://localhost:3000/api/routes/obras';
  private dbOffline: IDBDatabase | null = null;
  private readonly nombreDB = 'SIGOA_OBRAS_CACHE';
  private readonly store = 'obras';

  obras: Obra[] = [];
  obrasFiltradas: Obra[] = [];
  proyectos: ProyectoOpcion[] = [];
  cargando = true;
  errorCarga = '';
  busqueda = '';
  conectado = false;
  mostrarModal = false;
  creandoObra = false;
  modoEdicion = false;
  guardando = false;
  obraSeleccionada: Obra = this.obraVacia();
  mostrarEvidencias = false;
  evidencias: Evidencia[] = [];
  tipoEvidencia = 'Fotografia';
  descripcionEvidencia = '';
  archivoEvidencia: File | null = null;
  nombreArchivoEvidencia = '';
  subiendoEvidencia = false;
  idProyectoFiltro = 0;
  proyectoFiltro = '';

  readonly estados = ['Pendiente', 'En construccion', 'Pausada', 'Finalizada', 'Cancelada'];
  readonly tiposEvidencia = ['Fotografia', 'Video', 'Otro'];

  constructor(private http: HttpClient, private changeDetector: ChangeDetectorRef, private route: ActivatedRoute, private router: Router) {
    this.idProyectoFiltro = Number(this.route.snapshot.queryParamMap.get('id_proyecto')) || 0;
    this.proyectoFiltro = this.route.snapshot.queryParamMap.get('proyecto') || '';
  }

  get proyectosDisponibles(): ProyectoOpcion[] { return this.idProyectoFiltro ? this.proyectos.filter(p => p.id === this.idProyectoFiltro) : this.proyectos; }
  volverAProyecto(): void { this.router.navigate(['/admin/proyectos']); }

  ngOnInit(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    this.conectado = navigator.onLine;
    window.addEventListener('online', this.cuandoHayInternet);
    window.addEventListener('offline', this.cuandoNoHayInternet);
    this.abrirCache().then(() => {
      this.cargarObras();
      if (navigator.onLine) this.cargarProyectos();
    }).catch(error => {
      console.error('No se pudo abrir la caché offline de obras:', error);
      if (!this.obras.length && !this.errorCarga) {
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
    this.cargarObras();
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
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB no está disponible'));
        return;
      }
      const request = window.indexedDB.open(this.nombreDB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.store)) request.result.createObjectStore(this.store);
      };
      request.onsuccess = () => { this.dbOffline = request.result; resolve(); };
      request.onerror = () => reject(request.error);
    });
  }

  private guardarCache(): void {
    if (this.dbOffline) {
      this.dbOffline.transaction(this.store, 'readwrite').objectStore(this.store).put(this.obras, 'lista');
    }
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
        this.obras = request.result;
        this.filtrar();
        this.errorCarga = '';
      } else {
        this.obras = [];
        this.obrasFiltradas = [];
        this.errorCarga = 'No hay obras guardadas para consultar sin conexión.';
      }
      this.cargando = false;
      this.changeDetector.detectChanges();
    };
    request.onerror = () => {
      this.cargando = false;
      this.errorCarga = 'No se pudieron leer las obras guardadas.';
      this.changeDetector.detectChanges();
    };
  }

  cargarObras(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.http.get<RespuestaObras>(this.API_URL).subscribe({
      next: respuesta => {
        this.conectado = navigator.onLine;
        if (respuesta.success) {
          this.obras = (respuesta.obras || []).map(obra => this.normalizarObra(obra));
          this.filtrar();
          this.guardarCache();
        } else {
          this.errorCarga = respuesta.mensaje || 'No se pudieron cargar las obras.';
        }
        this.cargando = false;
        this.changeDetector.detectChanges();
      },
      error: error => {
        console.error('Error al cargar obras:', error);
        this.conectado = false;
        this.errorCarga = error.error?.mensaje || 'No se pudieron cargar las obras.';
        this.cargando = false;
        this.cargarCache();
      }
    });
  }

  private cargarProyectos(idObra?: number): void {
    const query = idObra ? `?id_obra=${idObra}` : '';
    this.http.get<RespuestaObras>(`${this.API_URL}/opciones${query}`).subscribe({
      next: respuesta => {
        this.proyectos = respuesta.proyectos || [];
        this.changeDetector.detectChanges();
      },
      error: error => {
        console.error('Error al cargar proyectos disponibles:', error);
        this.proyectos = [];
        this.changeDetector.detectChanges();
      }
    });
  }

  seleccionarProyectoObra(idProyecto: number): void {
    const proyecto = this.proyectos.find(opcion => opcion.id === Number(idProyecto));
    if (!proyecto) return;
    const nombre = this.obraSeleccionada.nombre;
    const idObra = this.creandoObra ? 0 : this.obraSeleccionada.id;
    this.obraSeleccionada = { ...this.obraVacia(), id: idObra, id_proyecto: proyecto.id, proyecto: proyecto.nombre, nombre };
  }

  private normalizarObra(obra: any): Obra {
    return {
      id: Number(obra.id ?? obra.id_obra),
      id_proyecto: Number(obra.id_proyecto),
      proyecto: obra.proyecto || '',
      cliente: obra.cliente || '',
      nombre: obra.nombre || '',
      descripcion: obra.descripcion || '',
      estado: obra.estado || 'Pendiente',
      fecha_inicio: this.fechaInput(obra.fecha_inicio),
      fecha_fin_estimada: this.fechaInput(obra.fecha_fin_estimada),
      fecha_fin_real: this.fechaInput(obra.fecha_fin_real),
      porcentaje_avance: Number(obra.porcentaje_avance || 0)
    };
  }

  private fechaInput(fecha: any): string { return fecha ? String(fecha).substring(0, 10) : ''; }

  filtrar(): void {
    const texto = this.busqueda.toLowerCase().trim();
    this.obrasFiltradas = this.obras.filter(obra =>
      (!this.idProyectoFiltro || obra.id_proyecto === this.idProyectoFiltro) &&
      (!texto || [obra.nombre, obra.proyecto, obra.cliente, obra.estado, obra.descripcion]
        .some(valor => (valor || '').toLowerCase().includes(texto)))
    );
  }

  verObra(obra: Obra): void {
    this.obraSeleccionada = { ...obra };
    this.creandoObra = false;
    this.modoEdicion = false;
    this.mostrarModal = true;
  }

  nuevaObra(): void {
    if (!this.conectado) { alert('Conéctate a internet para crear obras.'); return; }
    this.obraSeleccionada = { ...this.obraVacia(), id_proyecto: this.idProyectoFiltro };
    this.creandoObra = true;
    this.modoEdicion = true;
    this.mostrarModal = true;
    this.cargarProyectos();
  }

  abrirEvidencias(obra: Obra): void {
    this.obraSeleccionada = { ...obra };
    this.mostrarEvidencias = true;
    this.evidencias = [];
    if (!this.conectado) {
      alert('Las evidencias requieren conexión a internet.');
      this.mostrarEvidencias = false;
      return;
    }
    this.cargarEvidencias(obra.id);
  }

  private cargarEvidencias(idObra: number): void {
    this.http.get<RespuestaObras>(`http://localhost:3000/api/routes/evidencias?id_obra=${idObra}`).subscribe({
      next: respuesta => { this.evidencias = respuesta.evidencias || []; this.changeDetector.detectChanges(); },
      error: error => alert(error.error?.mensaje || 'No se pudieron cargar las evidencias de esta obra.')
    });
  }

  seleccionarArchivoEvidencia(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivoEvidencia = input.files?.[0] || null;
    this.nombreArchivoEvidencia = this.archivoEvidencia?.name || '';
  }

  async subirEvidencia(): Promise<void> {
    if (!this.conectado) { alert('Conéctate a internet para subir evidencias.'); return; }
    const archivo = this.archivoEvidencia;
    if (!archivo) { alert('Selecciona una fotografía, video o archivo PDF.'); return; }
    if (archivo.size > 10 * 1024 * 1024) { alert('El archivo no puede pesar más de 10 MB.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'].includes(archivo.type)) {
      alert('Formatos permitidos: JPG, PNG, WEBP, MP4 y PDF.'); return;
    }
    let usuario: any;
    try { usuario = JSON.parse(localStorage.getItem('usuario') || '{}'); } catch { usuario = {}; }
    const idUsuario = Number(usuario.id_usuario);
    if (!idUsuario) { alert('No se encontró el usuario de la sesión. Vuelve a iniciar sesión.'); return; }
    this.subiendoEvidencia = true;
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(archivo);
      });
      this.http.post<RespuestaObras>('http://localhost:3000/api/routes/evidencias', {
        id_obra: this.obraSeleccionada.id, id_usuario: idUsuario, tipo: this.tipoEvidencia,
        descripcion: this.descripcionEvidencia, archivo_nombre: archivo.name,
        archivo_mime: archivo.type, archivo_base64: base64
      }).subscribe({
        next: respuesta => {
          this.subiendoEvidencia = false;
          if (!respuesta.success) { alert(respuesta.mensaje || 'No se pudo subir la evidencia.'); return; }
          this.archivoEvidencia = null; this.nombreArchivoEvidencia = ''; this.descripcionEvidencia = '';
          this.tipoEvidencia = 'Fotografia'; this.cargarEvidencias(this.obraSeleccionada.id);
        },
        error: error => { this.subiendoEvidencia = false; alert(error.error?.mensaje || 'No se pudo subir la evidencia.'); this.changeDetector.detectChanges(); }
      });
    } catch {
      this.subiendoEvidencia = false;
      alert('No se pudo leer el archivo seleccionado.');
    }
  }

  eliminarEvidencia(evidencia: Evidencia): void {
    if (!confirm('¿Eliminar esta evidencia?')) return;
    this.http.delete<RespuestaObras>(`http://localhost:3000/api/routes/evidencias/${evidencia.id}`).subscribe({
      next: respuesta => respuesta.success ? this.cargarEvidencias(this.obraSeleccionada.id) : alert(respuesta.mensaje || 'No se pudo eliminar.'),
      error: error => alert(error.error?.mensaje || 'No se pudo eliminar la evidencia.')
    });
  }

  cerrarEvidencias(): void {
    this.mostrarEvidencias = false; this.evidencias = []; this.archivoEvidencia = null;
    this.nombreArchivoEvidencia = ''; this.descripcionEvidencia = '';
  }

  urlEvidencia(archivo: string): string { return archivo.startsWith('http') ? archivo : `http://localhost:3000${archivo}`; }
  esImagenEvidencia(evidencia: Evidencia): boolean { return /\.(jpg|jpeg|png|webp)$/i.test(evidencia.archivo); }

  editarObra(obra: Obra): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se puede editar la obra.');
      return;
    }
    this.obraSeleccionada = { ...obra };
    this.creandoObra = false;
    this.modoEdicion = true;
    this.mostrarModal = true;
    this.cargarProyectos(obra.id);
  }

  guardarCambios(): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se pueden guardar los cambios.');
      return;
    }
    if (this.guardando) return;
    const obra = this.obraSeleccionada;
    if (!obra.nombre.trim() || !obra.id_proyecto) {
      alert('El nombre y el proyecto son obligatorios.');
      return;
    }
    if (!Number.isFinite(Number(obra.porcentaje_avance)) || obra.porcentaje_avance < 0 || obra.porcentaje_avance > 100) {
      alert('El avance debe estar entre 0 y 100.');
      return;
    }
    this.guardando = true;
    const datos = {
      id_proyecto: obra.id_proyecto,
      nombre: obra.nombre.trim(),
      descripcion: obra.descripcion,
      estado: obra.estado,
      fecha_inicio: obra.fecha_inicio || null,
      fecha_fin_estimada: obra.fecha_fin_estimada || null,
      fecha_fin_real: obra.fecha_fin_real || null,
      porcentaje_avance: obra.porcentaje_avance
    };
    const solicitud = this.creandoObra
      ? this.http.post<RespuestaObras>(this.API_URL, datos)
      : this.http.put<RespuestaObras>(`${this.API_URL}/${obra.id}`, datos);
    solicitud.subscribe({
      next: respuesta => {
        this.guardando = false;
        if (respuesta.success) {
          this.mostrarModal = false;
          const fueCreacion = this.creandoObra;
          this.creandoObra = false;
          this.cargarObras();
          alert(fueCreacion ? 'Obra creada correctamente.' : 'Obra actualizada correctamente.');
        } else alert(respuesta.mensaje || 'No se pudo actualizar la obra.');
        this.changeDetector.detectChanges();
      },
      error: error => {
        this.guardando = false;
        if (error.status === 0) this.conectado = false;
        alert(error.error?.mensaje || 'No se pudo actualizar la obra.');
        this.changeDetector.detectChanges();
      }
    });
  }

  eliminarObra(obra: Obra): void {
    if (!this.conectado) {
      alert('No tienes conexión a internet. No se puede eliminar la obra.');
      return;
    }
    if (!confirm(`¿Seguro que deseas eliminar la obra "${obra.nombre}"?`)) return;
    this.http.delete<RespuestaObras>(`${this.API_URL}/${obra.id}`).subscribe({
      next: respuesta => {
        if (respuesta.success) {
          alert('Obra eliminada correctamente.');
          this.cargarObras();
        } else alert(respuesta.mensaje || 'No se pudo eliminar la obra.');
      },
      error: error => {
        if (error.status === 0) this.conectado = false;
        alert(error.error?.mensaje || 'No se pudo eliminar la obra.');
        this.changeDetector.detectChanges();
      }
    });
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.creandoObra = false;
    this.obraSeleccionada = this.obraVacia();
    this.modoEdicion = false;
  }

  private obraVacia(): Obra {
    return {
      id: 0, id_proyecto: 0, proyecto: '', cliente: '', nombre: '', descripcion: '',
      estado: 'Pendiente', fecha_inicio: '', fecha_fin_estimada: '', fecha_fin_real: '', porcentaje_avance: 0
    };
  }
}
