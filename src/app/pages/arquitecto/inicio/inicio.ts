import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ArquitectoNavbarComponent } from '../../../components/arquitecto/arquitecto-navbar/arquitecto-navbar';

interface Obra {
  id_obra: number;
  nombre: string;
  estado: string;
  porcentaje_avance: number;
  fecha_inicio?: string | null;
  fecha_fin_estimada?: string | null;
}

interface Proyecto {
  id: number;
  nombre: string;
  descripcion: string;
  cliente: string;
  ubicacion: string;
  estado: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  porcentaje_avance: number;
  obras: Obra[];
}

interface RespuestaProyectos {
  success: boolean;
  mensaje?: string;
  proyectos?: Proyecto[];
}

@Component({
  selector: 'app-inicio-arquitecto',
  standalone: true,
  imports: [CommonModule, FormsModule, ArquitectoNavbarComponent],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css'
})
export class InicioArquitecto implements OnInit {
  private readonly apiUrl = 'http://localhost:3000/api/routes/proyectos';
  usuario: any = {};
  proyectos: Proyecto[] = [];
  proyectosFiltrados: Proyecto[] = [];
  busqueda = '';
  cargando = true;
  error = '';

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
    this.cargarProyectos();
  }

  cargarProyectos(): void {
    this.cargando = true;
    this.error = '';
    this.http.get<RespuestaProyectos>(`${this.apiUrl}/asignados/${this.usuario.id_usuario}`).subscribe({
      next: respuesta => {
        this.proyectos = respuesta.proyectos || [];
        this.buscar();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: error => {
        this.error = error.error?.mensaje || 'No se pudieron cargar tus proyectos. Comprueba que el servidor esté activo.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  buscar(): void {
    const texto = this.busqueda.trim().toLocaleLowerCase();
    this.proyectosFiltrados = this.proyectos.filter(proyecto =>
      !texto || [proyecto.nombre, proyecto.cliente, proyecto.ubicacion, proyecto.estado]
        .some(valor => (valor || '').toLocaleLowerCase().includes(texto))
    );
  }

  get avancePromedio(): number {
    if (!this.proyectos.length) return 0;
    return Math.round(this.proyectos.reduce((total, proyecto) => total + Number(proyecto.porcentaje_avance || 0), 0) / this.proyectos.length);
  }

  cerrarSesion(): void {
    if (isPlatformBrowser(this.platformId)) localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}
