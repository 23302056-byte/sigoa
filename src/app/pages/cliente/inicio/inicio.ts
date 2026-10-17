import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Portal del cliente · "Mi obra"
 * Versión inicial: confirma que el cliente entra a su propio espacio
 * dentro del App Shell. El contenido (avance, fotos, pagos) se agrega después.
 */
@Component({
  selector: 'app-cliente-inicio',
  standalone: true,
  template: `
    <section class="pagina">
      <p class="sg-label">Mi obra</p>
      <h1>Hola, {{ nombre() }}</h1>
      <p class="texto">Aquí podrás consultar el avance, las fotografías, los documentos y los pagos de tu proyecto.</p>
    </section>
  `,
  styles: [`
    .pagina { padding: 48px var(--sg-margen); display: flex; flex-direction: column; gap: 12px; }
    h1 { font-size: 40px; }
    .texto { margin: 0; max-width: 560px; color: var(--sg-gris); }
  `]
})
export class InicioCliente implements OnInit {
  private readonly esNavegador = isPlatformBrowser(inject(PLATFORM_ID));
  readonly nombre = signal('');

  ngOnInit(): void {
    if (!this.esNavegador) return;
    try {
      this.nombre.set(JSON.parse(localStorage.getItem('usuario') || '{}')?.nombre ?? '');
    } catch {
      this.nombre.set('');
    }
  }
}