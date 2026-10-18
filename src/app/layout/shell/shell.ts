import { Component, ElementRef, OnInit, PLATFORM_ID, computed, inject, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Icono } from '../../shared/icono/icono';
import { ConexionService } from '../../core/services/conexion.service';
import { PwaInstallService } from '../../core/services/pwa-install.service';
import { AvisosService } from '../../core/services/avisos.service';
import { MENUS, Rol } from './menus';

interface UsuarioSesion {
  nombre?: string;
  apellidos?: string;
  correo?: string;
}

/**
 * APP SHELL de SIGOA
 * Es el "cascarón" fijo de la aplicación: barra superior (todas las pantallas)
 * y barra inferior de navegación (celular y tablet). Se carga una sola vez y
 * queda en caché del Service Worker; lo único que cambia es el contenido
 * dentro de <router-outlet>.
 * El rol (admin, arquitecto o cliente) llega desde la ruta: data: { rol: 'admin' }.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icono],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  // Clic en cualquier parte de la pantalla o tecla Esc: se cierra el menú de perfil
  host: {
    '(document:click)': 'clicEnDocumento($event)',
    '(document:keydown.escape)': 'perfilAbierto.set(false)'
  }
})
export class Shell implements OnInit {
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly esNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly conexion = inject(ConexionService);
  readonly pwa = inject(PwaInstallService);
  readonly avisos = inject(AvisosService);

  readonly rol = signal<Rol>('admin');
  readonly config = computed(() => MENUS[this.rol()]);
  readonly usuario = signal<UsuarioSesion | null>(null);
  readonly inicial = computed(() => (this.usuario()?.nombre ?? 'U').charAt(0).toUpperCase());

  readonly perfilAbierto = signal(false);
  private readonly perfil = viewChild<ElementRef<HTMLElement>>('perfil');

  ngOnInit(): void {
    this.rol.set((this.ruta.snapshot.data['rol'] as Rol) ?? 'admin');

    if (this.esNavegador) {
      try {
        this.usuario.set(JSON.parse(localStorage.getItem('usuario') || 'null'));
      } catch {
        this.usuario.set(null);
      }
      this.centrarPestanaActiva();
    }

    // Al cambiar de pantalla se cierra el menú de perfil y, en celular,
    // la barra inferior se desliza para que se vea la opción activa.
    this.router.events
      .pipe(filter((evento) => evento instanceof NavigationEnd))
      .subscribe(() => {
        this.perfilAbierto.set(false);
        this.centrarPestanaActiva();
      });
  }

  /** En celular la barra inferior puede deslizarse (admin tiene 7 opciones) */
  private centrarPestanaActiva(): void {
    if (!this.esNavegador) return;
    setTimeout(() => {
      document.querySelector('.tabs a.activo')
        ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
  }

  /** Si el clic fue fuera del avatar y de su menú, el menú se cierra */
  clicEnDocumento(evento: MouseEvent): void {
    if (!this.perfilAbierto()) return;
    const zona = this.perfil()?.nativeElement;
    if (zona && !zona.contains(evento.target as Node)) this.perfilAbierto.set(false);
  }

  /** Pide confirmación antes de salir */
  async confirmarCerrarSesion(): Promise<void> {
    this.perfilAbierto.set(false);
    const salir = await this.avisos.confirmar({
      titulo: '¿Cerrar sesión?',
      mensaje: 'Tendrás que volver a ingresar tu correo y contraseña. Los datos guardados para consultar sin conexión se borrarán de este dispositivo.',
      textoAceptar: 'Cerrar sesión',
      peligro: true
    });
    if (salir) this.cerrarSesion();
  }

  private cerrarSesion(): void {
    if (this.esNavegador) {
      localStorage.removeItem('usuario');
      // Se borra la información guardada para consulta sin conexión,
      // por si el dispositivo es compartido.
      indexedDB.deleteDatabase('SIGOA_DB');
    }
    this.router.navigate(['/login']);
  }
}