import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

interface ObraArquitecto {
  id_obra: number;
  nombre: string;
  descripcion?: string;
  estado: string;
  porcentaje_avance: number;
  fecha_inicio?: string | null;
  fecha_fin_estimada?: string | null;
}

interface ProyectoObras {
  id: number;
  nombre: string;
  cliente: string;
  ubicacion: string;
  obras: ObraArquitecto[];
}

interface RespuestaProyectos {
  success: boolean;
  mensaje?: string;
  proyectos?: ProyectoObras[];
}

interface ObraLista extends ObraArquitecto {
  proyectoId: number;
  proyectoNombre: string;
  cliente: string;
  ubicacion: string;
}

interface ProyectoDisponible {
  id: number;
  nombre: string;
}

interface ObraFormulario {
  id: number | null;
  id_proyecto: number;
  nombre: string;
  descripcion: string;
  estado: string;
  porcentaje_avance: number;
  fecha_inicio: string;
  fecha_fin_estimada: string;
  fecha_fin_real: string;
}

@Component({
  selector: 'app-obras-arquitecto',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './obras.html',
  styleUrl: './obras.css'
})
export class ObrasArquitecto implements OnInit {
  private readonly apiUrl = 'http://localhost:3000/api/routes/proyectos';
  private readonly apiObrasUrl = 'http://localhost:3000/api/routes/obras';
  readonly estadosObra = ['Pendiente', 'En construccion', 'Pausada', 'Finalizada', 'Cancelada'];
  usuario: any = {};
  proyectosDisponibles: ProyectoDisponible[] = [];
  obras: ObraLista[] = [];
  obrasFiltradas: ObraLista[] = [];
  busqueda = '';
  filtroEstado = 'Todos';
  cargando = true;
  error = '';
  mostrarModal = false;
  creando = false;
  guardando = false;
  obraSeleccionada: ObraFormulario = this.formularioVacio();

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    } catch {
      this.cerrarSesion();
      return;
    }
    this.cargarObras();
  }

  cargarObras(): void {
    this.cargando = true;
    this.error = '';
    this.http.get<RespuestaProyectos>(`${this.apiUrl}/asignados/${this.usuario.id_usuario}`).subscribe({
      next: respuesta => {
        const proyectos = respuesta.proyectos || [];
        this.proyectosDisponibles = proyectos.map(proyecto => ({ id: proyecto.id, nombre: proyecto.nombre }));
        this.obras = proyectos.flatMap(proyecto =>
          (proyecto.obras || []).map(obra => ({
            ...obra,
            proyectoId: proyecto.id,
            proyectoNombre: proyecto.nombre,
            cliente: proyecto.cliente,
            ubicacion: proyecto.ubicacion
          }))
        );
        this.aplicarFiltros();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: error => {
        this.error = error.error?.mensaje || 'No se pudieron cargar tus obras. Comprueba que el servidor esté activo.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  aplicarFiltros(): void {
    const texto = this.busqueda.trim().toLocaleLowerCase();
    this.obrasFiltradas = this.obras.filter(obra => {
      const coincideTexto = !texto || [obra.nombre, obra.proyectoNombre, obra.cliente, obra.ubicacion, obra.estado]
        .some(valor => (valor || '').toLocaleLowerCase().includes(texto));
      return coincideTexto && (this.filtroEstado === 'Todos' || obra.estado === this.filtroEstado);
    });
  }

  get obrasEnCurso(): number {
    return this.obras.filter(obra => ['En construccion', 'En construcción', 'En progreso'].includes(obra.estado)).length;
  }

  get obrasFinalizadas(): number {
    return this.obras.filter(obra => ['Finalizada', 'Finalizado', 'Completada', 'Completado'].includes(obra.estado)).length;
  }

  nuevaObra(): void {
    if (!this.proyectosDisponibles.length) {
      alert('Necesitas tener al menos un proyecto asignado para crear una obra.');
      return;
    }
    this.creando = true;
    this.obraSeleccionada = { ...this.formularioVacio(), id_proyecto: this.proyectosDisponibles[0].id };
    this.mostrarModal = true;
  }

  editarObra(obra: ObraLista): void {
    this.creando = false;
    this.obraSeleccionada = {
      id: obra.id_obra,
      id_proyecto: obra.proyectoId,
      nombre: obra.nombre,
      descripcion: obra.descripcion || '',
      estado: obra.estado,
      porcentaje_avance: Number(obra.porcentaje_avance || 0),
      fecha_inicio: this.fechaParaInput(obra.fecha_inicio),
      fecha_fin_estimada: this.fechaParaInput(obra.fecha_fin_estimada),
      fecha_fin_real: ''
    };
    this.mostrarModal = true;
  }

  guardarObra(): void {
    const obra = this.obraSeleccionada;
    if (this.guardando) return;
    if (!obra.id_proyecto || !obra.nombre.trim()) {
      alert('Selecciona el proyecto e indica el nombre de la obra.');
      return;
    }
    const avance = Number(obra.porcentaje_avance);
    if (!Number.isFinite(avance) || avance < 0 || avance > 100) {
      alert('El avance debe estar entre 0 y 100.');
      return;
    }
    const datos = {
      id_proyecto: obra.id_proyecto,
      nombre: obra.nombre.trim(),
      descripcion: obra.descripcion.trim(),
      estado: obra.estado,
      porcentaje_avance: avance,
      fecha_inicio: obra.fecha_inicio || null,
      fecha_fin_estimada: obra.fecha_fin_estimada || null,
      fecha_fin_real: obra.fecha_fin_real || null
    };
    this.guardando = true;
    const solicitud = this.creando
      ? this.http.post<{ success: boolean; mensaje?: string }>(this.apiObrasUrl, datos)
      : this.http.put<{ success: boolean; mensaje?: string }>(`${this.apiObrasUrl}/${obra.id}`, datos);
    solicitud.subscribe({
      next: respuesta => {
        this.guardando = false;
        if (!respuesta.success) {
          alert(respuesta.mensaje || 'No se pudo guardar la obra.');
          return;
        }
        this.cerrarModal();
        this.cargarObras();
      },
      error: error => {
        this.guardando = false;
        alert(error.error?.mensaje || 'No se pudo guardar la obra. Comprueba la conexión con el servidor.');
        this.cdr.detectChanges();
      }
    });
  }

  eliminarObra(obra: ObraLista): void {
    if (!confirm(`¿Seguro que deseas eliminar la obra "${obra.nombre}"?`)) return;
    this.http.delete<{ success: boolean; mensaje?: string }>(`${this.apiObrasUrl}/${obra.id_obra}`).subscribe({
      next: respuesta => {
        if (!respuesta.success) {
          alert(respuesta.mensaje || 'No se pudo eliminar la obra.');
          return;
        }
        this.obras = this.obras.filter(item => item.id_obra !== obra.id_obra);
        this.aplicarFiltros();
      },
      error: error => alert(error.error?.mensaje || 'No se pudo eliminar la obra.')
    });
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.creando = false;
    this.obraSeleccionada = this.formularioVacio();
  }

  private formularioVacio(): ObraFormulario {
    return { id: null, id_proyecto: 0, nombre: '', descripcion: '', estado: 'Pendiente', porcentaje_avance: 0, fecha_inicio: '', fecha_fin_estimada: '', fecha_fin_real: '' };
  }

  private fechaParaInput(fecha?: string | null): string {
    return fecha ? String(fecha).slice(0, 10) : '';
  }

  cerrarSesion(): void {
    if (isPlatformBrowser(this.platformId)) localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}
