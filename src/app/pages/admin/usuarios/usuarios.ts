import { afterNextRender, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface Persona { id: number; nombre: string; apellidos: string; correo: string; telefono: string | null; direccion?: string | null; activo: number | boolean; proyectos?: number; }
interface Respuesta { success: boolean; id?: number; mensaje?: string; clientes?: Persona[]; arquitectos?: Persona[]; }

@Component({ selector: 'app-usuarios', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './usuarios.html', styleUrl: './usuarios.css' })
export class Usuarios {
  clientes: Persona[] = []; arquitectos: Persona[] = []; pestana: 'clientes' | 'arquitectos' = 'clientes'; busqueda = ''; cargando = true; error = '';
  mostrarFormulario = false;
  guardando = false;
  nuevo = this.formularioVacio();
  constructor(private http: HttpClient, private change: ChangeDetectorRef) { afterNextRender(() => this.cargar()); }
  cargar(): void {
    this.cargando = true; this.error = '';
    this.http.get<Respuesta>('http://localhost:3000/api/routes/usuarios').subscribe({
      next: r => { if (!r.success) this.error = r.mensaje || 'No se pudieron cargar los usuarios.'; else { this.clientes = r.clientes || []; this.arquitectos = r.arquitectos || []; } this.cargando = false; this.change.detectChanges(); },
      error: e => { this.error = e.error?.mensaje || 'No se pudieron cargar los usuarios.'; this.cargando = false; this.change.detectChanges(); }
    });
  }
  get lista(): Persona[] {
    const base = this.pestana === 'clientes' ? this.clientes : this.arquitectos;
    const texto = this.busqueda.trim().toLowerCase();
    return base.filter(p => !texto || [p.nombre, p.apellidos, p.correo, p.telefono || '', p.direccion || ''].some(v => v.toLowerCase().includes(texto)));
  }

  abrirFormulario(): void {
    this.nuevo = this.formularioVacio();
    this.mostrarFormulario = true;
  }

  cerrarFormulario(): void {
    if (this.guardando) return;
    this.mostrarFormulario = false;
  }

  guardarPersona(): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('Conéctate a internet para crear registros.');
      return;
    }
    if (!this.nuevo.nombre.trim() || !this.nuevo.apellidos.trim() || !this.nuevo.correo.trim() || !this.nuevo.password) {
      alert('Completa nombre, apellidos, correo y contraseña.');
      return;
    }
    if (this.nuevo.password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (this.guardando) return;
    this.guardando = true;
    const tipo = this.pestana;
    this.http.post<Respuesta>(`http://localhost:3000/api/routes/usuarios/${tipo}`, this.nuevo).subscribe({
      next: respuesta => {
        this.guardando = false;
        if (!respuesta.success) { alert(respuesta.mensaje || 'No se pudo crear el registro.'); return; }
        this.mostrarFormulario = false;
        this.nuevo = this.formularioVacio();
        this.change.detectChanges();
        this.cargar();
        alert(tipo === 'clientes' ? 'Cliente creado correctamente.' : 'Arquitecto creado correctamente.');
      },
      error: error => {
        this.guardando = false;
        alert(error.error?.mensaje || 'No se pudo crear el registro. Comprueba que el backend esté activo.');
        this.change.detectChanges();
      }
    });
  }

  eliminarPersona(persona: Persona): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('Conéctate a internet para eliminar registros.');
      return;
    }
    const tipo = this.pestana;
    const nombre = `${persona.nombre} ${persona.apellidos}`;
    if (!confirm(`¿Seguro que deseas eliminar este registro (${nombre})?`)) return;
    this.http.delete<Respuesta>(`http://localhost:3000/api/routes/usuarios/${tipo}/${persona.id}`).subscribe({
      next: respuesta => {
        if (!respuesta.success) { alert(respuesta.mensaje || 'No se pudo eliminar el registro.'); return; }
        this.cargar();
        alert(tipo === 'clientes' ? 'Cliente eliminado correctamente.' : 'Arquitecto eliminado correctamente.');
      },
      error: error => alert(error.error?.mensaje || 'No se pudo eliminar el registro.')
    });
  }

  private formularioVacio(): { nombre: string; apellidos: string; correo: string; telefono: string; direccion: string; password: string } {
    return { nombre: '', apellidos: '', correo: '', telefono: '', direccion: '', password: '' };
  }
}
